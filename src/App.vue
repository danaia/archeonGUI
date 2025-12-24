<script setup>
import { ref, onMounted, onUnmounted, computed } from "vue";
import {
  InfiniteCanvas,
  SideDrawer,
  FloatingTerminal,
  ToastContainer,
} from "./components";
import {
  useTerminalStore,
  useUIStore,
  useProjectStore,
  useTileStore,
  useRelationshipStore,
  useCanvasStore,
} from "./stores";
import {
  initArcheonSync,
  reloadFromProject,
  syncChainsToTiles,
  confirmGlyphsFromIndex,
} from "./services/archeon-sync";

const terminalStore = useTerminalStore();
const uiStore = useUIStore();
const projectStore = useProjectStore();
const tileStore = useTileStore();
const relationshipStore = useRelationshipStore();
const canvasStore = useCanvasStore();

const isElectron = computed(() => !!window.electronAPI);
const projectName = computed(() => projectStore.projectName);
const hasProject = computed(() => !!projectStore.projectPath);

// Update status
const isUpdating = ref(false);

// Display path is directly from the store (which is initialized from localStorage)
const displayPath = computed(() => projectStore.projectPath);

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

  // Cmd/Ctrl + O to open project
  if ((e.metaKey || e.ctrlKey) && e.key === "o") {
    e.preventDefault();
    handleOpenProject();
  }

  // Delete key to delete selected tiles
  if (e.key === "Delete" || e.key === "Backspace") {
    // Don't trigger if typing in an input
    if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
      const hasSelection =
        tileStore.selectedTileKey || tileStore.selectedTileKeys.size > 0;
      if (hasSelection) {
        e.preventDefault();
        tileStore.deleteSelectedTiles(relationshipStore);
      }
    }
  }
}

async function handleOpenProject() {
  if (!isElectron.value) return;

  const result = await projectStore.openProject();
  if (result.success) {
    // Sync data to grid - arcon FIRST (structure), then index (confirmation)
    if (projectStore.arconData?.chains) {
      syncChainsToTiles(projectStore.arconData.chains);
    }
    if (projectStore.indexData) {
      confirmGlyphsFromIndex(projectStore.indexData);
    }
  }
}

async function handleUpdateArcon() {
  if (!isElectron.value || !hasProject.value) return;

  isUpdating.value = true;
  try {
    const content = tileStore.generateArconContent(relationshipStore);
    const result = await window.electronAPI.archeonWriteArcon(
      projectStore.projectPath,
      content
    );

    if (!result.success) {
      console.error("Failed to update ARCHEON.arcon:", result.error);
    }
  } catch (err) {
    console.error("Error updating ARCHEON.arcon:", err);
  }
  isUpdating.value = false;
}

/**
 * Reset tile positions to original chain layout from .arcon
 * Clears saved positions and camera from localStorage and re-syncs from arcon
 */
async function handleResetLayout() {
  if (!hasProject.value) return;

  // Clear saved layout and camera from localStorage
  tileStore.clearSavedLayout(projectStore.projectPath);
  canvasStore.resetCamera(projectStore.projectPath);

  // Re-sync from arcon to restore original positions
  if (projectStore.arconData?.chains) {
    syncChainsToTiles(projectStore.arconData.chains);
    // Re-confirm completed glyphs
    if (projectStore.indexData) {
      confirmGlyphsFromIndex(projectStore.indexData);
    }
  }

  uiStore.addToast("Layout and camera reset to defaults", "success", 2000);
}

onMounted(async () => {
  window.addEventListener("keydown", handleGlobalKeydown);
  uiStore.setFocus("canvas");

  // Initialize archeon sync if in Electron
  if (isElectron.value) {
    initArcheonSync();

    // Try to restore last project from localStorage
    const restored = await projectStore.restoreLastProject();
    if (restored.success) {
      // Sync restored project data to grid
      if (projectStore.arconData?.chains) {
        syncChainsToTiles(projectStore.arconData.chains);
      }
      if (projectStore.indexData) {
        confirmGlyphsFromIndex(projectStore.indexData);
      }
    }
  }
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleGlobalKeydown);
});
</script>

<template>
  <div class="w-full h-full relative overflow-hidden bg-black">
    <!-- Top Bar (when in Electron) -->
    <div
      v-if="isElectron"
      class="absolute top-0 left-0 right-0 h-10 bg-ui-bg border-b border-ui-border flex items-center px-4 z-30 app-drag"
    >
      <div class="flex items-center gap-1 app-no-drag">
        <button
          @click="handleOpenProject"
          class="px-3 py-1.5 text-xs bg-ui-bgLight hover:bg-tile-borderSelected/20 text-ui-text rounded transition-colors flex items-center gap-2"
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
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
        </button>

        <button
          v-if="hasProject"
          @click="handleUpdateArcon"
          :disabled="isUpdating"
          class="px-3 py-1.5 text-xs bg-ui-bgLight hover:bg-tile-borderSelected/20 text-ui-text rounded transition-colors flex items-center gap-2"
          title="Save current tiles to ARCHEON.arcon"
        >
          <svg
            class="w-4 h-4"
            :class="{ 'animate-spin': isUpdating }"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              v-if="!isUpdating"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
            <path
              v-else
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>

        <!-- Reset Layout Button -->
        <button
          v-if="hasProject"
          @click="handleResetLayout"
          class="px-3 py-1.5 text-xs bg-ui-bgLight hover:bg-amber-500/20 text-ui-text rounded transition-colors flex items-center gap-2"
          title="Reset to original chain layout from .arcon"
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
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      <div class="flex-1 text-center">
        <span v-if="hasProject" class="text-sm text-ui-text font-medium">
          {{ projectName }}
        </span>
        <span v-else class="text-sm text-ui-textMuted"> Archeon GUI </span>
      </div>

      <div class="flex items-center gap-4 app-no-drag">
        <!-- Project path - always show if we have a saved path -->
        <span
          v-if="displayPath"
          class="text-[11px] text-gray-500 truncate max-w-[300px] opacity-60"
          :title="displayPath"
        >
          {{ displayPath }}
        </span>
        <div class="text-xs text-ui-textMuted">
          <kbd class="px-1.5 py-0.5 bg-ui-bgLight rounded">⌘O</kbd> Open
        </div>
      </div>
    </div>

    <!-- Main Canvas Layer -->
    <InfiniteCanvas :class="{ 'pt-10': isElectron }" />

    <!-- Side Drawer Overlay -->
    <SideDrawer />

    <!-- Floating Terminal -->
    <FloatingTerminal />

    <!-- Toast Notifications -->
    <ToastContainer />
  </div>
</template>

<style scoped>
/* App container fills viewport */
.app-drag {
  -webkit-app-region: drag;
}
.app-no-drag {
  -webkit-app-region: no-drag;
}
</style>
