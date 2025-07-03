/**
 * Audio IPC Handlers for Electron Main Process
 * 
 * This module sets up IPC handlers for audio file operations between
 * the renderer process and the main process AudioFileManager.
 * 
 * Key Features:
 * - IPC handlers for all audio file operations
 * - Error handling and validation
 * - Performance monitoring
 * - Resource cleanup
 */

import { ipcMain } from 'electron';
import { getAudioFileManager, initializeAudioFileManager } from './audio-handler';
import { logger } from '../../src/utils/logger';

/**
 * Initialize all audio IPC handlers
 * 
 * This function sets up all IPC handlers for audio operations.
 * Should be called once during app initialization.
 */
export function initializeAudioHandlers(): void {
  console.log('🔌 Initializing Audio IPC handlers');

  /**
   * Save audio blob data to filesystem
   */
  ipcMain.handle('audio:save-file', async (event, audioData: any, originalName?: string, mimeType?: string) => {
    const startTime = Date.now();
    
        try {
      // Validate and convert input data to Buffer
      if (!audioData) {
        throw new Error('Audio data is missing');
      }

      // Convert various data types to Buffer (IPC serialization can change types)
      let audioBuffer: Buffer;
      if (Buffer.isBuffer(audioData)) {
        audioBuffer = audioData;
      } else if (audioData instanceof Uint8Array) {
        audioBuffer = Buffer.from(audioData);
      } else if (Array.isArray(audioData)) {
        audioBuffer = Buffer.from(audioData);
      } else if (typeof audioData === 'object' && audioData.type === 'Buffer' && Array.isArray(audioData.data)) {
        // Handle serialized Buffer objects from IPC
        audioBuffer = Buffer.from(audioData.data);
      } else {
        throw new Error('Invalid audio data: must be Buffer, Uint8Array, or array');
      }

      if (audioBuffer.length === 0) {
        throw new Error('Audio data is empty');
      }

      console.log('📨 IPC: Saving audio file', {
        dataSize: audioBuffer.length,
        originalName,
        mimeType
      });

      const audioManager = getAudioFileManager();
      const result = await audioManager.saveAudioFile(audioBuffer, originalName, mimeType);
      
      const duration = Date.now() - startTime;
      console.log('✅ IPC: Audio file saved', {
        success: result.success,
        filePath: result.filePath,
        duration
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const duration = Date.now() - startTime;
      
      console.error('❌ IPC: Audio save failed', {
        error: errorMessage,
        duration
      });

      return { 
        success: false, 
        error: errorMessage 
      };
    }
  });

  /**
   * Convert audio file to optimal format
   */
  ipcMain.handle('audio:convert-file', async (event, inputPath: string, options?: any) => {
    const startTime = Date.now();
    
    try {
      console.log('📨 IPC: Converting audio file', { inputPath, options });

      if (!inputPath || typeof inputPath !== 'string') {
        throw new Error('Invalid input path');
      }

      const audioManager = getAudioFileManager();
      const result = await audioManager.convertAudioFile(inputPath, options);
      
      const duration = Date.now() - startTime;
      console.log('✅ IPC: Audio conversion completed', {
        success: result.success,
        inputPath,
        outputPath: result.filePath,
        duration
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const duration = Date.now() - startTime;
      
      console.error('❌ IPC: Audio conversion failed', {
        inputPath,
        error: errorMessage,
        duration
      });

      return { 
        success: false, 
        error: errorMessage 
      };
    }
  });

  /**
   * Get audio file information
   */
  ipcMain.handle('audio:get-file-info', async (event, filePath: string) => {
    try {
      console.log('📨 IPC: Getting audio file info', { filePath });

      if (!filePath || typeof filePath !== 'string') {
        throw new Error('Invalid file path');
      }

      const audioManager = getAudioFileManager();
      const result = await audioManager.getAudioFileInfo(filePath);
      
      console.log('✅ IPC: Audio file info retrieved', {
        success: result.success,
        filePath
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error('❌ IPC: Get file info failed', {
        filePath,
        error: errorMessage
      });

      return { 
        success: false, 
        error: errorMessage 
      };
    }
  });

  /**
   * Delete audio file from filesystem
   */
  ipcMain.handle('audio:delete-file', async (event, filePath: string) => {
    try {
      console.log('📨 IPC: Deleting audio file', { filePath });

      if (!filePath || typeof filePath !== 'string') {
        throw new Error('Invalid file path');
      }

      const audioManager = getAudioFileManager();
      const result = await audioManager.deleteAudioFile(filePath);
      
      console.log('✅ IPC: Audio file deleted', {
        success: result.success,
        filePath
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error('❌ IPC: Delete file failed', {
        filePath,
        error: errorMessage
      });

      return { 
        success: false, 
        error: errorMessage 
      };
    }
  });

  /**
   * Clean up old temporary files
   */
  ipcMain.handle('audio:cleanup-old-files', async (event, maxAge?: number) => {
    try {
      console.log('📨 IPC: Cleaning up old audio files', { maxAge });

      const audioManager = getAudioFileManager();
      const result = await audioManager.cleanupOldFiles(maxAge);
      
      console.log('✅ IPC: Audio cleanup completed', {
        deletedCount: result.deletedCount,
        errors: result.errors.length
      });

      return {
        success: true,
        deletedCount: result.deletedCount,
        errors: result.errors
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error('❌ IPC: Audio cleanup failed', {
        error: errorMessage
      });

      return { 
        success: false, 
        error: errorMessage 
      };
    }
  });

  /**
   * Get temporary directory path
   */
  ipcMain.handle('audio:get-temp-directory', async (event) => {
    try {
      console.log('📨 IPC: Getting temp directory');

      const audioManager = getAudioFileManager();
      const tempDir = audioManager.getTempDirectory();
      
      console.log('✅ IPC: Temp directory retrieved', { tempDir });
      return tempDir;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error('❌ IPC: Get temp directory failed', {
        error: errorMessage
      });

      throw error; // Let the renderer handle this error
    }
  });

  /**
   * Get list of active audio files
   */
  ipcMain.handle('audio:get-active-files', async (event) => {
    try {
      console.log('📨 IPC: Getting active audio files');

      const audioManager = getAudioFileManager();
      const activeFiles = audioManager.getActiveFiles();
      
      console.log('✅ IPC: Active files retrieved', { count: activeFiles.length });
      return {
        success: true,
        files: activeFiles
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error('❌ IPC: Get active files failed', {
        error: errorMessage
      });

      return { 
        success: false, 
        error: errorMessage 
      };
    }
  });

  console.log('✅ Audio IPC handlers initialized');
  logger.info('Audio IPC handlers initialized', {
    handlerCount: 6
  });
}

/**
 * Initialize audio file management system
 * 
 * This function initializes the audio file manager and IPC handlers.
 * Should be called during app startup.
 */
export async function initializeAudioSystem(): Promise<void> {
  console.log('🎵 Initializing audio system');
  
  try {
    // Initialize the audio file manager
    await initializeAudioFileManager();
    
    // Set up IPC handlers
    initializeAudioHandlers();
    
    console.log('✅ Audio system initialized successfully');
    logger.info('Audio system initialized');
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Failed to initialize audio system', { error: errorMessage });
    logger.error('Audio system initialization failed', { error: errorMessage });
    throw error;
  }
}

/**
 * Cleanup audio resources and handlers
 * 
 * Should be called when the app is closing.
 */
export function cleanupAudioHandlers(): void {
  console.log('🧹 Cleaning up audio handlers');
  
  // Remove all handlers
  ipcMain.removeHandler('audio:save-file');
  ipcMain.removeHandler('audio:convert-file');
  ipcMain.removeHandler('audio:get-file-info');
  ipcMain.removeHandler('audio:delete-file');
  ipcMain.removeHandler('audio:cleanup-old-files');
  ipcMain.removeHandler('audio:get-temp-directory');
  ipcMain.removeHandler('audio:get-active-files');
  
  console.log('✅ Audio handlers cleaned up');
  logger.info('Audio handlers cleaned up');
} 