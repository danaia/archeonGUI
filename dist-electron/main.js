import { app as w, ipcMain as p, dialog as L, shell as R, BrowserWindow as C } from "electron";
import h from "path";
import x from "os";
import { fileURLToPath as N } from "url";
import { exec as H } from "child_process";
import { promisify as $ } from "util";
import I from "node-pty";
import W from "fs";
import F from "chokidar";
import A from "fs/promises";
class M {
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
    const t = this.getShell(), s = e.cwd || x.homedir(), n = e.cols || 80, r = e.rows || 24, c = x.platform(), l = x.homedir();
    console.log(`[PTY] Spawning shell: ${t}`), console.log(`[PTY] Working directory: ${s}`), console.log(`[PTY] Platform: ${c}`);
    const i = [
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
    ], d = process.env.PATH || "", o = /* @__PURE__ */ new Set([...i, ...d.split(":")]), m = Array.from(o).filter((u) => u).join(":"), y = {
      ...process.env,
      ...e.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      PATH: m,
      HOME: l,
      SHELL: t,
      // Ensure locale is set for proper character handling
      LANG: process.env.LANG || "en_US.UTF-8",
      LC_ALL: process.env.LC_ALL || "en_US.UTF-8"
    }, f = [];
    (t.includes("zsh") || t.includes("bash")) && f.push("-l", "-i"), console.log(`[PTY] Shell args: ${JSON.stringify(f)}`), console.log(`[PTY] PATH includes ~/.local/bin: ${m.includes(".local/bin")}`);
    try {
      const u = I.spawn(t, f, {
        name: "xterm-256color",
        cols: n,
        rows: r,
        cwd: s,
        env: y,
        useConpty: !1
        // Disable ConPTY on Windows, doesn't affect macOS/Linux
      }), v = this.nextId++;
      return this.terminals.set(v, u), u.onData((S) => {
        this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("pty:data", { id: v, data: S });
      }), u.onExit(({ exitCode: S, signal: T }) => {
        this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("pty:exit", { id: v, exitCode: S, signal: T }), this.terminals.delete(v);
      }), { id: v, pid: u.pid };
    } catch (u) {
      throw console.error(`Failed to spawn PTY with shell ${t}:`, u), new Error(`PTY spawn failed: ${u.message}`);
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
class O {
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
    const t = h.join(e, "archeon");
    let s = !1;
    try {
      await A.access(t), s = !0;
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
    }), this.rootWatcher.on("addDir", async (c) => {
      h.basename(c) === "archeon" && await this.startArcheonWatcher(e);
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
    const t = h.join(e, "archeon");
    this.watcher && await this.watcher.close(), this.watcher = F.watch(t, {
      persistent: !0,
      ignoreInitial: !1,
      // Process existing files on start
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    }), this.watcher.on("change", async (s) => {
      const n = h.basename(s);
      if (n === "ARCHEON.index.json") {
        const r = await this.readIndexFile(e);
        r.success && this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("archeon:index-changed", r);
      } else if (n === "ARCHEON.arcon") {
        const r = await this.readArconFile(e);
        r.success && this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("archeon:arcon-changed", r);
      }
    }), this.watcher.on("add", async (s) => {
      const n = h.basename(s);
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
    const t = h.join(e, "archeon", "ARCHEON.index.json");
    try {
      const s = await A.readFile(t, "utf-8");
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
    const t = h.join(e, "archeon", "ARCHEON.arcon");
    try {
      const s = await A.readFile(t, "utf-8"), n = this.parseArconChains(s);
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
      const c = r.match(/^@(\w+)\s+(.+)$/);
      if (c) {
        const l = c[1], i = c[2], d = this.parseChainGlyphs(i);
        t.push({
          version: l,
          raw: r,
          glyphs: d
        });
        continue;
      }
      if (r.includes("::")) {
        const l = this.parseContainmentGlyphs(r);
        t.push({
          type: "orchestrator",
          raw: r,
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
      const r = n.trim();
      if (!r) continue;
      const c = r.match(/^(\w+):(.+)$/);
      c && t.push({
        type: c[1],
        name: c[2],
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
      const c = r.match(/^(\w+):(.+)$/);
      c && t.push({
        type: c[1],
        name: c[2],
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
    const s = h.join(e, "archeon", "ARCHEON.arcon");
    try {
      const n = h.join(e, "archeon");
      try {
        await A.access(n);
      } catch {
        await A.mkdir(n, { recursive: !0 });
      }
      return await A.writeFile(s, t, "utf-8"), { success: !0, path: s };
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
const k = $(H), E = h.dirname(N(import.meta.url));
console.log("=== Electron Environment ===");
console.log("__dirname:", E);
console.log("app.isPackaged:", w.isPackaged);
console.log("process.resourcesPath:", process.resourcesPath);
console.log("app.getAppPath():", w.getAppPath());
console.log("===========================");
let g = null, P = null, b = null;
process.platform === "darwin" && (w.commandLine.appendSwitch("enable-gpu-rasterization"), w.commandLine.appendSwitch("enable-zero-copy"), w.commandLine.appendSwitch("ignore-gpu-blocklist"), w.commandLine.appendSwitch("disable-software-rasterizer"));
w.commandLine.appendSwitch("js-flags", "--max-old-space-size=2048");
w.commandLine.appendSwitch("disable-renderer-backgrounding");
function D() {
  if (g = new C({
    width: 1600,
    height: 1e3,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: h.join(E, "preload.js"),
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
  }), P = new M(g), b = new O(g), g.once("ready-to-show", () => {
    console.log("Window ready-to-show event fired"), g.show();
  }), setTimeout(() => {
    g.isVisible() || (console.log("Fallback: Showing window after timeout"), g.show());
  }, 3e3), process.env.VITE_DEV_SERVER_URL) {
    const a = async (e = 5) => {
      try {
        await g.loadURL(process.env.VITE_DEV_SERVER_URL), console.log("Dev server loaded successfully");
      } catch (t) {
        if (e > 0)
          return console.log(
            `Waiting for Vite dev server... (${e} retries left)`
          ), await new Promise((s) => setTimeout(s, 1e3)), a(e - 1);
        console.error("Failed to load Vite dev server:", t);
      }
    };
    a();
  } else {
    const a = w.isPackaged ? h.join(w.getAppPath(), "dist/index.html") : h.join(E, "../dist/index.html");
    console.log("Loading index.html from:", a), g.loadFile(a).then(() => {
      console.log("index.html loaded successfully");
    }).catch((e) => {
      console.error("Failed to load index.html:", e), console.error("Attempted path:", a), g.show();
    });
  }
  g.on("closed", () => {
    g = null, P && P.killAll(), b && b.stop();
  });
}
p.handle("dialog:openProject", async () => {
  const a = await L.showOpenDialog(g, {
    properties: ["openDirectory"],
    title: "Select Archeon Project"
  });
  if (a.canceled || a.filePaths.length === 0)
    return { canceled: !0, path: null };
  const e = a.filePaths[0], t = h.join(e, "archeon"), s = await import("fs/promises");
  try {
    return await s.access(t), { canceled: !1, path: e, valid: !0 };
  } catch {
    return { canceled: !1, path: e, valid: !1 };
  }
});
p.handle("pty:spawn", (a, e = {}) => P.spawn(e));
p.on("pty:write", (a, { id: e, data: t }) => {
  P.write(e, t);
});
p.on("pty:resize", (a, { id: e, cols: t, rows: s }) => {
  P.resize(e, t, s);
});
p.on("pty:kill", (a, { id: e }) => {
  P.kill(e);
});
p.handle("archeon:watch", (a, e) => b.watch(e));
p.handle("archeon:stop", () => (b.stop(), !0));
p.handle("archeon:readIndex", async (a, e) => b.readIndexFile(e));
p.handle("archeon:readArcon", async (a, e) => b.readArconFile(e));
p.handle("archeon:writeArcon", async (a, e, t) => b.writeArconFile(e, t));
p.handle("rules:copyTemplates", async (a, { files: e, targetDir: t }) => {
  const s = await import("fs/promises"), r = process.env.VITE_DEV_SERVER_URL ? h.join(E, "..", "rules_templates") : h.join(process.resourcesPath, "rules_templates"), c = { created: [], failed: [] };
  for (const l of e) {
    const i = h.join(r, l), d = h.join(t, l);
    try {
      const o = await s.readFile(i, "utf-8");
      await s.mkdir(h.dirname(d), { recursive: !0 }), await s.writeFile(d, o, "utf-8"), c.created.push(l);
    } catch (o) {
      c.failed.push({ file: l, error: o.message });
    }
  }
  return c;
});
p.handle("fs:readFile", async (a, e) => {
  const t = await import("fs/promises");
  try {
    return { success: !0, content: await t.readFile(e, "utf-8") };
  } catch (s) {
    return { success: !1, error: s.message };
  }
});
p.handle("fs:writeFile", async (a, e, t) => {
  const s = await import("fs/promises"), n = await import("path");
  try {
    const r = n.dirname(e);
    return await s.mkdir(r, { recursive: !0 }), await s.writeFile(e, t, "utf-8"), { success: !0 };
  } catch (r) {
    return { success: !1, error: r.message };
  }
});
p.handle("shell:exec", async (a, e, t = {}) => {
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
p.handle("shell:openExternal", async (a, e) => {
  try {
    return await R.openExternal(e), { success: !0 };
  } catch (t) {
    return { success: !1, error: t.message };
  }
});
p.handle("archeon:getShapes", async () => {
  const a = await import("fs/promises"), e = x.homedir(), t = process.env.PIPX_HOME || h.join(e, ".local/pipx"), s = [
    `${e}/.local/bin`,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    process.env.PATH
  ].join(":");
  try {
    let n = null;
    const r = h.join(t, "venvs/archeon/lib");
    try {
      const i = await a.readdir(r);
      for (const d of i)
        if (d.startsWith("python")) {
          const o = h.join(r, d, "site-packages/archeon/architectures");
          try {
            await a.access(o), n = o, console.log("[getShapes] Found architectures in pipx venv:", o);
            break;
          } catch {
          }
        }
    } catch {
      console.log("[getShapes] pipx venv not found at:", r);
    }
    if (!n)
      try {
        const { stdout: i } = await k(
          "pipx runpip archeon show archeon",
          { timeout: 1e4, env: { ...process.env, PATH: s } }
        ), d = i.match(/Location:\s*(.+)/);
        if (d) {
          const o = h.join(d[1].trim(), "archeon/architectures");
          try {
            await a.access(o), n = o, console.log("[getShapes] Found architectures via pipx runpip:", o);
          } catch {
          }
        }
      } catch (i) {
        console.log("[getShapes] pipx runpip failed:", i.message);
      }
    if (!n)
      try {
        const { stdout: i } = await k(
          "which archeon || echo ~/.local/bin/archeon",
          { timeout: 5e3, env: { ...process.env, PATH: s } }
        ), d = i.trim().replace(/^~/, e), o = await a.realpath(d).catch(() => d);
        if (console.log("[getShapes] archeon binary at:", o), o.includes("pipx/venvs/archeon")) {
          const m = o.split("/bin/")[0], y = h.join(m, "lib"), f = await a.readdir(y);
          for (const u of f)
            if (u.startsWith("python")) {
              const v = h.join(y, u, "site-packages/archeon/architectures");
              try {
                await a.access(v), n = v, console.log("[getShapes] Found architectures via binary path:", v);
                break;
              } catch {
              }
            }
        }
      } catch (i) {
        console.log("[getShapes] Could not trace archeon binary:", i.message);
      }
    if (!n) {
      const i = [
        h.join(e, ".local/lib/python3.13/site-packages/archeon/architectures"),
        h.join(e, ".local/lib/python3.12/site-packages/archeon/architectures"),
        h.join(e, ".local/lib/python3.11/site-packages/archeon/architectures"),
        "/usr/local/lib/python3.13/site-packages/archeon/architectures",
        "/usr/local/lib/python3.12/site-packages/archeon/architectures",
        "/opt/homebrew/lib/python3.13/site-packages/archeon/architectures",
        "/opt/homebrew/lib/python3.12/site-packages/archeon/architectures"
      ];
      for (const d of i)
        try {
          await a.access(d), n = d, console.log("[getShapes] Found architectures in fallback path:", d);
          break;
        } catch {
        }
    }
    if (!n)
      return console.log("[getShapes] No architectures directory found"), { success: !1, error: "Archeon architectures not found. Try reinstalling CLI.", shapes: [] };
    console.log("[getShapes] Using architectures directory:", n);
    const c = await a.readdir(n, { withFileTypes: !0 }), l = [];
    for (const i of c) {
      if (i.isDirectory() || !i.name.endsWith(".shape.json")) continue;
      const d = h.join(n, i.name), o = i.name.replace(".shape.json", "");
      try {
        const m = await a.readFile(d, "utf-8"), y = JSON.parse(m), f = {
          id: o,
          name: y.name || o.replace(/-/g, " ").replace(/\b\w/g, (u) => u.toUpperCase()),
          description: y.description || `${o} architecture template`,
          icon: y.icon || "📦",
          tags: y.tags || []
        };
        f.tags.length === 0 && (o.includes("vue") && f.tags.push("Vue"), o.includes("react") && f.tags.push("React"), (o.includes("nextjs") || o.includes("next")) && f.tags.push("Next.js"), o.includes("fastapi") && f.tags.push("FastAPI", "Python"), o.includes("express") && f.tags.push("Express", "Node.js"), o.includes("django") && f.tags.push("Django", "Python"), o.includes("mongo") && f.tags.push("MongoDB")), l.push(f), console.log("[getShapes] Loaded shape:", o);
      } catch (m) {
        console.warn("[getShapes] Failed to parse shape file:", i.name, m.message);
      }
    }
    return console.log("[getShapes] Total shapes found:", l.length), { success: !0, shapes: l, path: n };
  } catch (n) {
    return console.error("[getShapes] Error:", n), { success: !1, error: n.message, shapes: [] };
  }
});
p.handle("shell:checkCommand", async (a, e) => {
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
p.handle("fs:checkDirExists", async (a, e) => {
  try {
    return (await (await import("fs/promises")).stat(e)).isDirectory();
  } catch {
    return !1;
  }
});
p.handle("fs:findClientDir", async (a, e) => {
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
p.handle("fs:readPackageJson", async (a, e) => {
  const t = await import("fs/promises"), s = await import("path");
  try {
    const n = s.join(e, "package.json"), r = await t.readFile(n, "utf-8"), c = JSON.parse(r), l = c.scripts || {};
    let i = null, d = null;
    const o = ["dev", "start", "serve", "develop", "run"];
    for (const m of o)
      if (l[m]) {
        i = m, d = l[m];
        break;
      }
    return {
      success: !0,
      name: c.name,
      scripts: l,
      devScript: i,
      devCommand: d
    };
  } catch (n) {
    return { success: !1, error: n.message };
  }
});
function j(a, e) {
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
    errors: a.filter(
      (r) => !t.some((c) => r.includes(c))
    ),
    warnings: e.filter(
      (r) => !s.some((c) => r.includes(c))
    )
  };
}
p.handle("archeon:validate", async (a, e) => {
  if (!e)
    return { success: !1, error: "No project path provided" };
  try {
    const { stdout: t, stderr: s } = await k("arc validate", {
      cwd: e,
      timeout: 3e4
      // 30 second timeout
    }), n = t + s, r = n.includes("Validation passed") || n.includes("✓"), c = n.match(/Chains:\s*(\d+)/), l = n.match(/Glyphs:\s*(\d+)/);
    let i = [];
    const d = n.matchAll(/•\s*ERR:[^\n]+/g);
    for (const u of d)
      i.push(u[0].replace("• ", ""));
    let o = [];
    const m = n.matchAll(/•\s*WARN:[^\n]+/g);
    for (const u of m)
      o.push(u[0].replace("• ", ""));
    const y = j(i, o);
    return i = y.errors, o = y.warnings, {
      success: !0,
      isValid: i.length === 0,
      chains: c ? parseInt(c[1]) : 0,
      glyphs: l ? parseInt(l[1]) : 0,
      errors: i,
      warnings: o,
      output: n
    };
  } catch (t) {
    const s = (t.stdout || "") + (t.stderr || "");
    let n = [];
    const r = s.matchAll(/•\s*ERR:[^\n]+/g);
    for (const o of r)
      n.push(o[0].replace("• ", ""));
    let c = [];
    const l = s.matchAll(/•\s*WARN:[^\n]+/g);
    for (const o of l)
      c.push(o[0].replace("• ", ""));
    const i = j(n, c);
    n = i.errors, c = i.warnings;
    const d = n.length === 0;
    return t.message?.includes("not found") || t.message?.includes("ENOENT") ? {
      success: !1,
      error: "arc command not found. Make sure it's installed and in PATH."
    } : {
      success: !0,
      isValid: d,
      errors: n,
      warnings: c,
      output: s
    };
  }
});
w.whenReady().then(D);
w.on("window-all-closed", () => {
  process.platform !== "darwin" && w.quit();
});
w.on("activate", () => {
  C.getAllWindows().length === 0 && D();
});
