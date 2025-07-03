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
 * Represents a single checklist item for voice-based questioning
 */
export interface ChecklistItem {
  /** Unique identifier for the checklist item */
  id: string;
  /** The question or area to explore */
  question: string;
  /** Whether this item has been addressed/completed */
  completed: boolean;
  /** The user's response that addresses this item */
  response?: string;
  /** Keywords or topics that indicate this item has been addressed */
  keywords: string[];
  /** Priority level for this item (1-5, with 5 being highest) */
  priority: number;
  /** Timestamp when this item was completed */
  completed_at?: Date;
}

/**
 * Checklist configuration for different stages
 */
export interface ChecklistConfig {
  /** Title of the checklist */
  title: string;
  /** Description of the checklist purpose */
  description: string;
  /** Array of checklist items */
  items: ChecklistItem[];
  /** Minimum number of items that must be completed */
  min_required: number;
  /** Maximum number of follow-up questions per item */
  max_followups: number;
}

/**
 * Current checklist state and progress - supports dynamic GPT-4 generated criteria
 */
export interface ChecklistState {
  /** Current checklist configuration */
  config: ChecklistConfig;
  /** Items that have been addressed */
  completed_items: string[];
  /** Items currently being explored */
  active_items: string[];
  /** Number of follow-up questions asked for current item */
  followup_count: number;
  /** Whether the checklist is complete */
  is_complete: boolean;
  /** Progress percentage (0-100) */
  progress: number;
  /** Last item that was addressed */
  last_addressed_item?: string;
}

/**
 * Dynamic checklist state for GPT-4 generated criteria
 */
export interface DynamicChecklistState {
  /** GPT-4 generated criteria tailored to the specific idea */
  generatedCriteria: ChecklistItem[];
  /** Criteria that have been addressed by the user */
  addressedCriteria: string[];
  /** Criteria still pending exploration */
  pendingCriteria: string[];
  /** New criteria suggested by GPT-4 as conversation evolves */
  suggestedNewCriteria?: ChecklistItem[];
  /** Recent conversation context for GPT-4 analysis (last 10-20 exchanges) */
  recentConversation: string[];
  /** Progress percentage (0-100) */
  progress: number;
  /** Whether minimum required criteria have been addressed */
  is_complete: boolean;
  /** Minimum number of criteria that must be addressed */
  min_required: number;
  /** Maximum number of criteria to generate initially */
  max_criteria: number;
  /** When the criteria were initially generated */
  generated_at?: Date;
  /** Last time criteria were analyzed by GPT-4 */
  last_analyzed_at?: Date;
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
 * Voice transcription status and result data
 */
export interface VoiceTranscription {
  /** Current status of voice processing */
  status: 'processing' | 'completed' | 'failed';
  /** Transcribed text content */
  text?: string;
  /** Confidence score from Whisper API (0-1) */
  confidence?: number;
  /** Detected language code */
  language?: string;
  /** Audio duration in seconds */
  duration?: number;
  /** Error message if transcription failed */
  error?: string;
  /** Processing start timestamp */
  started_at?: Date;
  /** Processing completion timestamp */
  completed_at?: Date;
}

/**
 * Voice audio data for processing
 */
export interface VoiceAudioData {
  /** Path to the temporary audio file */
  filePath: string;
  /** Audio duration in seconds */
  duration: number;
  /** MIME type of the audio */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** Timestamp when audio was recorded */
  recorded_at: Date;
}

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
  
  /** Optional: Voice audio data waiting to be processed */
  voice_audio_data?: VoiceAudioData;
  
  /** Optional: Voice transcription status and results */
  voice_transcription?: VoiceTranscription;
  
  /** Optional: Checklist state for voice-based questioning */
  checklist_state?: ChecklistState;
  
  /** Optional: Dynamic GPT-4 generated checklist state */
  dynamic_checklist_state?: DynamicChecklistState;
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
  const isValidBase = (
    typeof state === 'object' &&
    typeof state.idea_id === 'string' &&
    Array.isArray(state.messages) &&
    ['brainstorm', 'summary', 'prd'].includes(state.current_stage) &&
    ['chat', 'Brainstorm Done', 'Summary Done', 'PRD Done'].includes(state.last_user_action) &&
    typeof state.user_prompts === 'object' &&
    typeof state.selected_models === 'object'
  );

  // Optional voice field validation
  const isValidVoiceAudio = !state.voice_audio_data || (
    state.voice_audio_data instanceof Object &&
    typeof state.voice_audio_data.filePath === 'string' &&
    typeof state.voice_audio_data.duration === 'number' &&
    typeof state.voice_audio_data.mimeType === 'string' &&
    typeof state.voice_audio_data.size === 'number' &&
    state.voice_audio_data.recorded_at instanceof Date
  );

  const isValidVoiceTranscription = !state.voice_transcription || (
    state.voice_transcription instanceof Object &&
    ['processing', 'completed', 'failed'].includes(state.voice_transcription.status)
  );

  return isValidBase && isValidVoiceAudio && isValidVoiceTranscription;
}

/**
 * Default checklist configuration for brainstorming stage
 * Updated to match PRD requirements for comprehensive idea validation
 */
export const DEFAULT_BRAINSTORM_CHECKLIST: ChecklistConfig = {
  title: "Comprehensive Idea Validation",
  description: "Systematic exploration of your product idea covering all critical aspects for successful development",
  min_required: 8,
  max_followups: 2,
  items: [
    {
      id: "problem_definition",
      question: "What specific problem does your idea solve and what is its scope?",
      completed: false,
      keywords: ["problem", "issue", "challenge", "solve", "fix", "scope", "pain", "frustration"],
      priority: 5
    },
    {
      id: "target_users",
      question: "Who are your target users and what are their characteristics?",
      completed: false,
      keywords: ["users", "target", "audience", "customer", "demographic", "personas", "who"],
      priority: 5
    },
    {
      id: "user_pain_points",
      question: "What specific pain points do your target users experience?",
      completed: false,
      keywords: ["pain points", "frustrations", "difficulties", "struggles", "issues", "problems"],
      priority: 5
    },
    {
      id: "solution_approach",
      question: "How does your solution approach solve those pain points?",
      completed: false,
      keywords: ["solution", "approach", "method", "how", "solve", "address", "tackle"],
      priority: 5
    },
    {
      id: "key_features",
      question: "What are the key features and how would you describe each one?",
      completed: false,
      keywords: ["features", "functionality", "capabilities", "what", "tools", "functions"],
      priority: 4
    },
    {
      id: "user_interactions",
      question: "How will users interact with your product? What's the user flow?",
      completed: false,
      keywords: ["interaction", "user flow", "journey", "experience", "navigation", "workflow"],
      priority: 4
    },
    {
      id: "ui_aspects",
      question: "What are the key UI aspects and interface elements?",
      completed: false,
      keywords: ["UI", "interface", "design", "layout", "screens", "elements", "components"],
      priority: 4
    },
    {
      id: "design_visuals",
      question: "What style, design, and visual approach will you use?",
      completed: false,
      keywords: ["design", "style", "visual", "look", "feel", "branding", "aesthetic"],
      priority: 3
    },
    {
      id: "competition_analysis",
      question: "Who are your competitors and how is your idea different from existing approaches?",
      completed: false,
      keywords: ["competitors", "competition", "existing", "different", "unique", "alternative"],
      priority: 4
    },
    {
      id: "technical_implementation",
      question: "What tech stack and technical approach will you use for implementation?",
      completed: false,
      keywords: ["tech stack", "technology", "implementation", "development", "architecture", "backend", "frontend", "database", "security"],
      priority: 3
    }
  ]
}; 