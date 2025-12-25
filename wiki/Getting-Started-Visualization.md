# Getting Started: Choosing & Visualizing Projects

Welcome to ArcheonGUI! This guide will walk you through opening an Archeon project and visualizing its architecture on the infinite canvas.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Choosing a Project](#choosing-a-project)
- [Visualizing Your Project](#visualizing-your-project)
- [Understanding the Canvas](#understanding-the-canvas)
- [Navigating the Visualization](#navigating-the-visualization)

## Prerequisites

Before you begin, ensure you have:
- **ArcheonGUI** installed and running on your machine (see [Installation Guide](./Installation.md))
- An **Archeon project** with an `ARCHEON.arcon` file in the project root (learn about [Archeon notation](https://github.com/danaia/archeon))
- Basic understanding of your project's architecture

## Choosing a Project

### Step 1: Launch ArcheonGUI

Start the ArcheonGUI application on your machine.

### Step 2: Open the Project Dialog

[**Screenshot placeholder**: File menu with "Open Project" option or folder icon in toolbar]

1. Click the **folder/open icon** in the top toolbar
2. Or use the application menu to select "File → Open Project"
3. A file browser dialog will appear

### Step 3: Navigate to Your Project

[**Screenshot placeholder**: File browser showing typical project structure with ARCHEON.arcon file visible]

1. Browse to your project directory
2. Look for the `ARCHEON.arcon` file in the root of your project
3. This file contains your complete architecture definition written in [Archeon notation](https://github.com/danaia/archeon/wiki)

### Step 4: Select and Open

[**Screenshot placeholder**: File browser with ARCHEON.arcon selected and "Open" button highlighted]

1. Click on `ARCHEON.arcon` to select it
2. Click the **"Open"** button
3. ArcheonGUI will:
   - Parse your architecture file
   - Validate the project structure
   - Scan your file system for source files
   - Load and render the visualization

## Visualizing Your Project

Once your project loads, you'll see the **infinite canvas** displaying your architecture.

### Project Loaded Successfully

[**Screenshot placeholder**: Full canvas view showing tiles, chains, relationships, and info bar at top-left]

**What you see:**
- **Tiles**: Individual glyphs representing your architecture components
- **Chains**: Horizontal rows showing related components flowing together
- **Badges**: Colored circles showing relationships and data flow between components
- **Grid**: Subtle background reference for positioning
- **Info bar**: Shows zoom level, chain count, glyph count, relationship count

### Glyph Types and Visual Identity

Each glyph type has a distinct icon and color for quick identification:

[**Screenshot placeholder**: Legend showing all glyph types with icons, colors, and labels]

**Quick Reference:**

| Glyph Type | Icon | Color | Purpose | Layer |
|------------|------|-------|---------|-------|
| **View (V)** | 🖼 | Orange | UI Page/Screen | Frontend |
| **Component (CMP)** | ◆ | Blue | Reusable UI Component | Frontend |
| **Store (STO)** | ⬚ | Cyan | State Management | Frontend |
| **API** | 🔷 | Teal | Server Endpoint | Backend |
| **Out (OUT)** | ✓ | Green | External Output | Backend |
| **Nested Entity (NED)** | ◈ | Orange | Data Structure | Meta |
| **Task (TSK)** | ⚙ | Purple | Background Process | Meta |

## Understanding the Canvas

### Canvas Layout

The canvas is organized as a **grid** where:
- **Horizontal axis (columns)**: Different components at the same level
- **Vertical axis (rows)**: Chains representing execution flows
- **Positioning**: Automatic based on dependencies and relationships

### Zoom Levels and Details

The canvas adapts what it shows based on zoom level:

[**Screenshot placeholder**: Multiple views showing zoomed out (30%), normal (100%), and zoomed in (200%)]

| Zoom | Shows | Best For |
|------|-------|----------|
| **30-50%** | Entire architecture overview | Understanding overall flow |
| **80-100%** | Balanced detail + overview | Normal working view |
| **150-200%** | Full labels + code previews | Detailed inspection |
| **250%+** | Complete code content | Reading implementation |

### Collapsed Tiles

When you want to focus on a specific area, collapse tiles to hide their children:

[**Screenshot placeholder**: Canvas with a collapsed tile showing the "▶ 3" indicator in the top-left corner]

**Collapse Features:**
- **Double-click any tile** to toggle collapse/expand
- **Collapse indicator** (▶) appears in top-left when tile is collapsed
- **Count badge** shows number of hidden child tiles (e.g., "▶ 3")
- **Collapsed state persists** when you save your layout

**Why collapse?**
- Reduce visual clutter
- Focus on specific chains
- Simplify exploration of large architectures
- Maintain your working view when reopening projects

## Navigating the Visualization

### Mouse Controls

| Action | Result |
|--------|--------|
| **Scroll wheel** | Zoom in/out on canvas |
| **Space + Drag** | Pan/move around canvas |
| **Double-click tile** | Toggle collapse/expand |
| **Click tile** | Select and show details in Side Drawer |
| **Hover tile** | See tile name and type tooltip |
| **Click badge** | View relationship details |
| **Ctrl/Cmd + Click** | Multi-select tiles |

### The Side Drawer

Click on any tile to open the **Side Drawer** on the right:

[**Screenshot placeholder**: Side drawer showing tile details with code preview, metadata, and related tiles]

**Side Drawer displays:**
- Glyph type icon and name
- Full label and qualified name
- Source file path and preview
- Code preview with syntax highlighting
- Connected relationships (incoming/outgoing)
- Position on canvas (col, row)
- Chain and intent information

**Close the drawer:**
- Click the X button in the drawer
- Press **Esc** key
- Click on the canvas

### Canvas Layers

Your architecture is automatically organized into **three layers**:

[**Screenshot placeholder**: Legend showing Frontend (blue), Backend (teal), Meta (orange) layers with example tiles]

**Layer Meanings:**

- **Frontend Layer** (Blue/Orange icons)
  - User-facing components
  - Views, components, state
  - Direct user interaction

- **Backend Layer** (Teal/Green icons)
  - Server-side logic
  - APIs, endpoints, services
  - Data processing

- **Meta Layer** (Orange/Purple icons)
  - Cross-cutting concerns
  - Utilities, types, tasks
  - Infrastructure

### Relationship Badges

Connections between glyphs show important data flow:

[**Screenshot placeholder**: Close-up of multiple relationship badges with different colors and symbols]

**Badge Information:**
- **Color**: Type of relationship (depends on edge type)
- **Symbol**: Direction and nature of connection (arrow, check, link, etc.)
- **Position**: Midpoint between source and target glyphs
- **Click**: Opens relationship details in Side Drawer
- **Hover**: Highlights the connected glyphs

### Info Bar

Top-left corner shows quick statistics:

[**Screenshot placeholder**: Info bar showing "82% • 4 chains • 6/16 glyphs • 12 rels"]

**Displays:**
- **Zoom percentage**: Current zoom level
- **Chain count**: Number of execution chains
- **Glyph count**: Completed/Total components
- **Relationship count**: Total connections

### Validation Status

Real-time feedback on your architecture:

[**Screenshot placeholder**: Validation status showing checkmark "✓ Project Valid" or error/warning indicators]

**Status Types:**
- ✓ **Valid**: Architecture is correct
- ⚠ **Warnings**: Issues that may need attention
- ✗ **Errors**: Issues that must be fixed

Click the status indicator to see detailed validation results.

## Tips and Tricks

### For Efficient Navigation
1. **Zoom in** (150%+) when working on details
2. **Zoom out** (50%) for overall architecture view
3. **Use Space+Drag** to reposition without selecting
4. **Collapse deep chains** to reduce complexity

### For Understanding Architecture
1. **Follow the badges** to understand data flow
2. **Check the layer** to understand component type
3. **View the code** using Side Drawer previews
4. **Look at connections** to understand dependencies

### For Large Projects
1. **Start zoomed out** to see overall structure
2. **Collapse chains** you're not working on
3. **Use multi-select** to group related glyphs
4. **Save layouts** frequently as you work

## Common Issues

### "File not found" warning on glyph
- Check the file path in the glyph details
- Verify the file exists at that location
- Update ARCHEON.arcon if path is incorrect

### Glyph shows mismatch indicator
- The file location suggests a different glyph type
- This is often a flexible match
- Update ARCHEON.arcon if the type is wrong

### Layout doesn't save
- Check that your project path is accessible
- Ensure write permissions in the project directory
- Try opening and closing the project again

## Next Steps

- **[Canvas Navigation Guide](./Canvas-Navigation.md)** - Master all navigation techniques
- **[Glyph Types & Layers](./Glyph-Types.md)** - Deep dive into each glyph type
- **[Relationships & Connections](./Relationships.md)** - Understand data flow and dependencies
- **[Keyboard Shortcuts](./Keyboard-Shortcuts.md)** - Work faster with shortcuts
- **[Architecture Guide](./Architecture-Guide.md)** - How ArcheonGUI works internally
- **[Archeon Documentation](https://github.com/danaia/archeon/wiki)** - Learn the Archeon notation language

---

*Ready to explore your architecture? Open a project and start visualizing!*