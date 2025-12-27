<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import { useTerminalStore, useUIStore } from "../stores";
import { useProjectStore } from "../stores/project";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import SetupModal from "./SetupModal.vue";

const terminalStore = useTerminalStore();
const uiStore = useUIStore();
const projectStore = useProjectStore();

const terminalRef = ref(null);
const terminalContainerRef = ref(null);

// Dragging state
const isDragging = ref(false);
const dragOffset = ref({ x: 0, y: 0 });

// Resizing state
const isResizing = ref(false);
const resizeDirection = ref(null);
const resizeStartPos = ref({ x: 0, y: 0 });
const resizeStartSize = ref({ width: 0, height: 0 });
const resizeStartPosition = ref({ x: 0, y: 0 });

// Panel position (bottom-left default, stored in pixels from bottom-left)
const panelPosition = ref({ x: 16, y: 16 });

let terminal = null;
let fitAddon = null;
let ptyId = null;
let cleanupDataListener = null;
let cleanupExitListener = null;

// NPM command states
const isRunningNpmCommand = ref(false);
const devServerUrl = ref(null);
const clientDir = ref(null);
const devScriptName = ref("dev");
const isDevServerRunning = ref(false);

const isExpanded = computed(() => terminalStore.isExpanded);

// Check if project has files/directories (not empty)
const hasProjectContent = computed(() => {
  if (!projectStore.projectPath) return false;
  // Project is considered to have content if it has arconData or indexData
  return !!(
    projectStore.arconData?.chains?.length > 0 || projectStore.indexData
  );
});

// Check if we're running in Electron
const isElectron = computed(() => !!window.electronAPI);

// Computed style for panel positioning
const panelStyle = computed(() => ({
  width: `${terminalStore.width}px`,
  height: `${terminalStore.height}px`,
  left: `${panelPosition.value.x}px`,
  bottom: `${panelPosition.value.y}px`,
}));

async function initTerminal() {
  if (!terminalRef.value) return;

  // If terminal already exists, just re-fit and scroll to bottom
  if (terminal) {
    await nextTick();
    try {
      fitAddon?.fit();
      resizePty();
      terminal.scrollToBottom();
      terminal.focus();
    } catch (e) {
      console.warn("Terminal re-init skipped:", e.message);
    }
    return;
  }

  terminal = new Terminal({
    theme: {
      background: "#0d0d1a",
      foreground: "#e2e8f0",
      cursor: "#22c55e",
      cursorAccent: "#0d0d1a",
      selectionBackground: "#4a4a6a",
      black: "#1a1a2e",
      red: "#ef4444",
      green: "#22c55e",
      yellow: "#eab308",
      blue: "#3b82f6",
      magenta: "#a855f7",
      cyan: "#06b6d4",
      white: "#e2e8f0",
      brightBlack: "#4a4a6a",
      brightRed: "#f87171",
      brightGreen: "#4ade80",
      brightYellow: "#facc15",
      brightBlue: "#60a5fa",
      brightMagenta: "#c084fc",
      brightCyan: "#22d3ee",
      brightWhite: "#f8fafc",
    },
    fontFamily:
      '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
    fontSize: 14,
    lineHeight: 1.2,
    cursorBlink: true,
    cursorStyle: "block",
    allowProposedApi: true,
    scrollback: 5000,
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(terminalRef.value);

  // Initial fit
  await nextTick();
  fitAddon.fit();

  if (isElectron.value) {
    // Real PTY mode - spawn actual shell
    await spawnPty();
  } else {
    // Fallback for browser dev - show message
    terminal.write(
      "\x1b[33m╔══════════════════════════════════════════════════╗\x1b[0m\r\n"
    );
    terminal.write(
      "\x1b[33m║\x1b[0m  Running in browser mode (no real terminal)     \x1b[33m║\x1b[0m\r\n"
    );
    terminal.write(
      "\x1b[33m║\x1b[0m  Run with Electron for full terminal support    \x1b[33m║\x1b[0m\r\n"
    );
    terminal.write(
      "\x1b[33m╚══════════════════════════════════════════════════╝\x1b[0m\r\n"
    );
  }
}

async function spawnPty() {
  if (!window.electronAPI) return;

  // Get cwd from projectStore, or fall back to localStorage directly
  const savedPath = localStorage.getItem("archeon:lastProjectPath");
  const cwd = projectStore.projectPath || savedPath || undefined;
  const { cols, rows } = fitAddon.proposeDimensions() || { cols: 80, rows: 24 };

  try {
    const result = await window.electronAPI.ptySpawn({ cwd, cols, rows });
    ptyId = result.id;
    // Also store in terminal store so SetupModal can access it
    terminalStore.setPtyId(ptyId);

    // Listen for PTY data
    cleanupDataListener = window.electronAPI.onPtyData(({ id, data }) => {
      if (id === ptyId && terminal) {
        terminal.write(data);
        // Auto-scroll to bottom to keep cursor visible
        terminal.scrollToBottom();
      }
    });

    // Listen for PTY exit
    cleanupExitListener = window.electronAPI.onPtyExit(({ id, exitCode }) => {
      if (id === ptyId) {
        terminal.write(
          `\r\n\x1b[33mProcess exited with code ${exitCode}\x1b[0m\r\n`
        );
        ptyId = null;
        terminalStore.setPtyId(null);
      }
    });

    // Send terminal input to PTY
    terminal.onData((data) => {
      if (ptyId !== null) {
        window.electronAPI.ptyWrite(ptyId, data);
      }
    });
  } catch (error) {
    terminal.write(
      `\x1b[31mFailed to spawn terminal: ${error.message}\x1b[0m\r\n`
    );
  }
}

function destroyTerminal() {
  // Kill PTY process
  if (ptyId !== null && window.electronAPI) {
    window.electronAPI.ptyKill(ptyId);
    ptyId = null;
    terminalStore.setPtyId(null);
  }

  // Cleanup listeners
  if (cleanupDataListener) {
    cleanupDataListener();
    cleanupDataListener = null;
  }
  if (cleanupExitListener) {
    cleanupExitListener();
    cleanupExitListener = null;
  }

  // Dispose terminal
  if (terminal) {
    terminal.dispose();
    terminal = null;
    fitAddon = null;
  }
}

// Resize PTY when terminal dimensions change
function resizePty() {
  if (!fitAddon || !window.electronAPI || ptyId === null || !terminal) return;

  try {
    const dims = fitAddon.proposeDimensions();
    // Only resize if we have valid positive dimensions
    if (dims && dims.cols > 0 && dims.rows > 0) {
      window.electronAPI.ptyResize(ptyId, dims.cols, dims.rows);
      // Scroll to bottom after resize to keep cursor visible
      terminal.scrollToBottom();
    }
  } catch (e) {
    // Ignore resize errors when terminal isn't ready
    console.warn("Terminal resize skipped:", e.message);
  }
}

// Resize handlers
function startResize(e, direction) {
  e.preventDefault();
  e.stopPropagation();

  isResizing.value = true;
  resizeDirection.value = direction;
  resizeStartPos.value = { x: e.clientX, y: e.clientY };
  resizeStartSize.value = {
    width: terminalStore.width,
    height: terminalStore.height,
  };
  resizeStartPosition.value = { ...panelPosition.value };

  window.addEventListener("mousemove", handleResizeMove);
  window.addEventListener("mouseup", stopResize);
}

function handleResizeMove(e) {
  if (!isResizing.value) return;

  const deltaX = e.clientX - resizeStartPos.value.x;
  const deltaY = e.clientY - resizeStartPos.value.y;
  const dir = resizeDirection.value;

  let newWidth = resizeStartSize.value.width;
  let newHeight = resizeStartSize.value.height;
  let newX = resizeStartPosition.value.x;
  let newY = resizeStartPosition.value.y;

  // Handle different resize directions
  // East edge: drag right increases width, left edge stays fixed
  if (dir.includes("e")) {
    newWidth = Math.max(300, resizeStartSize.value.width + deltaX);
  }

  // West edge: drag left increases width and moves left edge
  if (dir.includes("w")) {
    const potentialWidth = resizeStartSize.value.width - deltaX;
    newWidth = Math.max(300, potentialWidth);
    // Move X position by how much we actually changed width
    const actualWidthChange = newWidth - resizeStartSize.value.width;
    newX = resizeStartPosition.value.x - actualWidthChange;
  }

  // North edge: drag up increases height (bottom stays fixed due to bottom positioning)
  if (dir.includes("n")) {
    newHeight = Math.max(200, resizeStartSize.value.height - deltaY);
  }

  // South edge: drag down increases height, need to move bottom position down
  if (dir.includes("s")) {
    const potentialHeight = resizeStartSize.value.height + deltaY;
    newHeight = Math.max(200, potentialHeight);
    // Move Y (bottom) position down by how much we actually changed height
    const actualHeightChange = newHeight - resizeStartSize.value.height;
    newY = resizeStartPosition.value.y - actualHeightChange;
  }

  // Clamp position
  newX = Math.max(0, newX);
  newY = Math.max(0, newY);

  terminalStore.resize(newWidth, newHeight);
  panelPosition.value = { x: newX, y: newY };

  // Refit terminal after resize
  nextTick(() => {
    fitAddon?.fit();
    resizePty();
  });
}

function stopResize() {
  isResizing.value = false;
  resizeDirection.value = null;
  window.removeEventListener("mousemove", handleResizeMove);
  window.removeEventListener("mouseup", stopResize);

  // Final fit after resize completes
  nextTick(() => {
    fitAddon?.fit();
    resizePty();
  });
}

// Drag handlers
function startDrag(e) {
  // Only drag from header, not buttons
  if (e.target.closest("button")) return;

  e.preventDefault();
  isDragging.value = true;

  // Calculate offset from panel position to mouse
  const rect = terminalContainerRef.value.getBoundingClientRect();
  dragOffset.value = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };

  window.addEventListener("mousemove", handleDrag);
  window.addEventListener("mouseup", stopDrag);
}

function handleDrag(e) {
  if (!isDragging.value) return;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Calculate new position (convert from mouse position to bottom-left origin)
  let newX = e.clientX - dragOffset.value.x;
  let newY =
    viewportHeight - (e.clientY - dragOffset.value.y + terminalStore.height);

  // Clamp to viewport bounds
  newX = Math.max(0, Math.min(newX, viewportWidth - terminalStore.width));
  newY = Math.max(0, Math.min(newY, viewportHeight - terminalStore.height));

  panelPosition.value = { x: newX, y: newY };
}

function stopDrag() {
  isDragging.value = false;
  window.removeEventListener("mousemove", handleDrag);
  window.removeEventListener("mouseup", stopDrag);
}

function handleToggle() {
  const wasExpanded = terminalStore.isExpanded;
  terminalStore.toggle();

  // When closing, explicitly clear focus to restore canvas interactions
  if (wasExpanded) {
    terminalStore.setFocus(false);
    uiStore.setFocus(null);
  }
}

function handleFocus() {
  terminalStore.setFocus(true);
  uiStore.setFocus("terminal");
  terminal?.focus();
}

function handleBlur() {
  terminalStore.setFocus(false);
  // Only clear focus if terminal is actually closing
  if (!terminalStore.isExpanded) {
    uiStore.setFocus(null);
  }
}

// NPM command handlers

// Find the client directory and get package.json info
async function findClientDirectory() {
  if (!window.electronAPI || !projectStore.projectPath) {
    return null;
  }

  try {
    const result = await window.electronAPI.findClientDir(
      projectStore.projectPath
    );
    if (result.success) {
      clientDir.value = result.path;

      // Read package.json to find dev script
      if (result.hasPackageJson) {
        const pkgResult = await window.electronAPI.readPackageJson(result.path);
        if (pkgResult.success && pkgResult.devScript) {
          devScriptName.value = pkgResult.devScript;
        }
      }

      return result.path;
    }
  } catch (error) {
    console.error("Error finding client directory:", error);
  }
  return null;
}

// Parse terminal output to extract URL
function parseUrlFromOutput(data) {
  // Common patterns for dev server URLs - clean ANSI codes first
  const cleanData = data.replace(/\x1b\[[0-9;]*m/g, "");

  const patterns = [
    /➜\s+Local:\s+(https?:\/\/[^\s\x1b]+)/i,
    /Local:\s+(https?:\/\/[^\s\x1b]+)/i,
    /Network:\s+(https?:\/\/[^\s\x1b]+)/i,
    /localhost:\s*(https?:\/\/[^\s\x1b]+)/i,
    /running at\s+(https?:\/\/[^\s\x1b]+)/i,
    /Server running at\s+(https?:\/\/[^\s\x1b]+)/i,
    /App running at:\s+(https?:\/\/[^\s\x1b]+)/i,
    /listening on\s+(https?:\/\/[^\s\x1b]+)/i,
    /(https?:\/\/localhost:\d+)/i,
    /(https?:\/\/127\.0\.0\.1:\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = cleanData.match(pattern);
    if (match) {
      // Clean trailing slashes and special chars
      return match[1].replace(/[\/\s]+$/, "");
    }
  }
  return null;
}

async function handleNpmInstall() {
  if (!window.electronAPI || ptyId === null || !projectStore.projectPath) {
    terminal?.write(
      "\x1b[31mNo project selected. Open a project first.\x1b[0m\r\n"
    );
    return;
  }

  isRunningNpmCommand.value = true;

  // Find the client directory
  const targetDir = await findClientDirectory();
  if (!targetDir) {
    terminal?.write(
      "\x1b[31mNo package.json found in project or client directory.\x1b[0m\r\n"
    );
    isRunningNpmCommand.value = false;
    return;
  }

  // cd to client directory and run npm install
  const fullCommand = `cd "${targetDir}" && npm install\n`;
  window.electronAPI.ptyWrite(ptyId, fullCommand);

  // Reset running state after a short delay
  setTimeout(() => {
    isRunningNpmCommand.value = false;
  }, 1000);
}

async function handleNpmRun() {
  if (!window.electronAPI || ptyId === null || !projectStore.projectPath) {
    terminal?.write(
      "\x1b[31mNo project selected. Open a project first.\x1b[0m\r\n"
    );
    return;
  }

  isRunningNpmCommand.value = true;
  devServerUrl.value = null; // Reset URL for new run
  isDevServerRunning.value = true;

  // Find the client directory
  const targetDir = await findClientDirectory();
  if (!targetDir) {
    terminal?.write(
      "\x1b[31mNo package.json found in project or client directory.\x1b[0m\r\n"
    );
    isRunningNpmCommand.value = false;
    isDevServerRunning.value = false;
    return;
  }

  // Replace the data listener with one that continuously monitors for URL
  if (cleanupDataListener) {
    cleanupDataListener();
  }

  cleanupDataListener = window.electronAPI.onPtyData(({ id, data }) => {
    if (id === ptyId && terminal) {
      terminal.write(data);
      terminal.scrollToBottom();

      // Always try to capture/update URL from output (port may change on restart)
      const url = parseUrlFromOutput(data);
      if (url) {
        devServerUrl.value = url;
        console.log("Dev server URL captured:", url);
      }
    }
  });

  // cd to client directory and run the dev script
  const fullCommand = `cd "${targetDir}" && npm run ${devScriptName.value}\n`;
  window.electronAPI.ptyWrite(ptyId, fullCommand);

  // Reset running state after a short delay (command continues in background)
  setTimeout(() => {
    isRunningNpmCommand.value = false;
  }, 1000);
}

async function handleNpmPreview() {
  if (!devServerUrl.value) {
    terminal?.write(
      "\x1b[33mNo dev server URL detected yet. Run the dev server first.\x1b[0m\r\n"
    );
    return;
  }

  // Open the captured dev server URL in system browser
  const url = devServerUrl.value;
  console.log("Opening preview URL:", url);

  if (window.electronAPI?.openExternal) {
    await window.electronAPI.openExternal(url);
  } else {
    // Fallback for browser dev mode
    window.open(url, "_blank");
  }
}

// Watch for expansion to initialize terminal
watch(isExpanded, (expanded) => {
  if (expanded) {
    nextTick(async () => {
      await initTerminal();
      handleFocus();
      // Ensure fit after panel is visible
      setTimeout(() => {
        if (terminal && fitAddon) {
          try {
            fitAddon.fit();
            resizePty();
            terminal.scrollToBottom();
            terminal.focus();
          } catch (e) {
            console.warn("Terminal fit skipped:", e.message);
          }
        }
      }, 100);
    });
  }
});

// Watch for project path changes - cd to new project directory
watch(
  () => projectStore.projectPath,
  (newPath, oldPath) => {
    if (newPath && newPath !== oldPath && ptyId !== null && terminal) {
      // Send cd command to terminal to change to project directory
      const cdCommand = `cd "${newPath}" && clear\n`;
      window.electronAPI?.ptyWrite(ptyId, cdCommand);
    }
  }
);

// Fit terminal on resize
watch(
  () => [terminalStore.width, terminalStore.height],
  () => {
    nextTick(() => {
      fitAddon?.fit();
      resizePty();
    });
  }
);

// Window resize handler
function handleWindowResize() {
  if (terminal && fitAddon && isExpanded.value) {
    fitAddon.fit();
    resizePty();
  }
}

onMounted(() => {
  window.addEventListener("resize", handleWindowResize);

  // Initialize terminal immediately - DOM is always present now
  nextTick(async () => {
    await initTerminal();
    if (isExpanded.value) {
      handleFocus();
    }
  });
});

onUnmounted(() => {
  window.removeEventListener("resize", handleWindowResize);
  destroyTerminal();
});
</script>

<template>
  <!-- Collapsed State - Floating Button -->
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    enter-from-class="opacity-0 scale-90"
    enter-to-class="opacity-100 scale-100"
    leave-active-class="transition-all duration-150 ease-in"
    leave-from-class="opacity-100 scale-100"
    leave-to-class="opacity-0 scale-90"
  >
    <button
      v-if="!isExpanded"
      @click="handleToggle"
      class="fixed bottom-4 left-4 z-[100] flex items-center px-4 py-3 bg-terminal-bg border border-ui-border rounded-lg shadow-lg hover:bg-ui-bgLight transition-colors group"
    >
      <svg
        class="w-5 h-5 text-terminal-text"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    </button>
  </Transition>

  <!-- Expanded State - Draggable/Resizable Terminal Panel -->
  <!-- NO v-if - keep DOM alive, use visibility + position to hide -->
  <div
    ref="terminalContainerRef"
    class="terminal-panel fixed z-[100] flex flex-col bg-terminal-bg border border-ui-border rounded-lg shadow-2xl transition-opacity duration-200"
    :class="{
      'select-none': isDragging || isResizing,
      'opacity-0 pointer-events-none': !isExpanded,
      'opacity-100 pointer-events-auto': isExpanded,
    }"
    :style="{
      ...panelStyle,
      visibility: isExpanded ? 'visible' : 'hidden',
      transform: isExpanded ? 'none' : 'translateX(-9999px)',
    }"
  >
    <!-- Resize Handles - All edges and corners -->
    <div
      class="absolute -top-1 left-3 right-3 h-2 cursor-ns-resize z-10 hover:bg-green-500/20"
      @mousedown="(e) => startResize(e, 'n')"
    />
    <div
      class="absolute -bottom-1 left-3 right-3 h-2 cursor-ns-resize z-10 hover:bg-green-500/20"
      @mousedown="(e) => startResize(e, 's')"
    />
    <div
      class="absolute top-3 bottom-3 -right-1 w-2 cursor-ew-resize z-10 hover:bg-green-500/20"
      @mousedown="(e) => startResize(e, 'e')"
    />
    <div
      class="absolute top-3 bottom-3 -left-1 w-2 cursor-ew-resize z-10 hover:bg-green-500/20"
      @mousedown="(e) => startResize(e, 'w')"
    />
    <div
      class="absolute -top-1 -left-1 w-3 h-3 cursor-nwse-resize z-20 hover:bg-green-500/20"
      @mousedown="(e) => startResize(e, 'nw')"
    />
    <div
      class="absolute -top-1 -right-1 w-3 h-3 cursor-nesw-resize z-20 hover:bg-green-500/20"
      @mousedown="(e) => startResize(e, 'ne')"
    />
    <div
      class="absolute -bottom-1 -left-1 w-3 h-3 cursor-nesw-resize z-20 hover:bg-green-500/20"
      @mousedown="(e) => startResize(e, 'sw')"
    />
    <div
      class="absolute -bottom-1 -right-1 w-3 h-3 cursor-nwse-resize z-20 hover:bg-green-500/20"
      @mousedown="(e) => startResize(e, 'se')"
    />

    <!-- Header (Draggable) -->
    <div
      class="terminal-header flex items-center justify-between px-3 py-2 bg-ui-bg border-b border-ui-border rounded-t-lg cursor-move shrink-0"
      @mousedown="startDrag"
    >
      <div class="flex items-center gap-2 pointer-events-none">
        <svg
          class="w-4 h-4 text-terminal-text"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span class="text-sm font-medium text-ui-text">Terminal</span>
        <span class="text-xs text-ui-textMuted">zsh</span>
        <button
          @click.stop="uiStore.openSetupModal"
          :disabled="!projectStore.projectPath"
          class="px-2 py-1 text-xs font-medium rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors pointer-events-auto"
          title="Setup"
        >
          Setup
        </button>
      </div>

      <!-- NPM Command Buttons -->
      <div class="flex items-center gap-1 pointer-events-auto">
        <button
          @click.stop="handleNpmInstall"
          :disabled="isRunningNpmCommand || !hasProjectContent"
          class="px-2 py-1 text-xs font-medium rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="NPM install"
        >
          NPM Install
        </button>
        <button
          @click.stop="handleNpmRun"
          :disabled="isRunningNpmCommand || !hasProjectContent"
          class="px-2 py-1 text-xs font-medium rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          :title="`npm run ${devScriptName}`"
        >
          Run
        </button>
        <button
          @click.stop="handleNpmPreview"
          :disabled="!devServerUrl"
          class="px-2 py-1 text-xs font-medium rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
          :title="
            devServerUrl ? `Open ${devServerUrl}` : 'Run dev server first'
          "
        >
          <svg
            class="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
          <span>{{
            devServerUrl
              ? devServerUrl.replace("http://", "").replace("https://", "")
              : "Preview"
          }}</span>
        </button>

        <div class="w-px h-4 bg-ui-border mx-1"></div>

        <button
          @click.stop="handleToggle"
          class="p-1.5 rounded hover:bg-ui-bgLight text-ui-textMuted hover:text-ui-text transition-colors"
          title="Minimize (`)"
        >
          <svg
            class="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M20 12H4"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- Terminal Content - Critical: min-h-0 for flex, explicit overflow -->
    <div
      ref="terminalRef"
      class="terminal-content flex-1 min-h-0"
      @click="handleFocus"
    />
  </div>
</template>

<style scoped>
/* Terminal panel - isolated layer, no transforms that break xterm */
.terminal-panel {
  contain: layout style;
}

/* Terminal content wrapper - CRITICAL: min-h-0 + flex-1 for proper flex sizing */
.terminal-content {
  padding: 4px;
  overflow: hidden;
}

/* xterm.js styles - ensure proper sizing without clipping */
:deep(.xterm) {
  height: 100%;
  padding: 4px;
}

:deep(.xterm-viewport) {
  /* Allow scrolling within terminal */
  overflow-y: auto !important;
}

:deep(.xterm-screen) {
  height: 100%;
}

/* Prevent canvas clipping from border-radius */
:deep(.xterm .xterm-screen canvas) {
  display: block;
}
</style>
