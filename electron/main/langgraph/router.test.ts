/**
 * Unit Tests for LangGraph Router
 * 
 * Tests the conditional routing logic to ensure proper workflow navigation
 * based on user actions and application state.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  routeUserAction, 
  routeVoiceInput,
  shouldTransitionStage,
  shouldContinueWorkflow,
  getRoutingDescription,
  RouteNames 
} from './router';
import { AppState } from '../../../src/types/AppState';
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

describe('LangGraph Router', () => {
  let testState: AppState;

  beforeEach(() => {
    testState = createInitialLangGraphState('test-idea-123', 'test-user-456');
  });

  describe('routeUserAction', () => {
    it('should route chat messages to processUserTurn', () => {
      console.log('🧪 Testing chat message routing');
      testState.last_user_action = 'chat';
      
      const route = routeUserAction(testState);
      
      expect(route).toBe(RouteNames.PROCESS_USER_TURN);
    });

    it('should route to generateSummary when brainstorm is done', () => {
      console.log('🧪 Testing brainstorm completion routing');
      testState.last_user_action = 'Brainstorm Done';
      testState.current_stage = 'brainstorm';
      
      const route = routeUserAction(testState);
      
      expect(route).toBe(RouteNames.GENERATE_SUMMARY);
    });

    it('should route to END if brainstorm done in wrong stage', () => {
      console.log('🧪 Testing invalid brainstorm completion');
      testState.last_user_action = 'Brainstorm Done';
      testState.current_stage = 'summary'; // Wrong stage
      
      const route = routeUserAction(testState);
      
      expect(route).toBe(RouteNames.END);
    });

    it('should route to END for Summary Done (PRD not implemented)', () => {
      console.log('🧪 Testing summary completion routing');
      testState.last_user_action = 'Summary Done';
      testState.current_stage = 'summary';
      
      const route = routeUserAction(testState);
      
      // Currently returns END because generatePRD is not implemented
      expect(route).toBe(RouteNames.END);
    });

    it('should route to END when PRD is done', () => {
      console.log('🧪 Testing PRD completion routing');
      testState.last_user_action = 'PRD Done';
      
      const route = routeUserAction(testState);
      
      expect(route).toBe(RouteNames.END);
    });

    it('should route to END when there is an error', () => {
      console.log('🧪 Testing error state routing');
      testState.error = 'Test error';
      testState.last_user_action = 'chat';
      
      const route = routeUserAction(testState);
      
      expect(route).toBe(RouteNames.END);
    });

    it('should route to END when processing', () => {
      console.log('🧪 Testing processing state routing');
      testState.is_processing = true;
      testState.last_user_action = 'chat';
      
      const route = routeUserAction(testState);
      
      expect(route).toBe(RouteNames.END);
    });

    it('should route to END for unknown action', () => {
      console.log('🧪 Testing unknown action routing');
      // @ts-expect-error - Testing invalid action
      testState.last_user_action = 'Unknown Action';
      
      const route = routeUserAction(testState);
      
      expect(route).toBe(RouteNames.END);
    });
  });

  describe('routeVoiceInput', () => {
    it('should route voice input to processUserTurn', () => {
      console.log('🧪 Testing voice input routing');
      
      const route = routeVoiceInput(testState);
      
      expect(route).toBe(RouteNames.PROCESS_USER_TURN);
    });
  });

  describe('shouldTransitionStage', () => {
    it('should return true for brainstorm to summary transition', () => {
      console.log('🧪 Testing brainstorm stage transition');
      testState.current_stage = 'brainstorm';
      testState.last_user_action = 'Brainstorm Done';
      
      expect(shouldTransitionStage(testState)).toBe(true);
    });

    it('should return false for brainstorm with chat action', () => {
      console.log('🧪 Testing no transition for chat in brainstorm');
      testState.current_stage = 'brainstorm';
      testState.last_user_action = 'chat';
      
      expect(shouldTransitionStage(testState)).toBe(false);
    });

    it('should return true for summary to PRD transition', () => {
      console.log('🧪 Testing summary stage transition');
      testState.current_stage = 'summary';
      testState.last_user_action = 'Summary Done';
      
      expect(shouldTransitionStage(testState)).toBe(true);
    });

    it('should return false for PRD stage', () => {
      console.log('🧪 Testing no transition from PRD');
      testState.current_stage = 'prd';
      testState.last_user_action = 'PRD Done';
      
      expect(shouldTransitionStage(testState)).toBe(false);
    });
  });

  describe('shouldContinueWorkflow', () => {
    it('should return true for normal state', () => {
      console.log('🧪 Testing workflow continuation - normal');
      
      expect(shouldContinueWorkflow(testState)).toBe(true);
    });

    it('should return false when there is an error', () => {
      console.log('🧪 Testing workflow continuation - error');
      testState.error = 'Test error';
      
      expect(shouldContinueWorkflow(testState)).toBe(false);
    });

    it('should return false when processing', () => {
      console.log('🧪 Testing workflow continuation - processing');
      testState.is_processing = true;
      
      expect(shouldContinueWorkflow(testState)).toBe(false);
    });

    it('should return false when PRD is done', () => {
      console.log('🧪 Testing workflow continuation - PRD done');
      testState.last_user_action = 'PRD Done';
      
      expect(shouldContinueWorkflow(testState)).toBe(false);
    });
  });

  describe('getRoutingDescription', () => {
    it('should describe chat routing', () => {
      console.log('🧪 Testing routing description - chat');
      testState.last_user_action = 'chat';
      testState.current_stage = 'brainstorm';
      
      const description = getRoutingDescription(testState);
      
      expect(description).toBe('Processing user message in brainstorm stage');
    });

    it('should describe summary generation routing', () => {
      console.log('🧪 Testing routing description - summary');
      testState.last_user_action = 'Brainstorm Done';
      testState.current_stage = 'brainstorm';
      
      const description = getRoutingDescription(testState);
      
      expect(description).toBe('Generating summary of brainstorming session');
    });

    it('should describe workflow end', () => {
      console.log('🧪 Testing routing description - end');
      testState.last_user_action = 'PRD Done';
      
      const description = getRoutingDescription(testState);
      
      expect(description).toBe('Workflow ended');
    });
  });
}); 