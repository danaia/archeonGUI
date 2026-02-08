<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick } from "vue";
import {
  InfiniteCanvas,
  SideDrawer,
  FloatingTerminal,
  ToastContainer,
  SetupModal,
  GlyphEditModal,
  WelcomeModal,
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
const isMac = computed(() => navigator.platform.includes("Mac"));
const projectName = computed(() => projectStore.projectName);
const hasProject = computed(() => !!projectStore.projectPath);

// Update status
const isUpdating = ref(false);

// Display path is directly from the store (which is initialized from localStorage)
const displayPath = computed(() => projectStore.projectPath);

// Global keyboard shortcuts
async function handleGlobalKeydown(e) {
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

  // Cmd/Ctrl + Z to undo
  if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
    // Don't trigger if typing in an input
    if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      if (tileStore.undo()) {
        // Rebuild edges after tile positions change (nextTick ensures Vue reactivity has propagated)
        nextTick(() => relationshipStore.rebuildEdges());
        uiStore.addToast("Undo", "success", 1000);
        // Save updated layout
        if (projectStore.projectPath) {
          tileStore.saveLayout(projectStore.projectPath);
        }
      }
    }
  }

  // Cmd/Ctrl + Shift + Z to redo
  if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
    // Don't trigger if typing in an input
    if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      if (tileStore.redo()) {
        // Rebuild edges after tile positions change (nextTick ensures Vue reactivity has propagated)
        nextTick(() => relationshipStore.rebuildEdges());
        uiStore.addToast("Redo", "success", 1000);
        // Save updated layout
        if (projectStore.projectPath) {
          tileStore.saveLayout(projectStore.projectPath);
        }
      }
    }
  }

  // Cmd/Ctrl + Y to redo (alternative)
  if ((e.metaKey || e.ctrlKey) && e.key === "y") {
    // Don't trigger if typing in an input
    if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      if (tileStore.redo()) {
        // Rebuild edges after tile positions change (nextTick ensures Vue reactivity has propagated)
        nextTick(() => relationshipStore.rebuildEdges());
        uiStore.addToast("Redo", "success", 1000);
        // Save updated layout
        if (projectStore.projectPath) {
          tileStore.saveLayout(projectStore.projectPath);
        }
      }
    }
  }

  // Delete key to delete selected tiles
  if (e.key === "Delete" || e.key === "Backspace") {
    // Don't trigger if typing in an input
    if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
      const hasSelection =
        tileStore.selectedTileKey || tileStore.selectedTileKeys.size > 0;
      if (hasSelection) {
        e.preventDefault();
        const deletedCount = tileStore.deleteSelectedTiles(relationshipStore);

        // Save changes to .arcon file if project is open
        if (deletedCount > 0 && projectStore.projectPath) {
          try {
            await tileStore.saveToArcon(projectStore.projectPath);
            uiStore.addToast(
              `Deleted ${deletedCount} tile${deletedCount > 1 ? "s" : ""}`,
              "success",
              2000
            );
          } catch (err) {
            console.error("Failed to save .arcon after delete:", err);
            uiStore.addToast("Failed to save changes", "error");
          }
        }
      }
    }
  }
}

async function handleOpenProject() {
  if (!isElectron.value) return;

  const result = await projectStore.openProject();
  if (result.success) {
    // Force a full reload from project files to guarantee canvas refresh
    await reloadFromProject();
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

  // Check if user has seen the welcome modal before
  const hasSeenWelcome = localStorage.getItem("archeon:hasSeenWelcome") === "true";
  if (!hasSeenWelcome) {
    uiStore.openWelcomeModal();
  }

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

      // Check if setup modal should be shown
      // Show if CLI is not installed AND project has no /archeon directory
      try {
        const cliResult = await window.electronAPI.checkCommand(
          "archeon --version"
        );
        const cliInstalled = cliResult.success;

        if (!cliInstalled && projectStore.projectPath) {
          const archeonDirExists = await window.electronAPI.checkDirExists(
            `${projectStore.projectPath}/archeon`
          );
          if (!archeonDirExists) {
            uiStore.openSetupModal();
          }
        }
      } catch (err) {
        // Silently fail - don't block app initialization
      }
    }
  }
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleGlobalKeydown);
});
</script>

<template>
  <div class="w-full h-full relative overflow-hidden bg-black mt-4">
    <!-- Top Bar (when in Electron) -->
    <div
      v-if="isElectron"
      class="absolute top-0 left-0 right-0 h-16 bg-ui-bg border-b border-ui-border flex items-center pr-4 z-30 app-drag"
      :class="{ 'pt-6 pl-2': isMac, 'px-4': !isMac }"
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

        <!-- Help/Welcome Guide Button -->
        <button
          @click="uiStore.openWelcomeModal"
          class="px-3 py-1.5 text-xs bg-ui-bgLight hover:bg-blue-500/20 text-ui-text rounded transition-colors flex items-center gap-2"
          title="Show welcome guide"
        >
          <svg
            class="w-4 h-4"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              d="m14.757 16.172l3.571 3.571a10.004 10.004 0 0 1-12.656 0l3.57-3.571A5 5 0 0 0 12 17c1.02 0 1.967-.305 2.757-.828m-10.5-10.5l3.571 3.57A5 5 0 0 0 7 12c0 1.02.305 1.967.828 2.757l-3.57 3.572A10 10 0 0 1 2 12l.005-.324a10 10 0 0 1 2.252-6.005M22 12c0 2.343-.82 4.57-2.257 6.328l-3.571-3.57A5 5 0 0 0 17 12c0-1.02-.305-1.967-.828-2.757l3.571-3.57A10 10 0 0 1 22 12m-5-8.66q.707.41 1.33.918l-3.573 3.57A5 5 0 0 0 12 7c-1.02 0-1.967.305-2.757.828L5.67 4.258A10 10 0 0 1 17 3.34"
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
    <InfiniteCanvas :class="{ 'pt-16': isElectron }" />

    <!-- Side Drawer Overlay -->
    <SideDrawer />

    <!-- Floating Terminal -->
    <FloatingTerminal />

    <!-- Toast Notifications -->
    <ToastContainer />

    <!-- Setup Modal -->
    <SetupModal />

    <!-- Glyph Edit Modal -->
    <GlyphEditModal />

    <!-- Welcome Modal -->
    <WelcomeModal />
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
