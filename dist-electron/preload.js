const { contextBridge: t, ipcRenderer: n } = require("electron");
t.exposeInMainWorld("electronAPI", {
  // ============ PROJECT ============
  openProject: () => n.invoke("dialog:openProject"),
  // ============ PTY TERMINAL ============
  ptySpawn: (e) => n.invoke("pty:spawn", e),
  ptyWrite: (e, o) => n.send("pty:write", { id: e, data: o }),
  ptyResize: (e, o, a) => n.send("pty:resize", { id: e, cols: o, rows: a }),
  ptyKill: (e) => n.send("pty:kill", { id: e }),
  // PTY event listeners
  onPtyData: (e) => {
    const o = (a, r) => e(r);
    return n.on("pty:data", o), () => n.removeListener("pty:data", o);
  },
  onPtyExit: (e) => {
    const o = (a, r) => e(r);
    return n.on("pty:exit", o), () => n.removeListener("pty:exit", o);
  },
  // ============ ARCHEON WATCHER ============
  archeonWatch: (e) => n.invoke("archeon:watch", e),
  archeonStop: () => n.invoke("archeon:stop"),
  archeonReadIndex: (e) => n.invoke("archeon:readIndex", e),
  archeonReadArcon: (e) => n.invoke("archeon:readArcon", e),
  archeonWriteArcon: (e, o) => n.invoke("archeon:writeArcon", e, o),
  archeonValidate: (e) => n.invoke("archeon:validate", e),
  // Archeon event listeners
  onArcheonIndexChanged: (e) => {
    const o = (a, r) => e(r);
    return n.on("archeon:index-changed", o), () => n.removeListener("archeon:index-changed", o);
  },
  onArcheonArconChanged: (e) => {
    const o = (a, r) => e(r);
    return n.on("archeon:arcon-changed", o), () => n.removeListener("archeon:arcon-changed", o);
  },
  // ============ FILE SYSTEM ============
  readFile: (e) => n.invoke("fs:readFile", e),
  writeFile: (e, o) => n.invoke("fs:writeFile", e, o),
  findClientDir: (e) => n.invoke("fs:findClientDir", e),
  readPackageJson: (e) => n.invoke("fs:readPackageJson", e),
  checkDirExists: (e) => n.invoke("fs:checkDirExists", e),
  // ============ RULES TEMPLATES ============
  copyRuleTemplates: (e, o) => n.invoke("rules:copyTemplates", { files: e, targetDir: o }),
  // ============ SHELL ============
  exec: (e, o) => n.invoke("shell:exec", e, o),
  openExternal: (e) => n.invoke("shell:openExternal", e),
  checkCommand: (e) => n.invoke("shell:checkCommand", e),
  // ============ ARCHEON SHAPES ============
  getShapes: () => n.invoke("archeon:getShapes")
});
