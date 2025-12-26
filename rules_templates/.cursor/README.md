# Cursor Configuration for Archeon

## Setup Complete ✓

The `.cursorrules` file in your project root tells Cursor to:
1. Always read `archeon/ARCHEON.arcon` before generating code
2. Write new chains to the knowledge graph for new features
3. Respect the glyph-based architecture
4. Update `archeon/ARCHEON.index.json` when creating files or sections
5. **Run `arc validate` after every code change**

## The Glyph-Code-Test Workflow

Every feature follows this mandatory workflow:

```
1. ADD GLYPH    → Write chain to ARCHEON.arcon
2. WRITE CODE   → Implement each glyph (with headers + sections)
3. UPDATE INDEX → Add glyphs/sections to ARCHEON.index.json
4. RUN VALIDATE → arc validate (REQUIRED)
5. RUN TESTS    → npm test / pytest
```

## More Info

- [Cursor Documentation](https://cursor.sh/docs)
- [Archeon README](../README.md)
