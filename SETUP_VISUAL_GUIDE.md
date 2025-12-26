# SetupModal Visual Guide

## Modal Layout

```
┌─────────────────────────────────────────────────┐
│ Setup                                       [✕] │
├─────────────────────────────────────────────────┤
│                                                 │
│ What happens next:                              │
│ ✓ Archeon AI rules will be injected            │
│ ✓ AI assistants will understand architecture  │
│ ✓ IDE-specific configuration files created     │
│                                                 │
│ Select your IDE below...                        │
│                                                 │
│  ┌────────────────────┐  ┌────────────────────┐│
│  │ 🌐 All IDEs    [✓] │  │ ⚡ Cursor          ││
│  │ Install all        │  │ Optimized rules    ││
│  │ supported IDEs     │  │ (2 files)          ││
│  │                    │  │                    ││
│  │ → .cursorrules     │  └────────────────────┘│
│  │ → .cursor/README   │  ┌────────────────────┐│
│  │ → .github/copilot  │  │ 📘 Visual Studio   ││
│  │ → (9 more files)   │  │ Workspace settings ││
│  │                    │  │ (2 files)          ││
│  └────────────────────┘  └────────────────────┘│
│                                                 │
│  ┌────────────────────┐  ┌────────────────────┐│
│  │ 🌊 Windsurf        │  │ 🤖 Cline           ││
│  │ Codeium's editor   │  │ Claude Dev config  ││
│  │ (2 files)          │  │ (2 files)          ││
│  └────────────────────┘  └────────────────────┘│
│                                                 │
│  ┌────────────────────┐  ┌────────────────────┐│
│  │ 🔧 Aider           │  │ ✨ GitHub Copilot  ││
│  │ AI pair program    │  │ Copilot rules      ││
│  │ (2 files)          │  │ (2 files)          ││
│  └────────────────────┘  └────────────────────┘│
│                                                 │
│ Setup Progress:                                 │
│ ✓ .cursorrules                                 │
│ ✓ .cursor/README.md                            │
│                                                 │
│  ┌──────────────────────┐  ┌──────────────────┐│
│  │ Cancel               │  │ Apply Setup      ││
│  └──────────────────────┘  └──────────────────┘│
│                                                 │
└─────────────────────────────────────────────────┘
```

## Card States

### Unselected Card
```
┌────────────────────┐
│ ⚡ Cursor          │
│ Optimized rules    │
│ (2 files)          │
└────────────────────┘
```

### Selected Card
```
┌────────────────────────────┐
│ ⚡ Cursor              [✓] │
│ Optimized rules for AI     │
│                            │
│ Will create 2 file(s):     │
│ → .cursorrules             │
│ → .cursor/README.md        │
└────────────────────────────┘
```

## Terminal Output When Setup Runs

```
╔══════════════════════════════════════════════════╗
║  Setting up Cursor                           ║
║  Creating Archeon AI Rules...            ║
╚══════════════════════════════════════════════════╝

✓ Created: .cursorrules
✓ Created: .cursor/README.md

─────────────────────────────────────────────────
✓ Setup complete! ✓ 2 files created
Archeon AI rules installed for Cursor.

```

## IDE Options Available

| Icon | IDE | Files |
|------|-----|-------|
| 🌐 | All IDEs | 12 files |
| ⚡ | Cursor | 2 files |
| 📘 | Visual Studio Code | 2 files |
| 🌊 | Windsurf | 2 files |
| 🤖 | Cline | 2 files |
| 🔧 | Aider | 2 files |
| ✨ | GitHub Copilot | 2 files |

## File Creation Process

```
User Selects IDE
       ↓
Clicks "Apply Setup"
       ↓
Terminal auto-expands
       ↓
For each file:
  1. Read from /tempRles/
  2. Fetch content
  3. Write to project directory
  4. Show ✓ or ✗ in terminal
  5. Track progress in modal
       ↓
Show summary:
  - Total files created
  - Any failures
       ↓
Auto-close modal (success)
  OR
Keep modal open (with errors)
```

## Color Scheme

- **Selected Cards**: Indigo-500 border, indigo gradient background
- **Success**: Green (#22c55e)
- **Error**: Red (#ef4444)
- **Info/Headers**: Cyan (#06b6d4)
- **Highlights**: Yellow (#eab308)

## Interactive Elements

- **Hover Effects**: Scale 1.02, shadow increase, border color change
- **Active State**: Scale 0.98
- **Transitions**: 200ms smooth animations
- **Selection Indicator**: Animated checkmark in indigo circle

## Accessibility

- Cards are keyboard selectable
- Modal is properly portaled to body
- Backdrop blur for focus
- Disabled state for buttons (grayed out, cursor-not-allowed)
- Clear visual feedback for all interactions
