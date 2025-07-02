/**
 * LangGraph Workflow Error Handler
 * 
 * This module provides comprehensive error handling and recovery mechanisms
 * for the LangGraph workflow. It includes retry logic, circuit breaker pattern,
 * state recovery, and automatic error recovery strategies.
 * 
 * Key Features:
 * - Automatic retry with exponential backoff
 * - Circuit breaker pattern for failing nodes
 * - State rollback and recovery
 * - Error classification and recovery strategies
 * - Workflow health monitoring
 * - Graceful degradation
 */

import { AppState, WorkflowStage } from '../../../src/types/AppState';
import { ErrorHandler, ErrorInfo, RecoveryAction } from '../../../src/utils/errorHandler';
import { logger } from '../../../src/utils/logger';
import { StateRecovery, stateHistory, StateSnapshot } from './stateUtils';
import { WorkflowLogger } from './workflowLogger';

/**
 * Retry configuration for workflow operations
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenMaxAttempts: number;
}

/**
 * Node health status
 */
export interface NodeHealth {
  nodeName: string;
  successCount: number;
  failureCount: number;
  lastFailureTime?: Date;
  circuitBreakerState: CircuitBreakerState;
  averageExecutionTime: number;
}

/**
 * Recovery strategy types
 */
export enum RecoveryStrategy {
  RETRY = 'RETRY',
  ROLLBACK = 'ROLLBACK',
  SKIP = 'SKIP',
  FALLBACK = 'FALLBACK',
  MANUAL = 'MANUAL'
}

/**
 * Recovery plan for handling errors
 */
export interface RecoveryPlan {
  strategy: RecoveryStrategy;
  retryConfig?: RetryConfig;
  fallbackValue?: any;
  skipCondition?: (state: AppState) => boolean;
  manualInstructions?: string;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableErrors: ['NETWORK_ERROR', 'TIMEOUT', 'RATE_LIMIT']
};

/**
 * Default circuit breaker configuration
 */
const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
  halfOpenMaxAttempts: 3
};

/**
 * Workflow Error Handler class
 */
export class WorkflowErrorHandler {
  private errorHandler: ErrorHandler;
  private workflowLogger: WorkflowLogger;
  private nodeHealthMap: Map<string, NodeHealth>;
  private circuitBreakers: Map<string, CircuitBreakerConfig>;
  private retryConfigs: Map<string, RetryConfig>;
  private recoveryPlans: Map<string, RecoveryPlan>;

  constructor(workflowLogger: WorkflowLogger) {
    this.errorHandler = new ErrorHandler();
    this.workflowLogger = workflowLogger;
    this.nodeHealthMap = new Map();
    this.circuitBreakers = new Map();
    this.retryConfigs = new Map();
    this.recoveryPlans = new Map();

    this.initializeDefaultConfigurations();
  }

  /**
   * Initialize default configurations for nodes
   */
  private initializeDefaultConfigurations(): void {
    // Set default retry configs for each node
    const nodes = ['processUserTurn', 'processVoiceInput', 'generateSummary'];
    nodes.forEach(node => {
      this.retryConfigs.set(node, { ...DEFAULT_RETRY_CONFIG });
      this.circuitBreakers.set(node, { ...DEFAULT_CIRCUIT_BREAKER_CONFIG });
      this.nodeHealthMap.set(node, {
        nodeName: node,
        successCount: 0,
        failureCount: 0,
        circuitBreakerState: CircuitBreakerState.CLOSED,
        averageExecutionTime: 0
      });
    });

    // Set default recovery plans
    this.recoveryPlans.set('processUserTurn', {
      strategy: RecoveryStrategy.RETRY,
      retryConfig: this.retryConfigs.get('processUserTurn')
    });

    this.recoveryPlans.set('processVoiceInput', {
      strategy: RecoveryStrategy.FALLBACK,
      fallbackValue: { 
        transcription: '[Voice input failed. Please type your message instead.]',
        is_processing: false 
      }
    });

    this.recoveryPlans.set('generateSummary', {
      strategy: RecoveryStrategy.RETRY,
      retryConfig: {
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 5 // More attempts for summary generation
      }
    });
  }

  /**
   * Handle workflow node error with recovery
   */
  async handleNodeError(
    error: Error,
    nodeName: string,
    state: AppState,
    nodeFunction: (state: AppState) => Promise<Partial<AppState>>
  ): Promise<Partial<AppState>> {
    console.log(`🚨 WorkflowErrorHandler: Handling error in node ${nodeName}`, {
      error: error.message,
      stage: state.current_stage
    });

    // Log the error
    this.workflowLogger.logNodeError(nodeName, error, state);

    // Update node health
    this.updateNodeHealth(nodeName, false);

    // Check circuit breaker
    if (this.isCircuitOpen(nodeName)) {
      console.log(`⚡ WorkflowErrorHandler: Circuit breaker OPEN for ${nodeName}`);
      return this.handleCircuitBreakerOpen(nodeName, state, error);
    }

    // Get recovery plan
    const recoveryPlan = this.recoveryPlans.get(nodeName) || {
      strategy: RecoveryStrategy.MANUAL
    };

    // Execute recovery strategy
    switch (recoveryPlan.strategy) {
      case RecoveryStrategy.RETRY:
        return this.executeRetryStrategy(
          nodeName, 
          state, 
          nodeFunction, 
          recoveryPlan.retryConfig || DEFAULT_RETRY_CONFIG
        );

      case RecoveryStrategy.ROLLBACK:
        return this.executeRollbackStrategy(nodeName, state, error);

      case RecoveryStrategy.SKIP:
        return this.executeSkipStrategy(nodeName, state, recoveryPlan);

      case RecoveryStrategy.FALLBACK:
        return this.executeFallbackStrategy(nodeName, state, recoveryPlan);

      case RecoveryStrategy.MANUAL:
      default:
        return this.executeManualStrategy(nodeName, state, error);
    }
  }

  /**
   * Execute retry strategy with exponential backoff
   */
  private async executeRetryStrategy(
    nodeName: string,
    state: AppState,
    nodeFunction: (state: AppState) => Promise<Partial<AppState>>,
    retryConfig: RetryConfig
  ): Promise<Partial<AppState>> {
    console.log(`🔄 WorkflowErrorHandler: Executing retry strategy for ${nodeName}`);

    let lastError: Error | null = null;
    let delay = retryConfig.initialDelay;

    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        console.log(`🔄 Retry attempt ${attempt}/${retryConfig.maxAttempts} for ${nodeName}`);
        
        // Wait before retry (except first attempt)
        if (attempt > 1) {
          await this.delay(delay);
          delay = Math.min(delay * retryConfig.backoffMultiplier, retryConfig.maxDelay);
        }

        // Clear error state before retry
        const retryState = StateRecovery.clearError(state);
        
        // Attempt node execution
        const result = await nodeFunction(retryState);
        
        // Success - update health and return
        this.updateNodeHealth(nodeName, true);
        console.log(`✅ WorkflowErrorHandler: Retry successful for ${nodeName}`);
        
        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.log(`❌ Retry attempt ${attempt} failed for ${nodeName}:`, lastError.message);
        
        // Check if error is retryable
        if (!this.isRetryableError(lastError, retryConfig)) {
          console.log(`🚫 Error is not retryable, stopping retry attempts`);
          break;
        }
      }
    }

    // All retries failed
    console.log(`❌ WorkflowErrorHandler: All retry attempts failed for ${nodeName}`);
    return this.createErrorState(state, lastError || new Error('All retry attempts failed'));
  }

  /**
   * Execute rollback strategy
   */
  private async executeRollbackStrategy(
    nodeName: string,
    state: AppState,
    error: Error
  ): Promise<Partial<AppState>> {
    console.log(`⏪ WorkflowErrorHandler: Executing rollback strategy for ${nodeName}`);

    // Get previous stable state from history
    const latestSnapshot = stateHistory.getLatestSnapshot();
    
    if (latestSnapshot && !latestSnapshot.state.error && !latestSnapshot.state.is_processing) {
      console.log(`✅ Rolling back to stable state from ${latestSnapshot.nodeName}`);
      return StateRecovery.createRecoveryState(latestSnapshot.state, error);
    }

    console.log(`❌ No stable state found for rollback`);
    return this.createErrorState(state, error);
  }

  /**
   * Execute skip strategy
   */
  private async executeSkipStrategy(
    nodeName: string,
    state: AppState,
    recoveryPlan: RecoveryPlan
  ): Promise<Partial<AppState>> {
    console.log(`⏭️ WorkflowErrorHandler: Executing skip strategy for ${nodeName}`);

    // Check skip condition if provided
    if (recoveryPlan.skipCondition && !recoveryPlan.skipCondition(state)) {
      console.log(`❌ Skip condition not met, cannot skip ${nodeName}`);
      return this.createErrorState(state, new Error(`Cannot skip ${nodeName}`));
    }

    // Return state with processing complete but no changes
    return {
      is_processing: false,
      error: undefined
    };
  }

  /**
   * Execute fallback strategy
   */
  private async executeFallbackStrategy(
    nodeName: string,
    state: AppState,
    recoveryPlan: RecoveryPlan
  ): Promise<Partial<AppState>> {
    console.log(`🔀 WorkflowErrorHandler: Executing fallback strategy for ${nodeName}`);

    if (!recoveryPlan.fallbackValue) {
      console.log(`❌ No fallback value defined for ${nodeName}`);
      return this.createErrorState(state, new Error(`No fallback value for ${nodeName}`));
    }

    // Return fallback value
    return recoveryPlan.fallbackValue;
  }

  /**
   * Execute manual recovery strategy
   */
  private async executeManualStrategy(
    nodeName: string,
    state: AppState,
    error: Error
  ): Promise<Partial<AppState>> {
    console.log(`🔧 WorkflowErrorHandler: Manual recovery required for ${nodeName}`);

    const errorInfo = this.errorHandler.handleWorkflowError(error, nodeName, state);
    
    return {
      is_processing: false,
      error: errorInfo.userMessage,
      messages: [{
        role: 'assistant',
        content: `I encountered an error that requires assistance. ${errorInfo.userMessage}`,
        created_at: new Date(),
        stage_at_creation: state.current_stage
      }]
    };
  }

  /**
   * Handle circuit breaker open state
   */
  private handleCircuitBreakerOpen(
    nodeName: string,
    state: AppState,
    error: Error
  ): Partial<AppState> {
    const health = this.nodeHealthMap.get(nodeName);
    
    if (health && health.circuitBreakerState === CircuitBreakerState.HALF_OPEN) {
      // Try once in half-open state
      console.log(`🔌 Circuit breaker is HALF_OPEN for ${nodeName}, allowing one attempt`);
      return this.createErrorState(state, error, true);
    }

    // Circuit is fully open - fail fast
    console.log(`⛔ Circuit breaker is OPEN for ${nodeName}, failing fast`);
    
    return {
      is_processing: false,
      error: `Service temporarily unavailable. The ${nodeName} component is experiencing issues. Please try again later.`,
      messages: [{
        role: 'assistant',
        content: 'This feature is temporarily unavailable due to technical issues. Our team has been notified. Please try again in a few minutes.',
        created_at: new Date(),
        stage_at_creation: state.current_stage
      }]
    };
  }

  /**
   * Update node health metrics
   */
  private updateNodeHealth(nodeName: string, success: boolean): void {
    const health = this.nodeHealthMap.get(nodeName);
    if (!health) return;

    if (success) {
      health.successCount++;
      health.failureCount = 0; // Reset failure count on success
      
      // Close circuit breaker if it was open
      if (health.circuitBreakerState !== CircuitBreakerState.CLOSED) {
        console.log(`✅ Closing circuit breaker for ${nodeName}`);
        health.circuitBreakerState = CircuitBreakerState.CLOSED;
      }
    } else {
      health.failureCount++;
      health.lastFailureTime = new Date();
      
      // Check if we need to open circuit breaker
      const config = this.circuitBreakers.get(nodeName);
      if (config && health.failureCount >= config.failureThreshold) {
        console.log(`⚡ Opening circuit breaker for ${nodeName} after ${health.failureCount} failures`);
        health.circuitBreakerState = CircuitBreakerState.OPEN;
        
        // Schedule circuit breaker reset
        setTimeout(() => {
          console.log(`🔌 Setting circuit breaker to HALF_OPEN for ${nodeName}`);
          health.circuitBreakerState = CircuitBreakerState.HALF_OPEN;
        }, config.resetTimeout);
      }
    }

    this.nodeHealthMap.set(nodeName, health);
  }

  /**
   * Check if circuit breaker is open for a node
   */
  private isCircuitOpen(nodeName: string): boolean {
    const health = this.nodeHealthMap.get(nodeName);
    return health ? health.circuitBreakerState === CircuitBreakerState.OPEN : false;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error, retryConfig: RetryConfig): boolean {
    if (!retryConfig.retryableErrors || retryConfig.retryableErrors.length === 0) {
      return true; // Retry all errors if no specific list
    }

    const errorMessage = error.message.toUpperCase();
    return retryConfig.retryableErrors.some(retryableError => 
      errorMessage.includes(retryableError.toUpperCase())
    );
  }

  /**
   * Create error state
   */
  private createErrorState(
    state: AppState, 
    error: Error,
    allowRetry: boolean = false
  ): Partial<AppState> {
    const errorInfo = this.errorHandler.handleWorkflowError(error, undefined, state);
    
    return {
      is_processing: false,
      error: errorInfo.userMessage,
      messages: allowRetry ? undefined : [{
        role: 'assistant',
        content: errorInfo.userMessage,
        created_at: new Date(),
        stage_at_creation: state.current_stage
      }]
    };
  }

  /**
   * Delay helper for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get workflow health status
   */
  getWorkflowHealth(): {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    nodes: NodeHealth[];
    recommendations: string[];
  } {
    const nodes = Array.from(this.nodeHealthMap.values());
    const openCircuits = nodes.filter(n => n.circuitBreakerState !== CircuitBreakerState.CLOSED);
    const failingNodes = nodes.filter(n => n.failureCount > 0);

    let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const recommendations: string[] = [];

    if (openCircuits.length > 0) {
      overall = 'unhealthy';
      recommendations.push(`${openCircuits.length} nodes have open circuit breakers`);
    } else if (failingNodes.length > 0) {
      overall = 'degraded';
      recommendations.push(`${failingNodes.length} nodes are experiencing failures`);
    }

    // Add specific recommendations
    openCircuits.forEach(node => {
      recommendations.push(`${node.nodeName}: Circuit breaker open. Will retry in ${this.circuitBreakers.get(node.nodeName)?.resetTimeout || 60000}ms`);
    });

    return { overall, nodes, recommendations };
  }

  /**
   * Reset node health (for testing or manual recovery)
   */
  resetNodeHealth(nodeName?: string): void {
    if (nodeName) {
      const health = this.nodeHealthMap.get(nodeName);
      if (health) {
        health.successCount = 0;
        health.failureCount = 0;
        health.circuitBreakerState = CircuitBreakerState.CLOSED;
        health.lastFailureTime = undefined;
      }
    } else {
      // Reset all nodes
      this.nodeHealthMap.forEach((health, name) => {
        this.resetNodeHealth(name);
      });
    }
  }
}

// Create singleton instance for use across the application
export const workflowErrorHandler = new WorkflowErrorHandler(
  new WorkflowLogger('main-workflow')
); 