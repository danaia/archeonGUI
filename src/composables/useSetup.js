import { ref } from "vue";
import { useUIStore, useProjectStore, useTerminalStore } from "../stores";
import { isMac, isLinux, getPlatformInfo } from "../utils/platform";
import {
  INIT_PROMPT,
  shapeOptions as fallbackShapeOptions,
  ideRuleOptions,
  ideOptions,
  getPipxInstallCommand,
  getCLIInstallCommand,
} from "../constants/setup";

/**
 * Composable for setup modal logic
 * Handles CLI detection, installation, and project setup
 */
export function useSetup() {
  const uiStore = useUIStore();
  const projectStore = useProjectStore();
  const terminalStore = useTerminalStore();

  // Installation method: 'rules', 'cli', or 'shapes'
  const installMethod = ref(null);
  const selectedIDE = ref(null);
  const isSettingUp = ref(false);
  const setupError = ref(null);
  const showPromptModal = ref(false);
  const copiedFilesCount = ref(0);

  // CLI detection and shapes
  const isCLIInstalled = ref(false);
  const isCheckingCLI = ref(false);
  const selectedShape = ref(null);
  const includeIDERules = ref([]);
  const isPipxInstalled = ref(false);
  const isCheckingPipx = ref(false);
  const showPipxModal = ref(false);
  const isInstallingPipx = ref(false);
  
  // Dynamic shapes from Archeon installation
  const shapeOptions = ref([]);
  const isLoadingShapes = ref(false);
  const shapesError = ref(null);
  const shapesPath = ref(null);

  // Check if Archeon CLI is installed
  async function checkCLIInstalled() {
    if (!window.electronAPI) {
      isCLIInstalled.value = false;
      return;
    }

    isCheckingCLI.value = true;
    try {
      // Use direct path to archeon binary installed by pipx
      const result = await window.electronAPI.checkCommand("~/.local/bin/archeon --version");
      isCLIInstalled.value = result.success;
    } catch (error) {
      isCLIInstalled.value = false;
    } finally {
      isCheckingCLI.value = false;
    }
  }

  // Refresh CLI check (called by user action)
  async function refreshCLICheck() {
    await checkCLIInstalled();
    if (isCLIInstalled.value) {
      uiStore.addToast(
        "✓ Archeon CLI ready! Shapes unlocked.",
        "success",
        3000
      );
    } else {
      uiStore.addToast(
        "CLI not found. Try: source ~/.zshrc",
        "warning",
        4000
      );
    }
  }

  // Check if pipx is installed (for Linux and macOS systems)
  async function checkPipxInstalled() {
    if (!window.electronAPI) {
      isPipxInstalled.value = false;
      return;
    }

    const platform = getPlatformInfo();
    if (!platform.supportsPipx) {
      isPipxInstalled.value = false;
      return;
    }

    isCheckingPipx.value = true;
    try {
      const result = await window.electronAPI.checkCommand("pipx --version");
      isPipxInstalled.value = result.success;
    } catch (error) {
      isPipxInstalled.value = false;
    } finally {
      isCheckingPipx.value = false;
    }
  }

  // Open project dialog
  async function handleOpenProject() {
    if (!window.electronAPI) {
      setupError.value = "Not running in Electron";
      return;
    }

    const result = await projectStore.openProject();
    if (result.success) {
      uiStore.addToast(
        `Project opened: ${projectStore.projectName}`,
        "success",
        3000
      );
    } else if (!result.canceled) {
      setupError.value = result.error || "Failed to open project";
    }
  }

  // Selection handlers
  function selectIDE(ideId) {
    selectedIDE.value = ideId === selectedIDE.value ? null : ideId;
  }

  function selectMethod(method) {
    installMethod.value = method;
    if (method === "cli") {
      selectedIDE.value = null;
    }
    if (method === "shapes") {
      selectedIDE.value = null;
      selectedShape.value = null;
    }
  }

  function selectShape(shapeId) {
    selectedShape.value = shapeId === selectedShape.value ? null : shapeId;
  }

  function toggleIDERule(ruleId) {
    const index = includeIDERules.value.indexOf(ruleId);
    if (index === -1) {
      includeIDERules.value.push(ruleId);
    } else {
      includeIDERules.value.splice(index, 1);
    }
  }

  // Scaffold project with a shape
  async function scaffoldWithShape() {
    if (!window.electronAPI || !terminalStore.ptyId || !selectedShape.value) {
      setupError.value = "Terminal not available or no shape selected.";
      return;
    }

    const projectPath =
      projectStore.projectPath ||
      localStorage.getItem("archeon:lastProjectPath");
    if (!projectPath) {
      setupError.value = "No project selected. Please open a project first.";
      return;
    }

    // Build the command with optional IDE flags
    let command = `cd "${projectPath}" && archeon init --arch ${selectedShape.value}`;

    for (const ruleId of includeIDERules.value) {
      const rule = ideRuleOptions.find((r) => r.id === ruleId);
      if (rule) {
        command += ` ${rule.flag}`;
      }
    }

    closeModal();

    if (!terminalStore.isExpanded) {
      terminalStore.toggle();
    }

    setTimeout(() => {
      window.electronAPI.ptyWrite(terminalStore.ptyId, command + "\n");
    }, 300);

    const shapeName =
      shapeOptions.value.find((s) => s.id === selectedShape.value)?.name ||
      selectedShape.value;
    uiStore.addToast(`Scaffolding project...`, "info", 7000);
  }

  // Install pipx and continue
  async function installPipxAndContinue() {
    if (!window.electronAPI || !terminalStore.ptyId) {
      setupError.value = "Terminal not available.";
      return;
    }

    isInstallingPipx.value = true;
    showPipxModal.value = false;
    closeModal();

    if (!terminalStore.isExpanded) {
      terminalStore.toggle();
    }

    setTimeout(() => {
      const command = getPipxInstallCommand();
      window.electronAPI.ptyWrite(terminalStore.ptyId, command + "\n");
    }, 300);

    uiStore.addToast(
      "📦 Installing pipx + Archeon CLI in terminal... Click Refresh when done, then reopen Setup.",
      "info",
      12000
    );

    isInstallingPipx.value = false;
  }

  // Skip pipx and use pip instead
  function skipPipxAndUsePip() {
    showPipxModal.value = false;

    if (!terminalStore.isExpanded) {
      terminalStore.toggle();
    }

    setTimeout(() => {
      const command = getCLIInstallCommand(false);
      window.electronAPI.ptyWrite(terminalStore.ptyId, command + "\n");
    }, 300);

    closeModal();
    uiStore.addToast(
      "📦 Installing Archeon CLI via pip in terminal... Click Refresh when done, then reopen Setup.",
      "info",
      12000
    );
  }

  // Install the Archeon CLI
  async function installCLI() {
    if (!window.electronAPI || !terminalStore.ptyId) {
      setupError.value =
        "Terminal not available. Please open the terminal first.";
      return;
    }

    const platform = getPlatformInfo();
    // Show pipx modal if on a supported platform and pipx is not installed
    if (platform.supportsPipx && !isPipxInstalled.value) {
      showPipxModal.value = true;
      return;
    }

    closeModal();

    if (!terminalStore.isExpanded) {
      terminalStore.toggle();
    }

    setTimeout(() => {
      const command = getCLIInstallCommand(isPipxInstalled.value);
      window.electronAPI.ptyWrite(terminalStore.ptyId, command + "\n");
    }, 300);

    const tool = isPipxInstalled.value ? "pipx" : "pip";
    uiStore.addToast(
      `📦 Installing Archeon CLI via ${tool} in terminal... Click Refresh when done, then reopen Setup.`,
      "info",
      12000
    );
  }

  // Apply IDE rules setup
  async function applySetup() {
    if (!selectedIDE.value || !window.electronAPI) return;

    const projectPath =
      projectStore.projectPath ||
      localStorage.getItem("archeon:lastProjectPath");
    if (!projectPath) {
      setupError.value = "No project selected. Please open a project first.";
      return;
    }

    const selectedOption = ideOptions.find(
      (opt) => opt.id === selectedIDE.value
    );
    if (!selectedOption) return;

    isSettingUp.value = true;
    setupError.value = null;

    try {
      const results = await window.electronAPI.copyRuleTemplates(
        selectedOption.files,
        projectPath
      );

      if (results.failed.length === 0) {
        copiedFilesCount.value = results.created.length;

        if (terminalStore.ptyId) {
          const lsCommand = `cd "${projectPath}" && echo "✓ ${selectedOption.name} rules installed (${results.created.length} files)" && ls -la\n`;
          window.electronAPI.ptyWrite(terminalStore.ptyId, lsCommand);
        }

        showPromptModal.value = true;
      } else {
        const failedNames = results.failed.map((f) => f.file).join(", ");
        setupError.value = `Failed to create ${results.failed.length} file(s): ${failedNames}`;
      }
    } catch (error) {
      setupError.value = error.message;
    } finally {
      isSettingUp.value = false;
    }
  }

  // Close modal and reset state
  function closeModal() {
    selectedIDE.value = null;
    installMethod.value = null;
    selectedShape.value = null;
    includeIDERules.value = [];
    setupError.value = null;
    showPromptModal.value = false;
    uiStore.closeSetupModal();
  }

  // Copy prompt and close
  async function copyPromptAndClose() {
    try {
      await navigator.clipboard.writeText(INIT_PROMPT);
      closeModal();
      uiStore.addToast(
        "Prompt copied! Paste into your AI IDE assistant to initialize the project.",
        "success",
        8000
      );
    } catch (err) {
      uiStore.addToast("Failed to copy prompt to clipboard", "error");
    }
  }

  function skipPromptAndClose() {
    closeModal();
  }

  // Load available shapes from Archeon installation
  async function loadShapes() {
    if (!window.electronAPI) {
      // Use fallback shapes when not in Electron
      shapeOptions.value = fallbackShapeOptions;
      return;
    }

    isLoadingShapes.value = true;
    shapesError.value = null;

    try {
      const result = await window.electronAPI.getShapes();
      
      if (result.success && result.shapes.length > 0) {
        shapeOptions.value = result.shapes;
        shapesPath.value = result.path;
        console.log(`[loadShapes] Loaded ${result.shapes.length} shapes from ${result.path}`);
      } else {
        // Use fallback shapes if none found
        shapeOptions.value = fallbackShapeOptions;
        shapesError.value = result.error || 'No shapes found in Archeon installation';
        console.log('[loadShapes] Using fallback shapes:', result.error);
      }
    } catch (error) {
      console.error('[loadShapes] Error:', error);
      shapeOptions.value = fallbackShapeOptions;
      shapesError.value = error.message;
    } finally {
      isLoadingShapes.value = false;
    }
  }

  // Initialize checks
  async function initChecks() {
    await checkCLIInstalled();
    checkPipxInstalled();
    // Load shapes after CLI check
    if (isCLIInstalled.value) {
      await loadShapes();
    } else {
      // Use fallback shapes if CLI not installed
      shapeOptions.value = fallbackShapeOptions;
    }
  }

  return {
    // State
    installMethod,
    selectedIDE,
    isSettingUp,
    setupError,
    showPromptModal,
    copiedFilesCount,
    isCLIInstalled,
    isCheckingCLI,
    selectedShape,
    includeIDERules,
    isPipxInstalled,
    isCheckingPipx,
    showPipxModal,
    isInstallingPipx,
    
    // Dynamic shapes state
    shapeOptions,
    isLoadingShapes,
    shapesError,
    shapesPath,

    // Constants (re-exported for template)
    INIT_PROMPT,
    ideRuleOptions,
    ideOptions,

    // Methods
    checkCLIInstalled,
    refreshCLICheck,
    checkPipxInstalled,
    loadShapes,
    handleOpenProject,
    selectIDE,
    selectMethod,
    selectShape,
    toggleIDERule,
    scaffoldWithShape,
    installPipxAndContinue,
    skipPipxAndUsePip,
    installCLI,
    applySetup,
    closeModal,
    copyPromptAndClose,
    skipPromptAndClose,
    initChecks,
  };
}
