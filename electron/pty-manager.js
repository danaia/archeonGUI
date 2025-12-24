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
    const cwd = options.cwd || os.homedir();
    const cols = options.cols || 80;
    const rows = options.rows || 24;

    console.log(`[PTY] Spawning shell: ${shell}`);
    console.log(`[PTY] Working directory: ${cwd}`);
    console.log(`[PTY] Platform: ${os.platform()}`);

    // Prepare environment variables
    const env = {
      ...process.env,
      ...options.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    };

    // Use login shell arguments for zsh/bash
    const shellArgs = [];
    if (shell.includes('zsh') || shell.includes('bash')) {
      shellArgs.push('-l'); // Login shell to load profile
    }

    console.log(`[PTY] Shell args: ${JSON.stringify(shellArgs)}`);

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
