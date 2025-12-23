<script setup>
import { useUIStore } from "../stores";

const uiStore = useUIStore();

function getTypeStyles(type) {
  switch (type) {
    case "warning":
      return {
        bg: "bg-amber-900/90",
        border: "border-amber-500/50",
        icon: "⚠",
        iconColor: "text-amber-400",
      };
    case "error":
      return {
        bg: "bg-red-900/90",
        border: "border-red-500/50",
        icon: "✕",
        iconColor: "text-red-400",
      };
    case "success":
      return {
        bg: "bg-green-900/90",
        border: "border-green-500/50",
        icon: "✓",
        iconColor: "text-green-400",
      };
    default:
      return {
        bg: "bg-slate-800/90",
        border: "border-slate-600/50",
        icon: "ℹ",
        iconColor: "text-blue-400",
      };
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed bottom-4 left-4 z-50 flex flex-col gap-2 max-w-md">
      <TransitionGroup name="toast">
        <div
          v-for="toast in uiStore.toasts"
          :key="toast.id"
          :class="[
            'flex items-start gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm shadow-lg',
            getTypeStyles(toast.type).bg,
            getTypeStyles(toast.type).border,
          ]"
        >
          <!-- Icon -->
          <span
            :class="[
              'text-lg flex-shrink-0',
              getTypeStyles(toast.type).iconColor,
            ]"
          >
            {{ getTypeStyles(toast.type).icon }}
          </span>

          <!-- Content -->
          <div class="flex-1 min-w-0">
            <p class="text-sm text-white/90 leading-relaxed">
              {{ toast.message }}
            </p>

            <!-- Suggested fix (if provided) -->
            <div v-if="toast.meta?.suggestion" class="mt-2">
              <p class="text-xs text-white/60 mb-1">Suggested fix:</p>
              <code
                class="text-xs bg-black/30 px-2 py-1 rounded text-amber-300 block overflow-x-auto"
              >
                {{ toast.meta.suggestion }}
              </code>
            </div>

            <!-- File path hint -->
            <p
              v-if="toast.meta?.file"
              class="text-xs text-white/50 mt-1.5 truncate"
            >
              {{ toast.meta.file }}
            </p>
          </div>

          <!-- Dismiss button -->
          <button
            @click="uiStore.removeToast(toast.id)"
            class="text-white/40 hover:text-white/80 transition-colors flex-shrink-0"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active {
  transition: all 0.3s ease-out;
}

.toast-leave-active {
  transition: all 0.2s ease-in;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

.toast-move {
  transition: transform 0.3s ease;
}
</style>
