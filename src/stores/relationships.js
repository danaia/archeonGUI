import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { EDGE_TYPES } from "../types/glyphs.js";
import { useTileStore } from "./tiles.js";

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
  };
});
