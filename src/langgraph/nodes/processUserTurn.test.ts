/**
 * Unit Tests for ProcessUserTurn Node
 * 
 * Tests the processUserTurn LangGraph node to ensure it properly
 * handles user messages and generates appropriate responses.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processUserTurn } from './processUserTurn';
import { AppState, ChatMessage } from '../../types/AppState';
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

  describe('Stage-Specific Responses', () => {
    it('should generate brainstorm-appropriate responses', async () => {
      console.log('🧪 Testing brainstorm stage responses');
      
      const brainstormState = {
        ...initialState,
        current_stage: 'brainstorm' as const,
        messages: [userMessage]
      };

      const result = await processUserTurn(brainstormState);
      
      expect(result.messages).toBeDefined();
      const response = result.messages![0];
      
      // Should be one of the brainstorm responses
      const brainstormPhrases = [
        'interesting idea',
        'tell me more',
        'explore this further',
        'what problem',
        'success look like',
        'target audience',
        'resources',
        'market',
        'exciting part',
        'challenges',
        'first step'
      ];

      const hasExpectedPhrase = brainstormPhrases.some(phrase => 
        response.content.toLowerCase().includes(phrase)
      );
      
      expect(hasExpectedPhrase).toBe(true);
    });

    it('should handle summary stage', async () => {
      console.log('🧪 Testing summary stage responses');
      
      const summaryState = {
        ...initialState,
        current_stage: 'summary' as const,
        messages: [userMessage]
      };

      const result = await processUserTurn(summaryState);
      
      expect(result.messages).toBeDefined();
      const response = result.messages![0];
      
      expect(response.content.toLowerCase()).toContain('summary');
    });

    it('should handle PRD stage', async () => {
      console.log('🧪 Testing PRD stage responses');
      
      const prdState = {
        ...initialState,
        current_stage: 'prd' as const,
        messages: [userMessage]
      };

      const result = await processUserTurn(prdState);
      
      expect(result.messages).toBeDefined();
      const response = result.messages![0];
      
      expect(response.content.toLowerCase()).toContain('product requirements document');
    });
  });

  describe('Response Rotation', () => {
    it('should rotate through different brainstorm responses', async () => {
      console.log('🧪 Testing response rotation');
      
      const responses = new Set<string>();
      
      for (let i = 0; i < 5; i++) {
        const stateWithMessages = {
          ...initialState,
          messages: [
            userMessage,
            // Add some assistant messages to increase the count
            ...Array(i).fill(null).map(() => ({
              role: 'assistant' as const,
              content: `Response ${i}`,
              created_at: new Date(),
              stage_at_creation: 'brainstorm' as const
            })),
            userMessage // Add another user message to process
          ]
        };

        const result = await processUserTurn(stateWithMessages);
        
        if (result.messages && result.messages.length > 0) {
          responses.add(result.messages[0].content);
        }
      }
      
      // Should have generated different responses
      expect(responses.size).toBeGreaterThan(1);
    });
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