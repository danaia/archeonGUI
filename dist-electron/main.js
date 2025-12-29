import { app as m, ipcMain as h, dialog as N, shell as D, BrowserWindow as j } from "electron";
import d from "path";
import x from "os";
import { fileURLToPath as T } from "url";
import { exec as $ } from "child_process";
import { promisify as M } from "util";
import O from "node-pty";
import C from "fs";
import F from "chokidar";
import E from "fs/promises";
class H {
  constructor(e) {
    this.mainWindow = e, this.terminals = /* @__PURE__ */ new Map(), this.nextId = 1;
  }
  /**
   * Determine the shell to use based on OS and availability
   * @returns {string} - Shell executable path
   */
  getShell() {
    if (process.env.SHELL && C.existsSync(process.env.SHELL))
      return process.env.SHELL;
    const e = x.platform();
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
      if (C.existsSync(s))
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
    const t = this.getShell(), s = e.cwd || x.homedir(), n = e.cols || 80, r = e.rows || 24, a = x.platform(), i = x.homedir();
    console.log(`[PTY] Spawning shell: ${t}`), console.log(`[PTY] Working directory: ${s}`), console.log(`[PTY] Platform: ${a}`);
    const u = [
      `${i}/.local/bin`,
      // pipx installs here
      `${i}/.cargo/bin`,
      // Rust binaries
      `${i}/.pyenv/shims`,
      // pyenv
      `${i}/.nvm/versions/node`,
      // nvm (partial)
      "/opt/homebrew/bin",
      // Homebrew on Apple Silicon
      "/opt/homebrew/sbin",
      "/usr/local/bin",
      // Homebrew on Intel Mac / Linux
      "/usr/local/sbin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin"
    ], p = process.env.PATH || "", c = /* @__PURE__ */ new Set([...u, ...p.split(":")]), g = Array.from(c).filter((l) => l).join(":"), y = {
      ...process.env,
      ...e.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      PATH: g,
      HOME: i,
      SHELL: t,
      // Ensure locale is set for proper character handling
      LANG: process.env.LANG || "en_US.UTF-8",
      LC_ALL: process.env.LC_ALL || "en_US.UTF-8"
    }, v = [];
    (t.includes("zsh") || t.includes("bash")) && v.push("-l", "-i"), console.log(`[PTY] Shell args: ${JSON.stringify(v)}`), console.log(`[PTY] PATH includes ~/.local/bin: ${g.includes(".local/bin")}`);
    try {
      const l = O.spawn(t, v, {
        name: "xterm-256color",
        cols: n,
        rows: r,
        cwd: s,
        env: y,
        useConpty: !1
        // Disable ConPTY on Windows, doesn't affect macOS/Linux
      }), f = this.nextId++;
      return this.terminals.set(f, l), l.onData((A) => {
        this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("pty:data", { id: f, data: A });
      }), l.onExit(({ exitCode: A, signal: L }) => {
        this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("pty:exit", { id: f, exitCode: A, signal: L }), this.terminals.delete(f);
      }), { id: f, pid: l.pid };
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
    const n = this.terminals.get(e);
    if (n && t > 0 && s > 0)
      try {
        n.resize(t, s);
      } catch (r) {
        console.warn("PTY resize failed:", r.message);
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
class I {
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
      await E.access(t), s = !0;
    } catch {
      s = !1;
    }
    let n = {
      success: !1,
      error: "archeon/ directory not found"
    }, r = {
      success: !1,
      error: "archeon/ directory not found"
    };
    return s && (n = await this.readIndexFile(e), r = await this.readArconFile(e)), this.rootWatcher = F.watch(e, {
      persistent: !0,
      ignoreInitial: !0,
      depth: 0
      // Only watch immediate children
    }), this.rootWatcher.on("addDir", async (a) => {
      d.basename(a) === "archeon" && await this.startArcheonWatcher(e);
    }), s && await this.startArcheonWatcher(e), {
      success: !0,
      initialIndex: n,
      initialArcon: r
    };
  }
  /**
   * Start watching the archeon directory for file changes
   * @param {string} projectPath - Root path of the project
   */
  async startArcheonWatcher(e) {
    const t = d.join(e, "archeon");
    this.watcher && await this.watcher.close(), this.watcher = F.watch(t, {
      persistent: !0,
      ignoreInitial: !1,
      // Process existing files on start
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    }), this.watcher.on("change", async (s) => {
      const n = d.basename(s);
      if (n === "ARCHEON.index.json") {
        const r = await this.readIndexFile(e);
        r.success && this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("archeon:index-changed", r);
      } else if (n === "ARCHEON.arcon") {
        const r = await this.readArconFile(e);
        r.success && this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("archeon:arcon-changed", r);
      }
    }), this.watcher.on("add", async (s) => {
      const n = d.basename(s);
      if (n === "ARCHEON.index.json") {
        const r = await this.readIndexFile(e);
        r.success && this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("archeon:index-changed", r);
      } else if (n === "ARCHEON.arcon") {
        const r = await this.readArconFile(e);
        r.success && this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("archeon:arcon-changed", r);
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
      const s = await E.readFile(t, "utf-8");
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
      const s = await E.readFile(t, "utf-8"), n = this.parseArconChains(s);
      return { success: !0, content: s, chains: n, path: t };
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
    for (const n of s) {
      const r = n.trim();
      if (!r || r.startsWith("#")) continue;
      const a = r.match(/^@(\w+)\s+(.+)$/);
      if (a) {
        const i = a[1], u = a[2], p = this.parseChainGlyphs(u);
        t.push({
          version: i,
          raw: r,
          glyphs: p
        });
        continue;
      }
      if (r.includes("::")) {
        const i = this.parseContainmentGlyphs(r);
        t.push({
          type: "orchestrator",
          raw: r,
          glyphs: i
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
    for (const n of s) {
      const r = n.trim();
      if (!r) continue;
      const a = r.match(/^(\w+):(.+)$/);
      a && t.push({
        type: a[1],
        name: a[2],
        key: r
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
    for (const n of s) {
      const r = n.trim();
      if (!r) continue;
      const a = r.match(/^(\w+):(.+)$/);
      a && t.push({
        type: a[1],
        name: a[2],
        key: r
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
      const n = d.join(e, "archeon");
      try {
        await E.access(n);
      } catch {
        await E.mkdir(n, { recursive: !0 });
      }
      return await E.writeFile(s, t, "utf-8"), { success: !0, path: s };
    } catch (n) {
      return { success: !1, error: n.message };
    }
  }
  /**
   * Stop watching
   */
  stop() {
    this.watcher && (this.watcher.close(), this.watcher = null), this.rootWatcher && (this.rootWatcher.close(), this.rootWatcher = null), this.projectPath = null;
  }
}
const k = M($), W = d.dirname(T(import.meta.url));
console.log("=== Electron Environment ===");
console.log("__dirname:", W);
console.log("app.isPackaged:", m.isPackaged);
console.log("process.resourcesPath:", process.resourcesPath);
console.log("app.getAppPath():", m.getAppPath());
console.log("===========================");
let w = null, P = null, b = null;
process.platform === "darwin" && (m.commandLine.appendSwitch("enable-gpu-rasterization"), m.commandLine.appendSwitch("enable-zero-copy"), m.commandLine.appendSwitch("ignore-gpu-blocklist"), m.commandLine.appendSwitch("disable-software-rasterizer"));
m.commandLine.appendSwitch("js-flags", "--max-old-space-size=2048");
m.commandLine.appendSwitch("disable-renderer-backgrounding");
function R() {
  if (w = new j({
    width: 1600,
    height: 1e3,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: d.join(W, "preload.js"),
      contextIsolation: !0,
      nodeIntegration: !1,
      // Performance optimizations
      spellcheck: !1,
      enableWebSQL: !1,
      v8CacheOptions: "code"
    },
    backgroundColor: "#0f0f0f",
    titleBarStyle: "hiddenInset",
    frame: process.platform !== "darwin",
    show: !1,
    // Don't show until ready
    // macOS-specific optimizations
    vibrancy: process.platform === "darwin" ? "under-window" : void 0,
    visualEffectState: process.platform === "darwin" ? "active" : void 0
  }), P = new H(w), b = new I(w), w.once("ready-to-show", () => {
    console.log("Window ready-to-show event fired"), w.show();
  }), setTimeout(() => {
    w.isVisible() || (console.log("Fallback: Showing window after timeout"), w.show());
  }, 3e3), process.env.VITE_DEV_SERVER_URL) {
    const o = async (e = 5) => {
      try {
        await w.loadURL(process.env.VITE_DEV_SERVER_URL), console.log("Dev server loaded successfully");
      } catch (t) {
        if (e > 0)
          return console.log(
            `Waiting for Vite dev server... (${e} retries left)`
          ), await new Promise((s) => setTimeout(s, 1e3)), o(e - 1);
        console.error("Failed to load Vite dev server:", t);
      }
    };
    o();
  } else {
    const o = m.isPackaged ? d.join(m.getAppPath(), "dist/index.html") : d.join(W, "../dist/index.html");
    console.log("Loading index.html from:", o), w.loadFile(o).then(() => {
      console.log("index.html loaded successfully");
    }).catch((e) => {
      console.error("Failed to load index.html:", e), console.error("Attempted path:", o), w.show();
    });
  }
  w.on("closed", () => {
    w = null, P && P.killAll(), b && b.stop();
  });
}
h.handle("dialog:openProject", async () => {
  const o = await N.showOpenDialog(w, {
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
h.handle("pty:spawn", (o, e = {}) => P.spawn(e));
h.on("pty:write", (o, { id: e, data: t }) => {
  P.write(e, t);
});
h.on("pty:resize", (o, { id: e, cols: t, rows: s }) => {
  P.resize(e, t, s);
});
h.on("pty:kill", (o, { id: e }) => {
  P.kill(e);
});
h.handle("archeon:watch", (o, e) => b.watch(e));
h.handle("archeon:stop", () => (b.stop(), !0));
h.handle("archeon:readIndex", async (o, e) => b.readIndexFile(e));
h.handle("archeon:readArcon", async (o, e) => b.readArconFile(e));
h.handle("archeon:writeArcon", async (o, e, t) => b.writeArconFile(e, t));
h.handle("rules:copyTemplates", async (o, { files: e, targetDir: t }) => {
  const s = await import("fs/promises"), r = process.env.VITE_DEV_SERVER_URL ? d.join(W, "..", "rules_templates") : d.join(process.resourcesPath, "rules_templates"), a = { created: [], failed: [] };
  for (const i of e) {
    const u = d.join(r, i), p = d.join(t, i);
    try {
      const c = await s.readFile(u, "utf-8");
      await s.mkdir(d.dirname(p), { recursive: !0 }), await s.writeFile(p, c, "utf-8"), a.created.push(i);
    } catch (c) {
      a.failed.push({ file: i, error: c.message });
    }
  }
  return a;
});
h.handle("fs:readFile", async (o, e) => {
  const t = await import("fs/promises");
  try {
    return { success: !0, content: await t.readFile(e, "utf-8") };
  } catch (s) {
    return { success: !1, error: s.message };
  }
});
h.handle("fs:writeFile", async (o, e, t) => {
  const s = await import("fs/promises"), n = await import("path");
  try {
    const r = n.dirname(e);
    return await s.mkdir(r, { recursive: !0 }), await s.writeFile(e, t, "utf-8"), { success: !0 };
  } catch (r) {
    return { success: !1, error: r.message };
  }
});
h.handle("shell:exec", async (o, e, t = {}) => {
  try {
    const { stdout: s, stderr: n } = await k(e, {
      timeout: 6e4,
      ...t
    });
    return { success: !0, stdout: s, stderr: n };
  } catch (s) {
    return {
      success: !1,
      error: s.message,
      stdout: s.stdout || "",
      stderr: s.stderr || ""
    };
  }
});
h.handle("shell:openExternal", async (o, e) => {
  try {
    return await D.openExternal(e), { success: !0 };
  } catch (t) {
    return { success: !1, error: t.message };
  }
});
h.handle("shell:openFile", async (o, e, t) => {
  try {
    const s = d.join(e, t);
    try {
      return await k(`code "${s}"`), { success: !0 };
    } catch {
      return await D.openPath(s), { success: !0 };
    }
  } catch (s) {
    return { success: !1, error: s.message };
  }
});
h.handle("archeon:getShapes", async () => {
  const o = x.homedir(), e = await import("fs/promises"), t = await import("path"), s = `${o}/.local/pipx/venvs/archeon/lib`;
  try {
    const r = (await e.readdir(s)).find((c) => c.startsWith("python"));
    if (!r)
      throw new Error("Could not find Python directory in pipx venv");
    const a = t.join(
      s,
      r,
      "site-packages/archeon/architectures"
    ), u = (await e.readdir(a)).filter((c) => c.endsWith(".shape.json")), p = [];
    for (const c of u) {
      const g = t.join(a, c), y = await e.readFile(g, "utf-8"), v = JSON.parse(y), l = c.replace(".shape.json", ""), f = {
        id: l,
        name: v.name || l.split("-").map((A) => A.charAt(0).toUpperCase() + A.slice(1)).join(" + "),
        description: v.description || `${l} architecture template`,
        icon: "📦",
        tags: v.tags || []
      };
      f.tags.length === 0 && (l.includes("vue") && f.tags.push("Vue 3"), l.includes("react") && f.tags.push("React"), (l.includes("nextjs") || l.includes("next")) && f.tags.push("Next.js"), l.includes("fastapi") && f.tags.push("FastAPI", "Python"), l.includes("express") && f.tags.push("Express", "Node.js"), l.includes("capacitor") && f.tags.push("Capacitor", "Mobile")), p.push(f);
    }
    return { success: !0, shapes: p, path: a };
  } catch (n) {
    return console.error("[getShapes] Error:", n.message), { success: !1, error: n.message, shapes: [] };
  }
});
h.handle("shell:checkCommand", async (o, e) => {
  try {
    const t = x.homedir(), s = [
      `${t}/.local/bin`,
      "/opt/homebrew/bin",
      "/usr/local/bin",
      process.env.PATH
    ].join(":"), n = e.replace(/^~/, t).replace(/\s~\//g, ` ${t}/`);
    console.log(`[checkCommand] Original: ${e}`), console.log(`[checkCommand] Expanded: ${n}`);
    const { stdout: r } = await k(n, {
      timeout: 5e3,
      env: { ...process.env, PATH: s }
    });
    return console.log(`[checkCommand] Success: ${r.trim()}`), { success: !0, output: r.trim() };
  } catch (t) {
    return console.log(`[checkCommand] Failed: ${t.message}`), { success: !1, error: t.message };
  }
});
h.handle("fs:checkDirExists", async (o, e) => {
  try {
    return (await (await import("fs/promises")).stat(e)).isDirectory();
  } catch {
    return !1;
  }
});
h.handle("fs:fileExists", async (o, e) => {
  try {
    return (await (await import("fs/promises")).stat(e)).isFile();
  } catch {
    return !1;
  }
});
h.handle("fs:findClientDir", async (o, e) => {
  const t = await import("fs/promises"), s = await import("path");
  try {
    const n = s.join(e, "client");
    try {
      if ((await t.stat(n)).isDirectory()) {
        const i = s.join(n, "package.json");
        try {
          return await t.access(i), { success: !0, path: n, hasPackageJson: !0 };
        } catch {
          return { success: !0, path: n, hasPackageJson: !1 };
        }
      }
    } catch {
    }
    const r = s.join(e, "package.json");
    try {
      return await t.access(r), { success: !0, path: e, hasPackageJson: !0 };
    } catch {
      return {
        success: !1,
        error: "No package.json found in project or client directory"
      };
    }
  } catch (n) {
    return { success: !1, error: n.message };
  }
});
h.handle("fs:readPackageJson", async (o, e) => {
  const t = await import("fs/promises"), s = await import("path");
  try {
    const n = s.join(e, "package.json"), r = await t.readFile(n, "utf-8"), a = JSON.parse(r), i = a.scripts || {};
    let u = null, p = null;
    const c = ["dev", "start", "serve", "develop", "run"];
    for (const g of c)
      if (i[g]) {
        u = g, p = i[g];
        break;
      }
    return {
      success: !0,
      name: a.name,
      scripts: i,
      devScript: u,
      devCommand: p
    };
  } catch (n) {
    return { success: !1, error: n.message };
  }
});
function S(o, e) {
  const t = [
    "boundary.vDataFlow"
    // Views in data flow are allowed
  ], s = [
    "chain.noOutput",
    // Chains don't need to end with OUT: or ERR:
    "api.noErrorPath"
    // APIs don't need explicit error paths
  ];
  return {
    errors: o.filter(
      (r) => !t.some((a) => r.includes(a))
    ),
    warnings: e.filter(
      (r) => !s.some((a) => r.includes(a))
    )
  };
}
h.handle("archeon:validate", async (o, e) => {
  var t, s;
  if (!e)
    return { success: !1, error: "No project path provided" };
  try {
    const { stdout: n, stderr: r } = await k("arc validate", {
      cwd: e,
      timeout: 3e4
      // 30 second timeout
    }), a = n + r, i = a.includes("Validation passed") || a.includes("✓"), u = a.match(/Chains:\s*(\d+)/), p = a.match(/Glyphs:\s*(\d+)/);
    let c = [];
    const g = a.matchAll(/•\s*ERR:[^\n]+/g);
    for (const A of g)
      c.push(A[0].replace("• ", ""));
    let y = [];
    const v = a.matchAll(/•\s*WARN:[^\n]+/g);
    for (const A of v)
      y.push(A[0].replace("• ", ""));
    const l = S(c, y);
    return c = l.errors, y = l.warnings, {
      success: !0,
      isValid: c.length === 0,
      chains: u ? parseInt(u[1]) : 0,
      glyphs: p ? parseInt(p[1]) : 0,
      errors: c,
      warnings: y,
      output: a
    };
  } catch (n) {
    const r = (n.stdout || "") + (n.stderr || "");
    let a = [];
    const i = r.matchAll(/•\s*ERR:[^\n]+/g);
    for (const y of i)
      a.push(y[0].replace("• ", ""));
    let u = [];
    const p = r.matchAll(/•\s*WARN:[^\n]+/g);
    for (const y of p)
      u.push(y[0].replace("• ", ""));
    const c = S(a, u);
    a = c.errors, u = c.warnings;
    const g = a.length === 0;
    return (t = n.message) != null && t.includes("not found") || (s = n.message) != null && s.includes("ENOENT") ? {
      success: !1,
      error: "arc command not found. Make sure it's installed and in PATH."
    } : {
      success: !0,
      isValid: g,
      errors: a,
      warnings: u,
      output: r
    };
  }
});
m.whenReady().then(R);
m.on("window-all-closed", () => {
  process.platform !== "darwin" && m.quit();
});
m.on("activate", () => {
  j.getAllWindows().length === 0 && R();
});
