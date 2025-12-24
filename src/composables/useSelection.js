import { ref, computed } from "vue";

/**
 * Composable for handling multi-tile selection and drag-to-move
 * @param {Object} canvasStore - Canvas store for coordinate transformations
 * @param {Object} tileStore - Tile store for tile operations
 * @param {Object} relationshipStore - Relationship store for edge operations
 * @param {Function} getProjectPath - Function to get current project path for persistence
 */
export function useSelection(
  canvasStore,
  tileStore,
  relationshipStore,
  getProjectPath = null
) {
  // Selection box state for drag-select
  const isSelecting = ref(false);
  const selectionStart = ref({ x: 0, y: 0 });
  const selectionCurrent = ref({ x: 0, y: 0 });

  // Dragging selected tiles state
  const isDraggingTiles = ref(false);
  const dragStartGridPos = ref({ col: 0, row: 0 });
  const hasMoved = ref(false); // Track if tiles actually moved during drag

  // Computed selection box in screen coordinates
  const selectionBox = computed(() => {
    if (!isSelecting.value) return null;

    const x1 = Math.min(selectionStart.value.x, selectionCurrent.value.x);
    const y1 = Math.min(selectionStart.value.y, selectionCurrent.value.y);
    const x2 = Math.max(selectionStart.value.x, selectionCurrent.value.x);
    const y2 = Math.max(selectionStart.value.y, selectionCurrent.value.y);

    return {
      left: x1,
      top: y1,
      width: x2 - x1,
      height: y2 - y1,
    };
  });

  /**
   * Start a selection box from screen coordinates
   */
  function startSelection(screenX, screenY) {
    isSelecting.value = true;
    selectionStart.value = { x: screenX, y: screenY };
    selectionCurrent.value = { x: screenX, y: screenY };
  }

  /**
   * Update the selection box and select tiles within bounds
   */
  function updateSelection(screenX, screenY) {
    if (!isSelecting.value) return;

    selectionCurrent.value = { x: screenX, y: screenY };

    // Calculate grid bounds of selection box
    const startWorld = canvasStore.screenToWorld(
      selectionStart.value.x,
      selectionStart.value.y
    );
    const currentWorld = canvasStore.screenToWorld(screenX, screenY);

    const startGrid = canvasStore.worldToGrid(startWorld.x, startWorld.y);
    const currentGrid = canvasStore.worldToGrid(currentWorld.x, currentWorld.y);

    const minCol = Math.min(startGrid.col, currentGrid.col);
    const maxCol = Math.max(startGrid.col, currentGrid.col);
    const minRow = Math.min(startGrid.row, currentGrid.row);
    const maxRow = Math.max(startGrid.row, currentGrid.row);

    // Select tiles in bounds
    tileStore.selectTilesInBounds(minCol, minRow, maxCol, maxRow);
  }

  /**
   * End selection box
   */
  function endSelection() {
    isSelecting.value = false;
  }

  /**
   * Start dragging selected tiles from screen coordinates
   */
  function startDragging(screenX, screenY) {
    if (tileStore.selectedTileKeys.size === 0) return;

    isDraggingTiles.value = true;
    hasMoved.value = false; // Reset move tracking
    const worldPos = canvasStore.screenToWorld(screenX, screenY);
    dragStartGridPos.value = canvasStore.worldToGrid(worldPos.x, worldPos.y);
    
    // Capture undo state before any movement
    tileStore.pushUndoState();
  }

  /**
   * Update tile positions while dragging
   */
  function updateDragging(screenX, screenY) {
    if (!isDraggingTiles.value) return;

    const worldPos = canvasStore.screenToWorld(screenX, screenY);
    const currentGrid = canvasStore.worldToGrid(worldPos.x, worldPos.y);

    const deltaCol = currentGrid.col - dragStartGridPos.value.col;
    const deltaRow = currentGrid.row - dragStartGridPos.value.row;

    if (deltaCol !== 0 || deltaRow !== 0) {
      const moved = tileStore.moveSelectedTiles(
        deltaCol,
        deltaRow,
        relationshipStore
      );
      if (moved) {
        dragStartGridPos.value = currentGrid;
        hasMoved.value = true; // Track that tiles actually moved
      }
    }
  }

  /**
   * End dragging tiles and persist layout
   */
  function endDragging() {
    if (isDraggingTiles.value) {
      // If no actual movement occurred, pop the undo state we saved
      if (!hasMoved.value) {
        // Remove the undo state since nothing changed
        tileStore.undoStack.pop();
      } else {
        // Save tile positions to localStorage after tiles are moved
        const projectPath = getProjectPath ? getProjectPath() : null;
        if (projectPath) {
          tileStore.saveLayout(projectPath);
        }
      }
    }
    isDraggingTiles.value = false;
    hasMoved.value = false;
  }

  /**
   * Cancel all selection/dragging operations
   */
  function cancelAll() {
    isSelecting.value = false;
    isDraggingTiles.value = false;
  }

  return {
    // State
    isSelecting,
    isDraggingTiles,
    selectionBox,

    // Methods
    startSelection,
    updateSelection,
    endSelection,
    startDragging,
    updateDragging,
    endDragging,
    cancelAll,
  };
}
