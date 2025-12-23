/**
 * Type declarations for Electron API exposed via preload script
 */

interface PtySpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

interface PtySpawnResult {
  id: number;
  pid: number;
}

interface PtyDataEvent {
  id: number;
  data: string;
}

interface PtyExitEvent {
  id: number;
  exitCode: number;
  signal?: number;
}

interface OpenProjectResult {
  canceled: boolean;
  path: string | null;
  valid?: boolean;
}

interface WatchResult {
  success: boolean;
  error?: string;
  initialIndex?: {
    success: boolean;
    data?: object;
    error?: string;
  };
  initialArcon?: {
    success: boolean;
    content?: string;
    chains?: object[];
    error?: string;
  };
}

interface FileReadResult {
  success: boolean;
  content?: string;
  error?: string;
}

interface ElectronAPI {
  // Project
  openProject: () => Promise<OpenProjectResult>;

  // PTY Terminal
  ptySpawn: (options?: PtySpawnOptions) => Promise<PtySpawnResult>;
  ptyWrite: (id: number, data: string) => void;
  ptyResize: (id: number, cols: number, rows: number) => void;
  ptyKill: (id: number) => void;
  onPtyData: (callback: (data: PtyDataEvent) => void) => () => void;
  onPtyExit: (callback: (data: PtyExitEvent) => void) => () => void;

  // Archeon Watcher
  archeonWatch: (projectPath: string) => Promise<WatchResult>;
  archeonStop: () => Promise<boolean>;
  archeonReadIndex: (projectPath: string) => Promise<object>;
  archeonReadArcon: (projectPath: string) => Promise<object>;
  onArcheonIndexChanged: (callback: (data: object) => void) => () => void;
  onArcheonArconChanged: (callback: (data: object) => void) => () => void;

  // File System
  readFile: (filePath: string) => Promise<FileReadResult>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
