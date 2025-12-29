import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import { PtyManager } from "./pty-manager.js";
import { ArcheonWatcher } from "./archeon-watcher.js";

const execAsync = promisify(exec);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Log environment info for debugging
console.log("=== Electron Environment ===");
console.log("__dirname:", __dirname);
console.log("app.isPackaged:", app.isPackaged);
console.log("process.resourcesPath:", process.resourcesPath);
console.log("app.getAppPath():", app.getAppPath());
console.log("===========================");

// Keep references to prevent garbage collection
let mainWindow = null;
let ptyManager = null;
let archeonWatcher = null;

// Performance optimizations for Electron
if (process.platform === "darwin") {
  // Enable Metal GPU acceleration on macOS
  app.commandLine.appendSwitch("enable-gpu-rasterization");
  app.commandLine.appendSwitch("enable-zero-copy");
  app.commandLine.appendSwitch("ignore-gpu-blocklist");
  // Disable features we don't need
  app.commandLine.appendSwitch("disable-software-rasterizer");
}

// Memory and performance
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=2048");
app.commandLine.appendSwitch("disable-renderer-backgrounding");

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Performance optimizations
      spellcheck: false,
      enableWebSQL: false,
      v8CacheOptions: "code",
    },
    backgroundColor: "#0f0f0f",
    titleBarStyle: "hiddenInset",
    frame: process.platform === "darwin" ? false : true,
    show: false, // Don't show until ready
    // macOS-specific optimizations
    vibrancy: process.platform === "darwin" ? "under-window" : undefined,
    visualEffectState: process.platform === "darwin" ? "active" : undefined,
  });

  // Initialize PTY manager
  ptyManager = new PtyManager(mainWindow);

  // Initialize Archeon watcher (starts when project is opened)
  archeonWatcher = new ArcheonWatcher(mainWindow);

  // Show window when ready to prevent blank screen flash
  mainWindow.once("ready-to-show", () => {
    console.log("Window ready-to-show event fired");
    mainWindow.show();
  });

  // Fallback: show window after timeout even if ready-to-show doesn't fire
  setTimeout(() => {
    if (!mainWindow.isVisible()) {
      console.log("Fallback: Showing window after timeout");
      mainWindow.show();
    }
  }, 3000);

  // Development vs production URL
  if (process.env.VITE_DEV_SERVER_URL) {
    // In dev mode, wait for Vite server and retry if needed
    const loadDevServer = async (retries = 5) => {
      try {
        await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
        console.log("Dev server loaded successfully");
      } catch (err) {
        if (retries > 0) {
          console.log(
            `Waiting for Vite dev server... (${retries} retries left)`
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return loadDevServer(retries - 1);
        }
        console.error("Failed to load Vite dev server:", err);
      }
    };
    loadDevServer();
  } else {
    // In production, the dist folder is inside app.asar
    // app.getAppPath() returns the path to app.asar when packaged
    const indexPath = app.isPackaged
      ? path.join(app.getAppPath(), "dist/index.html")
      : path.join(__dirname, "../dist/index.html");

    console.log("Loading index.html from:", indexPath);
    mainWindow
      .loadFile(indexPath)
      .then(() => {
        console.log("index.html loaded successfully");
      })
      .catch((err) => {
        console.error("Failed to load index.html:", err);
        console.error("Attempted path:", indexPath);
        // Show window anyway so user can see something happened
        mainWindow.show();
      });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (ptyManager) ptyManager.killAll();
    if (archeonWatcher) archeonWatcher.stop();
  });
}

// ============ IPC HANDLERS ============

// Project selection
ipcMain.handle("dialog:openProject", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select Archeon Project",
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, path: null };
  }

  const projectPath = result.filePaths[0];

  // Validate it has an archeon directory
  const archeonDir = path.join(projectPath, "archeon");
  const fs = await import("fs/promises");

  try {
    await fs.access(archeonDir);
    return { canceled: false, path: projectPath, valid: true };
  } catch {
    return { canceled: false, path: projectPath, valid: false };
  }
});

// PTY handlers
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

// Archeon watcher handlers
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

// Copy rule template files to project directory
ipcMain.handle("rules:copyTemplates", async (event, { files, targetDir }) => {
  const fs = await import("fs/promises");
  const isDev = process.env.VITE_DEV_SERVER_URL;
  const templatesPath = isDev
    ? path.join(__dirname, "..", "rules_templates")
    : path.join(process.resourcesPath, "rules_templates");

  const results = { created: [], failed: [] };

  for (const file of files) {
    const sourcePath = path.join(templatesPath, file);
    const destPath = path.join(targetDir, file);

    try {
      // Read template
      const content = await fs.readFile(sourcePath, "utf-8");

      // Ensure target directory exists
      await fs.mkdir(path.dirname(destPath), { recursive: true });

      // Write to target
      await fs.writeFile(destPath, content, "utf-8");
      results.created.push(file);
    } catch (error) {
      results.failed.push({ file, error: error.message });
    }
  }

  return results;
});

// File reading for Monaco editor
ipcMain.handle("fs:readFile", async (event, filePath) => {
  const fs = await import("fs/promises");
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// File writing
ipcMain.handle("fs:writeFile", async (event, filePath, content) => {
  const fs = await import("fs/promises");
  const pathModule = await import("path");

  try {
    // Ensure parent directory exists
    const dir = pathModule.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Write the file
    await fs.writeFile(filePath, content, "utf-8");
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Run shell command and capture output
ipcMain.handle("shell:exec", async (event, command, options = {}) => {
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: 60000,
      ...options,
    });
    return { success: true, stdout, stderr };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stdout: error.stdout || "",
      stderr: error.stderr || "",
    };
  }
});

// Open URL in system browser
ipcMain.handle("shell:openExternal", async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Open a file in the default code editor
ipcMain.handle("shell:openFile", async (event, projectPath, filePath) => {
  try {
    const fullPath = path.join(projectPath, filePath);

    // Try to open with code command first (VSCode)
    try {
      await execAsync(`code "${fullPath}"`);
      return { success: true };
    } catch (err) {
      // Fallback: use shell.openPath which opens with default application
      await shell.openPath(fullPath);
      return { success: true };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Load available shapes from Archeon's architectures directory
ipcMain.handle("archeon:getShapes", async () => {
  const homeDir = os.homedir();
  const fs = await import("fs/promises");
  const pathModule = await import("path");

  let architecturesDir = null;

  try {
    // Try multiple possible locations for the architectures directory
    const possiblePaths = [
      // Development/editable install (pipx install -e or pip install -e)
      pathModule.join(homeDir, "dev/archeon/archeon/architectures"),

      // Standard pipx install on Linux/Mac - need to find python version
      // We'll handle this one specially below
      null,
    ];

    // First try the dev path
    if (possiblePaths[0]) {
      try {
        await fs.access(possiblePaths[0]);
        architecturesDir = possiblePaths[0];
        console.log(
          "[getShapes] Found architectures in dev install:",
          architecturesDir
        );
      } catch {
        // Dev path doesn't exist, continue
      }
    }

    // If not found in dev, try pipx install directory
    if (!architecturesDir) {
      const pipxArchDir = `${homeDir}/.local/pipx/venvs/archeon/lib`;

      try {
        // Find the python version directory
        const libContents = await fs.readdir(pipxArchDir);
        const pythonDir = libContents.find((d) => d.startsWith("python"));

        if (pythonDir) {
          const pipxPath = pathModule.join(
            pipxArchDir,
            pythonDir,
            "site-packages/archeon/architectures"
          );

          await fs.access(pipxPath);
          architecturesDir = pipxPath;
          console.log(
            "[getShapes] Found architectures in pipx install:",
            architecturesDir
          );
        }
      } catch {
        // Pipx path doesn't exist either
      }
    }

    if (!architecturesDir) {
      throw new Error(
        "Could not find archeon architectures directory. Please ensure archeon is installed via pipx."
      );
    }

    // Read all .shape.json files
    const files = await fs.readdir(architecturesDir);
    const shapeFiles = files.filter((f) => f.endsWith(".shape.json"));
    const shapes = [];

    for (const file of shapeFiles) {
      const filePath = pathModule.join(architecturesDir, file);
      const content = await fs.readFile(filePath, "utf-8");
      const shapeData = JSON.parse(content);

      // Extract shape info from the JSON
      const id = file.replace(".shape.json", "");
      const shape = {
        id,
        name:
          shapeData.name ||
          id
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" + "),
        description: shapeData.description || `${id} architecture template`,
        icon: "📦",
        tags: shapeData.tags || [],
      };

      // Add inferred tags if none provided
      if (shape.tags.length === 0) {
        if (id.includes("vue")) shape.tags.push("Vue 3");
        if (id.includes("react")) shape.tags.push("React");
        if (id.includes("nextjs") || id.includes("next"))
          shape.tags.push("Next.js");
        if (id.includes("fastapi")) shape.tags.push("FastAPI", "Python");
        if (id.includes("express")) shape.tags.push("Express", "Node.js");
        if (id.includes("capacitor")) shape.tags.push("Capacitor", "Mobile");
      }

      shapes.push(shape);
    }

    return { success: true, shapes, path: architecturesDir };
  } catch (error) {
    console.error("[getShapes] Error:", error.message);
    return { success: false, error: error.message, shapes: [] };
  }
});

// Check if a command exists/is installed
ipcMain.handle("shell:checkCommand", async (event, command) => {
  try {
    // Expand PATH to include common user binary locations for packaged apps
    const homeDir = os.homedir();
    const expandedPath = [
      `${homeDir}/.local/bin`,
      "/opt/homebrew/bin",
      "/usr/local/bin",
      process.env.PATH,
    ].join(":");

    // Expand ~ to home directory in command
    const expandedCommand = command
      .replace(/^~/, homeDir)
      .replace(/\s~\//g, ` ${homeDir}/`);

    console.log(`[checkCommand] Original: ${command}`);
    console.log(`[checkCommand] Expanded: ${expandedCommand}`);

    const { stdout } = await execAsync(expandedCommand, {
      timeout: 5000,
      env: { ...process.env, PATH: expandedPath },
    });
    console.log(`[checkCommand] Success: ${stdout.trim()}`);
    return { success: true, output: stdout.trim() };
  } catch (error) {
    console.log(`[checkCommand] Failed: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// Check if a directory exists
ipcMain.handle("fs:checkDirExists", async (event, dirPath) => {
  try {
    const fs = await import("fs/promises");
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch (error) {
    return false;
  }
});

// Check if a file exists
ipcMain.handle("fs:fileExists", async (event, filePath) => {
  try {
    const fs = await import("fs/promises");
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch (error) {
    return false;
  }
});

// Find client directory within project (looks for 'client' folder or package.json)
ipcMain.handle("fs:findClientDir", async (event, projectPath) => {
  const fs = await import("fs/promises");
  const pathModule = await import("path");

  try {
    // First check for a 'client' subdirectory
    const clientDir = pathModule.join(projectPath, "client");
    try {
      const stat = await fs.stat(clientDir);
      if (stat.isDirectory()) {
        // Check if it has a package.json
        const pkgPath = pathModule.join(clientDir, "package.json");
        try {
          await fs.access(pkgPath);
          return { success: true, path: clientDir, hasPackageJson: true };
        } catch {
          return { success: true, path: clientDir, hasPackageJson: false };
        }
      }
    } catch {
      // No client directory, check root for package.json
    }

    // Check root directory for package.json
    const rootPkgPath = pathModule.join(projectPath, "package.json");
    try {
      await fs.access(rootPkgPath);
      return { success: true, path: projectPath, hasPackageJson: true };
    } catch {
      return {
        success: false,
        error: "No package.json found in project or client directory",
      };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Read and parse package.json to find dev script
ipcMain.handle("fs:readPackageJson", async (event, dirPath) => {
  const fs = await import("fs/promises");
  const pathModule = await import("path");

  try {
    const pkgPath = pathModule.join(dirPath, "package.json");
    const content = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(content);

    // Find the dev script (try common names)
    const scripts = pkg.scripts || {};
    let devScript = null;
    let devCommand = null;

    // Priority order for dev scripts
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
      scripts: scripts,
      devScript: devScript,
      devCommand: devCommand,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============ ARCHEON VALIDATION ============

// Filter for non-strict validation - ignore certain messages
function filterValidationMessages(errors, warnings) {
  // Messages to ignore in non-strict mode
  const ignoredErrorPatterns = [
    "boundary.vDataFlow", // Views in data flow are allowed
  ];

  const ignoredWarningPatterns = [
    "chain.noOutput", // Chains don't need to end with OUT: or ERR:
    "api.noErrorPath", // APIs don't need explicit error paths
  ];

  const filtered = {
    errors: errors.filter(
      (err) => !ignoredErrorPatterns.some((pattern) => err.includes(pattern))
    ),
    warnings: warnings.filter(
      (warn) =>
        !ignoredWarningPatterns.some((pattern) => warn.includes(pattern))
    ),
  };

  return filtered;
}

ipcMain.handle("archeon:validate", async (event, projectPath) => {
  if (!projectPath) {
    return { success: false, error: "No project path provided" };
  }

  try {
    // Run arc validate in the project directory
    const { stdout, stderr } = await execAsync("arc validate", {
      cwd: projectPath,
      timeout: 30000, // 30 second timeout
    });

    // Parse the output to determine success/failure
    const output = stdout + stderr;
    const isValid =
      output.includes("Validation passed") || output.includes("✓");

    // Extract chain and glyph counts
    const chainsMatch = output.match(/Chains:\s*(\d+)/);
    const glyphsMatch = output.match(/Glyphs:\s*(\d+)/);

    // Extract errors if any
    let errors = [];
    const errorMatches = output.matchAll(/•\s*ERR:[^\n]+/g);
    for (const match of errorMatches) {
      errors.push(match[0].replace("• ", ""));
    }

    // Extract warnings if any
    let warnings = [];
    const warnMatches = output.matchAll(/•\s*WARN:[^\n]+/g);
    for (const match of warnMatches) {
      warnings.push(match[0].replace("• ", ""));
    }

    // Filter to ignore non-critical validation messages
    const filtered = filterValidationMessages(errors, warnings);
    errors = filtered.errors;
    warnings = filtered.warnings;

    // Re-determine validity after filtering
    const isValidAfterFilter = errors.length === 0;

    return {
      success: true,
      isValid: isValidAfterFilter,
      chains: chainsMatch ? parseInt(chainsMatch[1]) : 0,
      glyphs: glyphsMatch ? parseInt(glyphsMatch[1]) : 0,
      errors,
      warnings,
      output,
    };
  } catch (error) {
    // arc command might return non-zero exit code on validation failure
    const output = (error.stdout || "") + (error.stderr || "");
    const isValid = false;

    // Extract errors
    let errors = [];
    const errorMatches = output.matchAll(/•\s*ERR:[^\n]+/g);
    for (const match of errorMatches) {
      errors.push(match[0].replace("• ", ""));
    }

    // Extract warnings
    let warnings = [];
    const warnMatches = output.matchAll(/•\s*WARN:[^\n]+/g);
    for (const match of warnMatches) {
      warnings.push(match[0].replace("• ", ""));
    }

    // Filter to ignore non-critical validation messages
    const filtered = filterValidationMessages(errors, warnings);
    errors = filtered.errors;
    warnings = filtered.warnings;

    // Re-determine validity after filtering
    const isValidAfterFilter = errors.length === 0;

    // Check if arc command exists
    if (
      error.message?.includes("not found") ||
      error.message?.includes("ENOENT")
    ) {
      return {
        success: false,
        error: "arc command not found. Make sure it's installed and in PATH.",
      };
    }

    return {
      success: true,
      isValid: isValidAfterFilter,
      errors,
      warnings,
      output,
    };
  }
});

// ============ APP LIFECYCLE ============

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
