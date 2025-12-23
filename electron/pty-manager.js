import pty from "node-pty";
import os from "os";

export class PtyManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.terminals = new Map();
    this.nextId = 1;
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
    const shell =
      process.env.SHELL ||
      (os.platform() === "win32" ? "powershell.exe" : "zsh");

    const cwd = options.cwd || os.homedir();
    const cols = options.cols || 80;
    const rows = options.rows || 24;

    const env = {
      ...process.env,
      ...options.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    };

    const ptyProcess = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env,
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
    if (ptyProcess) {
      ptyProcess.resize(cols, rows);
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
