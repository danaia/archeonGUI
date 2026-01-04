<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import {
  useCanvasStore,
  useTileStore,
  useRelationshipStore,
  useUIStore,
  useProjectStore,
} from "../stores";
import { useSelection } from "../composables";
import { GLYPH_STATES } from "../stores/tiles";
import Tooltip from "./Tooltip.vue";

const canvasStore = useCanvasStore();
const tileStore = useTileStore();
const relationshipStore = useRelationshipStore();
const uiStore = useUIStore();
const projectStore = useProjectStore();

// Helper to get current project path for layout persistence
const getProjectPath = () => projectStore.projectPath;

// Multi-selection and drag-to-move composable
const {
  isSelecting,
  isDraggingTiles,
  selectionBox,
  startSelection,
  updateSelection,
  endSelection,
  startDragging,
  updateDragging,
  endDragging,
  cancelAll: cancelSelection,
} = useSelection(canvasStore, tileStore, relationshipStore, getProjectPath);

const canvasRef = ref(null);
const lastMousePos = ref({ x: 0, y: 0 });

// Performance: track if camera is moving to disable transitions
const isCameraMoving = ref(false);
let cameraMovingTimeout = null;

// Debounced camera save (to avoid excessive writes on zoom)
let cameraSaveTimeout = null;
function debouncedSaveCamera() {
  if (cameraSaveTimeout) clearTimeout(cameraSaveTimeout);
  cameraSaveTimeout = setTimeout(() => {
    if (projectStore.projectPath) {
      canvasStore.saveCamera(projectStore.projectPath);
    }
  }, 300);
}

// Get visible tiles with screen positions (only tiles that exist)
const visibleTiles = computed(() => {
  const range = canvasStore.visibleGridRange;
  const result = [];

  for (const tile of tileStore.allTiles) {
    const tileKey = tileStore.getTileKey(tile.col, tile.row);

    // Skip tiles hidden due to collapsed ancestor
    if (tileStore.isHiddenByCollapse(tileKey, relationshipStore)) {
      continue;
    }

    // Check if tile is in visible range
    if (
      tile.col < range.minCol ||
      tile.col > range.maxCol ||
      tile.row < range.minRow ||
      tile.row > range.maxRow
    ) {
      continue;
    }

    const worldPos = canvasStore.gridToWorld(tile.col, tile.row);
    const screenPos = canvasStore.worldToScreen(worldPos.x, worldPos.y);

    // Determine if tile is interactive based on state
    const isComplete = tile.state === GLYPH_STATES.COMPLETE;
    const isPending = tile.state === GLYPH_STATES.PENDING;
    const isProcessing = tile.state === GLYPH_STATES.PROCESSING;
    const isDrift = tile.state === GLYPH_STATES.DRIFT;

    // Check if the chain (row) is fully active
    const chainActive = tileStore.isChainActive(tile.row);

    // Check multi-selection
    const isMultiSelected = tileStore.selectedTileKeys.has(tileKey);

    // Collapsed state and descendant count
    const isCollapsed = tileStore.isCollapsed(tile.col, tile.row);
    const descendantCount = isCollapsed
      ? tileStore.getDescendantCount(tileKey, relationshipStore)
      : 0;

    result.push({
      ...tile,
      screenX: screenPos.x,
      screenY: screenPos.y,
      width: canvasStore.scaledTileWidth,
      height: canvasStore.scaledTileHeight,
      isSelected: tileStore.isSelected(tile.col, tile.row),
      isHovered: tileStore.isHovered(tile.col, tile.row),
      isMultiSelected,
      // State-driven properties
      isComplete,
      isPending,
      isProcessing,
      isDrift,
      chainActive,
      // Collapse state
      isCollapsed,
      descendantCount,
      // Only interactive when complete
      isInteractive: isComplete,
    });
  }

  return result;
});

// Get visible relationships with badge positions (pre-computed line positions for performance)
const visibleBadges = computed(() => {
  const result = [];

  for (const rel of relationshipStore.allRelationships) {
    const sourceCoords = tileStore.parseTileKey(rel.sourceTileKey);
    const targetCoords = tileStore.parseTileKey(rel.targetTileKey);

    const sourceTile = tileStore.getTile(sourceCoords.col, sourceCoords.row);
    const targetTile = tileStore.getTile(targetCoords.col, targetCoords.row);

    if (!sourceTile || !targetTile) continue;

    // Skip edges where target is hidden by a collapsed ancestor
    if (tileStore.isHiddenByCollapse(rel.targetTileKey, relationshipStore)) {
      continue;
    }

    // Calculate midpoint in world coordinates
    const sourceWorld = canvasStore.gridToWorld(
      sourceCoords.col,
      sourceCoords.row
    );
    const targetWorld = canvasStore.gridToWorld(
      targetCoords.col,
      targetCoords.row
    );

    // Center of source tile
    const sourceCenterX = sourceWorld.x + canvasStore.tileWidth / 2;
    const sourceCenterY = sourceWorld.y + canvasStore.tileHeight / 2;

    // Center of target tile
    const targetCenterX = targetWorld.x + canvasStore.tileWidth / 2;
    const targetCenterY = targetWorld.y + canvasStore.tileHeight / 2;

    // Midpoint
    const midWorldX = (sourceCenterX + targetCenterX) / 2;
    const midWorldY = (sourceCenterY + targetCenterY) / 2;

    const screenPos = canvasStore.worldToScreen(midWorldX, midWorldY);

    // Pre-compute line endpoints for SVG (avoids recalculating in template)
    const sourceScreen = canvasStore.worldToScreen(
      sourceCenterX,
      sourceCenterY
    );
    const targetScreen = canvasStore.worldToScreen(
      targetCenterX,
      targetCenterY
    );

    // Calculate angle for badge orientation
    const angle = Math.atan2(
      targetCenterY - sourceCenterY,
      targetCenterX - sourceCenterX
    );

    // Badge size scales with zoom but has min/max
    const baseSize = 24;
    const scaledSize = Math.max(16, Math.min(40, baseSize * canvasStore.zoom));

    result.push({
      ...rel,
      screenX: screenPos.x,
      screenY: screenPos.y,
      // Pre-computed line endpoints
      lineX1: sourceScreen.x,
      lineY1: sourceScreen.y,
      lineX2: targetScreen.x,
      lineY2: targetScreen.y,
      size: scaledSize,
      angle: angle * (180 / Math.PI),
      isSelected: relationshipStore.isSelected(
        rel.sourceTileKey,
        rel.targetTileKey
      ),
      isHovered: relationshipStore.isHovered(
        rel.sourceTileKey,
        rel.targetTileKey
      ),
      sourceTile,
      targetTile,
    });
  }

  return result;
});

// CSS-based grid pattern for maximum performance (replaces SVG grid lines)
const gridPatternStyle = computed(() => {
  const cellW = canvasStore.scaledCellWidth;
  const cellH = canvasStore.scaledCellHeight;

  // Convert camera world position to screen position
  // The grid pattern offset must match where world (0,0) appears on screen
  const screenOrigin = canvasStore.worldToScreen(0, 0);

  // The offset is where the origin grid line appears on the canvas
  // We use modulo to keep it within one grid cell size for CSS pattern
  const offsetX = ((screenOrigin.x % cellW) + cellW) % cellW;
  const offsetY = ((screenOrigin.y % cellH) + cellH) % cellH;

  return {
    backgroundImage: `
      linear-gradient(to right, #1a1a1a 1px, transparent 1px),
      linear-gradient(to bottom, #1a1a1a 1px, transparent 1px)
    `,
    backgroundSize: `${cellW}px ${cellH}px`,
    backgroundPosition: `${offsetX}px ${offsetY}px`,
  };
});

// Mouse event handlers
function handleWheel(e) {
  if (!uiStore.canvasInteractionsEnabled) return;
  e.preventDefault();
  e.stopPropagation();

  // If Shift or Command/Ctrl is pressed, scroll vertically instead of zooming
  if (e.shiftKey || e.metaKey || e.ctrlKey) {
    const deltaY = e.deltaY;
    canvasStore.pan(0, -deltaY);
    
    // Mark camera as moving to disable CSS transitions
    isCameraMoving.value = true;
    if (cameraMovingTimeout) clearTimeout(cameraMovingTimeout);
    cameraMovingTimeout = setTimeout(() => {
      isCameraMoving.value = false;
    }, 150);
    
    // Debounced save camera on pan
    debouncedSaveCamera();
    return;
  }

  // Mark camera as moving to disable CSS transitions during zoom
  isCameraMoving.value = true;
  if (cameraMovingTimeout) clearTimeout(cameraMovingTimeout);
  cameraMovingTimeout = setTimeout(() => {
    isCameraMoving.value = false;
  }, 150);

  canvasStore.zoomAt(e.clientX, e.clientY, e.deltaY);

  // Debounced save camera on zoom
  debouncedSaveCamera();
}

function handleMouseDown(e) {
  if (!uiStore.canvasInteractionsEnabled) return;

  // Middle mouse button or space + left click for panning
  if (e.button === 1 || (e.button === 0 && canvasStore.isSpacePressed)) {
    e.preventDefault();
    canvasStore.isPanning = true;
    lastMousePos.value = { x: e.clientX, y: e.clientY };
  } else if (e.button === 0) {
    // Left click on canvas background
    const worldPos = canvasStore.screenToWorld(e.clientX, e.clientY);
    const gridPos = canvasStore.worldToGrid(worldPos.x, worldPos.y);

    // Check if clicking on empty tile with Cmd/Ctrl key held
    if (!tileStore.hasTile(gridPos.col, gridPos.row)) {
      // Only open glyph edit modal if Command (Mac) or Control (Win/Linux) key is pressed
      if (e.metaKey || e.ctrlKey) {
        uiStore.openGlyphEditModal(null, {
          col: gridPos.col,
          row: gridPos.row,
        });
        return;
      }
      // Otherwise, start selection (allow drag-to-select to work)
      startSelection(e.clientX, e.clientY);
    }
  }
}

function handleMouseMove(e) {
  if (canvasStore.isPanning) {
    const deltaX = e.clientX - lastMousePos.value.x;
    const deltaY = e.clientY - lastMousePos.value.y;
    canvasStore.pan(deltaX, deltaY);
    lastMousePos.value = { x: e.clientX, y: e.clientY };

    // Mark camera as moving to disable CSS transitions
    isCameraMoving.value = true;
    if (cameraMovingTimeout) clearTimeout(cameraMovingTimeout);
    cameraMovingTimeout = setTimeout(() => {
      isCameraMoving.value = false;
    }, 150);
  } else if (isSelecting.value) {
    updateSelection(e.clientX, e.clientY);
  } else if (isDraggingTiles.value) {
    updateDragging(e.clientX, e.clientY);
  }
}

function handleMouseUp(e) {
  if (e.button === 1 || e.button === 0) {
    // Save camera if we were panning
    if (canvasStore.isPanning && projectStore.projectPath) {
      canvasStore.saveCamera(projectStore.projectPath);
    }
    canvasStore.isPanning = false;
    endSelection();
    endDragging();
  }
}

function handleMouseLeave() {
  canvasStore.isPanning = false;
  cancelSelection();
  tileStore.setHoveredTile(null, null);
  relationshipStore.setHoveredRelationship(null, null);
}

// Tile interaction handlers
function handleTileClick(tile, e) {
  e.stopPropagation();
  relationshipStore.deselectRelationship();
  tileStore.selectTile(tile.col, tile.row);
  uiStore.openDrawer();
  uiStore.setDrawerMode("tile");
}

function handleTileMouseDown(tile, e) {
  e.stopPropagation();

  // If tile is part of multi-selection, start dragging
  if (tile.isMultiSelected && tileStore.selectedTileKeys.size > 0) {
    startDragging(e.clientX, e.clientY);
  }
}

function handleTileDoubleClick(tile, e) {
  e.stopPropagation();
  // Toggle collapsed state for this tile
  tileStore.toggleCollapsed(tile.col, tile.row);
  // Save layout to persist collapsed state
  if (projectStore.projectPath) {
    tileStore.saveLayout(projectStore.projectPath);
  }
}

function handleTileHover(tile) {
  tileStore.setHoveredTile(tile.col, tile.row);
}

function handleTileLeave() {
  tileStore.setHoveredTile(null, null);
}

// Badge interaction handlers
function handleBadgeClick(badge, e) {
  e.stopPropagation();
  tileStore.deselectTile();
  relationshipStore.selectRelationship(
    badge.sourceTileKey,
    badge.targetTileKey
  );
  uiStore.openDrawer();
  uiStore.setDrawerMode("relationship");
}

function handleBadgeHover(badge) {
  relationshipStore.setHoveredRelationship(
    badge.sourceTileKey,
    badge.targetTileKey
  );
  // Also highlight connected tiles
  const source = tileStore.parseTileKey(badge.sourceTileKey);
  const target = tileStore.parseTileKey(badge.targetTileKey);
  // Could add visual feedback for connected tiles here
}

function handleBadgeLeave() {
  relationshipStore.setHoveredRelationship(null, null);
}

// Keyboard handlers
function handleKeyDown(e) {
  if (e.code === "Space" && uiStore.canvasInteractionsEnabled) {
    e.preventDefault();
    canvasStore.isSpacePressed = true;
  }

  if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
    canvasStore.isShiftPressed = true;
  }

  if (e.code === "Escape") {
    tileStore.deselectTile();
    tileStore.clearMultiSelection();
    relationshipStore.deselectRelationship();
    uiStore.closeDrawer();
  }

  uiStore.keyDown(e.code);
}

function handleKeyUp(e) {
  if (e.code === "Space") {
    canvasStore.isSpacePressed = false;
  }
  
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
    canvasStore.isShiftPressed = false;
  }
  uiStore.keyUp(e.code);
}

// Resize handler
function handleResize() {
  canvasStore.updateViewport(window.innerWidth, window.innerHeight);
}

// Cursor style
const cursorClass = computed(() => {
  if (canvasStore.isPanning) return "cursor-grabbing";
  if (canvasStore.isSpacePressed) return "cursor-grab";
  return "cursor-default";
});

// Lifecycle
onMounted(() => {
  canvasStore.updateViewport(window.innerWidth, window.innerHeight);
  window.addEventListener("resize", handleResize);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  // Add wheel listener with passive: false to allow preventDefault
  if (canvasRef.value) {
    canvasRef.value.addEventListener("wheel", handleWheel, { passive: false });
  }

  // Load saved camera position if project is loaded
  if (projectStore.projectPath) {
    canvasStore.loadCamera(projectStore.projectPath);
    uiStore.runValidation(projectStore.projectPath);
  }

  // Grid starts empty - tiles loaded when project is opened
});

// Watch for arconData changes to trigger validation
watch(
  () => projectStore.arconData,
  () => {
    if (projectStore.projectPath) {
      uiStore.runValidation(projectStore.projectPath);
    }
  },
  { deep: true }
);

// Copy validation errors to clipboard for AI assistance
async function copyValidationErrors() {
  const status = uiStore.validationStatus;

  // If validating, just re-run validation
  if (status.status === "validating") {
    if (projectStore.projectPath) {
      uiStore.runValidation(projectStore.projectPath);
    }
    return;
  }

  // If valid with no warnings, re-run validation
  if (status.status === "valid" && status.warnings.length === 0) {
    if (projectStore.projectPath) {
      uiStore.runValidation(projectStore.projectPath);
    }
    return;
  }

  // Build error message for AI
  let clipboardText = `ARCHEON Validation Failed\n`;
  clipboardText += `Project: ${projectStore.projectName || "Unknown"}\n`;
  clipboardText += `Time: ${new Date().toISOString()}\n\n`;

  if (status.errors.length > 0) {
    clipboardText += `ERRORS (${status.errors.length}):\n`;
    status.errors.forEach((err, i) => {
      clipboardText += `  ${i + 1}. ${err}\n`;
    });
    clipboardText += "\n";
  }

  if (status.warnings.length > 0) {
    clipboardText += `WARNINGS (${status.warnings.length}):\n`;
    status.warnings.forEach((warn, i) => {
      clipboardText += `  ${i + 1}. ${warn}\n`;
    });
    clipboardText += "\n";
  }

  if (status.message) {
    clipboardText += `Message: ${status.message}\n\n`;
  }

  // Add AI-specific mitigation guidance
  clipboardText += `AI MITIGATION PLAN:\n`;
  clipboardText += `==================\n\n`;

  if (status.errors.length > 0) {
    clipboardText += `For ERRORS:\n`;
    clipboardText += `1. Analyze each error message carefully\n`;
    clipboardText += `2. Check the ARCHEON.arcon file for:\n`;
    clipboardText += `   - Missing or incorrectly formatted chains\n`;
    clipboardText += `   - Invalid glyph type references\n`;
    clipboardText += `   - Duplicate definitions\n`;
    clipboardText += `   - File path mismatches (use V: for views/, CMP: for components/)\n`;
    clipboardText += `3. Verify file structure matches the expected architecture\n`;
    clipboardText += `4. Run validation after each fix to confirm resolution\n\n`;
  }

  if (status.warnings.length > 0) {
    clipboardText += `For WARNINGS:\n`;
    clipboardText += `1. Review the warnings to understand potential issues\n`;
    clipboardText += `2. Determine if they are:\n`;
    clipboardText += `   - Missing files or components\n`;
    clipboardText += `   - Unused definitions\n`;
    clipboardText += `   - Deprecated patterns\n`;
    clipboardText += `3. Update ARCHEON.arcon to align with actual project structure\n\n`;
  }

  clipboardText += `Next Steps:\n`;
  clipboardText += `- Apply suggested fixes to ARCHEON.arcon\n`;
  clipboardText += `- Re-validate the project\n`;
  clipboardText += `- If issues persist, provide updated error output`;

  try {
    await navigator.clipboard.writeText(clipboardText);
    uiStore.addToast(
      "Validation report with AI mitigation plan copied",
      "success",
      3000
    );
  } catch (err) {
    uiStore.addToast("Failed to copy to clipboard", "error", 3000);
  }
}

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("keyup", handleKeyUp);

  // Remove wheel listener
  if (canvasRef.value) {
    canvasRef.value.removeEventListener("wheel", handleWheel);
  }
});
</script>

<template>
  <div
    ref="canvasRef"
    class="absolute inset-0 bg-canvas-bg overflow-hidden no-select canvas-container"
    :class="cursorClass"
    @mousedown="handleMouseDown"
    @mousemove="handleMouseMove"
    @mouseup="handleMouseUp"
    @mouseleave="handleMouseLeave"
  >
    <!-- Grid Lines Layer - CSS Pattern for performance -->
    <div
      class="absolute inset-0 pointer-events-none opacity-30 gpu-accelerated"
      :style="gridPatternStyle"
    />

    <!-- Selection Box Layer -->
    <div
      v-if="selectionBox"
      class="absolute border-2 border-indigo-500 bg-indigo-500/10 pointer-events-none z-50 gpu-accelerated"
      :style="{
        left: selectionBox.left + 'px',
        top: selectionBox.top + 'px',
        width: selectionBox.width + 'px',
        height: selectionBox.height + 'px',
      }"
    ></div>

    <!-- Connection Lines Layer (behind badges) - using pre-computed coordinates -->
    <svg
      class="absolute inset-0 w-full h-full pointer-events-none"
      style="contain: layout style paint"
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" />
        </marker>
        <marker
          id="arrowhead-error"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
        </marker>
      </defs>
      <line
        v-for="badge in visibleBadges"
        :key="'line-' + badge.id"
        :x1="badge.lineX1"
        :y1="badge.lineY1"
        :x2="badge.lineX2"
        :y2="badge.lineY2"
        :stroke="badge.edgeInfo?.color || '#6366f1'"
        stroke-width="2"
        stroke-dasharray="4,4"
        :opacity="badge.isHovered || badge.isSelected ? 1 : 0.7"
      />
    </svg>

    <!-- Glyph Tiles Layer -->
    <div
      class="absolute inset-0 pointer-events-none"
      style="contain: layout style"
    >
      <div
        v-for="tile in visibleTiles"
        :key="tile.id"
        class="absolute rounded-lg border-2 overflow-hidden pointer-events-auto tile-gpu"
        :class="[
          tile.isSelected
            ? 'ring-2 ring-offset-2 ring-offset-canvas-bg shadow-lg'
            : tile.isMultiSelected
            ? 'ring-2 ring-offset-1 ring-offset-canvas-bg ring-indigo-500 shadow-lg'
            : tile.isHovered && !isCameraMoving
            ? 'shadow-md'
            : '',
          isCameraMoving ? '' : 'tile-transition',
        ]"
        :style="{
          transform: `translate3d(${tile.screenX}px, ${tile.screenY}px, 0) ${
            tile.isHovered &&
            !tile.isSelected &&
            !tile.isMultiSelected &&
            !isCameraMoving
              ? 'scale(1.02)'
              : ''
          }`,
          width: tile.width + 'px',
          height: tile.height + 'px',
          backgroundColor: tile.typeInfo?.bgColor || '#252538',
          borderColor: tile.isSelected
            ? tile.typeInfo?.color || '#6366f1'
            : tile.isMultiSelected
            ? '#6366f1'
            : tile.isHovered
            ? tile.typeInfo?.color + '80'
            : tile.typeInfo?.color + '40' || '#4a4a6a',
          '--ring-color': tile.typeInfo?.color || '#6366f1',
          cursor:
            tile.isMultiSelected && isDraggingTiles
              ? 'grabbing'
              : tile.isMultiSelected
              ? 'grab'
              : 'pointer',
        }"
        @click="handleTileClick(tile, $event)"
        @dblclick="handleTileDoubleClick(tile, $event)"
        @mousedown="handleTileMouseDown(tile, $event)"
        @mouseenter="handleTileHover(tile)"
        @mouseleave="handleTileLeave"
      >
        <!-- Spinner overlay for PROCESSING tiles only (actively being generated) -->
        <div
          v-if="tile.isProcessing"
          class="absolute inset-0 flex items-center justify-center z-10"
        >
          <div
            class="animate-spin rounded-full border-2 border-t-transparent"
            :style="{
              width: Math.max(16, 24 * canvasStore.zoom) + 'px',
              height: Math.max(16, 24 * canvasStore.zoom) + 'px',
              borderColor: tile.typeInfo?.color + '40',
              borderTopColor: 'transparent',
            }"
          ></div>
        </div>

        <!-- Drift warning badge -->
        <div
          v-if="tile.isDrift"
          class="absolute top-1 right-1 z-10 flex items-center justify-center rounded-full bg-amber-500/80"
          :style="{
            width: Math.max(14, 18 * canvasStore.zoom) + 'px',
            height: Math.max(14, 18 * canvasStore.zoom) + 'px',
            fontSize: Math.max(10, 12 * canvasStore.zoom) + 'px',
          }"
          title="Index not updated"
        >
          ⚠
        </div>

        <!-- Glyph Header -->
        <div
          class="px-2 py-1 flex items-center gap-2"
          :style="{ backgroundColor: tile.typeInfo?.color + '20' }"
        >
          <span
            class="text-lg font-bold"
            :style="{
              color: tile.typeInfo?.color,
              fontSize: Math.max(12, 16 * canvasStore.zoom) + 'px',
            }"
          >
            {{ tile.typeInfo?.icon }}
          </span>
          <span
            class="font-semibold truncate"
            :style="{
              color: tile.typeInfo?.color,
              fontSize: Math.max(9, 11 * canvasStore.zoom) + 'px',
            }"
            v-if="canvasStore.zoom > 0.25"
          >
            {{ tile.glyphType }}
          </span>
          <!-- Mismatch indicator with tooltip -->
          <Tooltip v-if="tile.mismatch" position="bottom" maxWidth="320px">
            <span
              class="flex-shrink-0 rounded-full bg-amber-500 animate-pulse"
              :style="{
                width: Math.max(6, 8 * canvasStore.zoom) + 'px',
                height: Math.max(6, 8 * canvasStore.zoom) + 'px',
              }"
            ></span>
            <template #content>
              <div class="space-y-2">
                <div
                  class="font-semibold text-amber-400 flex items-center gap-1.5"
                >
                  <span>●</span> File Location Mismatch
                </div>
                <p class="text-slate-300 leading-relaxed">
                  This glyph was matched flexibly. The file location suggests a
                  different glyph type than what's defined in your chain.
                </p>
                <div
                  class="bg-slate-900/50 rounded px-2 py-1.5 text-[11px] space-y-1"
                >
                  <div>
                    <span class="text-slate-500">Chain says:</span>
                    <span class="text-white">{{ tile.mismatch.expected }}</span>
                  </div>
                  <div>
                    <span class="text-slate-500">Index has:</span>
                    <span class="text-amber-300">{{
                      tile.mismatch.actual
                    }}</span>
                  </div>
                  <div
                    v-if="tile.file"
                    class="pt-1 border-t border-slate-700 mt-1"
                  >
                    <span class="text-slate-500">File path:</span>
                    <span class="text-blue-300 block truncate">{{
                      tile.file
                    }}</span>
                  </div>
                </div>
                <p class="text-slate-400 text-[11px] leading-relaxed">
                  Review the file path above. If it lives in
                  <code class="text-amber-300/80">views/</code>, use
                  <code class="text-amber-300/80">V:</code>. If in
                  <code class="text-amber-300/80">components/</code>, use
                  <code class="text-amber-300/80">CMP:</code>. Update your
                  <code class="text-amber-300/80">ARCHEON.arcon</code> to match.
                </p>
              </div>
            </template>
          </Tooltip>
        </div>

        <!-- Glyph Content -->
        <div
          class="px-2 py-1 flex-1 flex flex-col justify-center overflow-hidden"
          v-if="canvasStore.zoom > 0.3"
        >
          <Tooltip
            v-if="tile.intent"
            position="right"
            maxWidth="320px"
            :offsetX="10"
            :offsetY="-10"
          >
            <span
              class="text-ui-text font-medium truncate leading-tight cursor-help"
              :style="{ fontSize: Math.max(10, 12 * canvasStore.zoom) + 'px' }"
            >
              {{ tile.name }}
            </span>
            <template #content>
              <div class="space-y-1.5">
                <div
                  class="font-semibold text-blue-300 flex items-center gap-2"
                >
                  <span>{{ tile.glyphType }}: {{ tile.name }}</span>
                </div>
                <p class="text-slate-300 leading-relaxed whitespace-normal">
                  {{ tile.intent }}
                </p>
              </div>
            </template>
          </Tooltip>
          <span
            v-else
            class="text-ui-text font-medium truncate leading-tight"
            :style="{ fontSize: Math.max(10, 12 * canvasStore.zoom) + 'px' }"
          >
            {{ tile.name }}
          </span>
          <span
            class="text-ui-textMuted truncate leading-tight"
            :style="{ fontSize: Math.max(8, 10 * canvasStore.zoom) + 'px' }"
            v-if="tile.qualifier"
          >
            {{ tile.qualifier }}
          </span>
        </div>

        <!-- Collapse indicator badge -->
        <div
          v-if="tile.isCollapsed"
          class="absolute top-0 right-0 flex items-center gap-1 px-1.5 py-0.5 rounded-tr-md rounded-bl-md text-white font-semibold"
          :style="{
            backgroundColor: 'rgba(99, 102, 241, 0.9)',
            fontSize: Math.max(9, 11 * canvasStore.zoom) + 'px',
            lineHeight: 1,
          }"
          title="Collapsed - double-click to expand"
        >
          <span>▶</span>
          <span v-if="tile.descendantCount > 0">{{
            tile.descendantCount
          }}</span>
        </div>

        <!-- Layer indicator -->
        <div
          class="absolute bottom-1 right-1 px-1 rounded text-[8px] font-medium uppercase opacity-50"
          :style="{
            backgroundColor: tile.typeInfo?.color + '30',
            color: tile.typeInfo?.color,
            fontSize: Math.max(6, 8 * canvasStore.zoom) + 'px',
          }"
          v-if="canvasStore.zoom > 0.4"
        >
          {{ tile.typeInfo?.layer }}
        </div>
      </div>
    </div>

    <!-- Relationship Badges Layer -->
    <div
      class="absolute inset-0 pointer-events-none"
      style="contain: layout style"
    >
      <div
        v-for="badge in visibleBadges"
        :key="'badge-' + badge.id"
        class="absolute pointer-events-auto flex items-center justify-center rounded-full cursor-pointer badge-gpu"
        :class="[
          badge.isSelected
            ? 'ring-2 ring-white shadow-lg'
            : badge.isHovered && !isCameraMoving
            ? 'shadow-md'
            : 'shadow',
          isCameraMoving ? '' : 'badge-transition',
        ]"
        :style="{
          transform: `translate3d(${badge.screenX - badge.size / 2}px, ${
            badge.screenY - badge.size / 2
          }px, 0) ${
            badge.isSelected
              ? 'scale(1.1)'
              : badge.isHovered && !isCameraMoving
              ? 'scale(1.05)'
              : ''
          }`,
          width: badge.size + 'px',
          height: badge.size + 'px',
          backgroundColor: badge.edgeInfo?.color || '#6366f1',
          fontSize: Math.max(10, badge.size * 0.5) + 'px',
        }"
        @click="handleBadgeClick(badge, $event)"
        @mouseenter="handleBadgeHover(badge)"
        @mouseleave="handleBadgeLeave"
      >
        <span class="text-white font-bold">
          {{ badge.edgeInfo?.displaySymbol || "→" }}
        </span>
      </div>
    </div>

    <!-- Canvas Info Overlay -->
    <div
      class="absolute top-[72px] left-3 flex items-center gap-3 bg-ui-bg/40 backdrop-blur-sm rounded px-3 py-1.5 text-[10px] text-ui-textMuted/70 pointer-events-none"
    >
      <span>{{ (canvasStore.zoom * 100).toFixed(0) }}%</span>
      <span class="opacity-40">•</span>
      <span>{{ tileStore.allChains.length }} chains</span>
      <span class="opacity-40">•</span>
      <span
        >{{ tileStore.completeTiles.length }}/{{
          tileStore.allTiles.length
        }}
        glyphs</span
      >
      <span class="opacity-40">•</span>
      <span>{{ relationshipStore.allRelationships.length }} rels</span>
      <span
        v-if="tileStore.selectedTileKeys.size > 0"
        class="text-indigo-400/80"
        >• {{ tileStore.selectedTileKeys.size }} sel</span
      >
    </div>

    <!-- Validation Status Indicator -->
    <div
      v-if="
        ['validating', 'valid', 'invalid'].includes(
          uiStore.validationStatus.status
        )
      "
      class="absolute top-[72px] right-3"
      @mousedown.stop
      @click.stop
    >
      <Tooltip position="bottom" maxWidth="480px" :offsetX="-50">
        <div
          class="flex items-center gap-2 bg-ui-bg/80 backdrop-blur-sm rounded px-2.5 py-1.5 text-[10px] cursor-pointer transition-all duration-200 hover:bg-ui-bg/95"
          :class="{
            'border border-emerald-500/50':
              uiStore.validationStatus.status === 'valid',
            'border border-red-500/50':
              uiStore.validationStatus.status === 'invalid',
            'border border-amber-500/50':
              uiStore.validationStatus.status === 'error',
            'border border-blue-500/50':
              uiStore.validationStatus.status === 'validating',
          }"
          @click="copyValidationErrors"
        >
          <!-- Status Icon -->
          <span
            v-if="uiStore.validationStatus.status === 'validating'"
            class="flex items-center"
          >
            <svg
              class="animate-spin h-3 w-3 text-blue-400"
              xmlns="http://www.w3.org/2000/svg"
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
          </span>
          <span
            v-else-if="uiStore.validationStatus.status === 'valid'"
            class="text-emerald-400 text-sm"
            >✓</span
          >
          <span
            v-else-if="uiStore.validationStatus.status === 'invalid'"
            class="text-red-400 text-sm"
            >✗</span
          >
          <span v-else class="text-amber-400 text-sm">⚠</span>

          <!-- Status Text -->
          <span
            :class="{
              'text-emerald-400': uiStore.validationStatus.status === 'valid',
              'text-red-400': uiStore.validationStatus.status === 'invalid',
              'text-amber-400': uiStore.validationStatus.status === 'error',
              'text-blue-400': uiStore.validationStatus.status === 'validating',
            }"
          >
            {{
              uiStore.validationStatus.status === "validating"
                ? "Validating..."
                : uiStore.validationStatus.status === "valid"
                ? "Valid"
                : uiStore.validationStatus.status === "invalid"
                ? `${uiStore.validationStatus.errors.length} error(s)`
                : "Error"
            }}
          </span>

          <!-- Warning count if valid but has warnings -->
          <span
            v-if="
              uiStore.validationStatus.status === 'valid' &&
              uiStore.validationStatus.warnings.length > 0
            "
            class="text-amber-400/70"
          >
            ({{ uiStore.validationStatus.warnings.length }} warn)
          </span>
        </div>

        <!-- Tooltip Content -->
        <template #content>
          <div class="space-y-2 text-xs">
            <div
              class="font-semibold flex items-center gap-2"
              :class="{
                'text-emerald-400': uiStore.validationStatus.status === 'valid',
                'text-red-400': uiStore.validationStatus.status === 'invalid',
                'text-amber-400': uiStore.validationStatus.status === 'error',
              }"
            >
              <span>arc validate</span>
              <span
                class="text-ui-textMuted/50 font-normal"
                v-if="uiStore.validationStatus.lastChecked"
              >
                {{
                  new Date(
                    uiStore.validationStatus.lastChecked
                  ).toLocaleTimeString()
                }}
              </span>
            </div>

            <!-- Errors -->
            <div
              v-if="uiStore.validationStatus.errors.length > 0"
              class="space-y-1"
            >
              <div
                v-for="(error, i) in uiStore.validationStatus.errors.slice(
                  0,
                  5
                )"
                :key="i"
                class="text-red-300/90 bg-red-500/10 rounded px-2 py-1 font-mono text-[10px] leading-relaxed"
              >
                {{ error }}
              </div>
              <div
                v-if="uiStore.validationStatus.errors.length > 5"
                class="text-red-300/50 text-[10px]"
              >
                +{{ uiStore.validationStatus.errors.length - 5 }} more errors
              </div>
            </div>

            <!-- Warnings -->
            <div
              v-if="uiStore.validationStatus.warnings.length > 0"
              class="space-y-1"
            >
              <div
                v-for="(warning, i) in uiStore.validationStatus.warnings.slice(
                  0,
                  3
                )"
                :key="i"
                class="text-amber-300/90 bg-amber-500/10 rounded px-2 py-1 font-mono text-[10px] leading-relaxed"
              >
                {{ warning }}
              </div>
              <div
                v-if="uiStore.validationStatus.warnings.length > 3"
                class="text-amber-300/50 text-[10px]"
              >
                +{{ uiStore.validationStatus.warnings.length - 3 }} more
                warnings
              </div>
            </div>

            <!-- Success message -->
            <div
              v-if="
                uiStore.validationStatus.status === 'valid' &&
                uiStore.validationStatus.errors.length === 0
              "
              class="text-emerald-300/90"
            >
              ✓ Architecture is valid
            </div>

            <!-- Error message -->
            <div
              v-if="uiStore.validationStatus.status === 'error'"
              class="text-amber-300/90"
            >
              {{ uiStore.validationStatus.message }}
            </div>

            <div
              class="text-ui-textMuted/40 text-[10px] pt-1 border-t border-ui-border/30"
            >
              {{
                uiStore.validationStatus.status === "valid" &&
                uiStore.validationStatus.warnings.length === 0
                  ? "Click to re-validate"
                  : (uiStore.validationStatus.errors.length > 0 ||
                      uiStore.validationStatus.warnings.length > 0) &&
                    uiStore.validationStatus.status !== "validating"
                  ? "Click to copy messages"
                  : ""
              }}
            </div>
          </div>
        </template>
      </Tooltip>
    </div>

    <!-- Legend - Teleported to ensure it stays above terminal -->
    <Teleport to="body">
      <div
        class="fixed bottom-4 right-4 bg-ui-bg/90 backdrop-blur-sm rounded-lg px-3 py-2 text-xs pointer-events-none z-[5000]"
      >
        <div class="font-semibold text-ui-text mb-2">Glyph Layers</div>
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <div
              class="w-3 h-3 rounded"
              style="background-color: #f59e0b"
            ></div>
            <span class="text-ui-textMuted">Meta (NED, TSK, OUT, ERR)</span>
          </div>
          <div class="flex items-center gap-2">
            <div
              class="w-3 h-3 rounded"
              style="background-color: #3b82f6"
            ></div>
            <span class="text-ui-textMuted">Frontend (CMP, STO)</span>
          </div>
          <div class="flex items-center gap-2">
            <div
              class="w-3 h-3 rounded"
              style="background-color: #14b8a6"
            ></div>
            <span class="text-ui-textMuted">Backend (API, FNC, MDL)</span>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Custom ring color based on tile type */
[style*="--ring-color"] {
  --tw-ring-color: var(--ring-color);
}

/* GPU-accelerated tiles - no transitions during camera movement */
.tile-gpu {
  will-change: transform;
  backface-visibility: hidden;
  contain: layout style paint;
}

.tile-transition {
  transition: transform 0.15s ease-out, box-shadow 0.15s ease-out,
    border-color 0.15s ease-out;
}

/* GPU-accelerated badges */
.badge-gpu {
  will-change: transform;
  backface-visibility: hidden;
  contain: layout style paint;
}

.badge-transition {
  transition: transform 0.15s ease-out, box-shadow 0.15s ease-out;
}
</style>
