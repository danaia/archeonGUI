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
  const maxDrawerWidth = ref(600);

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
  };
});
