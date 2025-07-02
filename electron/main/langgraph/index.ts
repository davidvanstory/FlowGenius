/**
 * Main LangGraph Workflow Setup and Initialization
 * 
 * This file creates and exports the complete LangGraph workflow for FlowGenius.
 * It sets up the StateGraph with all nodes, edges, and routing logic to handle
 * the complete conversational workflow from brainstorming to PRD generation.
 * 
 * Key Features:
 * - Complete workflow graph with all nodes and edges
 * - Conditional routing based on user actions
 * - Error handling and recovery mechanisms
 * - Performance monitoring and logging
 * - Easy integration with React components
 */

import { StateGraph, START, END } from '@langchain/langgraph';
import { AppStateAnnotation, createInitialLangGraphState } from './state';
import { processUserTurn } from './nodes/processUserTurn';
import { processVoiceInput } from './nodes/processVoiceInput';
import { generateSummary } from './nodes/generateSummary';
import { routeUserAction, RouteNames } from './router';
import { AppState } from '../../../src/types/AppState';
import { logger } from '../../../src/utils/logger';
import { WorkflowLogger, createWorkflowLogger } from './workflowLogger';

/**
 * Create and configure the complete LangGraph workflow
 * 
 * This function builds the StateGraph with all nodes, edges, and routing logic.
 * It represents the complete conversational workflow for FlowGenius.
 * 
 * @returns Compiled LangGraph workflow ready for execution
 */
export function createFlowGeniusWorkflow() {
  console.log('🏗️ Creating FlowGenius LangGraph workflow');
  
  // Create the state graph with our AppState annotation
  const graph = new StateGraph(AppStateAnnotation)
    // Add all workflow nodes
    .addNode(RouteNames.PROCESS_USER_TURN, processUserTurn)
    .addNode(RouteNames.PROCESS_VOICE_INPUT, processVoiceInput)
    .addNode(RouteNames.GENERATE_SUMMARY, generateSummary)
    
    // Set up entry point routing
    .addEdge(START, RouteNames.PROCESS_USER_TURN)
    
    // Add conditional routing from processUserTurn
    .addConditionalEdges(
      RouteNames.PROCESS_USER_TURN,
      routeUserAction,
      {
        [RouteNames.PROCESS_USER_TURN]: RouteNames.PROCESS_USER_TURN,
        [RouteNames.PROCESS_VOICE_INPUT]: RouteNames.PROCESS_VOICE_INPUT,
        [RouteNames.GENERATE_SUMMARY]: RouteNames.GENERATE_SUMMARY,
        [RouteNames.END]: END
      }
    )
    
    // Add conditional routing from processVoiceInput
    .addConditionalEdges(
      RouteNames.PROCESS_VOICE_INPUT,
      routeUserAction,
      {
        [RouteNames.PROCESS_USER_TURN]: RouteNames.PROCESS_USER_TURN,
        [RouteNames.PROCESS_VOICE_INPUT]: RouteNames.PROCESS_VOICE_INPUT,
        [RouteNames.GENERATE_SUMMARY]: RouteNames.GENERATE_SUMMARY,
        [RouteNames.END]: END
      }
    )
    
    // Add conditional routing from generateSummary
    .addConditionalEdges(
      RouteNames.GENERATE_SUMMARY,
      routeUserAction,
      {
        [RouteNames.PROCESS_USER_TURN]: RouteNames.PROCESS_USER_TURN,
        [RouteNames.END]: END
      }
    );

  // Compile the workflow
  const workflow = graph.compile();
  
  console.log('✅ FlowGenius LangGraph workflow created successfully');
  logger.info('LangGraph workflow compiled', {
    nodeCount: 3,
    hasConditionalRouting: true,
    entryPoint: RouteNames.PROCESS_USER_TURN
  });
  
  return workflow;
}

/**
 * Execute the workflow with comprehensive logging and error handling
 * 
 * @param initialState - Initial application state
 * @param workflowLogger - Optional workflow logger for debugging
 * @returns Promise resolving to final application state
 */
export async function executeWorkflow(
  initialState: AppState, 
  workflowLogger?: WorkflowLogger
): Promise<AppState> {
  const startTime = Date.now();
  const sessionLogger = workflowLogger || createWorkflowLogger(initialState.idea_id);
  
  console.log('🚀 Executing FlowGenius workflow', {
    ideaId: initialState.idea_id,
    currentStage: initialState.current_stage,
    lastAction: initialState.last_user_action,
    messageCount: initialState.messages.length
  });

  try {
    // Log workflow start
    sessionLogger.logWorkflowStart(initialState);
    
    // Create and execute workflow
    const workflow = createFlowGeniusWorkflow();
    const result = await workflow.invoke(initialState);
    
    // Log workflow completion
    sessionLogger.logWorkflowEnd(result);
    
    const executionTime = Date.now() - startTime;
    console.log('✅ Workflow execution completed', {
      ideaId: result.idea_id,
      finalStage: result.current_stage,
      finalAction: result.last_user_action,
      executionTime,
      messageCount: result.messages.length,
      hasError: !!result.error
    });

    logger.info('Workflow execution completed', {
      idea_id: result.idea_id,
      execution_time: executionTime,
      initial_stage: initialState.current_stage,
      final_stage: result.current_stage,
      message_count_change: result.messages.length - initialState.messages.length,
      success: !result.error
    });

    return result;

  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    console.log('❌ Workflow execution failed', {
      ideaId: initialState.idea_id,
      error: errorMessage,
      executionTime
    });

    sessionLogger.logWorkflowError(error instanceof Error ? error : new Error(errorMessage));
    
    logger.error('Workflow execution failed', {
      idea_id: initialState.idea_id,
      error: errorMessage,
      execution_time: executionTime,
      stack: error instanceof Error ? error.stack : undefined
    });

    // Return state with error
    return {
      ...initialState,
      error: `Workflow execution failed: ${errorMessage}`,
      is_processing: false,
      updated_at: new Date()
    };
  }
}

/**
 * Create a new workflow session with initial state
 * 
 * @param ideaId - Unique identifier for the session
 * @param userId - Optional user identifier
 * @returns Initial application state ready for workflow execution
 */
export function createWorkflowSession(ideaId: string, userId?: string): AppState {
  console.log('🆕 Creating new workflow session', { ideaId, userId });
  
  const initialState = createInitialLangGraphState(ideaId, userId);
  
  logger.info('New workflow session created', {
    idea_id: ideaId,
    user_id: userId,
    initial_stage: initialState.current_stage,
    initial_action: initialState.last_user_action
  });
  
  return initialState;
}

/**
 * Validate workflow state before execution
 * 
 * @param state - Application state to validate
 * @returns Validation result with any issues found
 */
export function validateWorkflowState(state: AppState): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  // Check required fields
  if (!state.idea_id) {
    issues.push('Missing idea_id');
  }
  
  if (!state.current_stage || !['brainstorm', 'summary', 'prd'].includes(state.current_stage)) {
    issues.push('Invalid current_stage');
  }
  
  if (!state.last_user_action || !['chat', 'Brainstorm Done', 'Summary Done', 'PRD Done'].includes(state.last_user_action)) {
    issues.push('Invalid last_user_action');
  }
  
  if (!Array.isArray(state.messages)) {
    issues.push('Messages must be an array');
  }
  
  // Log validation result
  const isValid = issues.length === 0;
  console.log('🔍 Workflow state validation', {
    ideaId: state.idea_id,
    isValid,
    issueCount: issues.length,
    issues
  });
  
  if (!isValid) {
    logger.warn('Workflow state validation failed', {
      idea_id: state.idea_id,
      issues
    });
  }
  
  return { isValid, issues };
}

// Export main workflow components
export {
  createInitialLangGraphState,
  AppStateAnnotation,
  RouteNames,
  routeUserAction
};

// Export types for React integration
export type { WorkflowLogger } from './workflowLogger'; 