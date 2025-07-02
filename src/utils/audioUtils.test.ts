/**
 * Comprehensive Unit Tests for Audio Utilities
 * 
 * Tests all audio validation, conversion, and utility functions
 * for Whisper API compatibility. Includes edge cases, error scenarios,
 * and mock data for thorough coverage.
 */

import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import {
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
  DEFAULT_CONVERSION_CONFIG,
  type AudioMetadata,
  type AudioConversionConfig,
  type AudioValidationResult
} from './audioUtils';
import { logger } from './logger';

// Mock the logger to prevent console spam during tests
vi.mock('./logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

/**
 * Create mock audio blob for testing
 */
function createMockAudioBlob(size: number, mimeType: string): Blob {
  const buffer = new ArrayBuffer(size);
  return new Blob([buffer], { type: mimeType });
}

/**
 * Create mock audio metadata for testing
 */
function createMockMetadata(overrides: Partial<AudioMetadata> = {}): AudioMetadata {
  return {
    duration: 120,
    fileSize: 1024 * 1024, // 1MB
    sampleRate: 44100,
    channels: 2,
    bitDepth: 16,
    mimeType: 'audio/wav',
    format: 'wav',
    bitrate: 1411200,
    ...overrides
  };
}

describe('audioUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectAudioFormat', () => {
    it('should detect format from blob MIME type', () => {
      console.log('🧪 Testing blob format detection');
      
      const blob = createMockAudioBlob(1000, 'audio/wav');
      const format = detectAudioFormat(blob);
      
      expect(format).toBe('wav');
      expect(logger.debug).toHaveBeenCalledWith('🔍 Detecting audio format', { input: 'object' });
      expect(logger.info).toHaveBeenCalledWith('✅ Audio format detected', {
        input: 'Blob',
        mimeType: 'audio/wav',
        format: 'wav'
      });
    });

    it('should detect format from file extension', () => {
      console.log('🧪 Testing file extension format detection');
      
      const format = detectAudioFormat('.mp3');
      
      expect(format).toBe('mp3');
    });

    it('should detect format from MIME type string', () => {
      console.log('🧪 Testing MIME type string format detection');
      
      const format = detectAudioFormat('audio/webm;codecs=opus');
      
      expect(format).toBe('webm');
    });

    it('should handle unknown formats', () => {
      console.log('🧪 Testing unknown format handling');
      
      const format = detectAudioFormat('unknown/format');
      
      expect(format).toBe('unknown');
    });

    it('should handle empty blob type', () => {
      console.log('🧪 Testing empty blob type');
      
      const blob = createMockAudioBlob(1000, '');
      const format = detectAudioFormat(blob);
      
      expect(format).toBe('unknown');
    });

    it('should handle all supported file extensions', () => {
      console.log('🧪 Testing all supported file extensions');
      
      const extensions = ['.wav', '.mp3', '.m4a', '.mp4', '.webm', '.ogg', '.mpeg', '.mpga'];
      const expectedFormats = ['wav', 'mp3', 'm4a', 'mp4', 'webm', 'ogg', 'mpeg', 'mpeg'];
      
      extensions.forEach((ext, index) => {
        const format = detectAudioFormat(ext);
        expect(format).toBe(expectedFormats[index]);
      });
    });
  });

  describe('isWhisperSupportedFormat', () => {
    it('should return true for supported formats', () => {
      console.log('🧪 Testing supported format validation');
      
      const supportedFormats = [
        'audio/wav',
        'audio/mp3',
        'audio/mpeg',
        'audio/mp4',
        'audio/m4a',
        'audio/webm',
        'audio/ogg'
      ];
      
      supportedFormats.forEach(format => {
        expect(isWhisperSupportedFormat(format)).toBe(true);
      });
    });

    it('should return false for unsupported formats', () => {
      console.log('🧪 Testing unsupported format validation');
      
      const unsupportedFormats = [
        'audio/flac',
        'audio/aac',
        'video/mp4',
        'text/plain',
        'application/json'
      ];
      
      unsupportedFormats.forEach(format => {
        expect(isWhisperSupportedFormat(format)).toBe(false);
      });
    });

    it('should handle MIME types with parameters', () => {
      console.log('🧪 Testing MIME types with parameters');
      
      expect(isWhisperSupportedFormat('audio/webm;codecs=opus')).toBe(true);
      expect(isWhisperSupportedFormat('audio/mp4; codecs="mp4a.40.2"')).toBe(true);
    });

    it('should be case insensitive', () => {
      console.log('🧪 Testing case insensitive format validation');
      
      expect(isWhisperSupportedFormat('AUDIO/WAV')).toBe(true);
      expect(isWhisperSupportedFormat('Audio/Mp3')).toBe(true);
    });
  });

  describe('validateAudioForWhisper', () => {
    it('should validate valid audio successfully', async () => {
      console.log('🧪 Testing valid audio validation');
      
      const blob = createMockAudioBlob(1024 * 1024, 'audio/wav'); // 1MB WAV
      const metadata = createMockMetadata({
        duration: 60,
        sampleRate: 16000,
        channels: 1
      });
      
      const result = await validateAudioForWhisper(blob, metadata);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata?.fileSize).toBe(1024 * 1024);
      expect(result.metadata?.duration).toBe(60);
    });

    it('should detect file size violations', async () => {
      console.log('🧪 Testing file size limit validation');
      
      const oversizedBlob = createMockAudioBlob(WHISPER_CONSTRAINTS.MAX_FILE_SIZE + 1, 'audio/wav');
      const result = await validateAudioForWhisper(oversizedBlob);
      
      expect(result.isValid).toBe(false);
      // Use a simpler approach - check if any error message contains the expected text
      const hasExpectedError = result.errors.some(error => error.includes('exceeds Whisper limit'));
      expect(hasExpectedError).toBe(true);
      
      const hasExpectedRecommendation = result.recommendations.some(rec => rec.includes('Split audio'));
      expect(hasExpectedRecommendation).toBe(true);
    });

    it('should detect unsupported formats', async () => {
      console.log('🧪 Testing unsupported format validation');
      
      const blob = createMockAudioBlob(1000, 'audio/flac');
      
      const result = await validateAudioForWhisper(blob);
      
      expect(result.isValid).toBe(false);
      // Use simpler approach to avoid expect.stringContaining issues
      const hasUnsupportedError = result.errors.some(error => error.includes('not supported by Whisper API'));
      expect(hasUnsupportedError).toBe(true);
      
      const hasConvertRecommendation = result.recommendations.some(rec => rec.includes('Convert to supported format'));
      expect(hasConvertRecommendation).toBe(true);
    });

    it('should handle empty audio files', async () => {
      console.log('🧪 Testing empty file validation');
      
      const emptyBlob = createMockAudioBlob(0, 'audio/wav');
      
      const result = await validateAudioForWhisper(emptyBlob);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Audio file is empty');
    });

    it('should estimate duration when not provided', async () => {
      console.log('🧪 Testing duration estimation');
      
      const blob = createMockAudioBlob(32000, 'audio/wav'); // Should estimate ~1 second
      
      const result = await validateAudioForWhisper(blob);
      
      expect(result.metadata?.duration).toBe(1);
      const hasDurationWarning = result.warnings.some(warning => warning.includes('Duration estimated'));
      expect(hasDurationWarning).toBe(true);
    });

    it('should warn about non-optimal settings', async () => {
      console.log('🧪 Testing non-optimal settings warnings');
      
      const blob = createMockAudioBlob(1000, 'audio/mp3');
      const metadata = createMockMetadata({
        sampleRate: 48000, // Higher than optimal
        channels: 2 // Stereo instead of mono
      });
      
      const result = await validateAudioForWhisper(blob, metadata);
      
      const hasOptimalWarning = result.warnings.some(warning => warning.includes('differs from optimal'));
      expect(hasOptimalWarning).toBe(true);
      
      const hasStereoWarning = result.warnings.some(warning => warning.includes('Stereo audio detected'));
      expect(hasStereoWarning).toBe(true);
      
      const hasResampleRec = result.recommendations.some(rec => rec.includes('Resample to'));
      expect(hasResampleRec).toBe(true);
      
      const hasMonoRec = result.recommendations.some(rec => rec.includes('Convert to mono'));
      expect(hasMonoRec).toBe(true);
    });

    it('should warn about long duration', async () => {
      console.log('🧪 Testing long duration warning');
      
      const blob = createMockAudioBlob(1000, 'audio/wav');
      const metadata = createMockMetadata({
        duration: WHISPER_CONSTRAINTS.MAX_DURATION_SECONDS + 100
      });
      
      const result = await validateAudioForWhisper(blob, metadata);
      
      const hasLongDurationWarning = result.warnings.some(warning => warning.includes('exceeds recommended maximum'));
      expect(hasLongDurationWarning).toBe(true);
      
      const hasSplittingRec = result.recommendations.some(rec => rec.includes('splitting long audio'));
      expect(hasSplittingRec).toBe(true);
    });

    it('should handle missing MIME type', async () => {
      console.log('🧪 Testing missing MIME type');
      
      const blob = createMockAudioBlob(1000, '');
      
      const result = await validateAudioForWhisper(blob);
      
      const hasMimeWarning = result.warnings.some(warning => warning.includes('No MIME type detected'));
      expect(hasMimeWarning).toBe(true);
      
      const hasMimeRec = result.recommendations.some(rec => rec.includes('proper MIME type'));
      expect(hasMimeRec).toBe(true);
    });
  });

  describe('calculateOptimalSettings', () => {
    it('should return optimal settings for high sample rate audio', () => {
      console.log('🧪 Testing optimal settings calculation for high sample rate');
      
      const metadata = createMockMetadata({
        sampleRate: 48000,
        channels: 2,
        fileSize: 1024 * 1024 // 1MB
      });
      
      const config = calculateOptimalSettings(metadata);
      
      expect(config.sampleRate).toBe(WHISPER_CONSTRAINTS.OPTIMAL_SAMPLE_RATE);
      expect(config.channels).toBe(WHISPER_CONSTRAINTS.OPTIMAL_CHANNELS);
      expect(config.format).toBe('wav');
    });

    it('should preserve lower sample rates', () => {
      console.log('🧪 Testing sample rate preservation for lower rates');
      
      const metadata = createMockMetadata({
        sampleRate: 8000, // Lower than optimal
        channels: 1
      });
      
      const config = calculateOptimalSettings(metadata);
      
      expect(config.sampleRate).toBe(8000); // Should preserve lower rate
      expect(config.channels).toBe(1);
    });

    it('should choose compressed format for large files', () => {
      console.log('🧪 Testing format selection for large files');
      
      const metadata = createMockMetadata({
        fileSize: WHISPER_CONSTRAINTS.MAX_FILE_SIZE * 0.9 // Large file
      });
      
      const config = calculateOptimalSettings(metadata);
      
      expect(config.format).toBe('mp3');
      expect(config.quality).toBe(0.7);
    });

    it('should handle missing sample rate', () => {
      console.log('🧪 Testing handling of missing sample rate');
      
      const metadata = createMockMetadata({
        sampleRate: undefined
      });
      
      const config = calculateOptimalSettings(metadata);
      
      expect(config.sampleRate).toBe(WHISPER_CONSTRAINTS.OPTIMAL_SAMPLE_RATE);
    });
  });

  describe('estimateOutputFileSize', () => {
    it('should estimate WAV file size correctly', () => {
      console.log('🧪 Testing WAV file size estimation');
      
      const metadata = createMockMetadata({ duration: 60 }); // 1 minute
      const config: AudioConversionConfig = {
        format: 'wav',
        sampleRate: 16000,
        channels: 1,
        bitDepth: 16
      };
      
      const estimatedSize = estimateOutputFileSize(metadata, config);
      
      // 16000 Hz * 1 channel * 2 bytes * 60 seconds + 44 byte header
      const expectedSize = (16000 * 1 * 2 * 60) + 44;
      expect(estimatedSize).toBe(expectedSize);
    });

    it('should estimate MP3 file size correctly', () => {
      console.log('🧪 Testing MP3 file size estimation');
      
      const metadata = createMockMetadata({ duration: 60 });
      const config: AudioConversionConfig = {
        format: 'mp3',
        quality: 0.8
      };
      
      const estimatedSize = estimateOutputFileSize(metadata, config);
      
      // 0.8 * 192000 bps / 8 * 60 seconds
      const expectedSize = (0.8 * 192000 / 8) * 60;
      expect(estimatedSize).toBe(Math.round(expectedSize));
    });

    it('should estimate other formats with compression ratio', () => {
      console.log('🧪 Testing other format estimation');
      
      const metadata = createMockMetadata({ 
        duration: 60,
        fileSize: 1000000 
      });
      const config: AudioConversionConfig = {
        format: 'webm'
      };
      
      const estimatedSize = estimateOutputFileSize(metadata, config);
      
      // Should be 70% of original size
      expect(estimatedSize).toBe(700000);
    });
  });

  describe('generateConvertedFilename', () => {
    it('should generate filename with proper format and settings', () => {
      console.log('🧪 Testing filename generation');
      
      const config: AudioConversionConfig = {
        format: 'wav',
        sampleRate: 16000,
        channels: 1
      };
      
      const filename = generateConvertedFilename('recording', config);
      
      expect(filename).toBe('recording_16000hz_1ch.wav');
    });

    it('should remove existing extension', () => {
      console.log('🧪 Testing extension removal');
      
      const config: AudioConversionConfig = {
        format: 'mp3',
        sampleRate: 44100,
        channels: 2
      };
      
      const filename = generateConvertedFilename('audio.webm', config);
      
      expect(filename).toBe('audio_44100hz_2ch.mp3');
    });

    it('should use default values when not specified', () => {
      console.log('🧪 Testing default values in filename');
      
      const config: AudioConversionConfig = {}; // Empty config
      
      const filename = generateConvertedFilename('test', config);
      
      expect(filename).toBe(`test_${DEFAULT_CONVERSION_CONFIG.sampleRate}hz_${DEFAULT_CONVERSION_CONFIG.channels}ch.wav`);
    });

    it('should handle default original name', () => {
      console.log('🧪 Testing default original name');
      
      const config: AudioConversionConfig = {
        format: 'wav',
        sampleRate: 16000,
        channels: 1
      };
      
      const filename = generateConvertedFilename(undefined, config);
      
      expect(filename).toBe('audio_16000hz_1ch.wav');
    });
  });

  describe('blobToFile', () => {
    it('should convert blob to file with correct metadata', () => {
      console.log('🧪 Testing blob to file conversion');
      
      const blob = createMockAudioBlob(1000, 'audio/wav');
      const file = blobToFile(blob, 'test.wav');
      
      expect(file).toBeInstanceOf(File);
      expect(file.name).toBe('test.wav');
      expect(file.size).toBe(1000);
      expect(file.type).toBe('audio/wav');
      expect(file.lastModified).toBeGreaterThan(Date.now() - 1000);
    });

    it('should preserve blob properties', () => {
      console.log('🧪 Testing blob property preservation');
      
      const blob = createMockAudioBlob(5000, 'audio/mp3');
      const file = blobToFile(blob, 'recording.mp3');
      
      expect(file.size).toBe(blob.size);
      expect(file.type).toBe(blob.type);
    });
  });

  describe('parseDuration', () => {
    it('should parse numeric duration', () => {
      console.log('🧪 Testing numeric duration parsing');
      
      expect(parseDuration(120)).toBe(120);
      expect(parseDuration(0)).toBe(0);
      expect(parseDuration(3.5)).toBe(3.5);
    });

    it('should parse mm:ss format', () => {
      console.log('🧪 Testing mm:ss format parsing');
      
      expect(parseDuration('02:30')).toBe(150); // 2 minutes 30 seconds
      expect(parseDuration('00:45')).toBe(45);
      expect(parseDuration('10:00')).toBe(600);
    });

    it('should parse hh:mm:ss format', () => {
      console.log('🧪 Testing hh:mm:ss format parsing');
      
      expect(parseDuration('01:30:45')).toBe(5445); // 1 hour 30 minutes 45 seconds
      expect(parseDuration('00:02:30')).toBe(150);
      expect(parseDuration('02:00:00')).toBe(7200);
    });

    it('should parse numeric strings', () => {
      console.log('🧪 Testing numeric string parsing');
      
      expect(parseDuration('120')).toBe(120);
      expect(parseDuration('3.5')).toBe(3.5);
    });

    it('should handle invalid formats', () => {
      console.log('🧪 Testing invalid format handling');
      
      expect(parseDuration('invalid')).toBe(0);
      expect(parseDuration('')).toBe(0);
      expect(parseDuration('1:2:3:4')).toBe(0);
    });
  });

  describe('formatDuration', () => {
    it('should format short durations without hours', () => {
      console.log('🧪 Testing short duration formatting');
      
      expect(formatDuration(30)).toBe('0:30');
      expect(formatDuration(90)).toBe('1:30');
      expect(formatDuration(600)).toBe('10:00');
    });

    it('should format long durations with hours', () => {
      console.log('🧪 Testing long duration formatting');
      
      expect(formatDuration(3661)).toBe('1:01:01'); // 1 hour 1 minute 1 second
      expect(formatDuration(7200)).toBe('2:00:00'); // 2 hours
      expect(formatDuration(3725)).toBe('1:02:05'); // 1 hour 2 minutes 5 seconds
    });

    it('should handle zero duration', () => {
      console.log('🧪 Testing zero duration formatting');
      
      expect(formatDuration(0)).toBe('0:00');
    });

    it('should round down to nearest second', () => {
      console.log('🧪 Testing rounding behavior');
      
      expect(formatDuration(30.9)).toBe('0:30');
      expect(formatDuration(59.1)).toBe('0:59');
    });
  });

  describe('createProcessingSummary', () => {
    it('should create comprehensive processing summary', () => {
      console.log('🧪 Testing processing summary creation');
      
      const metadata = createMockMetadata();
      const validationResult: AudioValidationResult = {
        isValid: true,
        errors: [],
        warnings: ['Sample rate warning'],
        recommendations: ['Convert to mono'],
        metadata
      };
      const conversionConfig: AudioConversionConfig = {
        format: 'wav',
        sampleRate: 16000,
        channels: 1
      };
      
      const summary = createProcessingSummary(metadata, validationResult, conversionConfig);
      
      expect(summary).toHaveProperty('original');
      expect(summary).toHaveProperty('validation');
      expect(summary).toHaveProperty('conversion');
      expect(summary).toHaveProperty('whisperCompatibility');
      
      // Type assertion to access properties
      const typedSummary = summary as any;
      expect(typedSummary.validation.isValid).toBe(true);
      expect(typedSummary.validation.warnings).toBe(1);
      expect(typedSummary.whisperCompatibility.supportedFormat).toBe(true);
    });

    it('should handle missing conversion config', () => {
      console.log('🧪 Testing summary without conversion config');
      
      const metadata = createMockMetadata();
      const validationResult: AudioValidationResult = {
        isValid: false,
        errors: ['File too large'],
        warnings: [],
        recommendations: [],
        metadata
      };
      
      const summary = createProcessingSummary(metadata, validationResult);
      
      const typedSummary = summary as any;
      expect(typedSummary.conversion).toBeNull();
    });
  });

  describe('WHISPER_CONSTRAINTS', () => {
    it('should have correct constraint values', () => {
      console.log('🧪 Testing Whisper constraint values');
      
      expect(WHISPER_CONSTRAINTS.MAX_FILE_SIZE).toBe(25 * 1024 * 1024);
      expect(WHISPER_CONSTRAINTS.OPTIMAL_SAMPLE_RATE).toBe(16000);
      expect(WHISPER_CONSTRAINTS.OPTIMAL_CHANNELS).toBe(1);
      expect(WHISPER_CONSTRAINTS.OPTIMAL_BIT_DEPTH).toBe(16);
      expect(WHISPER_CONSTRAINTS.RECOMMENDED_MIME_TYPE).toBe('audio/wav');
      
      expect(WHISPER_CONSTRAINTS.SUPPORTED_MIME_TYPES).toContain('audio/wav');
      expect(WHISPER_CONSTRAINTS.SUPPORTED_MIME_TYPES).toContain('audio/mp3');
      expect(WHISPER_CONSTRAINTS.SUPPORTED_MIME_TYPES).toContain('audio/webm');
      expect(WHISPER_CONSTRAINTS.SUPPORTED_MIME_TYPES).toHaveLength(7);
    });
  });

  describe('DEFAULT_CONVERSION_CONFIG', () => {
    it('should have optimal default values', () => {
      console.log('🧪 Testing default conversion config');
      
      expect(DEFAULT_CONVERSION_CONFIG.sampleRate).toBe(16000);
      expect(DEFAULT_CONVERSION_CONFIG.channels).toBe(1);
      expect(DEFAULT_CONVERSION_CONFIG.bitDepth).toBe(16);
      expect(DEFAULT_CONVERSION_CONFIG.format).toBe('wav');
      expect(DEFAULT_CONVERSION_CONFIG.quality).toBe(0.8);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete validation and conversion workflow', async () => {
      console.log('🧪 Testing complete workflow integration');
      
      // Create a typical browser recording scenario
      const blob = createMockAudioBlob(2 * 1024 * 1024, 'audio/webm'); // 2MB WebM from browser
      const metadata = createMockMetadata({
        duration: 180, // 3 minutes
        sampleRate: 48000, // High quality recording
        channels: 2, // Stereo
        mimeType: 'audio/webm',
        format: 'webm'
      });
      
      // Validate audio
      const validation = await validateAudioForWhisper(blob, metadata);
      expect(validation.isValid).toBe(true); // WebM is supported
      expect(validation.warnings.length).toBeGreaterThan(0); // Should have warnings about non-optimal settings
      
      // Calculate optimal settings
      const optimalConfig = calculateOptimalSettings(metadata);
      expect(optimalConfig.sampleRate).toBe(16000); // Should downsample
      expect(optimalConfig.channels).toBe(1); // Should convert to mono
      expect(optimalConfig.format).toBe('wav'); // Should prefer WAV for this size
      
      // Generate filename
      const filename = generateConvertedFilename('recording.webm', optimalConfig);
      expect(filename).toBe('recording_16000hz_1ch.wav');
      
      // Create processing summary
      const summary = createProcessingSummary(metadata, validation, optimalConfig);
      expect(summary).toBeDefined();
      
      console.log('✅ Complete workflow integration test passed');
    });

    it('should handle edge case with very large file', async () => {
      console.log('🧪 Testing large file edge case');
      
      const largeBlob = createMockAudioBlob(WHISPER_CONSTRAINTS.MAX_FILE_SIZE * 1.5, 'audio/wav');
      const metadata = createMockMetadata({
        fileSize: WHISPER_CONSTRAINTS.MAX_FILE_SIZE * 1.5,
        duration: 1200 // 20 minutes
      });
      
      const validation = await validateAudioForWhisper(largeBlob, metadata);
      expect(validation.isValid).toBe(false);
      
      const hasLargeSizeError = validation.errors.some(error => error.includes('exceeds Whisper limit'));
      expect(hasLargeSizeError).toBe(true);
      
      // Should still calculate optimal settings for if the file were split
      const optimalConfig = calculateOptimalSettings(metadata);
      expect(optimalConfig.format).toBe('mp3'); // Should prefer compression for large files
    });
  });
});

// Export test utilities for use in other test files
export {
  createMockAudioBlob,
  createMockMetadata
}; 