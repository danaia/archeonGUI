<script setup>
import { ref, computed, watch } from "vue";
import { useUIStore, useTileStore, useProjectStore } from "../stores";
import { GLYPH_TYPES } from "../types/glyphs.js";

const uiStore = useUIStore();
const tileStore = useTileStore();
const projectStore = useProjectStore();

// Form state
const selectedGlyphType = ref("CMP");
const intent = ref("");
const tileName = ref("");
const isSaving = ref(false);
const error = ref(null);

// Get available glyph types as sorted array
const glyphOptions = computed(() => {
  return Object.values(GLYPH_TYPES).sort((a, b) => {
    // Sort by layer first, then by name
    const layerOrder = { meta: 0, view: 1, frontend: 2, backend: 3 };
    const layerDiff = layerOrder[a.layer] - layerOrder[b.layer];
    if (layerDiff !== 0) return layerDiff;
    return a.name.localeCompare(b.name);
  });
});

// Get selected glyph info
const selectedGlyph = computed(() => {
  return GLYPH_TYPES[selectedGlyphType.value];
});

// Reset form when modal opens
watch(
  () => uiStore.isGlyphEditModalOpen,
  (isOpen) => {
    if (isOpen && uiStore.editingTile) {
      // If editing existing tile
      const tile = uiStore.editingTile;
      selectedGlyphType.value = tile.glyphType || "CMP";
      intent.value = tile.intent || "";
      tileName.value = tile.name || "";
    } else if (isOpen) {
      // If adding new tile
      selectedGlyphType.value = "CMP";
      intent.value = "";
      tileName.value = "";
    }
    error.value = null;
  }
);

// Validate form
const isValid = computed(() => {
  return tileName.value.trim().length > 0 && intent.value.trim().length > 0;
});

// Handle save
async function handleSave() {
  if (!isValid.value) {
    error.value = "Please fill in all fields";
    return;
  }

  if (!projectStore.projectPath) {
    error.value = "No project path set";
    return;
  }

  isSaving.value = true;
  error.value = null;

  try {
    const tile = uiStore.editingTile;
    
    if (tile) {
      // Update existing tile
      await tileStore.updateTileGlyph(
        tile.col,
        tile.row,
        selectedGlyphType.value,
        tileName.value.trim(),
        intent.value.trim()
      );
    } else if (uiStore.editingGridPosition) {
      // Create new tile at grid position
      await tileStore.createTileFromModal(
        uiStore.editingGridPosition.col,
        uiStore.editingGridPosition.row,
        selectedGlyphType.value,
        tileName.value.trim(),
        intent.value.trim()
      );
    } else {
      throw new Error("No tile or grid position to edit");
    }

    // Write to ARCHEON.arcon file
    await tileStore.saveToArcon(projectStore.projectPath);

    // Close modal
    uiStore.closeGlyphEditModal();
  } catch (err) {
    console.error("Failed to save glyph:", err);
    error.value = err.message || "Failed to save glyph";
  } finally {
    isSaving.value = false;
  }
}

// Handle close
function handleClose() {
  if (isSaving.value) return;
  uiStore.closeGlyphEditModal();
}

// Handle backdrop click
function handleBackdropClick() {
  if (isSaving.value) return;
  handleClose();
}
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
        v-if="uiStore.isGlyphEditModalOpen"
        class="fixed inset-0 z-[200] flex items-center justify-center animate-gpu"
        @click="handleBackdropClick"
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
            v-if="uiStore.isGlyphEditModalOpen"
            class="relative bg-ui-bg border border-ui-border rounded-lg shadow-2xl max-w-xl w-full mx-4"
            @click.stop
          >
            <!-- Modal Header -->
            <div
              class="flex items-center justify-between px-4 py-3 border-b border-ui-border"
            >
              <h2 class="text-lg font-semibold text-ui-text">
                {{ uiStore.editingTile ? "Edit Glyph" : "Add Glyph" }}
              </h2>
              <button
                @click="handleClose"
                class="p-1.5 rounded hover:bg-ui-bgLight text-ui-textMuted hover:text-ui-text transition-colors"
                :disabled="isSaving"
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
            <div class="px-4 py-6 space-y-4">
              <!-- Error Display -->
              <div
                v-if="error"
                class="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm"
              >
                {{ error }}
              </div>

              <!-- Glyph Type Selector -->
              <div>
                <label class="block text-sm font-medium text-ui-text mb-2">
                  Glyph Type
                </label>
                <select
                  v-model="selectedGlyphType"
                  class="w-full px-3 py-2 bg-ui-bgLight border border-ui-border rounded-lg text-ui-text focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  :disabled="isSaving"
                >
                  <optgroup
                    v-for="layer in ['meta', 'view', 'frontend', 'backend']"
                    :key="layer"
                    :label="layer.toUpperCase()"
                  >
                    <option
                      v-for="glyph in glyphOptions.filter((g) => g.layer === layer)"
                      :key="glyph.id"
                      :value="glyph.id"
                    >
                      {{ glyph.icon }} {{ glyph.id }}: {{ glyph.name }} - {{ glyph.description }}
                    </option>
                  </optgroup>
                </select>

                <!-- Selected Glyph Info -->
                <div
                  v-if="selectedGlyph"
                  class="mt-2 p-2 rounded-lg border"
                  :style="{
                    backgroundColor: selectedGlyph.bgColor,
                    borderColor: selectedGlyph.color,
                  }"
                >
                  <div class="flex items-center gap-2">
                    <span class="text-2xl">{{ selectedGlyph.icon }}</span>
                    <div class="flex-1">
                      <p class="text-sm font-medium" :style="{ color: selectedGlyph.color }">
                        {{ selectedGlyph.id }}: {{ selectedGlyph.name }}
                      </p>
                      <p class="text-xs text-ui-textMuted">
                        {{ selectedGlyph.description }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Tile Name Input -->
              <div>
                <label class="block text-sm font-medium text-ui-text mb-2">
                  Name
                </label>
                <input
                  v-model="tileName"
                  type="text"
                  placeholder="e.g., LoginForm, Auth, UserAPI"
                  class="w-full px-3 py-2 bg-ui-bgLight border border-ui-border rounded-lg text-ui-text placeholder:text-ui-textMuted focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  :disabled="isSaving"
                  @keydown.stop="(e) => { if (e.key === 'Enter') handleSave(); }"
                />
              </div>

              <!-- Intent Input -->
              <div>
                <label class="block text-sm font-medium text-ui-text mb-2">
                  Intent
                </label>
                <textarea
                  v-model="intent"
                  placeholder="Describe what this glyph does or represents..."
                  rows="4"
                  class="w-full px-3 py-2 bg-ui-bgLight border border-ui-border rounded-lg text-ui-text placeholder:text-ui-textMuted focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  :disabled="isSaving"
                  @keydown.stop
                  @keyup.stop
                ></textarea>
              </div>
            </div>

            <!-- Modal Footer -->
            <div
              class="flex items-center justify-end gap-2 px-4 py-3 border-t border-ui-border"
            >
              <button
                @click="handleClose"
                class="px-4 py-2 rounded-lg text-ui-textMuted hover:bg-ui-bgLight transition-colors"
                :disabled="isSaving"
              >
                Cancel
              </button>
              <button
                @click="handleSave"
                class="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                :disabled="!isValid || isSaving"
              >
                <svg
                  v-if="isSaving"
                  class="w-4 h-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
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
                <svg
                  v-else
                  class="w-4 h-4"
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
                <span>{{ isSaving ? "Saving..." : "Save" }}</span>
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
