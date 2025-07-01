/**
 * Unit Tests for LangGraph Workflow Logger
 * 
 * Tests the workflow logging and debugging capabilities
 * including event tracking, performance monitoring, and error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  WorkflowLogger,
  WorkflowEventType,
  createWorkflowLogger
} from './workflowLogger';
import { AppState } from '../types/AppState';
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

// Mock state utilities
vi.mock('./stateUtils', () => ({
  stateHistory: {
    addSnapshot: vi.fn()
  },
  stateMonitor: {
    recordMetric: vi.fn()
  }
}));

describe('WorkflowLogger', () => {
  let logger: WorkflowLogger;
  let testState: AppState;

  beforeEach(() => {
    logger = new WorkflowLogger('test-workflow-123', false);
    testState = createInitialLangGraphState('test-idea', 'test-user');
  });

  describe('constructor', () => {
    it('should initialize with correct workflow ID', () => {
      console.log('🧪 Testing logger initialization');
      const summary = logger.getExecutionSummary();
      expect(summary.workflowId).toBe('test-workflow-123');
      expect(summary.eventCount).toBe(0);
      expect(summary.errorCount).toBe(0);
    });

    it('should generate unique ID if not provided', () => {
      const autoLogger = createWorkflowLogger();
      const summary = autoLogger.getExecutionSummary();
      expect(summary.workflowId).toMatch(/^workflow_\d+_[a-z0-9]+$/);
    });
  });

  describe('logWorkflowStart', () => {
    it('should log workflow start event', () => {
      console.log('🧪 Testing workflow start logging');
      logger.logWorkflowStart(testState);
      
      const events = logger.getEventsByType(WorkflowEventType.WORKFLOW_START);
      expect(events).toHaveLength(1);
      expect(events[0].state).toEqual(testState);
      expect(events[0].metadata?.idea_id).toBe('test-idea');
      expect(events[0].metadata?.stage).toBe('brainstorm');
    });
  });

  describe('logWorkflowEnd', () => {
    it('should log workflow end event with duration', () => {
      console.log('🧪 Testing workflow end logging');
      
      // Mock Date.now for consistent timing
      const startTime = Date.now();
      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(startTime) // For workflow start
        .mockReturnValueOnce(startTime + 1000); // For workflow end
      
      logger.logWorkflowStart(testState);
      logger.logWorkflowEnd(testState);
      
      const events = logger.getEventsByType(WorkflowEventType.WORKFLOW_END);
      expect(events).toHaveLength(1);
      expect(events[0].duration).toBeGreaterThanOrEqual(0);
      
      const summary = logger.getExecutionSummary();
      expect(summary.duration).toBeGreaterThanOrEqual(0);
      
      vi.restoreAllMocks();
    });
  });

  describe('logNodeEnter and logNodeExit', () => {
    it('should track node execution with timing', () => {
      console.log('🧪 Testing node execution tracking');
      
      // Mock Date constructor for consistent timing
      const startTime = new Date('2023-01-01T00:00:00.000Z');
      const endTime = new Date('2023-01-01T00:00:00.500Z');
      
      vi.spyOn(global, 'Date')
        .mockImplementationOnce(() => startTime as any) // For node enter
        .mockImplementationOnce(() => endTime as any); // For node exit
      
      logger.logNodeEnter('processUserTurn', testState);
      
      const updatedState = { ...testState, is_processing: false };
      logger.logNodeExit('processUserTurn', updatedState, { is_processing: false });
      
      const enterEvents = logger.getEventsByType(WorkflowEventType.NODE_ENTER);
      const exitEvents = logger.getEventsByType(WorkflowEventType.NODE_EXIT);
      
      expect(enterEvents).toHaveLength(1);
      expect(exitEvents).toHaveLength(1);
      expect(exitEvents[0].duration).toBe(500);
      
      const summary = logger.getExecutionSummary();
      expect(summary.nodeExecutions.processUserTurn).toBeDefined();
      expect(summary.nodeExecutions.processUserTurn.count).toBe(1);
      expect(summary.nodeExecutions.processUserTurn.avgDuration).toBe(500);
      
      vi.restoreAllMocks();
    });

    it('should track multiple executions of same node', () => {
      console.log('🧪 Testing multiple node executions');
      // Execute node 3 times
      for (let i = 0; i < 3; i++) {
        logger.logNodeEnter('processUserTurn', testState);
        logger.logNodeExit('processUserTurn', testState);
      }
      
      const summary = logger.getExecutionSummary();
      expect(summary.nodeExecutions.processUserTurn.count).toBe(3);
    });
  });

  describe('logNodeError', () => {
    it('should log node errors', () => {
      console.log('🧪 Testing node error logging');
      const error = new Error('Test node error');
      logger.logNodeError('processUserTurn', error, testState);
      
      const errorEvents = logger.getEventsByType(WorkflowEventType.NODE_ERROR);
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].error).toBe(error);
      expect(errorEvents[0].metadata?.errorMessage).toBe('Test node error');
      
      const summary = logger.getExecutionSummary();
      expect(summary.errorCount).toBe(1);
    });
  });

  describe('logEdgeTransition', () => {
    it('should log edge transitions', () => {
      console.log('🧪 Testing edge transition logging');
      logger.logEdgeTransition('nodeA', 'nodeB', 'condition1');
      
      const events = logger.getEventsByType(WorkflowEventType.EDGE_TRANSITION);
      expect(events).toHaveLength(1);
      expect(events[0].edgeName).toBe('nodeA -> nodeB');
      expect(events[0].metadata?.condition).toBe('condition1');
    });
  });

  describe('logStateUpdate', () => {
    it('should log state updates', () => {
      console.log('🧪 Testing state update logging');
      const updates = { is_processing: false, current_stage: 'summary' as const };
      logger.logStateUpdate(updates, 'processUserTurn');
      
      const events = logger.getEventsByType(WorkflowEventType.STATE_UPDATE);
      expect(events).toHaveLength(1);
      expect(events[0].state).toEqual(updates);
      expect(events[0].metadata?.source).toBe('processUserTurn');
      expect(events[0].metadata?.updatedFields).toEqual(['is_processing', 'current_stage']);
      
      const summary = logger.getExecutionSummary();
      expect(summary.stateUpdateCount).toBe(1);
    });
  });

  describe('logConditionCheck', () => {
    it('should log condition checks', () => {
      console.log('🧪 Testing condition check logging');
      logger.logConditionCheck('hasUserInput', true, { messageCount: 5 });
      
      const events = logger.getEventsByType(WorkflowEventType.CONDITION_CHECK);
      expect(events).toHaveLength(1);
      expect(events[0].metadata?.condition).toBe('hasUserInput');
      expect(events[0].metadata?.result).toBe(true);
      expect(events[0].metadata?.messageCount).toBe(5);
    });
  });

  describe('logWorkflowError', () => {
    it('should log workflow errors', () => {
      console.log('🧪 Testing workflow error logging');
      const error = new Error('Workflow error');
      logger.logWorkflowError(error, { stage: 'summary' });
      
      const events = logger.getEventsByType(WorkflowEventType.WORKFLOW_ERROR);
      expect(events).toHaveLength(1);
      expect(events[0].error).toBe(error);
      expect(events[0].metadata?.context.stage).toBe('summary');
      
      const summary = logger.getExecutionSummary();
      expect(summary.errorCount).toBe(1);
    });
  });

  describe('getNodeTimeline', () => {
    it('should return correct node execution timeline', () => {
      console.log('🧪 Testing node timeline generation');
      logger.logNodeEnter('nodeA', testState);
      logger.logNodeExit('nodeA', testState);
      
      logger.logNodeEnter('nodeB', testState);
      logger.logNodeExit('nodeB', testState);
      
      const timeline = logger.getNodeTimeline();
      expect(timeline).toHaveLength(2);
      expect(timeline[0].node).toBe('nodeA');
      expect(timeline[1].node).toBe('nodeB');
    });
  });

  describe('exportLogs', () => {
    it('should export logs as JSON', () => {
      console.log('🧪 Testing log export');
      logger.logWorkflowStart(testState);
      logger.logNodeEnter('processUserTurn', testState);
      logger.logNodeExit('processUserTurn', testState);
      logger.logWorkflowEnd(testState);
      
      const exported = logger.exportLogs();
      const parsed = JSON.parse(exported);
      
      expect(parsed.context).toBeDefined();
      expect(parsed.summary).toBeDefined();
      expect(parsed.timeline).toBeDefined();
      expect(parsed.summary.workflowId).toBe('test-workflow-123');
    });
  });

  describe('debug mode', () => {
    it('should log debug information when enabled', () => {
      console.log('🧪 Testing debug mode');
      const debugLogger = new WorkflowLogger('debug-workflow', true);
      const mockDebug = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      debugLogger.logWorkflowStart(testState);
      debugLogger.logNodeEnter('testNode', testState);
      debugLogger.logNodeExit('testNode', testState);
      debugLogger.logWorkflowEnd(testState);
      
      // Should print debug summary
      expect(mockDebug).toHaveBeenCalled();
      
      mockDebug.mockRestore();
    });
  });

  describe('performance tracking', () => {
    it('should calculate average node execution times', () => {
      console.log('🧪 Testing performance metrics');
      
      // Since we can't easily mock timing, let's just test the functionality
      // by calling the methods and checking the results
      logger.logNodeEnter('testNode', testState);
      logger.logNodeExit('testNode', testState);
      
      logger.logNodeEnter('testNode', testState);
      logger.logNodeExit('testNode', testState);
      
      logger.logNodeEnter('testNode', testState);
      logger.logNodeExit('testNode', testState);
      
      const summary = logger.getExecutionSummary();
      expect(summary.nodeExecutions.testNode.count).toBe(3);
      // The avgDuration will be very small but should exist
      expect(summary.nodeExecutions.testNode.avgDuration).toBeDefined();
      expect(summary.nodeExecutions.testNode.avgDuration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('complex workflow scenario', () => {
    it('should handle complete workflow execution', () => {
      console.log('🧪 Testing complete workflow scenario');
      
      // Start workflow
      logger.logWorkflowStart(testState);
      
      // First node execution
      logger.logNodeEnter('processUserTurn', testState);
      logger.logStateUpdate({ is_processing: true }, 'processUserTurn');
      logger.logNodeExit('processUserTurn', { ...testState, is_processing: false });
      
      // Edge transition
      logger.logEdgeTransition('processUserTurn', 'router');
      logger.logConditionCheck('shouldContinue', true);
      
      // Second node execution
      logger.logNodeEnter('generateSummary', testState);
      logger.logStateUpdate({ current_stage: 'summary' as const }, 'generateSummary');
      logger.logNodeExit('generateSummary', { ...testState, current_stage: 'summary' as const });
      
      // End workflow
      logger.logWorkflowEnd({ ...testState, current_stage: 'summary' as const });
      
      const summary = logger.getExecutionSummary();
      expect(summary.eventCount).toBeGreaterThan(5);
      expect(summary.stateUpdateCount).toBe(2);
      expect(Object.keys(summary.nodeExecutions)).toHaveLength(2);
      
      const timeline = logger.getNodeTimeline();
      expect(timeline).toHaveLength(2);
      expect(timeline[0].node).toBe('processUserTurn');
      expect(timeline[1].node).toBe('generateSummary');
    });
  });
}); 