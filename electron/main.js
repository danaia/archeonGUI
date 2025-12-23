import { app, BrowserWindow, ipcMain, dialog } from "electron";
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
  });

  // Initialize PTY manager
  ptyManager = new PtyManager(mainWindow);

  // Initialize Archeon watcher (starts when project is opened)
  archeonWatcher = new ArcheonWatcher(mainWindow);

  // Development vs production URL
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
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
