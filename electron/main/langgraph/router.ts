/**
 * LangGraph Router - Conditional Routing Logic
 * 
 * This module implements the routing logic that determines which node
 * should be executed next based on the current application state,
 * particularly the last_user_action field.
 * 
 * The router is a key component of the LangGraph workflow, enabling
 * dynamic flow control based on user interactions and workflow stages.
 */

import { AppState } from '../../../src/types/AppState';
import { logger } from '../../../src/utils/logger';

/**
 * Route names that correspond to LangGraph nodes
 */
export enum RouteNames {
  PROCESS_USER_TURN = 'processUserTurn',
  PROCESS_VOICE_INPUT = 'processVoiceInput',
  GENERATE_SUMMARY = 'generateSummary',
  GENERATE_PRD = 'generatePRD',
  END = '__end__'
}

/**
 * Main routing function that determines the next node based on state
 * 
 * This function implements the core routing logic for the LangGraph workflow.
 * It examines the current state and returns the name of the next node to execute.
 * 
 * @param state - Current application state
 * @returns The name of the next node to execute
 */
export function routeUserAction(state: AppState): string {
  logger.info('Routing decision requested', {
    idea_id: state.idea_id,
    current_stage: state.current_stage,
    last_user_action: state.last_user_action,
    is_processing: state.is_processing,
    has_error: !!state.error
  });

  // If there's an error, end the workflow
  if (state.error) {
    logger.warn('Routing to END due to error state', {
      idea_id: state.idea_id,
      error: state.error
    });
    return RouteNames.END;
  }

  // If processing, wait (shouldn't happen in normal flow)
  if (state.is_processing) {
    logger.warn('State is still processing, routing to END', {
      idea_id: state.idea_id
    });
    return RouteNames.END;
  }

  // Check if the last message is from assistant and no new user input
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage && lastMessage.role === 'assistant' && state.last_user_action === 'chat') {
    logger.info('Routing to END - waiting for user input', {
      idea_id: state.idea_id,
      last_message_role: lastMessage.role
    });
    return RouteNames.END;
  }

  // Route based on last user action
  switch (state.last_user_action) {
    case 'chat':
      // Regular chat messages go to processUserTurn
      logger.info('Routing to processUserTurn for chat message', {
        idea_id: state.idea_id,
        stage: state.current_stage
      });
      return RouteNames.PROCESS_USER_TURN;

    case 'Brainstorm Done':
      // When brainstorming is complete, generate summary
      if (state.current_stage === 'brainstorm') {
        logger.info('Routing to generateSummary after brainstorm completion', {
          idea_id: state.idea_id
        });
        return RouteNames.GENERATE_SUMMARY;
      } else {
        logger.warn('Brainstorm Done action in wrong stage', {
          idea_id: state.idea_id,
          current_stage: state.current_stage
        });
        return RouteNames.END;
      }

    case 'Summary Done':
      // When summary is complete, generate PRD (placeholder for now)
      if (state.current_stage === 'summary') {
        logger.info('Routing to generatePRD after summary completion', {
          idea_id: state.idea_id
        });
        // TODO: Implement generatePRD node
        logger.warn('generatePRD not yet implemented, ending workflow', {
          idea_id: state.idea_id
        });
        return RouteNames.END;
      } else {
        logger.warn('Summary Done action in wrong stage', {
          idea_id: state.idea_id,
          current_stage: state.current_stage
        });
        return RouteNames.END;
      }

    case 'PRD Done':
      // PRD completion ends the workflow
      logger.info('Workflow complete, routing to END', {
        idea_id: state.idea_id
      });
      return RouteNames.END;

    default:
      // Unknown action, log warning and end
      logger.error('Unknown user action, routing to END', {
        idea_id: state.idea_id,
        last_user_action: state.last_user_action
      });
      return RouteNames.END;
  }
}

/**
 * Specialized router for voice input detection
 * 
 * This router can be used in parallel or as a pre-check to determine
 * if voice input should be processed. Currently returns processUserTurn
 * as voice is processed as regular chat in the MVP.
 * 
 * @param state - Current application state
 * @returns The name of the next node to execute
 */
export function routeVoiceInput(state: AppState): string {
  // In the MVP, voice input is converted to text and processed as chat
  // This router is here for future enhancement when voice might have
  // special handling requirements
  
  logger.info('Voice routing check', {
    idea_id: state.idea_id,
    last_action: state.last_user_action
  });

  // For now, voice input goes through the same flow as chat
  return RouteNames.PROCESS_USER_TURN;
}

/**
 * Stage transition router
 * 
 * Determines if a stage transition should occur based on the current state.
 * This is useful for automatic stage progression.
 * 
 * @param state - Current application state
 * @returns Whether a stage transition should occur
 */
export function shouldTransitionStage(state: AppState): boolean {
  // Check if we should automatically transition stages
  switch (state.current_stage) {
    case 'brainstorm':
      // Transition to summary when user clicks "Brainstorm Done"
      return state.last_user_action === 'Brainstorm Done';
    
    case 'summary':
      // Transition to PRD when user clicks "Summary Done"
      return state.last_user_action === 'Summary Done';
    
    case 'prd':
      // No automatic transition from PRD
      return false;
    
    default:
      return false;
  }
}

/**
 * Helper function to determine if the workflow should continue
 * 
 * @param state - Current application state
 * @returns Whether the workflow should continue processing
 */
export function shouldContinueWorkflow(state: AppState): boolean {
  // Continue if no error, not processing, and not at PRD Done
  return !state.error && 
         !state.is_processing && 
         state.last_user_action !== 'PRD Done';
}

/**
 * Get human-readable description of the current routing decision
 * 
 * @param state - Current application state
 * @returns Description of the routing decision
 */
export function getRoutingDescription(state: AppState): string {
  const route = routeUserAction(state);
  
  switch (route) {
    case RouteNames.PROCESS_USER_TURN:
      return `Processing user message in ${state.current_stage} stage`;
    case RouteNames.GENERATE_SUMMARY:
      return 'Generating summary of brainstorming session';
    case RouteNames.GENERATE_PRD:
      return 'Generating Product Requirements Document';
    case RouteNames.END:
      return 'Workflow ended';
    default:
      return 'Unknown routing decision';
  }
} 