<script setup>
import { onMounted, watch } from "vue";
import { useUIStore, useProjectStore } from "../stores";
import { useSetup } from "../composables/useSetup";
import { getPlatformInfo } from "../utils/platform";

const uiStore = useUIStore();
const projectStore = useProjectStore();
const platformInfo = getPlatformInfo();

const {
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
  showPipxModal,
  isInstallingPipx,
  
  // Dynamic shapes state
  shapeOptions,
  isLoadingShapes,
  shapesError,
  shapesPath,

  // Constants
  INIT_PROMPT,
  ideRuleOptions,
  ideOptions,

  // Methods
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
  checkCLIInstalled,
  refreshCLICheck,
  loadShapes,
} = useSetup();

// Check CLI and pipx status when modal opens
watch(
  () => uiStore.isSetupModalOpen,
  (isOpen) => {
    if (isOpen) {
      initChecks();
    }
  }
);

// Also check on mount
onMounted(() => {
  if (uiStore.isSetupModalOpen) {
    initChecks();
  }
});
</script>

<template>
  <Teleport to="body">
    <!-- Modal Overlay -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out animate-gpu"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-all duration-150 ease-in animate-gpu"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="uiStore.isSetupModalOpen"
        class="fixed inset-0 z-[200] flex items-center justify-center animate-gpu"
        @click="closeModal"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        <!-- Modal Content -->
        <Transition
          enter-active-class="transition-all duration-200 ease-out animate-gpu"
          enter-from-class="opacity-0 scale-95 translate-y-2"
          enter-to-class="opacity-100 scale-100 translate-y-0"
          leave-active-class="transition-all duration-150 ease-in animate-gpu"
          leave-from-class="opacity-100 scale-100 translate-y-0"
          leave-to-class="opacity-0 scale-95 translate-y-2"
        >
          <div
            v-if="uiStore.isSetupModalOpen"
            class="relative bg-ui-bg border border-ui-border rounded-lg shadow-2xl max-w-3xl w-full mx-4 animate-gpu"
            @click.stop
          >
            <!-- Modal Header -->
            <div
              class="flex items-center justify-between px-4 py-3 border-b border-ui-border"
            >
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
              <!-- Project Path Display & Selection -->
              <div
                class="mb-6 p-3 rounded-lg bg-ui-bgLight border border-ui-border"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="flex-1 min-w-0">
                    <p class="text-xs text-ui-textMuted mb-1">
                      Project Directory:
                    </p>
                    <p
                      v-if="projectStore.projectPath"
                      class="text-sm text-ui-text font-mono truncate"
                    >
                      {{ projectStore.projectPath }}
                    </p>
                    <p v-else class="text-sm text-ui-textMuted italic">
                      No project selected
                    </p>
                  </div>
                  <button
                    @click="handleOpenProject"
                    class="px-3 py-2 rounded-lg bg-ui-bg border border-ui-border hover:bg-ui-bgLight text-ui-text transition-colors text-sm font-medium flex items-center gap-2 shrink-0"
                    title="Select project directory"
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
                    Select
                  </button>
                </div>
              </div>

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
                        <h3 class="font-bold text-ui-text text-sm mb-1">
                          Rules Only
                        </h3>
                        <p class="text-xs text-ui-textMuted leading-relaxed">
                          Add AI assistant rules. Quick setup, no dependencies.
                        </p>
                      </div>
                    </div>
                    <div
                      v-if="installMethod === 'rules'"
                      class="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center"
                    >
                      <svg
                        class="w-3 h-3 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
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
                        <h3 class="font-bold text-ui-text text-sm mb-1">
                          Install CLI
                        </h3>
                        <p class="text-xs text-ui-textMuted leading-relaxed">
                          {{
                            isCLIInstalled
                              ? "CLI already installed. Reinstall or update."
                              : "Install Archeon CLI globally via pip."
                          }}
                        </p>
                      </div>
                    </div>
                    <div
                      v-if="installMethod === 'cli'"
                      class="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-600 flex items-center justify-center"
                    >
                      <svg
                        class="w-3 h-3 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M5 13l4 4L19 7"
                        />
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
                        <h3 class="font-bold text-ui-text text-sm mb-1">
                          Shapes
                        </h3>
                        <p class="text-xs text-ui-textMuted leading-relaxed">
                          <span v-if="isCheckingCLI">
                            Checking CLI installation...
                          </span>
                          <span v-else>
                            {{
                              isCLIInstalled
                                ? "Full-stack app templates. Vue/React + FastAPI."
                                : "Install CLI first to use shapes."
                            }}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div
                      v-if="installMethod === 'shapes'"
                      class="absolute top-2 right-2 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center"
                    >
                      <svg
                        class="w-3 h-3 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                    <!-- Checking Badge -->
                    <div
                      v-if="isCheckingCLI"
                      class="absolute -top-2 -right-2 px-2 py-0.5 bg-blue-500/20 border border-blue-500/30 rounded-full text-xs text-blue-400 flex items-center gap-1"
                    >
                      <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Checking
                    </div>
                    <!-- CLI Required Badge -->
                    <div
                      v-else-if="!isCLIInstalled"
                      class="absolute -top-2 -right-2 px-2 py-0.5 bg-yellow-800 border border-yellow-800 rounded-full text-xs text-white"
                    >
                      CLI Required
                    </div>
                    <!-- CLI Installed Badge -->
                    <div
                      v-else
                      class="absolute -top-2 -right-2 px-2 py-0.5 bg-green-900/80 border border-green-500/30 rounded-full text-xs text-green-400"
                    >
                      CLI Ready
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
                  <div class="flex items-center justify-between mb-3">
                    <p class="text-ui-textMuted text-xs">
                      Select an architecture shape:
                    </p>
                    <div class="flex items-center gap-2">
                      <!-- Shapes source indicator -->
                      <div v-if="shapesPath" class="flex items-center gap-1 text-[10px] text-green-400/70">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                        </svg>
                        <span class="truncate max-w-[150px]" :title="shapesPath">From CLI</span>
                      </div>
                      <!-- Refresh shapes button -->
                      <button
                        @click="loadShapes"
                        :disabled="isLoadingShapes"
                        class="px-2 py-1 text-xs rounded bg-ui-bg border border-ui-border hover:bg-ui-bgLight transition-colors disabled:opacity-50 flex items-center gap-1"
                        title="Refresh available shapes from Archeon installation"
                      >
                        <svg
                          :class="['w-3 h-3', isLoadingShapes ? 'animate-spin' : '']"
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
                        {{ isLoadingShapes ? '' : 'Refresh' }}
                      </button>
                    </div>
                  </div>

                  <!-- Loading state -->
                  <div v-if="isLoadingShapes" class="flex items-center justify-center py-8">
                    <svg class="w-6 h-6 animate-spin text-green-400" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span class="ml-2 text-sm text-ui-textMuted">Loading shapes from Archeon...</span>
                  </div>

                  <!-- Error state -->
                  <div v-else-if="shapesError && shapeOptions.length === 0" class="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 mb-4">
                    <p class="text-sm text-amber-400">{{ shapesError }}</p>
                    <p class="text-xs text-ui-textMuted mt-1">Using default shapes instead.</p>
                  </div>

                  <!-- Shape Cards -->
                  <div v-else class="grid grid-cols-2 gap-3 mb-4">
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
                          <h3 class="font-bold text-ui-text text-sm mb-1">
                            {{ shape.name }}
                          </h3>
                          <p
                            class="text-xs text-ui-textMuted leading-relaxed mb-2"
                          >
                            {{ shape.description }}
                          </p>
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
                      <div
                        v-if="selectedShape === shape.id"
                        class="absolute top-2 right-2 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center"
                      >
                        <svg
                          class="w-3 h-3 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <!-- IDE Rules Selection -->
                  <div
                    v-if="selectedShape"
                    class="p-3 rounded-lg bg-ui-bgLight border border-ui-border"
                  >
                    <p class="text-xs text-ui-textMuted mb-2">
                      Include AI IDE rules (optional):
                    </p>
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
                <div
                  v-if="installMethod === 'cli'"
                  class="mb-6 p-4 rounded-xl bg-gray-600/10 border border-gray-600/30"
                >
                  <div class="flex items-start gap-3 mb-3">
                    <div class="flex-1">
                      <div class="flex items-center justify-between mb-1">
                        <h4 class="font-semibold text-gray-300 text-sm">
                          Archeon CLI
                        </h4>
                        <button
                          @click="refreshCLICheck"
                          :disabled="isCheckingCLI"
                          class="px-2 py-1 text-xs rounded bg-ui-bg border border-ui-border hover:bg-ui-bgLight transition-colors disabled:opacity-50 flex items-center gap-1"
                          title="Refresh CLI installation status"
                        >
                          <svg
                            :class="['w-3 h-3', isCheckingCLI ? 'animate-spin' : '']"
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
                          {{ isCheckingCLI ? 'Checking...' : 'Refresh' }}
                        </button>
                      </div>
                      <p class="text-xs text-ui-textMuted">
                        The CLI provides powerful project scaffolding, glyph
                        management, and sync capabilities.
                      </p>
                      <p v-if="isCLIInstalled" class="text-xs text-green-400 mt-2">
                        ✓ CLI is already installed
                      </p>
                    </div>
                  </div>

                  <!-- Privacy Notice -->
                  <div
                    class="flex items-start gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20 mb-3"
                  >
                    <p class="text-xs text-green-300/80">
                      <strong>100% Private:</strong> Archeon is open source. We
                      do NOT collect, store, or transmit any user data. Your
                      code stays on your machine.
                    </p>
                  </div>

                  <!-- Source Link -->
                  <div
                    class="flex items-center gap-2 text-xs text-ui-textMuted mb-4"
                  >
                    <a
                      href="https://github.com/danaia/archeon"
                      target="_blank"
                      class="text-gray-400 hover:text-gray-300 underline"
                      @click.stop
                    >
                      github.com/danaia/archeon
                    </a>
                  </div>

                  <!-- Next Steps Message -->
                  <div 
                  v-if="isCLIInstalled" 
                    class="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20"
                  >
                    <p class="text-xs text-blue-300/90 mb-2">
                      <strong>Next Steps:</strong>
                    </p>
                    <ul class="text-xs text-blue-300/80 space-y-1 list-disc list-inside">
                      <li>Click <strong>Install CLI</strong> to install the CLI)</li>
                      <li>Wait for installation to complete</li>
                      <li>Click <strong>Check</strong> to verify installation</li>
                      <li>Close and reopen Setup add a Shape</li>
                    </ul>
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
                        <svg
                          class="w-4 h-4 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>

                      <!-- Card content -->
                      <div>
                        <h3
                          class="font-bold uppercase text-ui-text text-lg mb-1"
                        >
                          {{ ide.name }}
                        </h3>
                        <p class="text-xs text-ui-textMuted leading-relaxed">
                          {{ ide.description }}
                        </p>
                      </div>

                      <!-- Files info -->
                      <div
                        v-if="selectedIDE === ide.id"
                        class="mt-3 pt-3 border-t border-ui-border"
                      >
                        <p class="text-xs text-ui-textMuted mb-2">
                          Will create:
                        </p>
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
              <div
                v-if="setupError"
                class="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg"
              >
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
                  :disabled="!selectedShape || isLoadingShapes"
                  :class="[
                    'flex-1 px-4 py-2.5 rounded-lg text-white text-sm font-medium transition-all flex items-center justify-center gap-2',
                    selectedShape && !isLoadingShapes
                      ? 'bg-green-600 hover:bg-green-700 active:bg-green-800 shadow-md hover:shadow-lg'
                      : 'bg-gray-400 cursor-not-allowed text-black font-bold',
                  ]"
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
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                  {{ selectedShape ? "Scaffold Project" : "Select a Shape" }}
                </button>

                <!-- CLI Install Button -->
                <button
                  v-else-if="installMethod === 'cli'"
                  @click="installCLI"
                  class="flex-1 px-4 py-2.5 rounded-lg bg-gray-600 hover:bg-gray-700 active:bg-gray-800 text-white text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
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
                      d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  {{ isCLIInstalled ? "Reinstall CLI" : "Install via pip" }}
                </button>

                <!-- Rules Apply Button -->
                <button
                  v-else
                  @click="applySetup"
                  :disabled="!selectedIDE || isSettingUp"
                  :class="[
                    'flex-1 px-4 py-2.5 rounded-lg text-white text-sm font-medium transition-all flex items-center justify-center gap-2',
                    selectedIDE && !isSettingUp
                      ? 'bg-grey-800 hover:bg-grey-700 active:bg-grey-800 shadow-md hover:shadow-lg '
                      : 'bg-gray-800 cursor-not-allowed text-black font-bold',
                  ]"
                >
                  <span v-if="isSettingUp" class="animate-spin">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle
                        class="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        stroke-width="4"
                      ></circle>
                      <path
                        class="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  </span>
                  {{
                    isSettingUp
                      ? "Setting up..."
                      : selectedIDE
                      ? "Apply Setup"
                      : "Select an IDE"
                  }}
                </button>
              </div>
            </div>
          </div>
        </Transition>

        <!-- Pipx Installation Modal -->
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition-all duration-150 ease-in"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="showPipxModal"
            class="absolute inset-0 flex items-center justify-center"
            @click.stop
          >
            <!-- Nested modal backdrop -->
            <div
              class="absolute inset-0 bg-black/40 backdrop-blur-sm rounded-lg"
              @click="showPipxModal = false"
            />

            <!-- Nested modal content -->
            <div
              class="relative bg-ui-bg border border-ui-border rounded-lg shadow-2xl max-w-lg w-full mx-4 z-10"
            >
              <!-- Header -->
              <div class="px-4 py-3 border-b border-ui-border bg-yellow-500/10">
                <div class="flex items-center gap-2">
                  <span class="text-yellow-400 text-lg">⚠️</span>
                  <h3 class="text-sm font-semibold text-yellow-400">
                    pipx Not Detected
                  </h3>
                </div>
              </div>

              <!-- Content -->
              <div class="px-4 py-4">
                <p class="text-sm text-ui-text mb-3">
                  <strong>pipx</strong> is the recommended way to install Python
                  CLI tools on {{ platformInfo.os === 'macos' ? 'macOS' : 'Linux' }}. It creates isolated environments
                  preventing dependency conflicts.
                </p>

                <div
                  class="p-3 rounded-lg bg-ui-bgLight border border-ui-border mb-3"
                >
                  <p class="text-xs text-ui-textMuted mb-2">
                    <strong>Benefits of pipx:</strong>
                  </p>
                  <ul
                    class="text-xs text-ui-textMuted space-y-1 list-disc list-inside"
                  >
                    <li>Isolated environments for each tool</li>
                    <li>No dependency conflicts with system Python</li>
                    <li>Easier updates and management</li>
                    <li>Industry best practice for CLI tools</li>
                  </ul>
                </div>

                <p class="text-sm text-ui-text mb-3">
                  Would you like to install pipx first? 
                  <span class="text-xs text-ui-textMuted">(via {{ platformInfo.pipxInstallMethod }})</span>
                </p>

                <div
                  class="p-2 rounded bg-yellow-500/10 border border-yellow-500/20"
                >
                  <p class="text-xs text-yellow-300/80">
                    <strong>Note:</strong> After installing pipx, you'll need to
                    restart your terminal before installing Archeon CLI.
                  </p>
                </div>
              </div>

              <!-- Actions -->
              <div class="px-4 py-3 border-t border-ui-border flex gap-2">
                <button
                  @click="skipPipxAndUsePip"
                  class="flex-1 px-3 py-2 rounded-lg border border-ui-border text-ui-textMuted hover:text-ui-text hover:bg-ui-bgLight transition-colors text-sm"
                >
                  Skip, use pip instead
                </button>
                <button
                  @click="installPipxAndContinue"
                  :disabled="isInstallingPipx"
                  class="flex-1 px-3 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-700 text-white transition-colors text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
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
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Install pipx
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
            <div
              class="absolute inset-0 bg-black/40 backdrop-blur-sm rounded-lg"
              @click="skipPromptAndClose"
            />

            <!-- Nested modal content -->
            <div
              class="relative bg-ui-bg border border-ui-border rounded-lg shadow-2xl max-w-md w-full mx-4 z-10"
            >
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
                  Copy this prompt and paste it into your AI IDE assistant to
                  initialize the project:
                </p>

                <!-- Prompt box with copy button -->
                <div class="relative group">
                  <div
                    class="bg-ui-bgLight border border-ui-border rounded-lg p-3 pr-12 font-mono text-sm text-grey-300"
                  >
                    {{ INIT_PROMPT }}
                  </div>
                  <button
                    @click="copyPromptAndClose"
                    class="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md bg-grey-600 hover:bg-grey-500 text-white transition-colors"
                    title="Copy to clipboard"
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
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
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
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
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
