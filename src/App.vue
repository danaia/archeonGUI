<script setup>
import { onMounted, onUnmounted } from "vue";
import { InfiniteCanvas, SideDrawer, FloatingTerminal } from "./components";
import { useTerminalStore, useUIStore } from "./stores";

const terminalStore = useTerminalStore();
const uiStore = useUIStore();

// Global keyboard shortcuts
function handleGlobalKeydown(e) {
  // Backtick to toggle terminal
  if (e.key === "`" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    // Don't trigger if typing in an input
    if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      terminalStore.toggle();
    }
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleGlobalKeydown);
  uiStore.setFocus("canvas");
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleGlobalKeydown);
});
</script>

<template>
  <div class="w-full h-full relative overflow-hidden bg-canvas-bg">
    <!-- Main Canvas Layer -->
    <InfiniteCanvas />

    <!-- Side Drawer Overlay -->
    <SideDrawer />

    <!-- Floating Terminal -->
    <FloatingTerminal />
  </div>
</template>

<style scoped>
/* App container fills viewport */
</style>
