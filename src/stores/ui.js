import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useUIStore = defineStore("ui", () => {
  // Drawer state
  const isDrawerOpen = ref(false);
  const drawerMode = ref("tile"); // 'tile' | 'relationship'

  // Focus management
  const focusedElement = ref(null); // 'canvas' | 'terminal' | 'drawer' | null

  // Modal state (for future use)
  const activeModal = ref(null);

  // Global keyboard state
  const pressedKeys = ref(new Set());

  // Drawer width
  const drawerWidth = ref(400);
  const minDrawerWidth = ref(320);
  const maxDrawerWidth = ref(1200);

  // Toast notifications
  const toasts = ref([]);
  let toastIdCounter = 0;

  // Check if canvas interactions should be enabled
  const canvasInteractionsEnabled = computed(() => {
    return (
      focusedElement.value !== "terminal" && focusedElement.value !== "drawer"
    );
  });

  // Open drawer
  function openDrawer() {
    isDrawerOpen.value = true;
  }

  // Close drawer
  function closeDrawer() {
    isDrawerOpen.value = false;
  }

  // Toggle drawer
  function toggleDrawer() {
    isDrawerOpen.value = !isDrawerOpen.value;
  }

  // Set drawer mode
  function setDrawerMode(mode) {
    drawerMode.value = mode;
  }

  // Set focused element
  function setFocus(element) {
    focusedElement.value = element;
  }

  // Clear focus (return to default state)
  function clearFocus() {
    focusedElement.value = null;
  }

  // Key press handlers
  function keyDown(key) {
    pressedKeys.value.add(key);
  }

  function keyUp(key) {
    pressedKeys.value.delete(key);
  }

  function isKeyPressed(key) {
    return pressedKeys.value.has(key);
  }

  // Resize drawer
  function resizeDrawer(width) {
    drawerWidth.value = Math.max(
      minDrawerWidth.value,
      Math.min(maxDrawerWidth.value, width)
    );
  }

  /**
   * Add a toast notification
   * @param {string} message - Toast message
   * @param {string} type - 'info' | 'warning' | 'error' | 'success'
   * @param {number} duration - Auto-dismiss in ms (0 = no auto-dismiss)
   * @param {Object} meta - Optional metadata (e.g., suggested fix)
   */
  function addToast(message, type = "info", duration = 6000, meta = null) {
    const id = ++toastIdCounter;

    const toast = {
      id,
      message,
      type,
      meta,
      createdAt: Date.now(),
    };

    toasts.value.push(toast);

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  }

  /**
   * Remove a toast by ID
   */
  function removeToast(id) {
    const index = toasts.value.findIndex((t) => t.id === id);
    if (index !== -1) {
      toasts.value.splice(index, 1);
    }
  }

  /**
   * Clear all toasts
   */
  function clearToasts() {
    toasts.value = [];
  }

  return {
    // State
    isDrawerOpen,
    drawerMode,
    focusedElement,
    activeModal,
    pressedKeys,
    drawerWidth,
    minDrawerWidth,
    maxDrawerWidth,
    toasts,

    // Computed
    canvasInteractionsEnabled,

    // Methods
    openDrawer,
    closeDrawer,
    toggleDrawer,
    setDrawerMode,
    setFocus,
    clearFocus,
    keyDown,
    keyUp,
    isKeyPressed,
    resizeDrawer,
    addToast,
    removeToast,
    clearToasts,
  };
});
