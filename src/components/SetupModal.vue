<script setup>
import { ref } from "vue";
import { useUIStore, useProjectStore, useTerminalStore } from "../stores";

const uiStore = useUIStore();
const projectStore = useProjectStore();
const terminalStore = useTerminalStore();

const selectedIDE = ref(null);
const isSettingUp = ref(false);
const setupError = ref(null);

const ideOptions = [
  {
    id: "all",
    name: "All IDEs",
    description: "Install Archeon rules for all supported IDEs at once",
    icon: "🌐",
    color: "from-purple-500 to-indigo-600",
    files: [
      ".cursorrules",
      ".cursor/README.md",
      ".github/copilot-instructions.md",
      ".github/COPILOT_README.md",
      ".windsurfrules",
      ".windsurf/README.md",
      ".clinerules",
      ".cline/README.md",
      ".aider.conf.yml",
      ".aider/README.md",
      ".vscode/settings.json",
      ".vscode/ARCHEON_README.md",
    ],
  },
  {
    id: "cursor",
    name: "Cursor",
    description: "Optimized AI rules for Cursor AI editor",
    icon: "⚡",
    color: "from-emerald-500 to-teal-600",
    files: [".cursorrules", ".cursor/README.md"],
  },
  {
    id: "vscode",
    name: "Visual Studio Code",
    description: "Workspace settings & Archeon rules for VS Code",
    icon: "📘",
    color: "from-blue-500 to-cyan-600",
    files: [".vscode/settings.json", ".vscode/ARCHEON_README.md"],
  },
  {
    id: "windsurf",
    name: "Windsurf",
    description: "AI assistant rules for Codeium's Windsurf",
    icon: "🌊",
    color: "from-cyan-500 to-blue-600",
    files: [".windsurfrules", ".windsurf/README.md"],
  },
  {
    id: "cline",
    name: "Cline",
    description: "Claude Dev / Cline assistant configuration",
    icon: "🤖",
    color: "from-orange-500 to-red-600",
    files: [".clinerules", ".cline/README.md"],
  },
  {
    id: "aider",
    name: "Aider",
    description: "Aider AI pair programming setup & rules",
    icon: "🔧",
    color: "from-yellow-500 to-orange-600",
    files: [".aider.conf.yml", ".aider/README.md"],
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    description: "GitHub Copilot instructions & settings",
    icon: "✨",
    color: "from-pink-500 to-rose-600",
    files: [".github/copilot-instructions.md", ".github/COPILOT_README.md"],
  },
];

function selectIDE(ideId) {
  selectedIDE.value = ideId === selectedIDE.value ? null : ideId;
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
      closeModal();
      
      // Show results in terminal
      if (terminalStore.ptyId) {
        const lsCommand = `cd "${projectPath}" && echo "✓ ${selectedOption.name} rules installed (${results.created.length} files)" && ls -la\n`;
        window.electronAPI.ptyWrite(terminalStore.ptyId, lsCommand);
      }
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
  setupError.value = null;
  uiStore.closeSetupModal();
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
            class="relative bg-ui-bg border border-ui-border rounded-lg shadow-2xl max-w-2xl w-full mx-4"
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
            <!-- Description -->
              <div class="mb-6">
                <p class="text-ui-text mb-2 text-sm">
                  Select your IDE to automatically configure Archeon AI rules. These rules help AI assistants
                  understand your project structure and follow the glyph-based architecture.
                </p>
              </div>

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
                      ? 'border-indigo-500 bg-indigo-50/30 dark:bg-indigo-900/20 shadow-md'
                      : 'border-ui-border bg-ui-bg hover:border-ui-textMuted/50',
                  ]"
                >
                  <!-- Selection indicator -->
                  <div
                    v-if="selectedIDE === ide.id"
                    class="absolute top-3 right-3 w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center"
                  >
                    <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>

                  <!-- Card content -->
                  <div class="flex items-start gap-3">
                    <div
                      :class="[
                        'w-10 h-10 rounded-lg flex items-center justify-center text-xl',
                        'bg-gradient-to-br ' + ide.color,
                      ]"
                    >
                      {{ ide.icon }}
                    </div>
                    <div class="flex-1 min-w-0">
                      <h3 class="font-semibold text-ui-text text-sm mb-1">{{ ide.name }}</h3>
                      <p class="text-xs text-ui-textMuted leading-relaxed">{{ ide.description }}</p>
                    </div>
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
                <button
                  @click="applySetup"
                  :disabled="!selectedIDE || isSettingUp"
                  :class="[
                    'flex-1 px-4 py-2.5 rounded-lg text-white text-sm font-medium transition-all flex items-center justify-center gap-2',
                    selectedIDE && !isSettingUp
                      ? 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 shadow-md hover:shadow-lg'
                      : 'bg-gray-400 cursor-not-allowed',
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
      </div>
    </Transition>
  </Teleport>
</template>
