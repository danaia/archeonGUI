<script setup>
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useTileStore, useRelationshipStore, useUIStore } from "../stores";
import { useProjectStore } from "../stores/project";
import { useEdgeAnalysis } from "../composables/useEdgeAnalysis";
import { GLYPH_TYPES, EDGE_TYPES } from "../types/glyphs.js";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

// Configure Monaco Environment for web workers
self.MonacoEnvironment = {
  getWorker(moduleId, label) {
    if (label === "json") {
      return new JsonWorker();
    }
    if (label === "css" || label === "scss" || label === "less") {
      return new CssWorker();
    }
    if (label === "html") {
      return new HtmlWorker();
    }
    if (label === "typescript" || label === "javascript") {
      return new TsWorker();
    }
    return new EditorWorker();
  },
};

const tileStore = useTileStore();
const relationshipStore = useRelationshipStore();
const uiStore = useUIStore();
const projectStore = useProjectStore();

const selectedTile = computed(() => tileStore.selectedTile);
const selectedRelationship = computed(
  () => relationshipStore.selectedRelationship
);
const drawerMode = computed(() => uiStore.drawerMode);

// Resize state
const isResizing = ref(false);
const resizeStartX = ref(0);
const resizeStartWidth = ref(0);

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

// Use edge analysis composable for relationship mode
const { layerTransition, dataFlowExplanation, patternInfo, chainContext } =
  useEdgeAnalysis({
    sourceTile,
    targetTile,
    selectedRelationship,
    tileStore,
    relationshipStore,
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

/**
 * Scroll to a section in the Monaco editor
 * Searches for the section name in the file content and scrolls to it
 * @param {string} sectionName - The section name to find and scroll to
 */
function scrollToSection(sectionName) {
  if (!monacoEditor || !fileContent.value) return;

  const model = monacoEditor.getModel();
  if (!model) return;

  // Search for the section name in the content
  // Try different patterns: function/class declarations, comments, etc.
  const searchPatterns = [
    // Function/method definitions
    new RegExp(
      `(?:function|def|async\\s+function|async\\s+def)\\s+${escapeRegExpString(
        sectionName
      )}\\s*[(<]`,
      "i"
    ),
    // Class definitions
    new RegExp(
      `(?:class|interface|type|struct)\\s+${escapeRegExpString(
        sectionName
      )}\\s*[{(<]`,
      "i"
    ),
    // Variable/const declarations
    new RegExp(
      `(?:const|let|var|val)\\s+${escapeRegExpString(sectionName)}\\s*[=:]`,
      "i"
    ),
    // Export statements
    new RegExp(
      `export\\s+(?:default\\s+)?(?:function|class|const|let)?\\s*${escapeRegExpString(
        sectionName
      )}`,
      "i"
    ),
    // Comment markers (e.g., // SECTION: name or # SECTION: name)
    new RegExp(
      `(?://|#|/\\*)\\s*(?:SECTION|REGION|MARK)?:?\\s*${escapeRegExpString(
        sectionName
      )}`,
      "i"
    ),
    // Vue component sections
    new RegExp(`<${escapeRegExpString(sectionName)}(?:\\s|>)`, "i"),
    // Just the name as a last resort
    new RegExp(`\\b${escapeRegExpString(sectionName)}\\b`, "i"),
  ];

  const lines = fileContent.value.split("\n");
  let foundLine = -1;

  // Try each pattern in order of specificity
  for (const pattern of searchPatterns) {
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        foundLine = i + 1; // Monaco lines are 1-indexed
        break;
      }
    }
    if (foundLine > 0) break;
  }

  if (foundLine > 0) {
    // Scroll to the line and reveal it in center
    monacoEditor.revealLineInCenter(foundLine);

    // Set cursor position and highlight the line
    monacoEditor.setPosition({ lineNumber: foundLine, column: 1 });

    // Select the entire line to highlight it
    const lineLength = model.getLineLength(foundLine);
    monacoEditor.setSelection({
      startLineNumber: foundLine,
      startColumn: 1,
      endLineNumber: foundLine,
      endColumn: lineLength + 1,
    });

    // Focus the editor
    monacoEditor.focus();
  }
}

/**
 * Escape special regex characters in a string
 * @param {string} string - String to escape
 * @returns {string} Escaped string
 */
function escapeRegExpString(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Open a file in the default code editor (VSCode or configured IDE)
 * @param {string} filePath - Relative file path
 */
async function openFileInEditor(filePath) {
  if (!window.electronAPI || !projectStore.projectPath) {
    console.warn(
      "Cannot open file: Electron API or project path not available"
    );
    return;
  }

  try {
    // The full path is projectPath + filePath
    const result = await window.electronAPI.openFile(
      projectStore.projectPath,
      filePath
    );
    if (!result.success) {
      uiStore.addToast(
        result.error || "Failed to open file in editor",
        "error",
        3000
      );
    }
  } catch (err) {
    console.error("Error opening file:", err);
    uiStore.addToast("Failed to open file in editor", "error", 3000);
  }
}

/**
 * Open the GlyphEditModal to edit the current tile
 */
function handleEditTile() {
  if (!selectedTile.value) return;
  uiStore.openGlyphEditModal(selectedTile.value);
}

function handleClose() {
  // Close drawer first
  uiStore.closeDrawer();

  // Then deselect to clear state
  tileStore.deselectTile();
  relationshipStore.deselectRelationship();

  // Clean up editor
  destroyMonacoEditor();
}

function onFocusIn() {
  uiStore.setFocus("drawer");
}

function onFocusOut(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    uiStore.clearFocus();
  }
}

// Drawer resize handlers
function startResize(e) {
  e.preventDefault();
  isResizing.value = true;
  resizeStartX.value = e.clientX;
  resizeStartWidth.value = uiStore.drawerWidth;

  window.addEventListener("mousemove", handleResize);
  window.addEventListener("mouseup", stopResize);
}

function handleResize(e) {
  if (!isResizing.value) return;

  // Dragging left increases width (since drawer is on right side)
  const deltaX = resizeStartX.value - e.clientX;
  const newWidth = resizeStartWidth.value + deltaX;
  uiStore.resizeDrawer(newWidth);
}

function stopResize() {
  isResizing.value = false;
  window.removeEventListener("mousemove", handleResize);
  window.removeEventListener("mouseup", stopResize);
}

onUnmounted(() => {
  destroyMonacoEditor();
  // Clean up resize listeners
  window.removeEventListener("mousemove", handleResize);
  window.removeEventListener("mouseup", stopResize);
});
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-transform duration-300 ease-out drawer-animate"
      enter-from-class="translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition-transform duration-200 ease-in drawer-animate"
      leave-from-class="translate-x-0"
      leave-to-class="translate-x-full"
    >
      <div
        v-if="isOpen"
        class="fixed top-0 right-0 h-full z-50 flex drawer-animate"
        :style="{ width: uiStore.drawerWidth + 'px' }"
        :class="{ 'select-none': isResizing }"
        @focusin="onFocusIn"
        @focusout="onFocusOut"
      >
        <!-- Resize Handle (Left Edge) -->
        <div
          class="absolute top-0 bottom-0 -left-1 w-2 cursor-ew-resize z-50 hover:bg-green-500/20 transition-colors"
          @mousedown="startResize"
        />

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
            <div class="flex items-center gap-2">
              <button
                v-if="drawerMode === 'tile' && selectedTile"
                @click.stop="handleEditTile"
                class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors flex items-center gap-1.5"
                title="Edit glyph"
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
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                <span>Edit</span>
              </button>
              <button
                @click.stop="handleClose"
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
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-4">
            <!-- TILE MODE -->
            <template v-if="drawerMode === 'tile' && selectedTile">
              <div class="flex justify-start">
                <span
                  class="px-2 py-0.5 rounded text-xs uppercase mb-3"
                  :style="{
                    backgroundColor: selectedTile.typeInfo?.color + '20',
                    color: selectedTile.typeInfo?.color,
                  }"
                >
                  {{ selectedTile.typeInfo?.layer }}
                </span>
              </div>
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

              <!-- Archeon Context (SECOND) -->
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
                      <button
                        v-for="section in selectedTile.sections"
                        :key="section"
                        @click="scrollToSection(section)"
                        class="px-2 py-0.5 rounded text-xs bg-ui-bg text-ui-text hover:bg-ui-border hover:text-green-400 transition-colors cursor-pointer"
                        :title="`Jump to ${section} in code`"
                      >
                        {{ section }}
                      </button>
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
                <button
                  @click="openFileInEditor(selectedTile.file)"
                  class="w-full bg-ui-bgLight rounded-lg p-3 hover:bg-ui-border transition-colors text-left group"
                  :title="`Open in editor: ${selectedTile.file}`"
                >
                  <code
                    class="text-xs text-green-400 break-all group-hover:text-green-300 transition-colors flex items-center gap-2"
                  >
                    <svg
                      class="w-4 h-4 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                    <span>{{ selectedTile.file }}</span>
                  </code>
                </button>
              </div>

              <!-- Monaco Code Viewer (THIRD) -->
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
                  <div
                    class="flex justify-between"
                    v-if="selectedTile.qualifier"
                  >
                    <span class="text-ui-textMuted">Qualifier</span>
                    <span class="text-ui-text">{{
                      selectedTile.qualifier
                    }}</span>
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
                <p
                  class="text-sm text-ui-textMuted bg-ui-bgLight rounded-lg p-3"
                >
                  {{ selectedTile.typeInfo?.description }}
                </p>
              </div>

              <!-- File Path -->
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
                    <p class="text-sm text-ui-textMuted font-mono">
                      {{ selectedRelationship.edgeInfo?.symbol }}
                    </p>
                  </div>
                </div>

                <p class="text-sm text-ui-textMuted">
                  {{ selectedRelationship.edgeInfo?.description }}
                </p>
              </div>

              <!-- Data Flow Explanation -->
              <div class="mb-4" v-if="dataFlowExplanation">
                <h4
                  class="text-sm font-medium text-ui-textMuted mb-2 uppercase tracking-wider"
                >
                  What This Connection Does
                </h4>
                <div
                  class="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/30 rounded-lg p-3"
                >
                  <p class="text-ui-text text-sm">{{ dataFlowExplanation }}</p>
                </div>
              </div>

              <!-- Layer Transition -->
              <div class="mb-4" v-if="layerTransition">
                <h4
                  class="text-sm font-medium text-ui-textMuted mb-2 uppercase tracking-wider"
                >
                  Architecture Layer
                </h4>
                <div class="bg-ui-bgLight rounded-lg p-3 text-sm space-y-2">
                  <div class="flex items-center gap-2">
                    <span
                      class="w-6 h-6 rounded flex items-center justify-center text-xs"
                      :class="{
                        'bg-cyan-500/20 text-cyan-400':
                          layerTransition.type === 'same',
                        'bg-amber-500/20 text-amber-400':
                          layerTransition.type === 'down',
                        'bg-green-500/20 text-green-400':
                          layerTransition.type === 'up',
                      }"
                    >
                      {{
                        layerTransition.type === "same"
                          ? "↔"
                          : layerTransition.type === "down"
                          ? "↓"
                          : "↑"
                      }}
                    </span>
                    <span class="text-ui-text">{{
                      layerTransition.description
                    }}</span>
                  </div>
                  <p
                    class="text-ui-textMuted text-xs"
                    v-if="layerTransition.meaning"
                  >
                    {{ layerTransition.meaning }}
                  </p>
                </div>
              </div>

              <!-- Pattern Recognition -->
              <div class="mb-4" v-if="patternInfo">
                <h4
                  class="text-sm font-medium text-ui-textMuted mb-2 uppercase tracking-wider"
                >
                  {{ patternInfo.icon }} Pattern: {{ patternInfo.name }}
                </h4>
                <div class="bg-ui-bgLight rounded-lg p-3 text-sm space-y-3">
                  <p class="text-ui-text">{{ patternInfo.description }}</p>
                  <div>
                    <span
                      class="text-ui-textMuted text-xs uppercase tracking-wider"
                      >Engineering Considerations:</span
                    >
                    <ul class="mt-2 space-y-1">
                      <li
                        v-for="(item, idx) in patternInfo.considerations"
                        :key="idx"
                        class="text-ui-textMuted text-xs flex items-start gap-2"
                      >
                        <span class="text-green-400 mt-0.5">•</span>
                        <span>{{ item }}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <!-- Connection Flow Visualization -->
              <div class="mb-4">
                <h4
                  class="text-sm font-medium text-ui-textMuted mb-2 uppercase tracking-wider"
                >
                  Connection Flow
                </h4>
                <div class="bg-ui-bgLight rounded-lg p-4">
                  <!-- Predecessors (what flows into source) -->
                  <div v-if="chainContext?.predecessors?.length" class="mb-3">
                    <div class="flex flex-wrap gap-1 mb-2">
                      <span
                        v-for="pred in chainContext.predecessors"
                        :key="pred.id"
                        class="px-2 py-0.5 rounded text-xs"
                        :style="{
                          backgroundColor: pred.typeInfo?.color + '20',
                          color: pred.typeInfo?.color,
                        }"
                      >
                        {{ pred.typeInfo?.icon }} {{ pred.glyphType }}
                      </span>
                    </div>
                    <div class="flex justify-center text-ui-textMuted text-xs">
                      ↓
                    </div>
                  </div>

                  <!-- Source Tile -->
                  <div
                    v-if="sourceTile"
                    class="rounded-lg p-3 border mb-2"
                    :style="{
                      backgroundColor: sourceTile.typeInfo?.bgColor,
                      borderColor: sourceTile.typeInfo?.color + '60',
                    }"
                  >
                    <div class="flex items-center gap-2 mb-1">
                      <span
                        :style="{ color: sourceTile.typeInfo?.color }"
                        class="text-lg"
                      >
                        {{ sourceTile.typeInfo?.icon }}
                      </span>
                      <span
                        class="font-mono text-ui-text text-sm font-semibold"
                        >{{ sourceTile.label }}</span
                      >
                    </div>
                    <div
                      class="text-xs text-ui-textMuted"
                      v-if="sourceTile.intent"
                    >
                      {{ sourceTile.intent }}
                    </div>
                    <div
                      class="text-xs text-green-400 font-mono mt-1"
                      v-if="sourceTile.file"
                    >
                      {{ sourceTile.file }}
                    </div>
                  </div>

                  <!-- Arrow with Edge Info -->
                  <div class="flex justify-center my-3">
                    <div class="flex flex-col items-center gap-1">
                      <div
                        class="w-8 h-8 rounded-full flex items-center justify-center"
                        :style="{
                          backgroundColor: selectedRelationship.edgeInfo?.color,
                        }"
                      >
                        <span class="text-white font-bold text-sm">
                          {{ selectedRelationship.edgeInfo?.displaySymbol }}
                        </span>
                      </div>
                      <span
                        class="text-xs font-mono"
                        :style="{ color: selectedRelationship.edgeInfo?.color }"
                      >
                        {{ selectedRelationship.edgeInfo?.symbol }}
                      </span>
                    </div>
                  </div>

                  <!-- Target Tile -->
                  <div
                    v-if="targetTile"
                    class="rounded-lg p-3 border mt-2"
                    :style="{
                      backgroundColor: targetTile.typeInfo?.bgColor,
                      borderColor: targetTile.typeInfo?.color + '60',
                    }"
                  >
                    <div class="flex items-center gap-2 mb-1">
                      <span
                        :style="{ color: targetTile.typeInfo?.color }"
                        class="text-lg"
                      >
                        {{ targetTile.typeInfo?.icon }}
                      </span>
                      <span
                        class="font-mono text-ui-text text-sm font-semibold"
                        >{{ targetTile.label }}</span
                      >
                    </div>
                    <div
                      class="text-xs text-ui-textMuted"
                      v-if="targetTile.intent"
                    >
                      {{ targetTile.intent }}
                    </div>
                    <div
                      class="text-xs text-green-400 font-mono mt-1"
                      v-if="targetTile.file"
                    >
                      {{ targetTile.file }}
                    </div>
                  </div>

                  <!-- Successors (what flows out of target) -->
                  <div v-if="chainContext?.successors?.length" class="mt-3">
                    <div
                      class="flex justify-center text-ui-textMuted text-xs mb-2"
                    >
                      ↓
                    </div>
                    <div class="flex flex-wrap gap-1">
                      <span
                        v-for="succ in chainContext.successors"
                        :key="succ.id"
                        class="px-2 py-0.5 rounded text-xs"
                        :style="{
                          backgroundColor: succ.typeInfo?.color + '20',
                          color: succ.typeInfo?.color,
                        }"
                      >
                        {{ succ.typeInfo?.icon }} {{ succ.glyphType }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Source & Target Details -->
              <div class="mb-4">
                <h4
                  class="text-sm font-medium text-ui-textMuted mb-2 uppercase tracking-wider"
                >
                  Glyph Details
                </h4>
                <div class="space-y-3">
                  <!-- Source Details -->
                  <div class="bg-ui-bgLight rounded-lg p-3">
                    <div class="flex items-center gap-2 mb-2">
                      <span
                        class="text-xs uppercase tracking-wider text-ui-textMuted"
                        >Source</span
                      >
                      <span
                        class="px-1.5 py-0.5 rounded text-xs"
                        :style="{
                          backgroundColor: sourceTile?.typeInfo?.color + '20',
                          color: sourceTile?.typeInfo?.color,
                        }"
                      >
                        {{ sourceTile?.typeInfo?.layer }}
                      </span>
                    </div>
                    <div class="text-sm space-y-1">
                      <div class="flex justify-between">
                        <span class="text-ui-textMuted">Type</span>
                        <span class="text-ui-text">{{
                          sourceTile?.typeInfo?.name
                        }}</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-ui-textMuted">Description</span>
                      </div>
                      <p class="text-ui-textMuted text-xs">
                        {{ sourceTile?.typeInfo?.description }}
                      </p>
                    </div>
                  </div>

                  <!-- Target Details -->
                  <div class="bg-ui-bgLight rounded-lg p-3">
                    <div class="flex items-center gap-2 mb-2">
                      <span
                        class="text-xs uppercase tracking-wider text-ui-textMuted"
                        >Target</span
                      >
                      <span
                        class="px-1.5 py-0.5 rounded text-xs"
                        :style="{
                          backgroundColor: targetTile?.typeInfo?.color + '20',
                          color: targetTile?.typeInfo?.color,
                        }"
                      >
                        {{ targetTile?.typeInfo?.layer }}
                      </span>
                    </div>
                    <div class="text-sm space-y-1">
                      <div class="flex justify-between">
                        <span class="text-ui-textMuted">Type</span>
                        <span class="text-ui-text">{{
                          targetTile?.typeInfo?.name
                        }}</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-ui-textMuted">Description</span>
                      </div>
                      <p class="text-ui-textMuted text-xs">
                        {{ targetTile?.typeInfo?.description }}
                      </p>
                    </div>
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
                    class="flex items-center gap-2 text-xs p-2 rounded-lg transition-colors"
                    :class="{
                      'bg-ui-bgLight':
                        edge.id === selectedRelationship.edgeType,
                      'opacity-40': edge.id !== selectedRelationship.edgeType,
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
                    <span class="text-ui-text flex-1">{{ edge.name }}</span>
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
  </Teleport>
</template>
