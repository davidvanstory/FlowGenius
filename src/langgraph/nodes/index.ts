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
  | 'generatePRD';

/**
 * Node execution result interface
 */
export interface NodeExecutionResult {
  success: boolean;
  error?: string;
  executionTime?: number;
} 