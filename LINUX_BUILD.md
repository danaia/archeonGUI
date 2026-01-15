# Linux Build & Installation Guide

Quick reference for building and installing Archeon on Linux.

## Quick Start

```bash
# One-command installation
./install-linux.sh
```

## Build Commands

| Command | Output | Use Case |
|---------|--------|----------|
| `npm run build:appimage` | AppImage file | Universal Linux installer (recommended) |
| `npm run build:deb` | .deb package | Debian/Ubuntu package |
| `npm run build` | Unpacked directory | Testing builds |
| `npm run dev` | Development mode | Development with hot-reload |

## Installation Locations

| Item | Location |
|------|----------|
| GUI AppImage | `~/.local/bin/Archeon.AppImage` |
| CLI Tool (arc) | Installed via Setup modal in GUI |
| Desktop Entry | `~/.local/share/applications/archeon.desktop` |
| Icon | `~/.local/share/icons/archeon.png` |
| Desktop Shortcut | `~/Desktop/archeon.desktop` |

## Common Tasks

### First Time Build & Install

```bash
git clone https://github.com/danaia/archeon.git
cd archeon
./install-linux.sh
```

### Rebuild After Changes

```bash
# Quick rebuild and update
npm run build:appimage
cp release/Archeon-0.0.1.AppImage ~/.local/bin/Archeon.AppImage

# Full reinstall (recommended after icon/metadata changes)
./install-linux.sh
```

### Clean Build

```bash
rm -rf node_modules package-lock.json dist dist-electron release
npm cache clean --force
npm install
npm run build:appimage
```

### Run in Development Mode

```bash
npm install
npm run dev
```

## Desktop Integration

### Making the App Appear in Menu

After installation:

1. **GNOME**: Press `Alt+F2`, type `r`, press Enter (restart shell)
2. **KDE/Other**: Log out and back in
3. Or run: `update-desktop-database ~/.local/share/applications`

### Adding to Favorites

1. Search for "Archeon" in application menu
2. Right-click the app
3. Select "Add to Favorites" or "Pin to Dash"

### Desktop Entry Configuration

The app's desktop entry includes:
- Full path to AppImage: `/home/$USER/.local/bin/Archeon.AppImage`
- Wayland compatibility: `env GDK_BACKEND=x11`
- File handling: `%U` parameter
- Proper icon path: `/home/$USER/.local/share/icons/archeon.png`

## Troubleshooting

### Platform Mismatch Error

```
npm error notsup Unsupported platform for @rollup/rollup-darwin-arm64
```

**Fix:**
```bash
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### App Won't Launch from Favorites

1. Remove app from favorites
2. Update desktop database: `update-desktop-database ~/.local/share/applications`
3. Re-add to favorites

### Terminal Not Working

Ensure node-pty is built correctly:
```bash
npm install --build-from-source node-pty
```

### Permission Errors

```bash
sudo usermod -a -G tty $USER
# Log out and back in
```

## Icon Updates

If you update the icon:

1. Update files in `public/icon.iconset/`
2. Rebuild: `npm run build:appimage`
3. Reinstall: `./install-linux.sh`
4. Refresh icon cache: `gtk-update-icon-cache -f -t ~/.local/share/icons 2>/dev/null || true`

## Package.json Configuration

The Linux build is configured with:

```json
{
  "build": {
    "icon": "public/icon.iconset/icon.png",
    "linux": {
      "target": ["AppImage", "deb"],
      "category": "Development",
      "icon": "public/icon.iconset/icon.png"
    }
  }
}
```

## Uninstalling

```bash
rm ~/.local/bin/Archeon.AppImage
rm ~/.local/share/applications/archeon.desktop
rm ~/.local/share/icons/archeon.png
rm ~/Desktop/archeon.desktop
update-desktop-database ~/.local/share/applications
```

## Platform-Specific Notes

### Ubuntu/Debian
- Uses .deb packages: `npm run build:deb`
- GNOME desktop environment

### Fedora/RHEL
- Uses AppImage (recommended)
- May need to install `fuse-libs` for AppImage support

### Arch Linux
- Uses AppImage
- May need `fuse2` package

### Wayland vs X11
- Desktop entry includes `GDK_BACKEND=x11` for compatibility
- Works on both Wayland and X11 sessions
