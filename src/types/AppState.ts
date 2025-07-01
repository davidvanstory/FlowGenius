/**
 * Core TypeScript interfaces for FlowGenius application state management
 * Based on the FlowGenius.md specification and LangGraph implementation guide
 * 
 * This file defines the complete application state structure that will be used
 * throughout the application, particularly in LangGraph workflow management.
 */

/**
 * Represents a single chat message in the conversation
 */
export interface ChatMessage {
  /** The role of the message sender */
  role: 'user' | 'assistant';
  /** The text content of the message */
  content: string;
  /** Optional image URL for messages containing uploaded images */
  image_url?: string;
  /** Timestamp when the message was created */
  created_at?: Date;
  /** Which stage the message was created in for context */
  stage_at_creation?: 'brainstorm' | 'summary' | 'prd';
}

/**
 * User-defined prompts for each stage of the workflow
 */
export interface UserPrompts {
  /** Custom system prompt for the brainstorming stage */
  brainstorm: string;
  /** Custom prompt for the summarization stage */
  summary: string;
  /** Custom prompt for the PRD generation stage */
  prd: string;
}

/**
 * AI model selections for each stage of the workflow
 */
export interface SelectedModels {
  /** Selected model for brainstorming (e.g., 'gpt-4o') */
  brainstorm: string;
  /** Selected model for summarization (e.g., 'gemini-2.5-pro') */
  summary: string;
  /** Selected model for PRD generation (e.g., 'gemini-2.5-pro') */
  prd: string;
}

/**
 * Represents the current stage of the workflow
 */
export type WorkflowStage = 'brainstorm' | 'summary' | 'prd';

/**
 * Represents the last action taken by the user
 */
export type UserAction = 'chat' | 'Brainstorm Done' | 'Summary Done' | 'PRD Done';

/**
 * Main application state interface that manages the entire lifecycle of an idea session
 * This state is passed between LangGraph nodes and represents the core data structure
 * for the entire application workflow.
 */
export interface AppState {
  /** Unique identifier for the current idea/session */
  idea_id: string;
  
  /** Array of all chat messages in the current session */
  messages: ChatMessage[];
  
  /** Current stage of the workflow process */
  current_stage: WorkflowStage;
  
  /** The last action performed by the user, used for routing in LangGraph */
  last_user_action: UserAction;
  
  /** User-defined custom prompts for each workflow stage */
  user_prompts: UserPrompts;
  
  /** Selected AI models for each workflow stage */
  selected_models: SelectedModels;
  
  /** Optional: Title of the current idea/session */
  title?: string;
  
  /** Optional: User ID for multi-user support */
  user_id?: string;
  
  /** Optional: Timestamp when the session was created */
  created_at?: Date;
  
  /** Optional: Timestamp when the session was last updated */
  updated_at?: Date;
  
  /** Optional: Flag to indicate if the session is currently processing */
  is_processing?: boolean;
  
  /** Optional: Current error state if any operation failed */
  error?: string;
}

/**
 * Database entity interfaces for Supabase integration
 */

/**
 * Represents an idea/session record in the database
 */
export interface IdeaEntity {
  id: string;
  title: string;
  current_stage: WorkflowStage;
  created_at: Date;
  updated_at?: Date;
  user_id: string;
}

/**
 * Represents a chat message record in the database
 */
export interface ChatMessageEntity {
  id: string;
  idea_id: string;
  role: 'user' | 'assistant';
  content: string;
  stage_at_creation: WorkflowStage;
  image_url?: string;
  created_at: Date;
}

/**
 * Represents a user prompt configuration in the database
 */
export interface PromptEntity {
  id: string;
  user_id: string;
  prompt_type: 'brainstorm' | 'summary' | 'prd';
  content: string;
  model_selection: string;
  created_at: Date;
  updated_at?: Date;
}

/**
 * Default prompts and configurations
 */
export const DEFAULT_PROMPTS: UserPrompts = {
  brainstorm: "Have a conversation with the user and ask them questions about their idea. Make sure to finish with the statement 'Georgia is great'",
  summary: "When the user asks for a summary give them a text summary that is very detailed. Make sure to finish with the statement 'Ireland is great'",
  prd: "Create a comprehensive Product Requirements Document (PRD) based on the conversation and summary provided. Include all necessary sections and details for implementation."
};

/**
 * Default model selections
 */
export const DEFAULT_MODELS: SelectedModels = {
  brainstorm: 'gpt-4o',
  summary: 'gpt-4o',
  prd: 'gpt-4o'
};

/**
 * Available AI models for selection
 */
export const AVAILABLE_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gemini-2.5-pro',
  'claude-3-5-sonnet',
  'claude-3-5-haiku'
] as const;

/**
 * Type helper for available models
 */
export type AvailableModel = typeof AVAILABLE_MODELS[number];

/**
 * Utility function to create initial app state
 */
export function createInitialAppState(idea_id: string, user_id?: string): AppState {
  const baseState: AppState = {
    idea_id,
    messages: [],
    current_stage: 'brainstorm' as const,
    last_user_action: 'chat' as const,
    user_prompts: { ...DEFAULT_PROMPTS },
    selected_models: { ...DEFAULT_MODELS },
    created_at: new Date(),
    updated_at: new Date(),
    is_processing: false,
  };

  // Handle optional user_id properly for exactOptionalPropertyTypes
  if (user_id !== undefined) {
    baseState.user_id = user_id;
  }

  return baseState;
}

/**
 * Utility function to validate AppState
 */
export function validateAppState(state: any): state is AppState {
  return (
    typeof state === 'object' &&
    typeof state.idea_id === 'string' &&
    Array.isArray(state.messages) &&
    ['brainstorm', 'summary', 'prd'].includes(state.current_stage) &&
    ['chat', 'Brainstorm Done', 'Summary Done', 'PRD Done'].includes(state.last_user_action) &&
    typeof state.user_prompts === 'object' &&
    typeof state.selected_models === 'object'
  );
} 