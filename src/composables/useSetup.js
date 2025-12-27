import { ref } from "vue";
import { useUIStore, useProjectStore, useTerminalStore } from "../stores";
import { isMac, isLinux, getPlatformInfo } from "../utils/platform";
import {
  INIT_PROMPT,
  shapeOptions,
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

  // Check if Archeon CLI is installed
  async function checkCLIInstalled() {
    if (!window.electronAPI) {
      isCLIInstalled.value = false;
      return;
    }

    isCheckingCLI.value = true;
    try {
      const result = await window.electronAPI.checkCommand("archeon --version");
      isCLIInstalled.value = result.success;
    } catch (error) {
      isCLIInstalled.value = false;
    } finally {
      isCheckingCLI.value = false;
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
      shapeOptions.find((s) => s.id === selectedShape.value)?.name ||
      selectedShape.value;
    uiStore.addToast(`Scaffolding project with ${shapeName}...`, "info", 5000);
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
      "Installing pipx and Archeon CLI... This may take a moment.",
      "info",
      10000
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
    uiStore.addToast("Installing Archeon CLI via pip...", "info", 5000);
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
      `Installing Archeon CLI globally via ${tool} on ${platform.os}...`,
      "info",
      5000
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

  // Initialize checks
  function initChecks() {
    checkCLIInstalled();
    checkPipxInstalled();
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

    // Constants (re-exported for template)
    INIT_PROMPT,
    shapeOptions,
    ideRuleOptions,
    ideOptions,

    // Methods
    checkCLIInstalled,
    checkPipxInstalled,
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
