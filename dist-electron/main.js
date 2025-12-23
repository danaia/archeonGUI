import { ipcMain, dialog, app, BrowserWindow } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import pty from "node-pty";
import os from "os";
import chokidar from "chokidar";
import fs from "fs/promises";
class PtyManager {
  constructor(mainWindow2) {
    this.mainWindow = mainWindow2;
    this.terminals = /* @__PURE__ */ new Map();
    this.nextId = 1;
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
    const shell = process.env.SHELL || (os.platform() === "win32" ? "powershell.exe" : "zsh");
    const cwd = options.cwd || os.homedir();
    const cols = options.cols || 80;
    const rows = options.rows || 24;
    const env = {
      ...process.env,
      ...options.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor"
    };
    const ptyProcess = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env
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
    if (ptyProcess) {
      ptyProcess.resize(cols, rows);
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
    try {
      await fs.access(archeonDir);
    } catch {
      return { success: false, error: "archeon/ directory not found" };
    }
    const initialIndex = await this.readIndexFile(projectPath);
    const initialArcon = await this.readArconFile(projectPath);
    this.watcher = chokidar.watch(archeonDir, {
      persistent: true,
      ignoreInitial: true,
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
    return {
      success: true,
      initialIndex,
      initialArcon
    };
  }
  /**
   * Read and parse ARCHEON.index.json
   * @param {string} projectPath - Root path of the project
   * @returns {Object} - { success, data?, error? }
   */
  async readIndexFile(projectPath) {
    const indexPath = path.join(projectPath, "archeon", "ARCHEON.index.json");
    try {
      const content = await fs.readFile(indexPath, "utf-8");
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
      const content = await fs.readFile(arconPath, "utf-8");
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
   * Stop watching
   */
  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.projectPath = null;
  }
}
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
    frame: process.platform === "darwin" ? false : true
  });
  ptyManager = new PtyManager(mainWindow);
  archeonWatcher = new ArcheonWatcher(mainWindow);
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
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
ipcMain.handle("fs:readFile", async (event, filePath) => {
  const fs2 = await import("fs/promises");
  try {
    const content = await fs2.readFile(filePath, "utf-8");
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
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
