import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { GLYPH_TYPES, EDGE_TYPES } from "../types/glyphs.js";

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

  // Currently selected tile key
  const selectedTileKey = ref(null);

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
   * Update glyph state by label (glyph key like "STO:Auth")
   * @param {string} label - Glyph key
   * @param {string} state - New state
   * @param {Object} indexData - Optional data from index.json
   */
  function updateGlyphStateByLabel(label, state, indexData = null) {
    for (const [key, tile] of tiles.value) {
      if (tile.label === label) {
        tile.state = state;
        // Also update with index data if provided
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

  // Check if a tile is selected
  function isSelected(col, row) {
    return selectedTileKey.value === getTileKey(col, row);
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
    tiles.value.delete(key);
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
    hoveredTileKey,

    // Computed
    selectedTile,
    allTiles,
    allChains,
    pendingTiles,
    completeTiles,

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
    clearTiles,
    initLoginFlowDemo,
  };
});
