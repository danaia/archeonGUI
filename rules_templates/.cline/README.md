# Cline / Claude Dev Configuration for Archeon

## Setup Complete ✓

The `.clinerules` file tells Cline (Claude Dev) to:
1. Read `archeon/ARCHEON.arcon` as first action
2. Write new chains when features don't exist
3. Add @archeon:file headers and @archeon:section markers to all files
4. Update `archeon/ARCHEON.index.json` when creating files or sections
5. Follow glyph-based architecture constraints

## How It Works

Cline reads `.clinerules` for project-specific instructions.
Before any code task, it will:
- Check the knowledge graph for existing chains
- If feature doesn't exist, ADD A NEW CHAIN first
- Then implement following the chain
- Update the index with new glyphs and sections

## More Info

- [Cline Extension](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev)
- [Archeon README](../README.md)
