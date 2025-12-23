/**
 * Archeon Sync Service
 *
 * File-Driven Execution Model:
 * - ARCHEON.arcon = what SHOULD exist (structure, chains, glyphs)
 * - ARCHEON.index.json = what ACTUALLY exists (confirmed, with file paths)
 *
 * Layout: Each chain is a row, glyphs flow left-to-right starting with NED
 */

import { useTileStore, GLYPH_STATES } from "../stores/tiles";
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

  // Listen for index file changes - this CONFIRMS glyph completion
  window.electronAPI.onArcheonIndexChanged((data) => {
    projectStore.updateIndexData(data);
    if (data.success) {
      // Index changes confirm which glyphs are complete
      confirmGlyphsFromIndex(data.data);
    }
  });

  // Listen for arcon file changes - this DEFINES structure
  window.electronAPI.onArcheonArconChanged((data) => {
    projectStore.updateArconData(data);
    if (data.success) {
      // Arcon changes define the structure (pending glyphs)
      syncChainsToTiles(data.chains);
      // Then check index for any already-confirmed glyphs
      if (projectStore.indexData) {
        confirmGlyphsFromIndex(projectStore.indexData);
      }
    }
  });
}

/**
 * Sync chains from ARCHEON.arcon to tiles and relationships
 * Each chain becomes a row. Glyphs flow left-to-right starting with NED.
 * All glyphs start in PENDING state.
 *
 * @param {Array} chains - Parsed chain definitions from arcon
 */
export function syncChainsToTiles(chains) {
  const tileStore = useTileStore();
  const relationshipStore = useRelationshipStore();

  // Clear existing state
  tileStore.clearTiles();
  relationshipStore.clearRelationships();

  if (!chains || chains.length === 0) return;

  // Filter to only versioned chains (the actual glyph chains with @v prefix)
  const glyphChains = chains.filter(
    (c) => c.version && c.glyphs && c.glyphs.length > 0
  );

  // Create tiles for each chain (each chain = 1 row)
  glyphChains.forEach((chain, rowIndex) => {
    const glyphs = chain.glyphs;

    // Create chain metadata
    tileStore.createChain(rowIndex, {
      version: chain.version,
      raw: chain.raw,
      glyphCount: glyphs.length,
    });

    // Create tiles for each glyph in the chain (left to right)
    glyphs.forEach((glyph, colIndex) => {
      const [glyphType, glyphName] = parseGlyphKey(glyph.key);
      const typeInfo = GLYPH_TYPES[glyphType] || GLYPH_TYPES.FNC;

      const tile = {
        col: colIndex,
        row: rowIndex,
        type: glyphType,
        name: glyphName,
        label: glyph.key,
        // Start in PENDING state - waiting for index confirmation
        state: GLYPH_STATES.PENDING,
        // Visual styling from glyph type
        color: typeInfo.color,
        icon: typeInfo.icon,
        layer: typeInfo.layer,
        // These will be populated from index.json when confirmed
        file: null,
        intent: null,
        sections: [],
        chain: chain.version,
      };

      tileStore.createTile(colIndex, rowIndex, tile);
    });

    // Create relationships between consecutive glyphs in the chain
    for (let i = 0; i < glyphs.length - 1; i++) {
      const sourceGlyph = glyphs[i];
      const targetGlyph = glyphs[i + 1];
      const sourceKey = tileStore.getTileKey(i, rowIndex);
      const targetKey = tileStore.getTileKey(i + 1, rowIndex);

      // Determine edge type from the raw chain
      let edgeType = "FLOW";
      if (chain.raw) {
        const edgeMatch = chain.raw.match(
          new RegExp(`${escapeRegExp(sourceGlyph.key)}\\s*(=>|~>|->)`)
        );
        if (edgeMatch) {
          const edgeSymbol = edgeMatch[1];
          if (edgeSymbol === "->") edgeType = "BRANCH";
          else if (edgeSymbol === "~>") edgeType = "REACTIVE";
        }
      }

      relationshipStore.createRelationship(sourceKey, targetKey, edgeType);
    }
  });
}

/**
 * Confirm glyphs from ARCHEON.index.json
 * This transitions glyphs from PENDING to COMPLETE state.
 *
 * @param {Object} indexData - Parsed ARCHEON.index.json
 */
export function confirmGlyphsFromIndex(indexData) {
  const tileStore = useTileStore();

  if (!indexData?.glyphs) return;

  const confirmedGlyphs = indexData.glyphs;

  // For each glyph in the index, find and update the corresponding tile
  for (const [glyphKey, glyphData] of Object.entries(confirmedGlyphs)) {
    const tile = tileStore.updateGlyphStateByLabel(
      glyphKey,
      GLYPH_STATES.COMPLETE,
      {
        file: glyphData.file,
        intent: glyphData.intent,
        sections: glyphData.sections,
      }
    );

    if (tile) {
      // Update chain activation status for this row
      tileStore.updateChainActivation(tile.row);
    }
  }
}

/**
 * Legacy sync function - maintained for compatibility
 * @deprecated Use syncChainsToTiles + confirmGlyphsFromIndex instead
 */
export function syncGlyphsToTiles(indexData) {
  // If we have arcon data, use the new flow
  const projectStore = useProjectStore();
  if (projectStore.chains.length > 0) {
    confirmGlyphsFromIndex(indexData);
    return;
  }

  // Fallback: create tiles directly from index (old behavior)
  const tileStore = useTileStore();
  tileStore.clearTiles();

  if (!indexData?.glyphs) return;

  Object.entries(indexData.glyphs).forEach(([glyphKey, glyphData], index) => {
    const [glyphType, glyphName] = parseGlyphKey(glyphKey);
    const typeInfo = GLYPH_TYPES[glyphType] || GLYPH_TYPES.FNC;

    const tile = {
      col: index,
      row: 0,
      type: glyphType,
      name: glyphName,
      label: glyphKey,
      file: glyphData.file,
      intent: glyphData.intent,
      chain: glyphData.chain,
      sections: glyphData.sections || [],
      state: GLYPH_STATES.COMPLETE, // Direct from index = complete
      color: typeInfo.color,
      icon: typeInfo.icon,
      layer: typeInfo.layer,
    };

    tileStore.createTile(index, 0, tile);
  });
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

  // Re-read arcon file FIRST (defines structure)
  const arconResult = await window.electronAPI.archeonReadArcon(
    projectStore.projectPath
  );
  if (arconResult.success) {
    projectStore.updateArconData(arconResult);
    syncChainsToTiles(arconResult.chains);
  }

  // Then re-read index file (confirms completion)
  const indexResult = await window.electronAPI.archeonReadIndex(
    projectStore.projectPath
  );
  if (indexResult.success) {
    projectStore.updateIndexData(indexResult);
    confirmGlyphsFromIndex(indexResult.data);
  }
}
