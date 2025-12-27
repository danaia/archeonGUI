# ArcheonGUI

**Electron desktop application for visualizing and interacting with Archeon architecture graphs.**

ArcheonGUI is a real-time, interactive grid-based viewer for [Archeon](https://github.com/danaia/archeon) projects. It watches your `archeon/` directory for changes and instantly updates the visual graph as you define chains, glyphs, and relationships.

## Features

- **Real Terminal** — Embedded zsh terminal to run `arc` commands directly
- **Live File Watching** — Auto-syncs when `ARCHEON.index.json` or `ARCHEON.arcon` changes
- **Visual Grid** — Glyphs rendered as tiles with relationships shown as edges
- **Monaco Code Viewer** — Click any glyph to view source code with syntax highlighting
- **Project-Based** — Open any folder with an `archeon/` directory

## Prerequisites

- **Node.js** 20.18+ (20.19+ recommended for Vite)
- **npm** or **yarn**
- **Archeon CLI** installed (required for project scaffolding and glyph management)

### Installing Archeon CLI

The Archeon CLI is a powerful project architect that uses "shapes" (architectural templates) to scaffold consistent project structures. Install it using one of these methods:

**Option A: Using pipx (recommended for isolated installation)**

```bash
pipx install git+https://github.com/danaia/archeon.git
```

**Option B: Using pip**

```bash
pip install git+https://github.com/danaia/archeon.git
```

**Why Archeon CLI is Essential:**
Archeon CLI provides project "shapes" - pre-configured architectural templates that ensure consistent patterns across your entire codebase. Instead of starting from scratch, you get battle-tested structures like:

- `vue3-fastapi` - Full-stack Vue 3 + FastAPI architecture with standardized folder structure and API patterns
- `react-node` - React frontend with Node.js backend, configured for seamless team collaboration
- **Custom team shapes** - Define your organization's coding standards, file naming conventions, and architectural patterns in a single JSON configuration file that can be:
  - Version controlled and shared across teams

These shapes prevent architectural drift, reduce decision fatigue, and give AI assistants clear constraints to follow. Most importantly, they ensure every team member starts with the same proven architecture, making code reviews faster and onboarding smoother. The CLI generates both your project structure and the knowledge graph (`.arcon` files) that ArcheonGUI visualizes.

## Installation

```bash
# Clone the repository
git clone https://github.com/danaia/archeonGUI.git
cd archeonGUI

# Install dependencies
npm install

# Rebuild native modules for Electron
npm run rebuild
```

## Development

```bash
# Start the Electron app in dev mode with hot-reload
npm run dev
```

The Electron window will open automatically. Hot-reload is enabled for both renderer and main process.

## Usage

### 1. Open a Project

Click **"Open Project"** (or press `⌘O` / `Ctrl+O`) and select a folder containing an `archeon/` directory with:

- `archeon/ARCHEON.index.json`
- `archeon/ARCHEON.arcon`

### 2. View the Grid

Glyphs from your `ARCHEON.index.json` will appear as tiles on the grid:

- **Each chain** gets its own row (e.g., `@v1`, `@v2`)
- **Glyphs** are laid out left-to-right in chain order
- **Relationships** are shown as connecting lines between tiles
- **Shape consistency** - All tiles follow the architectural patterns defined by your project's shape

### 3. Use the Terminal for Archeon Commands

Press **backtick** (`` ` ``) to open the embedded terminal and leverage Archeon's powerful project scaffolding:

```bash
# Navigate to your project
cd ~/projects/my-app

# Initialize with architectural shape (creates consistent structure)
arc init --arch vue3-fastapi

# Or initialize with specific IDE integration
arc init --arch vue3-fastapi --cursor  # Adds Cursor AI rules
arc init --arch vue3-fastapi --copilot # Adds GitHub Copilot rules

# Parse new chains using glyph notation
arc parse "@v1 NED:feature => CMP:Feature => API:POST/feature => OUT:success"

# Generate code from your architectural graph
arc gen

# Set up AI assistant rules for your IDE
arc ai-setup

# The grid updates automatically as you build!
```

**Pro Tip:** The `arc init` command uses "shapes" - architectural templates that scaffold your entire project with consistent patterns. This ensures your ArcheonGUI visualization reflects a well-structured, predictable architecture that AI assistants can understand and extend reliably.

### 4. Inspect Glyphs

Click any tile to open the **Side Drawer** showing:

- Glyph metadata (intent, chain version, sections)
- File path
- Live source code preview (Monaco editor)
- Incoming/outgoing relationships

### 5. Navigation

- **Pan**: Spacebar + drag, or middle-mouse drag
- **Zoom**: Mouse wheel
- **Select**: Click tile or relationship
- **Close drawer**: `Esc` or close button

## Grid Layout

- **Rows**: Each `@v1`, `@v2`, etc. chain gets its own row
- **Columns**: Glyphs ordered left-to-right as defined in `.arcon`
- **Missing Glyphs**: If a glyph appears in `.arcon` but not in `ARCHEON.index.json`, it won't render (run `arc gen` to regenerate)

## Project Structure

```
archeonGUI/
├── electron/               # Electron main process
│   ├── main.js            # Main window & IPC setup
│   ├── preload.js         # Context bridge (secure IPC)
│   ├── pty-manager.js     # Real terminal (node-pty)
│   └── archeon-watcher.js # File watcher (chokidar)
├── src/
│   ├── components/        # Vue components
│   │   ├── InfiniteCanvas.vue
│   │   ├── SideDrawer.vue
│   │   └── FloatingTerminal.vue
│   ├── stores/            # Pinia state management
│   │   ├── canvas.js
│   │   ├── tiles.js
│   │   ├── relationships.js
│   │   ├── project.js
│   │   └── terminal.js
│   ├── services/
│   │   └── archeon-sync.js  # Sync logic (index → tiles)
│   └── types/
│       └── glyphs.js      # Glyph/edge type definitions
├── package.json
└── vite.config.js         # Vite + Electron config
```

## Building

```bash
# Build for production
npm run build

# Output will be in dist/ and dist-electron/
```

For distribution packages (`.dmg`, `.exe`, `.AppImage`), configure `electron-builder` in `package.json`.

## Troubleshooting

### "ARCHEON.index.json not found"

Your project needs an `archeon/` directory with archeon files. Create one using the CLI's shape system:

```bash
cd your-project
# Use a shape for consistent architecture
arc init --arch vue3-fastapi
# Or for React projects:
# arc init --arch react-node

# Parse your first chain
arc parse "@v1 NED:example => CMP:Example => OUT:display"
# Generate the code
arc gen
```

### Terminal not working

Ensure `node-pty` is rebuilt for Electron:

```bash
npm run rebuild
```

### Glyphs not showing

1. Check that glyphs exist in both `ARCHEON.index.json` and `ARCHEON.arcon`
2. Verify the project path is correct
3. Check the terminal for errors (`` ` `` to open)

## Keyboard Shortcuts

| Key             | Action            |
| --------------- | ----------------- |
| `` ` ``         | Toggle terminal   |
| `⌘O` / `Ctrl+O` | Open project      |
| `Esc`           | Close side drawer |
| `Space + Drag`  | Pan canvas        |
| `Scroll`        | Zoom in/out       |

## Tech Stack

- **Electron** — Desktop app framework
- **Vue 3** — Reactive UI framework
- **Pinia** — State management
- **Vite** — Build tool & dev server
- **xterm.js** — Terminal emulator
- **node-pty** — Real shell processes
- **Monaco Editor** — Code viewer (VS Code editor)
- **chokidar** — File watcher
- **TailwindCSS** — Styling

## License

MIT

## Related

- [Archeon CLI](https://github.com/danaia/archeon) — The architecture notation system
- [Archeon Docs](https://github.com/danaia/archeon/wiki) — Learn the glyph syntax
