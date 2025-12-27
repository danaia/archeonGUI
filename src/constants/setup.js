// Setup modal constants and configuration

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
];

// CLI installation commands
export const PIPX_INSTALL_COMMAND =
  "echo && echo '=== Installing pipx + Archeon CLI ===' && echo && echo 'Step 1/2: Installing pipx via apt...' && sudo apt update && sudo apt install -y pipx && pipx ensurepath && echo && echo '[OK] pipx installed!' && echo && echo 'Step 2/2: Installing Archeon CLI via pipx...' && pipx install git+https://github.com/danaia/archeon.git && echo && echo '[OK] Archeon CLI installed! Try: archeon --help'";

// Function to generate CLI install command based on platform and pipx availability
export function getCLIInstallCommand(isPipxInstalled) {
  const isLinux = navigator.platform.toLowerCase().includes("linux");
  const usePipx = isLinux && isPipxInstalled;

  const tool = usePipx ? "pipx" : "pip";
  const installCmd = usePipx
    ? "pipx install git+https://github.com/danaia/archeon.git"
    : "pip install git+https://github.com/danaia/archeon.git";

  return `echo && echo '=== ARCHEON CLI - Global Installation ===' && echo && echo 'Installing Archeon CLI using ${tool}...' && ${installCmd} && echo && echo '[OK] Installation complete! Try: archeon --help'`;
}
