/**
 * Unit Tests for ProcessUserTurn Node
 * 
 * Tests the processUserTurn LangGraph node to ensure it properly
 * handles user messages and generates appropriate responses.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processUserTurn } from './processUserTurn';
import { AppState, ChatMessage } from '../../../../src/types/AppState';
import { createInitialLangGraphState } from '../state';

// Mock the logger to avoid console spam during tests
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('ProcessUserTurn Node', () => {
  let initialState: AppState;
  let userMessage: ChatMessage;

  beforeEach(() => {
    initialState = createInitialLangGraphState('test-idea-123', 'test-user-456');
    userMessage = {
      role: 'user',
      content: 'I have an idea for a new productivity app',
      created_at: new Date(),
      stage_at_creation: 'brainstorm'
    };
  });

  describe('Initial Welcome Message', () => {
    it('should return welcome message when no messages exist', async () => {
      console.log('🧪 Testing welcome message generation');
      
      const result = await processUserTurn(initialState);
      
      expect(result.messages).toBeDefined();
      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages!.length).toBe(1);
      
      const welcomeMessage = result.messages![0];
      expect(welcomeMessage.role).toBe('assistant');
      expect(welcomeMessage.content).toContain('FlowGenius');
      expect(welcomeMessage.content).toContain('thought partner');
      expect(result.is_processing).toBe(false);
    });
  });

  describe('User Message Processing', () => {
    it('should process user message and generate response', async () => {
      console.log('🧪 Testing user message processing');
      
      const stateWithUserMessage = {
        ...initialState,
        messages: [userMessage]
      };

      const result = await processUserTurn(stateWithUserMessage);
      
      expect(result.messages).toBeDefined();
      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages!.length).toBe(1);
      
      const response = result.messages![0];
      expect(response.role).toBe('assistant');
      expect(response.content).toBeTruthy();
      expect(response.content.length).toBeGreaterThan(0);
      expect(response.stage_at_creation).toBe('brainstorm');
      expect(result.is_processing).toBe(false);
      expect(result.last_user_action).toBe('chat');
    });

    it('should not process when already processing', async () => {
      console.log('🧪 Testing processing state handling');
      
      const processingState = {
        ...initialState,
        messages: [userMessage],
        is_processing: true
      };

      const result = await processUserTurn(processingState);
      
      // Should return empty update when already processing
      expect(Object.keys(result).length).toBe(0);
    });

    it('should not process assistant messages', async () => {
      console.log('🧪 Testing assistant message skipping');
      
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: 'I am an assistant message',
        created_at: new Date(),
        stage_at_creation: 'brainstorm'
      };

      const stateWithAssistantMessage = {
        ...initialState,
        messages: [assistantMessage]
      };

      const result = await processUserTurn(stateWithAssistantMessage);
      
      expect(result.is_processing).toBe(false);
      expect(result.messages).toBeUndefined();
    });
  });

  describe('GPT-4 Integration and Real-World Behavior', () => {
    it('should generate GPT-4 powered brainstorm responses', async () => {
      console.log('🧪 Testing GPT-4 brainstorm responses');
      
      const brainstormState = {
        ...initialState,
        current_stage: 'brainstorm' as const,
        messages: [userMessage]
      };

      const result = await processUserTurn(brainstormState);
      
      expect(result.messages).toBeDefined();
      const response = result.messages![0];
      
      // Test actual GPT-4 response characteristics
      expect(response.content).toMatch(/Yoda Says:/i);
      expect(response.content).toContain('?'); // Should ask questions
      expect(response.content).toContain('📊 Progress:'); // Should show progress
      expect(response.content.length).toBeGreaterThan(100); // Should be substantial
      
      // Should update checklist state
      expect(result.checklist_state).toBeDefined();
      expect(result.checklist_state!.config.items.length).toBeGreaterThan(0);
    }, 15000); // Increased timeout for real API calls

    it('should handle different stages with appropriate metadata', async () => {
      console.log('🧪 Testing stage metadata handling');
      
      const summaryState = {
        ...initialState,
        current_stage: 'summary' as const,
        messages: [userMessage]
      };

      const result = await processUserTurn(summaryState);
      
      expect(result.messages).toBeDefined();
      const response = result.messages![0];
      
      // Should still generate Yoda responses with proper stage metadata
      expect(response.content).toMatch(/Yoda Says:/i);
      expect(response.stage_at_creation).toBe('summary');
      expect(response.content).toContain('📊 Progress:');
    }, 15000);

    it('should maintain checklist functionality across stages', async () => {
      console.log('🧪 Testing checklist functionality across stages');
      
      const prdState = {
        ...initialState,
        current_stage: 'prd' as const,
        messages: [userMessage]
      };

      const result = await processUserTurn(prdState);
      
      expect(result.messages).toBeDefined();
      const response = result.messages![0];
      
      // Should maintain checklist-based questioning regardless of stage
      expect(response.content).toMatch(/Yoda Says:/i);
      expect(response.stage_at_creation).toBe('prd');
      expect(result.checklist_state).toBeDefined();
      expect(result.checklist_state!.config.items.length).toBeGreaterThan(0);
    }, 15000);
  });

  describe('Checklist Progress and Context Awareness', () => {
    it('should track checklist progress with detailed user input', async () => {
      console.log('🧪 Testing checklist progress tracking');
      
      const detailedMessage: ChatMessage = {
        role: 'user',
        content: 'My app helps busy professionals track their daily tasks and prioritize them based on urgency and importance. The target users are office workers aged 25-45 who struggle with time management and have tried other productivity apps but found them too complex.',
        created_at: new Date(),
        stage_at_creation: 'brainstorm'
      };

      const stateWithDetailedMessage = {
        ...initialState,
        messages: [detailedMessage]
      };

      const result = await processUserTurn(stateWithDetailedMessage);
      
      expect(result.checklist_state).toBeDefined();
      const checklist = result.checklist_state!;
      
      // Should have analyzed the detailed response and potentially completed some items
      expect(checklist.config.items.length).toBe(10); // DEFAULT_BRAINSTORM_CHECKLIST
      expect(checklist.progress).toBeGreaterThanOrEqual(0);
      expect(checklist.active_items.length).toBeGreaterThan(0);
      
      // GPT-4 should have identified some addressed criteria
      expect(Array.isArray(checklist.completed_items)).toBe(true);
      expect(Array.isArray(checklist.partial_items)).toBe(true);
      
      // Progress should be reflected in response
      const response = result.messages![0];
      expect(response.content).toMatch(/📊 Progress: \d+% complete/);
    }, 15000);

    it('should generate contextually relevant follow-up questions', async () => {
      console.log('🧪 Testing contextual question generation');
      
      const contextMessage: ChatMessage = {
        role: 'user',
        content: 'I want to create a task management app',
        created_at: new Date(),
        stage_at_creation: 'brainstorm'
      };

      const stateWithContext = {
        ...initialState,
        messages: [contextMessage]
      };

      const result = await processUserTurn(stateWithContext);
      
      expect(result.messages).toBeDefined();
      const response = result.messages![0];
      
      // Should ask relevant questions based on the context
      expect(response.content).toMatch(/Yoda Says:/i);
      expect(response.content).toContain('?');
      
      // Should be asking about foundational aspects for a task management app
      const content = response.content.toLowerCase();
      const relevantTerms = ['problem', 'users', 'target', 'pain', 'solution', 'challenge'];
      const hasRelevantTerm = relevantTerms.some(term => content.includes(term));
      expect(hasRelevantTerm).toBe(true);
    }, 15000);
  });

  describe('Error Handling', () => {
    it('should handle invalid state gracefully', async () => {
      console.log('🧪 Testing error handling with invalid state');
      
      const invalidState = {
        ...initialState,
        idea_id: '', // Invalid idea_id
        messages: [userMessage]
      };

      const result = await processUserTurn(invalidState);
      
      expect(result.error).toBeDefined();
      expect(result.is_processing).toBe(false);
    });

    it('should clear previous errors on successful processing', async () => {
      console.log('🧪 Testing error clearing');
      
      const stateWithError = {
        ...initialState,
        messages: [userMessage],
        error: 'Previous error'
      };

      const result = await processUserTurn(stateWithError);
      
      expect(result.error).toBeUndefined();
      expect(result.messages).toBeDefined();
    });
  });

  describe('Message Timestamps and Metadata', () => {
    it('should set correct timestamps and metadata', async () => {
      console.log('🧪 Testing message metadata');
      
      const beforeTime = new Date();
      
      const stateWithUserMessage = {
        ...initialState,
        messages: [userMessage]
      };

      const result = await processUserTurn(stateWithUserMessage);
      
      const afterTime = new Date();
      
      expect(result.messages).toBeDefined();
      const response = result.messages![0];
      
      expect(response.created_at).toBeInstanceOf(Date);
      expect(response.created_at!.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(response.created_at!.getTime()).toBeLessThanOrEqual(afterTime.getTime());
      expect(response.stage_at_creation).toBe('brainstorm');
    });
  });

  describe('State Updates', () => {
    it('should include updated_at in state updates', async () => {
      console.log('🧪 Testing updated_at in state updates');
      
      const stateWithUserMessage = {
        ...initialState,
        messages: [userMessage]
      };

      const result = await processUserTurn(stateWithUserMessage);
      
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should maintain last_user_action as chat', async () => {
      console.log('🧪 Testing last_user_action maintenance');
      
      const stateWithUserMessage = {
        ...initialState,
        messages: [userMessage],
        last_user_action: 'Brainstorm Done' as const
      };

      const result = await processUserTurn(stateWithUserMessage);
      
      expect(result.last_user_action).toBe('chat');
    });
  });
}); 