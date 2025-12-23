import { defineStore } from "pinia";
import { ref } from "vue";

export const useTerminalStore = defineStore("terminal", () => {
  // Terminal visibility state
  const isExpanded = ref(false);
  const isFocused = ref(false);

  // Terminal size
  const width = ref(600);
  const height = ref(400);
  const minWidth = ref(400);
  const minHeight = ref(200);
  const maxWidth = ref(1200);
  const maxHeight = ref(800);

  // Command history
  const history = ref([]);
  const historyIndex = ref(-1);

  // Current working directory (simulated)
  const cwd = ref("~");

  // Terminal output buffer
  const outputBuffer = ref([
    { type: "system", text: "Archeon Terminal v1.0.0" },
    { type: "system", text: 'Type "help" for available commands.' },
    { type: "prompt", text: "" },
  ]);

  // Toggle terminal expansion
  function toggle() {
    isExpanded.value = !isExpanded.value;
    if (isExpanded.value) {
      isFocused.value = true;
    }
  }

  // Expand terminal
  function expand() {
    isExpanded.value = true;
    isFocused.value = true;
  }

  // Collapse terminal
  function collapse() {
    isExpanded.value = false;
    isFocused.value = false;
  }

  // Set focus state
  function setFocus(focused) {
    isFocused.value = focused;
  }

  // Add command to history
  function addToHistory(command) {
    if (command.trim()) {
      history.value.push(command);
      historyIndex.value = history.value.length;
    }
  }

  // Navigate history
  function navigateHistory(direction) {
    if (direction === "up" && historyIndex.value > 0) {
      historyIndex.value--;
      return history.value[historyIndex.value];
    } else if (
      direction === "down" &&
      historyIndex.value < history.value.length - 1
    ) {
      historyIndex.value++;
      return history.value[historyIndex.value];
    } else if (direction === "down") {
      historyIndex.value = history.value.length;
      return "";
    }
    return null;
  }

  // Add output line
  function addOutput(type, text) {
    outputBuffer.value.push({ type, text });
    // Keep buffer size reasonable
    if (outputBuffer.value.length > 1000) {
      outputBuffer.value = outputBuffer.value.slice(-500);
    }
  }

  // Clear terminal
  function clear() {
    outputBuffer.value = [
      { type: "system", text: "Terminal cleared." },
      { type: "prompt", text: "" },
    ];
  }

  // Resize terminal
  function resize(newWidth, newHeight) {
    width.value = Math.max(minWidth.value, Math.min(maxWidth.value, newWidth));
    height.value = Math.max(
      minHeight.value,
      Math.min(maxHeight.value, newHeight)
    );
  }

  return {
    // State
    isExpanded,
    isFocused,
    width,
    height,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    history,
    historyIndex,
    cwd,
    outputBuffer,

    // Methods
    toggle,
    expand,
    collapse,
    setFocus,
    addToHistory,
    navigateHistory,
    addOutput,
    clear,
    resize,
  };
});
