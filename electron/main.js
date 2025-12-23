import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { PtyManager } from "./pty-manager.js";
import { ArcheonWatcher } from "./archeon-watcher.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Keep references to prevent garbage collection
let mainWindow = null;
let ptyManager = null;
let archeonWatcher = null;

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
    },
    backgroundColor: "#0f0f0f",
    titleBarStyle: "hiddenInset",
    frame: process.platform === "darwin" ? false : true,
    show: false, // Don't show until ready
  });

  // Initialize PTY manager
  ptyManager = new PtyManager(mainWindow);

  // Initialize Archeon watcher (starts when project is opened)
  archeonWatcher = new ArcheonWatcher(mainWindow);

  // Show window when ready to prevent blank screen flash
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Development vs production URL
  if (process.env.VITE_DEV_SERVER_URL) {
    // In dev mode, wait for Vite server and retry if needed
    const loadDevServer = async (retries = 5) => {
      try {
        await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
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
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
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

// Open URL in system browser
ipcMain.handle("shell:openExternal", async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
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
