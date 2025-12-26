# Quick Reference - SetupModal Feature Guide

## For Users

### How to Use the Setup Feature

1. **Open Terminal**: Click the terminal button (bottom-left) or press `` ` ``
2. **Click Setup**: Click the "Setup" button in the terminal header
3. **Select IDE**: Click on your preferred IDE card
4. **View Details**: Selected card expands to show all files
5. **Apply Setup**: Click "Apply Setup" button
6. **Watch Progress**: Terminal expands automatically showing real-time progress
7. **Done**: Modal closes when complete, or shows errors for review

### What Gets Created

| IDE | Files Created |
|-----|---------------|
| All IDEs | `.cursorrules`, `.cursor/README.md`, `.clinerules`, `.cline/README.md`, `.windsurfrules`, `.windsurf/README.md`, `.aider.conf.yml`, `.aider/README.md`, `.vscode/settings.json`, `.vscode/ARCHEON_README.md`, `.github/copilot-instructions.md`, `.github/COPILOT_README.md` |
| Cursor | `.cursorrules`, `.cursor/README.md` |
| VSCode | `.vscode/settings.json`, `.vscode/ARCHEON_README.md` |
| Windsurf | `.windsurfrules`, `.windsurf/README.md` |
| Cline | `.clinerules`, `.cline/README.md` |
| Aider | `.aider.conf.yml`, `.aider/README.md` |
| Copilot | `.github/copilot-instructions.md`, `.github/COPILOT_README.md` |

## For Developers

### Key Files
```
src/
├── components/
│   ├── SetupModal.vue (✓ Enhanced)
│   └── FloatingTerminal.vue (✓ Updated)
└── stores/
    └── terminal.js (already has setPtyId)
```

### Implementation Summary

**SetupModal.vue**
- Added 7th IDE option (GitHub Copilot)
- Enhanced `applySetup()` with progress tracking
- Auto-expand terminal during setup
- Real-time file creation feedback
- Better error handling with partial success support

**FloatingTerminal.vue**
- Store PTY ID in terminal store: `terminalStore.setPtyId(ptyId)`
- Clear PTY ID on exit/destroy: `terminalStore.setPtyId(null)`

### Key Functions

```javascript
// Select IDE
selectIDE(ideId)

// Run setup
applySetup()

// Close modal
closeModal()
```

### Terminal Integration
```javascript
// Write to terminal
window.electronAPI.ptyWrite(terminalStore.ptyId, message);

// Auto-expand terminal
if (!terminalStore.isExpanded) {
  terminalStore.toggle();
}

// Track progress
setupProgress.value.push({ file, success: true });
```

### Testing Commands

```bash
# No build needed - hot reload works
# Just refresh the app and test Setup button

# Check terminal for output
# Check modal for progress
# Verify files created in project directory
```

## Code Examples

### Simple File Creation Loop
```javascript
for (const file of selectedOption.files) {
  try {
    const response = await fetch(`/tempRles/${file}`);
    const content = await response.text();
    
    const result = await window.electronAPI.writeFile(
      `${projectStore.projectPath}/${file}`,
      content
    );
    
    if (result.success) {
      // Show success in terminal
      window.electronAPI.ptyWrite(
        terminalStore.ptyId,
        `\x1b[32m✓\x1b[0m Created: \x1b[33m${file}\x1b[0m\r\n`
      );
    }
  } catch (error) {
    // Show error in terminal
    window.electronAPI.ptyWrite(
      terminalStore.ptyId,
      `\x1b[31m✗\x1b[0m Failed: ${file}\r\n`
    );
  }
}
```

### Terminal Output Format
```javascript
// Header
`\x1b[36m╔══════════════════════════════════════════════════╗\x1b[0m\r\n`
`\x1b[36m║\x1b[0m  Setting up ${name.padEnd(42)} \x1b[36m║\x1b[0m\r\n`
`\x1b[36m╚══════════════════════════════════════════════════╝\x1b[0m\r\n\r\n`

// Success
`\x1b[32m✓\x1b[0m Created: \x1b[33m${file}\x1b[0m\r\n`

// Error
`\x1b[31m✗\x1b[0m Failed: \x1b[33m${file}\x1b[0m\r\n`

// Summary
`\x1b[36m─────────────────────────────────────────────────\x1b[0m\r\n`
`\x1b[32m✓ Setup complete!\x1b[0m ${count} files created\r\n`
```

## Color Codes
```
\x1b[32m - Green (success)
\x1b[31m - Red (error)
\x1b[33m - Yellow (file paths)
\x1b[36m - Cyan (headers)
\x1b[0m  - Reset
```

## Common Issues & Solutions

### Terminal Not Expanding
**Issue**: Terminal doesn't auto-expand during setup
**Solution**: Modal calls `terminalStore.toggle()` - check if store is accessible

### Files Not Creating
**Issue**: No files appear in project directory
**Solution**: Check `terminalStore.ptyId` is not null - verify PTY is running

### Terminal Output Not Showing
**Issue**: No progress appears in terminal
**Solution**: Verify `window.electronAPI` is available (Electron environment)

### Progress Not Tracking
**Issue**: Modal progress list is empty
**Solution**: Check `setupProgress.value` array is being updated

## Documentation

| Doc | Purpose |
|-----|---------|
| `SETUP_IMPROVEMENTS.md` | Overview of all enhancements |
| `SETUP_VISUAL_GUIDE.md` | UI layout and visual reference |
| `TECHNICAL_IMPLEMENTATION.md` | Code flow and architecture |
| `SETUP_COMPLETE.md` | Comprehensive summary |

## Related Components

- **SetupModal.vue**: IDE selection and rule injection
- **FloatingTerminal.vue**: Terminal display and PTY management
- **Terminal Store**: Shared state for terminal (ptyId, isExpanded, etc)
- **Project Store**: Current project path
- **UI Store**: Modal visibility state

## Architecture

```
FloatingTerminal.vue
    ↓ (stores ptyId)
Terminal Store (ptyId state)
    ↓ (accesses ptyId)
SetupModal.vue
    ↓ (writes progress)
Terminal Display
```

## Performance Notes

- Sequential file creation (not parallel)
- Async fetch + write operations
- Non-blocking modal UI
- Real-time progress updates
- Memory efficient for large file sets

## Browser Compatibility

- ✅ Electron (full support)
- ⚠️ Browser (limited - no file operations)
- ✅ Fallback gracefully in browser mode

---

**Version**: 1.0 Complete
**Last Updated**: December 26, 2025
