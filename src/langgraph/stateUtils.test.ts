/**
 * Unit Tests for LangGraph State Utilities
 * 
 * Tests the extended state management utilities including
 * history tracking, persistence, recovery, and monitoring.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  StateHistory,
  StateQuery,
  StatePersistence,
  StateRecovery,
  StateMonitor,
  measureStateOperation,
  stateHistory,
  stateMonitor
} from './stateUtils';
import { AppState, ChatMessage } from '../types/AppState';
import { createInitialLangGraphState } from './state';

// Mock the logger
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('StateHistory', () => {
  let history: StateHistory;
  let testState: AppState;

  beforeEach(() => {
    history = new StateHistory(5); // Small size for testing
    testState = createInitialLangGraphState('test-123', 'user-456');
  });

  it('should add snapshots to history', () => {
    console.log('🧪 Testing snapshot addition');
    
    history.addSnapshot(testState, 'testNode', { test: true });
    
    const latest = history.getLatestSnapshot();
    expect(latest).toBeDefined();
    expect(latest?.nodeName).toBe('testNode');
    expect(latest?.metadata).toEqual({ test: true });
  });

  it('should limit history size', () => {
    console.log('🧪 Testing history size limit');
    
    // Add more than max size
    for (let i = 0; i < 10; i++) {
      history.addSnapshot(testState, `node${i}`);
    }
    
    // Should only keep last 5
    const snapshots = history.getSnapshotsByTimeRange(
      new Date(0),
      new Date()
    );
    expect(snapshots.length).toBe(5);
    expect(snapshots[0].nodeName).toBe('node5');
  });

  it('should filter snapshots by stage', () => {
    console.log('🧪 Testing stage filtering');
    
    const brainstormState = { ...testState, current_stage: 'brainstorm' as const };
    const summaryState = { ...testState, current_stage: 'summary' as const };
    
    history.addSnapshot(brainstormState, 'node1');
    history.addSnapshot(summaryState, 'node2');
    history.addSnapshot(brainstormState, 'node3');
    
    const brainstormSnapshots = history.getSnapshotsByStage('brainstorm');
    expect(brainstormSnapshots.length).toBe(2);
  });
});

describe('StateQuery', () => {
  let testState: AppState;

  beforeEach(() => {
    testState = createInitialLangGraphState('test-123', 'user-456');
    
    // Add some test messages
    testState.messages = [
      {
        role: 'user',
        content: 'Hello',
        created_at: new Date(),
        stage_at_creation: 'brainstorm'
      },
      {
        role: 'assistant',
        content: 'Hi there!',
        created_at: new Date(),
        stage_at_creation: 'brainstorm'
      },
      {
        role: 'user',
        content: 'Tell me more',
        created_at: new Date(),
        stage_at_creation: 'summary'
      }
    ];
  });

  it('should filter messages by role', () => {
    console.log('🧪 Testing message filtering by role');
    
    const userMessages = StateQuery.getMessagesByRole(testState, 'user');
    expect(userMessages.length).toBe(2);
    expect(userMessages[0].content).toBe('Hello');
  });

  it('should get messages for current stage', () => {
    console.log('🧪 Testing stage-specific messages');
    
    testState.current_stage = 'brainstorm';
    const stageMessages = StateQuery.getMessagesForCurrentStage(testState);
    expect(stageMessages.length).toBe(2);
  });

  it('should check if ready for stage transition', () => {
    console.log('🧪 Testing stage transition readiness');
    
    testState.current_stage = 'brainstorm';
    testState.last_user_action = 'Brainstorm Done';
    
    expect(StateQuery.isReadyForStageTransition(testState)).toBe(true);
    
    testState.last_user_action = 'chat';
    expect(StateQuery.isReadyForStageTransition(testState)).toBe(false);
  });

  it('should build conversation context with alternating roles', () => {
    console.log('🧪 Testing conversation context building');
    
    // Add duplicate roles
    testState.messages.push({
      role: 'user',
      content: 'Another user message',
      created_at: new Date(),
      stage_at_creation: 'summary'
    });
    
    const context = StateQuery.getConversationContext(testState, 10);
    
    // Should alternate roles
    let lastRole: 'user' | 'assistant' | null = null;
    for (const msg of context) {
      expect(msg.role).not.toBe(lastRole);
      lastRole = msg.role;
    }
  });
});

describe('StatePersistence', () => {
  let testState: AppState;

  beforeEach(() => {
    testState = createInitialLangGraphState('test-123', 'user-456');
    testState.created_at = new Date('2024-01-01');
    testState.messages = [{
      role: 'user',
      content: 'Test message',
      created_at: new Date('2024-01-01'),
      stage_at_creation: 'brainstorm'
    }];
  });

  it('should serialize and deserialize state correctly', () => {
    console.log('🧪 Testing state serialization/deserialization');
    
    const serialized = StatePersistence.serialize(testState);
    expect(typeof serialized).toBe('string');
    
    const deserialized = StatePersistence.deserialize(serialized);
    expect(deserialized.idea_id).toBe(testState.idea_id);
    expect(deserialized.messages.length).toBe(testState.messages.length);
    expect(deserialized.created_at).toBeInstanceOf(Date);
  });

  it('should handle missing dates during deserialization', () => {
    console.log('🧪 Testing deserialization with missing dates');
    
    const customState = {
      ...testState,
      created_at: undefined,
      messages: [{
        role: 'user' as const,
        content: 'Test',
        stage_at_creation: 'brainstorm' as const
      }]
    };
    
    const serialized = JSON.stringify(customState);
    const deserialized = StatePersistence.deserialize(serialized);
    
    expect(deserialized.created_at).toBeUndefined();
    expect(deserialized.messages[0].created_at).toBeInstanceOf(Date);
  });
});

describe('StateRecovery', () => {
  let testState: AppState;

  beforeEach(() => {
    testState = createInitialLangGraphState('test-123', 'user-456');
    testState.is_processing = true;
    testState.error = 'Previous error';
  });

  it('should create recovery state from error', () => {
    console.log('🧪 Testing recovery state creation');
    
    const error = new Error('Test error');
    const recoveryState = StateRecovery.createRecoveryState(testState, error);
    
    expect(recoveryState.error).toBe('Test error');
    expect(recoveryState.is_processing).toBe(false);
    expect(recoveryState.messages.length).toBeGreaterThan(testState.messages.length);
    
    const lastMessage = recoveryState.messages[recoveryState.messages.length - 1];
    expect(lastMessage.content).toContain('Test error');
  });

  it('should clear error state', () => {
    console.log('🧪 Testing error state clearing');
    
    const clearedState = StateRecovery.clearError(testState);
    expect(clearedState.error).toBeUndefined();
  });

  it('should reset to safe state', () => {
    console.log('🧪 Testing safe state reset');
    
    testState.last_user_action = 'Summary Done';
    
    const safeState = StateRecovery.resetToSafeState(testState);
    expect(safeState.is_processing).toBe(false);
    expect(safeState.error).toBeUndefined();
    expect(safeState.last_user_action).toBe('chat');
  });
});

describe('StateMonitor', () => {
  let monitor: StateMonitor;

  beforeEach(() => {
    monitor = new StateMonitor();
  });

  it('should record and calculate metrics', () => {
    console.log('🧪 Testing metric recording');
    
    monitor.recordMetric('test_duration', 100);
    monitor.recordMetric('test_duration', 200);
    monitor.recordMetric('test_duration', 150);
    
    const avg = monitor.getAverage('test_duration');
    expect(avg).toBe(150);
  });

  it('should provide summary of all metrics', () => {
    console.log('🧪 Testing metrics summary');
    
    monitor.recordMetric('duration', 100);
    monitor.recordMetric('duration', 300);
    monitor.recordMetric('count', 5);
    monitor.recordMetric('count', 10);
    
    const summary = monitor.getSummary();
    
    expect(summary.duration).toEqual({
      avg: 200,
      min: 100,
      max: 300,
      count: 2
    });
    
    expect(summary.count).toEqual({
      avg: 7.5,
      min: 5,
      max: 10,
      count: 2
    });
  });
});

describe('measureStateOperation', () => {
  it('should measure successful operations', () => {
    console.log('🧪 Testing operation measurement');
    
    const result = measureStateOperation('testOp', () => {
      // Simulate some work
      return 'success';
    });
    
    expect(result).toBe('success');
    
    // Check that metric was recorded
    const avg = stateMonitor.getAverage('testOp_duration_ms');
    expect(avg).toBeGreaterThanOrEqual(0);
  });

  it('should measure failed operations', () => {
    console.log('🧪 Testing failed operation measurement');
    
    expect(() => {
      measureStateOperation('failOp', () => {
        throw new Error('Test failure');
      });
    }).toThrow('Test failure');
    
    // Check that error metric was recorded
    const avg = stateMonitor.getAverage('failOp_error_duration_ms');
    expect(avg).toBeGreaterThanOrEqual(0);
  });
}); 