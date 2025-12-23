<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import {
  useCanvasStore,
  useTileStore,
  useRelationshipStore,
  useUIStore,
} from "../stores";
import { useSelection } from "../composables";
import { GLYPH_STATES } from "../stores/tiles";

const canvasStore = useCanvasStore();
const tileStore = useTileStore();
const relationshipStore = useRelationshipStore();
const uiStore = useUIStore();

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
} = useSelection(canvasStore, tileStore, relationshipStore);

const canvasRef = ref(null);
const lastMousePos = ref({ x: 0, y: 0 });

// Get visible tiles with screen positions (only tiles that exist)
const visibleTiles = computed(() => {
  const range = canvasStore.visibleGridRange;
  const result = [];

  for (const tile of tileStore.allTiles) {
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
    const isMultiSelected = tileStore.selectedTileKeys.has(
      tileStore.getTileKey(tile.col, tile.row)
    );

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
      // Only interactive when complete
      isInteractive: isComplete,
    });
  }

  return result;
});

// Get visible relationships with badge positions
const visibleBadges = computed(() => {
  const result = [];

  for (const rel of relationshipStore.allRelationships) {
    const sourceCoords = tileStore.parseTileKey(rel.sourceTileKey);
    const targetCoords = tileStore.parseTileKey(rel.targetTileKey);

    const sourceTile = tileStore.getTile(sourceCoords.col, sourceCoords.row);
    const targetTile = tileStore.getTile(targetCoords.col, targetCoords.row);

    if (!sourceTile || !targetTile) continue;

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

// Calculate grid lines
const gridLines = computed(() => {
  const range = canvasStore.visibleGridRange;
  const lines = { horizontal: [], vertical: [] };

  // Vertical lines
  for (let col = range.minCol; col <= range.maxCol + 1; col++) {
    const worldX = col * canvasStore.cellWidth - canvasStore.gridGap / 2;
    const screen = canvasStore.worldToScreen(worldX, 0);
    lines.vertical.push({ x: screen.x, col });
  }

  // Horizontal lines
  for (let row = range.minRow; row <= range.maxRow + 1; row++) {
    const worldY = row * canvasStore.cellHeight - canvasStore.gridGap / 2;
    const screen = canvasStore.worldToScreen(0, worldY);
    lines.horizontal.push({ y: screen.y, row });
  }

  return lines;
});

// Mouse event handlers
function handleWheel(e) {
  if (!uiStore.canvasInteractionsEnabled) return;
  e.preventDefault();
  e.stopPropagation();
  canvasStore.zoomAt(e.clientX, e.clientY, e.deltaY);
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

    // Check if clicking on empty space - start selection box
    if (!tileStore.hasTile(gridPos.col, gridPos.row)) {
      // Clear previous selections
      tileStore.deselectTile();
      tileStore.clearMultiSelection();
      relationshipStore.deselectRelationship();
      uiStore.closeDrawer();

      // Start selection box
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
  } else if (isSelecting.value) {
    updateSelection(e.clientX, e.clientY);
  } else if (isDraggingTiles.value) {
    updateDragging(e.clientX, e.clientY);
  }
}

function handleMouseUp(e) {
  if (e.button === 1 || e.button === 0) {
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
  // Only allow interaction with complete tiles
  if (!tile.isInteractive) return;

  e.stopPropagation();
  relationshipStore.deselectRelationship();
  tileStore.selectTile(tile.col, tile.row);
  uiStore.openDrawer();
  uiStore.setDrawerMode("tile");
}

function handleTileMouseDown(tile, e) {
  if (!tile.isInteractive) return;

  e.stopPropagation();

  // If tile is part of multi-selection, start dragging
  if (tile.isMultiSelected && tileStore.selectedTileKeys.size > 0) {
    startDragging(e.clientX, e.clientY);
  }
}

function handleTileHover(tile) {
  // Only show hover state for complete tiles
  if (!tile.isInteractive) return;
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

  // Grid starts empty - tiles loaded when project is opened
});

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
    class="absolute inset-0 bg-canvas-bg overflow-hidden no-select"
    :class="cursorClass"
    @mousedown="handleMouseDown"
    @mousemove="handleMouseMove"
    @mouseup="handleMouseUp"
    @mouseleave="handleMouseLeave"
  >
    <!-- Grid Lines Layer -->
    <svg class="absolute inset-0 w-full h-full pointer-events-none opacity-30">
      <line
        v-for="line in gridLines.vertical"
        :key="'v-' + line.col"
        :x1="line.x"
        :y1="0"
        :x2="line.x"
        :y2="canvasStore.viewportHeight"
        class="stroke-canvas-grid"
        stroke-width="1"
      />
      <line
        v-for="line in gridLines.horizontal"
        :key="'h-' + line.row"
        :x1="0"
        :y1="line.y"
        :x2="canvasStore.viewportWidth"
        :y2="line.y"
        class="stroke-canvas-grid"
        stroke-width="1"
      />
    </svg>

    <!-- Selection Box Layer -->
    <div
      v-if="selectionBox"
      class="absolute border-2 border-indigo-500 bg-indigo-500/10 pointer-events-none z-50"
      :style="{
        left: selectionBox.left + 'px',
        top: selectionBox.top + 'px',
        width: selectionBox.width + 'px',
        height: selectionBox.height + 'px',
      }"
    ></div>

    <!-- Connection Lines Layer (behind badges) -->
    <svg class="absolute inset-0 w-full h-full pointer-events-none">
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
      <g v-for="badge in visibleBadges" :key="'line-' + badge.id">
        <line
          :x1="
            canvasStore.worldToScreen(
              canvasStore.gridToWorld(
                badge.sourceTile.col,
                badge.sourceTile.row
              ).x +
                canvasStore.tileWidth / 2,
              canvasStore.gridToWorld(
                badge.sourceTile.col,
                badge.sourceTile.row
              ).y +
                canvasStore.tileHeight / 2
            ).x
          "
          :y1="
            canvasStore.worldToScreen(
              canvasStore.gridToWorld(
                badge.sourceTile.col,
                badge.sourceTile.row
              ).x +
                canvasStore.tileWidth / 2,
              canvasStore.gridToWorld(
                badge.sourceTile.col,
                badge.sourceTile.row
              ).y +
                canvasStore.tileHeight / 2
            ).y
          "
          :x2="
            canvasStore.worldToScreen(
              canvasStore.gridToWorld(
                badge.targetTile.col,
                badge.targetTile.row
              ).x +
                canvasStore.tileWidth / 2,
              canvasStore.gridToWorld(
                badge.targetTile.col,
                badge.targetTile.row
              ).y +
                canvasStore.tileHeight / 2
            ).x
          "
          :y2="
            canvasStore.worldToScreen(
              canvasStore.gridToWorld(
                badge.targetTile.col,
                badge.targetTile.row
              ).x +
                canvasStore.tileWidth / 2,
              canvasStore.gridToWorld(
                badge.targetTile.col,
                badge.targetTile.row
              ).y +
                canvasStore.tileHeight / 2
            ).y
          "
          :stroke="badge.edgeInfo?.color || '#6366f1'"
          stroke-width="2"
          stroke-dasharray="4,4"
          :class="{
            'opacity-70': !badge.isHovered && !badge.isSelected,
            'opacity-100': badge.isHovered || badge.isSelected,
          }"
        />
      </g>
    </svg>

    <!-- Glyph Tiles Layer -->
    <div class="absolute inset-0 pointer-events-none">
      <div
        v-for="tile in visibleTiles"
        :key="tile.id"
        class="absolute transition-all duration-150 ease-out rounded-lg border-2 overflow-hidden"
        :class="[
          tile.isInteractive ? 'pointer-events-auto' : 'pointer-events-none',
          tile.isSelected
            ? 'ring-2 ring-offset-2 ring-offset-canvas-bg shadow-lg'
            : tile.isMultiSelected
            ? 'ring-2 ring-offset-1 ring-offset-canvas-bg ring-indigo-500 shadow-lg'
            : tile.isHovered
            ? 'shadow-md'
            : '',
        ]"
        :style="{
          left: tile.screenX + 'px',
          top: tile.screenY + 'px',
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
          transform:
            tile.isHovered && !tile.isSelected && !tile.isMultiSelected
              ? 'scale(1.02)'
              : 'scale(1)',
          // State-driven opacity
          opacity: tile.isComplete ? 1 : 0.35,
          cursor:
            tile.isMultiSelected && isDraggingTiles
              ? 'grabbing'
              : tile.isMultiSelected
              ? 'grab'
              : tile.isInteractive
              ? 'pointer'
              : 'default',
        }"
        @click="handleTileClick(tile, $event)"
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
        </div>

        <!-- Glyph Content -->
        <div
          class="px-2 py-1 flex-1 flex flex-col justify-center overflow-hidden"
          v-if="canvasStore.zoom > 0.3"
        >
          <span
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
    <div class="absolute inset-0 pointer-events-none">
      <div
        v-for="badge in visibleBadges"
        :key="'badge-' + badge.id"
        class="absolute pointer-events-auto flex items-center justify-center rounded-full cursor-pointer transition-all duration-150"
        :class="[
          badge.isSelected
            ? 'ring-2 ring-white shadow-lg scale-110'
            : badge.isHovered
            ? 'shadow-md scale-105'
            : 'shadow',
        ]"
        :style="{
          left: badge.screenX - badge.size / 2 + 'px',
          top: badge.screenY - badge.size / 2 + 'px',
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
      class="absolute top-4 left-4 bg-ui-bg/90 backdrop-blur-sm rounded-lg px-4 py-3 text-xs text-ui-textMuted pointer-events-none"
    >
      <div class="font-semibold text-ui-text mb-1">Archeon Canvas</div>
      <div>Zoom: {{ (canvasStore.zoom * 100).toFixed(0) }}%</div>
      <div>Chains: {{ tileStore.allChains.length }}</div>
      <div>
        Glyphs: {{ tileStore.allTiles.length }} ({{
          tileStore.completeTiles.length
        }}
        active)
      </div>
      <div>Relationships: {{ relationshipStore.allRelationships.length }}</div>
      <div v-if="tileStore.selectedTileKeys.size > 0" class="text-indigo-400">
        Selected: {{ tileStore.selectedTileKeys.size }} tiles
      </div>
      <div class="text-ui-textMuted/50 mt-2 text-[10px]">
        Space+Drag to pan • Scroll to zoom
        <br />
        Drag to select • Drag selection to move
      </div>
    </div>

    <!-- Legend -->
    <div
      class="absolute bottom-4 right-4 bg-ui-bg/90 backdrop-blur-sm rounded-lg px-3 py-2 text-xs pointer-events-none"
    >
      <div class="font-semibold text-ui-text mb-2">Glyph Layers</div>
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded" style="background-color: #f59e0b"></div>
          <span class="text-ui-textMuted">Meta (NED, TSK, OUT, ERR)</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded" style="background-color: #3b82f6"></div>
          <span class="text-ui-textMuted">Frontend (CMP, STO)</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded" style="background-color: #14b8a6"></div>
          <span class="text-ui-textMuted">Backend (API, FNC, MDL)</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Custom ring color based on tile type */
[style*="--ring-color"] {
  --tw-ring-color: var(--ring-color);
}
</style>
