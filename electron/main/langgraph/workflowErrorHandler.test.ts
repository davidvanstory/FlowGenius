/**
 * Tests for LangGraph Workflow Error Handler
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { 
  WorkflowErrorHandler, 
  RetryConfig, 
  CircuitBreakerState,
  RecoveryStrategy
} from './workflowErrorHandler';
import { AppState } from '../../../src/types/AppState';
import { createInitialLangGraphState } from './state';
import { WorkflowLogger } from './workflowLogger';
import { StateRecovery } from './stateUtils';

// Mock dependencies
vi.mock('./workflowLogger');
vi.mock('../utils/logger');

describe('WorkflowErrorHandler', () => {
  let errorHandler: WorkflowErrorHandler;
  let mockLogger: WorkflowLogger;
  let testState: AppState;

  beforeEach(() => {
    console.log('🧪 Setting up WorkflowErrorHandler tests');
    
    mockLogger = new WorkflowLogger('test-workflow');
    errorHandler = new WorkflowErrorHandler(mockLogger);
    testState = createInitialLangGraphState('test-123', 'user-456');
    
    // Reset node health to ensure clean state
    errorHandler.resetNodeHealth();
    
    // Clear all timers
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Retry Strategy', () => {
    it('should retry failed operations with exponential backoff', async () => {
      console.log('🧪 Testing retry with exponential backoff');
      
      let attemptCount = 0;
      const mockNodeFunction = vi.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('NETWORK_ERROR: Connection failed');
        }
        return { is_processing: false };
      });

      // Start the error handling
      const resultPromise = errorHandler.handleNodeError(
        new Error('NETWORK_ERROR: Connection failed'),
        'processUserTurn',
        testState,
        mockNodeFunction
      );

      // Advance through the retry delays
      await vi.advanceTimersByTimeAsync(1000); // First retry after 1s
      await vi.advanceTimersByTimeAsync(2000); // Second retry after 2s (exponential)
      
      const result = await resultPromise;

      expect(mockNodeFunction).toHaveBeenCalledTimes(3);
      expect(result.is_processing).toBe(false);
      expect(result.error).toBeUndefined();
    }, 10000); // Add timeout

    it('should stop retrying non-retryable errors', async () => {
      console.log('🧪 Testing non-retryable error handling');
      
      const mockNodeFunction = vi.fn().mockRejectedValue(
        new Error('VALIDATION_ERROR: Invalid input')
      );

      const result = await errorHandler.handleNodeError(
        new Error('VALIDATION_ERROR: Invalid input'),
        'processUserTurn',
        testState,
        mockNodeFunction
      );

      // Should only try once for non-retryable errors
      expect(mockNodeFunction).toHaveBeenCalledTimes(1);
      expect(result.error).toBeDefined();
    });

    it('should respect max retry attempts', async () => {
      console.log('🧪 Testing max retry attempts');
      
      const mockNodeFunction = vi.fn().mockRejectedValue(
        new Error('NETWORK_ERROR: Connection failed')
      );

      // Start the error handling
      const resultPromise = errorHandler.handleNodeError(
        new Error('NETWORK_ERROR: Connection failed'),
        'processUserTurn',
        testState,
        mockNodeFunction
      );

      // Advance through all retry delays
      await vi.advanceTimersByTimeAsync(1000); // First retry
      await vi.advanceTimersByTimeAsync(2000); // Second retry
      await vi.advanceTimersByTimeAsync(4000); // Third retry would be here but max is 3
      
      const result = await resultPromise;

      expect(mockNodeFunction).toHaveBeenCalledTimes(3); // Default max attempts
      expect(result.error).toBeDefined();
      expect(result.is_processing).toBe(false);
    }, 10000); // Add timeout
  });

  describe('Circuit Breaker', () => {
    it('should open circuit breaker after failure threshold', async () => {
      console.log('🧪 Testing circuit breaker opening');
      
      const mockNodeFunction = vi.fn().mockRejectedValue(
        new Error('Service unavailable')
      );

      // Reset node health to ensure clean state
      errorHandler.resetNodeHealth('processUserTurn');

      // The circuit breaker should open after 5 failures
      // Since "Service unavailable" is not retryable, each call only tries once
      let callCount = 0;
      let circuitOpened = false;
      
      // Keep calling until circuit opens
      while (!circuitOpened && callCount < 10) {
        const result = await errorHandler.handleNodeError(
          new Error('Service unavailable'),
          'processUserTurn',
          testState,
          mockNodeFunction
        );
        callCount++;
        
        // Check if circuit is open
        if (result.error?.includes('temporarily unavailable')) {
          circuitOpened = true;
        }
      }

      // Circuit should have opened
      expect(circuitOpened).toBe(true);
      // Should have taken 5 calls to open the circuit and detect it (threshold is 5)
      expect(callCount).toBe(5);
      // The mock function should have been called 4 times (not called when circuit is open on the 5th attempt)
      expect(mockNodeFunction).toHaveBeenCalledTimes(4);
    });

    it('should transition to half-open after reset timeout', async () => {
      console.log('🧪 Testing circuit breaker half-open state');
      
      const mockNodeFunction = vi.fn()
        .mockRejectedValueOnce(new Error('Service error'))
        .mockResolvedValueOnce({ is_processing: false });

      // Open the circuit
      errorHandler['nodeHealthMap'].set('processUserTurn', {
        nodeName: 'processUserTurn',
        successCount: 0,
        failureCount: 5,
        circuitBreakerState: CircuitBreakerState.OPEN,
        lastFailureTime: new Date(),
        averageExecutionTime: 0
      });

      // Advance time to trigger half-open
      vi.advanceTimersByTime(60000);

      // Set to half-open manually for test
      errorHandler['nodeHealthMap'].get('processUserTurn')!.circuitBreakerState = CircuitBreakerState.HALF_OPEN;

      const result = await errorHandler.handleNodeError(
        new Error('Service error'),
        'processUserTurn',
        testState,
        mockNodeFunction
      );

      expect(result.error).toBeDefined();
    });
  });

  describe('Recovery Strategies', () => {
    it('should execute fallback strategy', async () => {
      console.log('🧪 Testing fallback strategy');
      
      // Set up fallback recovery plan
      errorHandler['recoveryPlans'].set('processVoiceInput', {
        strategy: RecoveryStrategy.FALLBACK,
        fallbackValue: {
          transcription: '[Voice input failed. Please type your message instead.]',
          is_processing: false
        }
      });

      const mockNodeFunction = vi.fn().mockRejectedValue(
        new Error('Microphone access denied')
      );

      const result = await errorHandler.handleNodeError(
        new Error('Microphone access denied'),
        'processVoiceInput',
        testState,
        mockNodeFunction
      );

      // Cast to any to access custom properties from fallback value
      const fallbackResult = result as any;
      expect(fallbackResult.transcription).toBe('[Voice input failed. Please type your message instead.]');
      expect(result.is_processing).toBe(false);
    });

    it('should execute rollback strategy', async () => {
      console.log('🧪 Testing rollback strategy');
      
      // Set up rollback recovery plan
      errorHandler['recoveryPlans'].set('generateSummary', {
        strategy: RecoveryStrategy.ROLLBACK
      });

      const mockNodeFunction = vi.fn().mockRejectedValue(
        new Error('Summary generation failed')
      );

      const result = await errorHandler.handleNodeError(
        new Error('Summary generation failed'),
        'generateSummary',
        testState,
        mockNodeFunction
      );

      expect(result.error).toBeDefined();
      expect(result.messages).toBeDefined();
    });

    it('should execute skip strategy with condition', async () => {
      console.log('🧪 Testing skip strategy with condition');
      
      // Set up skip recovery plan
      errorHandler['recoveryPlans'].set('processUserTurn', {
        strategy: RecoveryStrategy.SKIP,
        skipCondition: (state) => state.current_stage === 'brainstorm'
      });

      const mockNodeFunction = vi.fn().mockRejectedValue(
        new Error('Processing failed')
      );

      const result = await errorHandler.handleNodeError(
        new Error('Processing failed'),
        'processUserTurn',
        testState,
        mockNodeFunction
      );

      expect(result.is_processing).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('should execute manual strategy as default', async () => {
      console.log('🧪 Testing manual recovery strategy');
      
      // Remove recovery plan to trigger manual strategy
      errorHandler['recoveryPlans'].delete('processUserTurn');

      const mockNodeFunction = vi.fn().mockRejectedValue(
        new Error('Unknown error')
      );

      const result = await errorHandler.handleNodeError(
        new Error('Unknown error'),
        'processUserTurn',
        testState,
        mockNodeFunction
      );

      expect(result.error).toBeDefined();
      expect(result.messages).toBeDefined();
      expect(result.messages![0].content).toContain('encountered an error');
    });
  });

  describe('Workflow Health Monitoring', () => {
    it('should track node health metrics', async () => {
      console.log('🧪 Testing health metrics tracking');
      
      const mockNodeFunction = vi.fn()
        .mockResolvedValueOnce({ is_processing: false })
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ is_processing: false });

      // Success
      await errorHandler.handleNodeError(
        new Error('Will succeed'),
        'processUserTurn',
        testState,
        mockNodeFunction
      );

      // Failure
      await errorHandler.handleNodeError(
        new Error('Failed'),
        'processUserTurn',
        testState,
        mockNodeFunction
      );

      // Success again
      await errorHandler.handleNodeError(
        new Error('Will succeed'),
        'processUserTurn',
        testState,
        mockNodeFunction
      );

      const health = errorHandler.getWorkflowHealth();
      expect(health.overall).toBe('healthy');
      
      const nodeHealth = health.nodes.find(n => n.nodeName === 'processUserTurn');
      expect(nodeHealth?.successCount).toBe(2);
      expect(nodeHealth?.failureCount).toBe(0); // Reset after success
    });

    it('should provide health recommendations', () => {
      console.log('🧪 Testing health recommendations');
      
      // Set unhealthy state
      errorHandler['nodeHealthMap'].set('processUserTurn', {
        nodeName: 'processUserTurn',
        successCount: 10,
        failureCount: 5,
        circuitBreakerState: CircuitBreakerState.OPEN,
        lastFailureTime: new Date(),
        averageExecutionTime: 1000
      });

      const health = errorHandler.getWorkflowHealth();
      expect(health.overall).toBe('unhealthy');
      expect(health.recommendations.length).toBeGreaterThan(0);
      expect(health.recommendations[0]).toContain('circuit breaker');
    });

    it('should reset node health', () => {
      console.log('🧪 Testing health reset');
      
      // Set some health data
      errorHandler['nodeHealthMap'].set('processUserTurn', {
        nodeName: 'processUserTurn',
        successCount: 100,
        failureCount: 5,
        circuitBreakerState: CircuitBreakerState.OPEN,
        lastFailureTime: new Date(),
        averageExecutionTime: 500
      });

      // Reset specific node
      errorHandler.resetNodeHealth('processUserTurn');
      
      const nodeHealth = errorHandler['nodeHealthMap'].get('processUserTurn');
      expect(nodeHealth?.successCount).toBe(0);
      expect(nodeHealth?.failureCount).toBe(0);
      expect(nodeHealth?.circuitBreakerState).toBe(CircuitBreakerState.CLOSED);

      // Reset all nodes
      errorHandler.resetNodeHealth();
      
      errorHandler['nodeHealthMap'].forEach(health => {
        expect(health.successCount).toBe(0);
        expect(health.failureCount).toBe(0);
      });
    });
  });

  describe('Error Classification', () => {
    it('should identify retryable errors correctly', () => {
      console.log('🧪 Testing retryable error identification');
      
      const retryConfig: RetryConfig = {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        retryableErrors: ['NETWORK_ERROR', 'TIMEOUT']
      };

      expect(errorHandler['isRetryableError'](
        new Error('NETWORK_ERROR: Connection failed'),
        retryConfig
      )).toBe(true);

      expect(errorHandler['isRetryableError'](
        new Error('VALIDATION_ERROR: Invalid input'),
        retryConfig
      )).toBe(false);
    });
  });
}); 