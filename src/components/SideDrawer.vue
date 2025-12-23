<script setup>
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useTileStore, useRelationshipStore, useUIStore } from "../stores";
import { useProjectStore } from "../stores/project";
import { GLYPH_TYPES, EDGE_TYPES } from "../types/glyphs.js";
import * as monaco from "monaco-editor";

const tileStore = useTileStore();
const relationshipStore = useRelationshipStore();
const uiStore = useUIStore();
const projectStore = useProjectStore();

const selectedTile = computed(() => tileStore.selectedTile);
const selectedRelationship = computed(
  () => relationshipStore.selectedRelationship
);
const drawerMode = computed(() => uiStore.drawerMode);

// Monaco editor refs
const monacoContainerRef = ref(null);
let monacoEditor = null;

// File content state
const fileContent = ref(null);
const fileLoading = ref(false);
const fileError = ref(null);

const isOpen = computed(() => {
  if (!uiStore.isDrawerOpen) return false;
  if (drawerMode.value === "tile") return !!selectedTile.value;
  if (drawerMode.value === "relationship") return !!selectedRelationship.value;
  return false;
});

// Check if selected tile has a file
const hasFile = computed(() => {
  return selectedTile.value?.file && projectStore.projectPath;
});

// Full file path
const fullFilePath = computed(() => {
  if (!hasFile.value) return null;
  return `${projectStore.projectPath}/${selectedTile.value.file}`;
});

// Detect language from file extension
const fileLanguage = computed(() => {
  if (!selectedTile.value?.file) return "plaintext";
  const ext = selectedTile.value.file.split(".").pop()?.toLowerCase();
  const langMap = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    vue: "html",
    py: "python",
    json: "json",
    md: "markdown",
    css: "css",
    scss: "scss",
    html: "html",
    sql: "sql",
    yaml: "yaml",
    yml: "yaml",
  };
  return langMap[ext] || "plaintext";
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

// Load file content when tile changes
watch(
  () => [selectedTile.value, isOpen.value],
  async ([tile, open]) => {
    if (!open || !tile?.file || !projectStore.projectPath) {
      fileContent.value = null;
      fileError.value = null;
      return;
    }

    await loadFileContent();
  },
  { immediate: true }
);

// Update Monaco editor when content changes
watch(
  () => [fileContent.value, isOpen.value],
  async ([content, open]) => {
    if (open && content !== null) {
      await nextTick();
      initMonacoEditor();
    }
  }
);

async function loadFileContent() {
  if (!window.electronAPI || !fullFilePath.value) {
    fileError.value = "File viewing requires Electron";
    return;
  }

  fileLoading.value = true;
  fileError.value = null;

  try {
    const result = await window.electronAPI.readFile(fullFilePath.value);
    if (result.success) {
      fileContent.value = result.content;
    } else {
      fileError.value = result.error || "Failed to read file";
    }
  } catch (err) {
    fileError.value = err.message;
  }

  fileLoading.value = false;
}

function initMonacoEditor() {
  if (!monacoContainerRef.value || fileContent.value === null) return;

  // Dispose existing editor
  if (monacoEditor) {
    monacoEditor.dispose();
  }

  // Create new editor
  monacoEditor = monaco.editor.create(monacoContainerRef.value, {
    value: fileContent.value,
    language: fileLanguage.value,
    theme: "vs-dark",
    readOnly: true,
    minimap: { enabled: false },
    fontSize: 13,
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    lineNumbers: "on",
    scrollBeyondLastLine: false,
    wordWrap: "on",
    automaticLayout: true,
    padding: { top: 12, bottom: 12 },
    renderLineHighlight: "none",
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    scrollbar: {
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
    },
  });
}

function destroyMonacoEditor() {
  if (monacoEditor) {
    monacoEditor.dispose();
    monacoEditor = null;
  }
}

function handleClose() {
  destroyMonacoEditor();
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

onUnmounted(() => {
  destroyMonacoEditor();
});
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
            <div class="mb-4" v-if="selectedTile.typeInfo?.description">
              <h4
                class="text-sm font-medium text-ui-textMuted mb-2 uppercase tracking-wider"
              >
                Description
              </h4>
              <p class="text-sm text-ui-textMuted bg-ui-bgLight rounded-lg p-3">
                {{ selectedTile.typeInfo?.description }}
              </p>
            </div>

            <!-- Archeon Metadata (when file exists) -->
            <div
              class="mb-4"
              v-if="
                selectedTile.intent ||
                selectedTile.chain ||
                selectedTile.sections?.length
              "
            >
              <h4
                class="text-sm font-medium text-ui-textMuted mb-2 uppercase tracking-wider"
              >
                Archeon Context
              </h4>
              <div class="bg-ui-bgLight rounded-lg p-3 text-sm space-y-2">
                <div class="flex justify-between" v-if="selectedTile.intent">
                  <span class="text-ui-textMuted">Intent</span>
                  <span class="text-ui-text text-right max-w-[200px]">{{
                    selectedTile.intent
                  }}</span>
                </div>
                <div class="flex justify-between" v-if="selectedTile.chain">
                  <span class="text-ui-textMuted">Chain</span>
                  <span class="font-mono text-cyan-400">{{
                    selectedTile.chain
                  }}</span>
                </div>
                <div v-if="selectedTile.sections?.length">
                  <span class="text-ui-textMuted block mb-1">Sections</span>
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="section in selectedTile.sections"
                      :key="section"
                      class="px-2 py-0.5 rounded text-xs bg-ui-bg text-ui-text"
                    >
                      {{ section }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- File Path -->
            <div class="mb-4" v-if="selectedTile.file">
              <h4
                class="text-sm font-medium text-ui-textMuted mb-2 uppercase tracking-wider"
              >
                Source File
              </h4>
              <div class="bg-ui-bgLight rounded-lg p-3">
                <code class="text-xs text-green-400 break-all">{{
                  selectedTile.file
                }}</code>
              </div>
            </div>

            <!-- Monaco Code Viewer -->
            <div class="mb-4" v-if="hasFile">
              <h4
                class="text-sm font-medium text-ui-textMuted mb-2 uppercase tracking-wider flex items-center justify-between"
              >
                <span>Code Preview</span>
                <span
                  class="text-xs font-normal normal-case text-ui-textMuted"
                  >{{ fileLanguage }}</span
                >
              </h4>

              <!-- Loading state -->
              <div
                v-if="fileLoading"
                class="bg-ui-bgLight rounded-lg p-8 flex items-center justify-center"
              >
                <div
                  class="animate-spin w-6 h-6 border-2 border-ui-textMuted border-t-transparent rounded-full"
                ></div>
              </div>

              <!-- Error state -->
              <div
                v-else-if="fileError"
                class="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400"
              >
                {{ fileError }}
              </div>

              <!-- Monaco container -->
              <div
                v-else-if="fileContent !== null"
                ref="monacoContainerRef"
                class="rounded-lg overflow-hidden border border-ui-border"
                style="height: 400px"
              ></div>
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
