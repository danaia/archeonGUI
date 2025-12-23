<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import { useTerminalStore, useUIStore } from "../stores";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

const terminalStore = useTerminalStore();
const uiStore = useUIStore();

const terminalRef = ref(null);
const terminalContainerRef = ref(null);
const isResizing = ref(false);
const resizeStartPos = ref({ x: 0, y: 0 });
const resizeStartSize = ref({ width: 0, height: 0 });

let terminal = null;
let fitAddon = null;
let currentLine = "";
let cursorPosition = 0;

const isExpanded = computed(() => terminalStore.isExpanded);

// Command execution simulation
const commands = {
  help: () => {
    return [
      "Available commands:",
      "  help     - Show this help message",
      "  clear    - Clear the terminal",
      "  echo     - Print text",
      "  date     - Show current date/time",
      "  whoami   - Show current user",
      "  pwd      - Print working directory",
      "  ls       - List files (simulated)",
      "  version  - Show version info",
      "",
    ].join("\r\n");
  },
  clear: () => {
    terminal.clear();
    return "";
  },
  echo: (args) => args.join(" "),
  date: () => new Date().toString(),
  whoami: () => "archeon",
  pwd: () => terminalStore.cwd,
  ls: () => {
    return [
      "Documents/",
      "Downloads/",
      "Projects/",
      ".config/",
      "README.md",
    ].join("\r\n");
  },
  version: () => "Archeon Terminal v1.0.0\r\nBuilt with xterm.js",
};

function executeCommand(input) {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const args = parts.slice(1);

  if (!cmd) return "";

  if (commands[cmd]) {
    return commands[cmd](args);
  }

  return `zsh: command not found: ${cmd}`;
}

function prompt() {
  const promptText = `\x1b[32marcheon\x1b[0m:\x1b[34m${terminalStore.cwd}\x1b[0m$ `;
  terminal.write("\r\n" + promptText);
  currentLine = "";
  cursorPosition = 0;
}

function initTerminal() {
  if (!terminalRef.value || terminal) return;

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
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(terminalRef.value);

  // Initial fit and welcome message
  nextTick(() => {
    fitAddon.fit();
    terminal.write(
      "\x1b[32m╔══════════════════════════════════════╗\x1b[0m\r\n"
    );
    terminal.write(
      "\x1b[32m║\x1b[0m    Archeon Terminal v1.0.0          \x1b[32m║\x1b[0m\r\n"
    );
    terminal.write(
      '\x1b[32m║\x1b[0m    Type "help" for commands          \x1b[32m║\x1b[0m\r\n'
    );
    terminal.write("\x1b[32m╚══════════════════════════════════════╝\x1b[0m");
    prompt();
  });

  // Handle keyboard input
  terminal.onKey(({ key, domEvent }) => {
    const printable =
      !domEvent.altKey && !domEvent.ctrlKey && !domEvent.metaKey;

    if (domEvent.key === "Enter") {
      const output = executeCommand(currentLine);
      if (output) {
        terminal.write("\r\n" + output);
      }
      terminalStore.addToHistory(currentLine);
      prompt();
    } else if (domEvent.key === "Backspace") {
      if (cursorPosition > 0) {
        currentLine =
          currentLine.slice(0, cursorPosition - 1) +
          currentLine.slice(cursorPosition);
        cursorPosition--;
        terminal.write("\b \b");
        // Rewrite rest of line if cursor wasn't at end
        if (cursorPosition < currentLine.length) {
          const remaining = currentLine.slice(cursorPosition);
          terminal.write(remaining + " ");
          terminal.write("\x1b[" + (remaining.length + 1) + "D");
        }
      }
    } else if (domEvent.key === "ArrowUp") {
      const histCmd = terminalStore.navigateHistory("up");
      if (histCmd !== null) {
        // Clear current line
        terminal.write("\x1b[2K\r");
        terminal.write(
          `\x1b[32marcheon\x1b[0m:\x1b[34m${terminalStore.cwd}\x1b[0m$ `
        );
        terminal.write(histCmd);
        currentLine = histCmd;
        cursorPosition = histCmd.length;
      }
    } else if (domEvent.key === "ArrowDown") {
      const histCmd = terminalStore.navigateHistory("down");
      if (histCmd !== null) {
        terminal.write("\x1b[2K\r");
        terminal.write(
          `\x1b[32marcheon\x1b[0m:\x1b[34m${terminalStore.cwd}\x1b[0m$ `
        );
        terminal.write(histCmd);
        currentLine = histCmd;
        cursorPosition = histCmd.length;
      }
    } else if (domEvent.key === "ArrowLeft") {
      if (cursorPosition > 0) {
        cursorPosition--;
        terminal.write(key);
      }
    } else if (domEvent.key === "ArrowRight") {
      if (cursorPosition < currentLine.length) {
        cursorPosition++;
        terminal.write(key);
      }
    } else if (domEvent.ctrlKey && domEvent.key === "c") {
      terminal.write("^C");
      prompt();
    } else if (domEvent.ctrlKey && domEvent.key === "l") {
      terminal.clear();
      prompt();
    } else if (printable) {
      currentLine =
        currentLine.slice(0, cursorPosition) +
        key +
        currentLine.slice(cursorPosition);
      cursorPosition++;
      terminal.write(key);
      // Rewrite rest of line if cursor wasn't at end
      if (cursorPosition < currentLine.length) {
        const remaining = currentLine.slice(cursorPosition);
        terminal.write(remaining);
        terminal.write("\x1b[" + remaining.length + "D");
      }
    }
  });

  terminal.onData((data) => {
    // Handle paste
    if (data.length > 1 && !data.startsWith("\x1b")) {
      currentLine =
        currentLine.slice(0, cursorPosition) +
        data +
        currentLine.slice(cursorPosition);
      cursorPosition += data.length;
      terminal.write(data);
    }
  });
}

function destroyTerminal() {
  if (terminal) {
    terminal.dispose();
    terminal = null;
    fitAddon = null;
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

    nextTick(() => fitAddon?.fit());
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
    nextTick(() => {
      initTerminal();
      handleFocus();
    });
  }
});

// Fit terminal on resize
watch(
  () => [terminalStore.width, terminalStore.height],
  () => {
    nextTick(() => fitAddon?.fit());
  }
);

onMounted(() => {
  if (isExpanded.value) {
    nextTick(() => initTerminal());
  }
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
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-4 scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-4 scale-95"
    >
      <div
        v-if="isExpanded"
        ref="terminalContainerRef"
        class="bg-terminal-bg border border-ui-border rounded-lg shadow-2xl overflow-hidden flex flex-col"
        :style="{
          width: terminalStore.width + 'px',
          height: terminalStore.height + 'px',
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
    </Transition>
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
