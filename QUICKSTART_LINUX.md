# Quick Start - Linux

## Install Archeon as a Desktop App

```bash
# One command to build and install
./install-linux.sh
```

This will:
- ✅ Build an AppImage installer
- ✅ Install to `~/.local/bin/Archeon.AppImage`
- ✅ Create desktop menu entry with icon
- ✅ Add desktop shortcut
- ✅ Configure for Wayland/X11 compatibility

## Launch the GUI App

After installation:
- **From App Menu**: Search for "Archeon" (recommended)
- **From Desktop**: Double-click the desktop shortcut
- **From Terminal**: `~/.local/bin/Archeon.AppImage`

## CLI Tool

To use the Archeon CLI (`arc` command), install it separately using the Setup modal in the GUI:
1. Launch the Archeon app
2. Click "Setup" button
3. Choose "Install CLI" mode
4. This will install the `arc` command

## Add to Favorites

1. Launch Archeon from app menu
2. Right-click the dock icon
3. Select "Add to Favorites"

## Update After Changes

```bash
# Rebuild and reinstall
./install-linux.sh
```

## Development Mode

```bash
npm install
npm run dev
```

## More Info

- **Detailed Guide**: See [LINUX_BUILD.md](LINUX_BUILD.md)
- **Main README**: See [README.md](README.md)
