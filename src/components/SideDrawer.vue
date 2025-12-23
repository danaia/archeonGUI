<script setup>
import { computed } from "vue";
import { useTileStore, useRelationshipStore, useUIStore } from "../stores";
import { GLYPH_TYPES, EDGE_TYPES } from "../types/glyphs.js";

const tileStore = useTileStore();
const relationshipStore = useRelationshipStore();
const uiStore = useUIStore();

const selectedTile = computed(() => tileStore.selectedTile);
const selectedRelationship = computed(
  () => relationshipStore.selectedRelationship
);
const drawerMode = computed(() => uiStore.drawerMode);

const isOpen = computed(() => {
  if (!uiStore.isDrawerOpen) return false;
  if (drawerMode.value === "tile") return !!selectedTile.value;
  if (drawerMode.value === "relationship") return !!selectedRelationship.value;
  return false;
});

// Get connected tiles for relationship mode
const sourceTile = computed(() => {
  if (!selectedRelationship.value) return null;
  const coords = tileStore.parseTileKey(
    selectedRelationship.value.sourceTileKey
  );
  return tileStore.getTile(coords.col, coords.row);
});

const targetTile = computed(() => {
  if (!selectedRelationship.value) return null;
  const coords = tileStore.parseTileKey(
    selectedRelationship.value.targetTileKey
  );
  return tileStore.getTile(coords.col, coords.row);
});

// Get relationships for selected tile
const tileRelationships = computed(() => {
  if (!selectedTile.value) return { outgoing: [], incoming: [] };
  return relationshipStore.getRelationshipsForTile(selectedTile.value.id);
});

function handleClose() {
  uiStore.closeDrawer();
  tileStore.deselectTile();
  relationshipStore.deselectRelationship();
}

function onFocusIn() {
  uiStore.setFocus("drawer");
}

function onFocusOut(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    uiStore.clearFocus();
  }
}
</script>

<template>
  <Transition
    enter-active-class="transition-transform duration-300 ease-out"
    enter-from-class="translate-x-full"
    enter-to-class="translate-x-0"
    leave-active-class="transition-transform duration-200 ease-in"
    leave-from-class="translate-x-0"
    leave-to-class="translate-x-full"
  >
    <div
      v-if="isOpen"
      class="fixed top-0 right-0 h-full z-40 flex"
      :style="{ width: uiStore.drawerWidth + 'px' }"
      @focusin="onFocusIn"
      @focusout="onFocusOut"
    >
      <div
        class="w-full h-full bg-ui-bg border-l border-ui-border shadow-2xl flex flex-col"
      >
        <!-- Header -->
        <div
          class="flex items-center justify-between px-4 py-3 border-b border-ui-border"
        >
          <h2 class="text-lg font-semibold text-ui-text">
            {{
              drawerMode === "tile" ? "Glyph Details" : "Relationship Details"
            }}
          </h2>
          <button
            @click="handleClose"
            class="p-2 rounded-lg hover:bg-ui-bgLight text-ui-textMuted hover:text-ui-text transition-colors"
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

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-4">
          <!-- TILE MODE -->
          <template v-if="drawerMode === 'tile' && selectedTile">
            <!-- Glyph Header Card -->
            <div
              class="rounded-lg p-4 mb-4 border-2"
              :style="{
                backgroundColor: selectedTile.typeInfo?.bgColor,
                borderColor: selectedTile.typeInfo?.color,
              }"
            >
              <div class="flex items-center gap-3 mb-3">
                <div
                  class="w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
                  :style="{
                    backgroundColor: selectedTile.typeInfo?.color + '30',
                  }"
                >
                  <span :style="{ color: selectedTile.typeInfo?.color }">
                    {{ selectedTile.typeInfo?.icon }}
                  </span>
                </div>
                <div>
                  <h3 class="font-bold text-ui-text text-lg">
                    {{ selectedTile.glyphType }}
                  </h3>
                  <p
                    class="text-sm"
                    :style="{ color: selectedTile.typeInfo?.color }"
                  >
                    {{ selectedTile.typeInfo?.name }}
                  </p>
                </div>
              </div>

              <div
                class="text-ui-text font-mono text-sm bg-black/20 rounded px-3 py-2"
              >
                {{ selectedTile.label }}
              </div>
            </div>

            <!-- Glyph Info -->
            <div class="mb-4">
              <h4
                class="text-sm font-medium text-ui-textMuted mb-2 uppercase tracking-wider"
              >
                Glyph Information
              </h4>
              <div class="bg-ui-bgLight rounded-lg p-3 text-sm space-y-2">
                <div class="flex justify-between">
                  <span class="text-ui-textMuted">Type</span>
                  <span class="font-mono text-ui-text">{{
                    selectedTile.glyphType
                  }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-ui-textMuted">Name</span>
                  <span class="text-ui-text">{{ selectedTile.name }}</span>
                </div>
                <div class="flex justify-between" v-if="selectedTile.qualifier">
                  <span class="text-ui-textMuted">Qualifier</span>
                  <span class="text-ui-text">{{ selectedTile.qualifier }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-ui-textMuted">Layer</span>
                  <span
                    class="px-2 py-0.5 rounded text-xs uppercase"
                    :style="{
                      backgroundColor: selectedTile.typeInfo?.color + '20',
                      color: selectedTile.typeInfo?.color,
                    }"
                  >
                    {{ selectedTile.typeInfo?.layer }}
                  </span>
                </div>
                <div class="flex justify-between">
                  <span class="text-ui-textMuted">Position</span>
                  <span class="font-mono text-ui-text"
                    >{{ selectedTile.col }}, {{ selectedTile.row }}</span
                  >
                </div>
              </div>
            </div>

            <!-- Description -->
            <div class="mb-4">
              <h4
                class="text-sm font-medium text-ui-textMuted mb-2 uppercase tracking-wider"
              >
                Description
              </h4>
              <p class="text-sm text-ui-textMuted bg-ui-bgLight rounded-lg p-3">
                {{ selectedTile.typeInfo?.description }}
              </p>
            </div>

            <!-- Connections -->
            <div class="mb-4">
              <h4
                class="text-sm font-medium text-ui-textMuted mb-2 uppercase tracking-wider"
              >
                Connections ({{
                  tileRelationships.outgoing.length +
                  tileRelationships.incoming.length
                }})
              </h4>

              <!-- Outgoing -->
              <div v-if="tileRelationships.outgoing.length" class="mb-3">
                <div class="text-xs text-ui-textMuted mb-1">Outgoing →</div>
                <div class="space-y-1">
                  <div
                    v-for="rel in tileRelationships.outgoing"
                    :key="rel.id"
                    class="flex items-center gap-2 bg-ui-bgLight rounded px-3 py-2 text-sm"
                  >
                    <span
                      class="font-bold"
                      :style="{ color: rel.edgeInfo?.color }"
                    >
                      {{ rel.edgeInfo?.displaySymbol }}
                    </span>
                    <span class="text-ui-text">{{ rel.targetTileKey }}</span>
                  </div>
                </div>
              </div>

              <!-- Incoming -->
              <div v-if="tileRelationships.incoming.length">
                <div class="text-xs text-ui-textMuted mb-1">← Incoming</div>
                <div class="space-y-1">
                  <div
                    v-for="rel in tileRelationships.incoming"
                    :key="rel.id"
                    class="flex items-center gap-2 bg-ui-bgLight rounded px-3 py-2 text-sm"
                  >
                    <span class="text-ui-text">{{ rel.sourceTileKey }}</span>
                    <span
                      class="font-bold"
                      :style="{ color: rel.edgeInfo?.color }"
                    >
                      {{ rel.edgeInfo?.displaySymbol }}
                    </span>
                  </div>
                </div>
              </div>

              <div
                v-if="
                  !tileRelationships.outgoing.length &&
                  !tileRelationships.incoming.length
                "
                class="text-sm text-ui-textMuted bg-ui-bgLight rounded-lg p-3"
              >
                No connections
              </div>
            </div>
          </template>

          <!-- RELATIONSHIP MODE -->
          <template
            v-if="drawerMode === 'relationship' && selectedRelationship"
          >
            <!-- Edge Type Card -->
            <div
              class="rounded-lg p-4 mb-4 border-2"
              :style="{
                backgroundColor: '#1e1e36',
                borderColor: selectedRelationship.edgeInfo?.color,
              }"
            >
              <div class="flex items-center gap-3 mb-3">
                <div
                  class="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                  :style="{
                    backgroundColor: selectedRelationship.edgeInfo?.color,
                  }"
                >
                  <span class="text-white font-bold">
                    {{ selectedRelationship.edgeInfo?.displaySymbol }}
                  </span>
                </div>
                <div>
                  <h3 class="font-bold text-ui-text text-lg">
                    {{ selectedRelationship.edgeInfo?.name }}
                  </h3>
                  <p class="text-sm text-ui-textMuted">
                    {{ selectedRelationship.edgeInfo?.symbol }}
                  </p>
                </div>
              </div>

              <p class="text-sm text-ui-textMuted">
                {{ selectedRelationship.edgeInfo?.description }}
              </p>
            </div>

            <!-- Source Tile -->
            <div class="mb-4">
              <h4
                class="text-sm font-medium text-ui-textMuted mb-2 uppercase tracking-wider"
              >
                Source
              </h4>
              <div
                v-if="sourceTile"
                class="rounded-lg p-3 border"
                :style="{
                  backgroundColor: sourceTile.typeInfo?.bgColor,
                  borderColor: sourceTile.typeInfo?.color + '60',
                }"
              >
                <div class="flex items-center gap-2">
                  <span
                    :style="{ color: sourceTile.typeInfo?.color }"
                    class="text-lg"
                  >
                    {{ sourceTile.typeInfo?.icon }}
                  </span>
                  <span class="font-mono text-ui-text text-sm">{{
                    sourceTile.label
                  }}</span>
                </div>
              </div>
            </div>

            <!-- Arrow -->
            <div class="flex justify-center my-4">
              <div
                class="w-10 h-10 rounded-full flex items-center justify-center"
                :style="{
                  backgroundColor: selectedRelationship.edgeInfo?.color + '30',
                }"
              >
                <span
                  class="text-xl"
                  :style="{ color: selectedRelationship.edgeInfo?.color }"
                  >↓</span
                >
              </div>
            </div>

            <!-- Target Tile -->
            <div class="mb-4">
              <h4
                class="text-sm font-medium text-ui-textMuted mb-2 uppercase tracking-wider"
              >
                Target
              </h4>
              <div
                v-if="targetTile"
                class="rounded-lg p-3 border"
                :style="{
                  backgroundColor: targetTile.typeInfo?.bgColor,
                  borderColor: targetTile.typeInfo?.color + '60',
                }"
              >
                <div class="flex items-center gap-2">
                  <span
                    :style="{ color: targetTile.typeInfo?.color }"
                    class="text-lg"
                  >
                    {{ targetTile.typeInfo?.icon }}
                  </span>
                  <span class="font-mono text-ui-text text-sm">{{
                    targetTile.label
                  }}</span>
                </div>
              </div>
            </div>

            <!-- Edge Types Reference -->
            <div class="mb-4">
              <h4
                class="text-sm font-medium text-ui-textMuted mb-2 uppercase tracking-wider"
              >
                Edge Type Reference
              </h4>
              <div class="space-y-2">
                <div
                  v-for="(edge, key) in EDGE_TYPES"
                  :key="key"
                  class="flex items-center gap-2 text-xs"
                  :class="{
                    'opacity-50': edge.id !== selectedRelationship.edgeType,
                  }"
                >
                  <span
                    class="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-xs"
                    :style="{ backgroundColor: edge.color }"
                  >
                    {{ edge.displaySymbol }}
                  </span>
                  <span class="font-mono text-ui-textMuted">{{
                    edge.symbol
                  }}</span>
                  <span class="text-ui-text">{{ edge.name }}</span>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- Footer -->
        <div
          class="px-4 py-3 border-t border-ui-border text-xs text-ui-textMuted"
        >
          Press
          <kbd class="px-1.5 py-0.5 bg-ui-bgLight rounded text-ui-text"
            >Esc</kbd
          >
          to close
        </div>
      </div>
    </div>
  </Transition>
</template>
