/**
 * Comprehensive Unit Tests for WhisperService
 * 
 * Tests all whisper service functionality including:
 * - Service initialization and configuration
 * - Audio transcription (blob and file)
 * - Retry logic with exponential backoff
 * - Error handling scenarios
 * - Rate limiting and quota management
 * - Integration with audio validation utilities
 * - Connection testing
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest';
import { 
  WhisperService, 
  createWhisperService,
  type WhisperConfig,
  type WhisperTranscriptionOptions,
  type WhisperTranscriptionResult
} from './whisperService';
import { logger } from '../utils/logger';

// Mock the logger to prevent console spam during tests
vi.mock('../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Mock audio utilities
vi.mock('../utils/audioUtils', () => ({
  validateAudioForWhisper: vi.fn(),
  createProcessingSummary: vi.fn(),
  WHISPER_CONSTRAINTS: {
    MAX_FILE_SIZE: 25 * 1024 * 1024,
    OPTIMAL_SAMPLE_RATE: 16000,
    OPTIMAL_CHANNELS: 1,
    OPTIMAL_BIT_DEPTH: 16,
    MAX_DURATION_SECONDS: 1800,
    SUPPORTED_MIME_TYPES: [
      'audio/wav',
      'audio/mp3',
      'audio/mpeg',
      'audio/mp4',
      'audio/m4a',
      'audio/webm',
      'audio/ogg'
    ],
    RECOMMENDED_MIME_TYPE: 'audio/wav'
  }
}));

// Import mocked functions
import { validateAudioForWhisper, createProcessingSummary } from '../utils/audioUtils';

describe('WhisperService', () => {
  let mockFetch: MockedFunction<typeof fetch>;
  let whisperService: WhisperService;
  let validConfig: WhisperConfig;
  let mockAudioBlob: Blob;

  beforeEach(() => {
    console.log('🧪 Setting up WhisperService test');
    
    // Reset all mocks
    vi.clearAllMocks();
    
    // Mock fetch globally
    mockFetch = vi.fn() as MockedFunction<typeof fetch>;
    global.fetch = mockFetch;
    
    // Mock AbortSignal.timeout
    global.AbortSignal = {
      timeout: vi.fn((timeout: number) => ({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        aborted: false,
        reason: undefined
      }))
    } as any;

    // Setup valid configuration
    validConfig = {
      apiKey: 'test-api-key-12345',
      baseUrl: 'https://api.openai.com/v1',
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      organization: 'test-org'
    };

    // Create mock audio blob
    mockAudioBlob = new Blob(['mock audio data'], { type: 'audio/wav' });

    // Create service instance
    whisperService = new WhisperService(validConfig);

    // Setup default audio validation mock
    (validateAudioForWhisper as MockedFunction<typeof validateAudioForWhisper>).mockResolvedValue({
      isValid: true,
      errors: [],
      warnings: [],
      recommendations: [],
      metadata: {
        duration: 60,
        fileSize: mockAudioBlob.size,
        mimeType: 'audio/wav',
        format: 'wav'
      }
    });

    // Setup processing summary mock
    (createProcessingSummary as MockedFunction<typeof createProcessingSummary>).mockReturnValue({
      original: { format: 'wav', size: '1.00MB' },
      validation: { isValid: true, errors: 0 }
    });
  });

  afterEach(() => {
    // Clean up mocks
    vi.restoreAllMocks();
  });

  describe('Service Initialization', () => {
    it('should initialize with valid configuration', () => {
      console.log('🧪 Testing valid service initialization');
      
      expect(whisperService).toBeInstanceOf(WhisperService);
      
      const status = whisperService.getStatus();
      expect(status.config.baseUrl).toBe(validConfig.baseUrl);
      expect(status.config.timeout).toBe(validConfig.timeout);
      expect(status.config.maxRetries).toBe(validConfig.maxRetries);
      expect(status.config.hasApiKey).toBe(true);
      expect(status.requestCount).toBe(0);
    });

    it('should throw error without API key', () => {
      console.log('🧪 Testing initialization without API key');
      
      expect(() => {
        new WhisperService({ apiKey: '' });
      }).toThrow('OpenAI API key is required for WhisperService');
    });

    it('should use default configuration values', () => {
      console.log('🧪 Testing default configuration values');
      
      const minimalConfig = { apiKey: 'test-key' };
      const service = new WhisperService(minimalConfig);
      
      const status = service.getStatus();
      expect(status.config.baseUrl).toBe('https://api.openai.com/v1');
      expect(status.config.timeout).toBe(30000);
      expect(status.config.maxRetries).toBe(3);
    });
  });

  describe('Audio Blob Transcription', () => {
    it('should successfully transcribe audio blob', async () => {
      console.log('🧪 Testing successful blob transcription');
      
      // Mock successful API response
      const mockResponse = {
        text: 'Hello, this is a test transcription.',
        language: 'en',
        duration: 3.5,
        segments: [{
          id: 0,
          seek: 0,
          start: 0.0,
          end: 3.5,
          text: 'Hello, this is a test transcription.',
          tokens: [1, 2, 3],
          temperature: 0,
          avgLogprob: -0.5,
          compressionRatio: 1.2,
          noSpeechProb: 0.1
        }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response);

      const result = await whisperService.transcribeBlob(mockAudioBlob);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.text).toBe(mockResponse.text);
      expect(result.data!.language).toBe(mockResponse.language);
      expect(result.data!.duration).toBe(mockResponse.duration);
      expect(result.data!.segments).toEqual(mockResponse.segments);
      expect(result.data!.metadata.fileSize).toBe(mockAudioBlob.size);
      expect(result.retryCount).toBe(0);

      // Verify API call was made correctly
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
      expect(options?.method).toBe('POST');
      expect(options?.headers).toMatchObject({
        'Authorization': 'Bearer test-api-key-12345',
        'OpenAI-Organization': 'test-org'
      });
    });

    it('should handle audio validation failure', async () => {
      console.log('🧪 Testing audio validation failure');
      
      // Mock validation failure
      (validateAudioForWhisper as MockedFunction<typeof validateAudioForWhisper>).mockResolvedValueOnce({
        isValid: false,
        errors: ['File size exceeds limit', 'Unsupported format'],
        warnings: [],
        recommendations: ['Convert to WAV format'],
        metadata: {
          duration: 60,
          fileSize: mockAudioBlob.size,
          mimeType: 'audio/flac',
          format: 'flac'
        }
      });

      const result = await whisperService.transcribeBlob(mockAudioBlob);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Audio validation failed');
      expect(result.error).toContain('File size exceeds limit');
      expect(result.error).toContain('Unsupported format');
      
      // Should not make API call if validation fails
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should skip validation when disabled', async () => {
      console.log('🧪 Testing transcription with validation disabled');
      
      // Mock successful API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ text: 'Test transcription' })
      } as Response);

      const options: WhisperTranscriptionOptions = {
        validateAudio: false,
        responseFormat: 'text'
      };

      const result = await whisperService.transcribeBlob(mockAudioBlob, options);

      expect(result.success).toBe(true);
      expect(validateAudioForWhisper).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling and Retry Logic', () => {
    it('should retry on retryable errors', async () => {
      console.log('🧪 Testing retry logic on retryable errors');
      
      // Mock rate limit error followed by success
      mockFetch
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockRejectedValueOnce(new Error('Temporary server error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ text: 'Success after retries' })
        } as Response);

      const result = await whisperService.transcribeBlob(mockAudioBlob, { validateAudio: false });

      expect(result.success).toBe(true);
      expect(result.data!.text).toBe('Success after retries');
      expect(result.retryCount).toBe(2); // Two failed attempts, third succeeded
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      console.log('🧪 Testing non-retryable error handling');
      
      mockFetch.mockRejectedValueOnce(new Error('Unauthorized: Invalid API key'));

      const result = await whisperService.transcribeBlob(mockAudioBlob, { validateAudio: false });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid API key');
      expect(mockFetch).toHaveBeenCalledTimes(1); // No retries
    });

    it('should handle HTTP error responses', async () => {
      console.log('🧪 Testing HTTP error response handling');
      
      const errorResponse = {
        error: {
          message: 'Audio file is too large',
          type: 'invalid_request_error'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve(JSON.stringify(errorResponse))
      } as unknown as Response);

      const result = await whisperService.transcribeBlob(mockAudioBlob, { validateAudio: false });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Audio file is too large');
    });

    it('should stop retrying after max attempts', async () => {
      console.log('🧪 Testing max retry attempts');
      
      const error = new Error('Persistent server error');
      mockFetch.mockRejectedValue(error);

      const result = await whisperService.transcribeBlob(mockAudioBlob, { validateAudio: false });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Persistent server error');
      expect(result.retryCount).toBe(3); // maxRetries = 3
      expect(mockFetch).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });
  });

  describe('Service Statistics and Status', () => {
    it('should track request statistics', async () => {
      console.log('🧪 Testing request statistics tracking');
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: 'Test' })
      } as Response);

      const initialStatus = whisperService.getStatus();
      expect(initialStatus.requestCount).toBe(0);
      expect(initialStatus.lastRequestTime).toBe(0);

      await whisperService.transcribeBlob(mockAudioBlob, { validateAudio: false });

      const updatedStatus = whisperService.getStatus();
      expect(updatedStatus.requestCount).toBe(1);
      expect(updatedStatus.lastRequestTime).toBeGreaterThan(0);
    });

    it('should provide accurate configuration status', () => {
      console.log('🧪 Testing configuration status');
      
      const status = whisperService.getStatus();
      
      expect(status.config.baseUrl).toBe(validConfig.baseUrl);
      expect(status.config.timeout).toBe(validConfig.timeout);
      expect(status.config.maxRetries).toBe(validConfig.maxRetries);
      expect(status.config.hasApiKey).toBe(true);
    });
  });

  describe('Connection Testing', () => {
    it('should successfully test connection', async () => {
      console.log('🧪 Testing successful connection test');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ text: '' })
      } as Response);

      const result = await whisperService.testConnection();

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle connection test failure', async () => {
      console.log('🧪 Testing connection test failure');
      
      // Mock error that occurs before response is available
      mockFetch.mockImplementationOnce(() => Promise.reject(new Error('Network error')));

      const result = await whisperService.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('Utility Functions', () => {
    it('should convert blob to file correctly', () => {
      console.log('🧪 Testing blob to file conversion');
      
      const service = new WhisperService(validConfig);
      const blob = new Blob(['test'], { type: 'audio/wav' });
      
      const file = service['blobToFile'](blob, 'test_audio');
      
      expect(file).toBeInstanceOf(File);
      expect(file.name).toBe('test_audio.wav');
      expect(file.type).toBe('audio/wav');
      expect(file.size).toBe(blob.size);
    });

    it('should get correct file extensions from MIME types', () => {
      console.log('🧪 Testing MIME type to extension mapping');
      
      const service = new WhisperService(validConfig);
      
      expect(service['getExtensionFromMimeType']('audio/wav')).toBe('wav');
      expect(service['getExtensionFromMimeType']('audio/mp3')).toBe('mp3');
      expect(service['getExtensionFromMimeType']('audio/mpeg')).toBe('mp3');
      expect(service['getExtensionFromMimeType']('audio/webm')).toBe('webm');
      expect(service['getExtensionFromMimeType']('audio/unknown')).toBe('bin');
    });

    it('should create valid test audio blob', () => {
      console.log('🧪 Testing test audio blob creation');
      
      const service = new WhisperService(validConfig);
      const testBlob = service['createTestAudioBlob']();
      
      expect(testBlob).toBeInstanceOf(Blob);
      expect(testBlob.type).toBe('audio/wav');
      expect(testBlob.size).toBeGreaterThan(44); // WAV header + some data
    });
  });

  describe('createWhisperService Factory Function', () => {
    beforeEach(() => {
      // Clear environment variables
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_ORGANIZATION;
      delete process.env.WHISPER_TIMEOUT;
      delete process.env.WHISPER_MAX_RETRIES;
      delete process.env.WHISPER_RETRY_DELAY;
    });

    it('should create service from environment variables', () => {
      console.log('🧪 Testing factory function with environment variables');
      
      process.env.OPENAI_API_KEY = 'env-api-key';
      process.env.OPENAI_ORGANIZATION = 'env-org';
      process.env.WHISPER_TIMEOUT = '45000';
      process.env.WHISPER_MAX_RETRIES = '5';
      process.env.WHISPER_RETRY_DELAY = '2000';

      const service = createWhisperService();
      const status = service.getStatus();

      expect(status.config.hasApiKey).toBe(true);
      expect(status.config.timeout).toBe(45000);
      expect(status.config.maxRetries).toBe(5);
    });

    it('should throw error without OPENAI_API_KEY', () => {
      console.log('🧪 Testing factory function without API key');
      
      expect(() => {
        createWhisperService();
      }).toThrow('OPENAI_API_KEY environment variable is required');
    });
  });
});
