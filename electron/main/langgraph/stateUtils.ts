/**
 * LangGraph State Management Utilities - Extended
 * 
 * This file provides additional state management utilities for the FlowGenius LangGraph workflow.
 * It extends the base state management with persistence, recovery, and advanced manipulation.
 * 
 * Key Features:
 * - State persistence and recovery
 * - State history tracking
 * - Advanced state queries and filters
 * - State migration utilities
 * - Performance monitoring
 */

import { AppState, ChatMessage, WorkflowStage, UserAction } from '../../../src/types/AppState';
import { logger } from '../../../src/utils/logger';
import { validateLangGraphState, createStateUpdate } from './state';

/**
 * State snapshot for history tracking
 */
export interface StateSnapshot {
  state: AppState;
  timestamp: Date;
  nodeName: string;
  metadata?: Record<string, any>;
}

/**
 * State history manager for tracking state changes
 */
export class StateHistory {
  private history: StateSnapshot[] = [];
  private maxHistorySize: number;

  constructor(maxHistorySize: number = 100) {
    this.maxHistorySize = maxHistorySize;
    console.log('📚 StateHistory: Initialized', { maxHistorySize });
  }

  /**
   * Add a state snapshot to history
   */
  addSnapshot(state: AppState, nodeName: string, metadata?: Record<string, any>): void {
    const snapshot: StateSnapshot = {
      state: JSON.parse(JSON.stringify(state)), // Deep clone
      timestamp: new Date(),
      nodeName,
      metadata
    };

    this.history.push(snapshot);

    // Trim history if it exceeds max size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    console.log('📸 StateHistory: Snapshot added', {
      historySize: this.history.length,
      nodeName,
      stageAtSnapshot: state.current_stage
    });
  }

  /**
   * Get the most recent snapshot
   */
  getLatestSnapshot(): StateSnapshot | undefined {
    return this.history[this.history.length - 1];
  }

  /**
   * Get all snapshots for a specific stage
   */
  getSnapshotsByStage(stage: WorkflowStage): StateSnapshot[] {
    return this.history.filter(snapshot => snapshot.state.current_stage === stage);
  }

  /**
   * Get snapshots within a time range
   */
  getSnapshotsByTimeRange(startTime: Date, endTime: Date): StateSnapshot[] {
    return this.history.filter(snapshot => 
      snapshot.timestamp >= startTime && snapshot.timestamp <= endTime
    );
  }

  /**
   * Clear history
   */
  clear(): void {
    this.history = [];
    console.log('🧹 StateHistory: History cleared');
  }
}

/**
 * State query utilities for advanced state inspection
 */
export class StateQuery {
  /**
   * Get messages by role
   */
  static getMessagesByRole(state: AppState, role: 'user' | 'assistant'): ChatMessage[] {
    console.log(`🔍 StateQuery: Getting messages by role: ${role}`);
    return state.messages.filter(msg => msg.role === role);
  }

  /**
   * Get messages for current stage
   */
  static getMessagesForCurrentStage(state: AppState): ChatMessage[] {
    console.log(`🔍 StateQuery: Getting messages for stage: ${state.current_stage}`);
    return state.messages.filter(msg => msg.stage_at_creation === state.current_stage);
  }

  /**
   * Get last N messages
   */
  static getLastNMessages(state: AppState, n: number): ChatMessage[] {
    console.log(`🔍 StateQuery: Getting last ${n} messages`);
    return state.messages.slice(-n);
  }

  /**
   * Check if state is in error condition
   */
  static hasError(state: AppState): boolean {
    return !!state.error;
  }

  /**
   * Check if state is ready for stage transition
   */
  static isReadyForStageTransition(state: AppState): boolean {
    const actionToStageMap: Record<UserAction, boolean> = {
      'chat': false,
      'Brainstorm Done': state.current_stage === 'brainstorm',
      'Summary Done': state.current_stage === 'summary',
      'PRD Done': state.current_stage === 'prd',
      'Market Research Done': state.current_stage === 'market_research'
    };

    return actionToStageMap[state.last_user_action] || false;
  }

  /**
   * Get conversation context (last N messages with role alternation)
   */
  static getConversationContext(state: AppState, maxMessages: number = 10): ChatMessage[] {
    console.log(`🔍 StateQuery: Building conversation context (max: ${maxMessages})`);
    
    const recentMessages = state.messages.slice(-maxMessages);
    
    // Ensure we have alternating roles for better context
    const context: ChatMessage[] = [];
    let lastRole: 'user' | 'assistant' | null = null;
    
    for (const msg of recentMessages) {
      if (msg.role !== lastRole) {
        context.push(msg);
        lastRole = msg.role;
      }
    }
    
    return context;
  }
}

/**
 * State persistence utilities
 */
export class StatePersistence {
  /**
   * Serialize state for storage
   */
  static serialize(state: AppState): string {
    console.log('💾 StatePersistence: Serializing state');
    
    try {
      const serializable = {
        ...state,
        created_at: state.created_at?.toISOString(),
        updated_at: state.updated_at?.toISOString(),
        messages: state.messages.map(msg => ({
          ...msg,
          created_at: msg.created_at ? msg.created_at.toISOString() : new Date().toISOString()
        }))
      };
      
      return JSON.stringify(serializable);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to serialize state', { error: errorMessage });
      throw new Error('State serialization failed');
    }
  }

  /**
   * Deserialize state from storage
   */
  static deserialize(serialized: string): AppState {
    console.log('📂 StatePersistence: Deserializing state');
    
    try {
      const parsed = JSON.parse(serialized);
      
      // Restore Date objects
      const state: AppState = {
        ...parsed,
        created_at: parsed.created_at ? new Date(parsed.created_at) : undefined,
        updated_at: parsed.updated_at ? new Date(parsed.updated_at) : undefined,
        messages: parsed.messages.map((msg: any) => ({
          ...msg,
          created_at: new Date(msg.created_at)
        }))
      };
      
      // Validate the deserialized state
      if (!validateLangGraphState(state)) {
        throw new Error('Deserialized state is invalid');
      }
      
      return state;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to deserialize state', { error: errorMessage });
      throw new Error('State deserialization failed');
    }
  }
}

/**
 * State recovery utilities for error handling
 */
export class StateRecovery {
  /**
   * Create a recovery state from an error condition
   */
  static createRecoveryState(state: AppState, error: Error): AppState {
    console.log('🚑 StateRecovery: Creating recovery state', { error: error.message });
    
    return createStateUpdate({
      ...state,
      error: error.message,
      is_processing: false,
      messages: [
        ...state.messages,
        {
          role: 'assistant',
          content: `I encountered an error: ${error.message}. Let's try again.`,
          created_at: new Date(),
          stage_at_creation: state.current_stage
        }
      ]
    }) as AppState;
  }

  /**
   * Clear error state
   */
  static clearError(state: AppState): AppState {
    console.log('✅ StateRecovery: Clearing error state');
    
    return createStateUpdate({
      ...state,
      error: undefined
    }) as AppState;
  }

  /**
   * Reset to safe state (keep messages but reset processing flags)
   */
  static resetToSafeState(state: AppState): AppState {
    console.log('🔄 StateRecovery: Resetting to safe state');
    
    return createStateUpdate({
      ...state,
      is_processing: false,
      error: undefined,
      last_user_action: 'chat' as UserAction
    }) as AppState;
  }
}

/**
 * State performance monitoring
 */
export class StateMonitor {
  private metrics: Map<string, number[]> = new Map();

  /**
   * Record a metric
   */
  recordMetric(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    const values = this.metrics.get(name)!;
    values.push(value);
    
    // Keep only last 100 values
    if (values.length > 100) {
      values.shift();
    }
    
    console.log(`📊 StateMonitor: Recorded metric ${name}=${value}`);
  }

  /**
   * Get average for a metric
   */
  getAverage(name: string): number | null {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return null;
    
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Get all metrics summary
   */
  getSummary(): Record<string, { avg: number; min: number; max: number; count: number }> {
    const summary: Record<string, any> = {};
    
    for (const [name, values] of this.metrics.entries()) {
      if (values.length > 0) {
        summary[name] = {
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          count: values.length
        };
      }
    }
    
    return summary;
  }
}

/**
 * Global state management utilities instance
 */
export const stateHistory = new StateHistory();
export const stateMonitor = new StateMonitor();

/**
 * Utility function to measure state operation performance
 */
export function measureStateOperation<T>(
  operationName: string,
  operation: () => T
): T {
  const startTime = Date.now();
  
  try {
    const result = operation();
    const duration = Date.now() - startTime;
    
    stateMonitor.recordMetric(`${operationName}_duration_ms`, duration);
    console.log(`⏱️ StateOperation: ${operationName} completed in ${duration}ms`);
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    stateMonitor.recordMetric(`${operationName}_error_duration_ms`, duration);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`State operation failed: ${operationName}`, { error: errorMessage, duration });
    throw error;
  }
} 