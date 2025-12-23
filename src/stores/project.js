import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";

const STORAGE_KEY = "archeon:lastProjectPath";

export const useProjectStore = defineStore("project", () => {
  // Current project root path - try to restore from localStorage
  const savedPath = localStorage.getItem(STORAGE_KEY);
  const projectPath = ref(savedPath || null);

  // Project name (derived from path)
  const projectName = computed(() => {
    if (!projectPath.value) return null;
    const parts = projectPath.value.split(/[/\\]/);
    return parts[parts.length - 1];
  });

  // Project status
  const isLoading = ref(false);
  const error = ref(null);

  // Archeon data from watched files
  const indexData = ref(null); // ARCHEON.index.json content
  const arconData = ref(null); // ARCHEON.arcon parsed content

  // Check if we're running in Electron
  const isElectron = computed(() => !!window.electronAPI);

  /**
   * Open a project folder via native dialog
   * @returns {Promise<{success: boolean, path?: string, error?: string}>}
   */
  async function openProject() {
    if (!window.electronAPI) {
      error.value = "Not running in Electron";
      return { success: false, error: error.value };
    }

    isLoading.value = true;
    error.value = null;

    try {
      const result = await window.electronAPI.openProject();

      if (result.canceled) {
        isLoading.value = false;
        return { success: false, canceled: true };
      }

      // Always set project path and save to localStorage (even without archeon/)
      projectPath.value = result.path;
      localStorage.setItem(STORAGE_KEY, result.path);
      console.log("Project path saved:", result.path);

      // Start watching the archeon directory (will handle missing dir gracefully)
      const watchResult = await window.electronAPI.archeonWatch(result.path);

      if (watchResult.success) {
        // Store initial data - arcon FIRST (defines structure), then index (confirms completion)
        if (watchResult.initialArcon?.success) {
          arconData.value = {
            content: watchResult.initialArcon.content,
            chains: watchResult.initialArcon.chains,
          };
        }
        if (watchResult.initialIndex?.success) {
          indexData.value = watchResult.initialIndex.data;
        }
      }

      isLoading.value = false;
      return { success: true, path: result.path };
    } catch (err) {
      error.value = err.message;
      isLoading.value = false;
      return { success: false, error: err.message };
    }
  }

  /**
   * Set project path directly (for use with terminal cd or initial load)
   * @param {string} path - Project root path
   */
  async function setProjectPath(path) {
    if (!window.electronAPI) return { success: false };

    projectPath.value = path;
    localStorage.setItem(STORAGE_KEY, path);
    console.log("Project path set:", path);
    isLoading.value = true;

    try {
      const watchResult = await window.electronAPI.archeonWatch(path);

      if (watchResult.success) {
        if (watchResult.initialArcon?.success) {
          arconData.value = {
            content: watchResult.initialArcon.content,
            chains: watchResult.initialArcon.chains,
          };
        }
        if (watchResult.initialIndex?.success) {
          indexData.value = watchResult.initialIndex.data;
        }
      }
    } catch (err) {
      error.value = err.message;
    }

    isLoading.value = false;
    return { success: true, path };
  }

  /**
   * Update index data when file changes
   * @param {Object} data - New index data
   */
  function updateIndexData(data) {
    if (data.success) {
      indexData.value = data.data;
    }
  }

  /**
   * Update arcon data when file changes
   * @param {Object} data - New arcon data
   */
  function updateArconData(data) {
    if (data.success) {
      arconData.value = {
        content: data.content,
        chains: data.chains,
      };
    }
  }

  /**
   * Close current project
   */
  async function closeProject() {
    if (window.electronAPI) {
      await window.electronAPI.archeonStop();
    }

    projectPath.value = null;
    indexData.value = null;
    arconData.value = null;
    error.value = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Try to restore last project from localStorage on app start
   */
  async function restoreLastProject() {
    const savedPath = localStorage.getItem(STORAGE_KEY);
    if (savedPath && window.electronAPI) {
      await setProjectPath(savedPath);
      return { success: true, path: savedPath };
    }
    return { success: false };
  }

  /**
   * Get glyphs from index data
   */
  const glyphs = computed(() => {
    if (!indexData.value?.glyphs) return {};
    return indexData.value.glyphs;
  });

  /**
   * Get chains from arcon data
   */
  const chains = computed(() => {
    if (!arconData.value?.chains) return [];
    return arconData.value.chains;
  });

  return {
    // State
    projectPath,
    projectName,
    isLoading,
    error,
    indexData,
    arconData,
    isElectron,

    // Computed
    glyphs,
    chains,

    // Actions
    openProject,
    setProjectPath,
    updateIndexData,
    updateArconData,
    closeProject,
    restoreLastProject,
  };
});
