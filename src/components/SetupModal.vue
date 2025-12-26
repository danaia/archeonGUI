<script setup>
import { ref, onMounted, watch } from "vue";
import { useUIStore, useProjectStore, useTerminalStore } from "../stores";

const uiStore = useUIStore();
const projectStore = useProjectStore();
const terminalStore = useTerminalStore();

// Installation method: 'rules' or 'cli'
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

const INIT_PROMPT = "Initialize this project with Archeon";

// Available architecture shapes
const shapeOptions = [
  {
    id: "vue3-fastapi",
    name: "Vue 3 + FastAPI",
    description: "Vue 3 frontend with FastAPI Python backend, MongoDB, Pinia state management",
    icon: "🟢",
    tags: ["Vue 3", "FastAPI", "Python", "MongoDB", "Pinia"],
  },
  {
    id: "react-fastapi",
    name: "React + FastAPI",
    description: "React frontend with FastAPI Python backend, MongoDB, Zustand state management",
    icon: "⚛️",
    tags: ["React", "FastAPI", "Python", "MongoDB", "Zustand"],
  },
];

// IDE rule options for shape installation
const ideRuleOptions = [
  { id: "copilot", name: "GitHub Copilot", flag: "--copilot" },
  { id: "cursor", name: "Cursor", flag: "--cursor" },
  { id: "windsurf", name: "Windsurf", flag: "--windsurf" },
  { id: "cline", name: "Cline", flag: "--cline" },
  { id: "aider", name: "Aider", flag: "--aider" },
];

// CLI installation - use a single heredoc command to avoid PTY timing issues
// Install from GitHub since package isn't on PyPI yet
const CLI_INSTALL_COMMAND = `cat << 'ARCHEON_BANNER'

╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   ARCHEON CLI - Global Installation                              ║
║                                                                  ║
║   This will install the Archeon CLI tool globally on your        ║
║   system using pip. Archeon is 100% open source.                 ║
║                                                                  ║
║   PRIVACY: We do NOT collect, store, or transmit any             ║
║   user data. Your code stays on YOUR machine.                    ║
║                                                                  ║
║   Source: https://github.com/danaia/archeon                      ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

ARCHEON_BANNER
echo "Installing Archeon CLI from GitHub..."
pip install git+https://github.com/danaia/archeon.git && echo "" && echo "Installation complete! Try: archeon --help"
`;

const ideOptions = [
  {
    id: "all",
    name: "All IDEs",
    description: "Install Archeon rules for all supported IDEs at once",
    files: [
      ".cursorrules",
      ".cursor/README.md",
      ".github/copilot-instructions.md",
      ".windsurfrules",
      ".windsurf/README.md",
      ".clinerules",
      ".cline/README.md",
      ".aider.conf.yml",
      ".aider/README.md",
      ".vscode/settings.json",
    ],
  },
  {
    id: "cursor",
    name: "Cursor",
    description: "Optimized AI rules for Cursor AI editor",
    files: [".cursorrules", ".cursor/README.md"],
  },
  {
    id: "vscode",
    name: "VS Code + Copilot",
    description: "Copilot instructions + workspace settings for VS Code",
    files: [".github/copilot-instructions.md", ".vscode/settings.json"],
  },
  {
    id: "windsurf",
    name: "Windsurf",
    description: "AI assistant rules for Codeium's Windsurf",
    files: [".windsurfrules", ".windsurf/README.md"],
  },
  {
    id: "cline",
    name: "Cline",
    description: "Claude Dev / Cline assistant configuration",
    files: [".clinerules", ".cline/README.md"],
  },
  {
    id: "aider",
    name: "Aider",
    description: "Aider AI pair programming setup & rules",
    files: [".aider.conf.yml", ".aider/README.md"],
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    description: "GitHub Copilot instructions (works in any editor)",
    files: [".github/copilot-instructions.md"],
  },
];

// Check if Archeon CLI is installed
async function checkCLIInstalled() {
  if (!window.electronAPI) {
    isCLIInstalled.value = false;
    return;
  }
  
  isCheckingCLI.value = true;
  try {
    // Try to run 'archeon --version' to check if CLI is installed
    const result = await window.electronAPI.checkCommand('archeon --version');
    isCLIInstalled.value = result.success;
  } catch (error) {
    isCLIInstalled.value = false;
  } finally {
    isCheckingCLI.value = false;
  }
}

function selectIDE(ideId) {
  selectedIDE.value = ideId === selectedIDE.value ? null : ideId;
}

function selectMethod(method) {
  installMethod.value = method;
  // Reset IDE selection when switching methods
  if (method === 'cli') {
    selectedIDE.value = null;
  }
  if (method === 'shapes') {
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

async function scaffoldWithShape() {
  if (!window.electronAPI || !terminalStore.ptyId || !selectedShape.value) {
    setupError.value = "Terminal not available or no shape selected.";
    return;
  }

  const projectPath = projectStore.projectPath || localStorage.getItem("archeon:lastProjectPath");
  if (!projectPath) {
    setupError.value = "No project selected. Please open a project first.";
    return;
  }

  // Build the command with optional IDE flags
  let command = `cd "${projectPath}" && archeon init --arch ${selectedShape.value}`;
  
  // Add IDE rule flags
  for (const ruleId of includeIDERules.value) {
    const rule = ideRuleOptions.find(r => r.id === ruleId);
    if (rule) {
      command += ` ${rule.flag}`;
    }
  }

  // Close the modal
  closeModal();

  // Expand terminal if not already
  if (!terminalStore.isExpanded) {
    terminalStore.toggle();
  }

  // Small delay to ensure terminal is ready
  setTimeout(() => {
    window.electronAPI.ptyWrite(terminalStore.ptyId, command + "\n");
  }, 300);

  // Show toast notification
  const shapeName = shapeOptions.find(s => s.id === selectedShape.value)?.name || selectedShape.value;
  uiStore.addToast(
    `Scaffolding project with ${shapeName}...`,
    "info",
    5000
  );
}

async function installCLI() {
  if (!window.electronAPI || !terminalStore.ptyId) {
    setupError.value = "Terminal not available. Please open the terminal first.";
    return;
  }

  // Close the modal
  closeModal();

  // Expand terminal if not already
  const terminalStoreInstance = useTerminalStore();
  if (!terminalStoreInstance.isExpanded) {
    terminalStoreInstance.toggle();
  }

  // Small delay to ensure terminal is ready, then send the heredoc command
  setTimeout(() => {
    window.electronAPI.ptyWrite(terminalStore.ptyId, CLI_INSTALL_COMMAND + "\n");
  }, 300);

  // Show toast notification
  uiStore.addToast(
    "Installing Archeon CLI globally via pip...",
    "info",
    5000
  );
}

async function applySetup() {
  if (!selectedIDE.value || !window.electronAPI) return;

  const projectPath = projectStore.projectPath || localStorage.getItem("archeon:lastProjectPath");
  if (!projectPath) {
    setupError.value = "No project selected. Please open a project first.";
    return;
  }

  const selectedOption = ideOptions.find((opt) => opt.id === selectedIDE.value);
  if (!selectedOption) return;

  isSettingUp.value = true;
  setupError.value = null;

  try {
    // Single IPC call to copy all templates
    const results = await window.electronAPI.copyRuleTemplates(selectedOption.files, projectPath);

    if (results.failed.length === 0) {
      copiedFilesCount.value = results.created.length;
      
      // Show results in terminal
      if (terminalStore.ptyId) {
        const lsCommand = `cd "${projectPath}" && echo "✓ ${selectedOption.name} rules installed (${results.created.length} files)" && ls -la\n`;
        window.electronAPI.ptyWrite(terminalStore.ptyId, lsCommand);
      }
      
      // Show the prompt modal instead of closing immediately
      showPromptModal.value = true;
    } else {
      const failedNames = results.failed.map(f => f.file).join(", ");
      setupError.value = `Failed to create ${results.failed.length} file(s): ${failedNames}`;
    }
  } catch (error) {
    setupError.value = error.message;
  } finally {
    isSettingUp.value = false;
  }
}

function closeModal() {
  selectedIDE.value = null;
  installMethod.value = null;
  selectedShape.value = null;
  includeIDERules.value = [];
  setupError.value = null;
  showPromptModal.value = false;
  uiStore.closeSetupModal();
}

// Check CLI status when modal opens
watch(() => uiStore.isSetupModalOpen, (isOpen) => {
  if (isOpen) {
    checkCLIInstalled();
  }
});

// Also check on mount
onMounted(() => {
  if (uiStore.isSetupModalOpen) {
    checkCLIInstalled();
  }
});

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
</script>

<template>
  <Teleport to="body">
    <!-- Modal Overlay -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="uiStore.isSetupModalOpen"
        class="fixed inset-0 z-[200] flex items-center justify-center"
        @click="closeModal"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        <!-- Modal Content -->
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 scale-95 translate-y-2"
          enter-to-class="opacity-100 scale-100 translate-y-0"
          leave-active-class="transition-all duration-150 ease-in"
          leave-from-class="opacity-100 scale-100 translate-y-0"
          leave-to-class="opacity-0 scale-95 translate-y-2"
        >
          <div
            v-if="uiStore.isSetupModalOpen"
            class="relative bg-ui-bg border border-ui-border rounded-lg shadow-2xl max-w-3xl w-full mx-4"
            @click.stop
          >
            <!-- Modal Header -->
            <div class="flex items-center justify-between px-4 py-3 border-b border-ui-border">
              <h2 class="text-lg font-semibold text-ui-text">Setup</h2>
              <button
                @click="closeModal"
                class="p-1.5 rounded hover:bg-ui-bgLight text-ui-textMuted hover:text-ui-text transition-colors"
                title="Close"
              >
                <svg
                  class="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <!-- Modal Body -->
            <div class="px-4 py-6">
              <!-- Installation Method Selection -->
              <div class="mb-6">
                <p class="text-ui-text mb-4 text-sm">
                  Choose how you want to set up Archeon in your project:
                </p>
                
                <!-- Method Cards -->
                <div class="grid grid-cols-3 gap-3 mb-4">
                  <!-- Rules Only Method -->
                  <div
                    @click="selectMethod('rules')"
                    :class="[
                      'relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200',
                      'hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]',
                      installMethod === 'rules'
                        ? 'border-blue-500 bg-blue-500/10 shadow-md'
                        : 'border-ui-border bg-ui-bg hover:border-ui-textMuted/50',
                    ]"
                  >
                    <div class="flex items-start gap-3">
                      <div class="flex-1">
                        <h3 class="font-bold text-ui-text text-sm mb-1">Rules Only</h3>
                        <p class="text-xs text-ui-textMuted leading-relaxed">
                          Add AI assistant rules. Quick setup, no dependencies.
                        </p>
                      </div>
                    </div>
                    <div v-if="installMethod === 'rules'" class="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                      <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>

                  <!-- Shapes Method (only if CLI installed) -->
                  <div
                    @click="isCLIInstalled ? selectMethod('shapes') : null"
                    :class="[
                      'relative p-4 rounded-xl border-2 transition-all duration-200',
                      isCLIInstalled 
                        ? 'cursor-pointer hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]' 
                        : 'opacity-50 cursor-not-allowed',
                      installMethod === 'shapes'
                        ? 'border-green-500 bg-green-500/10 shadow-md'
                        : 'border-ui-border bg-ui-bg hover:border-ui-textMuted/50',
                    ]"
                  >
                    <div class="flex items-start gap-3">
                      <div class="flex-1">
                        <h3 class="font-bold text-ui-text text-sm mb-1">Shapes</h3>
                        <p class="text-xs text-ui-textMuted leading-relaxed">
                          {{ isCLIInstalled ? 'Full-stack app templates. Vue/React + FastAPI.' : 'Install CLI first to use shapes.' }}
                        </p>
                      </div>
                    </div>
                    <div v-if="installMethod === 'shapes'" class="absolute top-2 right-2 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                      <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <!-- CLI Required Badge -->
                    <div v-if="!isCLIInstalled" class="absolute -top-2 -right-2 px-2 py-0.5 bg-yellow-500/20 border border-yellow-500/30 rounded-full text-xs text-yellow-400">
                      CLI Required
                    </div>
                    <!-- CLI Installed Badge -->
                    <div v-else class="absolute -top-2 -right-2 px-2 py-0.5 bg-green-500/20 border border-green-500/30 rounded-full text-xs text-green-400">
                      CLI Ready
                    </div>
                  </div>

                  <!-- CLI Method -->
                  <div
                    @click="selectMethod('cli')"
                    :class="[
                      'relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200',
                      'hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]',
                      installMethod === 'cli'
                        ? 'border-gray-600 bg-gray-600/10 shadow-md'
                        : 'border-ui-border bg-ui-bg hover:border-ui-textMuted/50',
                    ]"
                  >
                    <div class="flex items-start gap-3">
                      <div class="flex-1">
                        <h3 class="font-bold text-ui-text text-sm mb-1">Install CLI</h3>
                        <p class="text-xs text-ui-textMuted leading-relaxed">
                          {{ isCLIInstalled ? 'CLI already installed. Reinstall or update.' : 'Install Archeon CLI globally via pip.' }}
                        </p>
                      </div>
                    </div>
                    <div v-if="installMethod === 'cli'" class="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-600 flex items-center justify-center">
                      <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Shapes Selection Panel -->
              <Transition
                enter-active-class="transition-all duration-200 ease-out"
                enter-from-class="opacity-0 -translate-y-2"
                enter-to-class="opacity-100 translate-y-0"
                leave-active-class="transition-all duration-150 ease-in"
                leave-from-class="opacity-100 translate-y-0"
                leave-to-class="opacity-0 -translate-y-2"
              >
                <div v-if="installMethod === 'shapes'" class="mb-6">
                  <p class="text-ui-textMuted text-xs mb-3">Select an architecture shape:</p>
                  
                  <!-- Shape Cards -->
                  <div class="grid grid-cols-2 gap-3 mb-4">
                    <div
                      v-for="shape in shapeOptions"
                      :key="shape.id"
                      @click="selectShape(shape.id)"
                      :class="[
                        'relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200',
                        'hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]',
                        selectedShape === shape.id
                          ? 'border-green-500 bg-green-500/10 shadow-md'
                          : 'border-ui-border bg-ui-bg hover:border-ui-textMuted/50',
                      ]"
                    >
                      <div class="flex items-start gap-3">
                        <div class="text-2xl">{{ shape.icon }}</div>
                        <div class="flex-1">
                          <h3 class="font-bold text-ui-text text-sm mb-1">{{ shape.name }}</h3>
                          <p class="text-xs text-ui-textMuted leading-relaxed mb-2">{{ shape.description }}</p>
                          <div class="flex flex-wrap gap-1">
                            <span
                              v-for="tag in shape.tags"
                              :key="tag"
                              class="px-1.5 py-0.5 bg-ui-bgLight rounded text-xs text-ui-textMuted"
                            >
                              {{ tag }}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div v-if="selectedShape === shape.id" class="absolute top-2 right-2 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                        <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <!-- IDE Rules Selection -->
                  <div v-if="selectedShape" class="p-3 rounded-lg bg-ui-bgLight border border-ui-border">
                    <p class="text-xs text-ui-textMuted mb-2">Include AI IDE rules (optional):</p>
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-for="rule in ideRuleOptions"
                        :key="rule.id"
                        @click="toggleIDERule(rule.id)"
                        :class="[
                          'px-2 py-1 rounded text-xs font-medium transition-colors',
                          includeIDERules.includes(rule.id)
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : 'bg-ui-bg text-ui-textMuted border border-ui-border hover:border-ui-textMuted/50',
                        ]"
                      >
                        {{ rule.name }}
                      </button>
                    </div>
                  </div>
                </div>
              </Transition>

              <!-- CLI Installation Panel -->
              <Transition
                enter-active-class="transition-all duration-200 ease-out"
                enter-from-class="opacity-0 -translate-y-2"
                enter-to-class="opacity-100 translate-y-0"
                leave-active-class="transition-all duration-150 ease-in"
                leave-from-class="opacity-100 translate-y-0"
                leave-to-class="opacity-0 -translate-y-2"
              >
                <div v-if="installMethod === 'cli'" class="mb-6 p-4 rounded-xl bg-gray-600/10 border border-gray-600/30">
                  <div class="flex items-start gap-3 mb-3">
                    <div>
                      <h4 class="font-semibold text-gray-300 text-sm mb-1">Archeon CLI</h4>
                      <p class="text-xs text-ui-textMuted">
                        The CLI provides powerful project scaffolding, glyph management, and sync capabilities.
                      </p>
                    </div>
                  </div>
                  
                  <!-- Privacy Notice -->
                  <div class="flex items-start gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20 mb-3">
                    <p class="text-xs text-green-300/80">
                      <strong>100% Private:</strong> Archeon is open source. We do NOT collect, store, or transmit any user data. Your code stays on your machine.
                    </p>
                  </div>

                  <!-- Source Link -->
                  <div class="flex items-center gap-2 text-xs text-ui-textMuted">
                    <a 
                      href="https://github.com/danaia/archeon" 
                      target="_blank" 
                      class="text-gray-400 hover:text-gray-300 underline"
                      @click.stop
                    >
                      github.com/danaia/archeon
                    </a>
                  </div>
                </div>
              </Transition>

              <!-- IDE Selection (only for Rules method) -->
              <Transition
                enter-active-class="transition-all duration-200 ease-out"
                enter-from-class="opacity-0 -translate-y-2"
                enter-to-class="opacity-100 translate-y-0"
                leave-active-class="transition-all duration-150 ease-in"
                leave-from-class="opacity-100 translate-y-0"
                leave-to-class="opacity-0 -translate-y-2"
              >
                <div v-if="installMethod === 'rules'">
                  <p class="text-ui-textMuted text-xs mb-3">Select your IDE:</p>

              <!-- IDE Cards Grid -->
              <div class="grid grid-cols-2 gap-3 mb-6">
                <div
                  v-for="ide in ideOptions"
                  :key="ide.id"
                  @click="selectIDE(ide.id)"
                  :class="[
                    'relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200',
                    'hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]',
                    selectedIDE === ide.id
                      ? 'border-grey-500 bg-grey-50/30 dark:bg-grey-900/20 shadow-md'
                      : 'border-ui-border bg-ui-bg hover:border-ui-textMuted/50',
                  ]"
                >
                  <!-- Selection indicator -->
                  <div
                    v-if="selectedIDE === ide.id"
                    class="absolute top-3 right-3 w-6 h-6 rounded-full bg-grey-500 flex items-center justify-center"
                  >
                    <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>

                  <!-- Card content -->
                  <div>
                    <h3 class="font-bold uppercase text-ui-text text-lg mb-1">{{ ide.name }}</h3>
                    <p class="text-xs text-ui-textMuted leading-relaxed">{{ ide.description }}</p>
                  </div>

                  <!-- Files info -->
                  <div v-if="selectedIDE === ide.id" class="mt-3 pt-3 border-t border-ui-border">
                    <p class="text-xs text-ui-textMuted mb-2">Will create:</p>
                    <div class="flex flex-wrap gap-1">
                      <span
                        v-for="(file, index) in ide.files.slice(0, 5)"
                        :key="index"
                        class="inline-block px-2 py-0.5 bg-ui-bgLight rounded text-xs text-ui-textMuted font-mono"
                      >
                        {{ file }}
                      </span>
                      <span
                        v-if="ide.files.length > 5"
                        class="inline-block px-2 py-0.5 bg-ui-bgLight rounded text-xs text-ui-textMuted font-mono"
                      >
                        +{{ ide.files.length - 5 }} more
                      </span>
                    </div>
                  </div>
                </div>
              </div>
                </div>
              </Transition>

              <!-- Error message -->
              <div v-if="setupError" class="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p class="text-sm text-red-400">{{ setupError }}</p>
              </div>

              <!-- Action buttons -->
              <div class="flex gap-3">
                <button
                  @click="closeModal"
                  :disabled="isSettingUp"
                  class="flex-1 px-4 py-2.5 rounded-lg border border-ui-border text-ui-text hover:bg-ui-bgLight transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                
                <!-- Scaffold with Shape Button -->
                <button
                  v-if="installMethod === 'shapes'"
                  @click="scaffoldWithShape"
                  :disabled="!selectedShape"
                  :class="[
                    'flex-1 px-4 py-2.5 rounded-lg text-white text-sm font-medium transition-all flex items-center justify-center gap-2',
                    selectedShape
                      ? 'bg-green-600 hover:bg-green-700 active:bg-green-800 shadow-md hover:shadow-lg'
                      : 'bg-gray-400 cursor-not-allowed text-black font-bold',
                  ]"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  {{ selectedShape ? 'Scaffold Project' : 'Select a Shape' }}
                </button>
                
                <!-- CLI Install Button -->
                <button
                  v-else-if="installMethod === 'cli'"
                  @click="installCLI"
                  class="flex-1 px-4 py-2.5 rounded-lg bg-gray-600 hover:bg-gray-700 active:bg-gray-800 text-white text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {{ isCLIInstalled ? 'Reinstall CLI' : 'Install via pip' }}
                </button>

                <!-- Rules Apply Button -->
                <button
                  v-else
                  @click="applySetup"
                  :disabled="!selectedIDE || isSettingUp"
                  :class="[
                    'flex-1 px-4 py-2.5 rounded-lg text-white text-sm font-medium transition-all flex items-center border border-grey-600 justify-center gap-2',
                    selectedIDE && !isSettingUp
                      ? 'bg-grey-600 hover:bg-grey-700 active:bg-grey-800 shadow-md hover:shadow-lg '
                      : 'bg-gray-400 cursor-not-allowed text-black font-bold',
                  ]"
                >
                  <span v-if="isSettingUp" class="animate-spin">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </span>
                  {{ isSettingUp ? 'Setting up...' : selectedIDE ? 'Apply Setup' : 'Select an IDE' }}
                </button>
              </div>
            </div>
          </div>
        </Transition>

        <!-- Nested Prompt Modal -->
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition-all duration-150 ease-in"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="showPromptModal"
            class="absolute inset-0 flex items-center justify-center"
            @click.stop
          >
            <!-- Nested modal backdrop -->
            <div class="absolute inset-0 bg-black/40 backdrop-blur-sm rounded-lg" @click="skipPromptAndClose" />
            
            <!-- Nested modal content -->
            <div class="relative bg-ui-bg border border-ui-border rounded-lg shadow-2xl max-w-md w-full mx-4 z-10">
              <!-- Success header -->
              <div class="px-4 py-3 border-b border-ui-border bg-green-500/10">
                <div class="flex items-center gap-2">
                  <span class="text-green-400 text-lg">✓</span>
                  <h3 class="text-sm font-semibold text-green-400">
                    Rules installed successfully!
                  </h3>
                </div>
                <p class="text-xs text-ui-textMuted mt-1">
                  {{ copiedFilesCount }} files copied to your project
                </p>
              </div>

              <!-- Prompt section -->
              <div class="px-4 py-4">
                <p class="text-sm text-ui-text mb-3">
                  Copy this prompt and paste it into your AI IDE assistant to initialize the project:
                </p>
                
                <!-- Prompt box with copy button -->
                <div class="relative group">
                  <div class="bg-ui-bgLight border border-ui-border rounded-lg p-3 pr-12 font-mono text-sm text-grey-300">
                    {{ INIT_PROMPT }}
                  </div>
                  <button
                    @click="copyPromptAndClose"
                    class="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md bg-grey-600 hover:bg-grey-500 text-white transition-colors"
                    title="Copy to clipboard"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Actions -->
              <div class="px-4 py-3 border-t border-ui-border flex gap-2">
                <button
                  @click="skipPromptAndClose"
                  class="flex-1 px-3 py-2 rounded-lg border border-ui-border text-ui-textMuted hover:text-ui-text hover:bg-ui-bgLight transition-colors text-sm"
                >
                  Skip
                </button>
                <button
                  @click="copyPromptAndClose"
                  class="flex-1 px-3 py-2 rounded-lg bg-grey-600 hover:bg-grey-500 text-white transition-colors text-sm font-medium flex items-center justify-center gap-2"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy & Close
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
