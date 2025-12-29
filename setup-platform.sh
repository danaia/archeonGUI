#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   ArcheonGUI Platform Setup           ║${NC}"
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo ""

# Function to detect platform automatically
detect_platform() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "mac"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "linux"
    else
        echo "unknown"
    fi
}

# Auto-detect platform
DETECTED_PLATFORM=$(detect_platform)

if [ "$DETECTED_PLATFORM" != "unknown" ]; then
    echo -e "${GREEN}Detected platform: ${DETECTED_PLATFORM}${NC}"
    echo ""
    read -p "Is this correct? (y/n): " confirm
    
    if [[ $confirm == [yY] || $confirm == [yY][eE][sS] ]]; then
        PLATFORM=$DETECTED_PLATFORM
    else
        PLATFORM=""
    fi
else
    echo -e "${YELLOW}Could not auto-detect platform${NC}"
    PLATFORM=""
fi

# If not confirmed or not detected, ask user
while [ -z "$PLATFORM" ]; do
    echo ""
    echo "Please select your platform:"
    echo "  1) macOS"
    echo "  2) Linux"
    echo ""
    read -p "Enter your choice (1 or 2): " choice
    
    case $choice in
        1)
            PLATFORM="mac"
            ;;
        2)
            PLATFORM="linux"
            ;;
        *)
            echo -e "${RED}Invalid choice. Please enter 1 or 2.${NC}"
            ;;
    esac
done

echo ""
echo -e "${BLUE}Setting up for ${PLATFORM}...${NC}"

# Check if template exists
if [ ! -f "package.json.${PLATFORM}" ]; then
    echo -e "${RED}Error: package.json.${PLATFORM} template not found!${NC}"
    exit 1
fi

# Backup existing package.json if it exists
if [ -f "package.json" ]; then
    echo -e "${YELLOW}Backing up existing package.json to package.json.backup${NC}"
    cp package.json package.json.backup
fi

# Copy the appropriate template
echo -e "${GREEN}Copying package.json.${PLATFORM} to package.json${NC}"
cp "package.json.${PLATFORM}" package.json

# Clean and install dependencies
echo ""
echo -e "${BLUE}Cleaning node_modules and package-lock.json...${NC}"
rm -rf node_modules package-lock.json

echo ""
echo -e "${BLUE}Installing dependencies...${NC}"
npm install

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║   Setup complete! ✓                    ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}You can now run:${NC}"
    echo -e "  ${GREEN}npm run dev${NC}    - Start development server"
    echo -e "  ${GREEN}npm run build${NC}  - Build for production"
else
    echo ""
    echo -e "${RED}╔════════════════════════════════════════╗${NC}"
    echo -e "${RED}║   Setup failed! ✗                      ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Please check the error messages above and try again.${NC}"
    exit 1
fi
