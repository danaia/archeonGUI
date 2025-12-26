# Technical Implementation Details

## Files Modified

### 1. src/components/SetupModal.vue
**Changes:**
- Added 7th IDE option (GitHub Copilot)
- Added `setupProgress` ref to track file creation
- Enhanced `applySetup()` function with better error handling and progress tracking
- Improved modal UI with better card design and information display

**Key Features:**
```javascript
// New: Track setup progress
const setupProgress = ref([]);

// Enhanced: Auto-expand terminal
if (!terminalStore.isExpanded) {
  terminalStore.toggle();
}

// Enhanced: Write progress to terminal
window.electronAPI.ptyWrite(terminalStore.ptyId, message);

// Enhanced: Track file creation
setupProgress.value.push({ file, success: true });

// Enhanced: Show summary with statistics
const createdFiles = [];
const failedFiles = [];
// ... count results and display summary
```

**Terminal Output Format:**
```
╔══════════════════════════════════════════════════╗
║  Setting up {IDE_NAME}                       ║
║  Creating Archeon AI Rules...            ║
╚══════════════════════════════════════════════════╝

✓ Created: .file1.ext
✓ Created: .file2.ext
...

─────────────────────────────────────────────────
✓ Setup complete! ✓ N files created
Archeon AI rules installed for {IDE_NAME}.
```

### 2. src/components/FloatingTerminal.vue
**Changes:**
- Updated `spawnPty()` to store ptyId in terminal store
- Updated PTY exit handler to clear ptyId from store
- Updated `destroyTerminal()` to clear ptyId from store

**Implementation:**
```javascript
// In spawnPty()
const result = await window.electronAPI.ptySpawn({ cwd, cols, rows });
ptyId = result.id;
// NEW: Store in terminal store
terminalStore.setPtyId(ptyId);

// In exit handler
ptyId = null;
// NEW: Clear from store
terminalStore.setPtyId(null);

// In destroyTerminal()
if (ptyId !== null && window.electronAPI) {
  window.electronAPI.ptyKill(ptyId);
  ptyId = null;
  // NEW: Clear from store
  terminalStore.setPtyId(null);
}
```

### 3. src/stores/terminal.js
**No Changes** - Already has `setPtyId()` method:
```javascript
// Already existing
function setPtyId(id) {
  ptyId.value = id;
}
```

## Data Flow

### Setup Initiation
```
User clicks "Setup" button
    ↓
SetupModal opens
    ↓
User selects IDE
    ↓
setupProgress.value = [] (reset)
    ↓
Modal shows selected IDE details
```

### Setup Execution
```
User clicks "Apply Setup"
    ↓
applySetup() function starts
    ↓
Terminal auto-expands: terminalStore.toggle()
    ↓
Write header to terminal: window.electronAPI.ptyWrite()
    ↓
For each file in selectedOption.files:
  1. fetch() content from /tempRles/{file}
  2. window.electronAPI.writeFile() to project
  3. window.electronAPI.ptyWrite() progress to terminal
  4. setupProgress.value.push({ file, success })
    ↓
Calculate results:
  - createdFiles count
  - failedFiles list
    ↓
Write summary to terminal
    ↓
If all success: closeModal() after 1000ms
If errors: keep modal open for review
```

### Terminal Integration Points

**SetupModal → FloatingTerminal Communication:**
```javascript
// 1. Get PTY ID from terminal store
const ptyId = terminalStore.ptyId;

// 2. Write messages to terminal
window.electronAPI.ptyWrite(ptyId, message);

// 3. Auto-expand terminal if needed
if (!terminalStore.isExpanded) {
  terminalStore.toggle();
}
```

**FloatingTerminal → Terminal Store:**
```javascript
// 1. Store PTY ID when spawned
terminalStore.setPtyId(ptyId);

// 2. Clear PTY ID when exited
terminalStore.setPtyId(null);

// 3. Clear PTY ID when destroyed
terminalStore.setPtyId(null);
```

## File Creation Logic

```javascript
for (const file of selectedOption.files) {
  const sourceFile = `/tempRles/${file.replace(/^\//, '')}`;
  const targetPath = `${projectStore.projectPath}/${file}`;

  try {
    // 1. Fetch from tempRles directory
    const response = await fetch(sourceFile);
    if (!response.ok) throw new Error(`Source file not found`);
    const content = await response.text();

    // 2. Write to project directory
    const writeResult = await window.electronAPI.writeFile(
      targetPath,
      content
    );

    if (writeResult.success) {
      // 3. Show progress in terminal
      const message = `\x1b[32m✓\x1b[0m Created: \x1b[33m${file}\x1b[0m\r\n`;
      window.electronAPI.ptyWrite(terminalStore.ptyId, message);

      // 4. Track in modal
      createdFiles.push(file);
      setupProgress.value.push({ file, success: true });
    } else {
      throw new Error(writeResult.error || "Write failed");
    }

  } catch (fileError) {
    // 5. Handle errors
    const message = `\x1b[31m✗\x1b[0m Failed: \x1b[33m${file}\x1b[0m — ${fileError.message}\r\n`;
    window.electronAPI.ptyWrite(terminalStore.ptyId, message);

    failedFiles.push(file);
    setupProgress.value.push({ 
      file, 
      success: false, 
      error: fileError.message 
    });
  }
}
```

## ANSI Color Codes Used

```javascript
// Colors used in terminal output
\x1b[32m  // Green (✓ success)
\x1b[31m  // Red (✗ error)
\x1b[33m  // Yellow (file paths)
\x1b[36m  // Cyan (headers, borders)
\x1b[0m   // Reset formatting
```

## Error Handling Strategy

1. **File Not Found**: Catch during fetch, log and continue
2. **File Write Failed**: Catch during writeFile, log and continue
3. **Partial Success**: Track all results, show summary
4. **Complete Failure**: Show error in modal, keep modal open
5. **Terminal Not Ready**: Check `terminalStore.ptyId` before writing

```javascript
// Safe writing to terminal
if (window.electronAPI && terminalStore.ptyId) {
  window.electronAPI.ptyWrite(terminalStore.ptyId, message);
}
```

## State Management

### Modal State
```javascript
selectedIDE       // Which IDE is selected (or null)
isSettingUp      // Is setup currently running
setupError       // Any errors that occurred
setupProgress    // Array of { file, success, error? }
```

### Terminal Store State
```javascript
ptyId            // Current PTY process ID (or null)
isExpanded       // Is terminal panel visible
isFocused        // Does terminal have focus
```

### Project Store State
```javascript
projectPath      // Path to currently open project
```

## Performance Considerations

1. **Async Operations**: All file I/O is async (fetch, writeFile)
2. **Progress Tracking**: Real-time updates without blocking
3. **Memory**: Files are read and written one at a time
4. **UI Responsiveness**: Modal stays responsive during setup
5. **Terminal Output**: Buffer managed by FloatingTerminal component

## Accessibility

- Modal is properly portaled with Teleport
- Backdrop blur provides visual focus
- Buttons properly disabled during setup
- Progress is displayed both in modal and terminal
- Error messages are clear and actionable

## Browser/Electron Compatibility

```javascript
// Check if running in Electron
if (window.electronAPI) {
  // Use Electron APIs
} else {
  // Fallback for browser dev mode
}

// SetupModal requires Electron for file operations
// Falls back gracefully if not available
```

## Future Enhancements

1. **Selective File Creation**: Let users choose which files to create
2. **Custom Rules**: Allow users to edit rules before creation
3. **Installation Verification**: Check if files were created correctly
4. **Rollback**: Undo setup if needed
5. **Progress Percentage**: Show progress bar
6. **Parallel File Creation**: Create multiple files at once (with care)
