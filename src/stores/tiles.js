import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { GLYPH_TYPES, EDGE_TYPES } from "../types/glyphs.js";

export const useTileStore = defineStore("tiles", () => {
  // Map of tiles: key is "col,row", value is tile data
  const tiles = ref(new Map());

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
    selectedTileKey.value = null;
    hoveredTileKey.value = null;
  }

  // Get all tiles as array
  const allTiles = computed(() => Array.from(tiles.value.values()));

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
    selectedTileKey,
    hoveredTileKey,

    // Computed
    selectedTile,
    allTiles,

    // Methods
    getTileKey,
    parseTileKey,
    createGlyph,
    createTile,
    getTile,
    hasTile,
    selectTile,
    deselectTile,
    setHoveredTile,
    isSelected,
    isHovered,
    updateTileData,
    deleteTile,
    clearTiles,
    initLoginFlowDemo,
  };
});
