import { app as g, ipcMain as d, dialog as N, shell as D, BrowserWindow as j } from "electron";
import f from "path";
import E from "os";
import { fileURLToPath as T } from "url";
import { exec as $ } from "child_process";
import { promisify as M } from "util";
import O from "node-pty";
import F from "fs";
import S from "chokidar";
import x from "fs/promises";
class H {
  constructor(e) {
    this.mainWindow = e, this.terminals = /* @__PURE__ */ new Map(), this.nextId = 1;
  }
  /**
   * Determine the shell to use based on OS and availability
   * @returns {string} - Shell executable path
   */
  getShell() {
    if (process.env.SHELL && F.existsSync(process.env.SHELL))
      return process.env.SHELL;
    const e = E.platform();
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
      if (F.existsSync(t))
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
    const s = this.getShell();
    let t = e.cwd || E.homedir();
    const n = e.cols || 80, r = e.rows || 24, a = E.platform(), i = E.homedir();
    F.existsSync(t) || (console.warn(`[PTY] Requested directory doesn't exist: ${t}, falling back to home`), t = i), console.log(`[PTY] Spawning shell: ${s}`), console.log(`[PTY] Working directory: ${t}`), console.log(`[PTY] Platform: ${a}`);
    const c = [
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
    ], u = process.env.PATH || "", l = /* @__PURE__ */ new Set([...c, ...u.split(":")]), p = Array.from(l).filter((w) => w).join(":"), h = {
      ...process.env,
      ...e.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      PATH: p,
      HOME: i,
      SHELL: s,
      // Ensure locale is set for proper character handling
      LANG: process.env.LANG || "en_US.UTF-8",
      LC_ALL: process.env.LC_ALL || "en_US.UTF-8"
    }, m = [];
    (s.includes("zsh") || s.includes("bash")) && m.push("-l", "-i"), console.log(`[PTY] Shell args: ${JSON.stringify(m)}`), console.log(`[PTY] PATH includes ~/.local/bin: ${p.includes(".local/bin")}`);
    try {
      const w = O.spawn(s, m, {
        name: "xterm-256color",
        cols: n,
        rows: r,
        cwd: t,
        env: h,
        useConpty: !1
        // Disable ConPTY on Windows, doesn't affect macOS/Linux
      }), P = this.nextId++;
      return this.terminals.set(P, w), w.onData((b) => {
        this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("pty:data", { id: P, data: b });
      }), w.onExit(({ exitCode: b, signal: L }) => {
        this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("pty:exit", { id: P, exitCode: b, signal: L }), this.terminals.delete(P);
      }), { id: P, pid: w.pid };
    } catch (w) {
      throw console.error(`Failed to spawn PTY with shell ${s}:`, w), new Error(`PTY spawn failed: ${w.message}`);
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
    const s = f.join(e, "archeon");
    let t = !1;
    try {
      await x.access(s), t = !0;
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
    return t && (n = await this.readIndexFile(e), r = await this.readArconFile(e)), this.rootWatcher = S.watch(e, {
      persistent: !0,
      ignoreInitial: !0,
      depth: 0
      // Only watch immediate children
    }), this.rootWatcher.on("addDir", async (a) => {
      f.basename(a) === "archeon" && await this.startArcheonWatcher(e);
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
    const s = f.join(e, "archeon");
    this.watcher && await this.watcher.close(), this.watcher = S.watch(s, {
      persistent: !0,
      ignoreInitial: !1,
      // Process existing files on start
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    }), this.watcher.on("change", async (t) => {
      const n = f.basename(t);
      if (n === "ARCHEON.index.json") {
        const r = await this.readIndexFile(e);
        r.success && this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("archeon:index-changed", r);
      } else if (n === "ARCHEON.arcon") {
        const r = await this.readArconFile(e);
        r.success && this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("archeon:arcon-changed", r);
      }
    }), this.watcher.on("add", async (t) => {
      const n = f.basename(t);
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
    const s = f.join(e, "archeon", "ARCHEON.index.json");
    try {
      const t = await x.readFile(s, "utf-8");
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
    const s = f.join(e, "archeon", "ARCHEON.arcon");
    try {
      const t = await x.readFile(s, "utf-8"), n = this.parseArconChains(t);
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
      const i = r.trim().match(/^#\s*(\w+:\S+?)\s*:\s*(.+)$/);
      if (i) {
        const c = i[1], u = i[2].trim();
        n.set(c, u);
      }
    }
    for (const r of t) {
      const a = r.trim();
      if (!a || a.startsWith("#")) continue;
      const i = a.match(/^@([\w-]+)\s+(.+)$/);
      if (i) {
        const c = i[1], u = i[2], l = this.parseChainGlyphs(u);
        for (const p of l) {
          const h = n.get(p.key);
          h && (p.intent = h);
        }
        s.push({
          version: c,
          raw: a,
          glyphs: l
        });
        continue;
      }
      if (a.includes("::")) {
        const c = this.parseContainmentGlyphs(a);
        for (const u of c) {
          const l = n.get(u.key);
          l && (u.intent = l);
        }
        s.push({
          type: "orchestrator",
          raw: a,
          glyphs: c
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
    const t = f.join(e, "archeon", "ARCHEON.arcon");
    try {
      const n = f.join(e, "archeon");
      try {
        await x.access(n);
      } catch {
        await x.mkdir(n, { recursive: !0 });
      }
      return await x.writeFile(t, s, "utf-8"), { success: !0, path: t };
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
const W = M($), k = f.dirname(T(import.meta.url));
console.log("=== Electron Environment ===");
console.log("__dirname:", k);
console.log("app.isPackaged:", g.isPackaged);
console.log("process.resourcesPath:", process.resourcesPath);
console.log("app.getAppPath():", g.getAppPath());
console.log("===========================");
let y = null, A = null, v = null;
process.platform === "darwin" && (g.commandLine.appendSwitch("enable-gpu-rasterization"), g.commandLine.appendSwitch("enable-zero-copy"), g.commandLine.appendSwitch("ignore-gpu-blocklist"), g.commandLine.appendSwitch("disable-software-rasterizer"));
g.commandLine.appendSwitch("js-flags", "--max-old-space-size=2048");
g.commandLine.appendSwitch("disable-renderer-backgrounding");
function R() {
  if (y = new j({
    width: 1600,
    height: 1e3,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: f.join(k, "preload.js"),
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
  }), A = new H(y), v = new I(y), y.once("ready-to-show", () => {
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
    const o = g.isPackaged ? f.join(g.getAppPath(), "dist/index.html") : f.join(k, "../dist/index.html");
    console.log("Loading index.html from:", o), y.loadFile(o).then(() => {
      console.log("index.html loaded successfully");
    }).catch((e) => {
      console.error("Failed to load index.html:", e), console.error("Attempted path:", o), y.show();
    });
  }
  y.on("closed", () => {
    y = null, A && A.killAll(), v && v.stop();
  });
}
d.handle("dialog:openProject", async () => {
  const o = await N.showOpenDialog(y, {
    properties: ["openDirectory"],
    title: "Select Archeon Project"
  });
  if (o.canceled || o.filePaths.length === 0)
    return { canceled: !0, path: null };
  const e = o.filePaths[0], s = f.join(e, "archeon"), t = await import("fs/promises");
  try {
    return await t.access(s), { canceled: !1, path: e, valid: !0 };
  } catch {
    return { canceled: !1, path: e, valid: !1 };
  }
});
d.handle("pty:spawn", (o, e = {}) => A.spawn(e));
d.on("pty:write", (o, { id: e, data: s }) => {
  A.write(e, s);
});
d.on("pty:resize", (o, { id: e, cols: s, rows: t }) => {
  A.resize(e, s, t);
});
d.on("pty:kill", (o, { id: e }) => {
  A.kill(e);
});
d.handle("archeon:watch", (o, e) => v.watch(e));
d.handle("archeon:stop", () => (v.stop(), !0));
d.handle("archeon:readIndex", async (o, e) => v.readIndexFile(e));
d.handle("archeon:readArcon", async (o, e) => v.readArconFile(e));
d.handle("archeon:writeArcon", async (o, e, s) => v.writeArconFile(e, s));
d.handle("rules:copyTemplates", async (o, { files: e, targetDir: s }) => {
  const t = await import("fs/promises"), r = process.env.VITE_DEV_SERVER_URL ? f.join(k, "..", "rules_templates") : f.join(process.resourcesPath, "rules_templates"), a = { created: [], failed: [] };
  for (const i of e) {
    const c = f.join(r, i), u = f.join(s, i);
    try {
      const l = await t.readFile(c, "utf-8");
      await t.mkdir(f.dirname(u), { recursive: !0 }), await t.writeFile(u, l, "utf-8"), a.created.push(i);
    } catch (l) {
      a.failed.push({ file: i, error: l.message });
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
    const { stdout: t, stderr: n } = await W(e, {
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
    const t = f.join(e, s);
    try {
      return await W(`code "${t}"`), { success: !0 };
    } catch {
      return await D.openPath(t), { success: !0 };
    }
  } catch (t) {
    return { success: !1, error: t.message };
  }
});
d.handle("archeon:getShapes", async () => {
  const o = E.homedir(), e = await import("fs/promises"), s = await import("path");
  let t = null;
  try {
    const n = [
      // Development/editable install (pipx install -e or pip install -e)
      s.join(o, "dev/archeon/archeon/architectures"),
      // Standard pipx install on Linux/Mac - need to find python version
      // We'll handle this one specially below
      null
    ];
    if (n[0])
      try {
        await e.access(n[0]), t = n[0], console.log(
          "[getShapes] Found architectures in dev install:",
          t
        );
      } catch {
      }
    if (!t) {
      const c = `${o}/.local/pipx/venvs/archeon/lib`;
      try {
        const l = (await e.readdir(c)).find((p) => p.startsWith("python"));
        if (l) {
          const p = s.join(
            c,
            l,
            "site-packages/archeon/architectures"
          );
          await e.access(p), t = p, console.log(
            "[getShapes] Found architectures in pipx install:",
            t
          );
        }
      } catch {
      }
    }
    if (!t)
      throw new Error(
        "Could not find archeon architectures directory. Please ensure archeon is installed via pipx."
      );
    const a = (await e.readdir(t)).filter((c) => c.endsWith(".shape.json")), i = [];
    for (const c of a) {
      const u = s.join(t, c), l = await e.readFile(u, "utf-8"), p = JSON.parse(l), h = c.replace(".shape.json", ""), m = {
        id: h,
        name: p.name || h.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" + "),
        description: p.description || `${h} architecture template`,
        icon: "📦",
        tags: p.tags || []
      };
      m.tags.length === 0 && (h.includes("vue") && m.tags.push("Vue 3"), h.includes("react") && m.tags.push("React"), (h.includes("nextjs") || h.includes("next")) && m.tags.push("Next.js"), h.includes("fastapi") && m.tags.push("FastAPI", "Python"), h.includes("express") && m.tags.push("Express", "Node.js"), h.includes("capacitor") && m.tags.push("Capacitor", "Mobile")), i.push(m);
    }
    return { success: !0, shapes: i, path: t };
  } catch (n) {
    return console.error("[getShapes] Error:", n.message), { success: !1, error: n.message, shapes: [] };
  }
});
d.handle("shell:checkCommand", async (o, e) => {
  try {
    const s = E.homedir(), t = [
      `${s}/.local/bin`,
      "/opt/homebrew/bin",
      "/usr/local/bin",
      process.env.PATH
    ].join(":"), n = e.replace(/^~/, s).replace(/\s~\//g, ` ${s}/`);
    console.log(`[checkCommand] Original: ${e}`), console.log(`[checkCommand] Expanded: ${n}`);
    const { stdout: r } = await W(n, {
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
        const i = t.join(n, "package.json");
        try {
          return await s.access(i), { success: !0, path: n, hasPackageJson: !0 };
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
    const n = t.join(e, "package.json"), r = await s.readFile(n, "utf-8"), a = JSON.parse(r), i = a.scripts || {};
    let c = null, u = null;
    const l = ["dev", "start", "serve", "develop", "run"];
    for (const p of l)
      if (i[p]) {
        c = p, u = i[p];
        break;
      }
    return {
      success: !0,
      name: a.name,
      scripts: i,
      devScript: c,
      devCommand: u
    };
  } catch (n) {
    return { success: !1, error: n.message };
  }
});
function C(o, e) {
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
    const { stdout: n, stderr: r } = await W("arc validate", {
      cwd: e,
      timeout: 3e4
      // 30 second timeout
    }), a = n + r, i = a.includes("Validation passed") || a.includes("✓"), c = a.match(/Chains:\s*(\d+)/), u = a.match(/Glyphs:\s*(\d+)/);
    let l = [];
    const p = a.matchAll(/•\s*ERR:[^\n]+/g);
    for (const b of p)
      l.push(b[0].replace("• ", ""));
    let h = [];
    const m = a.matchAll(/•\s*WARN:[^\n]+/g);
    for (const b of m)
      h.push(b[0].replace("• ", ""));
    const w = C(l, h);
    return l = w.errors, h = w.warnings, {
      success: !0,
      isValid: l.length === 0,
      chains: c ? parseInt(c[1]) : 0,
      glyphs: u ? parseInt(u[1]) : 0,
      errors: l,
      warnings: h,
      output: a
    };
  } catch (n) {
    const r = (n.stdout || "") + (n.stderr || "");
    let a = [];
    const i = r.matchAll(/•\s*ERR:[^\n]+/g);
    for (const h of i)
      a.push(h[0].replace("• ", ""));
    let c = [];
    const u = r.matchAll(/•\s*WARN:[^\n]+/g);
    for (const h of u)
      c.push(h[0].replace("• ", ""));
    const l = C(a, c);
    a = l.errors, c = l.warnings;
    const p = a.length === 0;
    return (s = n.message) != null && s.includes("not found") || (t = n.message) != null && t.includes("ENOENT") ? {
      success: !1,
      error: "arc command not found. Make sure it's installed and in PATH."
    } : {
      success: !0,
      isValid: p,
      errors: a,
      warnings: c,
      output: r
    };
  }
});
g.whenReady().then(R);
g.on("window-all-closed", () => {
  process.platform !== "darwin" && g.quit();
});
g.on("activate", () => {
  j.getAllWindows().length === 0 && R();
});
