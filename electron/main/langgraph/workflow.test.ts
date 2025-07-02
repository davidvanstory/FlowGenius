/**
 * Integration Tests for LangGraph Workflow
 * 
 * Tests the complete LangGraph workflow integration with our
 * state management and processUserTurn node.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateGraph, START, END } from '@langchain/langgraph';
import { AppStateAnnotation, createInitialLangGraphState } from './state';
import { processUserTurn } from './nodes/processUserTurn';
import { AppState, ChatMessage } from '../../../src/types/AppState';

// Mock the logger to avoid console spam during tests
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('LangGraph Workflow Integration', () => {
  let workflow: any;
  let initialState: AppState;

  beforeEach(() => {
    console.log('🧪 Setting up LangGraph workflow for testing');
    
    // Create a simple workflow with just the processUserTurn node
    const graph = new StateGraph(AppStateAnnotation)
      .addNode('processUserTurn', processUserTurn)
      .addEdge(START, 'processUserTurn')
      .addEdge('processUserTurn', END);

    workflow = graph.compile();
    initialState = createInitialLangGraphState('test-workflow-123', 'test-user');
  });

  describe('Basic Workflow Execution', () => {
    it('should execute workflow with initial state', async () => {
      console.log('🧪 Testing basic workflow execution');
      
      const result = await workflow.invoke(initialState);
      
      expect(result).toBeDefined();
      expect(result.idea_id).toBe('test-workflow-123');
      expect(result.user_id).toBe('test-user');
      expect(result.current_stage).toBe('brainstorm');
      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages.length).toBe(1); // Should have welcome message
      expect(result.messages[0].role).toBe('assistant');
      expect(result.messages[0].content).toContain('FlowGenius');
    });

    it('should process user message through workflow', async () => {
      console.log('🧪 Testing user message processing through workflow');
      
      const userMessage: ChatMessage = {
        role: 'user',
        content: 'I want to build a mobile app for task management',
        created_at: new Date(),
        stage_at_creation: 'brainstorm'
      };

      const stateWithMessage = {
        ...initialState,
        messages: [userMessage]
      };

      const result = await workflow.invoke(stateWithMessage);
      
      expect(result).toBeDefined();
      expect(result.messages.length).toBe(2); // Original user message + AI response
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content).toBe('I want to build a mobile app for task management');
      expect(result.messages[1].role).toBe('assistant');
      expect(result.messages[1].content).toBeTruthy();
      expect(result.is_processing).toBe(false);
    });

    it('should maintain state consistency through workflow', async () => {
      console.log('🧪 Testing state consistency through workflow');
      
      const userMessage: ChatMessage = {
        role: 'user',
        content: 'Test message',
        created_at: new Date(),
        stage_at_creation: 'brainstorm'
      };

      const inputState = {
        ...initialState,
        messages: [userMessage],
        current_stage: 'brainstorm' as const,
        last_user_action: 'chat' as const
      };

      const result = await workflow.invoke(inputState);
      
      // State should be preserved and updated correctly
      expect(result.idea_id).toBe(inputState.idea_id);
      expect(result.user_id).toBe(inputState.user_id);
      expect(result.current_stage).toBe('brainstorm');
      expect(result.last_user_action).toBe('chat');
      expect(result.user_prompts).toEqual(inputState.user_prompts);
      expect(result.selected_models).toEqual(inputState.selected_models);
      expect(result.updated_at).toBeInstanceOf(Date);
    });
  });

  describe('State Annotation Integration', () => {
    it('should properly merge messages using annotation', async () => {
      console.log('🧪 Testing message merging through state annotation');
      
      const existingMessages: ChatMessage[] = [
        {
          role: 'user',
          content: 'First message',
          created_at: new Date(),
          stage_at_creation: 'brainstorm'
        },
        {
          role: 'assistant',
          content: 'First response',
          created_at: new Date(),
          stage_at_creation: 'brainstorm'
        }
      ];

      const newUserMessage: ChatMessage = {
        role: 'user',
        content: 'Second message',
        created_at: new Date(),
        stage_at_creation: 'brainstorm'
      };

      const stateWithHistory = {
        ...initialState,
        messages: [...existingMessages, newUserMessage]
      };

      const result = await workflow.invoke(stateWithHistory);
      
      // Should have all original messages plus new AI response
      expect(result.messages.length).toBe(4);
      expect(result.messages[0].content).toBe('First message');
      expect(result.messages[1].content).toBe('First response');
      expect(result.messages[2].content).toBe('Second message');
      expect(result.messages[3].role).toBe('assistant');
    });

    it('should handle state updates correctly', async () => {
      console.log('🧪 Testing state updates through annotation');
      
      const stateWithCustomPrompts = {
        ...initialState,
        user_prompts: {
          ...initialState.user_prompts,
          brainstorm: 'Custom brainstorm prompt'
        },
        selected_models: {
          ...initialState.selected_models,
          brainstorm: 'gpt-4o-mini'
        }
      };

      const result = await workflow.invoke(stateWithCustomPrompts);
      
      // Custom settings should be preserved
      expect(result.user_prompts.brainstorm).toBe('Custom brainstorm prompt');
      expect(result.selected_models.brainstorm).toBe('gpt-4o-mini');
    });
  });

  describe('Error Handling in Workflow', () => {
    it('should handle workflow errors gracefully', async () => {
      console.log('🧪 Testing error handling in workflow');
      
      const invalidState = {
        ...initialState,
        idea_id: '', // Invalid state
        messages: [{
          role: 'user' as const,
          content: 'Test message',
          created_at: new Date(),
          stage_at_creation: 'brainstorm' as const
        }]
      };

      const result = await workflow.invoke(invalidState);
      
      // Should handle error and return state with error
      expect(result.error).toBeDefined();
      expect(result.is_processing).toBe(false);
    });
  });

  describe('Workflow Performance', () => {
    it('should execute workflow within reasonable time', async () => {
      console.log('🧪 Testing workflow performance');
      
      const startTime = Date.now();
      
      const userMessage: ChatMessage = {
        role: 'user',
        content: 'Performance test message',
        created_at: new Date(),
        stage_at_creation: 'brainstorm'
      };

      const stateWithMessage = {
        ...initialState,
        messages: [userMessage]
      };

      const result = await workflow.invoke(stateWithMessage);
      
      const executionTime = Date.now() - startTime;
      
      expect(result).toBeDefined();
      expect(executionTime).toBeLessThan(2000); // Should complete within 2 seconds
      console.log(`⏱️ Workflow execution time: ${executionTime}ms`);
    });

    it('should handle multiple rapid invocations', async () => {
      console.log('🧪 Testing multiple rapid workflow invocations');
      
      const promises = Array(5).fill(null).map(async (_, index) => {
        const userMessage: ChatMessage = {
          role: 'user',
          content: `Test message ${index}`,
          created_at: new Date(),
          stage_at_creation: 'brainstorm'
        };

        const stateWithMessage = {
          ...createInitialLangGraphState(`test-${index}`),
          messages: [userMessage]
        };

        return workflow.invoke(stateWithMessage);
      });

      const results = await Promise.all(promises);
      
      // All should complete successfully
      results.forEach((result, index) => {
        expect(result).toBeDefined();
        expect(result.idea_id).toBe(`test-${index}`);
        expect(result.messages.length).toBe(2);
      });
    });
  });
}); 