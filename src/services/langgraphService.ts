/**
 * LangGraph Service for Browser/Renderer Process
 * 
 * This service provides a clean API for interacting with the LangGraph
 * workflow engine running in the Electron main process via IPC.
 * 
 * Key Features:
 * - Type-safe IPC communication
 * - Error handling and retry logic
 * - Performance monitoring
 * - Session management
 */

import { AppState } from '../types/AppState';
import { logger } from '../utils/logger';

/**
 * IPC response type
 */
interface IPCResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  duration?: number;
}

/**
 * Workflow metrics type
 */
interface WorkflowMetrics {
  workflowId: string;
  duration: number;
  eventCount: number;
  errorCount: number;
  nodeExecutions: Record<string, { count: number; avgDuration: number }>;
  stateUpdateCount: number;
}

/**
 * Validation result type
 */
interface ValidationResult {
  isValid: boolean;
  issues: string[];
}

/**
 * Global window interface extension for LangGraph API
 */
declare global {
  interface Window {
    langgraph: {
      execute: (state: AppState) => Promise<IPCResponse<AppState>>;
      createSession: (ideaId: string, userId?: string) => Promise<IPCResponse<AppState>>;
      validateState: (state: AppState) => Promise<IPCResponse<ValidationResult>>;
      getMetrics: (ideaId: string) => Promise<IPCResponse<WorkflowMetrics | null>>;
      clearSession: (ideaId: string) => Promise<IPCResponse<void>>;
    };
  }
}

/**
 * LangGraph service class
 */
class LangGraphService {
  private retryCount = 3;
  private retryDelay = 1000; // 1 second

  /**
   * Execute workflow with retry logic
   */
  async executeWorkflow(state: AppState): Promise<AppState> {
    const startTime = Date.now();
    
    logger.info('🚀 LangGraphService: Executing workflow', {
      ideaId: state.idea_id,
      stage: state.current_stage,
      action: state.last_user_action
    });

    let lastError: string | undefined;
    
    for (let attempt = 1; attempt <= this.retryCount; attempt++) {
      try {
        const response = await window.langgraph.execute(state);
        
        if (response.success && response.data) {
          const duration = Date.now() - startTime;
          
          logger.info('✅ LangGraphService: Workflow execution completed', {
            ideaId: response.data.idea_id,
            duration,
            ipcDuration: response.duration,
            attempt
          });
          
          return response.data;
        } else {
          lastError = response.error || 'Unknown error';
          throw new Error(lastError);
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        lastError = errorMessage;
        
        logger.warn(`⚠️ LangGraphService: Workflow execution attempt ${attempt} failed`, {
          error: errorMessage,
          attempt,
          willRetry: attempt < this.retryCount
        });
        
        if (attempt < this.retryCount) {
          await this.delay(this.retryDelay * attempt); // Exponential backoff
        }
      }
    }
    
    throw new Error(`Workflow execution failed after ${this.retryCount} attempts: ${lastError}`);
  }

  /**
   * Create a new workflow session
   */
  async createSession(ideaId: string, userId?: string): Promise<AppState> {
    logger.info('🆕 LangGraphService: Creating workflow session', { ideaId, userId });
    
    try {
      const response = await window.langgraph.createSession(ideaId, userId);
      
      if (response.success && response.data) {
        logger.info('✅ LangGraphService: Session created successfully', {
          ideaId: response.data.idea_id
        });
        
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to create session');
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ LangGraphService: Session creation failed', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Validate workflow state
   */
  async validateState(state: AppState): Promise<ValidationResult> {
    logger.debug('🔍 LangGraphService: Validating state', { ideaId: state.idea_id });
    
    try {
      const response = await window.langgraph.validateState(state);
      
      if (response.success && response.data) {
        return response.data;
      } else {
        throw new Error(response.error || 'Validation failed');
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ LangGraphService: State validation failed', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Get workflow metrics for a session
   */
  async getMetrics(ideaId: string): Promise<WorkflowMetrics | null> {
    logger.debug('📊 LangGraphService: Getting workflow metrics', { ideaId });
    
    try {
      const response = await window.langgraph.getMetrics(ideaId);
      
      if (response.success) {
        return response.data || null;
      } else {
        throw new Error(response.error || 'Failed to get metrics');
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ LangGraphService: Failed to get metrics', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Clear session data
   */
  async clearSession(ideaId: string): Promise<void> {
    logger.info('🗑️ LangGraphService: Clearing session', { ideaId });
    
    try {
      const response = await window.langgraph.clearSession(ideaId);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to clear session');
      }
      
      logger.info('✅ LangGraphService: Session cleared successfully', { ideaId });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ LangGraphService: Failed to clear session', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Helper method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const langgraphService = new LangGraphService();

// Export types for convenience
export type { WorkflowMetrics, ValidationResult }; 