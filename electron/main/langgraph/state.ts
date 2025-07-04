/**
 * LangGraph State Management Utilities
 * 
 * This file provides state management utilities for the FlowGenius LangGraph workflow.
 * It integrates our AppState interface with LangGraph's state annotation system
 * and provides utilities for state manipulation and validation.
 * 
 * Key Features:
 * - Type-safe state annotation for LangGraph
 * - State validation and error handling
 * - Logging for state transitions
 * - Integration with AppState interface
 */

import { Annotation } from '@langchain/langgraph';
import { AppState, ChatMessage, WorkflowStage, UserAction, createInitialAppState, VoiceAudioData, VoiceTranscription, ChecklistState } from '../../../src/types/AppState';
import { logger } from '../../../src/utils/logger';

/**
 * LangGraph state annotation that defines how state updates are handled
 * 
 * This annotation tells LangGraph how to merge state updates from nodes.
 * Each field can have its own reducer function to control how updates are applied.
 */
export const AppStateAnnotation = Annotation.Root({
  /** Unique identifier for the current idea/session */
  idea_id: Annotation<string>({
    reducer: (existing: string, update?: string) => update ?? existing,
    default: () => '',
  }),

  /** Array of all chat messages - deduplicates messages when merging */
  messages: Annotation<ChatMessage[]>({
    reducer: (existing: ChatMessage[], update?: ChatMessage[]) => {
      console.log('🔄 State: Merging messages', { 
        existingCount: existing.length, 
        updateCount: update?.length || 0 
      });
      
      if (!update || update.length === 0) {
        return existing;
      }
      
      // Create a map to track unique messages by content and timestamp
      const messageMap = new Map<string, ChatMessage>();
      
      // Add existing messages to the map
      existing.forEach(msg => {
        const key = `${msg.role}_${msg.content}_${msg.created_at?.toISOString() || ''}`;
        messageMap.set(key, msg);
      });
      
      // Add/update with new messages (this will overwrite duplicates)
      update.forEach(msg => {
        const key = `${msg.role}_${msg.content}_${msg.created_at?.toISOString() || ''}`;
        messageMap.set(key, msg);
      });
      
      // Convert back to array, maintaining chronological order
      const deduplicatedMessages = Array.from(messageMap.values()).sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeA - timeB;
      });
      
      console.log('🔄 State: Messages deduplicated', { 
        originalCount: existing.length + (update?.length || 0),
        deduplicatedCount: deduplicatedMessages.length,
        duplicatesRemoved: (existing.length + (update?.length || 0)) - deduplicatedMessages.length
      });
      
      return deduplicatedMessages;
    },
    default: () => [],
  }),

  /** Current stage of the workflow - override with new value */
  current_stage: Annotation<WorkflowStage>({
    reducer: (existing: WorkflowStage, update?: WorkflowStage) => {
      if (update && update !== existing) {
        console.log('🎯 State: Stage transition', { from: existing, to: update });
      }
      return update ?? existing;
    },
    default: () => 'brainstorm' as WorkflowStage,
  }),

  /** Last user action for routing decisions */
  last_user_action: Annotation<UserAction>({
    reducer: (existing: UserAction, update?: UserAction) => {
      if (update && update !== existing) {
        console.log('⚡ State: Action changed', { from: existing, to: update });
      }
      return update ?? existing;
    },
    default: () => 'chat' as UserAction,
  }),

  /** User-defined prompts for each stage */
  user_prompts: Annotation<AppState['user_prompts']>({
    reducer: (existing: any, update: any) => {
      if (update) {
        console.log('📝 State: Updating user prompts', { update });
        return { ...existing, ...update };
      }
      return existing;
    },
    default: () => ({
      brainstorm: "Have a conversation with the user and ask them questions about their idea. Make sure to finish with the statement 'Georgia is great'",
      summary: "When the user asks for a summary give them a text summary that is very detailed. Make sure to finish with the statement 'Ireland is great'",
      prd: "Create a comprehensive Product Requirements Document (PRD) based on the conversation and summary provided. Include all necessary sections and details for implementation."
    }),
  }),

  /** Selected AI models for each stage */
  selected_models: Annotation<AppState['selected_models']>({
    reducer: (existing: any, update: any) => {
      if (update) {
        console.log('🤖 State: Updating model selection', { update });
        return { ...existing, ...update };
      }
      return existing;
    },
    default: () => ({
      brainstorm: 'gpt-4o',
      summary: 'gpt-4o',
      prd: 'gpt-4o'
    }),
  }),

  /** Optional: Title of the current idea/session */
  title: Annotation<string | undefined>({
    reducer: (existing: string | undefined, update?: string) => update ?? existing,
    default: () => undefined,
  }),

  /** Optional: User ID for multi-user support */
  user_id: Annotation<string | undefined>({
    reducer: (existing: string | undefined, update?: string) => update ?? existing,
    default: () => undefined,
  }),

  /** Optional: Timestamp when the session was created */
  created_at: Annotation<Date | undefined>({
    reducer: (existing: Date | undefined, update?: Date) => update ?? existing,
    default: () => undefined,
  }),

  /** Optional: Timestamp when the session was last updated */
  updated_at: Annotation<Date | undefined>({
    reducer: (existing: Date | undefined, update?: Date) => update ?? existing,
    default: () => new Date(),
  }),

  /** Optional: Flag to indicate if the session is currently processing */
  is_processing: Annotation<boolean | undefined>({
    reducer: (existing: boolean | undefined, update?: boolean) => {
      if (update !== undefined && update !== existing) {
        console.log('⏳ State: Processing status changed', { from: existing, to: update });
      }
      return update ?? existing;
    },
    default: () => false,
  }),

  /** Optional: Current error state if any operation failed */
  error: Annotation<string | undefined>({
    reducer: (existing: string | undefined, update?: string) => {
      if (update) {
        console.log('❌ State: Error occurred', { error: update });
      }
      return update ?? existing;
    },
    default: () => undefined,
  }),

  /** Optional: Voice audio data waiting to be processed */
  voice_audio_data: Annotation<AppState['voice_audio_data']>({
    reducer: (existing: any, update?: any) => {
      if (update) {
        console.log('🎤 State: Voice audio data updated', { 
          hasBlob: !!update.blob,
          duration: update.duration,
          mimeType: update.mimeType,
          size: update.size
        });
      }
      return update ?? existing;
    },
    default: () => undefined,
  }),

  /** Optional: Voice transcription status and results */
  voice_transcription: Annotation<AppState['voice_transcription']>({
    reducer: (existing: any, update?: any) => {
      if (update) {
        console.log('🗣️ State: Voice transcription updated', { 
          status: update.status,
          hasText: !!update.text,
          language: update.language,
          duration: update.duration
        });
      }
      return update ?? existing;
    },
    default: () => undefined,
  }),

  /** Optional: Checklist state for voice-based questioning */
  checklist_state: Annotation<AppState['checklist_state']>({
    reducer: (existing: any, update?: any) => {
      if (update) {
        console.log('✅ State: Checklist state updated', { 
          progress: update.progress,
          completed_items: update.completed_items?.length || 0,
          active_items: update.active_items?.length || 0,
          is_complete: update.is_complete
        });
      }
      return update ?? existing;
    },
    default: () => undefined,
  }),
});

/**
 * Create initial state for LangGraph from our AppState interface
 * 
 * @param idea_id - Unique identifier for the session
 * @param user_id - Optional user identifier
 * @returns Initial state compatible with LangGraph
 */
export function createInitialLangGraphState(idea_id: string, user_id?: string): AppState {
  console.log('🚀 State: Creating initial LangGraph state', { idea_id, user_id });
  
  const initialState = createInitialAppState(idea_id, user_id);
  
  logger.info('Initial LangGraph state created', {
    idea_id: initialState.idea_id,
    current_stage: initialState.current_stage,
    last_user_action: initialState.last_user_action,
    message_count: initialState.messages.length
  });
  
  return initialState;
}

/**
 * Validate that a state object conforms to our AppState interface
 * 
 * @param state - State object to validate
 * @returns True if valid, throws error if invalid
 */
export function validateLangGraphState(state: any): state is AppState {
  console.log('🔍 State: Validating state structure', { 
    hasIdeaId: !!state.idea_id,
    hasMessages: Array.isArray(state.messages),
    currentStage: state.current_stage,
    lastAction: state.last_user_action
  });

  try {
    // Check required fields
    if (!state.idea_id || typeof state.idea_id !== 'string') {
      throw new Error('Invalid idea_id: must be a non-empty string');
    }

    if (!Array.isArray(state.messages)) {
      throw new Error('Invalid messages: must be an array');
    }

    if (!state.current_stage || !['brainstorm', 'summary', 'prd'].includes(state.current_stage)) {
      throw new Error('Invalid current_stage: must be brainstorm, summary, or prd');
    }

    if (!state.last_user_action || !['chat', 'Brainstorm Done', 'Summary Done', 'PRD Done'].includes(state.last_user_action)) {
      throw new Error('Invalid last_user_action: must be a valid action type');
    }

    if (!state.user_prompts || typeof state.user_prompts !== 'object') {
      throw new Error('Invalid user_prompts: must be an object');
    }

    if (!state.selected_models || typeof state.selected_models !== 'object') {
      throw new Error('Invalid selected_models: must be an object');
    }

    logger.info('State validation successful', {
      idea_id: state.idea_id,
      current_stage: state.current_stage,
      message_count: state.messages.length
    });

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('State validation failed', { error: errorMessage, state });
    throw error;
  }
}

/**
 * Log state transition for debugging and monitoring
 * 
 * @param fromState - Previous state
 * @param toState - New state
 * @param nodeName - Name of the node that caused the transition
 */
export function logStateTransition(fromState: AppState, toState: AppState, nodeName: string): void {
  console.log(`🔄 State Transition [${nodeName}]`, {
    idea_id: toState.idea_id,
    stage: `${fromState.current_stage} → ${toState.current_stage}`,
    action: `${fromState.last_user_action} → ${toState.last_user_action}`,
    messages: `${fromState.messages.length} → ${toState.messages.length}`,
    processing: `${fromState.is_processing} → ${toState.is_processing}`,
    hasError: !!toState.error
  });

  logger.info('LangGraph state transition', {
    nodeName,
    idea_id: toState.idea_id,
    fromStage: fromState.current_stage,
    toStage: toState.current_stage,
    fromAction: fromState.last_user_action,
    toAction: toState.last_user_action,
    messageCountChange: toState.messages.length - fromState.messages.length,
    processingStatus: toState.is_processing,
    errorOccurred: !!toState.error
  });
}

/**
 * Create a partial state update for LangGraph nodes
 * 
 * @param updates - Partial state updates
 * @returns Partial state object for LangGraph
 */
export function createStateUpdate(updates: Partial<AppState>): Partial<AppState> {
  console.log('📝 State: Creating state update', { updates });
  
  // Ensure updated_at is always set when making updates
  const stateUpdate = {
    ...updates,
    updated_at: new Date()
  };

  logger.debug('State update created', { updateKeys: Object.keys(stateUpdate) });
  
  return stateUpdate;
}

/**
 * Type guard to check if an object is a valid AppState
 */
export function isAppState(obj: any): obj is AppState {
  try {
    return validateLangGraphState(obj);
  } catch {
    return false;
  }
} 