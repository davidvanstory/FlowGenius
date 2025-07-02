/**
 * Audio File Handler for Electron Main Process
 * 
 * This module manages audio files on the desktop filesystem for FlowGenius.
 * It handles saving audio blobs from the renderer process, format conversion,
 * temporary file management, and cleanup operations.
 * 
 * Key Features:
 * - Save audio blobs to desktop filesystem
 * - Generate unique temporary file paths
 * - Audio format conversion for Whisper compatibility
 * - Automatic cleanup of temporary files
 * - File validation and error handling
 * - Integration with OS audio codecs
 */

import { app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../../src/utils/logger';

/**
 * Audio file operation result interface
 */
export interface AudioFileResult {
  success: boolean;
  filePath?: string;
  error?: string;
  metadata?: {
    size: number;
    format: string;
    duration?: number;
  };
}

/**
 * Audio conversion options
 */
export interface AudioConversionOptions {
  /** Target format (wav, mp3, etc.) */
  format?: 'wav' | 'mp3' | 'webm';
  /** Target sample rate in Hz */
  sampleRate?: number;
  /** Target channel count */
  channels?: number;
  /** Quality for lossy formats (0-1) */
  quality?: number;
  /** Whether to overwrite existing files */
  overwrite?: boolean;
}

/**
 * Audio file manager class
 */
export class AudioFileManager {
  private tempDir: string;
  private activeFiles: Set<string> = new Set();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Create temp directory for audio files
    this.tempDir = path.join(os.tmpdir(), 'flowgenius-audio');
    this.initializeTempDirectory();
    this.setupCleanupTimer();
  }

  /**
   * Initialize temporary directory for audio files
   */
  private async initializeTempDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      logger.info('✅ Audio temp directory initialized', { path: this.tempDir });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('❌ Failed to initialize audio temp directory', { error: errorMsg });
      throw new Error(`Failed to create audio temp directory: ${errorMsg}`);
    }
  }

  /**
   * Set up automatic cleanup timer for old temporary files
   */
  private setupCleanupTimer(): void {
    // Clean up temp files every 10 minutes
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldFiles().catch(error => {
        logger.error('❌ Automatic cleanup failed', { error: error.message });
      });
    }, 10 * 60 * 1000); // 10 minutes

    logger.debug('🕒 Audio cleanup timer started');
  }

  /**
   * Generate unique temporary file path
   * 
   * @param extension - File extension (e.g., 'wav', 'mp3')
   * @param prefix - Optional filename prefix
   * @returns Unique file path
   */
  private generateTempPath(extension: string, prefix: string = 'audio'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filename = `${prefix}_${timestamp}_${random}.${extension}`;
    return path.join(this.tempDir, filename);
  }

  /**
   * Detect file format from buffer
   * 
   * @param buffer - Audio file buffer
   * @returns Detected format or 'unknown'
   */
  private detectFormatFromBuffer(buffer: Buffer): string {
    // Check file headers/magic numbers
    if (buffer.length < 4) return 'unknown';

    // WAV format check
    if (buffer.subarray(0, 4).toString() === 'RIFF' && 
        buffer.subarray(8, 12).toString() === 'WAVE') {
      return 'wav';
    }

    // MP3 format check
    if (buffer[0] === 0xFF && buffer[1] && (buffer[1] & 0xE0) === 0xE0) {
      return 'mp3';
    }

    // WebM format check
    if (buffer.subarray(0, 4).equals(Buffer.from([0x1A, 0x45, 0xDF, 0xA3]))) {
      return 'webm';
    }

    // MP4/M4A format check
    if (buffer.subarray(4, 8).toString() === 'ftyp') {
      return 'mp4';
    }

    // OGG format check
    if (buffer.subarray(0, 4).toString() === 'OggS') {
      return 'ogg';
    }

    logger.warn('⚠️ Unknown audio format detected', { 
      header: buffer.subarray(0, 8).toString('hex') 
    });
    return 'unknown';
  }

  /**
   * Save audio blob data to filesystem
   * 
   * @param audioData - Audio data buffer from renderer process
   * @param originalName - Original filename (optional)
   * @param mimeType - MIME type of the audio (optional)
   * @returns Promise resolving to file path and metadata
   */
  async saveAudioFile(
    audioData: Buffer,
    originalName?: string,
    mimeType?: string
  ): Promise<AudioFileResult> {
    const startTime = Date.now();
    
    try {
      logger.info('💾 Saving audio file to filesystem', {
        dataSize: audioData.length,
        originalName,
        mimeType
      });

      // Validate input
      if (!audioData || audioData.length === 0) {
        throw new Error('Audio data is empty');
      }

      // Detect format from buffer and MIME type
      const detectedFormat = this.detectFormatFromBuffer(audioData);
      const mimeTypeParts = mimeType?.split('/');
      const formatFromMime = mimeTypeParts?.[1]?.split(';')[0] || null;
      const finalFormat = formatFromMime || detectedFormat || 'bin';

      // Generate file path
      const baseName = originalName ? path.parse(originalName).name : 'recording';
      const filePath = this.generateTempPath(finalFormat, baseName);

      // Write file to filesystem
      await fs.writeFile(filePath, audioData);
      
      // Track active file
      this.activeFiles.add(filePath);

      // Get file stats
      const stats = await fs.stat(filePath);

      const result: AudioFileResult = {
        success: true,
        filePath,
        metadata: {
          size: stats.size,
          format: finalFormat
        }
      };

      const saveTime = Date.now() - startTime;
      logger.info('✅ Audio file saved successfully', {
        filePath,
        size: stats.size,
        format: finalFormat,
        saveTime
      });

      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const saveTime = Date.now() - startTime;
      
      logger.error('❌ Failed to save audio file', {
        error: errorMsg,
        dataSize: audioData?.length || 0,
        saveTime
      });

      return {
        success: false,
        error: errorMsg
      };
    }
  }

  /**
   * Convert audio file to optimal format for Whisper API
   * 
   * @param inputPath - Path to input audio file
   * @param options - Conversion options
   * @returns Promise resolving to converted file path
   */
  async convertAudioFile(
    inputPath: string,
    options: AudioConversionOptions = {}
  ): Promise<AudioFileResult> {
    const startTime = Date.now();

    try {
      logger.info('🔄 Converting audio file', { inputPath, options });

      // Validate input file
      const inputStats = await fs.stat(inputPath);
      if (!inputStats.isFile()) {
        throw new Error('Input path is not a file');
      }

      // Set default conversion options
      const convertOptions: Required<AudioConversionOptions> = {
        format: 'wav',
        sampleRate: 16000,
        channels: 1,
        quality: 0.8,
        overwrite: false,
        ...options
      };

      // Generate output path
      const inputExt = path.extname(inputPath);
      const baseName = path.basename(inputPath, inputExt);
      const outputPath = this.generateTempPath(
        convertOptions.format, 
        `${baseName}_converted`
      );

      // For now, we'll do a simple copy operation
      // In a full implementation, you would use audio processing libraries
      // like FFmpeg or native OS audio APIs for actual conversion
      await this.performAudioConversion(inputPath, outputPath, convertOptions);

      // Track active file
      this.activeFiles.add(outputPath);

      // Get output file stats
      const outputStats = await fs.stat(outputPath);

      const result: AudioFileResult = {
        success: true,
        filePath: outputPath,
        metadata: {
          size: outputStats.size,
          format: convertOptions.format
        }
      };

      const conversionTime = Date.now() - startTime;
      logger.info('✅ Audio conversion completed', {
        inputPath,
        outputPath,
        inputSize: inputStats.size,
        outputSize: outputStats.size,
        conversionTime
      });

      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const conversionTime = Date.now() - startTime;
      
      logger.error('❌ Audio conversion failed', {
        inputPath,
        error: errorMsg,
        conversionTime
      });

      return {
        success: false,
        error: errorMsg
      };
    }
  }

  /**
   * Perform actual audio conversion (placeholder implementation)
   * 
   * @param inputPath - Input file path
   * @param outputPath - Output file path  
   * @param options - Conversion options
   */
  private async performAudioConversion(
    inputPath: string,
    outputPath: string,
    options: AudioConversionOptions
  ): Promise<void> {
    // This is a placeholder implementation
    // In a production environment, you would integrate with:
    // 1. FFmpeg for cross-platform audio conversion
    // 2. Native OS APIs (AVFoundation on macOS, Media Foundation on Windows)
    // 3. Or dedicated audio processing libraries

    logger.warn('⚠️ Using placeholder audio conversion (copy operation)', {
      inputPath,
      outputPath,
      options
    });

    // For now, just copy the file
    // This maintains the file structure for testing
    await fs.copyFile(inputPath, outputPath);

    // In a real implementation, you would:
    // - Load the audio file
    // - Decode to PCM
    // - Resample to target sample rate
    // - Convert channels (stereo to mono)
    // - Encode to target format
    // - Save to output path
  }

  /**
   * Get audio file information
   * 
   * @param filePath - Path to audio file
   * @returns Promise resolving to file metadata
   */
  async getAudioFileInfo(filePath: string): Promise<AudioFileResult> {
    try {
      logger.debug('📊 Getting audio file info', { filePath });

      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        throw new Error('Path is not a file');
      }

      // Read file header to detect format
      const fileHandle = await fs.open(filePath, 'r');
      const buffer = Buffer.alloc(64); // Read first 64 bytes for format detection
      await fileHandle.read(buffer, 0, 64, 0);
      await fileHandle.close();

      const format = this.detectFormatFromBuffer(buffer);

      const result: AudioFileResult = {
        success: true,
        filePath,
        metadata: {
          size: stats.size,
          format
        }
      };

      logger.info('✅ Audio file info retrieved', result);
      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      logger.error('❌ Failed to get audio file info', {
        filePath,
        error: errorMsg
      });

      return {
        success: false,
        error: errorMsg
      };
    }
  }

  /**
   * Delete audio file from filesystem
   * 
   * @param filePath - Path to file to delete
   * @returns Promise resolving to success status
   */
  async deleteAudioFile(filePath: string): Promise<AudioFileResult> {
    try {
      logger.debug('🗑️ Deleting audio file', { filePath });

      await fs.unlink(filePath);
      this.activeFiles.delete(filePath);

      logger.info('✅ Audio file deleted successfully', { filePath });
      
      return { success: true };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      logger.error('❌ Failed to delete audio file', {
        filePath,
        error: errorMsg
      });

      return {
        success: false,
        error: errorMsg
      };
    }
  }

  /**
   * Clean up old temporary files
   * 
   * @param maxAge - Maximum age in milliseconds (default: 1 hour)
   * @returns Promise resolving to cleanup statistics
   */
  async cleanupOldFiles(maxAge: number = 60 * 60 * 1000): Promise<{
    deletedCount: number;
    errors: string[];
  }> {
    const startTime = Date.now();
    let deletedCount = 0;
    const errors: string[] = [];

    try {
      logger.debug('🧹 Starting audio file cleanup', { maxAge, tempDir: this.tempDir });

      const files = await fs.readdir(this.tempDir);
      const cutoffTime = Date.now() - maxAge;

      for (const file of files) {
        try {
          const filePath = path.join(this.tempDir, file);
          const stats = await fs.stat(filePath);

          if (stats.mtime.getTime() < cutoffTime) {
            await fs.unlink(filePath);
            this.activeFiles.delete(filePath);
            deletedCount++;
            logger.debug('🗑️ Deleted old audio file', { filePath, age: Date.now() - stats.mtime.getTime() });
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`Failed to delete ${file}: ${errorMsg}`);
          logger.warn('⚠️ Failed to delete old file', { file, error: errorMsg });
        }
      }

      const cleanupTime = Date.now() - startTime;
      logger.info('✅ Audio file cleanup completed', {
        deletedCount,
        errors: errors.length,
        cleanupTime
      });

      return { deletedCount, errors };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('❌ Audio cleanup failed', { error: errorMsg });
      
      return {
        deletedCount,
        errors: [errorMsg]
      };
    }
  }

  /**
   * Get list of active audio files
   * 
   * @returns Array of active file paths
   */
  getActiveFiles(): string[] {
    return Array.from(this.activeFiles);
  }

  /**
   * Get temporary directory path
   * 
   * @returns Temporary directory path
   */
  getTempDirectory(): string {
    return this.tempDir;
  }

  /**
   * Clean up all resources and stop timers
   */
  async cleanup(): Promise<void> {
    logger.info('🧹 Cleaning up AudioFileManager');

    // Clear cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Delete all active files
    const deletePromises = Array.from(this.activeFiles).map(async (filePath) => {
      try {
        await fs.unlink(filePath);
        logger.debug('🗑️ Deleted active file during cleanup', { filePath });
      } catch (error) {
        logger.warn('⚠️ Failed to delete file during cleanup', { 
          filePath, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    });

    await Promise.all(deletePromises);
    this.activeFiles.clear();

    logger.info('✅ AudioFileManager cleanup completed');
  }
}

// Global instance for the application
let audioFileManager: AudioFileManager | null = null;

/**
 * Get or create the global audio file manager instance
 * 
 * @returns Global AudioFileManager instance
 */
export function getAudioFileManager(): AudioFileManager {
  if (!audioFileManager) {
    audioFileManager = new AudioFileManager();
    
    // Clean up on app quit
    app.on('before-quit', async () => {
      if (audioFileManager) {
        await audioFileManager.cleanup();
      }
    });
  }
  
  return audioFileManager;
}

/**
 * Initialize audio file management system
 * 
 * @returns Promise resolving when initialization is complete
 */
export async function initializeAudioFileManager(): Promise<void> {
  logger.info('🎵 Initializing audio file management system');
  
  try {
    const manager = getAudioFileManager();
    logger.info('✅ Audio file management system initialized', {
      tempDir: manager.getTempDirectory()
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('❌ Failed to initialize audio file management', { error: errorMsg });
    throw error;
  }
} 