import { computed } from 'vue';

/**
 * Data flow explanations based on source -> target glyph type combinations
 */
const DATA_FLOW_EXPLANATIONS = {
  // Need flows
  'NED->TSK': 'User need triggers a specific task',
  'NED->CMP': 'User need initiates component interaction',
  'NED->V': 'User need opens a view/page',
  
  // Task flows
  'TSK->CMP': 'Task triggers component action (click, submit, etc.)',
  'TSK->API': 'Task initiates API call directly',
  'TSK->FNC': 'Task executes business logic',
  
  // Component flows
  'CMP->STO': 'Component reads/writes state',
  'CMP->API': 'Component makes HTTP request',
  'CMP->FNC': 'Component calls business logic',
  'CMP->OUT': 'Component renders final outcome',
  
  // Store flows
  'STO->CMP': 'State change triggers component re-render',
  'STO->API': 'State change triggers API sync',
  
  // API flows
  'API->MDL': 'Endpoint queries/mutates database',
  'API->FNC': 'Endpoint calls server-side logic',
  'API->STO': 'API response updates client state',
  'API->OUT': 'API returns success response',
  'API->ERR': 'API returns error response',
  
  // Function flows
  'FNC->MDL': 'Function accesses data model',
  'FNC->OUT': 'Function returns success result',
  'FNC->ERR': 'Function throws/returns error',
  'FNC->FNC': 'Function calls another function',
  
  // Model flows
  'MDL->OUT': 'Data retrieved successfully',
  'MDL->ERR': 'Database error occurred',
  'MDL->STO': 'Model data syncs to client state',
};

/**
 * Pattern definitions for common edge type combinations
 */
const EDGE_PATTERNS = {
  'CMP->API': {
    name: 'Client-Server Communication',
    icon: '🌐',
    description: 'Frontend component making HTTP request to backend',
    considerations: [
      'Handle loading states',
      'Implement error handling',
      'Consider caching strategy',
      'Validate request data'
    ]
  },
  'API->MDL': {
    name: 'Data Access Layer',
    icon: '💾',
    description: 'API endpoint querying the database',
    considerations: [
      'Validate input parameters',
      'Handle database errors gracefully',
      'Consider query optimization',
      'Implement proper transactions'
    ]
  },
  'CMP->STO': {
    name: 'State Management',
    icon: '📦',
    description: 'Component interacting with global state',
    considerations: [
      'Keep state minimal and normalized',
      'Avoid redundant state updates',
      'Consider computed/derived state',
      'Handle async state carefully'
    ]
  },
  'STO->CMP': {
    name: 'Reactive Binding',
    icon: '🔄',
    description: 'State changes triggering component updates',
    considerations: [
      'Minimize unnecessary re-renders',
      'Use selectors for specific state slices',
      'Consider memoization',
      'Watch for circular updates'
    ]
  },
  'NED->TSK': {
    name: 'User Journey Start',
    icon: '🎯',
    description: 'User need being translated into actionable task',
    considerations: [
      'Clear user intent mapping',
      'Consider accessibility',
      'Provide feedback on action',
      'Handle edge cases'
    ]
  },
  'FNC->ERR': {
    name: 'Error Handling',
    icon: '⚠️',
    description: 'Function reporting error condition',
    considerations: [
      'Provide meaningful error messages',
      'Log errors for debugging',
      'Consider recovery options',
      'User-friendly error display'
    ]
  },
  'API->ERR': {
    name: 'API Error Response',
    icon: '❌',
    description: 'Endpoint returning error to client',
    considerations: [
      'Use appropriate HTTP status codes',
      'Include error details in response',
      'Sanitize error messages for security',
      'Client-side error handling'
    ]
  }
};

/**
 * Layer order for direction analysis
 */
const LAYER_ORDER = ['meta', 'view', 'frontend', 'backend'];

/**
 * Composable for edge/relationship analysis in the SideDrawer
 * @param {Object} options - Configuration options
 * @param {import('vue').Ref} options.sourceTile - Source tile ref
 * @param {import('vue').Ref} options.targetTile - Target tile ref
 * @param {import('vue').Ref} options.selectedRelationship - Selected relationship ref
 * @param {Object} options.tileStore - Tile store instance
 * @param {Object} options.relationshipStore - Relationship store instance
 */
export function useEdgeAnalysis({ sourceTile, targetTile, selectedRelationship, tileStore, relationshipStore }) {
  
  /**
   * Analyze layer transition between source and target tiles
   */
  const layerTransition = computed(() => {
    if (!sourceTile.value || !targetTile.value) return null;
    
    const sourceLayer = sourceTile.value.typeInfo?.layer;
    const targetLayer = targetTile.value.typeInfo?.layer;
    
    if (sourceLayer === targetLayer) {
      return { type: 'same', description: `Stays within ${sourceLayer} layer` };
    }
    
    const sourceIdx = LAYER_ORDER.indexOf(sourceLayer);
    const targetIdx = LAYER_ORDER.indexOf(targetLayer);
    
    if (targetIdx > sourceIdx) {
      return { 
        type: 'down', 
        description: `Descends from ${sourceLayer} → ${targetLayer}`,
        meaning: 'User intent flows down to implementation'
      };
    } else {
      return { 
        type: 'up', 
        description: `Ascends from ${sourceLayer} → ${targetLayer}`,
        meaning: 'Data/response flows back up to user'
      };
    }
  });

  /**
   * Get data flow explanation based on glyph types and edge type
   */
  const dataFlowExplanation = computed(() => {
    if (!sourceTile.value || !targetTile.value || !selectedRelationship.value) return null;
    
    const sourceType = sourceTile.value.glyphType;
    const targetType = targetTile.value.glyphType;
    const edgeType = selectedRelationship.value.edgeType;
    
    const key = `${sourceType}->${targetType}`;
    let explanation = DATA_FLOW_EXPLANATIONS[key];
    
    // Add edge type context
    if (edgeType === 'BRANCH') {
      explanation = explanation ? `[Error Path] ${explanation}` : 'Alternative path on failure';
    } else if (edgeType === 'REFERENCE') {
      explanation = explanation ? `[Reactive] ${explanation}` : 'Reactive dependency relationship';
    }
    
    return explanation || `${sourceType} connects to ${targetType}`;
  });

  /**
   * Recognize common patterns based on source/target glyph types
   */
  const patternInfo = computed(() => {
    if (!sourceTile.value || !targetTile.value) return null;
    
    const sourceType = sourceTile.value.glyphType;
    const targetType = targetTile.value.glyphType;
    
    return EDGE_PATTERNS[`${sourceType}->${targetType}`] || null;
  });

  /**
   * Get chain context - what comes before and after this edge
   */
  const chainContext = computed(() => {
    if (!sourceTile.value || !targetTile.value || !selectedRelationship.value) return null;
    
    const sourceKey = selectedRelationship.value.sourceTileKey;
    const targetKey = selectedRelationship.value.targetTileKey;
    
    // Get what flows INTO the source
    const sourceIncoming = relationshipStore.getRelationshipsForTile(sourceKey).incoming;
    const predecessors = sourceIncoming.map(rel => {
      const coords = tileStore.parseTileKey(rel.sourceTileKey);
      return tileStore.getTile(coords.col, coords.row);
    }).filter(Boolean);
    
    // Get what flows OUT OF the target
    const targetOutgoing = relationshipStore.getRelationshipsForTile(targetKey).outgoing;
    const successors = targetOutgoing.map(rel => {
      const coords = tileStore.parseTileKey(rel.targetTileKey);
      return tileStore.getTile(coords.col, coords.row);
    }).filter(Boolean);
    
    return { predecessors, successors };
  });

  return {
    layerTransition,
    dataFlowExplanation,
    patternInfo,
    chainContext,
  };
}

// Export constants for potential reuse
export { DATA_FLOW_EXPLANATIONS, EDGE_PATTERNS, LAYER_ORDER };
