/**
 * TypeScript definitions for Electron API exposed to renderer process
 * This file provides type safety for the Electron bridge functionality
 * used throughout the FlowGenius application.
 */

/**
 * IPC Renderer API exposed through contextBridge
 */
interface IpcRendererAPI {
  /**
   * Listen for IPC messages from main process
   */
  on(channel: string, listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void): void;
  
  /**
   * Remove IPC message listener
   */
  off(channel: string, listener?: (...args: any[]) => void): void;
  
  /**
   * Send IPC message to main process
   */
  send(channel: string, ...args: any[]): void;
  
  /**
   * Invoke IPC method in main process and return result
   */
  invoke(channel: string, ...args: any[]): Promise<any>;
}

/**
 * File system operations exposed to renderer
 */
interface ElectronFileAPI {
  /**
   * Read file content from disk
   */
  readFile(filePath: string): Promise<{ success: boolean; data?: string; error?: string }>;
  
  /**
   * Write file content to disk
   */
  writeFile(filePath: string, content: string): Promise<{ success: boolean; error?: string }>;
  
  /**
   * Check if file exists
   */
  exists(filePath: string): Promise<boolean>;
  
  /**
   * Get file stats
   */
  stat(filePath: string): Promise<{ success: boolean; data?: any; error?: string }>;
}

/**
 * Environment variables API for secure access to main process env vars
 */
interface ElectronEnvAPI {
  /**
   * Get environment variables needed by renderer process
   */
  getVars(): Promise<{ 
    success: boolean; 
    data?: {
      OPENAI_API_KEY?: string;
      NODE_ENV?: string;
      SUPABASE_URL?: string;
      SUPABASE_ANON_KEY?: string;
    };
    error?: string;
  }>;
}

/**
 * Audio recording operations for FlowGenius
 */
interface ElectronAudioAPI {
  /**
   * Start audio recording
   */
  startRecording(): Promise<{ success: boolean; error?: string }>;
  
  /**
   * Stop audio recording and get file path
   */
  stopRecording(): Promise<{ success: boolean; filePath?: string; error?: string }>;
  
  /**
   * Get available audio input devices
   */
  getAudioDevices(): Promise<{ success: boolean; devices?: MediaDeviceInfo[]; error?: string }>;
  
  /**
   * Save audio blob data to filesystem
   */
  saveAudioFile(
    audioData: Uint8Array | Buffer, 
    originalName?: string, 
    mimeType?: string
  ): Promise<{ 
    success: boolean; 
    filePath?: string; 
    error?: string;
    metadata?: {
      size: number;
      format: string;
      duration?: number;
    };
  }>;
  
  /**
   * Convert audio file to optimal format
   */
  convertAudioFile(
    inputPath: string,
    options?: {
      format?: 'wav' | 'mp3' | 'webm';
      sampleRate?: number;
      channels?: number;
      quality?: number;
      overwrite?: boolean;
    }
  ): Promise<{ 
    success: boolean; 
    filePath?: string; 
    error?: string;
    metadata?: {
      size: number;
      format: string;
      duration?: number;
    };
  }>;
  
  /**
   * Get audio file information
   */
  getAudioFileInfo(filePath: string): Promise<{ 
    success: boolean; 
    filePath?: string;
    error?: string;
    metadata?: {
      size: number;
      format: string;
      duration?: number;
    };
  }>;
  
  /**
   * Delete audio file from filesystem
   */
  deleteAudioFile(filePath: string): Promise<{ success: boolean; error?: string }>;
  
  /**
   * Clean up old temporary files
   */
  cleanupOldFiles(maxAge?: number): Promise<{ 
    success: boolean; 
    deletedCount?: number;
    errors?: string[];
    error?: string;
  }>;
  
  /**
   * Get temporary directory path
   */
  getTempDirectory(): Promise<string>;
}

/**
 * Application control operations
 */
interface ElectronAppAPI {
  /**
   * Get application version
   */
  getVersion(): Promise<string>;
  
  /**
   * Check for application updates
   */
  checkForUpdates(): Promise<{ success: boolean; hasUpdate?: boolean; error?: string }>;
  
  /**
   * Quit the application
   */
  quit(): void;
  
  /**
   * Minimize window
   */
  minimize(): void;
  
  /**
   * Maximize window
   */
  maximize(): void;
  
  /**
   * Close window
   */
  close(): void;
}

/**
 * Complete Electron API interface
 */
interface ElectronAPI {
  ipcRenderer: IpcRendererAPI;
  files: ElectronFileAPI;
  audio: ElectronAudioAPI;
  app: ElectronAppAPI;
  env: ElectronEnvAPI;
}

/**
 * Global window interface extension
 * This makes the Electron API available on window.electron with proper typing
 */
declare global {
  interface Window {
    electron: ElectronAPI;
    ipcRenderer: IpcRendererAPI;
  }
}

/**
 * IPC Channel constants for type-safe communication
 */
export const IPC_CHANNELS = {
  // File operations
  READ_FILE: 'file:read',
  WRITE_FILE: 'file:write',
  FILE_EXISTS: 'file:exists',
  FILE_STAT: 'file:stat',
  
  // Audio operations
  AUDIO_START_RECORDING: 'audio:start-recording',
  AUDIO_STOP_RECORDING: 'audio:stop-recording',
  AUDIO_GET_DEVICES: 'audio:get-devices',
  
  // App operations
  APP_GET_VERSION: 'app:get-version',
  APP_CHECK_UPDATES: 'app:check-updates',
  APP_QUIT: 'app:quit',
  APP_MINIMIZE: 'app:minimize',
  APP_MAXIMIZE: 'app:maximize',
  APP_CLOSE: 'app:close',
  
  // FlowGenius specific
  LANGGRAPH_EXECUTE: 'langgraph:execute',
  WHISPER_TRANSCRIBE: 'whisper:transcribe',
  OPENAI_CHAT: 'openai:chat',
} as const;

/**
 * Type for IPC channel names
 */
export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

/**
 * Electron environment detection utility types
 */
export interface ElectronEnvironment {
  isElectron: boolean;
  isMain: boolean;
  isRenderer: boolean;
  isPreload: boolean;
  platform: NodeJS.Platform;
  version: string;
}

/**
 * Utility function to detect Electron environment
 */
export function getElectronEnvironment(): ElectronEnvironment {
  const isElectron = typeof window !== 'undefined' && window.electron !== undefined;
  
  return {
    isElectron,
    isMain: typeof window === 'undefined' && typeof process !== 'undefined',
    isRenderer: typeof window !== 'undefined',
    isPreload: typeof window !== 'undefined' && typeof require !== 'undefined',
    platform: typeof process !== 'undefined' ? process.platform : 'unknown' as NodeJS.Platform,
    version: typeof process !== 'undefined' ? process.versions.electron || 'unknown' : 'unknown'
  };
}

// Export types for use in other files
export type {
  IpcRendererAPI,
  ElectronFileAPI,
  ElectronEnvAPI,
  ElectronAudioAPI,
  ElectronAppAPI,
  ElectronAPI,
  ElectronEnvironment
}; 