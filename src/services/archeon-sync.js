/**
 * Archeon Sync Service
 *
 * Transforms ARCHEON.index.json glyph data into tile format for the grid,
 * and parses ARCHEON.arcon chains into relationships.
 *
 * Layout: Horizontal left-to-right on a single row (row 0)
 */

import { useTileStore } from "../stores/tiles";
import { useRelationshipStore } from "../stores/relationships";
import { useProjectStore } from "../stores/project";
import { GLYPH_TYPES } from "../types/glyphs";

/**
 * Initialize archeon sync - set up IPC listeners
 */
export function initArcheonSync() {
  if (!window.electronAPI) {
    console.warn("Archeon sync: Not running in Electron");
    return;
  }

  const projectStore = useProjectStore();

  // Listen for index file changes
  window.electronAPI.onArcheonIndexChanged((data) => {
    projectStore.updateIndexData(data);
    if (data.success) {
      syncGlyphsToTiles(data.data);
    }
  });

  // Listen for arcon file changes
  window.electronAPI.onArcheonArconChanged((data) => {
    projectStore.updateArconData(data);
    if (data.success) {
      syncChainsToRelationships(data.chains);
    }
  });
}

/**
 * Sync glyphs from ARCHEON.index.json to tile store
 * Layout: Horizontal, one row, left to right based on chain order
 *
 * @param {Object} indexData - Parsed ARCHEON.index.json
 */
export function syncGlyphsToTiles(indexData) {
  const tileStore = useTileStore();
  const projectStore = useProjectStore();

  // Clear existing tiles
  tileStore.clearTiles();

  if (!indexData?.glyphs) return;

  const glyphs = indexData.glyphs;
  const glyphKeys = Object.keys(glyphs);

  // If we have chain data, order by chain sequence
  let orderedGlyphs = glyphKeys;

  if (projectStore.chains.length > 0) {
    // Build order from chain definitions
    const chainOrder = new Map();
    let position = 0;

    for (const chain of projectStore.chains) {
      if (chain.glyphs) {
        for (const glyph of chain.glyphs) {
          if (!chainOrder.has(glyph.key)) {
            chainOrder.set(glyph.key, position++);
          }
        }
      }
    }

    // Sort glyphs by chain order, put unknown ones at the end
    orderedGlyphs = glyphKeys.sort((a, b) => {
      const orderA = chainOrder.get(a) ?? 999;
      const orderB = chainOrder.get(b) ?? 999;
      return orderA - orderB;
    });
  }

  // Create tiles horizontally (row 0, incrementing columns)
  orderedGlyphs.forEach((glyphKey, index) => {
    const glyphData = glyphs[glyphKey];
    const [glyphType, glyphName] = parseGlyphKey(glyphKey);

    // Get glyph type info from our definitions
    const typeInfo = GLYPH_TYPES[glyphType] || GLYPH_TYPES.FNC;

    const tile = {
      col: index, // Horizontal layout
      row: 0, // Single row
      type: glyphType,
      name: glyphName,
      label: glyphKey,
      // Archeon-specific data
      file: glyphData.file,
      intent: glyphData.intent,
      chain: glyphData.chain,
      sections: glyphData.sections || [],
      // Visual styling from glyph type
      color: typeInfo.color,
      icon: typeInfo.icon,
      layer: typeInfo.layer,
    };

    tileStore.createTile(index, 0, tile);
  });
}

/**
 * Sync chains from ARCHEON.arcon to relationships
 *
 * @param {Array} chains - Parsed chain definitions
 */
export function syncChainsToRelationships(chains) {
  const relationshipStore = useRelationshipStore();
  const tileStore = useTileStore();

  // Clear existing relationships
  relationshipStore.clearRelationships();

  if (!chains || chains.length === 0) return;

  // Build a map of glyph keys to tile positions
  const glyphToTile = new Map();
  for (const [key, tile] of tileStore.tiles) {
    glyphToTile.set(tile.label, key);
  }

  // Process each chain
  for (const chain of chains) {
    if (!chain.glyphs || chain.glyphs.length < 2) continue;

    // Create relationships between consecutive glyphs
    for (let i = 0; i < chain.glyphs.length - 1; i++) {
      const sourceGlyph = chain.glyphs[i];
      const targetGlyph = chain.glyphs[i + 1];

      const sourceTileKey = glyphToTile.get(sourceGlyph.key);
      const targetTileKey = glyphToTile.get(targetGlyph.key);

      if (sourceTileKey && targetTileKey) {
        // Determine edge type from the raw chain (look for ->, ~>, =>)
        let edgeType = "FLOW"; // Default

        if (chain.raw) {
          // Check what edge comes after this glyph
          const edgeMatch = chain.raw.match(
            new RegExp(`${escapeRegExp(sourceGlyph.key)}\\s*(=>|~>|->)`)
          );
          if (edgeMatch) {
            const edgeSymbol = edgeMatch[1];
            if (edgeSymbol === "->") edgeType = "BRANCH";
            else if (edgeSymbol === "~>") edgeType = "REACTIVE";
          }
        }

        relationshipStore.createRelationship(
          sourceTileKey,
          targetTileKey,
          edgeType
        );
      }
    }
  }
}

/**
 * Parse a glyph key like "CMP:LoginForm" into [type, name]
 *
 * @param {string} key - Glyph key
 * @returns {[string, string]} - [type, name]
 */
function parseGlyphKey(key) {
  const match = key.match(/^(\w+):(.+)$/);
  if (match) {
    return [match[1], match[2]];
  }
  return ["FNC", key]; // Default to function type
}

/**
 * Escape special regex characters
 *
 * @param {string} string - String to escape
 * @returns {string} - Escaped string
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Force reload from project files
 */
export async function reloadFromProject() {
  const projectStore = useProjectStore();

  if (!projectStore.projectPath || !window.electronAPI) return;

  // Re-read index file
  const indexResult = await window.electronAPI.archeonReadIndex(
    projectStore.projectPath
  );
  if (indexResult.success) {
    projectStore.updateIndexData(indexResult);
    syncGlyphsToTiles(indexResult.data);
  }

  // Re-read arcon file
  const arconResult = await window.electronAPI.archeonReadArcon(
    projectStore.projectPath
  );
  if (arconResult.success) {
    projectStore.updateArconData(arconResult);
    syncChainsToRelationships(arconResult.chains);
  }
}
