/**
 * Audio Format Validation and Conversion Utilities for FlowGenius
 * 
 * This module provides comprehensive audio processing utilities to ensure
 * compatibility with the OpenAI Whisper API. It handles format validation,
 * conversion, and optimization for desktop audio files.
 * 
 * Key Features:
 * - Whisper API compatibility validation (25MB limit, supported formats)
 * - Audio format detection and conversion
 * - Optimal format selection (16kHz WAV for best compatibility)
 * - File size and duration validation
 * - Browser-to-desktop audio blob handling
 * - Comprehensive error handling and logging
 * 
 * Supported Whisper Formats: m4a, mp3, webm, mp4, mpga, wav, mpeg
 * Optimal Target: WAV 16kHz mono 16-bit for universal compatibility
 */

import { logger } from './logger';

/**
 * Whisper API constraints and specifications
 */
export const WHISPER_CONSTRAINTS = {
  /** Maximum file size in bytes (25 MB) */
  MAX_FILE_SIZE: 25 * 1024 * 1024,
  /** Optimal sample rate for Whisper (Hz) */
  OPTIMAL_SAMPLE_RATE: 16000,
  /** Optimal channel count (mono) */
  OPTIMAL_CHANNELS: 1,
  /** Optimal bit depth */
  OPTIMAL_BIT_DEPTH: 16,
  /** Maximum duration in seconds (estimated from 25MB WAV) */
  MAX_DURATION_SECONDS: 1800, // ~30 minutes of 16kHz mono WAV
  /** Supported MIME types by Whisper API */
  SUPPORTED_MIME_TYPES: [
    'audio/wav',
    'audio/mp3',
    'audio/mpeg',
    'audio/mp4',
    'audio/m4a',
    'audio/webm',
    'audio/ogg', // Includes mpga
  ],
  /** Recommended MIME type for optimal compatibility */
  RECOMMENDED_MIME_TYPE: 'audio/wav'
} as const;

/**
 * Audio validation result interface
 */
export interface AudioValidationResult {
  /** Whether the audio is valid for Whisper API */
  isValid: boolean;
  /** Validation errors if any */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
  /** Detected audio metadata */
  metadata?: AudioMetadata;
  /** Recommended actions for invalid audio */
  recommendations: string[];
}

/**
 * Audio metadata interface
 */
export interface AudioMetadata {
  /** Audio duration in seconds */
  duration: number;
  /** File size in bytes */
  fileSize: number;
  /** Sample rate in Hz */
  sampleRate?: number;
  /** Number of audio channels */
  channels?: number;
  /** Bit depth */
  bitDepth?: number;
  /** MIME type */
  mimeType: string;
  /** File format detected */
  format: string;
  /** Estimated bitrate */
  bitrate?: number;
}

/**
 * Audio conversion configuration
 */
export interface AudioConversionConfig {
  /** Target sample rate (default: 16000 Hz) */
  sampleRate?: number;
  /** Target channel count (default: 1 - mono) */
  channels?: number;
  /** Target bit depth (default: 16) */
  bitDepth?: number;
  /** Target format (default: 'wav') */
  format?: 'wav' | 'mp3' | 'webm';
  /** Quality setting for lossy formats (0-1, default: 0.8) */
  quality?: number;
}

/**
 * Default audio conversion configuration optimized for Whisper
 */
export const DEFAULT_CONVERSION_CONFIG: Required<AudioConversionConfig> = {
  sampleRate: WHISPER_CONSTRAINTS.OPTIMAL_SAMPLE_RATE,
  channels: WHISPER_CONSTRAINTS.OPTIMAL_CHANNELS,
  bitDepth: WHISPER_CONSTRAINTS.OPTIMAL_BIT_DEPTH,
  format: 'wav',
  quality: 0.8
};

/**
 * Detect audio format from MIME type or file extension
 * 
 * @param input - MIME type string, file extension, or blob
 * @returns Detected audio format
 */
export function detectAudioFormat(input: string | Blob): string {
  logger.debug('🔍 Detecting audio format', { input: typeof input });

  let mimeType: string;
  
  if (input instanceof Blob) {
    mimeType = input.type || 'unknown';
  } else if (input.startsWith('.')) {
    // File extension
    const ext = input.toLowerCase();
    const extensionMap: Record<string, string> = {
      '.wav': 'audio/wav',
      '.mp3': 'audio/mp3',
      '.m4a': 'audio/m4a',
      '.mp4': 'audio/mp4',
      '.webm': 'audio/webm',
      '.ogg': 'audio/ogg',
      '.mpeg': 'audio/mpeg',
      '.mpga': 'audio/mpeg'
    };
    mimeType = extensionMap[ext] || 'unknown';
  } else {
    // Assume it's already a MIME type
    mimeType = input;
  }

  // Handle special cases first
  if (mimeType === 'unknown' || !mimeType.includes('/')) {
    return 'unknown';
  }

  // Normalize MIME type - extract format from audio/format
  const parts = mimeType.split('/');
  if (parts.length < 2 || parts[0] !== 'audio') {
    return 'unknown';
  }
  
  const format = parts[1]?.split(';')[0] || 'unknown';
  
  logger.info('✅ Audio format detected', { 
    input: typeof input === 'string' ? input : 'Blob',
    mimeType, 
    format 
  });

  return format;
}

/**
 * Validate if audio format is supported by Whisper API
 * 
 * @param mimeType - Audio MIME type to validate
 * @returns Whether the format is supported
 */
export function isWhisperSupportedFormat(mimeType: string): boolean {
  const normalizedMimeType = mimeType.toLowerCase().split(';')[0];
  const isSupported = WHISPER_CONSTRAINTS.SUPPORTED_MIME_TYPES.includes(normalizedMimeType as any);
  
  logger.debug('🔍 Checking Whisper format support', { 
    mimeType: normalizedMimeType, 
    isSupported 
  });

  return isSupported;
}

/**
 * Validate audio blob against Whisper API requirements
 * 
 * @param audioBlob - Audio blob to validate
 * @param metadata - Optional pre-extracted metadata
 * @returns Validation result with errors and recommendations
 */
export async function validateAudioForWhisper(
  audioBlob: Blob,
  metadata?: Partial<AudioMetadata>
): Promise<AudioValidationResult> {
  const startTime = Date.now();
  logger.info('🔍 Validating audio for Whisper API', { 
    blobSize: audioBlob.size,
    blobType: audioBlob.type 
  });

  const errors: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // Extract or use provided metadata
  const audioMetadata: AudioMetadata = {
    fileSize: audioBlob.size,
    mimeType: audioBlob.type,
    format: detectAudioFormat(audioBlob),
    duration: metadata?.duration || 0, // Will be estimated if not provided
    sampleRate: metadata?.sampleRate,
    channels: metadata?.channels,
    bitDepth: metadata?.bitDepth,
    bitrate: metadata?.bitrate
  };

  // Estimate duration if not provided (rough estimate)
  if (!audioMetadata.duration && audioBlob.size > 0) {
    // Rough estimate: assume 16kHz mono 16-bit WAV = ~32KB/second
    const estimatedDuration = audioMetadata.format === 'wav' 
      ? (audioBlob.size / 32000) // WAV estimate
      : (audioBlob.size / 16000); // Compressed format estimate
    audioMetadata.duration = Math.round(estimatedDuration);
    warnings.push(`Duration estimated as ${audioMetadata.duration}s - actual duration may vary`);
  }

  // Validate file size
  if (audioBlob.size === 0) {
    errors.push('Audio file is empty');
  } else if (audioBlob.size > WHISPER_CONSTRAINTS.MAX_FILE_SIZE) {
    errors.push(`File size ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB exceeds Whisper limit of ${WHISPER_CONSTRAINTS.MAX_FILE_SIZE / 1024 / 1024}MB`);
    recommendations.push('Split audio into smaller segments or compress the audio');
  }

  // Validate MIME type
  if (!audioBlob.type) {
    warnings.push('No MIME type detected - format may not be recognized');
    recommendations.push('Ensure audio has proper MIME type');
  } else if (!isWhisperSupportedFormat(audioBlob.type)) {
    errors.push(`Format "${audioBlob.type}" is not supported by Whisper API`);
    recommendations.push(`Convert to supported format: ${WHISPER_CONSTRAINTS.SUPPORTED_MIME_TYPES.join(', ')}`);
  }

  // Validate duration
  if (audioMetadata.duration > WHISPER_CONSTRAINTS.MAX_DURATION_SECONDS) {
    warnings.push(`Audio duration ${audioMetadata.duration}s exceeds recommended maximum of ${WHISPER_CONSTRAINTS.MAX_DURATION_SECONDS}s`);
    recommendations.push('Consider splitting long audio into smaller segments');
  }

  // Check for optimal format
  if (audioBlob.type !== WHISPER_CONSTRAINTS.RECOMMENDED_MIME_TYPE) {
    recommendations.push(`For best compatibility, convert to ${WHISPER_CONSTRAINTS.RECOMMENDED_MIME_TYPE} at 16kHz mono`);
  }

  // Sample rate recommendations
  if (audioMetadata.sampleRate && audioMetadata.sampleRate !== WHISPER_CONSTRAINTS.OPTIMAL_SAMPLE_RATE) {
    warnings.push(`Sample rate ${audioMetadata.sampleRate}Hz differs from optimal ${WHISPER_CONSTRAINTS.OPTIMAL_SAMPLE_RATE}Hz`);
    recommendations.push(`Resample to ${WHISPER_CONSTRAINTS.OPTIMAL_SAMPLE_RATE}Hz for optimal processing`);
  }

  // Channel recommendations
  if (audioMetadata.channels && audioMetadata.channels > WHISPER_CONSTRAINTS.OPTIMAL_CHANNELS) {
    warnings.push(`Stereo audio detected - mono is more efficient for speech recognition`);
    recommendations.push('Convert to mono audio to reduce file size and improve processing speed');
  }

  const isValid = errors.length === 0;
  const validationTime = Date.now() - startTime;

  logger.info('✅ Audio validation completed', {
    isValid,
    errors: errors.length,
    warnings: warnings.length,
    recommendations: recommendations.length,
    validationTime,
    metadata: audioMetadata
  });

  return {
    isValid,
    errors,
    warnings,
    metadata: audioMetadata,
    recommendations
  };
}

/**
 * Calculate optimal audio settings for Whisper API
 * 
 * @param currentMetadata - Current audio metadata
 * @returns Optimal conversion configuration
 */
export function calculateOptimalSettings(currentMetadata: AudioMetadata): AudioConversionConfig {
  logger.debug('🎯 Calculating optimal audio settings', { currentMetadata });

  const config: AudioConversionConfig = { ...DEFAULT_CONVERSION_CONFIG };

  // If current sample rate is higher than optimal, downsample
  if (currentMetadata.sampleRate && currentMetadata.sampleRate > WHISPER_CONSTRAINTS.OPTIMAL_SAMPLE_RATE) {
    config.sampleRate = WHISPER_CONSTRAINTS.OPTIMAL_SAMPLE_RATE;
  } else if (currentMetadata.sampleRate) {
    // Keep current sample rate if it's already optimal or lower
    config.sampleRate = currentMetadata.sampleRate;
  }

  // Always prefer mono for speech recognition
  config.channels = WHISPER_CONSTRAINTS.OPTIMAL_CHANNELS;

  // Choose format based on size constraints
  if (currentMetadata.fileSize > WHISPER_CONSTRAINTS.MAX_FILE_SIZE * 0.8) {
    // If file is large, prefer compressed format
    config.format = 'mp3';
    config.quality = 0.7; // Lower quality for size reduction
  } else {
    // Otherwise use WAV for best compatibility
    config.format = 'wav';
  }

  logger.info('✅ Optimal settings calculated', { config });
  return config;
}

/**
 * Estimate the output file size after conversion
 * 
 * @param inputMetadata - Input audio metadata
 * @param config - Conversion configuration
 * @returns Estimated output file size in bytes
 */
export function estimateOutputFileSize(
  inputMetadata: AudioMetadata,
  config: AudioConversionConfig
): number {
  const targetSampleRate = config.sampleRate || DEFAULT_CONVERSION_CONFIG.sampleRate;
  const targetChannels = config.channels || DEFAULT_CONVERSION_CONFIG.channels;
  const targetBitDepth = config.bitDepth || DEFAULT_CONVERSION_CONFIG.bitDepth;
  const targetFormat = config.format || DEFAULT_CONVERSION_CONFIG.format;

  let estimatedSize: number;

  if (targetFormat === 'wav') {
    // WAV = sample_rate * channels * bit_depth/8 * duration + header
    const dataRate = targetSampleRate * targetChannels * (targetBitDepth / 8);
    estimatedSize = (dataRate * inputMetadata.duration) + 44; // 44 bytes for WAV header
  } else if (targetFormat === 'mp3') {
    // MP3 estimate based on quality setting
    const quality = config.quality || DEFAULT_CONVERSION_CONFIG.quality;
    const bitrate = Math.round(quality * 192000); // 192kbps max for speech
    estimatedSize = (bitrate / 8) * inputMetadata.duration;
  } else {
    // Default estimate for other formats
    estimatedSize = inputMetadata.fileSize * 0.7; // Assume 30% compression
  }

  logger.debug('📊 Estimated output file size', {
    targetFormat,
    targetSampleRate,
    targetChannels,
    duration: inputMetadata.duration,
    estimatedSize,
    estimatedSizeMB: (estimatedSize / 1024 / 1024).toFixed(2)
  });

  return Math.round(estimatedSize);
}

/**
 * Generate filename for converted audio
 * 
 * @param originalName - Original filename or base name
 * @param config - Conversion configuration
 * @returns Generated filename with appropriate extension
 */
export function generateConvertedFilename(
  originalName: string = 'audio',
  config: AudioConversionConfig
): string {
  const format = config.format || DEFAULT_CONVERSION_CONFIG.format;
  const sampleRate = config.sampleRate || DEFAULT_CONVERSION_CONFIG.sampleRate;
  const channels = config.channels || DEFAULT_CONVERSION_CONFIG.channels;

  // Remove existing extension
  const baseName = originalName.replace(/\.[^/.]+$/, '');
  
  // Add descriptive suffix
  const suffix = `_${sampleRate}hz_${channels}ch`;
  const extension = format === 'wav' ? 'wav' : format;
  
  const filename = `${baseName}${suffix}.${extension}`;
  
  logger.debug('📝 Generated converted filename', { 
    originalName, 
    filename, 
    config 
  });

  return filename;
}

/**
 * Convert audio blob URL to a File object with metadata
 * 
 * @param audioBlob - Audio blob to convert
 * @param filename - Desired filename
 * @returns File object with proper metadata
 */
export function blobToFile(audioBlob: Blob, filename: string): File {
  logger.debug('🔄 Converting blob to file', { 
    blobSize: audioBlob.size,
    blobType: audioBlob.type,
    filename 
  });

  const file = new File([audioBlob], filename, {
    type: audioBlob.type,
    lastModified: Date.now()
  });

  logger.info('✅ Blob converted to file', {
    filename: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified
  });

  return file;
}

/**
 * Create audio processing summary for logging and debugging
 * 
 * @param originalMetadata - Original audio metadata
 * @param validationResult - Validation result
 * @param conversionConfig - Applied conversion configuration
 * @returns Processing summary object
 */
export function createProcessingSummary(
  originalMetadata: AudioMetadata,
  validationResult: AudioValidationResult,
  conversionConfig?: AudioConversionConfig
): object {
  // Handle conversion config safely
  const conversionSummary = conversionConfig ? {
    targetFormat: conversionConfig.format ?? DEFAULT_CONVERSION_CONFIG.format,
    targetSampleRate: `${conversionConfig.sampleRate ?? DEFAULT_CONVERSION_CONFIG.sampleRate}Hz`,
    targetChannels: conversionConfig.channels ?? DEFAULT_CONVERSION_CONFIG.channels,
    estimatedOutputSize: `${(estimateOutputFileSize(originalMetadata, conversionConfig) / 1024 / 1024).toFixed(2)}MB`
  } : null;

  const summary = {
    original: {
      format: originalMetadata.format,
      size: `${(originalMetadata.fileSize / 1024 / 1024).toFixed(2)}MB`,
      duration: `${originalMetadata.duration}s`,
      sampleRate: originalMetadata.sampleRate ? `${originalMetadata.sampleRate}Hz` : 'unknown',
      channels: originalMetadata.channels || 'unknown'
    },
    validation: {
      isValid: validationResult.isValid,
      errors: validationResult.errors.length,
      warnings: validationResult.warnings.length,
      recommendations: validationResult.recommendations.length
    },
    conversion: conversionSummary,
    whisperCompatibility: {
      withinSizeLimit: originalMetadata.fileSize <= WHISPER_CONSTRAINTS.MAX_FILE_SIZE,
      supportedFormat: isWhisperSupportedFormat(originalMetadata.mimeType),
      optimalFormat: originalMetadata.mimeType === WHISPER_CONSTRAINTS.RECOMMENDED_MIME_TYPE
    }
  };

  logger.info('📋 Audio processing summary', summary);
  return summary;
}

/**
 * Utility function to convert duration from various formats to seconds
 * 
 * @param duration - Duration in seconds, "mm:ss", or "hh:mm:ss" format
 * @returns Duration in seconds
 */
export function parseDuration(duration: number | string): number {
  if (typeof duration === 'number') {
    return duration;
  }

  // Handle empty or invalid strings
  if (!duration || typeof duration !== 'string') {
    return 0;
  }

  const parts = duration.split(':').map(Number);
  
  // Check if this is a time format (contains colons)
  if (duration.includes(':')) {
    // Validate that all parts are valid numbers
    const hasInvalidParts = parts.some(part => isNaN(part));
    if (hasInvalidParts) {
      return 0;
    }
  } else {
    // Try to parse as number string if no colons
    const parsed = parseFloat(duration);
    return isNaN(parsed) ? 0 : parsed;
  }
  
  if (parts.length === 2) {
    // mm:ss format
    return (parseInt(String(parts[0] || 0)) || 0) * 60 + (parseInt(String(parts[1] || 0)) || 0);
  } else if (parts.length === 3) {
    // hh:mm:ss format
    return (parseInt(String(parts[0] || 0)) || 0) * 3600 + (parseInt(String(parts[1] || 0)) || 0) * 60 + (parseInt(String(parts[2] || 0)) || 0);
  } else {
    // Invalid colon format (like 1:2:3:4)
    return 0;
  }
}

/**
 * Format duration in seconds to human-readable string
 * 
 * @param seconds - Duration in seconds
 * @returns Formatted duration string
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}

/**
 * Export all audio utility functions for easy importing
 */
export const audioUtils = {
  detectAudioFormat,
  isWhisperSupportedFormat,
  validateAudioForWhisper,
  calculateOptimalSettings,
  estimateOutputFileSize,
  generateConvertedFilename,
  blobToFile,
  createProcessingSummary,
  parseDuration,
  formatDuration,
  WHISPER_CONSTRAINTS,
  DEFAULT_CONVERSION_CONFIG
};

export default audioUtils; 