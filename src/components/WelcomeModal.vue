<script setup>
import { ref, onMounted } from "vue";
import { useUIStore } from "../stores";
import { useTerminalStore } from "../stores/terminal";
import { useSetup } from "../composables/useSetup";
import { getCLIInstallCommand } from "../constants/setup";
import { getOS } from "../utils/platform";

const uiStore = useUIStore();
const terminalStore = useTerminalStore();

const {
  isPipxInstalled,
  isInstallingPipx,
  isSettingUp,
  showPipxModal,
  installPipxAndContinue,
  skipPipxAndUsePip,
  installCLI,
} = useSetup();

// State
const dontShowAgain = ref(false);
const copied = ref(false);
const isAutoInstalling = ref(false);

const WELCOME_STORAGE_KEY = "archeon:hasSeenWelcome";

// Get the appropriate CLI install command
const CLI_INSTALL_COMMAND = getCLIInstallCommand(true).split('&&')[0].trim();

// Check if user has dismissed welcome before
const shouldShowWelcome = () => {
  return localStorage.getItem(WELCOME_STORAGE_KEY) !== "true";
};

// Initialize dontShowAgain based on localStorage state
onMounted(() => {
  // If user has already seen welcome, close the modal immediately and check the box
  if (!shouldShowWelcome()) {
    dontShowAgain.value = true;
    uiStore.closeWelcomeModal();
  }
});

// Copy command to clipboard
const copyCommand = async () => {
  const command = "pipx install git+https://github.com/danaia/archeon.git";
  try {
    await navigator.clipboard.writeText(command);
    console.log("[Copy] Command copied to clipboard:", command);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    console.error("Failed to copy:", err);
  }
};

// Auto-install Archeon CLI with pipx
const handleAutoInstall = async () => {
  isAutoInstalling.value = true;
  
  // Close welcome modal
  uiStore.closeWelcomeModal();
  
  // Open terminal
  terminalStore.expand();
  
  // Brief delay to ensure terminal opens before starting install
  setTimeout(() => {
    // Check if pipx is installed, if not install it first
    if (!isPipxInstalled.value) {
      installPipxAndContinue();
    } else {
      // Pipx is installed, go straight to CLI install
      installCLI();
    }
    isAutoInstalling.value = false;
  }, 500);
};

// Handle dismiss
const handleDismiss = () => {
  if (dontShowAgain.value) {
    localStorage.setItem(WELCOME_STORAGE_KEY, "true");
  } else {
    localStorage.removeItem(WELCOME_STORAGE_KEY);
  }
  uiStore.closeWelcomeModal();
};

// Allow resetting welcome (for testing or user preference)
const resetWelcome = () => {
  localStorage.removeItem(WELCOME_STORAGE_KEY);
};

// Expose for testing/debugging
window.__resetWelcome = resetWelcome;
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
        v-if="uiStore.isWelcomeModalOpen"
        class="fixed inset-0 z-[200] flex items-center justify-center animate-gpu"
        @click="handleDismiss"
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
            v-if="uiStore.isWelcomeModalOpen"
            class="relative bg-ui-bg border border-ui-border rounded-xl shadow-2xl max-w-5xl w-full mx-4 overflow-hidden animate-gpu"
            @click.stop
          >
            <!-- Header with gradient accent -->
            <div
              class="relative px-6 py-8 border-b border-ui-border"
            >
              <!-- Close button -->
              <button
                @click="handleDismiss"
                class="absolute top-4 right-4 p-2 rounded-lg hover:bg-ui-bgLight text-ui-textMuted hover:text-ui-text transition-colors"
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

              <h1 class="text-3xl font-semibold text-ui-text mb-2">
                Welcome to Archeon
              </h1>
              <p class="text-ui-textMuted text-base">
                Let's get you started with a few simple steps
              </p>
            </div>

            <!-- Content -->
            <div class="px-8 py-8">
              <!-- Step 1: Auto-install (Prominent at top) -->
              <div class="mb-8">
                <div class="flex gap-5 items-start">
                  <div class="flex-shrink-0 pt-0.5">
                    <div class="flex items-center justify-center h-12 w-12 rounded-lg border-2 border-gray-600/50 text-white">
                      <span class="text-xl font-semibold">1</span>
                    </div>
                  </div>
                  <div class="flex-1">
                    <h3 class="text-xl font-semibold text-ui-text mb-2">
                      Install the CLI
                    </h3>
                    <p class="text-ui-textMuted text-sm mb-5 leading-relaxed">
                      We'll automatically install pipx (if needed) and then the Archeon CLI in your terminal. This is the first step to get started.
                    </p>
                    <div class="flex items-center gap-3">
                      <button
                        @click="handleAutoInstall"
                        :disabled="isAutoInstalling || isInstallingPipx || isSettingUp"
                        class="px-6 py-3 rounded-lg bg-white hover:bg-gray-100 disabled:bg-gray-500 text-black font-semibold transition-colors flex items-center gap-2 text-sm"
                      >
                        <svg
                          v-if="!isAutoInstalling && !isInstallingPipx && !isSettingUp"
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
                        <svg
                          v-else
                          class="w-4 h-4 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {{ isAutoInstalling || isInstallingPipx || isSettingUp ? "Installing..." : "Install Now" }}
                      </button>
                      <a
                        href="https://github.com/danaia/archeon"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-gray-400 hover:text-white hover:border-gray-500 transition-colors text-sm"
                        title="Learn about the CLI on GitHub"
                      >
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.6.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                        </svg>
                        Learn about the CLI on GitHub
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Divider -->
              <div class="relative h-px bg-ui-border my-8" />

              <!-- Grid: Steps 2-4 -->
              <div class="grid grid-cols-3 gap-5">
                <!-- Step 2: Target Project -->
                <div class="flex gap-4">
                  <div class="flex-shrink-0 pt-0.5">
                    <div class="flex items-center justify-center h-10 w-10 rounded-lg border-2 border-gray-600/50 text-white">
                      <span class="text-lg font-semibold">2</span>
                    </div>
                  </div>
                  <div class="flex-1">
                    <h3 class="text-base font-semibold text-ui-text mb-1.5">
                      Target Project
                    </h3>
                    <p class="text-ui-textMuted text-xs leading-relaxed">
                      Click the folder icon to open or drag your project into Archeon.
                    </p>
                  </div>
                </div>

                <!-- Step 3: Define Shapes -->
                <div class="flex gap-4">
                  <div class="flex-shrink-0 pt-0.5">
                    <div class="flex items-center justify-center h-10 w-10 rounded-lg border-2 border-gray-600/50 text-white">
                      <span class="text-lg font-semibold">3</span>
                    </div>
                  </div>
                  <div class="flex-1">
                    <h3 class="text-base font-semibold text-ui-text mb-1.5">
                      Define Shapes & Roles
                    </h3>
                    <p class="text-ui-textMuted text-xs leading-relaxed">
                      Click "Setup" in the terminal to scaffold your architecture.
                    </p>
                  </div>
                </div>

                <!-- Step 4: Explore -->
                <div class="flex gap-4">
                  <div class="flex-shrink-0 pt-0.5">
                    <div class="flex items-center justify-center h-10 w-10 rounded-lg border-2 border-gray-600/50 text-white">
                      <span class="text-lg font-semibold">4</span>
                    </div>
                  </div>
                  <div class="flex-1">
                    <h3 class="text-base font-semibold text-ui-text mb-1.5">
                      Explore & Build
                    </h3>
                    <p class="text-ui-textMuted text-xs leading-relaxed">
                      Visualize your architecture and iterate on your design.
                    </p>
                  </div>
                </div>
              </div>

              <!-- Divider -->
              <div class="relative h-px bg-ui-border my-8" />

              <!-- Manual Install (Alternative) -->
              <div>
                <p class="text-ui-textMuted text-xs font-semibold uppercase tracking-widest mb-3">
                  Prefer Manual Install?
                </p>
                <div class="flex items-center gap-2">
                  <code class="flex-1 bg-ui-bgLight px-4 py-3 rounded font-mono text-xs text-ui-text border border-ui-border break-all select-text">pipx install git+https://github.com/danaia/archeon.git</code>
                  <button
                    @click.prevent="copyCommand"
                    :class="[
                      'px-4 py-3 rounded transition-colors flex items-center gap-2 shrink-0 font-semibold',
                      copied
                        ? 'bg-gray-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-white'
                    ]"
                    :title="copied ? 'Copied!' : 'Copy command'"
                  >
                    <svg
                      class="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        v-if="!copied"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                      <path
                        v-else
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span class="text-xs">{{ copied ? "Copied" : "Copy" }}</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="px-8 py-4 border-t border-ui-border bg-ui-bgLight/50 flex items-center justify-between">
              <!-- Don't show again checkbox -->
              <label class="flex items-center gap-2 cursor-pointer group">
                <input
                  v-model="dontShowAgain"
                  type="checkbox"
                  class="w-4 h-4 rounded border-ui-border bg-ui-bg text-white cursor-pointer accent-white"
                />
                <span class="text-sm text-ui-textMuted group-hover:text-ui-text transition-colors">
                  Don't show again
                </span>
              </label>

              <!-- Action button -->
              <button
                @click="handleDismiss"
                class="px-6 py-2.5 rounded-lg bg-white hover:bg-gray-100 text-black font-semibold transition-colors text-sm"
              >
                Get Started
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Smooth animations */
:deep(.animate-gpu) {
  will-change: transform, opacity;
}
</style>
