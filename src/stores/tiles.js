import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { GLYPH_TYPES } from "../types/glyphs.js";

// localStorage key prefix for layout persistence
const LAYOUT_STORAGE_PREFIX = "archeon:layout:";
const LAYOUT_VERSION = 1;

/**
 * Get storage key for a project path
 * @param {string} projectPath - Project root path
 * @returns {string} - localStorage key
 */
function getLayoutStorageKey(projectPath) {
  if (!projectPath) return null;
  // Use base64 encoding of path for safe key
  return LAYOUT_STORAGE_PREFIX + btoa(projectPath);
}

// Glyph execution states (file-driven)
export const GLYPH_STATES = {
  PENDING: "pending", // Exists in .arcon, not yet in index
  PROCESSING: "processing", // Being generated
  COMPLETE: "complete", // Confirmed in index.json
  DRIFT: "drift", // In arcon but missing from index after timeout
};

export const useTileStore = defineStore("tiles", () => {
  // Map of tiles: key is "col,row", value is tile data
  const tiles = ref(new Map());

  // Map of chains/rows: key is row number, value is chain metadata
  const chains = ref(new Map());

  // Currently selected tile key (single selection)
  const selectedTileKey = ref(null);

  // Multi-selection: Set of selected tile keys
  const selectedTileKeys = ref(new Set());

  // Currently hovered tile key
  const hoveredTileKey = ref(null);

  // Undo/Redo history stacks
  const undoStack = ref([]);
  const redoStack = ref([]);
  const maxHistorySize = 50; // Limit history to prevent memory issues

  /**
   * Capture current tile positions as a snapshot for undo/redo
   * @returns {Array} - Array of tile position snapshots
   */
  function captureSnapshot() {
    const snapshot = [];
    for (const tile of tiles.value.values()) {
      snapshot.push({
        label: tile.label,
        chainIndex: tile.chainIndex,
        col: tile.col,
        row: tile.row,
      });
    }
    return snapshot;
  }

  /**
   * Push current state to undo stack (call before making changes)
   */
  function pushUndoState() {
    const snapshot = captureSnapshot();
    undoStack.value.push(snapshot);

    // Limit stack size
    if (undoStack.value.length > maxHistorySize) {
      undoStack.value.shift();
    }

    // Clear redo stack when new action is taken
    redoStack.value = [];
  }

  /**
   * Restore tile positions from a snapshot
   * @param {Array} snapshot - Array of tile position snapshots
   */
  function restoreSnapshot(snapshot) {
    // Build lookup map: "label:chainIndex" -> position
    const positionMap = new Map();
    for (const item of snapshot) {
      const key = `${item.label}:${item.chainIndex}`;
      positionMap.set(key, { col: item.col, row: item.row });
    }

    // Collect tiles to move
    const tilesToMove = [];
    for (const [key, tile] of tiles.value) {
      const lookupKey = `${tile.label}:${tile.chainIndex}`;
      const savedPos = positionMap.get(lookupKey);
      if (
        savedPos &&
        (savedPos.col !== tile.col || savedPos.row !== tile.row)
      ) {
        tilesToMove.push({
          tile,
          oldKey: key,
          newCol: savedPos.col,
          newRow: savedPos.row,
          newKey: getTileKey(savedPos.col, savedPos.row),
        });
      }
    }

    if (tilesToMove.length === 0) return false;

    // Remove tiles from old positions
    for (const { oldKey } of tilesToMove) {
      tiles.value.delete(oldKey);
    }

    // Add tiles at restored positions
    for (const { tile, newCol, newRow, newKey } of tilesToMove) {
      tile.col = newCol;
      tile.row = newRow;
      tile.id = newKey;
      tiles.value.set(newKey, tile);
    }

    return true;
  }

  /**
   * Undo last tile movement
   * @returns {boolean} - Whether undo was successful
   */
  function undo() {
    if (undoStack.value.length === 0) return false;

    // Save current state to redo stack
    const currentSnapshot = captureSnapshot();
    redoStack.value.push(currentSnapshot);

    // Pop and restore previous state
    const previousSnapshot = undoStack.value.pop();
    return restoreSnapshot(previousSnapshot);
  }

  /**
   * Redo last undone tile movement
   * @returns {boolean} - Whether redo was successful
   */
  function redo() {
    if (redoStack.value.length === 0) return false;

    // Save current state to undo stack
    const currentSnapshot = captureSnapshot();
    undoStack.value.push(currentSnapshot);

    // Pop and restore next state
    const nextSnapshot = redoStack.value.pop();
    return restoreSnapshot(nextSnapshot);
  }

  /**
   * Check if undo is available
   */
  const canUndo = computed(() => undoStack.value.length > 0);

  /**
   * Check if redo is available
   */
  const canRedo = computed(() => redoStack.value.length > 0);

  /**
   * Clear undo/redo history
   */
  function clearHistory() {
    undoStack.value = [];
    redoStack.value = [];
  }

  // Generate a tile key from coordinates
  function getTileKey(col, row) {
    return `${col},${row}`;
  }

  // Parse tile key to coordinates
  function parseTileKey(key) {
    const [col, row] = key.split(",").map(Number);
    return { col, row };
  }

  // Create a glyph tile at position
  function createGlyph(col, row, glyphType, name, qualifier = null) {
    const key = getTileKey(col, row);
    const typeInfo = GLYPH_TYPES[glyphType];

    if (!typeInfo) {
      console.warn(`Unknown glyph type: ${glyphType}`);
      return null;
    }

    const tile = {
      col,
      row,
      id: key,
      glyphType: glyphType,
      name: name,
      qualifier: qualifier, // e.g., "auth" in FNC:auth.validatePassword
      label: qualifier
        ? `${glyphType}:${qualifier}.${name}`
        : `${glyphType}:${name}`,
      typeInfo: typeInfo,
      data: {},
      createdAt: Date.now(),
    };

    tiles.value.set(key, tile);
    return tile;
  }

  /**
   * Create a tile from archeon data (ARCHEON.index.json format)
   * @param {number} col - Column position
   * @param {number} row - Row position
   * @param {Object} tileData - Tile data from archeon sync
   */
  function createTile(col, row, tileData) {
    const key = getTileKey(col, row);
    const typeInfo = GLYPH_TYPES[tileData.type] || GLYPH_TYPES.FNC;

    const tile = {
      col,
      row,
      chainIndex: row, // Immutable: which chain this tile belongs to (used for layout persistence)
      id: key,
      glyphType: tileData.type,
      name: tileData.name,
      qualifier: null,
      label: tileData.label || `${tileData.type}:${tileData.name}`,
      typeInfo: typeInfo,
      // Archeon-specific fields
      file: tileData.file || null,
      intent: tileData.intent || null,
      chain: tileData.chain || null,
      sections: tileData.sections || [],
      // Glyph execution state (file-driven)
      state: tileData.state || GLYPH_STATES.PENDING,
      // Custom styling (optional override)
      color: tileData.color || typeInfo.color,
      icon: tileData.icon || typeInfo.icon,
      layer: tileData.layer || typeInfo.layer,
      data: {},
      createdAt: Date.now(),
    };

    tiles.value.set(key, tile);
    return tile;
  }

  /**
   * Update glyph state (pending -> processing -> complete)
   * @param {number} col - Column position
   * @param {number} row - Row position
   * @param {string} state - New state from GLYPH_STATES
   */
  function updateGlyphState(col, row, state) {
    const tile = getTile(col, row);
    if (tile) {
      tile.state = state;
    }
  }

  /**
   * Parse a glyph label into type and name parts
   * @param {string} label - Glyph key like "CMP:LoginForm" or "V:LoginView"
   * @returns {{type: string, name: string}} - Parsed parts
   */
  function parseGlyphLabel(label) {
    const match = label.match(/^(\w+):(.+)$/);
    if (match) {
      return { type: match[1], name: match[2] };
    }
    return { type: "", name: label };
  }

  /**
   * Check if two glyph labels match flexibly
   * Matches if: exact match, OR same name with compatible types (V/CMP/View variants)
   * @param {string} label1 - First label
   * @param {string} label2 - Second label
   * @returns {boolean}
   */
  function glyphLabelsMatch(label1, label2) {
    // Exact match
    if (label1 === label2) return true;

    const parsed1 = parseGlyphLabel(label1);
    const parsed2 = parseGlyphLabel(label2);

    // Normalize names for comparison (case-insensitive, strip View/Form suffixes for matching)
    const normalizeName = (name) => {
      return name
        .toLowerCase()
        .replace(/view$/i, "")
        .replace(/form$/i, "")
        .replace(/component$/i, "");
    };

    const name1 = normalizeName(parsed1.name);
    const name2 = normalizeName(parsed2.name);

    // If normalized names match, check type compatibility
    if (name1 === name2) {
      // Types that are considered compatible (View-like components)
      const viewTypes = ["V", "CMP", "VIW", "VIEW"];
      const isViewType1 = viewTypes.includes(parsed1.type.toUpperCase());
      const isViewType2 = viewTypes.includes(parsed2.type.toUpperCase());

      // Both are view-like types = compatible
      if (isViewType1 && isViewType2) return true;

      // Same type = compatible
      if (parsed1.type === parsed2.type) return true;
    }

    return false;
  }

  /**
   * Update glyph state by label (glyph key like "STO:Auth")
   * Uses flexible matching: exact match first, then name-based matching
   * @param {string} label - Glyph key
   * @param {string} state - New state
   * @param {Object} indexData - Optional data from index.json
   */
  function updateGlyphStateByLabel(label, state, indexData = null) {
    // First try exact match
    for (const [key, tile] of tiles.value) {
      if (tile.label === label) {
        tile.state = state;
        if (indexData) {
          tile.file = indexData.file || tile.file;
          tile.intent = indexData.intent || tile.intent;
          tile.sections = indexData.sections || tile.sections;
        }
        return tile;
      }
    }

    // Fallback: flexible matching (handles V vs CMP, LoginView vs LoginForm, etc.)
    for (const [key, tile] of tiles.value) {
      if (glyphLabelsMatch(tile.label, label)) {
        console.log(
          `Archeon: Flexible match "${tile.label}" ↔ "${label}" (updating state to ${state})`
        );

        // Mark tile as having a glyph mismatch (visual indicator instead of toast)
        tile.mismatch = {
          expected: tile.label,
          actual: label,
          suggestion: `Update ARCHEON.arcon: "${tile.label}" → "${label}"`,
        };

        tile.state = state;
        if (indexData) {
          tile.file = indexData.file || tile.file;
          tile.intent = indexData.intent || tile.intent;
          tile.sections = indexData.sections || tile.sections;
        }
        return tile;
      }
    }

    return null;
  }

  /**
   * Create a chain/row entry
   * @param {number} row - Row number
   * @param {Object} chainData - Chain metadata
   */
  function createChain(row, chainData) {
    chains.value.set(row, {
      row,
      version: chainData.version || null,
      raw: chainData.raw || "",
      glyphCount: chainData.glyphCount || 0,
      edges: chainData.edges || [], // Store edge definitions for rebuilding
      confirmedCount: 0,
      isActive: false,
      createdAt: Date.now(),
    });
  }

  /**
   * Update chain activation status
   * @param {number} row - Row number
   */
  function updateChainActivation(row) {
    const chain = chains.value.get(row);
    if (!chain) return;

    // Count confirmed glyphs in this row
    let confirmedCount = 0;
    for (const [key, tile] of tiles.value) {
      if (tile.row === row && tile.state === GLYPH_STATES.COMPLETE) {
        confirmedCount++;
      }
    }

    chain.confirmedCount = confirmedCount;
    chain.isActive =
      confirmedCount === chain.glyphCount && chain.glyphCount > 0;
  }

  /**
   * Check if a row/chain is fully active
   * @param {number} row - Row number
   * @returns {boolean}
   */
  function isChainActive(row) {
    const chain = chains.value.get(row);
    return chain?.isActive || false;
  }

  /**
   * Get chain metadata for a row
   * @param {number} row - Row number
   * @returns {Object|null}
   */
  function getChain(row) {
    return chains.value.get(row) || null;
  }

  // Get tile at position (doesn't create)
  function getTile(col, row) {
    return tiles.value.get(getTileKey(col, row)) || null;
  }

  // Check if tile exists at position
  function hasTile(col, row) {
    return tiles.value.has(getTileKey(col, row));
  }

  // Select a tile
  function selectTile(col, row) {
    const key = getTileKey(col, row);
    if (tiles.value.has(key)) {
      selectedTileKey.value = key;
      return true;
    }
    return false;
  }

  // Deselect current tile
  function deselectTile() {
    selectedTileKey.value = null;
  }

  // Set hovered tile
  function setHoveredTile(col, row) {
    if (col === null || row === null) {
      hoveredTileKey.value = null;
    } else {
      const key = getTileKey(col, row);
      // Only set hover if tile exists
      if (tiles.value.has(key)) {
        hoveredTileKey.value = key;
      } else {
        hoveredTileKey.value = null;
      }
    }
  }

  // Get selected tile data
  const selectedTile = computed(() => {
    if (!selectedTileKey.value) return null;
    return tiles.value.get(selectedTileKey.value) || null;
  });

  // Check if a tile is selected (single or multi)
  function isSelected(col, row) {
    const key = getTileKey(col, row);
    return selectedTileKey.value === key || selectedTileKeys.value.has(key);
  }

  // Add tile to multi-selection
  function addToSelection(col, row) {
    const key = getTileKey(col, row);
    if (tiles.value.has(key)) {
      selectedTileKeys.value.add(key);
    }
  }

  // Remove tile from multi-selection
  function removeFromSelection(col, row) {
    const key = getTileKey(col, row);
    selectedTileKeys.value.delete(key);
  }

  // Clear multi-selection
  function clearMultiSelection() {
    selectedTileKeys.value.clear();
  }

  // Select tiles within a bounding box (grid coordinates)
  function selectTilesInBounds(minCol, minRow, maxCol, maxRow) {
    clearMultiSelection();
    for (const [key, tile] of tiles.value) {
      if (
        tile.col >= minCol &&
        tile.col <= maxCol &&
        tile.row >= minRow &&
        tile.row <= maxRow
      ) {
        selectedTileKeys.value.add(key);
      }
    }
  }

  // Get all multi-selected tiles
  const multiSelectedTiles = computed(() => {
    const result = [];
    for (const key of selectedTileKeys.value) {
      const tile = tiles.value.get(key);
      if (tile) result.push(tile);
    }
    return result;
  });

  // Move multiple tiles by delta (preserves relative positions)
  // relationshipStore is passed in to avoid circular dependency
  function moveSelectedTiles(deltaCol, deltaRow, relationshipStore = null) {
    if (selectedTileKeys.value.size === 0) return false;

    const tilesToMove = [];
    const oldKeys = new Set();
    const keyMapping = new Map(); // oldKey -> newKey

    // Collect tiles to move and their new positions
    for (const key of selectedTileKeys.value) {
      const tile = tiles.value.get(key);
      if (tile) {
        const newCol = tile.col + deltaCol;
        const newRow = tile.row + deltaRow;
        tilesToMove.push({
          tile,
          oldKey: key,
          newCol,
          newRow,
          newKey: getTileKey(newCol, newRow),
        });
        oldKeys.add(key);
        keyMapping.set(key, getTileKey(newCol, newRow));
      }
    }

    // Check for collisions with non-selected tiles
    for (const { newKey } of tilesToMove) {
      if (tiles.value.has(newKey) && !oldKeys.has(newKey)) {
        // Collision detected, abort move
        return false;
      }
    }

    // Collect relationships that need to be updated
    const relationshipsToUpdate = [];
    if (relationshipStore) {
      for (const rel of relationshipStore.relationships.values()) {
        const sourceNeedsUpdate = keyMapping.has(rel.sourceTileKey);
        const targetNeedsUpdate = keyMapping.has(rel.targetTileKey);

        if (sourceNeedsUpdate || targetNeedsUpdate) {
          relationshipsToUpdate.push({
            oldSourceKey: rel.sourceTileKey,
            oldTargetKey: rel.targetTileKey,
            newSourceKey: sourceNeedsUpdate
              ? keyMapping.get(rel.sourceTileKey)
              : rel.sourceTileKey,
            newTargetKey: targetNeedsUpdate
              ? keyMapping.get(rel.targetTileKey)
              : rel.targetTileKey,
            edgeType: rel.edgeType,
            data: rel.data,
          });
        }
      }

      // Remove old relationships
      for (const relData of relationshipsToUpdate) {
        relationshipStore.deleteRelationship(
          relData.oldSourceKey,
          relData.oldTargetKey
        );
      }
    }

    // Remove tiles from old positions
    for (const { oldKey } of tilesToMove) {
      tiles.value.delete(oldKey);
    }

    // Clear and rebuild selection with new keys
    selectedTileKeys.value.clear();

    // Add tiles at new positions
    for (const { tile, newCol, newRow, newKey } of tilesToMove) {
      tile.col = newCol;
      tile.row = newRow;
      tile.id = newKey;
      tiles.value.set(newKey, tile);
      selectedTileKeys.value.add(newKey);
    }

    // Recreate relationships with updated keys
    if (relationshipStore) {
      for (const relData of relationshipsToUpdate) {
        const newRel = relationshipStore.createRelationship(
          relData.newSourceKey,
          relData.newTargetKey,
          relData.edgeType
        );
        if (newRel && relData.data) {
          Object.assign(newRel.data, relData.data);
        }
      }
    }

    return true;
  }

  // Check if a tile is hovered
  function isHovered(col, row) {
    return hoveredTileKey.value === getTileKey(col, row);
  }

  // Update tile data
  function updateTileData(col, row, data) {
    const tile = getTile(col, row);
    if (tile) {
      Object.assign(tile.data, data);
    }
  }

  // Delete a tile
  function deleteTile(col, row) {
    const key = getTileKey(col, row);
    if (selectedTileKey.value === key) {
      selectedTileKey.value = null;
    }
    selectedTileKeys.value.delete(key);
    tiles.value.delete(key);
  }

  /**
   * Delete all selected tiles and their relationships
   * @param {Object} relationshipStore - Relationship store to also delete relationships
   * @returns {number} - Number of tiles deleted
   */
  function deleteSelectedTiles(relationshipStore = null) {
    const keysToDelete = new Set(selectedTileKeys.value);

    // Also include the single selected tile if any
    if (selectedTileKey.value && !keysToDelete.has(selectedTileKey.value)) {
      keysToDelete.add(selectedTileKey.value);
    }

    if (keysToDelete.size === 0) return 0;

    // Delete relationships connected to these tiles
    if (relationshipStore) {
      for (const key of keysToDelete) {
        const { outgoing, incoming } =
          relationshipStore.getRelationshipsForTile(key);
        for (const rel of [...outgoing, ...incoming]) {
          relationshipStore.deleteRelationship(
            rel.sourceTileKey,
            rel.targetTileKey
          );
        }
      }
    }

    // Delete the tiles
    for (const key of keysToDelete) {
      tiles.value.delete(key);
    }

    // Clear selection
    selectedTileKey.value = null;
    selectedTileKeys.value.clear();

    return keysToDelete.size;
  }

  /**
   * Generate ARCHEON.arcon content from current tiles
   * Groups tiles by chainIndex (original chain) and generates versioned chain definitions
   * Preserves edge types (=>, ->, ~>) from relationships
   * @param {Object} relationshipStore - The relationship store for edge type lookup
   * @returns {string} - Generated arcon file content
   */
  function generateArconContent(relationshipStore = null) {
    // Group tiles by chainIndex (original chain, not current row position)
    const chainGroups = new Map();
    for (const tile of tiles.value.values()) {
      const chainIdx = tile.chainIndex ?? tile.row; // Fallback to row for old tiles
      if (!chainGroups.has(chainIdx)) {
        chainGroups.set(chainIdx, []);
      }
      chainGroups.get(chainIdx).push(tile);
    }

    // Edge type to symbol mapping
    const edgeSymbols = {
      FLOW: "=>",
      BRANCH: "->",
      REFERENCE: "~>",
    };

    // Sort chains and generate definitions
    const sortedChains = Array.from(chainGroups.keys()).sort((a, b) => a - b);
    const lines = [
      "# ARCHEON.arcon - Generated from Archeon GUI",
      "# Chain definitions: @version GLYPH:name => GLYPH:name => ...",
      "",
    ];

    for (const chainIdx of sortedChains) {
      const tilesInChain = chainGroups.get(chainIdx);
      // Sort tiles by column (left to right order in the chain)
      tilesInChain.sort((a, b) => a.col - b.col);

      // Get chain info from the original chain metadata
      const chain = chains.value.get(chainIdx);
      const version = chain?.version || `v${chainIdx + 1}`;

      // Build chain with proper edge types
      let chainParts = [];
      for (let i = 0; i < tilesInChain.length; i++) {
        const tile = tilesInChain[i];
        chainParts.push(tile.label);

        // Add connector if not the last tile
        if (i < tilesInChain.length - 1 && relationshipStore) {
          const nextTile = tilesInChain[i + 1];
          const sourceTileKey = getTileKey(tile.col, tile.row);
          const targetTileKey = getTileKey(nextTile.col, nextTile.row);

          // Get relationship and its edge type
          const relationship = relationshipStore.getRelationship(
            sourceTileKey,
            targetTileKey
          );
          const edgeType = relationship?.edgeType || "FLOW";
          const symbol = edgeSymbols[edgeType] || "=>";

          chainParts.push(` ${symbol} `);
        } else if (i < tilesInChain.length - 1) {
          // Default to flow if no relationship store
          chainParts.push(" => ");
        }
      }

      const chainDef = `@${version} ${chainParts.join("")}`;
      lines.push(chainDef);
    }

    return lines.join("\n") + "\n";
  }

  // Clear all tiles
  function clearTiles() {
    tiles.value.clear();
    chains.value.clear();
    selectedTileKey.value = null;
    hoveredTileKey.value = null;
  }

  /**
   * Save current tile positions and layout to localStorage
   * Uses label + chainIndex as key to handle duplicate labels across chains
   * @param {string} projectPath - Project root path (used as storage key)
   */
  function saveLayout(projectPath) {
    const storageKey = getLayoutStorageKey(projectPath);
    if (!storageKey) {
      console.warn("Cannot save layout: no project path");
      return false;
    }

    try {
      const layoutData = {
        version: LAYOUT_VERSION,
        savedAt: Date.now(),
        tiles: [],
      };

      // Save tile positions keyed by label + chainIndex (immutable chain identifier)
      for (const tile of tiles.value.values()) {
        layoutData.tiles.push({
          label: tile.label,
          chainIndex: tile.chainIndex, // Immutable: which chain this tile belongs to
          col: tile.col,
          row: tile.row,
        });
      }

      localStorage.setItem(storageKey, JSON.stringify(layoutData));
      console.log(
        `Layout saved for ${projectPath}: ${layoutData.tiles.length} tiles`
      );
      return true;
    } catch (err) {
      console.error("Failed to save layout:", err);
      return false;
    }
  }

  /**
   * Load and apply saved tile positions from localStorage
   * Uses label + chainIndex as key to handle duplicate labels across chains
   * @param {string} projectPath - Project root path (used as storage key)
   * @returns {boolean} - Whether layout was successfully loaded and applied
   */
  function loadLayout(projectPath) {
    const storageKey = getLayoutStorageKey(projectPath);
    if (!storageKey) return false;

    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return false;

      const layoutData = JSON.parse(stored);

      // Version check for future migrations
      if (layoutData.version !== LAYOUT_VERSION) {
        console.warn(
          `Layout version mismatch: expected ${LAYOUT_VERSION}, got ${layoutData.version}`
        );
        // For now, still try to apply - can add migration logic later
      }

      // Build a map of "label:chainIndex" -> saved position
      // This handles duplicate labels across different chains
      const savedPositions = new Map();
      for (const savedTile of layoutData.tiles) {
        // Use chainIndex if available, fall back to originalRow, then row (for backwards compat)
        const chainIdx =
          savedTile.chainIndex ?? savedTile.originalRow ?? savedTile.row;
        const key = `${savedTile.label}:${chainIdx}`;
        savedPositions.set(key, {
          col: savedTile.col,
          row: savedTile.row,
        });
      }

      // Apply saved positions to existing tiles
      // We need to move tiles to new positions, handling potential conflicts
      const tilesToMove = [];

      for (const [key, tile] of tiles.value) {
        // Use chainIndex (immutable) for lookup
        const lookupKey = `${tile.label}:${tile.chainIndex}`;
        const savedPos = savedPositions.get(lookupKey);
        if (
          savedPos &&
          (savedPos.col !== tile.col || savedPos.row !== tile.row)
        ) {
          tilesToMove.push({
            tile,
            oldKey: key,
            newCol: savedPos.col,
            newRow: savedPos.row,
            newKey: getTileKey(savedPos.col, savedPos.row),
          });
        }
      }

      if (tilesToMove.length === 0) {
        console.log("Layout loaded: no position changes needed");
        return true;
      }

      // Remove tiles from old positions
      for (const { oldKey } of tilesToMove) {
        tiles.value.delete(oldKey);
      }

      // Add tiles at new positions
      for (const { tile, newCol, newRow, newKey } of tilesToMove) {
        tile.col = newCol;
        tile.row = newRow;
        tile.id = newKey;
        tiles.value.set(newKey, tile);
      }

      console.log(
        `Layout loaded for ${projectPath}: ${tilesToMove.length} tiles repositioned`
      );
      return true;
    } catch (err) {
      console.error("Failed to load layout:", err);
      return false;
    }
  }

  /**
   * Clear saved layout for a project
   * @param {string} projectPath - Project root path
   */
  function clearSavedLayout(projectPath) {
    const storageKey = getLayoutStorageKey(projectPath);
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
  }

  // Get all tiles as array
  const allTiles = computed(() => Array.from(tiles.value.values()));

  // Get all chains as array
  const allChains = computed(() => Array.from(chains.value.values()));

  // Get tiles by state
  const pendingTiles = computed(() =>
    allTiles.value.filter((t) => t.state === GLYPH_STATES.PENDING)
  );

  const completeTiles = computed(() =>
    allTiles.value.filter((t) => t.state === GLYPH_STATES.COMPLETE)
  );

  // Initialize demo: Full-stack Login Flow (horizontal layout)
  function initLoginFlowDemo() {
    clearTiles();

    // All tiles on row 0, horizontal layout
    createGlyph(0, 0, "NED", "login", null);
    createGlyph(1, 0, "TSK", "submit", null);
    createGlyph(2, 0, "CMP", "LoginForm", null);
    createGlyph(3, 0, "STO", "Auth", null);
    createGlyph(4, 0, "API", "POST/auth/login", null);
    createGlyph(5, 0, "FNC", "validateCredentials", "auth");
    createGlyph(6, 0, "MDL", "verify", "user");
    createGlyph(7, 0, "OUT", "redirect('/dashboard')", null);
  }

  return {
    // State
    tiles,
    chains,
    selectedTileKey,
    selectedTileKeys,
    hoveredTileKey,
    undoStack,
    redoStack,

    // Computed
    selectedTile,
    allTiles,
    allChains,
    pendingTiles,
    completeTiles,
    multiSelectedTiles,
    canUndo,
    canRedo,

    // Methods
    getTileKey,
    parseTileKey,
    createGlyph,
    createTile,
    createChain,
    getTile,
    getChain,
    hasTile,
    selectTile,
    deselectTile,
    setHoveredTile,
    isSelected,
    isHovered,
    isChainActive,
    updateTileData,
    updateGlyphState,
    updateGlyphStateByLabel,
    updateChainActivation,
    deleteTile,
    deleteSelectedTiles,
    generateArconContent,
    clearTiles,
    initLoginFlowDemo,
    // Multi-selection
    addToSelection,
    removeFromSelection,
    clearMultiSelection,
    selectTilesInBounds,
    moveSelectedTiles,
    // Layout persistence
    saveLayout,
    loadLayout,
    clearSavedLayout,
    // Undo/Redo
    pushUndoState,
    undo,
    redo,
    clearHistory,
  };
});
