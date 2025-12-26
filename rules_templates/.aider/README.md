# Aider Configuration for Archeon

## Setup Complete ✓

The `.aider.conf.yml` configures Aider to:
1. Auto-include `archeon/ARCHEON.arcon` in context
2. Auto-include `archeon/templates/_config/ai-rules.md` for rules
3. Include `.archeonrc` for project config
4. Disable auto-commits for review

## How It Works

When you run `aider`, it will:
- Automatically load the knowledge graph and rules
- If feature doesn't exist, ADD A NEW CHAIN first
- Then implement code following the chain
- Update the index with new glyphs and sections
- Wait for your approval before committing

## More Info

- [Aider Documentation](https://aider.chat)
- [Archeon README](../README.md)
