import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { EDGE_TYPES } from "../types/glyphs.js";
import { useTileStore } from "./tiles.js";

// localStorage key prefix for edge persistence
const EDGES_STORAGE_PREFIX = "archeon:edges:";
const EDGES_VERSION = 1;

/**
 * Get storage key for edges for a project path
 * @param {string} projectPath - Project root path
 * @returns {string} - localStorage key
 */
function getEdgesStorageKey(projectPath) {
  if (!projectPath) return null;
  return EDGES_STORAGE_PREFIX + btoa(projectPath);
}

export const useRelationshipStore = defineStore("relationships", () => {
  // Map of relationships: key is "source->target", value is relationship data
  const relationships = ref(new Map());

  // Currently selected relationship key
  const selectedRelationshipKey = ref(null);

  // Currently hovered relationship key
  const hoveredRelationshipKey = ref(null);

  // Generate a relationship key from tile keys
  function getRelationshipKey(sourceTileKey, targetTileKey) {
    return `${sourceTileKey}->${targetTileKey}`;
  }

  // Parse relationship key to tile keys
  function parseRelationshipKey(key) {
    const [source, target] = key.split("->");
    return { source, target };
  }

  // Create a relationship between two tiles
  function createRelationship(sourceTileKey, targetTileKey, edgeType = "FLOW") {
    const key = getRelationshipKey(sourceTileKey, targetTileKey);
    const edgeInfo = EDGE_TYPES[edgeType];

    if (!edgeInfo) {
      console.warn(`Unknown edge type: ${edgeType}`);
      edgeType = "FLOW";
    }

    const relationship = {
      id: key,
      sourceTileKey,
      targetTileKey,
      edgeType,
      edgeInfo: EDGE_TYPES[edgeType],
      data: {},
      createdAt: Date.now(),
    };

    relationships.value.set(key, relationship);
    return relationship;
  }

  // Get relationship
  function getRelationship(sourceTileKey, targetTileKey) {
    return (
      relationships.value.get(
        getRelationshipKey(sourceTileKey, targetTileKey)
      ) || null
    );
  }

  // Check if relationship exists
  function hasRelationship(sourceTileKey, targetTileKey) {
    return relationships.value.has(
      getRelationshipKey(sourceTileKey, targetTileKey)
    );
  }

  // Select a relationship
  function selectRelationship(sourceTileKey, targetTileKey) {
    const key = getRelationshipKey(sourceTileKey, targetTileKey);
    if (relationships.value.has(key)) {
      selectedRelationshipKey.value = key;
      return true;
    }
    return false;
  }

  // Deselect current relationship
  function deselectRelationship() {
    selectedRelationshipKey.value = null;
  }

  // Set hovered relationship
  function setHoveredRelationship(sourceTileKey, targetTileKey) {
    if (sourceTileKey === null || targetTileKey === null) {
      hoveredRelationshipKey.value = null;
    } else {
      const key = getRelationshipKey(sourceTileKey, targetTileKey);
      if (relationships.value.has(key)) {
        hoveredRelationshipKey.value = key;
      } else {
        hoveredRelationshipKey.value = null;
      }
    }
  }

  // Get selected relationship data
  const selectedRelationship = computed(() => {
    if (!selectedRelationshipKey.value) return null;
    return relationships.value.get(selectedRelationshipKey.value) || null;
  });

  // Check if a relationship is selected
  function isSelected(sourceTileKey, targetTileKey) {
    return (
      selectedRelationshipKey.value ===
      getRelationshipKey(sourceTileKey, targetTileKey)
    );
  }

  // Check if a relationship is hovered
  function isHovered(sourceTileKey, targetTileKey) {
    return (
      hoveredRelationshipKey.value ===
      getRelationshipKey(sourceTileKey, targetTileKey)
    );
  }

  // Delete a relationship
  function deleteRelationship(sourceTileKey, targetTileKey) {
    const key = getRelationshipKey(sourceTileKey, targetTileKey);
    if (selectedRelationshipKey.value === key) {
      selectedRelationshipKey.value = null;
    }
    relationships.value.delete(key);
  }

  // Delete all relationships involving a tile
  function deleteRelationshipsForTile(tileKey) {
    const toDelete = [];
    for (const [key, rel] of relationships.value) {
      if (rel.sourceTileKey === tileKey || rel.targetTileKey === tileKey) {
        toDelete.push(key);
      }
    }
    toDelete.forEach((key) => relationships.value.delete(key));
  }

  // Clear all relationships
  function clearRelationships() {
    relationships.value.clear();
    selectedRelationshipKey.value = null;
    hoveredRelationshipKey.value = null;
  }

  // Get all relationships as array
  const allRelationships = computed(() =>
    Array.from(relationships.value.values())
  );

  // Get relationships for a specific tile (as source or target)
  function getRelationshipsForTile(tileKey) {
    const result = { outgoing: [], incoming: [] };
    for (const rel of relationships.value.values()) {
      if (rel.sourceTileKey === tileKey) {
        result.outgoing.push(rel);
      }
      if (rel.targetTileKey === tileKey) {
        result.incoming.push(rel);
      }
    }
    return result;
  }

  /**
   * Save current edge data to localStorage
   * Edges are stored by source/target tile labels (not grid keys) for persistence
   * @param {string} projectPath - Project root path
   * @param {Object} tileStore - Tile store for label lookups
   */
  function saveEdges(projectPath, tileStore) {
    const storageKey = getEdgesStorageKey(projectPath);
    if (!storageKey) {
      console.warn("Cannot save edges: no project path");
      return false;
    }

    try {
      const edgesData = {
        version: EDGES_VERSION,
        savedAt: Date.now(),
        edges: [],
      };

      // Save edges using tile labels instead of grid keys
      for (const rel of relationships.value.values()) {
        // Get source and target tiles to extract labels
        const sourceCoords = parseRelationshipKeyToCoords(rel.sourceTileKey);
        const targetCoords = parseRelationshipKeyToCoords(rel.targetTileKey);

        const sourceTile = tileStore.getTile(
          sourceCoords.col,
          sourceCoords.row
        );
        const targetTile = tileStore.getTile(
          targetCoords.col,
          targetCoords.row
        );

        if (sourceTile && targetTile) {
          edgesData.edges.push({
            sourceLabel: sourceTile.label,
            targetLabel: targetTile.label,
            edgeType: rel.edgeType,
          });
        }
      }

      localStorage.setItem(storageKey, JSON.stringify(edgesData));
      console.log(
        `Edges saved for ${projectPath}: ${edgesData.edges.length} edges`
      );
      return true;
    } catch (err) {
      console.error("Failed to save edges:", err);
      return false;
    }
  }

  /**
   * Load and apply saved edge data from localStorage
   * @param {string} projectPath - Project root path
   * @param {Object} tileStore - Tile store for tile lookups
   * @returns {boolean} - Whether edges were successfully loaded
   */
  function loadEdges(projectPath, tileStore) {
    const storageKey = getEdgesStorageKey(projectPath);
    if (!storageKey) return false;

    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return false;

      const edgesData = JSON.parse(stored);

      // Version check
      if (edgesData.version !== EDGES_VERSION) {
        console.warn(
          `Edges version mismatch: expected ${EDGES_VERSION}, got ${edgesData.version}`
        );
      }

      // Build a map of label -> tile key for current tiles
      const labelToKey = new Map();
      for (const tile of tileStore.allTiles) {
        labelToKey.set(tile.label, tileStore.getTileKey(tile.col, tile.row));
      }

      // Clear existing relationships and recreate from saved data
      clearRelationships();

      let loadedCount = 0;
      for (const savedEdge of edgesData.edges) {
        const sourceKey = labelToKey.get(savedEdge.sourceLabel);
        const targetKey = labelToKey.get(savedEdge.targetLabel);

        if (sourceKey && targetKey) {
          createRelationship(sourceKey, targetKey, savedEdge.edgeType);
          loadedCount++;
        } else {
          console.warn(
            `Could not restore edge: ${savedEdge.sourceLabel} -> ${savedEdge.targetLabel}`
          );
        }
      }

      console.log(`Edges loaded for ${projectPath}: ${loadedCount} edges`);
      return true;
    } catch (err) {
      console.error("Failed to load edges:", err);
      return false;
    }
  }

  /**
   * Clear saved edges for a project
   * @param {string} projectPath - Project root path
   */
  function clearSavedEdges(projectPath) {
    const storageKey = getEdgesStorageKey(projectPath);
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
  }

  /**
   * Rebuild all edges based on current tile positions and chain data.
   * This should be called after undo/redo to reconnect edges to moved tiles.
   * Uses the stored edge definitions from chain metadata.
   */
  function rebuildEdges() {
    const tileStore = useTileStore();

    // Clear all existing relationships
    clearRelationships();

    // Group tiles by chainIndex (original chain membership)
    const chainTiles = new Map();
    for (const tile of tileStore.allTiles) {
      const chainIdx = tile.chainIndex;
      if (!chainTiles.has(chainIdx)) {
        chainTiles.set(chainIdx, []);
      }
      chainTiles.get(chainIdx).push(tile);
    }

    // Get chain data from the tiles store
    const chainsData = tileStore.chains;

    // For each chain, create edges using stored edge definitions
    for (const [chainIdx, tilesInChain] of chainTiles) {
      const chainData = chainsData.get(chainIdx);
      if (!chainData || !chainData.edges || chainData.edges.length === 0) {
        continue;
      }

      // Build a map from label to tile for this chain
      const labelToTile = new Map();
      for (const tile of tilesInChain) {
        labelToTile.set(tile.label, tile);
      }

      // Create edges using stored edge definitions
      for (const edge of chainData.edges) {
        const sourceTile = labelToTile.get(edge.sourceLabel);
        const targetTile = labelToTile.get(edge.targetLabel);

        if (sourceTile && targetTile) {
          const sourceKey = tileStore.getTileKey(
            sourceTile.col,
            sourceTile.row
          );
          const targetKey = tileStore.getTileKey(
            targetTile.col,
            targetTile.row
          );
          createRelationship(sourceKey, targetKey, edge.edgeType);
        }
      }
    }
  }

  /**
   * Parse a tile key like "0,1" to coordinates
   * @param {string} key - Tile key
   * @returns {{col: number, row: number}}
   */
  function parseRelationshipKeyToCoords(key) {
    const [col, row] = key.split(",").map(Number);
    return { col, row };
  }

  // Initialize demo relationships for login flow (horizontal layout)
  function initLoginFlowRelationships() {
    clearRelationships();

    // Main flow: horizontal, row 0
    // NED -> TSK -> CMP -> STO -> API -> FNC -> MDL -> OUT
    createRelationship("0,0", "1,0", "FLOW"); // NED:login => TSK:submit
    createRelationship("1,0", "2,0", "FLOW"); // TSK:submit => CMP:LoginForm
    createRelationship("2,0", "3,0", "FLOW"); // CMP:LoginForm => STO:Auth
    createRelationship("3,0", "4,0", "FLOW"); // STO:Auth => API:POST/auth/login
    createRelationship("4,0", "5,0", "FLOW"); // API => FNC:auth.validateCredentials
    createRelationship("5,0", "6,0", "FLOW"); // FNC => MDL:user.verify
    createRelationship("6,0", "7,0", "FLOW"); // MDL => OUT:redirect
  }

  return {
    // State
    relationships,
    selectedRelationshipKey,
    hoveredRelationshipKey,

    // Computed
    selectedRelationship,
    allRelationships,

    // Methods
    getRelationshipKey,
    parseRelationshipKey,
    createRelationship,
    getRelationship,
    hasRelationship,
    selectRelationship,
    deselectRelationship,
    setHoveredRelationship,
    isSelected,
    isHovered,
    deleteRelationship,
    deleteRelationshipsForTile,
    clearRelationships,
    getRelationshipsForTile,
    initLoginFlowRelationships,
    // Edge persistence
    saveEdges,
    loadEdges,
    clearSavedEdges,
    // Edge rebuilding (for undo/redo)
    rebuildEdges,
  };
});
