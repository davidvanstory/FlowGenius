/**
 * Unit Tests for Environment Validator
 * 
 * These tests validate the environment validation functionality including
 * API key validation, URL validation, and connection testing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateEnvironmentVariables, validateEnvironment, getValidatedConfig } from './envValidator';

// Mock the logger to avoid console output during tests
vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock fetch for connection testing
global.fetch = vi.fn();

describe('Environment Validator', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment variables after each test
    process.env = originalEnv;
  });

  describe('validateEnvironmentVariables', () => {
    it('should pass validation with all required environment variables', () => {
      // Arrange
      process.env.OPENAI_API_KEY = 'sk-test1234567890abcdef1234567890abcdef';
      process.env.SUPABASE_URL = 'https://test-project.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY0MDk5NTIwMCwiZXhwIjoxOTU2NTcxMjAwfQ.test';

      // Act
      const result = validateEnvironmentVariables();

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.config.required.OPENAI_API_KEY).toBe(process.env.OPENAI_API_KEY);
      expect(result.config.required.SUPABASE_URL).toBe(process.env.SUPABASE_URL);
      expect(result.config.required.SUPABASE_ANON_KEY).toBe(process.env.SUPABASE_ANON_KEY);
    });

    it('should fail validation with missing required environment variables', () => {
      // Arrange - Remove all required env vars
      delete process.env.OPENAI_API_KEY;
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_ANON_KEY;

      // Act
      const result = validateEnvironmentVariables();

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors).toContain('Missing required environment variable: OPENAI_API_KEY');
      expect(result.errors).toContain('Missing required environment variable: SUPABASE_URL');
      expect(result.errors).toContain('Missing required environment variable: SUPABASE_ANON_KEY');
    });

    it('should fail validation with invalid OpenAI API key format', () => {
      // Arrange
      process.env.OPENAI_API_KEY = 'invalid-api-key';
      process.env.SUPABASE_URL = 'https://test-project.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY0MDk5NTIwMCwiZXhwIjoxOTU2NTcxMjAwfQ.test';

      // Act
      const result = validateEnvironmentVariables();

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid OpenAI API key format. Expected to start with \'sk-\'');
    });

    it('should fail validation with invalid Supabase URL format', () => {
      // Arrange
      process.env.OPENAI_API_KEY = 'sk-test1234567890abcdef1234567890abcdef';
      process.env.SUPABASE_URL = 'not-a-valid-url';
      process.env.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY0MDk5NTIwMCwiZXhwIjoxOTU2NTcxMjAwfQ.test';

      // Act
      const result = validateEnvironmentVariables();

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid Supabase URL format: not-a-valid-url');
    });

    it('should show warning for non-supabase URL', () => {
      // Arrange
      process.env.OPENAI_API_KEY = 'sk-test1234567890abcdef1234567890abcdef';
      process.env.SUPABASE_URL = 'https://custom-backend.example.com';
      process.env.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY0MDk5NTIwMCwiZXhwIjoxOTU2NTcxMjAwfQ.test';

      // Act
      const result = validateEnvironmentVariables();

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Supabase URL doesn\'t contain \'supabase.co\'. Please verify this is correct.');
    });

         it('should use default values for optional environment variables', () => {
       // Arrange
       process.env.OPENAI_API_KEY = 'sk-test1234567890abcdef1234567890abcdef';
       process.env.SUPABASE_URL = 'https://test-project.supabase.co';
       process.env.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY0MDk5NTIwMCwiZXhwIjoxOTU2NTcxMjAwfQ.test';
       
       // Remove optional variables to test defaults
       delete process.env.NODE_ENV;
       delete process.env.MAX_RECORDING_DURATION;
       delete process.env.MAX_FILE_UPLOAD_SIZE;

       // Act
       const result = validateEnvironmentVariables();

       // Assert
       expect(result.isValid).toBe(true);
       expect(result.config.optional.NODE_ENV).toBe('development');
       expect(result.config.optional.MAX_RECORDING_DURATION).toBe('300');
       expect(result.config.optional.MAX_FILE_UPLOAD_SIZE).toBe('10');
     });

    it('should handle custom optional environment variables', () => {
      // Arrange
      process.env.OPENAI_API_KEY = 'sk-test1234567890abcdef1234567890abcdef';
      process.env.SUPABASE_URL = 'https://test-project.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY0MDk5NTIwMCwiZXhwIjoxOTU2NTcxMjAwfQ.test';
      process.env.NODE_ENV = 'production';
      process.env.MAX_RECORDING_DURATION = '600';
      process.env.MAX_FILE_UPLOAD_SIZE = '25';

      // Act
      const result = validateEnvironmentVariables();

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.config.optional.NODE_ENV).toBe('production');
      expect(result.config.optional.MAX_RECORDING_DURATION).toBe('600');
      expect(result.config.optional.MAX_FILE_UPLOAD_SIZE).toBe('25');
    });

    it('should handle invalid numeric optional environment variables', () => {
      // Arrange
      process.env.OPENAI_API_KEY = 'sk-test1234567890abcdef1234567890abcdef';
      process.env.SUPABASE_URL = 'https://test-project.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY0MDk5NTIwMCwiZXhwIjoxOTU2NTcxMjAwfQ.test';
      process.env.MAX_RECORDING_DURATION = 'not-a-number';
      process.env.MAX_FILE_UPLOAD_SIZE = '-5';

      // Act
      const result = validateEnvironmentVariables();

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Invalid MAX_RECORDING_DURATION value. Using default: 300s');
      expect(result.warnings).toContain('Invalid MAX_FILE_UPLOAD_SIZE value. Using default: 10MB');
      expect(result.config.optional.MAX_RECORDING_DURATION).toBe('300');
      expect(result.config.optional.MAX_FILE_UPLOAD_SIZE).toBe('10');
    });
  });

  describe('validateEnvironment', () => {
    beforeEach(() => {
      // Set up valid environment for connection tests
      process.env.OPENAI_API_KEY = 'sk-test1234567890abcdef1234567890abcdef';
      process.env.SUPABASE_URL = 'https://test-project.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY0MDk5NTIwMCwiZXhwIjoxOTU2NTcxMjAwfQ.test';
    });

    it('should pass validation and connection tests when all services are available', async () => {
      // Arrange
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 })); // OpenAI
      mockFetch.mockResolvedValueOnce(new Response('{}', { status: 404 })); // Supabase (404 is expected)

      // Act
      const result = await validateEnvironment(true);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.connectionsValid).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should fail connection tests when OpenAI API is unavailable', async () => {
      // Arrange
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 })); // OpenAI fails
      mockFetch.mockResolvedValueOnce(new Response('{}', { status: 404 })); // Supabase succeeds

      // Act
      const result = await validateEnvironment(true);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.connectionsValid).toBe(false);
    });

    it('should fail connection tests when Supabase is unavailable', async () => {
      // Arrange
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 })); // OpenAI succeeds
      mockFetch.mockResolvedValueOnce(new Response('Server Error', { status: 500 })); // Supabase fails

      // Act
      const result = await validateEnvironment(true);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.connectionsValid).toBe(false);
    });

    it('should skip connection tests when requested', async () => {
      // Arrange
      const mockFetch = vi.mocked(fetch);

      // Act
      const result = await validateEnvironment(false);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.connectionsValid).toBeUndefined();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle network errors during connection tests', async () => {
      // Arrange
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Act
      const result = await validateEnvironment(true);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.connectionsValid).toBe(false);
    });
  });

  describe('getValidatedConfig', () => {
         it('should return validated configuration when environment is valid', () => {
       // Arrange
       process.env.OPENAI_API_KEY = 'sk-test1234567890abcdef1234567890abcdef';
       process.env.SUPABASE_URL = 'https://test-project.supabase.co';
       process.env.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY0MDk5NTIwMCwiZXhwIjoxOTU2NTcxMjAwfQ.test';
       
       // Remove NODE_ENV to test default
       delete process.env.NODE_ENV;

       // Act
       const config = getValidatedConfig();

       // Assert
       expect(config).not.toBeNull();
       expect(config?.OPENAI_API_KEY).toBe(process.env.OPENAI_API_KEY);
       expect(config?.SUPABASE_URL).toBe(process.env.SUPABASE_URL);
       expect(config?.SUPABASE_ANON_KEY).toBe(process.env.SUPABASE_ANON_KEY);
       expect(config?.NODE_ENV).toBe('development');
     });

    it('should return null when environment is invalid', () => {
      // Arrange - Remove required env vars
      delete process.env.OPENAI_API_KEY;
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_ANON_KEY;

      // Act
      const config = getValidatedConfig();

      // Assert
      expect(config).toBeNull();
    });
  });
}); 