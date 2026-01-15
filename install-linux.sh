#!/bin/bash

# Archeon Linux Installation Script
# Builds and installs Archeon as a desktop application

set -e

echo "🔧 Archeon Linux Installer"
echo "=========================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the archeonGUI directory."
    exit 1
fi

# Clean previous installation if exists
echo "🧹 Cleaning previous build artifacts..."
rm -rf node_modules package-lock.json dist dist-electron release 2>/dev/null || true
npm cache clean --force

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Build the AppImage
echo ""
echo "🔨 Building AppImage..."
npm run build:appimage

# Check if AppImage was created
if [ ! -f "release/Archeon-0.0.1.AppImage" ]; then
    echo "❌ Error: AppImage build failed"
    exit 1
fi

# Create necessary directories
echo ""
echo "📁 Creating installation directories..."
mkdir -p ~/.local/bin
mkdir -p ~/.local/share/applications
mkdir -p ~/.local/share/icons

# Install the AppImage
echo ""
echo "📲 Installing AppImage..."
cp release/Archeon-0.0.1.AppImage ~/.local/bin/Archeon.AppImage
chmod +x ~/.local/bin/Archeon.AppImage

# Install icon
echo ""
echo "🎨 Installing icon..."
if [ -f "public/icon.iconset/icon_256x256.png" ]; then
    cp public/icon.iconset/icon_256x256.png ~/.local/share/icons/archeon.png
elif [ -f "public/icon.iconset/icon.png" ]; then
    cp public/icon.iconset/icon.png ~/.local/share/icons/archeon.png
else
    echo "⚠️  Warning: Icon file not found, using default"
fi

# Create desktop entry
echo ""
echo "🖥️  Creating desktop entry..."
cat > ~/.local/share/applications/archeon.desktop << 'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=Archeon
Comment=Archeon GUI - Project Visualization Tool
Exec=env GDK_BACKEND=x11 /home/$USER/.local/bin/Archeon.AppImage %U
Icon=/home/$USER/.local/share/icons/archeon.png
Terminal=false
Categories=Development;Utility;
StartupNotify=true
StartupWMClass=archeongui
MimeType=
EOF

# Replace $USER with actual username
sed -i "s/\$USER/$USER/g" ~/.local/share/applications/archeon.desktop

# Set proper permissions
chmod 644 ~/.local/share/applications/archeon.desktop

# Copy to Desktop if it exists
if [ -d "$HOME/Desktop" ]; then
    echo ""
    echo "🖥️  Creating desktop shortcut..."
    cp ~/.local/share/applications/archeon.desktop ~/Desktop/archeon.desktop
    chmod +x ~/Desktop/archeon.desktop
fi

# Update desktop database
echo ""
echo "🔄 Updating desktop database..."
update-desktop-database ~/.local/share/applications 2>/dev/null || true

echo ""
echo "✅ Installation complete!"
echo ""
echo "You can now:"
echo "  • Search for 'Archeon' in your application menu"
echo "  • Launch from Desktop shortcut"
if [ -d "$HOME/Desktop" ]; then
    echo "  • Launch from the desktop shortcut"
fi
echo ""
echo "To add to favorites:"
echo "  1. Search for 'Archeon' in app menu"
echo "  2. Right-click and select 'Add to Favorites'"
echo ""
echo "To install the CLI tool (arc command):"
echo "  1. Launch Archeon from app menu"
echo "  2. Click 'Setup' and choose 'Install CLI' mode"
echo ""
echo "Note: On GNOME, you may need to restart the shell (Alt+F2, type 'r', press Enter)"
echo "      or log out and back in to see the app in your menu."
echo ""
