/**
 * React Hooks for LangGraph Integration
 * 
 * This file provides React context and hooks for integrating the LangGraph workflow
 * with React components. It enables seamless communication between the UI and the
 * LangGraph workflow engine.
 * 
 * Key Features:
 * - React context for workflow state management
 * - Hooks for sending messages and triggering workflow
 * - Real-time state updates and error handling
 * - Loading states and performance monitoring
 * - Type-safe integration with AppState
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import { AppState, ChatMessage, WorkflowStage, UserAction, VoiceAudioData } from '../types/AppState';
import { langgraphService, WorkflowMetrics } from '../services/langgraphService';
import { logger } from '../utils/logger';

/**
 * LangGraph context state interface
 */
interface LangGraphContextState {
  /** Current application state from LangGraph */
  appState: AppState;
  /** Whether a workflow is currently executing */
  isExecuting: boolean;
  /** Current error state, if any */
  error: string | null;
  /** Workflow execution history for debugging */
  executionHistory: Array<{
    timestamp: Date;
    action: string;
    duration: number;
    success: boolean;
  }>;
  /** Performance metrics */
  metrics: {
    totalExecutions: number;
    averageExecutionTime: number;
    lastExecutionTime: number;
  };
}

/**
 * LangGraph context actions
 */
type LangGraphAction =
  | { type: 'SET_STATE'; payload: AppState }
  | { type: 'SET_APP_STATE'; payload: AppState }
  | { type: 'SET_EXECUTING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'ADD_EXECUTION_HISTORY'; payload: { action: string; duration: number; success: boolean } }
  | { type: 'UPDATE_METRICS'; payload: { duration: number } }
  | { type: 'RESET_SESSION'; payload: AppState };

/**
 * LangGraph context interface
 */
interface LangGraphContextValue {
  /** Current context state */
  state: LangGraphContextState;
  
  /** Send a chat message through the workflow */
  sendMessage: (content: string, imageUrl?: string) => Promise<void>;
  
  /** Send voice input through the workflow */
  sendVoiceInput: (filePath: string, duration: number, mimeType: string, size: number) => Promise<void>;
  
  /** Trigger stage completion (e.g., "Brainstorm Done") */
  completeStage: (stage: WorkflowStage) => Promise<void>;
  
  /** Create a new workflow session */
  createNewSession: (userId?: string) => Promise<void>;
  
  /** Update user prompts for a stage */
  updateUserPrompts: (stage: WorkflowStage, prompt: string) => Promise<void>;
  
  /** Update selected model for a stage */
  updateSelectedModel: (stage: WorkflowStage, model: string) => Promise<void>;
  
  /** Clear current error state */
  clearError: () => void;
  
  /** Get current workflow metrics */
  getMetrics: () => LangGraphContextState['metrics'];
  
  /** Reset the entire workflow session */
  resetSession: () => Promise<void>;
}

/**
 * Create initial app state
 */
function createInitialAppState(): AppState {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  return {
    idea_id: sessionId,
    messages: [],
    current_stage: 'brainstorm',
    last_user_action: 'chat',
    user_prompts: {
      brainstorm: "Have a conversation with the user and ask them questions about their idea. Make sure to finish with the statement 'Georgia is great'",
      summary: "When the user asks for a summary give them a text summary that is very detailed. Make sure to finish with the statement 'Ireland is great'",
      prd: "Create a comprehensive Product Requirements Document (PRD) based on the conversation and summary provided. Include all necessary sections and details for implementation."
    },
    selected_models: {
      brainstorm: 'gpt-4o',
      summary: 'gpt-4o',
      prd: 'gpt-4o'
    },
    created_at: new Date(),
    updated_at: new Date(),
    is_processing: false
  };
}

/**
 * Initial context state
 */
const initialState: LangGraphContextState = {
  appState: createInitialAppState(),
  isExecuting: false,
  error: null,
  executionHistory: [],
  metrics: {
    totalExecutions: 0,
    averageExecutionTime: 0,
    lastExecutionTime: 0
  }
};

/**
 * Context reducer
 */
function langGraphReducer(state: LangGraphContextState, action: LangGraphAction): LangGraphContextState {
  switch (action.type) {
    case 'SET_STATE':
    case 'SET_APP_STATE':
      console.log('🔄 LangGraph Context: Setting new state', {
        ideaId: action.payload.idea_id,
        stage: action.payload.current_stage,
        messageCount: action.payload.messages.length,
        hasError: !!action.payload.error
      });
      return {
        ...state,
        appState: action.payload,
        error: action.payload.error || null
      };

    case 'SET_EXECUTING':
      console.log('⚡ LangGraph Context: Execution status changed', { isExecuting: action.payload });
      return {
        ...state,
        isExecuting: action.payload
      };

    case 'SET_ERROR':
      console.log('❌ LangGraph Context: Error state changed', { error: action.payload });
      return {
        ...state,
        error: action.payload,
        isExecuting: false
      };

    case 'ADD_EXECUTION_HISTORY':
      const newHistoryEntry = {
        timestamp: new Date(),
        ...action.payload
      };
      console.log('📊 LangGraph Context: Adding execution history', newHistoryEntry);
      return {
        ...state,
        executionHistory: [...state.executionHistory.slice(-19), newHistoryEntry] // Keep last 20 entries
      };

    case 'UPDATE_METRICS':
      const { duration } = action.payload;
      const newTotalExecutions = state.metrics.totalExecutions + 1;
      const newAverageExecutionTime = 
        (state.metrics.averageExecutionTime * state.metrics.totalExecutions + duration) / newTotalExecutions;
      
      console.log('📈 LangGraph Context: Updating metrics', {
        duration,
        totalExecutions: newTotalExecutions,
        averageExecutionTime: Math.round(newAverageExecutionTime)
      });
      
      return {
        ...state,
        metrics: {
          totalExecutions: newTotalExecutions,
          averageExecutionTime: newAverageExecutionTime,
          lastExecutionTime: duration
        }
      };

    case 'RESET_SESSION':
      console.log('🔄 LangGraph Context: Resetting session', { newSessionId: action.payload.idea_id });
      return {
        ...initialState,
        appState: action.payload
      };

    default:
      return state;
  }
}

/**
 * Create LangGraph context
 */
const LangGraphContext = createContext<LangGraphContextValue | null>(null);

/**
 * LangGraph Provider component
 */
export function LangGraphProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(langGraphReducer, initialState);
  const sessionInitializedRef = useRef(false);

  // Initialize session in main process
  useEffect(() => {
    if (!sessionInitializedRef.current) {
      sessionInitializedRef.current = true;
      
      const initSession = async () => {
        try {
          console.log('🚀 LangGraph Provider: Initializing session in main process', {
            ideaId: state.appState.idea_id
          });
          
          const session = await langgraphService.createSession(state.appState.idea_id);
          dispatch({ type: 'SET_STATE', payload: session });
          
          console.log('✅ LangGraph Provider: Session initialized', {
            ideaId: session.idea_id,
            stage: session.current_stage
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('❌ LangGraph Provider: Failed to initialize session', { error: errorMessage });
          dispatch({ type: 'SET_ERROR', payload: errorMessage });
        }
      };
      
      initSession();
    }
  }, []);

  /**
   * Execute workflow with error handling and metrics
   */
  const executeWorkflowWithTracking = useCallback(async (
    updatedState: AppState,
    actionName: string
  ): Promise<void> => {
    const startTime = Date.now();
    
    console.log('🚀 LangGraph Provider: Executing workflow', {
      actionName,
      ideaId: updatedState.idea_id,
      stage: updatedState.current_stage,
      lastAction: updatedState.last_user_action
    });

    dispatch({ type: 'SET_EXECUTING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      // Validate state before execution
      const validation = await langgraphService.validateState(updatedState);
      if (!validation.isValid) {
        throw new Error(`Invalid state: ${validation.issues.join(', ')}`);
      }

      // Execute workflow
      const result = await langgraphService.executeWorkflow(updatedState);
      
      const duration = Date.now() - startTime;
      
      // Update state and metrics
      dispatch({ type: 'SET_STATE', payload: result });
      dispatch({ type: 'UPDATE_METRICS', payload: { duration } });
      dispatch({ type: 'ADD_EXECUTION_HISTORY', payload: { action: actionName, duration, success: true } });
      
      console.log('✅ LangGraph Provider: Workflow execution completed', {
        actionName,
        duration,
        finalStage: result.current_stage,
        messageCount: result.messages.length,
        hasError: !!result.error
      });

      logger.info('LangGraph workflow executed via React hook', {
        action: actionName,
        idea_id: result.idea_id,
        execution_time: duration,
        success: !result.error
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.log('❌ LangGraph Provider: Workflow execution failed', {
        actionName,
        error: errorMessage,
        duration
      });

      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      dispatch({ type: 'ADD_EXECUTION_HISTORY', payload: { action: actionName, duration, success: false } });
      
      logger.error('LangGraph workflow execution failed via React hook', {
        action: actionName,
        error: errorMessage,
        execution_time: duration
      });
    } finally {
      dispatch({ type: 'SET_EXECUTING', payload: false });
    }
  }, []);

  /**
   * Send a chat message through the workflow
   */
  const sendMessage = useCallback(async (content: string, imageUrl?: string): Promise<void> => {
    console.log('💬 LangGraph Provider: Sending message', {
      contentLength: content.length,
      hasImage: !!imageUrl,
      currentStage: state.appState.current_stage
    });

    // Create new message
    const newMessage: ChatMessage = {
      role: 'user',
      content,
      image_url: imageUrl,
      created_at: new Date(),
      stage_at_creation: state.appState.current_stage
    };

    // Update state with new message
    const updatedState: AppState = {
      ...state.appState,
      messages: [...state.appState.messages, newMessage],
      last_user_action: 'chat',
      updated_at: new Date()
    };

    await executeWorkflowWithTracking(updatedState, 'sendMessage');
  }, [state.appState, executeWorkflowWithTracking]);

  /**
   * Send voice input through the workflow
   */
  const sendVoiceInput = useCallback(async (
    filePath: string, 
    duration: number, 
    mimeType: string,
    size: number
  ): Promise<void> => {
    console.log('🎤 LangGraph Provider: Sending voice input', {
      filePath,
      size,
      mimeType,
      duration,
      currentStage: state.appState.current_stage
    });

    // Create voice audio data object
    const voiceAudioData: VoiceAudioData = {
      filePath,
      duration,
      mimeType,
      size,
      recorded_at: new Date()
    };

    // Update state with voice audio data for processing
    const updatedState: AppState = {
      ...state.appState,
      voice_audio_data: voiceAudioData,
      // Clear any previous transcription data
      voice_transcription: undefined,
      last_user_action: 'chat',
      // Clear any previous errors
      error: undefined,
      updated_at: new Date()
    };

    await executeWorkflowWithTracking(updatedState, 'sendVoiceInput');
  }, [state.appState, executeWorkflowWithTracking]);

  /**
   * Complete a workflow stage
   */
  const completeStage = useCallback(async (stage: WorkflowStage): Promise<void> => {
    console.log('🎯 LangGraph Provider: Completing stage', {
      stage,
      currentStage: state.appState.current_stage
    });

    const stageActions: Record<WorkflowStage, UserAction> = {
      brainstorm: 'Brainstorm Done',
      summary: 'Summary Done',
      prd: 'PRD Done'
    };

    const updatedState: AppState = {
      ...state.appState,
      last_user_action: stageActions[stage],
      updated_at: new Date()
    };

    await executeWorkflowWithTracking(updatedState, `completeStage:${stage}`);
  }, [state.appState, executeWorkflowWithTracking]);

  /**
   * Create a new workflow session
   */
  const createNewSession = useCallback(async (userId?: string): Promise<void> => {
    console.log('🆕 LangGraph Provider: Creating new session', { userId });

    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Clear old session in main process
      if (state.appState.idea_id) {
        await langgraphService.clearSession(state.appState.idea_id);
      }
      
      // Create new session in main process
      const newState = await langgraphService.createSession(newSessionId, userId);
      
      dispatch({ type: 'RESET_SESSION', payload: newState });
      
      logger.info('New LangGraph session created via React hook', {
        new_session_id: newSessionId,
        user_id: userId
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ LangGraph Provider: Failed to create new session', { error: errorMessage });
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
    }
  }, [state.appState.idea_id]);

  /**
   * Update user prompts for a stage
   */
  const updateUserPrompts = useCallback(async (stage: WorkflowStage, prompt: string): Promise<void> => {
    console.log('📝 LangGraph Provider: Updating user prompt', { stage, promptLength: prompt.length });

    const updatedState: AppState = {
      ...state.appState,
      user_prompts: {
        ...state.appState.user_prompts,
        [stage]: prompt
      },
      updated_at: new Date()
    };

    dispatch({ type: 'SET_STATE', payload: updatedState });
  }, [state.appState]);

  /**
   * Update selected model for a stage
   */
  const updateSelectedModel = useCallback(async (stage: WorkflowStage, model: string): Promise<void> => {
    console.log('🤖 LangGraph Provider: Updating selected model', { stage, model });

    const updatedState: AppState = {
      ...state.appState,
      selected_models: {
        ...state.appState.selected_models,
        [stage]: model
      },
      updated_at: new Date()
    };

    dispatch({ type: 'SET_STATE', payload: updatedState });
  }, [state.appState]);

  /**
   * Clear current error state
   */
  const clearError = useCallback(() => {
    console.log('🧹 LangGraph Provider: Clearing error state');
    dispatch({ type: 'SET_ERROR', payload: null });
  }, []);

  /**
   * Get current workflow metrics
   */
  const getMetrics = useCallback(() => {
    return state.metrics;
  }, [state.metrics]);

  /**
   * Reset the entire workflow session
   */
  const resetSession = useCallback(async (): Promise<void> => {
    console.log('🔄 LangGraph Provider: Resetting session');
    await createNewSession(state.appState.user_id);
  }, [createNewSession, state.appState.user_id]);

  // Context value
  const contextValue: LangGraphContextValue = {
    state,
    sendMessage,
    sendVoiceInput,
    completeStage,
    createNewSession,
    updateUserPrompts,
    updateSelectedModel,
    clearError,
    getMetrics,
    resetSession
  };

  return (
    <LangGraphContext.Provider value={contextValue}>
      {children}
    </LangGraphContext.Provider>
  );
}

/**
 * Hook to use LangGraph context
 */
export function useLangGraph(): LangGraphContextValue {
  const context = useContext(LangGraphContext);
  
  if (!context) {
    throw new Error('useLangGraph must be used within a LangGraphProvider');
  }
  
  return context;
}

/**
 * Hook for sending messages with loading state
 */
export function useSendMessage() {
  const { sendMessage, state } = useLangGraph();
  
  return {
    sendMessage,
    isLoading: state.isExecuting,
    error: state.error
  };
}

/**
 * Hook for voice input with loading state
 */
export function useVoiceInput() {
  const { sendVoiceInput, state } = useLangGraph();
  
  return {
    sendVoiceInput,
    isLoading: state.isExecuting,
    error: state.error
  };
}

/**
 * Hook for stage management
 */
export function useStageManagement() {
  const { completeStage, state } = useLangGraph();
  
  return {
    completeStage,
    currentStage: state.appState.current_stage,
    isLoading: state.isExecuting,
    error: state.error
  };
}

/**
 * Hook for session management
 */
export function useSessionManagement() {
  const { createNewSession, resetSession, state } = useLangGraph();
  
  return {
    createNewSession,
    resetSession,
    currentSession: state.appState.idea_id,
    isLoading: state.isExecuting,
    error: state.error
  };
}

/**
 * Hook for workflow metrics and debugging
 */
export function useWorkflowMetrics() {
  const { getMetrics, state } = useLangGraph();
  
  return {
    metrics: getMetrics(),
    executionHistory: state.executionHistory,
    currentState: state.appState,
      isExecuting: state.isExecuting
};
} 