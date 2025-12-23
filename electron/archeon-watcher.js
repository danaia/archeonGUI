import chokidar from "chokidar";
import path from "path";
import fs from "fs/promises";

export class ArcheonWatcher {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.watcher = null;
    this.projectPath = null;
  }

  /**
   * Start watching an archeon project directory
   * @param {string} projectPath - Root path of the project
   * @returns {Object} - { success, error?, initialData? }
   */
  async watch(projectPath) {
    // Stop any existing watcher
    this.stop();

    this.projectPath = projectPath;
    const archeonDir = path.join(projectPath, "archeon");

    let archeonDirExists = false;
    try {
      await fs.access(archeonDir);
      archeonDirExists = true;
    } catch {
      // archeon/ directory doesn't exist yet - we'll watch for it
      archeonDirExists = false;
    }

    // Read initial data if directory exists
    let initialIndex = {
      success: false,
      error: "archeon/ directory not found",
    };
    let initialArcon = {
      success: false,
      error: "archeon/ directory not found",
    };

    if (archeonDirExists) {
      initialIndex = await this.readIndexFile(projectPath);
      initialArcon = await this.readArconFile(projectPath);
    }

    // Watch the project root for archeon directory creation
    this.rootWatcher = chokidar.watch(projectPath, {
      persistent: true,
      ignoreInitial: true,
      depth: 0, // Only watch immediate children
    });

    this.rootWatcher.on("addDir", async (dirPath) => {
      if (path.basename(dirPath) === "archeon") {
        // archeon directory was created - start watching it
        await this.startArcheonWatcher(projectPath);
      }
    });

    // If archeon dir exists, start watching it immediately
    if (archeonDirExists) {
      await this.startArcheonWatcher(projectPath);
    }

    return {
      success: true,
      initialIndex,
      initialArcon,
    };
  }

  /**
   * Start watching the archeon directory for file changes
   * @param {string} projectPath - Root path of the project
   */
  async startArcheonWatcher(projectPath) {
    const archeonDir = path.join(projectPath, "archeon");

    // Stop existing archeon watcher if any
    if (this.watcher) {
      await this.watcher.close();
    }

    // Set up watcher for archeon directory
    this.watcher = chokidar.watch(archeonDir, {
      persistent: true,
      ignoreInitial: false, // Process existing files on start
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    this.watcher.on("change", async (filePath) => {
      const fileName = path.basename(filePath);

      if (fileName === "ARCHEON.index.json") {
        const data = await this.readIndexFile(projectPath);
        if (data.success && this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send("archeon:index-changed", data);
        }
      } else if (fileName === "ARCHEON.arcon") {
        const data = await this.readArconFile(projectPath);
        if (data.success && this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send("archeon:arcon-changed", data);
        }
      }
    });

    this.watcher.on("add", async (filePath) => {
      const fileName = path.basename(filePath);

      if (fileName === "ARCHEON.index.json") {
        const data = await this.readIndexFile(projectPath);
        if (data.success && this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send("archeon:index-changed", data);
        }
      } else if (fileName === "ARCHEON.arcon") {
        const data = await this.readArconFile(projectPath);
        if (data.success && this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send("archeon:arcon-changed", data);
        }
      }
    });

    this.watcher.on("error", (error) => {
      console.error("Archeon watcher error:", error);
    });
  }

  /**
   * Read and parse ARCHEON.index.json
   * @param {string} projectPath - Root path of the project
   * @returns {Object} - { success, data?, error? }
   */
  async readIndexFile(projectPath) {
    const indexPath = path.join(projectPath, "archeon", "ARCHEON.index.json");

    try {
      const content = await fs.readFile(indexPath, "utf-8");
      const data = JSON.parse(content);
      return { success: true, data, path: indexPath };
    } catch (error) {
      if (error.code === "ENOENT") {
        return { success: false, error: "ARCHEON.index.json not found" };
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Read ARCHEON.arcon file
   * @param {string} projectPath - Root path of the project
   * @returns {Object} - { success, content?, chains?, error? }
   */
  async readArconFile(projectPath) {
    const arconPath = path.join(projectPath, "archeon", "ARCHEON.arcon");

    try {
      const content = await fs.readFile(arconPath, "utf-8");
      const chains = this.parseArconChains(content);
      return { success: true, content, chains, path: arconPath };
    } catch (error) {
      if (error.code === "ENOENT") {
        return { success: false, error: "ARCHEON.arcon not found" };
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse chain definitions from .arcon content
   * @param {string} content - Raw .arcon file content
   * @returns {Array} - Array of parsed chains
   */
  parseArconChains(content) {
    const chains = [];
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith("#")) continue;

      // Match versioned chains: @v1 NED:login => CMP:Form => ...
      const versionMatch = trimmed.match(/^@(\w+)\s+(.+)$/);
      if (versionMatch) {
        const version = versionMatch[1];
        const chainDef = versionMatch[2];
        const glyphs = this.parseChainGlyphs(chainDef);

        chains.push({
          version,
          raw: trimmed,
          glyphs,
        });
        continue;
      }

      // Match orchestrator layer definitions: ORC:main :: PRS:glyph :: ...
      if (trimmed.includes("::")) {
        const glyphs = this.parseContainmentGlyphs(trimmed);
        chains.push({
          type: "orchestrator",
          raw: trimmed,
          glyphs,
        });
      }
    }

    return chains;
  }

  /**
   * Parse glyphs from a chain definition (using => edges)
   * @param {string} chainDef - Chain definition string
   * @returns {Array} - Array of glyph objects
   */
  parseChainGlyphs(chainDef) {
    const glyphs = [];
    // Split by flow operators: =>, ~>, ->
    const parts = chainDef.split(/\s*(?:=>|~>|->)\s*/);

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // Parse glyph: TYPE:name or TYPE:method/path
      const glyphMatch = trimmed.match(/^(\w+):(.+)$/);
      if (glyphMatch) {
        glyphs.push({
          type: glyphMatch[1],
          name: glyphMatch[2],
          key: trimmed,
        });
      }
    }

    return glyphs;
  }

  /**
   * Parse glyphs from containment definition (using :: edges)
   * @param {string} def - Definition string
   * @returns {Array} - Array of glyph objects
   */
  parseContainmentGlyphs(def) {
    const glyphs = [];
    const parts = def.split(/\s*::\s*/);

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      const glyphMatch = trimmed.match(/^(\w+):(.+)$/);
      if (glyphMatch) {
        glyphs.push({
          type: glyphMatch[1],
          name: glyphMatch[2],
          key: trimmed,
        });
      }
    }

    return glyphs;
  }

  /**
   * Write content to ARCHEON.arcon file
   * @param {string} projectPath - Root path of the project
   * @param {string} content - Content to write to the file
   * @returns {Object} - { success, error? }
   */
  async writeArconFile(projectPath, content) {
    const arconPath = path.join(projectPath, "archeon", "ARCHEON.arcon");

    try {
      // Ensure archeon directory exists
      const archeonDir = path.join(projectPath, "archeon");
      try {
        await fs.access(archeonDir);
      } catch {
        await fs.mkdir(archeonDir, { recursive: true });
      }

      await fs.writeFile(arconPath, content, "utf-8");
      return { success: true, path: arconPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop watching
   */
  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.rootWatcher) {
      this.rootWatcher.close();
      this.rootWatcher = null;
    }
    this.projectPath = null;
  }
}
