/**
 * LangGraph IPC Handler for Electron Main Process
 * 
 * This module handles all IPC communication between the renderer process
 * and the LangGraph workflow engine running in the main process.
 * 
 * Key Features:
 * - IPC handlers for workflow execution
 * - State management and session handling
 * - Error handling and logging
 * - Performance monitoring
 */

import { ipcMain } from 'electron';
import { 
  executeWorkflow, 
  createWorkflowSession,
  validateWorkflowState,
  createFlowGeniusWorkflow
} from './langgraph';
import { AppState } from '../../src/types/AppState';
import { logger } from '../../src/utils/logger';
import { createWorkflowLogger, WorkflowLogger } from './langgraph/workflowLogger';

// Store workflow loggers for each session
const workflowLoggers = new Map<string, WorkflowLogger>();

/**
 * Initialize LangGraph IPC handlers
 * 
 * This function sets up all IPC handlers for LangGraph operations.
 * Should be called once during app initialization.
 */
export function initializeLangGraphHandlers(): void {
  console.log('🔌 Initializing LangGraph IPC handlers');

  /**
   * Execute workflow with given state
   */
  ipcMain.handle('langgraph:execute', async (event, state: AppState) => {
    const startTime = Date.now();
    
    try {
      console.log('📨 IPC: Executing LangGraph workflow', {
        ideaId: state.idea_id,
        stage: state.current_stage,
        action: state.last_user_action
      });

      // Validate state
      const validation = validateWorkflowState(state);
      if (!validation.isValid) {
        throw new Error(`Invalid state: ${validation.issues.join(', ')}`);
      }

      // Get or create workflow logger for this session
      let workflowLogger = workflowLoggers.get(state.idea_id);
      if (!workflowLogger) {
        workflowLogger = createWorkflowLogger(state.idea_id, true);
        workflowLoggers.set(state.idea_id, workflowLogger);
      }

      // Execute workflow
      const result = await executeWorkflow(state, workflowLogger);
      
      const duration = Date.now() - startTime;
      console.log('✅ IPC: Workflow execution completed', {
        ideaId: result.idea_id,
        duration,
        hasError: !!result.error
      });

      return { success: true, data: result, duration };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const duration = Date.now() - startTime;
      
      console.error('❌ IPC: Workflow execution failed', {
        error: errorMessage,
        duration
      });

      logger.error('LangGraph IPC execution failed', {
        error: errorMessage,
        idea_id: state.idea_id,
        duration
      });

      return { 
        success: false, 
        error: errorMessage,
        duration 
      };
    }
  });

  /**
   * Create new workflow session
   */
  ipcMain.handle('langgraph:createSession', async (event, ideaId: string, userId?: string) => {
    try {
      console.log('📨 IPC: Creating new workflow session', { ideaId, userId });

      const session = createWorkflowSession(ideaId, userId);
      
      // Create workflow logger for new session
      const workflowLogger = createWorkflowLogger(ideaId, true);
      workflowLoggers.set(ideaId, workflowLogger);

      return { success: true, data: session };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error('❌ IPC: Session creation failed', { error: errorMessage });
      
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  });

  /**
   * Validate workflow state
   */
  ipcMain.handle('langgraph:validateState', async (event, state: AppState) => {
    try {
      console.log('📨 IPC: Validating workflow state', { ideaId: state.idea_id });

      const validation = validateWorkflowState(state);
      
      return { 
        success: true, 
        data: validation 
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  });

  /**
   * Get workflow metrics for a session
   */
  ipcMain.handle('langgraph:getMetrics', async (event, ideaId: string) => {
    try {
      console.log('📨 IPC: Getting workflow metrics', { ideaId });

      const workflowLogger = workflowLoggers.get(ideaId);
      if (!workflowLogger) {
        return { 
          success: true, 
          data: null 
        };
      }

      const summary = workflowLogger.getExecutionSummary();
      
      return { 
        success: true, 
        data: summary 
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  });

  /**
   * Clear session data
   */
  ipcMain.handle('langgraph:clearSession', async (event, ideaId: string) => {
    try {
      console.log('📨 IPC: Clearing session data', { ideaId });

      // Remove workflow logger
      workflowLoggers.delete(ideaId);
      
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  });

  console.log('✅ LangGraph IPC handlers initialized');
  logger.info('LangGraph IPC handlers initialized', {
    handlerCount: 5
  });
}

/**
 * Cleanup LangGraph resources
 * 
 * Should be called when the app is closing.
 */
export function cleanupLangGraphHandlers(): void {
  console.log('🧹 Cleaning up LangGraph handlers');
  
  // Clear all workflow loggers
  workflowLoggers.clear();
  
  // Remove all handlers
  ipcMain.removeHandler('langgraph:execute');
  ipcMain.removeHandler('langgraph:createSession');
  ipcMain.removeHandler('langgraph:validateState');
  ipcMain.removeHandler('langgraph:getMetrics');
  ipcMain.removeHandler('langgraph:clearSession');
  
  logger.info('LangGraph handlers cleaned up');
} 