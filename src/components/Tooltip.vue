<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";

const props = defineProps({
  text: {
    type: String,
    default: "",
  },
  position: {
    type: String,
    default: "top", // top, bottom, left, right
  },
  maxWidth: {
    type: String,
    default: "280px",
  },
  offsetX: {
    type: Number,
    default: 0,
  },
  offsetY: {
    type: Number,
    default: 0,
  },
});

const isVisible = ref(false);
const triggerRef = ref(null);
const tooltipStyle = ref({});

async function show() {
  isVisible.value = true;
  await nextTick();
  updatePosition();
}

function hide() {
  isVisible.value = false;
}

function updatePosition() {
  if (!triggerRef.value) return;

  const rect = triggerRef.value.getBoundingClientRect();
  const offset = 8;

  let top, left;

  switch (props.position) {
    case "bottom":
      top = rect.bottom + offset + props.offsetY;
      left = rect.left + rect.width / 2 + props.offsetX;
      break;
    case "left":
      top = rect.top + rect.height / 2 + props.offsetY;
      left = rect.left - offset + props.offsetX;
      break;
    case "right":
      top = rect.top + rect.height / 2 + props.offsetY;
      left = rect.right + offset + props.offsetX;
      break;
    default: // top
      top = rect.top - offset + props.offsetY;
      left = rect.left + rect.width / 2 + props.offsetX;
  }

  tooltipStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    maxWidth: props.maxWidth,
  };
}

const transformClass = computed(() => {
  switch (props.position) {
    case "bottom":
      return "-translate-x-1/2";
    case "left":
      return "-translate-x-full -translate-y-1/2";
    case "right":
      return "-translate-y-1/2";
    default: // top
      return "-translate-x-1/2 -translate-y-full";
  }
});
</script>

<template>
  <div
    ref="triggerRef"
    class="inline-flex"
    @mouseenter="show"
    @mouseleave="hide"
  >
    <!-- Trigger slot -->
    <slot></slot>

    <!-- Tooltip - Teleported to body -->
    <Teleport to="body">
      <Transition name="tooltip">
        <div
          v-if="isVisible"
          :class="['fixed z-[9999] pointer-events-none', transformClass]"
          :style="tooltipStyle"
        >
          <div
            class="bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-xl border border-slate-700"
          >
            <slot name="content">
              <span v-html="text"></span>
            </slot>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.tooltip-enter-active {
  transition: all 0.15s ease-out;
}

.tooltip-leave-active {
  transition: all 0.1s ease-in;
}

.tooltip-enter-from,
.tooltip-leave-to {
  opacity: 0;
}
</style>
