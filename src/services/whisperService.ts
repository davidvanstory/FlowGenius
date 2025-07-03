/**
 * Whisper Service for Voice-to-Text Transcription
 * 
 * This service handles all interactions with the OpenAI Whisper API for speech-to-text
 * conversion. It provides a clean interface for transcribing audio files and blobs,
 * with comprehensive error handling, retry logic, and integration with our audio utilities.
 * 
 * Key Features:
 * - OpenAI Whisper API integration with proper authentication
 * - Audio format validation and optimization
 * - Retry logic with exponential backoff
 * - Rate limiting and quota management
 * - Comprehensive error handling and logging
 * - Support for multiple audio formats
 * - Batch processing capabilities
 * - Integration with audio file management system
 */

import { logger } from '../utils/logger';
import { 
  validateAudioForWhisper, 
  createProcessingSummary,
  type AudioValidationResult,
  type AudioMetadata,
  WHISPER_CONSTRAINTS
} from '../utils/audioUtils';

/**
 * Whisper API configuration
 */
interface WhisperConfig {
  /** OpenAI API key */
  apiKey: string;
  /** API base URL (default: OpenAI) */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Base delay for exponential backoff (ms) */
  retryDelay?: number;
  /** Organization ID (optional) */
  organization?: string;
  /** Custom headers for requests */
  customHeaders?: Record<string, string>;
}

/**
 * Whisper transcription options
 */
interface WhisperTranscriptionOptions {
  /** Language code (ISO-639-1) - auto-detected if not provided */
  language?: string;
  /** Response format (text, json, srt, verbose_json, vtt) */
  responseFormat?: 'text' | 'json' | 'srt' | 'verbose_json' | 'vtt';
  /** Temperature for randomness (0-1) */
  temperature?: number;
  /** Custom prompt to guide the model */
  prompt?: string;
  /** Timestamp granularities for segments */
  timestampGranularities?: ('word' | 'segment')[];
  /** Whether to validate audio before transcription */
  validateAudio?: boolean;
  /** Whether to include confidence scores (verbose_json only) */
  includeConfidence?: boolean;
}

/**
 * Whisper transcription result
 */
interface WhisperTranscriptionResult {
  /** Transcribed text */
  text: string;
  /** Language detected/used */
  language?: string;
  /** Duration of the audio in seconds */
  duration?: number;
  /** Segments with timestamps (if requested) */
  segments?: WhisperSegment[];
  /** Word-level timestamps (if requested) */
  words?: WhisperWord[];
  /** Processing metadata */
  metadata: {
    /** Time taken for API request */
    processingTime: number;
    /** Number of retry attempts */
    retryAttempts: number;
    /** Audio validation result */
    audioValidation: AudioValidationResult;
    /** File size processed */
    fileSize: number;
    /** Response format used */
    responseFormat: string;
  };
}

/**
 * Whisper segment with timestamps
 */
interface WhisperSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avgLogprob: number;
  compressionRatio: number;
  noSpeechProb: number;
  confidence?: number;
}

/**
 * Whisper word with timestamps
 */
interface WhisperWord {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

/**
 * Service operation result
 */
interface WhisperServiceResult<T = WhisperTranscriptionResult> {
  success: boolean;
  data?: T;
  error?: string;
  retryCount?: number;
  duration?: number;
}

/**
 * Default Whisper configuration
 */
const DEFAULT_WHISPER_CONFIG: Partial<WhisperConfig> = {
  baseUrl: 'https://api.openai.com/v1',
  timeout: 30000, // 30 seconds
  maxRetries: 3,
  retryDelay: 1000 // 1 second base delay
};

/**
 * Default transcription options
 */
const DEFAULT_TRANSCRIPTION_OPTIONS: WhisperTranscriptionOptions = {
  responseFormat: 'verbose_json',
  temperature: 0,
  validateAudio: true,
  includeConfidence: true,
  timestampGranularities: ['segment']
};

/**
 * Whisper service for speech-to-text transcription
 */
export class WhisperService {
  private config: Required<WhisperConfig>;
  private requestCount: number = 0;
  private lastRequestTime: number = 0;
  private rateLimitDelay: number = 100; // Minimum delay between requests

  /**
   * Create a new WhisperService instance
   * 
   * @param config - Whisper service configuration
   */
  constructor(config: WhisperConfig) {
    logger.info('🎙️ Initializing WhisperService', {
      baseUrl: config.baseUrl || DEFAULT_WHISPER_CONFIG.baseUrl,
      hasApiKey: !!config.apiKey,
      timeout: config.timeout || DEFAULT_WHISPER_CONFIG.timeout
    });

    // Validate required configuration
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required for WhisperService');
    }

    // Merge with defaults
    this.config = {
      ...DEFAULT_WHISPER_CONFIG,
      ...config
    } as Required<WhisperConfig>;

    logger.info('✅ WhisperService initialized successfully');
  }

  /**
   * Transcribe audio blob to text
   * 
   * @param audioBlob - Audio blob to transcribe
   * @param options - Transcription options
   * @returns Promise resolving to transcription result
   */
  async transcribeBlob(
    audioBlob: Blob,
    options: WhisperTranscriptionOptions = {}
  ): Promise<WhisperServiceResult> {
    const startTime = Date.now();
    const operationId = `transcribe_blob_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    logger.info('🎙️ WhisperService: Starting blob transcription', {
      operationId,
      blobSize: audioBlob.size,
      blobType: audioBlob.type,
      options
    });

    try {
      // Merge options with defaults
      const transcriptionOptions = { ...DEFAULT_TRANSCRIPTION_OPTIONS, ...options };

      // Validate audio if requested
      let audioValidation: AudioValidationResult;
      if (transcriptionOptions.validateAudio) {
        audioValidation = await validateAudioForWhisper(audioBlob);
        
        logger.info('🔍 Audio validation completed', {
          operationId,
          isValid: audioValidation.isValid,
          errors: audioValidation.errors.length,
          warnings: audioValidation.warnings.length
        });

        // Stop if audio is invalid
        if (!audioValidation.isValid) {
          const errorMsg = `Audio validation failed: ${audioValidation.errors.join(', ')}`;
          logger.error('❌ WhisperService: Audio validation failed', {
            operationId,
            errors: audioValidation.errors,
            recommendations: audioValidation.recommendations
          });

          return {
            success: false,
            error: errorMsg,
            duration: Date.now() - startTime
          };
        }
      } else {
        // Create minimal validation result
        audioValidation = {
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
        };
      }

      // Convert blob to file for API
      const audioFile = this.blobToFile(audioBlob, 'audio_recording');

      // Perform transcription with retries
      const result = await this.transcribeFileWithRetry(audioFile, transcriptionOptions, operationId);

      if (result.success && result.data) {
        // Add validation metadata
        result.data.metadata.audioValidation = audioValidation;
        result.data.metadata.fileSize = audioBlob.size;

        // Create processing summary
        if (audioValidation.metadata) {
          const summary = createProcessingSummary(
            audioValidation.metadata,
            audioValidation
          );
          logger.info('📋 Transcription processing summary', {
            operationId,
            summary
          });
        }
      }

      const totalDuration = Date.now() - startTime;
      result.duration = totalDuration;

      logger.info('✅ WhisperService: Blob transcription completed', {
        operationId,
        success: result.success,
        textLength: result.data?.text?.length || 0,
        duration: totalDuration,
        retryCount: result.retryCount || 0
      });

      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const duration = Date.now() - startTime;

      logger.error('❌ WhisperService: Blob transcription failed', {
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
   * Transcribe audio file to text
   * 
   * @param filePath - Path to audio file
   * @param options - Transcription options
   * @returns Promise resolving to transcription result
   */
  async transcribeFile(
    filePath: string,
    options: WhisperTranscriptionOptions = {}
  ): Promise<WhisperServiceResult> {
    const startTime = Date.now();
    const operationId = `transcribe_file_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    logger.info('🎙️ WhisperService: Starting file transcription', {
      operationId,
      filePath,
      options
    });

    try {
      // Check if running in browser context
      if (typeof window !== 'undefined' && !window.electron) {
        throw new Error('File transcription requires Electron environment');
      }

      // Read file (in Electron context)
      const fs = await import('fs/promises');
      const fileStats = await fs.stat(filePath);
      const fileBuffer = await fs.readFile(filePath);
      
      // Convert to blob for validation
      const audioBlob = new Blob([fileBuffer], { type: this.getMimeTypeFromPath(filePath) });

      // Use blob transcription method
      const result = await this.transcribeBlob(audioBlob, options);

      logger.info('✅ WhisperService: File transcription completed', {
        operationId,
        filePath,
        success: result.success,
        duration: Date.now() - startTime
      });

      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const duration = Date.now() - startTime;

      logger.error('❌ WhisperService: File transcription failed', {
        operationId,
        filePath,
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
   * Perform transcription with retry logic
   * 
   * @param audioFile - Audio file to transcribe
   * @param options - Transcription options
   * @param operationId - Operation identifier for logging
   * @returns Promise resolving to transcription result
   */
  private async transcribeFileWithRetry(
    audioFile: File,
    options: WhisperTranscriptionOptions,
    operationId: string
  ): Promise<WhisperServiceResult> {
    let lastError: Error | null = null;
    let retryCount = 0;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Wait for rate limiting
        await this.enforceRateLimit();

        logger.info('🔄 WhisperService: Attempting transcription', {
          operationId,
          attempt: attempt + 1,
          maxAttempts: this.config.maxRetries + 1
        });

        // Perform the actual API call
        const result = await this.performTranscription(audioFile, options, operationId);

        logger.info('✅ WhisperService: Transcription successful', {
          operationId,
          attempt: attempt + 1,
          textLength: result.text.length,
          language: result.language
        });

        return {
          success: true,
          data: result,
          retryCount: attempt
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount = attempt;

        logger.warn('⚠️ WhisperService: Transcription attempt failed', {
          operationId,
          attempt: attempt + 1,
          error: lastError.message,
          willRetry: attempt < this.config.maxRetries
        });

        // Don't retry on certain errors
        if (this.isNonRetryableError(lastError)) {
          logger.error('❌ WhisperService: Non-retryable error encountered', {
            operationId,
            error: lastError.message
          });
          break;
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt);
          logger.info('⏳ WhisperService: Waiting before retry', {
            operationId,
            delay,
            nextAttempt: attempt + 2
          });
          await this.sleep(delay);
        }
      }
    }

    // All attempts failed
    const errorMsg = lastError?.message || 'Unknown error occurred';
    logger.error('❌ WhisperService: All transcription attempts failed', {
      operationId,
      retryCount,
      finalError: errorMsg
    });

    return {
      success: false,
      error: errorMsg,
      retryCount
    };
  }

  /**
   * Perform the actual transcription API call
   * 
   * @param audioFile - Audio file to transcribe
   * @param options - Transcription options
   * @param operationId - Operation identifier for logging
   * @returns Promise resolving to transcription result
   */
  private async performTranscription(
    audioFile: File,
    options: WhisperTranscriptionOptions,
    operationId: string
  ): Promise<WhisperTranscriptionResult> {
    const startTime = Date.now();

    // Create form data
    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('model', 'whisper-1');

    // Add optional parameters
    if (options.language) {
      formData.append('language', options.language);
    }
    if (options.responseFormat) {
      formData.append('response_format', options.responseFormat);
    }
    if (options.temperature !== undefined) {
      formData.append('temperature', options.temperature.toString());
    }
    if (options.prompt) {
      formData.append('prompt', options.prompt);
    }
    if (options.timestampGranularities) {
      formData.append('timestamp_granularities[]', options.timestampGranularities.join(','));
    }

    // Prepare headers
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      ...this.config.customHeaders
    };

    if (this.config.organization) {
      headers['OpenAI-Organization'] = this.config.organization;
    }

    logger.info('📡 WhisperService: Sending API request', {
      operationId,
      url: `${this.config.baseUrl}/audio/transcriptions`,
      fileSize: audioFile.size,
      fileName: audioFile.name,
      responseFormat: options.responseFormat,
      language: options.language
    });

    // Make API request
    const response = await fetch(`${this.config.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers,
      body: formData,
      signal: AbortSignal.timeout(this.config.timeout)
    });

    // Track request
    this.requestCount++;
    this.lastRequestTime = Date.now();

    // Handle response
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error?.message || errorMessage;
      } catch {
        // Use default error message
      }

      logger.error('❌ WhisperService: API request failed', {
        operationId,
        status: response.status,
        statusText: response.statusText,
        error: errorMessage
      });

      throw new Error(errorMessage);
    }

    // Parse response based on format
    const processingTime = Date.now() - startTime;
    let responseData: any;
    let responseText: string = '';

    if (options.responseFormat === 'text') {
      // For text format, response is plain text
      responseText = await response.text();
      responseData = { text: responseText };
      
      logger.info('✅ WhisperService: API request successful (text format)', {
        operationId,
        processingTime,
        responseLength: responseText.length,
        transcribedText: responseText.substring(0, 100) + (responseText.length > 100 ? '...' : '')
      });
    } else {
      // For other formats (json, verbose_json, etc.), response is JSON
      responseData = await response.json();
      responseText = responseData.text || '';
      
      logger.info('✅ WhisperService: API request successful (JSON format)', {
        operationId,
        processingTime,
        responseLength: JSON.stringify(responseData).length,
        detectedLanguage: responseData.language,
        transcribedText: responseText.substring(0, 100) + (responseText.length > 100 ? '...' : '')
      });
    }

    // Format result based on response format
    const result: WhisperTranscriptionResult = {
      text: responseText,
      language: responseData.language,
      duration: responseData.duration,
      segments: responseData.segments,
      words: responseData.words,
      metadata: {
        processingTime,
        retryAttempts: 0, // Will be set by retry logic
        audioValidation: {
          isValid: true,
          errors: [],
          warnings: [],
          recommendations: []
        }, // Will be set by caller
        fileSize: audioFile.size,
        responseFormat: options.responseFormat || 'verbose_json'
      }
    };

    return result;
  }

  /**
   * Enforce rate limiting between requests
   */
  private async enforceRateLimit(): Promise<void> {
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    const delay = Math.max(0, this.rateLimitDelay - timeSinceLastRequest);
    
    if (delay > 0) {
      logger.debug('⏳ WhisperService: Rate limiting delay', { delay });
      await this.sleep(delay);
    }
  }

  /**
   * Check if an error should not be retried
   * 
   * @param error - Error to check
   * @returns True if error should not be retried
   */
  private isNonRetryableError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    
    // Don't retry on authentication errors
    if (errorMessage.includes('unauthorized') || errorMessage.includes('invalid api key')) {
      return true;
    }
    
    // Don't retry on file format errors
    if (errorMessage.includes('unsupported file type') || errorMessage.includes('invalid file format')) {
      return true;
    }
    
    // Don't retry on quota exceeded (different from rate limiting)
    if (errorMessage.includes('quota exceeded') || errorMessage.includes('billing')) {
      return true;
    }

    return false;
  }

  /**
   * Convert blob to File object
   * 
   * @param blob - Blob to convert
   * @param filename - Filename to use
   * @returns File object
   */
  private blobToFile(blob: Blob, filename: string): File {
    const extension = this.getExtensionFromMimeType(blob.type);
    const fullFilename = `${filename}.${extension}`;
    
    return new File([blob], fullFilename, { type: blob.type });
  }

  /**
   * Get file extension from MIME type
   * 
   * @param mimeType - MIME type (may be undefined)
   * @returns File extension
   */
  private getExtensionFromMimeType(mimeType: string | undefined): string {
    // Clean MIME type by removing codec information
    if (!mimeType) {
      return 'wav'; // Default extension
    }
    const cleanMimeType = mimeType?.toLowerCase().split(';')[0]?.trim() || 'audio/wav';
    
    const mimeMap: Record<string, string> = {
      'audio/wav': 'wav',
      'audio/wave': 'wav',
      'audio/mp3': 'mp3',
      'audio/mpeg': 'mp3',
      'audio/mp4': 'mp4',
      'audio/m4a': 'm4a',
      'audio/webm': 'webm',
      'audio/ogg': 'ogg',
      'audio/oga': 'oga',
      'audio/flac': 'flac'
    };

    const extension = mimeMap[cleanMimeType] || 'wav'; // Default to wav format for better OpenAI compatibility
    
    logger.debug('🔍 WhisperService: MIME type to extension mapping', {
      originalMimeType: mimeType,
      cleanMimeType,
      mappedExtension: extension
    });

    return extension;
  }

  /**
   * Get MIME type from file path
   * 
   * @param filePath - File path
   * @returns MIME type
   */
  private getMimeTypeFromPath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    
    const extMap: Record<string, string> = {
      'wav': 'audio/wav',
      'mp3': 'audio/mp3',
      'mpeg': 'audio/mpeg',
      'mp4': 'audio/mp4',
      'm4a': 'audio/m4a',
      'webm': 'audio/webm',
      'ogg': 'audio/ogg'
    };

    return extMap[ext || ''] || 'audio/wav';
  }

  /**
   * Sleep for specified duration
   * 
   * @param ms - Milliseconds to sleep
   * @returns Promise that resolves after delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get service status and statistics
   * 
   * @returns Service status information
   */
  getStatus(): {
    requestCount: number;
    lastRequestTime: number;
    config: {
      baseUrl: string;
      timeout: number;
      maxRetries: number;
      hasApiKey: boolean;
    };
  } {
    return {
      requestCount: this.requestCount,
      lastRequestTime: this.lastRequestTime,
      config: {
        baseUrl: this.config.baseUrl,
        timeout: this.config.timeout,
        maxRetries: this.config.maxRetries,
        hasApiKey: !!this.config.apiKey
      }
    };
  }

  /**
   * Test the service connection
   * 
   * @returns Promise resolving to connection test result
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    logger.info('🔍 WhisperService: Testing connection');

    try {
      // Create a minimal test audio blob (1 second of silence)
      const testBlob = this.createTestAudioBlob();
      
      // Attempt transcription with minimal options
      const result = await this.transcribeBlob(testBlob, {
        responseFormat: 'text',
        validateAudio: false
      });

      if (result.success) {
        logger.info('✅ WhisperService: Connection test successful');
        return { success: true };
      } else {
        logger.error('❌ WhisperService: Connection test failed', { error: result.error });
        return { success: false, error: result.error };
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('❌ WhisperService: Connection test error', { error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Create a test audio blob for connection testing
   * 
   * @returns Test audio blob
   */
  private createTestAudioBlob(): Blob {
    // Create minimal WAV file (1 second of silence)
    const sampleRate = 16000;
    const duration = 1;
    const samples = sampleRate * duration;
    
    // WAV header (44 bytes) + data
    const buffer = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples * 2, true);
    
    // Fill with silence (zeros)
    for (let i = 0; i < samples; i++) {
      view.setInt16(44 + i * 2, 0, true);
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  }
}

/**
 * Create a WhisperService instance with environment configuration
 * 
 * @returns Promise resolving to configured WhisperService instance
 */
export async function createWhisperService(): Promise<WhisperService> {
  logger.info('🏭 Creating WhisperService from environment configuration');

  let apiKey: string | undefined;

  // Check if we're in Electron renderer context
  if (typeof window !== 'undefined' && window.electron?.env) {
    logger.debug('🔐 Getting environment variables via Electron IPC');
    
    try {
      const envResult = await window.electron.env.getVars();
      
      if (envResult.success && envResult.data) {
        apiKey = envResult.data.OPENAI_API_KEY;
        
        logger.info('✅ Environment variables retrieved via IPC', {
          hasApiKey: !!apiKey,
          nodeEnv: envResult.data.NODE_ENV
        });
      } else {
        throw new Error(`Failed to get environment variables: ${envResult.error}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('❌ Failed to get environment variables via IPC', { error: errorMsg });
      throw new Error(`Failed to access environment variables: ${errorMsg}`);
    }
  } else if (typeof process !== 'undefined' && process.env) {
    // Fallback for non-Electron environments (e.g., tests)
    logger.debug('🔧 Getting environment variables from process.env (fallback)');
    apiKey = process.env.OPENAI_API_KEY;
  } else {
    throw new Error('Unable to access environment variables - neither Electron IPC nor process.env available');
  }
  
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  // Create configuration from environment
  const config: WhisperConfig = {
    apiKey,
    baseUrl: DEFAULT_WHISPER_CONFIG.baseUrl, // Use defaults since other env vars are less critical
    timeout: DEFAULT_WHISPER_CONFIG.timeout,
    maxRetries: DEFAULT_WHISPER_CONFIG.maxRetries,
    retryDelay: DEFAULT_WHISPER_CONFIG.retryDelay,
    // organization: could be added to env vars if needed
  };

  logger.info('✅ WhisperService configuration created', {
    hasApiKey: !!config.apiKey,
    baseUrl: config.baseUrl,
    timeout: config.timeout,
    maxRetries: config.maxRetries
  });

  return new WhisperService(config);
}

/**
 * Export types for external use
 */
export type {
  WhisperConfig,
  WhisperTranscriptionOptions,
  WhisperTranscriptionResult,
  WhisperSegment,
  WhisperWord,
  WhisperServiceResult
}; 