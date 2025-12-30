// Setup modal constants and configuration
import { isMac, isLinux, getOS } from '../utils/platform';

export const INIT_PROMPT = "Initialize this project with Archeon";

// Available architecture shapes for project scaffolding
export const shapeOptions = [
  {
    id: "vue3-fastapi",
    name: "Vue 3 + FastAPI",
    description:
      "Vue 3 frontend with FastAPI Python backend, MongoDB, Pinia state management",
    icon: "🟢",
    tags: ["Vue 3", "FastAPI", "Python", "MongoDB", "Pinia"],
  },
  {
    id: "react-fastapi",
    name: "React + FastAPI",
    description:
      "React frontend with FastAPI Python backend, MongoDB, Zustand state management",
    icon: "⚛️",
    tags: ["React", "FastAPI", "Python", "MongoDB", "Zustand"],
  },
];

// IDE rule options for shape installation
export const ideRuleOptions = [
  { id: "copilot", name: "GitHub Copilot", flag: "--copilot" },
  { id: "cursor", name: "Cursor", flag: "--cursor" },
  { id: "windsurf", name: "Windsurf", flag: "--windsurf" },
  { id: "cline", name: "Cline", flag: "--cline" },
  { id: "aider", name: "Aider", flag: "--aider" },
  { id: "antigravity", name: "Antigravity", flag: "--antigravity" },
];

// IDE options for rules-only installation
export const ideOptions = [
  {
    id: "all",
    name: "All IDEs",
    description: "Install Archeon rules for all supported IDEs at once",
    files: [
      ".cursorrules",
      ".cursor/README.md",
      ".github/copilot-instructions.md",
      ".windsurfrules",
      ".windsurf/README.md",
      ".clinerules",
      ".cline/README.md",
      ".aider.conf.yml",
      ".aider/README.md",
      ".vscode/settings.json",
    ],
  },
  {
    id: "cursor",
    name: "Cursor",
    description: "Optimized AI rules for Cursor AI editor",
    files: [".cursorrules", ".cursor/README.md"],
  },
  {
    id: "vscode",
    name: "VS Code + Copilot",
    description: "Copilot instructions + workspace settings for VS Code",
    files: [".github/copilot-instructions.md", ".vscode/settings.json"],
  },
  {
    id: "windsurf",
    name: "Windsurf",
    description: "AI assistant rules for Codeium's Windsurf",
    files: [".windsurfrules", ".windsurf/README.md"],
  },
  {
    id: "cline",
    name: "Cline",
    description: "Claude Dev / Cline assistant configuration",
    files: [".clinerules", ".cline/README.md"],
  },
  {
    id: "aider",
    name: "Aider",
    description: "Aider AI pair programming setup & rules",
    files: [".aider.conf.yml", ".aider/README.md"],
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    description: "GitHub Copilot instructions (works in any editor)",
    files: [".github/copilot-instructions.md"],
  },
  {
    id: "antigravity",
    name: "Antigravity",
    description: "AI agent rules for Antigravity IDE",
    files: [".agent/rules/archeon.md"],
  },
];

// CLI installation commands
// macOS uses Homebrew, Linux uses apt
// Installs archeon directly from GitHub
export const PIPX_INSTALL_COMMAND_MAC =
  "brew install pipx && pipx ensurepath && pipx install git+https://github.com/danaia/archeon.git";

export const PIPX_INSTALL_COMMAND_LINUX =
  "sudo apt update && sudo apt install -y pipx && pipx ensurepath && pipx install git+https://github.com/danaia/archeon.git";

// Get the appropriate pipx install command based on platform
export function getPipxInstallCommand() {
  const os = getOS();
  
  if (os === 'macos') {
    return PIPX_INSTALL_COMMAND_MAC;
  } else if (os === 'linux') {
    return PIPX_INSTALL_COMMAND_LINUX;
  } else {
    // Fallback for unsupported platforms
    return "echo && echo '❌ Unsupported platform for pipx installation' && echo 'Please install pipx manually'";
  }
}

// Legacy export for backwards compatibility
export const PIPX_INSTALL_COMMAND = PIPX_INSTALL_COMMAND_LINUX;

// Function to generate CLI install command based on platform and pipx availability
export function getCLIInstallCommand(isPipxInstalled) {
  const os = getOS();
  const usePipx = (os === 'macos' || os === 'linux') && isPipxInstalled;

  const tool = usePipx ? "pipx" : "pip";
  
  const installCmd = usePipx
    ? "pipx install git+https://github.com/danaia/archeon.git"
    : "python3 -m pip install --user git+https://github.com/danaia/archeon.git";

  return installCmd;
}
