import { app as g, ipcMain as p, dialog as R, shell as C, BrowserWindow as D } from "electron";
import l from "path";
import k from "os";
import { fileURLToPath as N } from "url";
import { exec as H } from "child_process";
import { promisify as $ } from "util";
import I from "node-pty";
import W from "fs";
import F from "chokidar";
import x from "fs/promises";
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
    const e = k.platform();
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
      if (W.existsSync(t))
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
    const s = this.getShell(), t = e.cwd || k.homedir(), n = e.cols || 80, r = e.rows || 24, o = k.platform(), d = k.homedir();
    console.log(`[PTY] Spawning shell: ${s}`), console.log(`[PTY] Working directory: ${t}`), console.log(`[PTY] Platform: ${o}`);
    const i = [
      `${d}/.local/bin`,
      // pipx installs here
      `${d}/.cargo/bin`,
      // Rust binaries
      `${d}/.pyenv/shims`,
      // pyenv
      `${d}/.nvm/versions/node`,
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
    ], h = process.env.PATH || "", c = /* @__PURE__ */ new Set([...i, ...h.split(":")]), w = Array.from(c).filter((m) => m).join(":"), u = {
      ...process.env,
      ...e.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      PATH: w,
      HOME: d,
      SHELL: s,
      // Ensure locale is set for proper character handling
      LANG: process.env.LANG || "en_US.UTF-8",
      LC_ALL: process.env.LC_ALL || "en_US.UTF-8"
    }, f = [];
    (s.includes("zsh") || s.includes("bash")) && f.push("-l", "-i"), console.log(`[PTY] Shell args: ${JSON.stringify(f)}`), console.log(`[PTY] PATH includes ~/.local/bin: ${w.includes(".local/bin")}`);
    try {
      const m = I.spawn(s, f, {
        name: "xterm-256color",
        cols: n,
        rows: r,
        cwd: t,
        env: u,
        useConpty: !1
        // Disable ConPTY on Windows, doesn't affect macOS/Linux
      }), v = this.nextId++;
      return this.terminals.set(v, m), m.onData((P) => {
        this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("pty:data", { id: v, data: P });
      }), m.onExit(({ exitCode: P, signal: L }) => {
        this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("pty:exit", { id: v, exitCode: P, signal: L }), this.terminals.delete(v);
      }), { id: v, pid: m.pid };
    } catch (m) {
      throw console.error(`Failed to spawn PTY with shell ${s}:`, m), new Error(`PTY spawn failed: ${m.message}`);
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
    const s = l.join(e, "archeon");
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
    return t && (n = await this.readIndexFile(e), r = await this.readArconFile(e)), this.rootWatcher = F.watch(e, {
      persistent: !0,
      ignoreInitial: !0,
      depth: 0
      // Only watch immediate children
    }), this.rootWatcher.on("addDir", async (o) => {
      l.basename(o) === "archeon" && await this.startArcheonWatcher(e);
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
    const s = l.join(e, "archeon");
    this.watcher && await this.watcher.close(), this.watcher = F.watch(s, {
      persistent: !0,
      ignoreInitial: !1,
      // Process existing files on start
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    }), this.watcher.on("change", async (t) => {
      const n = l.basename(t);
      if (n === "ARCHEON.index.json") {
        const r = await this.readIndexFile(e);
        r.success && this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("archeon:index-changed", r);
      } else if (n === "ARCHEON.arcon") {
        const r = await this.readArconFile(e);
        r.success && this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send("archeon:arcon-changed", r);
      }
    }), this.watcher.on("add", async (t) => {
      const n = l.basename(t);
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
    const s = l.join(e, "archeon", "ARCHEON.index.json");
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
    const s = l.join(e, "archeon", "ARCHEON.arcon");
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
`);
    for (const n of t) {
      const r = n.trim();
      if (!r || r.startsWith("#")) continue;
      const o = r.match(/^@(\w+)\s+(.+)$/);
      if (o) {
        const d = o[1], i = o[2], h = this.parseChainGlyphs(i);
        s.push({
          version: d,
          raw: r,
          glyphs: h
        });
        continue;
      }
      if (r.includes("::")) {
        const d = this.parseContainmentGlyphs(r);
        s.push({
          type: "orchestrator",
          raw: r,
          glyphs: d
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
      const o = r.match(/^(\w+):(.+)$/);
      o && s.push({
        type: o[1],
        name: o[2],
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
      const o = r.match(/^(\w+):(.+)$/);
      o && s.push({
        type: o[1],
        name: o[2],
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
    const t = l.join(e, "archeon", "ARCHEON.arcon");
    try {
      const n = l.join(e, "archeon");
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
const E = $(H), S = l.dirname(N(import.meta.url));
console.log("=== Electron Environment ===");
console.log("__dirname:", S);
console.log("app.isPackaged:", g.isPackaged);
console.log("process.resourcesPath:", process.resourcesPath);
console.log("app.getAppPath():", g.getAppPath());
console.log("===========================");
let y = null, A = null, b = null;
process.platform === "darwin" && (g.commandLine.appendSwitch("enable-gpu-rasterization"), g.commandLine.appendSwitch("enable-zero-copy"), g.commandLine.appendSwitch("ignore-gpu-blocklist"), g.commandLine.appendSwitch("disable-software-rasterizer"));
g.commandLine.appendSwitch("js-flags", "--max-old-space-size=2048");
g.commandLine.appendSwitch("disable-renderer-backgrounding");
function T() {
  if (y = new D({
    width: 1600,
    height: 1e3,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: l.join(S, "preload.js"),
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
  }), A = new M(y), b = new O(y), y.once("ready-to-show", () => {
    console.log("Window ready-to-show event fired"), y.show();
  }), setTimeout(() => {
    y.isVisible() || (console.log("Fallback: Showing window after timeout"), y.show());
  }, 3e3), process.env.VITE_DEV_SERVER_URL) {
    const a = async (e = 5) => {
      try {
        await y.loadURL(process.env.VITE_DEV_SERVER_URL), console.log("Dev server loaded successfully");
      } catch (s) {
        if (e > 0)
          return console.log(
            `Waiting for Vite dev server... (${e} retries left)`
          ), await new Promise((t) => setTimeout(t, 1e3)), a(e - 1);
        console.error("Failed to load Vite dev server:", s);
      }
    };
    a();
  } else {
    const a = g.isPackaged ? l.join(g.getAppPath(), "dist/index.html") : l.join(S, "../dist/index.html");
    console.log("Loading index.html from:", a), y.loadFile(a).then(() => {
      console.log("index.html loaded successfully");
    }).catch((e) => {
      console.error("Failed to load index.html:", e), console.error("Attempted path:", a), y.show();
    });
  }
  y.on("closed", () => {
    y = null, A && A.killAll(), b && b.stop();
  });
}
p.handle("dialog:openProject", async () => {
  const a = await R.showOpenDialog(y, {
    properties: ["openDirectory"],
    title: "Select Archeon Project"
  });
  if (a.canceled || a.filePaths.length === 0)
    return { canceled: !0, path: null };
  const e = a.filePaths[0], s = l.join(e, "archeon"), t = await import("fs/promises");
  try {
    return await t.access(s), { canceled: !1, path: e, valid: !0 };
  } catch {
    return { canceled: !1, path: e, valid: !1 };
  }
});
p.handle("pty:spawn", (a, e = {}) => A.spawn(e));
p.on("pty:write", (a, { id: e, data: s }) => {
  A.write(e, s);
});
p.on("pty:resize", (a, { id: e, cols: s, rows: t }) => {
  A.resize(e, s, t);
});
p.on("pty:kill", (a, { id: e }) => {
  A.kill(e);
});
p.handle("archeon:watch", (a, e) => b.watch(e));
p.handle("archeon:stop", () => (b.stop(), !0));
p.handle("archeon:readIndex", async (a, e) => b.readIndexFile(e));
p.handle("archeon:readArcon", async (a, e) => b.readArconFile(e));
p.handle("archeon:writeArcon", async (a, e, s) => b.writeArconFile(e, s));
p.handle("rules:copyTemplates", async (a, { files: e, targetDir: s }) => {
  const t = await import("fs/promises"), r = process.env.VITE_DEV_SERVER_URL ? l.join(S, "..", "rules_templates") : l.join(process.resourcesPath, "rules_templates"), o = { created: [], failed: [] };
  for (const d of e) {
    const i = l.join(r, d), h = l.join(s, d);
    try {
      const c = await t.readFile(i, "utf-8");
      await t.mkdir(l.dirname(h), { recursive: !0 }), await t.writeFile(h, c, "utf-8"), o.created.push(d);
    } catch (c) {
      o.failed.push({ file: d, error: c.message });
    }
  }
  return o;
});
p.handle("fs:readFile", async (a, e) => {
  const s = await import("fs/promises");
  try {
    return { success: !0, content: await s.readFile(e, "utf-8") };
  } catch (t) {
    return { success: !1, error: t.message };
  }
});
p.handle("fs:writeFile", async (a, e, s) => {
  const t = await import("fs/promises"), n = await import("path");
  try {
    const r = n.dirname(e);
    return await t.mkdir(r, { recursive: !0 }), await t.writeFile(e, s, "utf-8"), { success: !0 };
  } catch (r) {
    return { success: !1, error: r.message };
  }
});
p.handle("shell:exec", async (a, e, s = {}) => {
  try {
    const { stdout: t, stderr: n } = await E(e, {
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
p.handle("shell:openExternal", async (a, e) => {
  try {
    return await C.openExternal(e), { success: !0 };
  } catch (s) {
    return { success: !1, error: s.message };
  }
});
p.handle("shell:openFile", async (a, e, s) => {
  try {
    const t = l.join(e, s);
    try {
      return await E(`code "${t}"`), { success: !0 };
    } catch {
      return await C.openPath(t), { success: !0 };
    }
  } catch (t) {
    return { success: !1, error: t.message };
  }
});
p.handle("archeon:getShapes", async () => {
  const a = await import("fs/promises"), e = k.homedir(), s = process.env.PIPX_HOME || l.join(e, ".local/pipx"), t = [
    `${e}/.local/bin`,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    process.env.PATH
  ].join(":");
  try {
    let n = null;
    const r = l.join(s, "venvs/archeon/lib");
    try {
      const i = await a.readdir(r);
      for (const h of i)
        if (h.startsWith("python")) {
          const c = l.join(r, h, "site-packages/archeon/architectures");
          try {
            await a.access(c), n = c, console.log("[getShapes] Found architectures in pipx venv:", c);
            break;
          } catch {
          }
        }
    } catch {
      console.log("[getShapes] pipx venv not found at:", r);
    }
    if (!n)
      try {
        const { stdout: i } = await E(
          "pipx runpip archeon show archeon",
          { timeout: 1e4, env: { ...process.env, PATH: t } }
        ), h = i.match(/Location:\s*(.+)/);
        if (h) {
          const c = l.join(h[1].trim(), "archeon/architectures");
          try {
            await a.access(c), n = c, console.log("[getShapes] Found architectures via pipx runpip:", c);
          } catch {
          }
        }
      } catch (i) {
        console.log("[getShapes] pipx runpip failed:", i.message);
      }
    if (!n)
      try {
        const { stdout: i } = await E(
          "which archeon || echo ~/.local/bin/archeon",
          { timeout: 5e3, env: { ...process.env, PATH: t } }
        ), h = i.trim().replace(/^~/, e), c = await a.realpath(h).catch(() => h);
        if (console.log("[getShapes] archeon binary at:", c), c.includes("pipx/venvs/archeon")) {
          const w = c.split("/bin/")[0], u = l.join(w, "lib"), f = await a.readdir(u);
          for (const m of f)
            if (m.startsWith("python")) {
              const v = l.join(u, m, "site-packages/archeon/architectures");
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
        l.join(e, ".local/lib/python3.13/site-packages/archeon/architectures"),
        l.join(e, ".local/lib/python3.12/site-packages/archeon/architectures"),
        l.join(e, ".local/lib/python3.11/site-packages/archeon/architectures"),
        "/usr/local/lib/python3.13/site-packages/archeon/architectures",
        "/usr/local/lib/python3.12/site-packages/archeon/architectures",
        "/opt/homebrew/lib/python3.13/site-packages/archeon/architectures",
        "/opt/homebrew/lib/python3.12/site-packages/archeon/architectures"
      ];
      for (const h of i)
        try {
          await a.access(h), n = h, console.log("[getShapes] Found architectures in fallback path:", h);
          break;
        } catch {
        }
    }
    if (!n)
      return console.log("[getShapes] No architectures directory found"), { success: !1, error: "Archeon architectures not found. Try reinstalling CLI.", shapes: [] };
    console.log("[getShapes] Using architectures directory:", n);
    const o = await a.readdir(n, { withFileTypes: !0 }), d = [];
    for (const i of o) {
      if (i.isDirectory() || !i.name.endsWith(".shape.json")) continue;
      const h = l.join(n, i.name), c = i.name.replace(".shape.json", "");
      try {
        const w = await a.readFile(h, "utf-8"), u = JSON.parse(w), f = {
          id: c,
          name: u.name || c.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
          description: u.description || `${c} architecture template`,
          icon: u.icon || "📦",
          tags: u.tags || []
        };
        f.tags.length === 0 && (c.includes("vue") && f.tags.push("Vue"), c.includes("react") && f.tags.push("React"), (c.includes("nextjs") || c.includes("next")) && f.tags.push("Next.js"), c.includes("fastapi") && f.tags.push("FastAPI", "Python"), c.includes("express") && f.tags.push("Express", "Node.js"), c.includes("django") && f.tags.push("Django", "Python"), c.includes("mongo") && f.tags.push("MongoDB")), d.push(f), console.log("[getShapes] Loaded shape:", c);
      } catch (w) {
        console.warn("[getShapes] Failed to parse shape file:", i.name, w.message);
      }
    }
    return console.log("[getShapes] Total shapes found:", d.length), { success: !0, shapes: d, path: n };
  } catch (n) {
    return console.error("[getShapes] Error:", n), { success: !1, error: n.message, shapes: [] };
  }
});
p.handle("shell:checkCommand", async (a, e) => {
  try {
    const s = k.homedir(), t = [
      `${s}/.local/bin`,
      "/opt/homebrew/bin",
      "/usr/local/bin",
      process.env.PATH
    ].join(":"), n = e.replace(/^~/, s).replace(/\s~\//g, ` ${s}/`);
    console.log(`[checkCommand] Original: ${e}`), console.log(`[checkCommand] Expanded: ${n}`);
    const { stdout: r } = await E(n, {
      timeout: 5e3,
      env: { ...process.env, PATH: t }
    });
    return console.log(`[checkCommand] Success: ${r.trim()}`), { success: !0, output: r.trim() };
  } catch (s) {
    return console.log(`[checkCommand] Failed: ${s.message}`), { success: !1, error: s.message };
  }
});
p.handle("fs:checkDirExists", async (a, e) => {
  try {
    return (await (await import("fs/promises")).stat(e)).isDirectory();
  } catch {
    return !1;
  }
});
p.handle("fs:fileExists", async (a, e) => {
  try {
    return (await (await import("fs/promises")).stat(e)).isFile();
  } catch {
    return !1;
  }
});
p.handle("fs:findClientDir", async (a, e) => {
  const s = await import("fs/promises"), t = await import("path");
  try {
    const n = t.join(e, "client");
    try {
      if ((await s.stat(n)).isDirectory()) {
        const d = t.join(n, "package.json");
        try {
          return await s.access(d), { success: !0, path: n, hasPackageJson: !0 };
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
p.handle("fs:readPackageJson", async (a, e) => {
  const s = await import("fs/promises"), t = await import("path");
  try {
    const n = t.join(e, "package.json"), r = await s.readFile(n, "utf-8"), o = JSON.parse(r), d = o.scripts || {};
    let i = null, h = null;
    const c = ["dev", "start", "serve", "develop", "run"];
    for (const w of c)
      if (d[w]) {
        i = w, h = d[w];
        break;
      }
    return {
      success: !0,
      name: o.name,
      scripts: d,
      devScript: i,
      devCommand: h
    };
  } catch (n) {
    return { success: !1, error: n.message };
  }
});
function j(a, e) {
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
    errors: a.filter(
      (r) => !s.some((o) => r.includes(o))
    ),
    warnings: e.filter(
      (r) => !t.some((o) => r.includes(o))
    )
  };
}
p.handle("archeon:validate", async (a, e) => {
  var s, t;
  if (!e)
    return { success: !1, error: "No project path provided" };
  try {
    const { stdout: n, stderr: r } = await E("arc validate", {
      cwd: e,
      timeout: 3e4
      // 30 second timeout
    }), o = n + r, d = o.includes("Validation passed") || o.includes("✓"), i = o.match(/Chains:\s*(\d+)/), h = o.match(/Glyphs:\s*(\d+)/);
    let c = [];
    const w = o.matchAll(/•\s*ERR:[^\n]+/g);
    for (const P of w)
      c.push(P[0].replace("• ", ""));
    let u = [];
    const f = o.matchAll(/•\s*WARN:[^\n]+/g);
    for (const P of f)
      u.push(P[0].replace("• ", ""));
    const m = j(c, u);
    return c = m.errors, u = m.warnings, {
      success: !0,
      isValid: c.length === 0,
      chains: i ? parseInt(i[1]) : 0,
      glyphs: h ? parseInt(h[1]) : 0,
      errors: c,
      warnings: u,
      output: o
    };
  } catch (n) {
    const r = (n.stdout || "") + (n.stderr || "");
    let o = [];
    const d = r.matchAll(/•\s*ERR:[^\n]+/g);
    for (const u of d)
      o.push(u[0].replace("• ", ""));
    let i = [];
    const h = r.matchAll(/•\s*WARN:[^\n]+/g);
    for (const u of h)
      i.push(u[0].replace("• ", ""));
    const c = j(o, i);
    o = c.errors, i = c.warnings;
    const w = o.length === 0;
    return (s = n.message) != null && s.includes("not found") || (t = n.message) != null && t.includes("ENOENT") ? {
      success: !1,
      error: "arc command not found. Make sure it's installed and in PATH."
    } : {
      success: !0,
      isValid: w,
      errors: o,
      warnings: i,
      output: r
    };
  }
});
g.whenReady().then(T);
g.on("window-all-closed", () => {
  process.platform !== "darwin" && g.quit();
});
g.on("activate", () => {
  D.getAllWindows().length === 0 && T();
});
