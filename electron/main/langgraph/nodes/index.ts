/**
 * LangGraph Nodes Index
 * 
 * This file exports all LangGraph nodes for the FlowGenius workflow engine.
 * Nodes represent individual processing steps in the conversational workflow.
 * 
 * Each node follows the pattern:
 * - Accepts AppState as input
 * - Returns updated AppState as output
 * - Includes comprehensive logging and error handling
 */

// Export all implemented nodes
export { processUserTurn } from './processUserTurn';
export { processVoiceInput } from './processVoiceInput';
export { generateSummary } from './generateSummary';
export { evaluateMarketLandscape } from './evaluateMarketLandscape';

// Export wrapped versions with error handling
import { processUserTurn as processUserTurnBase } from './processUserTurn';
import { processVoiceInput as processVoiceInputBase } from './processVoiceInput';
import { generateSummary as generateSummaryBase } from './generateSummary';
import { workflowErrorHandler } from '../workflowErrorHandler';
import { AppState } from '../../../../src/types/AppState';

/**
 * Process user turn with error handling and recovery
 */
export async function processUserTurnWithErrorHandling(state: AppState): Promise<Partial<AppState>> {
  try {
    return await processUserTurnBase(state);
  } catch (error) {
    return await workflowErrorHandler.handleNodeError(
      error instanceof Error ? error : new Error(String(error)),
      'processUserTurn',
      state,
      processUserTurnBase
    );
  }
}

/**
 * Process voice input with error handling and recovery
 */
export async function processVoiceInputWithErrorHandling(state: AppState): Promise<Partial<AppState>> {
  try {
    return await processVoiceInputBase(state);
  } catch (error) {
    return await workflowErrorHandler.handleNodeError(
      error instanceof Error ? error : new Error(String(error)),
      'processVoiceInput',
      state,
      processVoiceInputBase
    );
  }
}

/**
 * Generate summary with error handling and recovery
 */
export async function generateSummaryWithErrorHandling(state: AppState): Promise<Partial<AppState>> {
  try {
    return await generateSummaryBase(state);
  } catch (error) {
    return await workflowErrorHandler.handleNodeError(
      error instanceof Error ? error : new Error(String(error)),
      'generateSummary',
      state,
      generateSummaryBase
    );
  }
}

// Placeholder - additional nodes will be exported as they are created
export const LANGGRAPH_NODES_READY = false;

// Future exports will include:
// export { generatePRD } from './generatePRD';
// Additional nodes as needed

/**
 * Node types for type safety and documentation
 */
export type LangGraphNodeName = 
  | 'processUserTurn'
  | 'processVoiceInput' 
  | 'generateSummary'
  | 'evaluateMarketLandscape'
  | 'generatePRD';

/**
 * Node execution result interface
 */
export interface NodeExecutionResult {
  success: boolean;
  error?: string;
  executionTime?: number;
} 