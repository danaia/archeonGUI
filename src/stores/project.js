import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useProjectStore = defineStore("project", () => {
  // Current project root path
  const projectPath = ref(null);

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

      if (!result.valid) {
        error.value = "Selected folder does not contain an archeon/ directory";
        isLoading.value = false;
        return { success: false, error: error.value };
      }

      // Set project path
      projectPath.value = result.path;

      // Start watching the archeon directory
      const watchResult = await window.electronAPI.archeonWatch(result.path);

      if (!watchResult.success) {
        error.value = watchResult.error;
        isLoading.value = false;
        return { success: false, error: error.value };
      }

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
    if (!window.electronAPI) return;

    projectPath.value = path;
    isLoading.value = true;

    try {
      const watchResult = await window.electronAPI.archeonWatch(path);

      if (watchResult.success) {
        if (watchResult.initialIndex?.success) {
          indexData.value = watchResult.initialIndex.data;
        }
        if (watchResult.initialArcon?.success) {
          arconData.value = {
            content: watchResult.initialArcon.content,
            chains: watchResult.initialArcon.chains,
          };
        }
      }
    } catch (err) {
      error.value = err.message;
    }

    isLoading.value = false;
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
  };
});
