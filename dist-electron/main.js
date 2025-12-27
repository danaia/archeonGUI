import { ipcMain as i, dialog as P, shell as D, app as g, BrowserWindow as R } from "electron";
import d from "path";
import { fileURLToPath as F } from "url";
import { exec as N } from "child_process";
import { promisify as b } from "util";
import j from "node-pty";
import W from "os";
import x from "fs";
import k from "chokidar";
import y from "fs/promises";
class I {
  constructor(e) {
    this.mainWindow = e, this.terminals = /* @__PURE__ */ new Map(), this.nextId = 1;
  }
  /**
   * Determine the shell to use based on OS and availability
   * @returns {string} - Shell executable path
   */
  getShell() {
    if (process.env.SHELL && x.existsSync(process.env.SHELL))
      return process.env.SHELL;
    const e = W.platform();
    if (e === "win32")
      return "powershell.exe";
    const t = [
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
    for (const s of t)
      if (x.existsSync(s))
        return s;
    return e === "darwin" ? "/bin/zsh" : "/bin/bash";
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
  spawn(e = {}) {
    const t = this.getShell(), s = e.cwd || W.homedir(), r = e.cols || 80, n = e.rows || 24;
    console.log(`[PTY] Spawning shell: ${t}`), console.log(`[PTY] Working directory: ${s}`), console.log(`[PTY] Platform: ${W.platform()}`);
    const a = {
      ...process.env,
      ...e.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor"
    }, c = [];
    (t.includes("zsh") || t.includes("bash")) && c.push("-l"), console.log(`[PTY] Shell args: ${JSON.stringify(c)}`);
    try {
      const l = j.spawn(t, c, {
        name: "xterm-256color",
        cols: r,
        rows: n,
        cwd: s,
        env: a,
        useConpty: !1
        // Disable ConPTY on Windows, doesn't affect macOS/Linux
      }), h = this.nextId++;
      return this.terminals.set(h, l), l.onData((u) => {
        this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("pty:data", { id: h, data: u });
      }), l.onExit(({ exitCode: u, signal: m }) => {
        this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("pty:exit", { id: h, exitCode: u, signal: m }), this.terminals.delete(h);
      }), { id: h, pid: l.pid };
    } catch (l) {
      throw console.error(`Failed to spawn PTY with shell ${t}:`, l), new Error(`PTY spawn failed: ${l.message}`);
    }
  }
  /**
   * Write data to a PTY
   * @param {number} id - Terminal ID
   * @param {string} data - Data to write
   */
  write(e, t) {
    const s = this.terminals.get(e);
    s && s.write(t);
  }
  /**
   * Resize a PTY
   * @param {number} id - Terminal ID
   * @param {number} cols - New columns
   * @param {number} rows - New rows
   */
  resize(e, t, s) {
    const r = this.terminals.get(e);
    if (r && t > 0 && s > 0)
      try {
        r.resize(t, s);
      } catch (n) {
        console.warn("PTY resize failed:", n.message);
      }
  }
  /**
   * Kill a PTY
   * @param {number} id - Terminal ID
   */
  kill(e) {
    const t = this.terminals.get(e);
    t && (t.kill(), this.terminals.delete(e));
  }
  /**
   * Kill all PTYs
   */
  killAll() {
    for (const [e, t] of this.terminals)
      t.kill();
    this.terminals.clear();
  }
}
class S {
  constructor(e) {
    this.mainWindow = e, this.watcher = null, this.projectPath = null;
  }
  /**
   * Start watching an archeon project directory
   * @param {string} projectPath - Root path of the project
   * @returns {Object} - { success, error?, initialData? }
   */
  async watch(e) {
    this.stop(), this.projectPath = e;
    const t = d.join(e, "archeon");
    let s = !1;
    try {
      await y.access(t), s = !0;
    } catch {
      s = !1;
    }
    let r = {
      success: !1,
      error: "archeon/ directory not found"
    }, n = {
      success: !1,
      error: "archeon/ directory not found"
    };
    return s && (r = await this.readIndexFile(e), n = await this.readArconFile(e)), this.rootWatcher = k.watch(e, {
      persistent: !0,
      ignoreInitial: !0,
      depth: 0
      // Only watch immediate children
    }), this.rootWatcher.on("addDir", async (a) => {
      d.basename(a) === "archeon" && await this.startArcheonWatcher(e);
    }), s && await this.startArcheonWatcher(e), {
      success: !0,
      initialIndex: r,
      initialArcon: n
    };
  }
  /**
   * Start watching the archeon directory for file changes
   * @param {string} projectPath - Root path of the project
   */
  async startArcheonWatcher(e) {
    const t = d.join(e, "archeon");
    this.watcher && await this.watcher.close(), this.watcher = k.watch(t, {
      persistent: !0,
      ignoreInitial: !1,
      // Process existing files on start
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    }), this.watcher.on("change", async (s) => {
      const r = d.basename(s);
      if (r === "ARCHEON.index.json") {
        const n = await this.readIndexFile(e);
        n.success && this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("archeon:index-changed", n);
      } else if (r === "ARCHEON.arcon") {
        const n = await this.readArconFile(e);
        n.success && this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("archeon:arcon-changed", n);
      }
    }), this.watcher.on("add", async (s) => {
      const r = d.basename(s);
      if (r === "ARCHEON.index.json") {
        const n = await this.readIndexFile(e);
        n.success && this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("archeon:index-changed", n);
      } else if (r === "ARCHEON.arcon") {
        const n = await this.readArconFile(e);
        n.success && this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("archeon:arcon-changed", n);
      }
    }), this.watcher.on("error", (s) => {
      console.error("Archeon watcher error:", s);
    });
  }
  /**
   * Read and parse ARCHEON.index.json
   * @param {string} projectPath - Root path of the project
   * @returns {Object} - { success, data?, error? }
   */
  async readIndexFile(e) {
    const t = d.join(e, "archeon", "ARCHEON.index.json");
    try {
      const s = await y.readFile(t, "utf-8");
      return { success: !0, data: JSON.parse(s), path: t };
    } catch (s) {
      return s.code === "ENOENT" ? { success: !1, error: "ARCHEON.index.json not found" } : { success: !1, error: s.message };
    }
  }
  /**
   * Read ARCHEON.arcon file
   * @param {string} projectPath - Root path of the project
   * @returns {Object} - { success, content?, chains?, error? }
   */
  async readArconFile(e) {
    const t = d.join(e, "archeon", "ARCHEON.arcon");
    try {
      const s = await y.readFile(t, "utf-8"), r = this.parseArconChains(s);
      return { success: !0, content: s, chains: r, path: t };
    } catch (s) {
      return s.code === "ENOENT" ? { success: !1, error: "ARCHEON.arcon not found" } : { success: !1, error: s.message };
    }
  }
  /**
   * Parse chain definitions from .arcon content
   * @param {string} content - Raw .arcon file content
   * @returns {Array} - Array of parsed chains
   */
  parseArconChains(e) {
    const t = [], s = e.split(`
`);
    for (const r of s) {
      const n = r.trim();
      if (!n || n.startsWith("#")) continue;
      const a = n.match(/^@(\w+)\s+(.+)$/);
      if (a) {
        const c = a[1], l = a[2], h = this.parseChainGlyphs(l);
        t.push({
          version: c,
          raw: n,
          glyphs: h
        });
        continue;
      }
      if (n.includes("::")) {
        const c = this.parseContainmentGlyphs(n);
        t.push({
          type: "orchestrator",
          raw: n,
          glyphs: c
        });
      }
    }
    return t;
  }
  /**
   * Parse glyphs from a chain definition (using => edges)
   * @param {string} chainDef - Chain definition string
   * @returns {Array} - Array of glyph objects
   */
  parseChainGlyphs(e) {
    const t = [], s = e.split(/\s*(?:=>|~>|->)\s*/);
    for (const r of s) {
      const n = r.trim();
      if (!n) continue;
      const a = n.match(/^(\w+):(.+)$/);
      a && t.push({
        type: a[1],
        name: a[2],
        key: n
      });
    }
    return t;
  }
  /**
   * Parse glyphs from containment definition (using :: edges)
   * @param {string} def - Definition string
   * @returns {Array} - Array of glyph objects
   */
  parseContainmentGlyphs(e) {
    const t = [], s = e.split(/\s*::\s*/);
    for (const r of s) {
      const n = r.trim();
      if (!n) continue;
      const a = n.match(/^(\w+):(.+)$/);
      a && t.push({
        type: a[1],
        name: a[2],
        key: n
      });
    }
    return t;
  }
  /**
   * Write content to ARCHEON.arcon file
   * @param {string} projectPath - Root path of the project
   * @param {string} content - Content to write to the file
   * @returns {Object} - { success, error? }
   */
  async writeArconFile(e, t) {
    const s = d.join(e, "archeon", "ARCHEON.arcon");
    try {
      const r = d.join(e, "archeon");
      try {
        await y.access(r);
      } catch {
        await y.mkdir(r, { recursive: !0 });
      }
      return await y.writeFile(s, t, "utf-8"), { success: !0, path: s };
    } catch (r) {
      return { success: !1, error: r.message };
    }
  }
  /**
   * Stop watching
   */
  stop() {
    this.watcher && (this.watcher.close(), this.watcher = null), this.rootWatcher && (this.rootWatcher.close(), this.rootWatcher = null), this.projectPath = null;
  }
}
const A = b(N), E = d.dirname(F(import.meta.url));
let f = null, w = null, p = null;
function C() {
  if (f = new R({
    width: 1600,
    height: 1e3,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: d.join(E, "preload.js"),
      contextIsolation: !0,
      nodeIntegration: !1
    },
    backgroundColor: "#0f0f0f",
    titleBarStyle: "hiddenInset",
    frame: process.platform !== "darwin",
    show: !1
    // Don't show until ready
  }), w = new I(f), p = new S(f), f.once("ready-to-show", () => {
    f.show();
  }), process.env.VITE_DEV_SERVER_URL) {
    const o = async (e = 5) => {
      try {
        await f.loadURL(process.env.VITE_DEV_SERVER_URL);
      } catch (t) {
        if (e > 0)
          return console.log(
            `Waiting for Vite dev server... (${e} retries left)`
          ), await new Promise((s) => setTimeout(s, 1e3)), o(e - 1);
        console.error("Failed to load Vite dev server:", t);
      }
    };
    o();
  } else
    f.loadFile(d.join(E, "../dist/index.html"));
  f.on("closed", () => {
    f = null, w && w.killAll(), p && p.stop();
  });
}
i.handle("dialog:openProject", async () => {
  const o = await P.showOpenDialog(f, {
    properties: ["openDirectory"],
    title: "Select Archeon Project"
  });
  if (o.canceled || o.filePaths.length === 0)
    return { canceled: !0, path: null };
  const e = o.filePaths[0], t = d.join(e, "archeon"), s = await import("fs/promises");
  try {
    return await s.access(t), { canceled: !1, path: e, valid: !0 };
  } catch {
    return { canceled: !1, path: e, valid: !1 };
  }
});
i.handle("pty:spawn", (o, e = {}) => w.spawn(e));
i.on("pty:write", (o, { id: e, data: t }) => {
  w.write(e, t);
});
i.on("pty:resize", (o, { id: e, cols: t, rows: s }) => {
  w.resize(e, t, s);
});
i.on("pty:kill", (o, { id: e }) => {
  w.kill(e);
});
i.handle("archeon:watch", (o, e) => p.watch(e));
i.handle("archeon:stop", () => (p.stop(), !0));
i.handle("archeon:readIndex", async (o, e) => p.readIndexFile(e));
i.handle("archeon:readArcon", async (o, e) => p.readArconFile(e));
i.handle("archeon:writeArcon", async (o, e, t) => p.writeArconFile(e, t));
i.handle("rules:copyTemplates", async (o, { files: e, targetDir: t }) => {
  const s = await import("fs/promises"), n = process.env.VITE_DEV_SERVER_URL ? d.join(E, "..", "rules_templates") : d.join(process.resourcesPath, "rules_templates"), a = { created: [], failed: [] };
  for (const c of e) {
    const l = d.join(n, c), h = d.join(t, c);
    try {
      const u = await s.readFile(l, "utf-8");
      await s.mkdir(d.dirname(h), { recursive: !0 }), await s.writeFile(h, u, "utf-8"), a.created.push(c);
    } catch (u) {
      a.failed.push({ file: c, error: u.message });
    }
  }
  return a;
});
i.handle("fs:readFile", async (o, e) => {
  const t = await import("fs/promises");
  try {
    return { success: !0, content: await t.readFile(e, "utf-8") };
  } catch (s) {
    return { success: !1, error: s.message };
  }
});
i.handle("fs:writeFile", async (o, e, t) => {
  const s = await import("fs/promises"), r = await import("path");
  try {
    const n = r.dirname(e);
    return await s.mkdir(n, { recursive: !0 }), await s.writeFile(e, t, "utf-8"), { success: !0 };
  } catch (n) {
    return { success: !1, error: n.message };
  }
});
i.handle("shell:exec", async (o, e, t = {}) => {
  try {
    const { stdout: s, stderr: r } = await A(e, {
      timeout: 6e4,
      ...t
    });
    return { success: !0, stdout: s, stderr: r };
  } catch (s) {
    return {
      success: !1,
      error: s.message,
      stdout: s.stdout || "",
      stderr: s.stderr || ""
    };
  }
});
i.handle("shell:openExternal", async (o, e) => {
  try {
    return await D.openExternal(e), { success: !0 };
  } catch (t) {
    return { success: !1, error: t.message };
  }
});
i.handle("shell:checkCommand", async (o, e) => {
  try {
    const { stdout: t } = await A(e, { timeout: 5e3 });
    return { success: !0, output: t.trim() };
  } catch (t) {
    return { success: !1, error: t.message };
  }
});
i.handle("fs:checkDirExists", async (o, e) => {
  try {
    return (await (await import("fs/promises")).stat(e)).isDirectory();
  } catch {
    return !1;
  }
});
i.handle("fs:findClientDir", async (o, e) => {
  const t = await import("fs/promises"), s = await import("path");
  try {
    const r = s.join(e, "client");
    try {
      if ((await t.stat(r)).isDirectory()) {
        const c = s.join(r, "package.json");
        try {
          return await t.access(c), { success: !0, path: r, hasPackageJson: !0 };
        } catch {
          return { success: !0, path: r, hasPackageJson: !1 };
        }
      }
    } catch {
    }
    const n = s.join(e, "package.json");
    try {
      return await t.access(n), { success: !0, path: e, hasPackageJson: !0 };
    } catch {
      return {
        success: !1,
        error: "No package.json found in project or client directory"
      };
    }
  } catch (r) {
    return { success: !1, error: r.message };
  }
});
i.handle("fs:readPackageJson", async (o, e) => {
  const t = await import("fs/promises"), s = await import("path");
  try {
    const r = s.join(e, "package.json"), n = await t.readFile(r, "utf-8"), a = JSON.parse(n), c = a.scripts || {};
    let l = null, h = null;
    const u = ["dev", "start", "serve", "develop", "run"];
    for (const m of u)
      if (c[m]) {
        l = m, h = c[m];
        break;
      }
    return {
      success: !0,
      name: a.name,
      scripts: c,
      devScript: l,
      devCommand: h
    };
  } catch (r) {
    return { success: !1, error: r.message };
  }
});
i.handle("archeon:validate", async (o, e) => {
  if (!e)
    return { success: !1, error: "No project path provided" };
  try {
    const { stdout: t, stderr: s } = await A("arc validate", {
      cwd: e,
      timeout: 3e4
      // 30 second timeout
    }), r = t + s, n = r.includes("Validation passed") || r.includes("✓"), a = r.match(/Chains:\s*(\d+)/), c = r.match(/Glyphs:\s*(\d+)/), l = [], h = r.matchAll(/•\s*ERR:[^\n]+/g);
    for (const v of h)
      l.push(v[0].replace("• ", ""));
    const u = [], m = r.matchAll(/•\s*WARN:[^\n]+/g);
    for (const v of m)
      u.push(v[0].replace("• ", ""));
    return {
      success: !0,
      isValid: n,
      chains: a ? parseInt(a[1]) : 0,
      glyphs: c ? parseInt(c[1]) : 0,
      errors: l,
      warnings: u,
      output: r
    };
  } catch (t) {
    const s = (t.stdout || "") + (t.stderr || ""), r = !1, n = [], a = s.matchAll(/•\s*ERR:[^\n]+/g);
    for (const h of a)
      n.push(h[0].replace("• ", ""));
    const c = [], l = s.matchAll(/•\s*WARN:[^\n]+/g);
    for (const h of l)
      c.push(h[0].replace("• ", ""));
    return t.message?.includes("not found") || t.message?.includes("ENOENT") ? {
      success: !1,
      error: "arc command not found. Make sure it's installed and in PATH."
    } : {
      success: !0,
      isValid: r,
      errors: n,
      warnings: c,
      output: s
    };
  }
});
g.whenReady().then(C);
g.on("window-all-closed", () => {
  process.platform !== "darwin" && g.quit();
});
g.on("activate", () => {
  R.getAllWindows().length === 0 && C();
});
