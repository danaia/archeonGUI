import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { GLYPH_TYPES } from "../types/glyphs.js";

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
   * Groups tiles by row (chain) and generates versioned chain definitions
   * @returns {string} - Generated arcon file content
   */
  function generateArconContent() {
    // Group tiles by row
    const rowGroups = new Map();
    for (const tile of tiles.value.values()) {
      if (!rowGroups.has(tile.row)) {
        rowGroups.set(tile.row, []);
      }
      rowGroups.get(tile.row).push(tile);
    }

    // Sort rows and generate chains
    const sortedRows = Array.from(rowGroups.keys()).sort((a, b) => a - b);
    const lines = [
      "# ARCHEON.arcon - Generated from Archeon GUI",
      "# Chain definitions: @version GLYPH:name => GLYPH:name => ...",
      "",
    ];

    for (const row of sortedRows) {
      const tilesInRow = rowGroups.get(row);
      // Sort tiles by column
      tilesInRow.sort((a, b) => a.col - b.col);

      // Get chain info
      const chain = chains.value.get(row);
      const version = chain?.version || `v${row + 1}`;

      // Generate glyph keys
      const glyphKeys = tilesInRow.map((tile) => tile.label);

      // Join with flow arrows
      const chainDef = `@${version} ${glyphKeys.join(" => ")}`;
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

    // Computed
    selectedTile,
    allTiles,
    allChains,
    pendingTiles,
    completeTiles,
    multiSelectedTiles,

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
  };
});
