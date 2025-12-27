import { app as w, ipcMain as p, dialog as T, shell as L, BrowserWindow as F } from "electron";
import d from "path";
import A from "os";
import { fileURLToPath as R } from "url";
import { exec as N } from "child_process";
import { promisify as H } from "util";
import $ from "node-pty";
import W from "fs";
import j from "chokidar";
import x from "fs/promises";
class I {
  constructor(e) {
    this.mainWindow = e, this.terminals = /* @__PURE__ */ new Map(), this.nextId = 1;
  }
  /**
   * Determine the shell to use based on OS and availability
   * @returns {string} - Shell executable path
   */
  getShell() {
    if (process.env.SHELL && W.existsSync(process.env.SHELL))
      return process.env.SHELL;
    const e = A.platform();
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
      if (W.existsSync(s))
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
    const t = this.getShell(), s = e.cwd || A.homedir(), n = e.cols || 80, a = e.rows || 24, i = A.platform(), l = A.homedir();
    console.log(`[PTY] Spawning shell: ${t}`), console.log(`[PTY] Working directory: ${s}`), console.log(`[PTY] Platform: ${i}`);
    const c = [
      `${l}/.local/bin`,
      // pipx installs here
      `${l}/.cargo/bin`,
      // Rust binaries
      `${l}/.pyenv/shims`,
      // pyenv
      `${l}/.nvm/versions/node`,
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
    ], h = process.env.PATH || "", o = /* @__PURE__ */ new Set([...c, ...h.split(":")]), f = Array.from(o).filter((m) => m).join(":"), g = {
      ...process.env,
      ...e.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      PATH: f,
      HOME: l,
      SHELL: t,
      // Ensure locale is set for proper character handling
      LANG: process.env.LANG || "en_US.UTF-8",
      LC_ALL: process.env.LC_ALL || "en_US.UTF-8"
    }, u = [];
    (t.includes("zsh") || t.includes("bash")) && u.push("-l", "-i"), console.log(`[PTY] Shell args: ${JSON.stringify(u)}`), console.log(`[PTY] PATH includes ~/.local/bin: ${f.includes(".local/bin")}`);
    try {
      const m = $.spawn(t, u, {
        name: "xterm-256color",
        cols: n,
        rows: a,
        cwd: s,
        env: g,
        useConpty: !1
        // Disable ConPTY on Windows, doesn't affect macOS/Linux
      }), v = this.nextId++;
      return this.terminals.set(v, m), m.onData((S) => {
        this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("pty:data", { id: v, data: S });
      }), m.onExit(({ exitCode: S, signal: D }) => {
        this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("pty:exit", { id: v, exitCode: S, signal: D }), this.terminals.delete(v);
      }), { id: v, pid: m.pid };
    } catch (m) {
      throw console.error(`Failed to spawn PTY with shell ${t}:`, m), new Error(`PTY spawn failed: ${m.message}`);
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
      } catch (a) {
        console.warn("PTY resize failed:", a.message);
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
class M {
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
      await x.access(t), s = !0;
    } catch {
      s = !1;
    }
    let n = {
      success: !1,
      error: "archeon/ directory not found"
    }, a = {
      success: !1,
      error: "archeon/ directory not found"
    };
    return s && (n = await this.readIndexFile(e), a = await this.readArconFile(e)), this.rootWatcher = j.watch(e, {
      persistent: !0,
      ignoreInitial: !0,
      depth: 0
      // Only watch immediate children
    }), this.rootWatcher.on("addDir", async (i) => {
      d.basename(i) === "archeon" && await this.startArcheonWatcher(e);
    }), s && await this.startArcheonWatcher(e), {
      success: !0,
      initialIndex: n,
      initialArcon: a
    };
  }
  /**
   * Start watching the archeon directory for file changes
   * @param {string} projectPath - Root path of the project
   */
  async startArcheonWatcher(e) {
    const t = d.join(e, "archeon");
    this.watcher && await this.watcher.close(), this.watcher = j.watch(t, {
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
        const a = await this.readIndexFile(e);
        a.success && this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("archeon:index-changed", a);
      } else if (n === "ARCHEON.arcon") {
        const a = await this.readArconFile(e);
        a.success && this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("archeon:arcon-changed", a);
      }
    }), this.watcher.on("add", async (s) => {
      const n = d.basename(s);
      if (n === "ARCHEON.index.json") {
        const a = await this.readIndexFile(e);
        a.success && this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("archeon:index-changed", a);
      } else if (n === "ARCHEON.arcon") {
        const a = await this.readArconFile(e);
        a.success && this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("archeon:arcon-changed", a);
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
      const s = await x.readFile(t, "utf-8");
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
      const s = await x.readFile(t, "utf-8"), n = this.parseArconChains(s);
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
      const a = n.trim();
      if (!a || a.startsWith("#")) continue;
      const i = a.match(/^@(\w+)\s+(.+)$/);
      if (i) {
        const l = i[1], c = i[2], h = this.parseChainGlyphs(c);
        t.push({
          version: l,
          raw: a,
          glyphs: h
        });
        continue;
      }
      if (a.includes("::")) {
        const l = this.parseContainmentGlyphs(a);
        t.push({
          type: "orchestrator",
          raw: a,
          glyphs: l
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
      const a = n.trim();
      if (!a) continue;
      const i = a.match(/^(\w+):(.+)$/);
      i && t.push({
        type: i[1],
        name: i[2],
        key: a
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
      const a = n.trim();
      if (!a) continue;
      const i = a.match(/^(\w+):(.+)$/);
      i && t.push({
        type: i[1],
        name: i[2],
        key: a
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
        await x.access(n);
      } catch {
        await x.mkdir(n, { recursive: !0 });
      }
      return await x.writeFile(s, t, "utf-8"), { success: !0, path: s };
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
const k = H(N), E = d.dirname(R(import.meta.url));
console.log("=== Electron Environment ===");
console.log("__dirname:", E);
console.log("app.isPackaged:", w.isPackaged);
console.log("process.resourcesPath:", process.resourcesPath);
console.log("app.getAppPath():", w.getAppPath());
console.log("===========================");
let y = null, P = null, b = null;
process.platform === "darwin" && (w.commandLine.appendSwitch("enable-gpu-rasterization"), w.commandLine.appendSwitch("enable-zero-copy"), w.commandLine.appendSwitch("ignore-gpu-blocklist"), w.commandLine.appendSwitch("disable-software-rasterizer"));
w.commandLine.appendSwitch("js-flags", "--max-old-space-size=2048");
w.commandLine.appendSwitch("disable-renderer-backgrounding");
function C() {
  if (y = new F({
    width: 1600,
    height: 1e3,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: d.join(E, "preload.js"),
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
  }), P = new I(y), b = new M(y), y.once("ready-to-show", () => {
    console.log("Window ready-to-show event fired"), y.show();
  }), setTimeout(() => {
    y.isVisible() || (console.log("Fallback: Showing window after timeout"), y.show());
  }, 3e3), process.env.VITE_DEV_SERVER_URL) {
    const r = async (e = 5) => {
      try {
        await y.loadURL(process.env.VITE_DEV_SERVER_URL), console.log("Dev server loaded successfully");
      } catch (t) {
        if (e > 0)
          return console.log(
            `Waiting for Vite dev server... (${e} retries left)`
          ), await new Promise((s) => setTimeout(s, 1e3)), r(e - 1);
        console.error("Failed to load Vite dev server:", t);
      }
    };
    r();
  } else {
    const r = w.isPackaged ? d.join(w.getAppPath(), "dist/index.html") : d.join(E, "../dist/index.html");
    console.log("Loading index.html from:", r), y.loadFile(r).then(() => {
      console.log("index.html loaded successfully");
    }).catch((e) => {
      console.error("Failed to load index.html:", e), console.error("Attempted path:", r), y.show();
    });
  }
  y.on("closed", () => {
    y = null, P && P.killAll(), b && b.stop();
  });
}
p.handle("dialog:openProject", async () => {
  const r = await T.showOpenDialog(y, {
    properties: ["openDirectory"],
    title: "Select Archeon Project"
  });
  if (r.canceled || r.filePaths.length === 0)
    return { canceled: !0, path: null };
  const e = r.filePaths[0], t = d.join(e, "archeon"), s = await import("fs/promises");
  try {
    return await s.access(t), { canceled: !1, path: e, valid: !0 };
  } catch {
    return { canceled: !1, path: e, valid: !1 };
  }
});
p.handle("pty:spawn", (r, e = {}) => P.spawn(e));
p.on("pty:write", (r, { id: e, data: t }) => {
  P.write(e, t);
});
p.on("pty:resize", (r, { id: e, cols: t, rows: s }) => {
  P.resize(e, t, s);
});
p.on("pty:kill", (r, { id: e }) => {
  P.kill(e);
});
p.handle("archeon:watch", (r, e) => b.watch(e));
p.handle("archeon:stop", () => (b.stop(), !0));
p.handle("archeon:readIndex", async (r, e) => b.readIndexFile(e));
p.handle("archeon:readArcon", async (r, e) => b.readArconFile(e));
p.handle("archeon:writeArcon", async (r, e, t) => b.writeArconFile(e, t));
p.handle("rules:copyTemplates", async (r, { files: e, targetDir: t }) => {
  const s = await import("fs/promises"), a = process.env.VITE_DEV_SERVER_URL ? d.join(E, "..", "rules_templates") : d.join(process.resourcesPath, "rules_templates"), i = { created: [], failed: [] };
  for (const l of e) {
    const c = d.join(a, l), h = d.join(t, l);
    try {
      const o = await s.readFile(c, "utf-8");
      await s.mkdir(d.dirname(h), { recursive: !0 }), await s.writeFile(h, o, "utf-8"), i.created.push(l);
    } catch (o) {
      i.failed.push({ file: l, error: o.message });
    }
  }
  return i;
});
p.handle("fs:readFile", async (r, e) => {
  const t = await import("fs/promises");
  try {
    return { success: !0, content: await t.readFile(e, "utf-8") };
  } catch (s) {
    return { success: !1, error: s.message };
  }
});
p.handle("fs:writeFile", async (r, e, t) => {
  const s = await import("fs/promises"), n = await import("path");
  try {
    const a = n.dirname(e);
    return await s.mkdir(a, { recursive: !0 }), await s.writeFile(e, t, "utf-8"), { success: !0 };
  } catch (a) {
    return { success: !1, error: a.message };
  }
});
p.handle("shell:exec", async (r, e, t = {}) => {
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
p.handle("shell:openExternal", async (r, e) => {
  try {
    return await L.openExternal(e), { success: !0 };
  } catch (t) {
    return { success: !1, error: t.message };
  }
});
p.handle("archeon:getShapes", async () => {
  const r = await import("fs/promises"), e = A.homedir(), t = process.env.PIPX_HOME || d.join(e, ".local/pipx"), s = [
    `${e}/.local/bin`,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    process.env.PATH
  ].join(":");
  try {
    let n = null;
    const a = d.join(t, "venvs/archeon/lib");
    try {
      const c = await r.readdir(a);
      for (const h of c)
        if (h.startsWith("python")) {
          const o = d.join(a, h, "site-packages/archeon/architectures");
          try {
            await r.access(o), n = o, console.log("[getShapes] Found architectures in pipx venv:", o);
            break;
          } catch {
          }
        }
    } catch {
      console.log("[getShapes] pipx venv not found at:", a);
    }
    if (!n)
      try {
        const { stdout: c } = await k(
          "pipx runpip archeon show archeon",
          { timeout: 1e4, env: { ...process.env, PATH: s } }
        ), h = c.match(/Location:\s*(.+)/);
        if (h) {
          const o = d.join(h[1].trim(), "archeon/architectures");
          try {
            await r.access(o), n = o, console.log("[getShapes] Found architectures via pipx runpip:", o);
          } catch {
          }
        }
      } catch (c) {
        console.log("[getShapes] pipx runpip failed:", c.message);
      }
    if (!n)
      try {
        const { stdout: c } = await k(
          "which archeon || echo ~/.local/bin/archeon",
          { timeout: 5e3, env: { ...process.env, PATH: s } }
        ), h = c.trim().replace(/^~/, e), o = await r.realpath(h).catch(() => h);
        if (console.log("[getShapes] archeon binary at:", o), o.includes("pipx/venvs/archeon")) {
          const f = o.split("/bin/")[0], g = d.join(f, "lib"), u = await r.readdir(g);
          for (const m of u)
            if (m.startsWith("python")) {
              const v = d.join(g, m, "site-packages/archeon/architectures");
              try {
                await r.access(v), n = v, console.log("[getShapes] Found architectures via binary path:", v);
                break;
              } catch {
              }
            }
        }
      } catch (c) {
        console.log("[getShapes] Could not trace archeon binary:", c.message);
      }
    if (!n) {
      const c = [
        d.join(e, ".local/lib/python3.13/site-packages/archeon/architectures"),
        d.join(e, ".local/lib/python3.12/site-packages/archeon/architectures"),
        d.join(e, ".local/lib/python3.11/site-packages/archeon/architectures"),
        "/usr/local/lib/python3.13/site-packages/archeon/architectures",
        "/usr/local/lib/python3.12/site-packages/archeon/architectures",
        "/opt/homebrew/lib/python3.13/site-packages/archeon/architectures",
        "/opt/homebrew/lib/python3.12/site-packages/archeon/architectures"
      ];
      for (const h of c)
        try {
          await r.access(h), n = h, console.log("[getShapes] Found architectures in fallback path:", h);
          break;
        } catch {
        }
    }
    if (!n)
      return console.log("[getShapes] No architectures directory found"), { success: !1, error: "Archeon architectures not found. Try reinstalling CLI.", shapes: [] };
    console.log("[getShapes] Using architectures directory:", n);
    const i = await r.readdir(n, { withFileTypes: !0 }), l = [];
    for (const c of i) {
      if (c.isDirectory() || !c.name.endsWith(".shape.json")) continue;
      const h = d.join(n, c.name), o = c.name.replace(".shape.json", "");
      try {
        const f = await r.readFile(h, "utf-8"), g = JSON.parse(f), u = {
          id: o,
          name: g.name || o.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
          description: g.description || `${o} architecture template`,
          icon: g.icon || "📦",
          tags: g.tags || []
        };
        u.tags.length === 0 && (o.includes("vue") && u.tags.push("Vue"), o.includes("react") && u.tags.push("React"), (o.includes("nextjs") || o.includes("next")) && u.tags.push("Next.js"), o.includes("fastapi") && u.tags.push("FastAPI", "Python"), o.includes("express") && u.tags.push("Express", "Node.js"), o.includes("django") && u.tags.push("Django", "Python"), o.includes("mongo") && u.tags.push("MongoDB")), l.push(u), console.log("[getShapes] Loaded shape:", o);
      } catch (f) {
        console.warn("[getShapes] Failed to parse shape file:", c.name, f.message);
      }
    }
    return console.log("[getShapes] Total shapes found:", l.length), { success: !0, shapes: l, path: n };
  } catch (n) {
    return console.error("[getShapes] Error:", n), { success: !1, error: n.message, shapes: [] };
  }
});
p.handle("shell:checkCommand", async (r, e) => {
  try {
    const t = A.homedir(), s = [
      `${t}/.local/bin`,
      "/opt/homebrew/bin",
      "/usr/local/bin",
      process.env.PATH
    ].join(":"), n = e.replace(/^~/, t).replace(/\s~\//g, ` ${t}/`);
    console.log(`[checkCommand] Original: ${e}`), console.log(`[checkCommand] Expanded: ${n}`);
    const { stdout: a } = await k(n, {
      timeout: 5e3,
      env: { ...process.env, PATH: s }
    });
    return console.log(`[checkCommand] Success: ${a.trim()}`), { success: !0, output: a.trim() };
  } catch (t) {
    return console.log(`[checkCommand] Failed: ${t.message}`), { success: !1, error: t.message };
  }
});
p.handle("fs:checkDirExists", async (r, e) => {
  try {
    return (await (await import("fs/promises")).stat(e)).isDirectory();
  } catch {
    return !1;
  }
});
p.handle("fs:findClientDir", async (r, e) => {
  const t = await import("fs/promises"), s = await import("path");
  try {
    const n = s.join(e, "client");
    try {
      if ((await t.stat(n)).isDirectory()) {
        const l = s.join(n, "package.json");
        try {
          return await t.access(l), { success: !0, path: n, hasPackageJson: !0 };
        } catch {
          return { success: !0, path: n, hasPackageJson: !1 };
        }
      }
    } catch {
    }
    const a = s.join(e, "package.json");
    try {
      return await t.access(a), { success: !0, path: e, hasPackageJson: !0 };
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
p.handle("fs:readPackageJson", async (r, e) => {
  const t = await import("fs/promises"), s = await import("path");
  try {
    const n = s.join(e, "package.json"), a = await t.readFile(n, "utf-8"), i = JSON.parse(a), l = i.scripts || {};
    let c = null, h = null;
    const o = ["dev", "start", "serve", "develop", "run"];
    for (const f of o)
      if (l[f]) {
        c = f, h = l[f];
        break;
      }
    return {
      success: !0,
      name: i.name,
      scripts: l,
      devScript: c,
      devCommand: h
    };
  } catch (n) {
    return { success: !1, error: n.message };
  }
});
p.handle("archeon:validate", async (r, e) => {
  if (!e)
    return { success: !1, error: "No project path provided" };
  try {
    const { stdout: t, stderr: s } = await k("arc validate", {
      cwd: e,
      timeout: 3e4
      // 30 second timeout
    }), n = t + s, a = n.includes("Validation passed") || n.includes("✓"), i = n.match(/Chains:\s*(\d+)/), l = n.match(/Glyphs:\s*(\d+)/), c = [], h = n.matchAll(/•\s*ERR:[^\n]+/g);
    for (const g of h)
      c.push(g[0].replace("• ", ""));
    const o = [], f = n.matchAll(/•\s*WARN:[^\n]+/g);
    for (const g of f)
      o.push(g[0].replace("• ", ""));
    return {
      success: !0,
      isValid: a,
      chains: i ? parseInt(i[1]) : 0,
      glyphs: l ? parseInt(l[1]) : 0,
      errors: c,
      warnings: o,
      output: n
    };
  } catch (t) {
    const s = (t.stdout || "") + (t.stderr || ""), n = !1, a = [], i = s.matchAll(/•\s*ERR:[^\n]+/g);
    for (const h of i)
      a.push(h[0].replace("• ", ""));
    const l = [], c = s.matchAll(/•\s*WARN:[^\n]+/g);
    for (const h of c)
      l.push(h[0].replace("• ", ""));
    return t.message?.includes("not found") || t.message?.includes("ENOENT") ? {
      success: !1,
      error: "arc command not found. Make sure it's installed and in PATH."
    } : {
      success: !0,
      isValid: n,
      errors: a,
      warnings: l,
      output: s
    };
  }
});
w.whenReady().then(C);
w.on("window-all-closed", () => {
  process.platform !== "darwin" && w.quit();
});
w.on("activate", () => {
  F.getAllWindows().length === 0 && C();
});
