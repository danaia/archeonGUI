// Archeon Glyph Type Definitions
// Based on https://github.com/danaia/archeon/wiki/Glyph-Reference

export const GLYPH_LAYERS = {
  META: "meta",
  VIEW: "view",
  FRONTEND: "frontend",
  BACKEND: "backend",
};

export const GLYPH_TYPES = {
  // Meta Layer (User Experience)
  NED: {
    id: "NED",
    name: "Need",
    layer: GLYPH_LAYERS.META,
    description: "User need or goal - always starts a chain",
    color: "#f59e0b", // amber
    bgColor: "#451a03",
    icon: "◉",
    rules: {
      mustBeFirst: true,
      canFlowTo: ["TSK", "CMP", "V"],
      cannotBeTerminal: true,
    },
  },
  TSK: {
    id: "TSK",
    name: "Task",
    layer: GLYPH_LAYERS.META,
    description: "Specific user action - bridges needs to implementation",
    color: "#f97316", // orange
    bgColor: "#431407",
    icon: "▸",
    rules: {
      canFlowFrom: ["NED", "CMP", "V"],
      canFlowTo: ["CMP", "STO", "API", "FNC"],
    },
  },
  OUT: {
    id: "OUT",
    name: "Outcome",
    layer: GLYPH_LAYERS.META,
    description: "Observable result - what the user sees/experiences",
    color: "#22c55e", // green
    bgColor: "#052e16",
    icon: "✓",
    rules: {
      mustBeTerminal: true,
      canFlowFrom: ["*"],
    },
  },
  ERR: {
    id: "ERR",
    name: "Error",
    layer: GLYPH_LAYERS.META,
    description: "Error state with user affordance",
    color: "#ef4444", // red
    bgColor: "#450a0a",
    icon: "✕",
    rules: {
      mustBeTerminal: true,
      canFlowFrom: ["API", "FNC", "MDL"],
    },
  },

  // View Layer (Structure)
  V: {
    id: "V",
    name: "View",
    layer: GLYPH_LAYERS.VIEW,
    description: "Structural component - layout, page, section",
    color: "#a855f7", // purple
    bgColor: "#2e1065",
    icon: "▢",
    rules: {
      canContain: ["CMP", "V"],
      canFlowFrom: ["NED", "OUT"],
    },
  },

  // Frontend Layer
  CMP: {
    id: "CMP",
    name: "Component",
    layer: GLYPH_LAYERS.FRONTEND,
    description: "Interactive UI component",
    color: "#3b82f6", // blue
    bgColor: "#172554",
    icon: "◧",
    rules: {
      canFlowFrom: ["NED", "TSK", "V"],
      canFlowTo: ["STO", "API", "FNC", "OUT"],
      canEmit: ["TSK"],
    },
  },
  STO: {
    id: "STO",
    name: "Store",
    layer: GLYPH_LAYERS.FRONTEND,
    description: "Client-side state management",
    color: "#06b6d4", // cyan
    bgColor: "#083344",
    icon: "◈",
    rules: {
      canFlowFrom: ["CMP", "API", "FNC"],
      canFlowTo: ["CMP", "API", "OUT"],
      bidirectional: ["CMP"],
    },
  },

  // Backend Layer
  FNC: {
    id: "FNC",
    name: "Function",
    layer: GLYPH_LAYERS.BACKEND,
    description: "Business logic function",
    color: "#8b5cf6", // violet
    bgColor: "#2e1065",
    icon: "ƒ",
    rules: {
      canFlowFrom: ["TSK", "CMP", "API", "MDL"],
      canFlowTo: ["OUT", "ERR", "FNC"],
    },
  },
  EVT: {
    id: "EVT",
    name: "Event",
    layer: GLYPH_LAYERS.BACKEND,
    description: "Event handler or pub/sub channel",
    color: "#ec4899", // pink
    bgColor: "#500724",
    icon: "⚡",
    rules: {
      canFlowFrom: ["API", "STO"],
      canFlowTo: ["CMP", "STO", "OUT"],
    },
  },
  API: {
    id: "API",
    name: "Endpoint",
    layer: GLYPH_LAYERS.BACKEND,
    description: "HTTP endpoint",
    color: "#14b8a6", // teal
    bgColor: "#042f2e",
    icon: "⇄",
    rules: {
      canFlowFrom: ["CMP", "STO", "TSK"],
      canFlowTo: ["MDL", "FNC", "STO", "OUT", "ERR"],
    },
  },
  MDL: {
    id: "MDL",
    name: "Model",
    layer: GLYPH_LAYERS.BACKEND,
    description: "Data model or database entity",
    color: "#64748b", // slate
    bgColor: "#1e293b",
    icon: "⬡",
    rules: {
      canFlowFrom: ["API", "FNC"],
      canFlowTo: ["OUT", "ERR", "STO"],
    },
  },
};

// Edge/Relationship Types
export const EDGE_TYPES = {
  FLOW: {
    id: "FLOW",
    symbol: "=>",
    displaySymbol: "→",
    name: "Flow",
    description: "Data flows from left to right (sequence)",
    color: "#6366f1",
  },
  BRANCH: {
    id: "BRANCH",
    symbol: "->",
    displaySymbol: "⤳",
    name: "Branch",
    description: "Alternative path on failure (error path)",
    color: "#ef4444",
  },
  REFERENCE: {
    id: "REFERENCE",
    symbol: "~>",
    displaySymbol: "⇢",
    name: "Reference",
    description: "Reactive or dependency relationship",
    color: "#a855f7",
  },
  CONTAINMENT: {
    id: "CONTAINMENT",
    symbol: "@",
    displaySymbol: "⊃",
    name: "Containment",
    description: "Parent contains children",
    color: "#22c55e",
  },
};

// Helper to get glyph type info
export function getGlyphType(typeId) {
  return GLYPH_TYPES[typeId] || null;
}

// Helper to get edge type info
export function getEdgeType(typeId) {
  return EDGE_TYPES[typeId] || null;
}

// Get layer color for background grouping
export function getLayerColor(layer) {
  const colors = {
    [GLYPH_LAYERS.META]: "#1c1917",
    [GLYPH_LAYERS.VIEW]: "#18181b",
    [GLYPH_LAYERS.FRONTEND]: "#172554",
    [GLYPH_LAYERS.BACKEND]: "#1e1b4b",
  };
  return colors[layer] || "#1a1a2e";
}
