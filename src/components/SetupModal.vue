<script setup>
import { useUIStore } from "../stores";

const uiStore = useUIStore();

function closeModal() {
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
              <p class="text-ui-textMuted">Setup content will be added here soon.</p>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
