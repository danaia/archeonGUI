#!/bin/bash

# Archeon macOS Installation Script
# Builds and installs Archeon as a desktop application on macOS

set -euo pipefail

echo "Archeon macOS Installer"
echo "======================="
echo ""

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "Error: This script is for macOS only."
    echo "Use ./install-linux.sh on Linux."
    exit 1
fi

# Ensure a Node.js version compatible with Electron tooling is used.
# Archeon supports Node 20.x and 22.x for local setup/build.
if ! command -v node >/dev/null 2>&1; then
    echo "Error: Node.js is not installed."
    echo "Install Node.js 20.x or 22.x, then rerun this script."
    exit 1
fi

NODE_VERSION_RAW="$(node -v)"
NODE_MAJOR="${NODE_VERSION_RAW#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"

ensure_supported_node() {
    if [[ "$NODE_MAJOR" == "20" || "$NODE_MAJOR" == "22" ]]; then
        return 0
    fi

    echo "Detected Node.js $NODE_VERSION_RAW (unsupported for this installer)."
    echo "Attempting to use Node.js 22 via nvm..."

    if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
        # shellcheck source=/dev/null
        . "$HOME/.nvm/nvm.sh"
    elif [[ -s "/opt/homebrew/opt/nvm/nvm.sh" ]]; then
        # shellcheck source=/dev/null
        . "/opt/homebrew/opt/nvm/nvm.sh"
    elif [[ -s "/usr/local/opt/nvm/nvm.sh" ]]; then
        # shellcheck source=/dev/null
        . "/usr/local/opt/nvm/nvm.sh"
    fi

    if command -v nvm >/dev/null 2>&1; then
        nvm install 22 >/dev/null
        nvm use 22 >/dev/null

        NODE_VERSION_RAW="$(node -v)"
        NODE_MAJOR="${NODE_VERSION_RAW#v}"
        NODE_MAJOR="${NODE_MAJOR%%.*}"

        if [[ "$NODE_MAJOR" == "22" || "$NODE_MAJOR" == "20" ]]; then
            echo "Using Node.js $NODE_VERSION_RAW"
            return 0
        fi
    fi

    # Fallback for Homebrew-managed Node versions that may be installed but not linked.
    for brew_node_bin in \
        "/opt/homebrew/opt/node@22/bin" \
        "/usr/local/opt/node@22/bin" \
        "/opt/homebrew/opt/node@20/bin" \
        "/usr/local/opt/node@20/bin"
    do
        if [[ -x "$brew_node_bin/node" ]]; then
            export PATH="$brew_node_bin:$PATH"
            NODE_VERSION_RAW="$(node -v)"
            NODE_MAJOR="${NODE_VERSION_RAW#v}"
            NODE_MAJOR="${NODE_MAJOR%%.*}"
            if [[ "$NODE_MAJOR" == "22" || "$NODE_MAJOR" == "20" ]]; then
                echo "Using Node.js $NODE_VERSION_RAW from Homebrew path: $brew_node_bin"
                return 0
            fi
        fi
    done

    echo "Error: Could not switch to a supported Node.js version automatically."
    echo "Please run one of the following, then rerun this script:"
    echo "  nvm install 22 && nvm use 22"
    echo "  nvm install 20 && nvm use 20"
    echo "Or with Homebrew:"
    echo "  brew install node@22"
    echo '  export PATH="$(brew --prefix node@22)/bin:$PATH"'
    exit 1
}

ensure_supported_node

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "Error: package.json not found. Run this script from the archeonGUI directory."
    exit 1
fi

if [ ! -f "package.json.mac" ]; then
    echo "Error: package.json.mac not found."
    exit 1
fi

echo "Cleaning previous build artifacts..."
rm -rf node_modules package-lock.json dist dist-electron release 2>/dev/null || true
npm cache clean --force

echo ""
echo "Switching package.json to macOS configuration..."
cp package.json package.json.backup
cp package.json.mac package.json

echo ""
echo "Installing dependencies..."
npm install

echo ""
echo "Building macOS app bundle..."
npm run build

APP_PATH="$(find release -type d -name "Archeon.app" -print -quit)"
if [ -z "$APP_PATH" ]; then
    echo "Error: Could not find Archeon.app in release/."
    exit 1
fi

TARGET_DIR="/Applications"
if [ ! -w "$TARGET_DIR" ]; then
    TARGET_DIR="$HOME/Applications"
    mkdir -p "$TARGET_DIR"
fi

echo ""
echo "Installing Archeon.app to $TARGET_DIR..."
rm -rf "$TARGET_DIR/Archeon.app"
cp -R "$APP_PATH" "$TARGET_DIR/Archeon.app"

echo ""
echo "Installation complete."
echo ""
echo "Launch options:"
echo "  - Finder -> Applications -> Archeon"
echo "  - Spotlight search for Archeon"
echo ""
echo "If macOS warns about an unsigned app on first launch:"
echo "  1. Right-click Archeon.app"
echo "  2. Click Open"
echo "  3. Click Open again in the warning dialog"
