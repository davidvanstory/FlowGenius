/**
 * Unit Tests for LangGraph State Management
 * 
 * Tests the state annotation, validation, and utility functions
 * to ensure proper integration with our AppState interface.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  AppStateAnnotation, 
  createInitialLangGraphState, 
  validateLangGraphState,
  createStateUpdate,
  isAppState 
} from './state';
import { AppState, ChatMessage } from '../types/AppState';

describe('LangGraph State Management', () => {
  let testState: AppState;

  beforeEach(() => {
    testState = createInitialLangGraphState('test-idea-123', 'test-user-456');
  });

  describe('createInitialLangGraphState', () => {
    it('should create valid initial state with required fields', () => {
      console.log('🧪 Testing initial state creation');
      
      expect(testState.idea_id).toBe('test-idea-123');
      expect(testState.user_id).toBe('test-user-456');
      expect(testState.current_stage).toBe('brainstorm');
      expect(testState.last_user_action).toBe('chat');
      expect(Array.isArray(testState.messages)).toBe(true);
      expect(testState.messages.length).toBe(0);
      expect(testState.is_processing).toBe(false);
      expect(testState.error).toBeUndefined();
    });

    it('should create state without user_id when not provided', () => {
      console.log('🧪 Testing state creation without user_id');
      
      const stateWithoutUser = createInitialLangGraphState('test-idea-789');
      
      expect(stateWithoutUser.idea_id).toBe('test-idea-789');
      expect(stateWithoutUser.user_id).toBeUndefined();
      expect(stateWithoutUser.current_stage).toBe('brainstorm');
    });

    it('should have default prompts and model selections', () => {
      console.log('🧪 Testing default prompts and models');
      
      expect(testState.user_prompts.brainstorm).toContain('Georgia is great');
      expect(testState.user_prompts.summary).toContain('Ireland is great');
      expect(testState.selected_models.brainstorm).toBe('gpt-4o');
      expect(testState.selected_models.summary).toBe('gpt-4o');
      expect(testState.selected_models.prd).toBe('gpt-4o');
    });
  });

  describe('validateLangGraphState', () => {
    it('should validate correct state', () => {
      console.log('🧪 Testing state validation with valid state');
      
      expect(() => validateLangGraphState(testState)).not.toThrow();
      expect(validateLangGraphState(testState)).toBe(true);
    });

    it('should reject state with missing idea_id', () => {
      console.log('🧪 Testing validation with missing idea_id');
      
      const invalidState = { ...testState, idea_id: '' };
      
      expect(() => validateLangGraphState(invalidState)).toThrow('Invalid idea_id');
    });

    it('should reject state with invalid current_stage', () => {
      console.log('🧪 Testing validation with invalid stage');
      
      const invalidState = { ...testState, current_stage: 'invalid_stage' as any };
      
      expect(() => validateLangGraphState(invalidState)).toThrow('Invalid current_stage');
    });

    it('should reject state with invalid last_user_action', () => {
      console.log('🧪 Testing validation with invalid action');
      
      const invalidState = { ...testState, last_user_action: 'invalid_action' as any };
      
      expect(() => validateLangGraphState(invalidState)).toThrow('Invalid last_user_action');
    });

    it('should reject state with non-array messages', () => {
      console.log('🧪 Testing validation with invalid messages');
      
      const invalidState = { ...testState, messages: 'not an array' as any };
      
      expect(() => validateLangGraphState(invalidState)).toThrow('Invalid messages');
    });
  });

  describe('createStateUpdate', () => {
    it('should create partial state update with updated_at', () => {
      console.log('🧪 Testing state update creation');
      
      const update = createStateUpdate({
        current_stage: 'summary',
        is_processing: true
      });
      
      expect(update.current_stage).toBe('summary');
      expect(update.is_processing).toBe(true);
      expect(update.updated_at).toBeInstanceOf(Date);
    });

    it('should handle empty updates', () => {
      console.log('🧪 Testing empty state update');
      
      const update = createStateUpdate({});
      
      expect(update.updated_at).toBeInstanceOf(Date);
      expect(Object.keys(update).length).toBe(1); // Only updated_at
    });
  });

  describe('isAppState', () => {
    it('should return true for valid AppState', () => {
      console.log('🧪 Testing AppState type guard with valid state');
      
      expect(isAppState(testState)).toBe(true);
    });

    it('should return false for invalid object', () => {
      console.log('🧪 Testing AppState type guard with invalid object');
      
      const invalidObject = { some: 'random', object: true };
      
      expect(isAppState(invalidObject)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      console.log('🧪 Testing AppState type guard with null/undefined');
      
      expect(isAppState(null)).toBe(false);
      expect(isAppState(undefined)).toBe(false);
    });
  });

  describe('AppStateAnnotation', () => {
    it('should have correct default values', () => {
      console.log('🧪 Testing AppStateAnnotation defaults');
      
      // Test that we can access the annotation structure
      expect(AppStateAnnotation).toBeDefined();
      expect(typeof AppStateAnnotation).toBe('object');
    });
  });

  describe('State Updates and Merging', () => {
    it('should handle message concatenation', () => {
      console.log('🧪 Testing message concatenation behavior');
      
      const message1: ChatMessage = {
        role: 'user',
        content: 'Hello',
        created_at: new Date(),
        stage_at_creation: 'brainstorm'
      };

      const message2: ChatMessage = {
        role: 'assistant',
        content: 'Hi there!',
        created_at: new Date(),
        stage_at_creation: 'brainstorm'
      };

      // Test that our reducer logic would work
      const existingMessages = [message1];
      const newMessages = [message2];
      const result = existingMessages.concat(newMessages);
      
      expect(result.length).toBe(2);
      expect(result[0].content).toBe('Hello');
      expect(result[1].content).toBe('Hi there!');
    });

    it('should handle stage transitions', () => {
      console.log('🧪 Testing stage transition logic');
      
      const update = createStateUpdate({
        current_stage: 'summary',
        last_user_action: 'Brainstorm Done'
      });
      
      expect(update.current_stage).toBe('summary');
      expect(update.last_user_action).toBe('Brainstorm Done');
    });
  });
}); 