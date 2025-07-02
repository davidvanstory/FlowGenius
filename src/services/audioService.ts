/**
 * Audio Service for Renderer Process
 * 
 * This service provides a clean API for audio file operations from the renderer process.
 * It communicates with the main process via IPC to handle desktop filesystem operations,
 * audio format conversion, and file management.
 * 
 * Key Features:
 * - Save audio blobs to desktop filesystem via IPC
 * - Convert audio formats for Whisper compatibility
 * - Validate audio before processing
 * - Manage temporary audio files
 * - Comprehensive error handling and logging
 */

import { logger } from '../utils/logger';
import { 
  validateAudioForWhisper, 
  calculateOptimalSettings,
  type AudioValidationResult,
  type AudioConversionConfig,
  type AudioMetadata
} from '../utils/audioUtils';

/**
 * Audio service operation result
 */
export interface AudioServiceResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  duration?: number;
}

/**
 * Audio save result with file path and metadata
 */
export interface AudioSaveResult {
  filePath: string;
  metadata: {
    size: number;
    format: string;
    duration?: number;
  };
  validation: AudioValidationResult;
  conversionConfig?: AudioConversionConfig;
}

/**
 * Audio processing options
 */
export interface AudioProcessingOptions {
  /** Whether to validate audio for Whisper compatibility */
  validate?: boolean;
  /** Whether to convert to optimal format */
  convert?: boolean;
  /** Custom conversion configuration */
  conversionConfig?: AudioConversionConfig;
  /** Custom filename for saved audio */
  filename?: string;
  /** Whether to cleanup original file after conversion */
  cleanupOriginal?: boolean;
}

/**
 * Audio service class for renderer process
 */
export class AudioService {
  private processingQueue: Map<string, Promise<AudioServiceResult>> = new Map();

  /**
   * Check if window.electron is available
   */
  private checkElectronAPI(): boolean {
    if (typeof window === 'undefined' || !window.electron) {
      logger.error('❌ Electron API not available in renderer process');
      return false;
    }
    return true;
  }

  /**
   * Save audio blob to desktop filesystem
   * 
   * @param audioBlob - Audio blob to save
   * @param options - Processing options
   * @returns Promise resolving to save result
   */
  async saveAudioBlob(
    audioBlob: Blob, 
    options: AudioProcessingOptions = {}
  ): Promise<AudioServiceResult<AudioSaveResult>> {
    const startTime = Date.now();
    const operationId = `save_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    logger.info('💾 AudioService: Saving audio blob', {
      operationId,
      blobSize: audioBlob.size,
      blobType: audioBlob.type,
      options
    });

    try {
      // Check Electron API availability
      if (!this.checkElectronAPI()) {
        throw new Error('Electron API not available');
      }

      // Validate options
      const processOptions = {
        validate: true,
        convert: false,
        cleanupOriginal: false,
        ...options
      };

      // Convert blob to buffer
      const arrayBuffer = await audioBlob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Validate audio if requested
      let validation: AudioValidationResult | undefined;
      if (processOptions.validate) {
        validation = await validateAudioForWhisper(audioBlob);
        logger.info('🔍 Audio validation completed', {
          operationId,
          isValid: validation.isValid,
          errors: validation.errors.length,
          warnings: validation.warnings.length
        });
      }

      // Save to filesystem via IPC
      const saveResult = await window.electron.audio.saveAudioFile(
        buffer,
        processOptions.filename,
        audioBlob.type
      );

      if (!saveResult.success) {
        throw new Error(saveResult.error || 'Failed to save audio file');
      }

      let finalFilePath = saveResult.filePath!;
      let conversionConfig: AudioConversionConfig | undefined;

      // Convert if requested and validation suggests it
      if (processOptions.convert && validation && finalFilePath) {
        const shouldConvert = !validation.isValid || 
                             validation.warnings.length > 0 ||
                             audioBlob.type !== 'audio/wav';

        if (shouldConvert) {
          const metadata: AudioMetadata = validation.metadata!;
          conversionConfig = processOptions.conversionConfig || calculateOptimalSettings(metadata);
          
          logger.info('🔄 Converting audio for optimal format', {
            operationId,
            originalFormat: metadata.format,
            targetConfig: conversionConfig
          });

          const convertResult = await window.electron.audio.convertAudioFile(
            finalFilePath,
            conversionConfig
          );

          if (convertResult.success && convertResult.filePath) {
            // Cleanup original if requested
            if (processOptions.cleanupOriginal) {
              await window.electron.audio.deleteAudioFile(finalFilePath);
            }
            finalFilePath = convertResult.filePath;
          } else {
            logger.warn('⚠️ Audio conversion failed, using original file', {
              operationId,
              error: convertResult.error
            });
          }
        }
      }

      const result: AudioSaveResult = {
        filePath: finalFilePath,
        metadata: saveResult.metadata || {
          size: audioBlob.size,
          format: audioBlob.type.split('/')[1] || 'unknown'
        },
        validation: validation || {
          isValid: true,
          errors: [],
          warnings: [],
          recommendations: [],
          metadata: {
            duration: 0,
            fileSize: audioBlob.size,
            mimeType: audioBlob.type,
            format: audioBlob.type.split('/')[1] || 'unknown'
          }
        },
        conversionConfig
      };

      const duration = Date.now() - startTime;
      logger.info('✅ AudioService: Audio blob saved successfully', {
        operationId,
        filePath: finalFilePath,
        size: result.metadata.size,
        duration
      });

      return {
        success: true,
        data: result,
        duration
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const duration = Date.now() - startTime;
      
      logger.error('❌ AudioService: Failed to save audio blob', {
        operationId,
        error: errorMsg,
        duration
      });

      return {
        success: false,
        error: errorMsg,
        duration
      };
    }
  }

  /**
   * Process multiple audio blobs in sequence
   * 
   * @param audioBlobs - Array of audio blobs to process
   * @param options - Processing options
   * @returns Promise resolving to array of results
   */
  async processBatchAudioBlobs(
    audioBlobs: Blob[],
    options: AudioProcessingOptions = {}
  ): Promise<AudioServiceResult<AudioSaveResult[]>> {
    const startTime = Date.now();
    const operationId = `batch_${Date.now()}_${audioBlobs.length}`;

    logger.info('📦 AudioService: Processing batch of audio blobs', {
      operationId,
      count: audioBlobs.length,
      totalSize: audioBlobs.reduce((sum, blob) => sum + blob.size, 0)
    });

    try {
      const results: AudioSaveResult[] = [];
      const errors: string[] = [];

      for (let i = 0; i < audioBlobs.length; i++) {
        const blob = audioBlobs[i];
        const blobOptions = {
          ...options,
          filename: options.filename ? `${options.filename}_${i + 1}` : undefined
        };

        let result: AudioServiceResult<AudioSaveResult>;
        
        if (blob) {
          result = await this.saveAudioBlob(blob, blobOptions);
        } else {
          result = {
            success: false,
            error: 'Empty blob'
          };
        }
        
        if (result.success && result.data) {
          results.push(result.data);
        } else {
          errors.push(`Blob ${i + 1}: ${result.error}`);
        }
      }

      const duration = Date.now() - startTime;
      
      if (errors.length === 0) {
        logger.info('✅ AudioService: Batch processing completed successfully', {
          operationId,
          processed: results.length,
          duration
        });

        return {
          success: true,
          data: results,
          duration
        };
      } else {
        logger.warn('⚠️ AudioService: Batch processing completed with errors', {
          operationId,
          successful: results.length,
          failed: errors.length,
          errors: errors.slice(0, 3), // Log first 3 errors
          duration
        });

        return {
          success: false,
          error: `${errors.length} of ${audioBlobs.length} failed: ${errors.join('; ')}`,
          duration
        };
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const duration = Date.now() - startTime;
      
      logger.error('❌ AudioService: Batch processing failed', {
        operationId,
        error: errorMsg,
        duration
      });

      return {
        success: false,
        error: errorMsg,
        duration
      };
    }
  }

  /**
   * Get audio file information from filesystem
   * 
   * @param filePath - Path to audio file
   * @returns Promise resolving to file information
   */
  async getAudioFileInfo(filePath: string): Promise<AudioServiceResult> {
    logger.debug('📊 AudioService: Getting audio file info', { filePath });

    try {
      if (!this.checkElectronAPI()) {
        throw new Error('Electron API not available');
      }

      const result = await window.electron.audio.getAudioFileInfo(filePath);
      
      if (result.success) {
        logger.info('✅ AudioService: File info retrieved', {
          filePath,
          metadata: result.metadata
        });
      }

      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      logger.error('❌ AudioService: Failed to get file info', {
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
  async deleteAudioFile(filePath: string): Promise<AudioServiceResult> {
    logger.debug('🗑️ AudioService: Deleting audio file', { filePath });

    try {
      if (!this.checkElectronAPI()) {
        throw new Error('Electron API not available');
      }

      const result = await window.electron.audio.deleteAudioFile(filePath);
      
      if (result.success) {
        logger.info('✅ AudioService: File deleted successfully', { filePath });
      }

      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      logger.error('❌ AudioService: Failed to delete file', {
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
   * Clean up old temporary audio files
   * 
   * @param maxAge - Maximum age in milliseconds (default: 1 hour)
   * @returns Promise resolving to cleanup statistics
   */
  async cleanupTempFiles(maxAge?: number): Promise<AudioServiceResult> {
    logger.debug('🧹 AudioService: Cleaning up temporary files', { maxAge });

    try {
      if (!this.checkElectronAPI()) {
        throw new Error('Electron API not available');
      }

      const result = await window.electron.audio.cleanupOldFiles(maxAge);
      
      if (result.success) {
        logger.info('✅ AudioService: Cleanup completed', {
          deletedCount: result.deletedCount,
          errors: result.errors?.length || 0
        });
      }

      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      logger.error('❌ AudioService: Cleanup failed', { error: errorMsg });

      return {
        success: false,
        error: errorMsg
      };
    }
  }

  /**
   * Get temporary directory path
   * 
   * @returns Promise resolving to temp directory path
   */
  async getTempDirectory(): Promise<AudioServiceResult<string>> {
    logger.debug('📁 AudioService: Getting temp directory path');

    try {
      if (!this.checkElectronAPI()) {
        throw new Error('Electron API not available');
      }

      const result = await window.electron.audio.getTempDirectory();
      
      return {
        success: true,
        data: result
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      logger.error('❌ AudioService: Failed to get temp directory', { error: errorMsg });

      return {
        success: false,
        error: errorMsg
      };
    }
  }

  /**
   * Check if audio service is available
   * 
   * @returns Whether the service is available
   */
  isAvailable(): boolean {
    return this.checkElectronAPI() && 
           typeof window.electron.audio === 'object' &&
           typeof window.electron.audio.saveAudioFile === 'function';
  }

  /**
   * Get service status and capabilities
   * 
   * @returns Service status information
   */
  getStatus(): {
    available: boolean;
    capabilities: string[];
    activeOperations: number;
  } {
    const available = this.isAvailable();
    
    const capabilities = available ? [
      'saveAudioFile',
      'convertAudioFile', 
      'getAudioFileInfo',
      'deleteAudioFile',
      'cleanupOldFiles',
      'getTempDirectory'
    ] : [];

    return {
      available,
      capabilities,
      activeOperations: this.processingQueue.size
    };
  }
}

// Create and export global audio service instance
export const audioService = new AudioService();

// Export AudioService class for dependency injection if needed
export default AudioService; 