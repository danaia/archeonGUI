# ArcheonGUI Documentation

Welcome to **ArcheonGUI** — a standalone desktop application for visualizing project architectures in real-time.

## 🎯 What is ArcheonGUI?

ArcheonGUI is an interactive canvas-based visualization tool that lets you:
- **Visualize** your entire project architecture at a glance
- **Explore** relationships between components
- **Navigate** complex systems intuitively
- **Edit** your ARCHEON.arcon files with visual feedback
- **Validate** your architecture in real-time

> **What is Archeon?** [Archeon](https://github.com/danaia/archeon) is a glyph-based architecture notation for describing component structures and relationships — just plain text files that any AI assistant can understand.

---

## 📸 Screenshots

### Visual Architecture Canvas
<img src="https://raw.githubusercontent.com/danaia/archeonGUI/main/public/images/1.png" alt="Architecture Canvas" width="800"/>

*Interactive grid showing glyphs organized by chains with relationship connections*

### Glyph Details & Code Preview
<img src="https://raw.githubusercontent.com/danaia/archeonGUI/main/public/images/4.png" alt="Glyph Details" width="800"/>

*Side drawer with glyph metadata, relationships, and live code preview*

### Integrated Terminal
<img src="https://raw.githubusercontent.com/danaia/archeonGUI/main/public/images/2.png" alt="Integrated Terminal" width="800"/>

*Built-in terminal for running commands directly within ArcheonGUI*

### Setup Modal
<img src="https://raw.githubusercontent.com/danaia/archeonGUI/main/public/images/3.png" alt="Setup Modal" width="800"/>

*One-click setup with architecture shapes and AI IDE rules*

---

## 🌐 Works With Any IDE

ArcheonGUI is **completely IDE-agnostic** — it runs as a standalone window alongside your favorite editor. The built-in Setup Modal configures AI rules for your preferred IDE in seconds.

### Supported IDEs & AI Assistants

| IDE / Tool | Integration | Configuration File |
|------------|-------------|-------------------|
| **VS Code** | Full support with GitHub Copilot | `.vscode/settings.json`, `.github/copilot-instructions.md` |
| **Cursor** | Native AI rules integration | `.cursorrules`, `.cursor/README.md` |
| **Windsurf** | Codeium AI integration | `.windsurfrules`, `.windsurf/README.md` |
| **Cline** | Claude-powered assistant | `.clinerules`, `.cline/README.md` |
| **Aider** | Terminal-based AI coding | `.aider.conf.yml`, `.aider/README.md` |
| **GitHub Copilot** | Works in any supported editor | `.github/copilot-instructions.md` |
| **Any Editor** | Manual `.arcon` editing | `archeon/ARCHEON.arcon` |

### Adding Archeon to Any Project

Just create an `archeon/` folder with an `ARCHEON.arcon` file using simple glyph notation:

```
@v1 NED:feature => CMP:Component => API:endpoint => OUT:result
```

| Symbol | Meaning |
|--------|--------|
| `@v1` | Chain version |
| `NED` | Need (entry point) |
| `CMP` | Component |
| `API` | API endpoint |
| `OUT` | Output/Result |
| `=>` | Relationship flow |

## 📚 Documentation

### Getting Started
- **[Getting Started: Choosing & Visualizing Projects](./Getting-Started-Visualization.md)** - How to open a project and visualize it
- **[Installation Guide](./Installation.md)** - Set up ArcheonGUI on your machine
- **[Quick Start Tutorial](./Quick-Start.md)** - Your first 5 minutes with ArcheonGUI

### Understanding the UI
- **[Canvas Navigation](./Canvas-Navigation.md)** - Zoom, pan, and interact with the canvas
- **[Glyph Types & Layers](./Glyph-Types.md)** - Understanding architecture components
- **[Relationships & Connections](./Relationships.md)** - How components connect
- **[Side Drawer Guide](./Side-Drawer.md)** - Viewing glyph details and relationships

### Reference
- **[Keyboard Shortcuts](./Keyboard-Shortcuts.md)** - Quick reference for all shortcuts
- **[Architecture Guide](./Architecture-Guide.md)** - Deep dive into how ArcheonGUI works
- **[FAQ](./FAQ.md)** - Common questions and troubleshooting

### Development
- **[Contributing](./Contributing.md)** - How to contribute to ArcheonGUI
- **[Architecture Reference](../archeon/ARCHEON.arcon)** - ArcheonGUI's own architecture

## 🚀 Quick Links

- **ArcheonGUI**: [danaia/archeonGUI](https://github.com/danaia/archeonGUI)
- **Archeon Framework**: [danaia/archeon](https://github.com/danaia/archeon) - The architecture notation language
- **Issues**: [Report a bug](https://github.com/danaia/archeonGUI/issues)
- **Discussions**: [Ask a question](https://github.com/danaia/archeonGUI/discussions)

## 💡 Key Features

### 📊 Infinite Canvas
- Zoom and pan freely through your architecture
- Pan with Space + Drag
- Zoom with scroll wheel
- Real-time grid positioning

### 🎨 Visual Architecture
- Color-coded glyph types
- Layer-based organization (Frontend, Backend, Meta)
- Relationship badges showing data flow
- Collapse/expand to focus on areas

### 🔍 Smart Navigation
- Click glyphs to view details
- Hover for quick previews
- Search and filter capabilities
- Auto-highlighting of connected components

### ✅ Real-time Validation
- Instant feedback on architecture correctness
- Error and warning detection
- File mismatch indicators
- Chain validation

### 💻 Code Integration
- View source files inline
- Syntax-highlighted code preview
- Jump to code sections
- File path verification

## 🎓 Learning Path

**New to ArcheonGUI?** Start here:
1. Read [What is ArcheonGUI?](#what-is-archeongui)
2. Follow [Installation Guide](./Installation.md)
3. Try [Quick Start Tutorial](./Quick-Start.md)
4. Explore [Getting Started: Choosing & Visualizing Projects](./Getting-Started-Visualization.md)

**Want to master it?** Go deeper:
5. Learn [Canvas Navigation](./Canvas-Navigation.md)
6. Understand [Glyph Types & Layers](./Glyph-Types.md)
7. Study [Relationships & Connections](./Relationships.md)
8. Dive into [Architecture Guide](./Architecture-Guide.md)

## 🔧 Common Tasks

### How do I...

- **Open a project?** → [Getting Started Guide](./Getting-Started-Visualization.md#choosing-a-project)
- **Navigate the canvas?** → [Canvas Navigation](./Canvas-Navigation.md)
- **Understand a glyph type?** → [Glyph Types & Layers](./Glyph-Types.md)
- **View a component's code?** → [Side Drawer Guide](./Side-Drawer.md)
- **Find keyboard shortcuts?** → [Keyboard Shortcuts](./Keyboard-Shortcuts.md)
- **Troubleshoot an error?** → [FAQ](./FAQ.md)

## 📞 Need Help?

- **Documentation**: Check the relevant guide above
- **FAQ**: [Frequently Asked Questions](./FAQ.md)
- **Issues**: [Report a bug](https://github.com/danaia/archeonGUI/issues)
- **Discussions**: [Ask the community](https://github.com/danaia/archeonGUI/discussions)

## 📝 License

ArcheonGUI is open source and available under the MIT License.

---

**Happy exploring! 🚀**

*ArcheonGUI — Visualize Your Architecture*