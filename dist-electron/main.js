import { ipcMain, dialog, shell, app, BrowserWindow } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import pty from "node-pty";
import os from "os";
import fs from "fs";
import chokidar from "chokidar";
import fs$1 from "fs/promises";
class PtyManager {
  constructor(mainWindow2) {
    this.mainWindow = mainWindow2;
    this.terminals = /* @__PURE__ */ new Map();
    this.nextId = 1;
  }
  /**
   * Determine the shell to use based on OS and availability
   * @returns {string} - Shell executable path
   */
  getShell() {
    if (process.env.SHELL && fs.existsSync(process.env.SHELL)) {
      return process.env.SHELL;
    }
    const platform = os.platform();
    if (platform === "win32") {
      return "powershell.exe";
    }
    const shellPaths = [
      "/bin/zsh",
      // Modern macOS and Ubuntu
      "/usr/bin/zsh",
      // Alternative Linux location
      "/bin/bash",
      // Fallback
      "/usr/bin/bash",
      // Alternative bash location
      "/bin/sh"
      // Last resort
    ];
    for (const shellPath of shellPaths) {
      if (fs.existsSync(shellPath)) {
        return shellPath;
      }
    }
    return platform === "darwin" ? "/bin/zsh" : "/bin/bash";
  }
  /**
   * Spawn a new PTY terminal
   * @param {Object} options - Spawn options
   * @param {string} options.cwd - Working directory
   * @param {Object} options.env - Environment variables
   * @param {number} options.cols - Terminal columns
   * @param {number} options.rows - Terminal rows
   * @returns {Object} - { id, pid }
   */
  spawn(options = {}) {
    const shell2 = this.getShell();
    const cwd = options.cwd || os.homedir();
    const cols = options.cols || 80;
    const rows = options.rows || 24;
    console.log(`[PTY] Spawning shell: ${shell2}`);
    console.log(`[PTY] Working directory: ${cwd}`);
    console.log(`[PTY] Platform: ${os.platform()}`);
    const env = {
      ...process.env,
      ...options.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor"
    };
    const shellArgs = [];
    if (shell2.includes("zsh") || shell2.includes("bash")) {
      shellArgs.push("-l");
    }
    console.log(`[PTY] Shell args: ${JSON.stringify(shellArgs)}`);
    try {
      const ptyProcess = pty.spawn(shell2, shellArgs, {
        name: "xterm-256color",
        cols,
        rows,
        cwd,
        env,
        useConpty: false
        // Disable ConPTY on Windows, doesn't affect macOS/Linux
      });
      const id = this.nextId++;
      this.terminals.set(id, ptyProcess);
      ptyProcess.onData((data) => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send("pty:data", { id, data });
        }
      });
      ptyProcess.onExit(({ exitCode, signal }) => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send("pty:exit", { id, exitCode, signal });
        }
        this.terminals.delete(id);
      });
      return { id, pid: ptyProcess.pid };
    } catch (error) {
      console.error(`Failed to spawn PTY with shell ${shell2}:`, error);
      throw new Error(`PTY spawn failed: ${error.message}`);
    }
  }
  /**
   * Write data to a PTY
   * @param {number} id - Terminal ID
   * @param {string} data - Data to write
   */
  write(id, data) {
    const ptyProcess = this.terminals.get(id);
    if (ptyProcess) {
      ptyProcess.write(data);
    }
  }
  /**
   * Resize a PTY
   * @param {number} id - Terminal ID
   * @param {number} cols - New columns
   * @param {number} rows - New rows
   */
  resize(id, cols, rows) {
    const ptyProcess = this.terminals.get(id);
    if (ptyProcess && cols > 0 && rows > 0) {
      try {
        ptyProcess.resize(cols, rows);
      } catch (e) {
        console.warn("PTY resize failed:", e.message);
      }
    }
  }
  /**
   * Kill a PTY
   * @param {number} id - Terminal ID
   */
  kill(id) {
    const ptyProcess = this.terminals.get(id);
    if (ptyProcess) {
      ptyProcess.kill();
      this.terminals.delete(id);
    }
  }
  /**
   * Kill all PTYs
   */
  killAll() {
    for (const [id, ptyProcess] of this.terminals) {
      ptyProcess.kill();
    }
    this.terminals.clear();
  }
}
class ArcheonWatcher {
  constructor(mainWindow2) {
    this.mainWindow = mainWindow2;
    this.watcher = null;
    this.projectPath = null;
  }
  /**
   * Start watching an archeon project directory
   * @param {string} projectPath - Root path of the project
   * @returns {Object} - { success, error?, initialData? }
   */
  async watch(projectPath) {
    this.stop();
    this.projectPath = projectPath;
    const archeonDir = path.join(projectPath, "archeon");
    let archeonDirExists = false;
    try {
      await fs$1.access(archeonDir);
      archeonDirExists = true;
    } catch {
      archeonDirExists = false;
    }
    let initialIndex = {
      success: false,
      error: "archeon/ directory not found"
    };
    let initialArcon = {
      success: false,
      error: "archeon/ directory not found"
    };
    if (archeonDirExists) {
      initialIndex = await this.readIndexFile(projectPath);
      initialArcon = await this.readArconFile(projectPath);
    }
    this.rootWatcher = chokidar.watch(projectPath, {
      persistent: true,
      ignoreInitial: true,
      depth: 0
      // Only watch immediate children
    });
    this.rootWatcher.on("addDir", async (dirPath) => {
      if (path.basename(dirPath) === "archeon") {
        await this.startArcheonWatcher(projectPath);
      }
    });
    if (archeonDirExists) {
      await this.startArcheonWatcher(projectPath);
    }
    return {
      success: true,
      initialIndex,
      initialArcon
    };
  }
  /**
   * Start watching the archeon directory for file changes
   * @param {string} projectPath - Root path of the project
   */
  async startArcheonWatcher(projectPath) {
    const archeonDir = path.join(projectPath, "archeon");
    if (this.watcher) {
      await this.watcher.close();
    }
    this.watcher = chokidar.watch(archeonDir, {
      persistent: true,
      ignoreInitial: false,
      // Process existing files on start
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });
    this.watcher.on("change", async (filePath) => {
      const fileName = path.basename(filePath);
      if (fileName === "ARCHEON.index.json") {
        const data = await this.readIndexFile(projectPath);
        if (data.success && this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send("archeon:index-changed", data);
        }
      } else if (fileName === "ARCHEON.arcon") {
        const data = await this.readArconFile(projectPath);
        if (data.success && this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send("archeon:arcon-changed", data);
        }
      }
    });
    this.watcher.on("add", async (filePath) => {
      const fileName = path.basename(filePath);
      if (fileName === "ARCHEON.index.json") {
        const data = await this.readIndexFile(projectPath);
        if (data.success && this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send("archeon:index-changed", data);
        }
      } else if (fileName === "ARCHEON.arcon") {
        const data = await this.readArconFile(projectPath);
        if (data.success && this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send("archeon:arcon-changed", data);
        }
      }
    });
    this.watcher.on("error", (error) => {
      console.error("Archeon watcher error:", error);
    });
  }
  /**
   * Read and parse ARCHEON.index.json
   * @param {string} projectPath - Root path of the project
   * @returns {Object} - { success, data?, error? }
   */
  async readIndexFile(projectPath) {
    const indexPath = path.join(projectPath, "archeon", "ARCHEON.index.json");
    try {
      const content = await fs$1.readFile(indexPath, "utf-8");
      const data = JSON.parse(content);
      return { success: true, data, path: indexPath };
    } catch (error) {
      if (error.code === "ENOENT") {
        return { success: false, error: "ARCHEON.index.json not found" };
      }
      return { success: false, error: error.message };
    }
  }
  /**
   * Read ARCHEON.arcon file
   * @param {string} projectPath - Root path of the project
   * @returns {Object} - { success, content?, chains?, error? }
   */
  async readArconFile(projectPath) {
    const arconPath = path.join(projectPath, "archeon", "ARCHEON.arcon");
    try {
      const content = await fs$1.readFile(arconPath, "utf-8");
      const chains = this.parseArconChains(content);
      return { success: true, content, chains, path: arconPath };
    } catch (error) {
      if (error.code === "ENOENT") {
        return { success: false, error: "ARCHEON.arcon not found" };
      }
      return { success: false, error: error.message };
    }
  }
  /**
   * Parse chain definitions from .arcon content
   * @param {string} content - Raw .arcon file content
   * @returns {Array} - Array of parsed chains
   */
  parseArconChains(content) {
    const chains = [];
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const versionMatch = trimmed.match(/^@(\w+)\s+(.+)$/);
      if (versionMatch) {
        const version = versionMatch[1];
        const chainDef = versionMatch[2];
        const glyphs = this.parseChainGlyphs(chainDef);
        chains.push({
          version,
          raw: trimmed,
          glyphs
        });
        continue;
      }
      if (trimmed.includes("::")) {
        const glyphs = this.parseContainmentGlyphs(trimmed);
        chains.push({
          type: "orchestrator",
          raw: trimmed,
          glyphs
        });
      }
    }
    return chains;
  }
  /**
   * Parse glyphs from a chain definition (using => edges)
   * @param {string} chainDef - Chain definition string
   * @returns {Array} - Array of glyph objects
   */
  parseChainGlyphs(chainDef) {
    const glyphs = [];
    const parts = chainDef.split(/\s*(?:=>|~>|->)\s*/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const glyphMatch = trimmed.match(/^(\w+):(.+)$/);
      if (glyphMatch) {
        glyphs.push({
          type: glyphMatch[1],
          name: glyphMatch[2],
          key: trimmed
        });
      }
    }
    return glyphs;
  }
  /**
   * Parse glyphs from containment definition (using :: edges)
   * @param {string} def - Definition string
   * @returns {Array} - Array of glyph objects
   */
  parseContainmentGlyphs(def) {
    const glyphs = [];
    const parts = def.split(/\s*::\s*/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const glyphMatch = trimmed.match(/^(\w+):(.+)$/);
      if (glyphMatch) {
        glyphs.push({
          type: glyphMatch[1],
          name: glyphMatch[2],
          key: trimmed
        });
      }
    }
    return glyphs;
  }
  /**
   * Write content to ARCHEON.arcon file
   * @param {string} projectPath - Root path of the project
   * @param {string} content - Content to write to the file
   * @returns {Object} - { success, error? }
   */
  async writeArconFile(projectPath, content) {
    const arconPath = path.join(projectPath, "archeon", "ARCHEON.arcon");
    try {
      const archeonDir = path.join(projectPath, "archeon");
      try {
        await fs$1.access(archeonDir);
      } catch {
        await fs$1.mkdir(archeonDir, { recursive: true });
      }
      await fs$1.writeFile(arconPath, content, "utf-8");
      return { success: true, path: arconPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  /**
   * Stop watching
   */
  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.rootWatcher) {
      this.rootWatcher.close();
      this.rootWatcher = null;
    }
    this.projectPath = null;
  }
}
const execAsync = promisify(exec);
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
let mainWindow = null;
let ptyManager = null;
let archeonWatcher = null;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1e3,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname$1, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: "#0f0f0f",
    titleBarStyle: "hiddenInset",
    frame: process.platform === "darwin" ? false : true,
    show: false
    // Don't show until ready
  });
  ptyManager = new PtyManager(mainWindow);
  archeonWatcher = new ArcheonWatcher(mainWindow);
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    const loadDevServer = async (retries = 5) => {
      try {
        await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
      } catch (err) {
        if (retries > 0) {
          console.log(
            `Waiting for Vite dev server... (${retries} retries left)`
          );
          await new Promise((resolve) => setTimeout(resolve, 1e3));
          return loadDevServer(retries - 1);
        }
        console.error("Failed to load Vite dev server:", err);
      }
    };
    loadDevServer();
  } else {
    mainWindow.loadFile(path.join(__dirname$1, "../dist/index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
    if (ptyManager) ptyManager.killAll();
    if (archeonWatcher) archeonWatcher.stop();
  });
}
ipcMain.handle("dialog:openProject", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select Archeon Project"
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, path: null };
  }
  const projectPath = result.filePaths[0];
  const archeonDir = path.join(projectPath, "archeon");
  const fs2 = await import("fs/promises");
  try {
    await fs2.access(archeonDir);
    return { canceled: false, path: projectPath, valid: true };
  } catch {
    return { canceled: false, path: projectPath, valid: false };
  }
});
ipcMain.handle("pty:spawn", (event, options = {}) => {
  return ptyManager.spawn(options);
});
ipcMain.on("pty:write", (event, { id, data }) => {
  ptyManager.write(id, data);
});
ipcMain.on("pty:resize", (event, { id, cols, rows }) => {
  ptyManager.resize(id, cols, rows);
});
ipcMain.on("pty:kill", (event, { id }) => {
  ptyManager.kill(id);
});
ipcMain.handle("archeon:watch", (event, projectPath) => {
  return archeonWatcher.watch(projectPath);
});
ipcMain.handle("archeon:stop", () => {
  archeonWatcher.stop();
  return true;
});
ipcMain.handle("archeon:readIndex", async (event, projectPath) => {
  return archeonWatcher.readIndexFile(projectPath);
});
ipcMain.handle("archeon:readArcon", async (event, projectPath) => {
  return archeonWatcher.readArconFile(projectPath);
});
ipcMain.handle("archeon:writeArcon", async (event, projectPath, content) => {
  return archeonWatcher.writeArconFile(projectPath, content);
});
ipcMain.handle("fs:readFile", async (event, filePath) => {
  const fs2 = await import("fs/promises");
  try {
    const content = await fs2.readFile(filePath, "utf-8");
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
ipcMain.handle("shell:openExternal", async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
ipcMain.handle("fs:findClientDir", async (event, projectPath) => {
  const fs2 = await import("fs/promises");
  const pathModule = await import("path");
  try {
    const clientDir = pathModule.join(projectPath, "client");
    try {
      const stat = await fs2.stat(clientDir);
      if (stat.isDirectory()) {
        const pkgPath = pathModule.join(clientDir, "package.json");
        try {
          await fs2.access(pkgPath);
          return { success: true, path: clientDir, hasPackageJson: true };
        } catch {
          return { success: true, path: clientDir, hasPackageJson: false };
        }
      }
    } catch {
    }
    const rootPkgPath = pathModule.join(projectPath, "package.json");
    try {
      await fs2.access(rootPkgPath);
      return { success: true, path: projectPath, hasPackageJson: true };
    } catch {
      return {
        success: false,
        error: "No package.json found in project or client directory"
      };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});
ipcMain.handle("fs:readPackageJson", async (event, dirPath) => {
  const fs2 = await import("fs/promises");
  const pathModule = await import("path");
  try {
    const pkgPath = pathModule.join(dirPath, "package.json");
    const content = await fs2.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(content);
    const scripts = pkg.scripts || {};
    let devScript = null;
    let devCommand = null;
    const devScriptNames = ["dev", "start", "serve", "develop", "run"];
    for (const name of devScriptNames) {
      if (scripts[name]) {
        devScript = name;
        devCommand = scripts[name];
        break;
      }
    }
    return {
      success: true,
      name: pkg.name,
      scripts,
      devScript,
      devCommand
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
ipcMain.handle("archeon:validate", async (event, projectPath) => {
  if (!projectPath) {
    return { success: false, error: "No project path provided" };
  }
  try {
    const { stdout, stderr } = await execAsync("arc validate", {
      cwd: projectPath,
      timeout: 3e4
      // 30 second timeout
    });
    const output = stdout + stderr;
    const isValid = output.includes("Validation passed") || output.includes("✓");
    const chainsMatch = output.match(/Chains:\s*(\d+)/);
    const glyphsMatch = output.match(/Glyphs:\s*(\d+)/);
    const errors = [];
    const errorMatches = output.matchAll(/•\s*ERR:[^\n]+/g);
    for (const match of errorMatches) {
      errors.push(match[0].replace("• ", ""));
    }
    const warnings = [];
    const warnMatches = output.matchAll(/•\s*WARN:[^\n]+/g);
    for (const match of warnMatches) {
      warnings.push(match[0].replace("• ", ""));
    }
    return {
      success: true,
      isValid,
      chains: chainsMatch ? parseInt(chainsMatch[1]) : 0,
      glyphs: glyphsMatch ? parseInt(glyphsMatch[1]) : 0,
      errors,
      warnings,
      output
    };
  } catch (error) {
    const output = (error.stdout || "") + (error.stderr || "");
    const isValid = false;
    const errors = [];
    const errorMatches = output.matchAll(/•\s*ERR:[^\n]+/g);
    for (const match of errorMatches) {
      errors.push(match[0].replace("• ", ""));
    }
    const warnings = [];
    const warnMatches = output.matchAll(/•\s*WARN:[^\n]+/g);
    for (const match of warnMatches) {
      warnings.push(match[0].replace("• ", ""));
    }
    if (error.message?.includes("not found") || error.message?.includes("ENOENT")) {
      return {
        success: false,
        error: "arc command not found. Make sure it's installed and in PATH."
      };
    }
    return {
      success: true,
      isValid,
      errors,
      warnings,
      output
    };
  }
});
app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
