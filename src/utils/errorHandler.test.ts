/**
 * Unit Tests for Error Handler Utility
 * 
 * This test suite verifies the functionality of the global error handling utility,
 * including error classification, user-friendly message generation, recovery actions,
 * and integration with the logging system.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ErrorHandler,
  errorHandler,
  handleError,
  handleApiError,
  handleDatabaseError,
  handleAudioError,
  handleWorkflowError,
  ErrorCategory,
  ErrorSeverity,
  RecoveryAction,
  createErrorBoundaryHandler,
  withErrorHandling,
} from './errorHandler';

describe('ErrorHandler', () => {
  beforeEach(() => {
    console.log('🧪 ErrorHandler Test: Setting up test environment');
    // Clear error tracking before each test
    errorHandler.clearErrorTracking();
  });

  describe('Error Classification', () => {
    it('should classify network errors correctly', () => {
      console.log('🌐 Testing network error classification');
      
      const networkError = new Error('fetch failed');
      const errorInfo = handleError(networkError, 'network operation');
      
      expect(errorInfo.category).toBe(ErrorCategory.NETWORK);
      expect(errorInfo.severity).toBe(ErrorSeverity.HIGH);
      expect(errorInfo.userMessage).toContain('connect to the server');
      expect(errorInfo.recoveryActions).toContain(RecoveryAction.CHECK_CONNECTION);
    });

    it('should classify API errors correctly', () => {
      console.log('🔌 Testing API error classification');
      
      const apiError = new Error('openai API rate limit exceeded');
      const errorInfo = handleApiError(apiError, '/api/chat', 'POST', 429);
      
      expect(errorInfo.category).toBe(ErrorCategory.API);
      expect(errorInfo.metadata?.endpoint).toBe('/api/chat');
      expect(errorInfo.metadata?.method).toBe('POST');
      expect(errorInfo.metadata?.statusCode).toBe(429);
      expect(errorInfo.userMessage).toContain('Too many requests');
    });

    it('should classify database errors correctly', () => {
      console.log('🗄️ Testing database error classification');
      
      const dbError = new Error('database connection failed');
      const errorInfo = handleDatabaseError(dbError, 'insert', 'users');
      
      expect(errorInfo.category).toBe(ErrorCategory.DATABASE);
      expect(errorInfo.severity).toBe(ErrorSeverity.HIGH);
      expect(errorInfo.metadata?.operation).toBe('insert');
      expect(errorInfo.metadata?.table).toBe('users');
    });

    it('should classify audio errors correctly', () => {
      console.log('🎤 Testing audio error classification');
      
      const audioError = new Error('microphone access denied');
      const errorInfo = handleAudioError(audioError, 'start_recording');
      
      expect(errorInfo.category).toBe(ErrorCategory.PERMISSION);
      expect(errorInfo.userMessage).toContain('Microphone access is required');
      expect(errorInfo.recoveryActions).toContain(RecoveryAction.CHECK_PERMISSIONS);
    });

    it('should classify workflow errors correctly', () => {
      console.log('⚙️ Testing workflow error classification');
      
      const workflowError = new Error('node execution failed');
      const errorInfo = handleWorkflowError(workflowError, 'processUserTurn', { stage: 'brainstorm' });
      
      expect(errorInfo.category).toBe(ErrorCategory.WORKFLOW);
      expect(errorInfo.metadata?.nodeName).toBe('processUserTurn');
      expect(errorInfo.metadata?.stateData).toContain('brainstorm');
    });

    it('should handle unknown errors with fallback classification', () => {
      console.log('❓ Testing unknown error classification');
      
      const unknownError = new Error('something completely unexpected happened');
      const errorInfo = handleError(unknownError);
      
      expect(errorInfo.category).toBe(ErrorCategory.UNKNOWN);
      expect(errorInfo.severity).toBe(ErrorSeverity.MEDIUM);
      expect(errorInfo.userMessage).toContain('unexpected error occurred');
    });
  });

  describe('Error Severity Assignment', () => {
    it('should assign HIGH severity to authentication errors', () => {
      console.log('🔐 Testing authentication error severity');
      
      const authError = new Error('unauthorized access');
      const errorInfo = handleError(authError);
      
      expect(errorInfo.category).toBe(ErrorCategory.AUTHENTICATION);
      expect(errorInfo.severity).toBe(ErrorSeverity.HIGH);
    });

    it('should assign LOW severity to validation errors', () => {
      console.log('✅ Testing validation error severity');
      
      const validationError = new Error('invalid input format');
      const errorInfo = handleError(validationError);
      
      expect(errorInfo.category).toBe(ErrorCategory.VALIDATION);
      expect(errorInfo.severity).toBe(ErrorSeverity.LOW);
    });
  });

  describe('Recovery Actions', () => {
    it('should suggest appropriate recovery actions for network errors', () => {
      console.log('🔄 Testing network error recovery actions');
      
      const networkError = new Error('connection timeout');
      const errorInfo = handleError(networkError);
      const suggestions = errorHandler.getRecoverySuggestions(errorInfo);
      
      expect(suggestions).toHaveLength(2);
      expect(suggestions[0].action).toBe(RecoveryAction.CHECK_CONNECTION);
      expect(suggestions[1].action).toBe(RecoveryAction.RETRY);
    });

    it('should suggest login for authentication errors', () => {
      console.log('🔑 Testing authentication error recovery actions');
      
      const authError = new Error('session expired');
      const errorInfo = handleError(authError);
      const suggestions = errorHandler.getRecoverySuggestions(errorInfo);
      
      expect(suggestions.some(s => s.action === RecoveryAction.LOGIN)).toBe(true);
    });
  });

  describe('Error Tracking and Reporting', () => {
    it('should track error frequency', () => {
      console.log('📊 Testing error tracking');
      
      // Use a database error which has HIGH severity
      const sameError = new Error('database connection failed');
      
      // First occurrence
      const errorInfo1 = handleError(sameError, 'database');
      expect(errorInfo1.shouldReport).toBe(true);
      expect(errorInfo1.severity).toBe(ErrorSeverity.HIGH);
      
      // Second occurrence (should still report for HIGH severity)
      const errorInfo2 = handleError(sameError, 'database');
      expect(errorInfo2.shouldReport).toBe(true);
      expect(errorInfo2.severity).toBe(ErrorSeverity.HIGH);
      
      // Get stats
      const stats = errorHandler.getErrorStats();
      expect(stats.totalErrors).toBe(2);
    });

    it('should disable error reporting when configured', () => {
      console.log('🔇 Testing error reporting toggle');
      
      errorHandler.setErrorReporting(false);
      
      const error = new Error('test error');
      const errorInfo = handleError(error);
      
      expect(errorInfo.shouldReport).toBe(false);
      
      // Re-enable for other tests
      errorHandler.setErrorReporting(true);
    });
  });

  describe('Error ID Generation', () => {
    it('should generate unique error IDs', () => {
      console.log('🆔 Testing unique error ID generation');
      
      const error1 = handleError(new Error('error 1'));
      const error2 = handleError(new Error('error 2'));
      
      expect(error1.id).not.toBe(error2.id);
      expect(error1.id).toMatch(/^err_\d+_[a-z0-9]+$/);
      expect(error2.id).toMatch(/^err_\d+_[a-z0-9]+$/);
    });
  });

  describe('Error Metadata', () => {
    it('should include context in error metadata', () => {
      console.log('📝 Testing error metadata inclusion');
      
      const error = new Error('test error');
      const errorInfo = handleError(error, 'test context', {
        userId: 'user123',
        sessionId: 'session456',
      });
      
      expect(errorInfo.metadata?.context).toBe('test context');
      expect(errorInfo.metadata?.userId).toBe('user123');
      expect(errorInfo.metadata?.sessionId).toBe('session456');
      expect(errorInfo.metadata?.component).toBe('ErrorHandler');
    });
  });
});

describe('React Error Boundary Integration', () => {
  it('should create error boundary handler', () => {
    console.log('⚛️ Testing React Error Boundary handler creation');
    
    const handler = createErrorBoundaryHandler('TestComponent');
    expect(typeof handler).toBe('function');
    
    // Test that it handles React errors
    const reactError = new Error('Component render failed');
    const errorInfo = { componentStack: 'at TestComponent\n  at App' };
    
    const result = handler(reactError, errorInfo as React.ErrorInfo);
    expect(result.category).toBe(ErrorCategory.UI);
    expect(result.metadata?.componentStack).toBe(errorInfo.componentStack);
    expect(result.metadata?.errorBoundary).toBe('TestComponent');
  });
});

describe('Async Function Error Handling', () => {
  it('should wrap async functions with error handling', async () => {
    console.log('🔄 Testing async function error handling wrapper');
    
    const mockAsyncFunction = vi.fn().mockRejectedValue(new Error('Async operation failed'));
    const wrappedFunction = withErrorHandling(mockAsyncFunction, 'test operation');
    
    await expect(wrappedFunction()).rejects.toThrow('Async operation failed');
    expect(mockAsyncFunction).toHaveBeenCalled();
  });

  it('should pass through successful async function results', async () => {
    console.log('✅ Testing successful async function passthrough');
    
    const mockAsyncFunction = vi.fn().mockResolvedValue('success result');
    const wrappedFunction = withErrorHandling(mockAsyncFunction, 'test operation');
    
    const result = await wrappedFunction('test arg');
    expect(result).toBe('success result');
    expect(mockAsyncFunction).toHaveBeenCalledWith('test arg');
  });
});

describe('Error Statistics', () => {
  it('should provide comprehensive error statistics', () => {
    console.log('📈 Testing error statistics generation');
    
    // Create a fresh error handler for this test to avoid interference
    const statsErrorHandler = new ErrorHandler();
    
    // Generate some test errors
    statsErrorHandler.handleError(new Error('network error'), 'network');
    statsErrorHandler.handleApiError(new Error('api error'), '/test');
    statsErrorHandler.handleDatabaseError(new Error('db error'), 'select');
    
    const stats = statsErrorHandler.getErrorStats();
    
    expect(stats.totalErrors).toBe(3);
    expect(stats.errorsByCategory[ErrorCategory.NETWORK]).toBeGreaterThan(0);
    expect(stats.errorsByCategory[ErrorCategory.API]).toBeGreaterThan(0);
    expect(stats.errorsByCategory[ErrorCategory.DATABASE]).toBeGreaterThan(0);
    expect(typeof stats.recentErrors).toBe('number');
  });
});

console.log('✅ ErrorHandler Tests: All test suites defined and ready to run'); 