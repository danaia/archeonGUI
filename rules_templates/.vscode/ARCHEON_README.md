# VS Code Configuration for Archeon

## Setup Complete ✓

The `settings.json` has been updated with:
1. File association: `*.arcon` → Markdown syntax highlighting
2. Search include: `archeon/` folder included in searches  
3. Copilot instructions: Reference knowledge graph and rules for code generation

## What This Enables

### Syntax Highlighting
- `.arcon` files get Markdown highlighting
- Makes chains easier to read

### Search Integration  
- `Ctrl/Cmd + Shift + F` includes archeon folder
- Find chains and glyphs across the project

### Copilot Integration
- Copilot Chat references the knowledge graph
- Better architecture-aware suggestions

## Key Files

- `archeon/ARCHEON.arcon` - Knowledge graph (chains)
- `archeon/ARCHEON.index.json` - Semantic index (glyph→file mapping)
- `archeon/templates/_config/ai-rules.md` - Complete AI rules

## More Info

- [VS Code Documentation](https://code.visualstudio.com/docs)
- [Archeon README](../README.md)
