import { app as g, ipcMain as d, dialog as N, shell as D, BrowserWindow as j } from "electron";
import p from "path";
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
    const s = [
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
    for (const t of s)
      if (C.existsSync(t))
        return t;
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
    const s = this.getShell(), t = e.cwd || x.homedir(), n = e.cols || 80, r = e.rows || 24, a = x.platform(), c = x.homedir();
    console.log(`[PTY] Spawning shell: ${s}`), console.log(`[PTY] Working directory: ${t}`), console.log(`[PTY] Platform: ${a}`);
    const l = [
      `${c}/.local/bin`,
      // pipx installs here
      `${c}/.cargo/bin`,
      // Rust binaries
      `${c}/.pyenv/shims`,
      // pyenv
      `${c}/.nvm/versions/node`,
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
    ], u = process.env.PATH || "", i = /* @__PURE__ */ new Set([...l, ...u.split(":")]), f = Array.from(i).filter((h) => h).join(":"), m = {
      ...process.env,
      ...e.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      PATH: f,
      HOME: c,
      SHELL: s,
      // Ensure locale is set for proper character handling
      LANG: process.env.LANG || "en_US.UTF-8",
      LC_ALL: process.env.LC_ALL || "en_US.UTF-8"
    }, v = [];
    (s.includes("zsh") || s.includes("bash")) && v.push("-l", "-i"), console.log(`[PTY] Shell args: ${JSON.stringify(v)}`), console.log(`[PTY] PATH includes ~/.local/bin: ${f.includes(".local/bin")}`);
    try {
      const h = O.spawn(s, v, {
        name: "xterm-256color",
        cols: n,
        rows: r,
        cwd: t,
        env: m,
        useConpty: !1
        // Disable ConPTY on Windows, doesn't affect macOS/Linux
      }), w = this.nextId++;
      return this.terminals.set(w, h), h.onData((b) => {
        this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("pty:data", { id: w, data: b });
      }), h.onExit(({ exitCode: b, signal: R }) => {
        this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("pty:exit", { id: w, exitCode: b, signal: R }), this.terminals.delete(w);
      }), { id: w, pid: h.pid };
    } catch (h) {
      throw console.error(`Failed to spawn PTY with shell ${s}:`, h), new Error(`PTY spawn failed: ${h.message}`);
    }
  }
  /**
   * Write data to a PTY
   * @param {number} id - Terminal ID
   * @param {string} data - Data to write
   */
  write(e, s) {
    const t = this.terminals.get(e);
    t && t.write(s);
  }
  /**
   * Resize a PTY
   * @param {number} id - Terminal ID
   * @param {number} cols - New columns
   * @param {number} rows - New rows
   */
  resize(e, s, t) {
    const n = this.terminals.get(e);
    if (n && s > 0 && t > 0)
      try {
        n.resize(s, t);
      } catch (r) {
        console.warn("PTY resize failed:", r.message);
      }
  }
  /**
   * Kill a PTY
   * @param {number} id - Terminal ID
   */
  kill(e) {
    const s = this.terminals.get(e);
    s && (s.kill(), this.terminals.delete(e));
  }
  /**
   * Kill all PTYs
   */
  killAll() {
    for (const [e, s] of this.terminals)
      s.kill();
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
    const s = p.join(e, "archeon");
    let t = !1;
    try {
      await E.access(s), t = !0;
    } catch {
      t = !1;
    }
    let n = {
      success: !1,
      error: "archeon/ directory not found"
    }, r = {
      success: !1,
      error: "archeon/ directory not found"
    };
    return t && (n = await this.readIndexFile(e), r = await this.readArconFile(e)), this.rootWatcher = F.watch(e, {
      persistent: !0,
      ignoreInitial: !0,
      depth: 0
      // Only watch immediate children
    }), this.rootWatcher.on("addDir", async (a) => {
      p.basename(a) === "archeon" && await this.startArcheonWatcher(e);
    }), t && await this.startArcheonWatcher(e), {
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
    const s = p.join(e, "archeon");
    this.watcher && await this.watcher.close(), this.watcher = F.watch(s, {
      persistent: !0,
      ignoreInitial: !1,
      // Process existing files on start
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    }), this.watcher.on("change", async (t) => {
      const n = p.basename(t);
      if (n === "ARCHEON.index.json") {
        const r = await this.readIndexFile(e);
        r.success && this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("archeon:index-changed", r);
      } else if (n === "ARCHEON.arcon") {
        const r = await this.readArconFile(e);
        r.success && this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("archeon:arcon-changed", r);
      }
    }), this.watcher.on("add", async (t) => {
      const n = p.basename(t);
      if (n === "ARCHEON.index.json") {
        const r = await this.readIndexFile(e);
        r.success && this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("archeon:index-changed", r);
      } else if (n === "ARCHEON.arcon") {
        const r = await this.readArconFile(e);
        r.success && this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("archeon:arcon-changed", r);
      }
    }), this.watcher.on("error", (t) => {
      console.error("Archeon watcher error:", t);
    });
  }
  /**
   * Read and parse ARCHEON.index.json
   * @param {string} projectPath - Root path of the project
   * @returns {Object} - { success, data?, error? }
   */
  async readIndexFile(e) {
    const s = p.join(e, "archeon", "ARCHEON.index.json");
    try {
      const t = await E.readFile(s, "utf-8");
      return { success: !0, data: JSON.parse(t), path: s };
    } catch (t) {
      return t.code === "ENOENT" ? { success: !1, error: "ARCHEON.index.json not found" } : { success: !1, error: t.message };
    }
  }
  /**
   * Read ARCHEON.arcon file
   * @param {string} projectPath - Root path of the project
   * @returns {Object} - { success, content?, chains?, error? }
   */
  async readArconFile(e) {
    const s = p.join(e, "archeon", "ARCHEON.arcon");
    try {
      const t = await E.readFile(s, "utf-8"), n = this.parseArconChains(t);
      return { success: !0, content: t, chains: n, path: s };
    } catch (t) {
      return t.code === "ENOENT" ? { success: !1, error: "ARCHEON.arcon not found" } : { success: !1, error: t.message };
    }
  }
  /**
   * Parse chain definitions from .arcon content
   * @param {string} content - Raw .arcon file content
   * @returns {Array} - Array of parsed chains
   */
  parseArconChains(e) {
    const s = [], t = e.split(`
`), n = /* @__PURE__ */ new Map();
    for (const r of t) {
      const c = r.trim().match(/^#\s*(\w+:\S+?)\s*:\s*(.+)$/);
      if (c) {
        const l = c[1], u = c[2].trim();
        n.set(l, u);
      }
    }
    for (const r of t) {
      const a = r.trim();
      if (!a || a.startsWith("#")) continue;
      const c = a.match(/^@(\w+)\s+(.+)$/);
      if (c) {
        const l = c[1], u = c[2], i = this.parseChainGlyphs(u);
        for (const f of i) {
          const m = n.get(f.key);
          m && (f.intent = m);
        }
        s.push({
          version: l,
          raw: a,
          glyphs: i
        });
        continue;
      }
      if (a.includes("::")) {
        const l = this.parseContainmentGlyphs(a);
        for (const u of l) {
          const i = n.get(u.key);
          i && (u.intent = i);
        }
        s.push({
          type: "orchestrator",
          raw: a,
          glyphs: l
        });
      }
    }
    return s;
  }
  /**
   * Parse glyphs from a chain definition (using => edges)
   * @param {string} chainDef - Chain definition string
   * @returns {Array} - Array of glyph objects
   */
  parseChainGlyphs(e) {
    const s = [], t = e.split(/\s*(?:=>|~>|->)\s*/);
    for (const n of t) {
      const r = n.trim();
      if (!r) continue;
      const a = r.match(/^(\w+):(.+)$/);
      a && s.push({
        type: a[1],
        name: a[2],
        key: r
      });
    }
    return s;
  }
  /**
   * Parse glyphs from containment definition (using :: edges)
   * @param {string} def - Definition string
   * @returns {Array} - Array of glyph objects
   */
  parseContainmentGlyphs(e) {
    const s = [], t = e.split(/\s*::\s*/);
    for (const n of t) {
      const r = n.trim();
      if (!r) continue;
      const a = r.match(/^(\w+):(.+)$/);
      a && s.push({
        type: a[1],
        name: a[2],
        key: r
      });
    }
    return s;
  }
  /**
   * Write content to ARCHEON.arcon file
   * @param {string} projectPath - Root path of the project
   * @param {string} content - Content to write to the file
   * @returns {Object} - { success, error? }
   */
  async writeArconFile(e, s) {
    const t = p.join(e, "archeon", "ARCHEON.arcon");
    try {
      const n = p.join(e, "archeon");
      try {
        await E.access(n);
      } catch {
        await E.mkdir(n, { recursive: !0 });
      }
      return await E.writeFile(t, s, "utf-8"), { success: !0, path: t };
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
const k = M($), W = p.dirname(T(import.meta.url));
console.log("=== Electron Environment ===");
console.log("__dirname:", W);
console.log("app.isPackaged:", g.isPackaged);
console.log("process.resourcesPath:", process.resourcesPath);
console.log("app.getAppPath():", g.getAppPath());
console.log("===========================");
let y = null, P = null, A = null;
process.platform === "darwin" && (g.commandLine.appendSwitch("enable-gpu-rasterization"), g.commandLine.appendSwitch("enable-zero-copy"), g.commandLine.appendSwitch("ignore-gpu-blocklist"), g.commandLine.appendSwitch("disable-software-rasterizer"));
g.commandLine.appendSwitch("js-flags", "--max-old-space-size=2048");
g.commandLine.appendSwitch("disable-renderer-backgrounding");
function L() {
  if (y = new j({
    width: 1600,
    height: 1e3,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: p.join(W, "preload.js"),
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
  }), P = new H(y), A = new I(y), y.once("ready-to-show", () => {
    console.log("Window ready-to-show event fired"), y.show();
  }), setTimeout(() => {
    y.isVisible() || (console.log("Fallback: Showing window after timeout"), y.show());
  }, 3e3), process.env.VITE_DEV_SERVER_URL) {
    const o = async (e = 5) => {
      try {
        await y.loadURL(process.env.VITE_DEV_SERVER_URL), console.log("Dev server loaded successfully");
      } catch (s) {
        if (e > 0)
          return console.log(
            `Waiting for Vite dev server... (${e} retries left)`
          ), await new Promise((t) => setTimeout(t, 1e3)), o(e - 1);
        console.error("Failed to load Vite dev server:", s);
      }
    };
    o();
  } else {
    const o = g.isPackaged ? p.join(g.getAppPath(), "dist/index.html") : p.join(W, "../dist/index.html");
    console.log("Loading index.html from:", o), y.loadFile(o).then(() => {
      console.log("index.html loaded successfully");
    }).catch((e) => {
      console.error("Failed to load index.html:", e), console.error("Attempted path:", o), y.show();
    });
  }
  y.on("closed", () => {
    y = null, P && P.killAll(), A && A.stop();
  });
}
d.handle("dialog:openProject", async () => {
  const o = await N.showOpenDialog(y, {
    properties: ["openDirectory"],
    title: "Select Archeon Project"
  });
  if (o.canceled || o.filePaths.length === 0)
    return { canceled: !0, path: null };
  const e = o.filePaths[0], s = p.join(e, "archeon"), t = await import("fs/promises");
  try {
    return await t.access(s), { canceled: !1, path: e, valid: !0 };
  } catch {
    return { canceled: !1, path: e, valid: !1 };
  }
});
d.handle("pty:spawn", (o, e = {}) => P.spawn(e));
d.on("pty:write", (o, { id: e, data: s }) => {
  P.write(e, s);
});
d.on("pty:resize", (o, { id: e, cols: s, rows: t }) => {
  P.resize(e, s, t);
});
d.on("pty:kill", (o, { id: e }) => {
  P.kill(e);
});
d.handle("archeon:watch", (o, e) => A.watch(e));
d.handle("archeon:stop", () => (A.stop(), !0));
d.handle("archeon:readIndex", async (o, e) => A.readIndexFile(e));
d.handle("archeon:readArcon", async (o, e) => A.readArconFile(e));
d.handle("archeon:writeArcon", async (o, e, s) => A.writeArconFile(e, s));
d.handle("rules:copyTemplates", async (o, { files: e, targetDir: s }) => {
  const t = await import("fs/promises"), r = process.env.VITE_DEV_SERVER_URL ? p.join(W, "..", "rules_templates") : p.join(process.resourcesPath, "rules_templates"), a = { created: [], failed: [] };
  for (const c of e) {
    const l = p.join(r, c), u = p.join(s, c);
    try {
      const i = await t.readFile(l, "utf-8");
      await t.mkdir(p.dirname(u), { recursive: !0 }), await t.writeFile(u, i, "utf-8"), a.created.push(c);
    } catch (i) {
      a.failed.push({ file: c, error: i.message });
    }
  }
  return a;
});
d.handle("fs:readFile", async (o, e) => {
  const s = await import("fs/promises");
  try {
    return { success: !0, content: await s.readFile(e, "utf-8") };
  } catch (t) {
    return { success: !1, error: t.message };
  }
});
d.handle("fs:writeFile", async (o, e, s) => {
  const t = await import("fs/promises"), n = await import("path");
  try {
    const r = n.dirname(e);
    return await t.mkdir(r, { recursive: !0 }), await t.writeFile(e, s, "utf-8"), { success: !0 };
  } catch (r) {
    return { success: !1, error: r.message };
  }
});
d.handle("shell:exec", async (o, e, s = {}) => {
  try {
    const { stdout: t, stderr: n } = await k(e, {
      timeout: 6e4,
      ...s
    });
    return { success: !0, stdout: t, stderr: n };
  } catch (t) {
    return {
      success: !1,
      error: t.message,
      stdout: t.stdout || "",
      stderr: t.stderr || ""
    };
  }
});
d.handle("shell:openExternal", async (o, e) => {
  try {
    return await D.openExternal(e), { success: !0 };
  } catch (s) {
    return { success: !1, error: s.message };
  }
});
d.handle("shell:openFile", async (o, e, s) => {
  try {
    const t = p.join(e, s);
    try {
      return await k(`code "${t}"`), { success: !0 };
    } catch {
      return await D.openPath(t), { success: !0 };
    }
  } catch (t) {
    return { success: !1, error: t.message };
  }
});
d.handle("archeon:getShapes", async () => {
  const o = x.homedir(), e = await import("fs/promises"), s = await import("path"), t = `${o}/.local/pipx/venvs/archeon/lib`;
  try {
    const r = (await e.readdir(t)).find((i) => i.startsWith("python"));
    if (!r)
      throw new Error("Could not find Python directory in pipx venv");
    const a = s.join(
      t,
      r,
      "site-packages/archeon/architectures"
    ), l = (await e.readdir(a)).filter((i) => i.endsWith(".shape.json")), u = [];
    for (const i of l) {
      const f = s.join(a, i), m = await e.readFile(f, "utf-8"), v = JSON.parse(m), h = i.replace(".shape.json", ""), w = {
        id: h,
        name: v.name || h.split("-").map((b) => b.charAt(0).toUpperCase() + b.slice(1)).join(" + "),
        description: v.description || `${h} architecture template`,
        icon: "📦",
        tags: v.tags || []
      };
      w.tags.length === 0 && (h.includes("vue") && w.tags.push("Vue 3"), h.includes("react") && w.tags.push("React"), (h.includes("nextjs") || h.includes("next")) && w.tags.push("Next.js"), h.includes("fastapi") && w.tags.push("FastAPI", "Python"), h.includes("express") && w.tags.push("Express", "Node.js"), h.includes("capacitor") && w.tags.push("Capacitor", "Mobile")), u.push(w);
    }
    return { success: !0, shapes: u, path: a };
  } catch (n) {
    return console.error("[getShapes] Error:", n.message), { success: !1, error: n.message, shapes: [] };
  }
});
d.handle("shell:checkCommand", async (o, e) => {
  try {
    const s = x.homedir(), t = [
      `${s}/.local/bin`,
      "/opt/homebrew/bin",
      "/usr/local/bin",
      process.env.PATH
    ].join(":"), n = e.replace(/^~/, s).replace(/\s~\//g, ` ${s}/`);
    console.log(`[checkCommand] Original: ${e}`), console.log(`[checkCommand] Expanded: ${n}`);
    const { stdout: r } = await k(n, {
      timeout: 5e3,
      env: { ...process.env, PATH: t }
    });
    return console.log(`[checkCommand] Success: ${r.trim()}`), { success: !0, output: r.trim() };
  } catch (s) {
    return console.log(`[checkCommand] Failed: ${s.message}`), { success: !1, error: s.message };
  }
});
d.handle("fs:checkDirExists", async (o, e) => {
  try {
    return (await (await import("fs/promises")).stat(e)).isDirectory();
  } catch {
    return !1;
  }
});
d.handle("fs:fileExists", async (o, e) => {
  try {
    return (await (await import("fs/promises")).stat(e)).isFile();
  } catch {
    return !1;
  }
});
d.handle("fs:findClientDir", async (o, e) => {
  const s = await import("fs/promises"), t = await import("path");
  try {
    const n = t.join(e, "client");
    try {
      if ((await s.stat(n)).isDirectory()) {
        const c = t.join(n, "package.json");
        try {
          return await s.access(c), { success: !0, path: n, hasPackageJson: !0 };
        } catch {
          return { success: !0, path: n, hasPackageJson: !1 };
        }
      }
    } catch {
    }
    const r = t.join(e, "package.json");
    try {
      return await s.access(r), { success: !0, path: e, hasPackageJson: !0 };
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
d.handle("fs:readPackageJson", async (o, e) => {
  const s = await import("fs/promises"), t = await import("path");
  try {
    const n = t.join(e, "package.json"), r = await s.readFile(n, "utf-8"), a = JSON.parse(r), c = a.scripts || {};
    let l = null, u = null;
    const i = ["dev", "start", "serve", "develop", "run"];
    for (const f of i)
      if (c[f]) {
        l = f, u = c[f];
        break;
      }
    return {
      success: !0,
      name: a.name,
      scripts: c,
      devScript: l,
      devCommand: u
    };
  } catch (n) {
    return { success: !1, error: n.message };
  }
});
function S(o, e) {
  const s = [
    "boundary.vDataFlow"
    // Views in data flow are allowed
  ], t = [
    "chain.noOutput",
    // Chains don't need to end with OUT: or ERR:
    "api.noErrorPath"
    // APIs don't need explicit error paths
  ];
  return {
    errors: o.filter(
      (r) => !s.some((a) => r.includes(a))
    ),
    warnings: e.filter(
      (r) => !t.some((a) => r.includes(a))
    )
  };
}
d.handle("archeon:validate", async (o, e) => {
  var s, t;
  if (!e)
    return { success: !1, error: "No project path provided" };
  try {
    const { stdout: n, stderr: r } = await k("arc validate", {
      cwd: e,
      timeout: 3e4
      // 30 second timeout
    }), a = n + r, c = a.includes("Validation passed") || a.includes("✓"), l = a.match(/Chains:\s*(\d+)/), u = a.match(/Glyphs:\s*(\d+)/);
    let i = [];
    const f = a.matchAll(/•\s*ERR:[^\n]+/g);
    for (const b of f)
      i.push(b[0].replace("• ", ""));
    let m = [];
    const v = a.matchAll(/•\s*WARN:[^\n]+/g);
    for (const b of v)
      m.push(b[0].replace("• ", ""));
    const h = S(i, m);
    return i = h.errors, m = h.warnings, {
      success: !0,
      isValid: i.length === 0,
      chains: l ? parseInt(l[1]) : 0,
      glyphs: u ? parseInt(u[1]) : 0,
      errors: i,
      warnings: m,
      output: a
    };
  } catch (n) {
    const r = (n.stdout || "") + (n.stderr || "");
    let a = [];
    const c = r.matchAll(/•\s*ERR:[^\n]+/g);
    for (const m of c)
      a.push(m[0].replace("• ", ""));
    let l = [];
    const u = r.matchAll(/•\s*WARN:[^\n]+/g);
    for (const m of u)
      l.push(m[0].replace("• ", ""));
    const i = S(a, l);
    a = i.errors, l = i.warnings;
    const f = a.length === 0;
    return (s = n.message) != null && s.includes("not found") || (t = n.message) != null && t.includes("ENOENT") ? {
      success: !1,
      error: "arc command not found. Make sure it's installed and in PATH."
    } : {
      success: !0,
      isValid: f,
      errors: a,
      warnings: l,
      output: r
    };
  }
});
g.whenReady().then(L);
g.on("window-all-closed", () => {
  process.platform !== "darwin" && g.quit();
});
g.on("activate", () => {
  j.getAllWindows().length === 0 && L();
});
