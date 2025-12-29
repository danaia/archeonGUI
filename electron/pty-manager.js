import pty from "node-pty";
import os from "os";
import fs from "fs";

export class PtyManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.terminals = new Map();
    this.nextId = 1;
  }

  /**
   * Determine the shell to use based on OS and availability
   * @returns {string} - Shell executable path
   */
  getShell() {
    // First, try the SHELL environment variable
    if (process.env.SHELL && fs.existsSync(process.env.SHELL)) {
      return process.env.SHELL;
    }

    const platform = os.platform();

    if (platform === "win32") {
      return "powershell.exe";
    }

    // For macOS and Linux, try common shell paths in order
    const shellPaths = [
      "/bin/zsh",        // Modern macOS and Ubuntu
      "/usr/bin/zsh",    // Alternative Linux location
      "/bin/bash",       // Fallback
      "/usr/bin/bash",   // Alternative bash location
      "/bin/sh",         // Last resort
    ];

    for (const shellPath of shellPaths) {
      if (fs.existsSync(shellPath)) {
        return shellPath;
      }
    }

    // Default fallback
    return platform === "darwin" ? "/bin/zsh" : "/bin/bash";
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
  spawn(options = {}) {
    const shell = this.getShell();
    let cwd = options.cwd || os.homedir();
    const cols = options.cols || 80;
    const rows = options.rows || 24;
    const platform = os.platform();
    const homeDir = os.homedir();

    // Validate that cwd exists, fall back to home if it doesn't
    if (!fs.existsSync(cwd)) {
      console.warn(`[PTY] Requested directory doesn't exist: ${cwd}, falling back to home`);
      cwd = homeDir;
    }

    console.log(`[PTY] Spawning shell: ${shell}`);
    console.log(`[PTY] Working directory: ${cwd}`);
    console.log(`[PTY] Platform: ${platform}`);

    // Build a proper PATH that includes common binary locations
    // This is crucial for packaged Electron apps launched from Finder/Dock
    // which don't inherit the user's shell PATH
    const defaultPaths = [
      `${homeDir}/.local/bin`,           // pipx installs here
      `${homeDir}/.cargo/bin`,           // Rust binaries
      `${homeDir}/.pyenv/shims`,         // pyenv
      `${homeDir}/.nvm/versions/node`,   // nvm (partial)
      '/opt/homebrew/bin',               // Homebrew on Apple Silicon
      '/opt/homebrew/sbin',
      '/usr/local/bin',                  // Homebrew on Intel Mac / Linux
      '/usr/local/sbin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
    ];

    // Merge with existing PATH, putting user paths first
    const existingPath = process.env.PATH || '';
    const pathSet = new Set([...defaultPaths, ...existingPath.split(':')]);
    const fullPath = Array.from(pathSet).filter(p => p).join(':');

    // Prepare environment variables
    const env = {
      ...process.env,
      ...options.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      PATH: fullPath,
      HOME: homeDir,
      SHELL: shell,
      // Ensure locale is set for proper character handling
      LANG: process.env.LANG || 'en_US.UTF-8',
      LC_ALL: process.env.LC_ALL || 'en_US.UTF-8',
    };

    // Use login shell arguments for zsh/bash to load profile
    // Also use -i for interactive to ensure .zshrc/.bashrc are sourced
    const shellArgs = [];
    if (shell.includes('zsh')) {
      shellArgs.push('-l', '-i'); // Login + interactive for zsh
    } else if (shell.includes('bash')) {
      shellArgs.push('-l', '-i'); // Login + interactive for bash
    }

    console.log(`[PTY] Shell args: ${JSON.stringify(shellArgs)}`);
    console.log(`[PTY] PATH includes ~/.local/bin: ${fullPath.includes('.local/bin')}`);

    try {
      const ptyProcess = pty.spawn(shell, shellArgs, {
        name: "xterm-256color",
        cols,
        rows,
        cwd,
        env,
        useConpty: false, // Disable ConPTY on Windows, doesn't affect macOS/Linux
      });

      const id = this.nextId++;
      this.terminals.set(id, ptyProcess);

      // Forward data from PTY to renderer
      ptyProcess.onData((data) => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send("pty:data", { id, data });
        }
      });

      // Handle PTY exit
      ptyProcess.onExit(({ exitCode, signal }) => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send("pty:exit", { id, exitCode, signal });
        }
        this.terminals.delete(id);
      });

      return { id, pid: ptyProcess.pid };
    } catch (error) {
      console.error(`Failed to spawn PTY with shell ${shell}:`, error);
      throw new Error(`PTY spawn failed: ${error.message}`);
    }
  }

  /**
   * Write data to a PTY
   * @param {number} id - Terminal ID
   * @param {string} data - Data to write
   */
  write(id, data) {
    const ptyProcess = this.terminals.get(id);
    if (ptyProcess) {
      ptyProcess.write(data);
    }
  }

  /**
   * Resize a PTY
   * @param {number} id - Terminal ID
   * @param {number} cols - New columns
   * @param {number} rows - New rows
   */
  resize(id, cols, rows) {
    const ptyProcess = this.terminals.get(id);
    // Only resize if we have valid positive dimensions
    if (ptyProcess && cols > 0 && rows > 0) {
      try {
        ptyProcess.resize(cols, rows);
      } catch (e) {
        console.warn("PTY resize failed:", e.message);
      }
    }
  }

  /**
   * Kill a PTY
   * @param {number} id - Terminal ID
   */
  kill(id) {
    const ptyProcess = this.terminals.get(id);
    if (ptyProcess) {
      ptyProcess.kill();
      this.terminals.delete(id);
    }
  }

  /**
   * Kill all PTYs
   */
  killAll() {
    for (const [id, ptyProcess] of this.terminals) {
      ptyProcess.kill();
    }
    this.terminals.clear();
  }
}
