const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("electronAPI", {
  // ============ PROJECT ============
  openProject: () => ipcRenderer.invoke("dialog:openProject"),
  // ============ PTY TERMINAL ============
  ptySpawn: (options) => ipcRenderer.invoke("pty:spawn", options),
  ptyWrite: (id, data) => ipcRenderer.send("pty:write", { id, data }),
  ptyResize: (id, cols, rows) => ipcRenderer.send("pty:resize", { id, cols, rows }),
  ptyKill: (id) => ipcRenderer.send("pty:kill", { id }),
  // PTY event listeners
  onPtyData: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on("pty:data", handler);
    return () => ipcRenderer.removeListener("pty:data", handler);
  },
  onPtyExit: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on("pty:exit", handler);
    return () => ipcRenderer.removeListener("pty:exit", handler);
  },
  // ============ ARCHEON WATCHER ============
  archeonWatch: (projectPath) => ipcRenderer.invoke("archeon:watch", projectPath),
  archeonStop: () => ipcRenderer.invoke("archeon:stop"),
  archeonReadIndex: (projectPath) => ipcRenderer.invoke("archeon:readIndex", projectPath),
  archeonReadArcon: (projectPath) => ipcRenderer.invoke("archeon:readArcon", projectPath),
  // Archeon event listeners
  onArcheonIndexChanged: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on("archeon:index-changed", handler);
    return () => ipcRenderer.removeListener("archeon:index-changed", handler);
  },
  onArcheonArconChanged: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on("archeon:arcon-changed", handler);
    return () => ipcRenderer.removeListener("archeon:arcon-changed", handler);
  },
  // ============ FILE SYSTEM ============
  readFile: (filePath) => ipcRenderer.invoke("fs:readFile", filePath)
});
