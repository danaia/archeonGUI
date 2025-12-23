<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import { useTerminalStore, useUIStore } from "../stores";
import { useProjectStore } from "../stores/project";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

const terminalStore = useTerminalStore();
const uiStore = useUIStore();
const projectStore = useProjectStore();

const terminalRef = ref(null);
const terminalContainerRef = ref(null);
const isResizing = ref(false);
const resizeStartPos = ref({ x: 0, y: 0 });
const resizeStartSize = ref({ width: 0, height: 0 });

let terminal = null;
let fitAddon = null;
let ptyId = null;
let cleanupDataListener = null;
let cleanupExitListener = null;

const isExpanded = computed(() => terminalStore.isExpanded);

// Check if we're running in Electron
const isElectron = computed(() => !!window.electronAPI);

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
  isResizing.value = true;
  resizeStartPos.value = { x: e.clientX, y: e.clientY };
  resizeStartSize.value = {
    width: terminalStore.width,
    height: terminalStore.height,
  };

  const handleMove = (moveEvent) => {
    const deltaX = moveEvent.clientX - resizeStartPos.value.x;
    const deltaY = resizeStartPos.value.y - moveEvent.clientY;

    if (direction === "top" || direction === "corner") {
      terminalStore.resize(
        resizeStartSize.value.width,
        resizeStartSize.value.height + deltaY
      );
    }
    if (direction === "right" || direction === "corner") {
      terminalStore.resize(
        resizeStartSize.value.width + deltaX,
        terminalStore.height
      );
    }

    nextTick(() => {
      fitAddon?.fit();
      resizePty();
    });
  };

  const handleUp = () => {
    isResizing.value = false;
    window.removeEventListener("mousemove", handleMove);
    window.removeEventListener("mouseup", handleUp);
  };

  window.addEventListener("mousemove", handleMove);
  window.addEventListener("mouseup", handleUp);
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

// Watch for expansion to initialize terminal
watch(isExpanded, (expanded) => {
  if (expanded) {
    nextTick(async () => {
      // Small delay to allow v-show to fully render dimensions
      await new Promise((r) => setTimeout(r, 50));
      await initTerminal();
      handleFocus();
      // Ensure scroll to bottom after rendering is complete
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

onMounted(() => {
  // Initialize terminal immediately since v-show keeps DOM alive
  nextTick(async () => {
    // Small delay to ensure DOM is fully ready
    await new Promise((r) => setTimeout(r, 50));
    await initTerminal();
    if (isExpanded.value) {
      handleFocus();
    }
  });
});

onUnmounted(() => {
  destroyTerminal();
});
</script>

<template>
  <div class="fixed bottom-4 left-4 z-50">
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
        class="flex items-center gap-2 px-4 py-3 bg-terminal-bg border border-ui-border rounded-lg shadow-lg hover:bg-ui-bgLight transition-colors group"
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
        <span
          class="text-sm font-medium text-ui-text group-hover:text-terminal-text transition-colors"
        >
          Terminal
        </span>
        <kbd
          class="ml-2 px-1.5 py-0.5 bg-ui-bg rounded text-xs text-ui-textMuted"
        >
          `
        </kbd>
      </button>
    </Transition>

    <!-- Expanded State - Terminal Panel -->
    <!-- Keep terminal in DOM but hide visually when collapsed to preserve state -->
    <div
      ref="terminalContainerRef"
      class="bg-terminal-bg border border-ui-border rounded-lg shadow-2xl overflow-hidden flex flex-col transition-all duration-200"
      :class="{
        'opacity-0 pointer-events-none invisible': !isExpanded,
        'opacity-100 pointer-events-auto visible': isExpanded
      }"
      :style="{
        width: terminalStore.width + 'px',
        height: terminalStore.height + 'px',
        position: isExpanded ? 'relative' : 'absolute',
        left: isExpanded ? 'auto' : '-9999px',
      }"
      @focus="handleFocus"
      @blur="handleBlur"
    >
        <!-- Resize Handle - Top -->
        <div
          class="absolute top-0 left-4 right-4 h-1 cursor-ns-resize hover:bg-tile-borderSelected/30 transition-colors"
          @mousedown="(e) => startResize(e, 'top')"
        />

        <!-- Resize Handle - Right -->
        <div
          class="absolute top-4 bottom-4 right-0 w-1 cursor-ew-resize hover:bg-tile-borderSelected/30 transition-colors"
          @mousedown="(e) => startResize(e, 'right')"
        />

        <!-- Resize Handle - Corner -->
        <div
          class="absolute top-0 right-0 w-4 h-4 cursor-nesw-resize"
          @mousedown="(e) => startResize(e, 'corner')"
        />

        <!-- Header -->
        <div
          class="flex items-center justify-between px-3 py-2 bg-ui-bg border-b border-ui-border"
        >
          <div class="flex items-center gap-2">
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
          </div>
          <div class="flex items-center gap-1">
            <button
              @click.stop="handleToggle"
              class="p-1.5 rounded hover:bg-ui-bgLight text-ui-textMuted hover:text-ui-text transition-colors"
              title="Minimize"
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
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          </div>
        </div>

        <!-- Terminal Content -->
        <div ref="terminalRef" class="flex-1 p-2" @click="handleFocus" />
      </div>
  </div>
</template>

<style scoped>
/* Ensure terminal fills container properly */
:deep(.xterm) {
  height: 100%;
}

:deep(.xterm-viewport) {
  overflow-y: auto !important;
}

:deep(.xterm-screen) {
  height: 100%;
}
</style>
