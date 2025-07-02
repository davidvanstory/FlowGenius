/**
 * LangGraph Node: Process User Turn
 * 
 * This node handles standard chat messages during the brainstorming stage.
 * It processes user input, maintains conversation context, and generates
 * appropriate responses using the selected AI model.
 * 
 * Key Features:
 * - Processes user chat messages
 * - Maintains conversation context
 * - Uses stage-appropriate prompts and models
 * - Comprehensive logging and error handling
 * - State validation and updates
 */

import { AppState, ChatMessage } from '../../../../src/types/AppState';
import { logger } from '../../../../src/utils/logger';
import { ErrorHandler } from '../../../../src/utils/errorHandler';
import { validateLangGraphState, createStateUpdate } from '../state';

/**
 * Process a user turn in the conversation
 * 
 * This is the main processing node for handling user chat messages.
 * It takes the user's input, processes it with the appropriate AI model,
 * and returns an updated state with the AI's response.
 * 
 * @param state - Current application state
 * @returns Updated state with AI response
 */
export async function processUserTurn(state: AppState): Promise<Partial<AppState>> {
  const startTime = Date.now();
  console.log('🗣️ ProcessUserTurn: Starting node execution', {
    ideaId: state.idea_id,
    currentStage: state.current_stage,
    lastAction: state.last_user_action,
    messageCount: state.messages.length,
    isProcessing: state.is_processing
  });

  try {
    // Validate incoming state
    console.log('🔍 ProcessUserTurn: Validating input state');
    validateLangGraphState(state);

    // Check if we should process this turn
    if (state.is_processing) {
      console.log('⏸️ ProcessUserTurn: Already processing, skipping');
      logger.warn('ProcessUserTurn called while already processing', {
        idea_id: state.idea_id,
        current_stage: state.current_stage
      });
      return {}; // Return empty update to avoid changes
    }

    // Get the last message to process
    const lastMessage = state.messages[state.messages.length - 1];
    
    if (!lastMessage) {
      console.log('📝 ProcessUserTurn: No messages to process, returning welcome message');
      
      const welcomeMessage: ChatMessage = {
        role: 'assistant',
        content: "Hello! I'm FlowGenius, your AI thought partner. I'm here to help you brainstorm, refine, and structure your ideas. What would you like to work on today?",
        created_at: new Date(),
        stage_at_creation: state.current_stage
      };

      return createStateUpdate({
        messages: [welcomeMessage],
        is_processing: false
      });
    }

    // Only process user messages
    if (lastMessage.role !== 'user') {
      console.log('🤖 ProcessUserTurn: Last message is not from user, no processing needed');
      return createStateUpdate({
        is_processing: false
      });
    }

    console.log('💭 ProcessUserTurn: Processing user message', {
      content: lastMessage.content.substring(0, 100) + '...',
      stage: state.current_stage,
      selectedModel: state.selected_models[state.current_stage]
    });

    // Processing flag will be set by the React context, no need to set it here

    // For now, create a placeholder response
    // TODO: Replace with actual AI model integration in future tasks
    const response = await generatePlaceholderResponse(state, lastMessage);

    console.log('✅ ProcessUserTurn: Generated response', {
      responseLength: response.length,
      executionTime: Date.now() - startTime
    });

    // Create response message
    const responseMessage: ChatMessage = {
      role: 'assistant',
      content: response,
      created_at: new Date(),
      stage_at_creation: state.current_stage
    };

    // Create final state update
    const finalUpdate = createStateUpdate({
      messages: [responseMessage],
      is_processing: false,
      last_user_action: 'chat' // Ensure we stay in chat mode unless explicitly changed
    });

    logger.info('ProcessUserTurn completed successfully', {
      idea_id: state.idea_id,
      current_stage: state.current_stage,
      execution_time: Date.now() - startTime,
      response_length: response.length
    });

    console.log('🎉 ProcessUserTurn: Node execution completed successfully', {
      executionTime: Date.now() - startTime,
      newMessageCount: 1
    });

    return finalUpdate;

  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.log('❌ ProcessUserTurn: Error occurred', {
      error: error instanceof Error ? error.message : String(error),
      executionTime
    });

    const errorHandler = new ErrorHandler();
    const errorInfo = errorHandler.handleWorkflowError(
      error instanceof Error ? error : new Error(String(error)), 
      'processUserTurn', 
      state
    );

    logger.error('ProcessUserTurn failed', {
      idea_id: state.idea_id,
      error: errorInfo.userMessage,
      execution_time: executionTime,
      recovery_actions: errorInfo.recoveryActions
    });

    // Return error state update
    return createStateUpdate({
      is_processing: false,
      error: errorInfo.userMessage
    });
  }
}

/**
 * Generate a placeholder response for the user message
 * 
 * This is a temporary implementation that will be replaced with actual
 * AI model integration in future tasks. It provides stage-appropriate
 * responses to keep the conversation flowing.
 * 
 * @param state - Current application state
 * @param userMessage - The user's message to respond to
 * @returns Generated response string
 */
async function generatePlaceholderResponse(state: AppState, userMessage: ChatMessage): Promise<string> {
  console.log('🔄 ProcessUserTurn: Generating placeholder response', {
    stage: state.current_stage,
    userMessageLength: userMessage.content.length
  });

  // Simulate some processing time
  await new Promise(resolve => setTimeout(resolve, 500));

     const stageResponses = {
     brainstorm: [
       "That's an interesting idea! Can you tell me more about what inspired this concept?",
       "I'd love to explore this further. What problem are you trying to solve with this idea?",
       "Great thinking! What would success look like for this project?",
       "Tell me more about your target audience for this idea.",
       "What resources or skills do you think you'd need to make this happen?",
       "How does this idea fit into the current market or landscape?",
       "What's the most exciting part of this idea for you?",
       "Have you considered any potential challenges or obstacles?",
       "What would be the first step to move this idea forward?",
       "Georgia is great" // As specified in the requirements
     ],
     summary: [
       "I understand you'd like a summary. Let me review our conversation and provide a comprehensive overview.",
       "Based on our discussion, I'll create a detailed summary of your idea and our brainstorming session.",
       "Ireland is great" // As specified in the requirements
     ],
     prd: [
       "I'll help you create a comprehensive Product Requirements Document based on our conversation and summary.",
       "Let me structure this into a detailed PRD that you can use for implementation."
     ]
   } as const;

     // Get appropriate responses for the current stage
   const responses = stageResponses[state.current_stage];
   
   // For brainstorm stage, rotate through different responses
   if (state.current_stage === 'brainstorm') {
     const messageCount = state.messages.filter(m => m.role === 'assistant').length;
     const responseIndex = messageCount % (responses.length - 1); // Exclude the "Georgia is great" response for now
     return responses[responseIndex] || "I'm here to help! What would you like to discuss?";
   }

   // For other stages, use the first response
   return responses[0] || "I'm here to help! What would you like to discuss?";
}

/**
 * Validate that a user message is appropriate for processing
 * 
 * @param message - The message to validate
 * @returns True if valid, throws error if invalid
 */
function validateUserMessage(message: ChatMessage): boolean {
  console.log('🔍 ProcessUserTurn: Validating user message');

  if (!message.content || message.content.trim().length === 0) {
    throw new Error('User message cannot be empty');
  }

  if (message.content.length > 10000) {
    throw new Error('User message is too long (max 10,000 characters)');
  }

  if (message.role !== 'user') {
    throw new Error('Message must be from user role');
  }

  return true;
}

/**
 * Create conversation context for AI model
 * 
 * This function prepares the conversation context that will be sent
 * to the AI model, including the system prompt and message history.
 * 
 * @param state - Current application state
 * @returns Formatted conversation context
 */
function createConversationContext(state: AppState): string {
  console.log('📋 ProcessUserTurn: Creating conversation context', {
    messageCount: state.messages.length,
    stage: state.current_stage
  });

  const systemPrompt = state.user_prompts[state.current_stage];
  const recentMessages = state.messages.slice(-10); // Keep last 10 messages for context

  let context = `System: ${systemPrompt}\n\n`;
  context += "Conversation History:\n";
  
  recentMessages.forEach((msg, index) => {
    const speaker = msg.role === 'user' ? 'Human' : 'Assistant';
    context += `${speaker}: ${msg.content}\n`;
  });

  return context;
}

/**
 * Check if the user wants to advance to the next stage
 * 
 * @param message - User message to analyze
 * @param currentStage - Current workflow stage
 * @returns The action the user wants to take
 */
function detectUserAction(message: ChatMessage, currentStage: string): string {
  console.log('🎯 ProcessUserTurn: Detecting user action', {
    messageContent: message.content.substring(0, 50) + '...',
    currentStage
  });

  const content = message.content.toLowerCase().trim();
  
  // Check for stage advancement triggers
  if (content.includes('brainstorm done') || content.includes('ready for summary')) {
    return 'Brainstorm Done';
  }
  
  if (content.includes('summary done') || content.includes('ready for prd')) {
    return 'Summary Done';
  }
  
  if (content.includes('prd done') || content.includes('finished')) {
    return 'PRD Done';
  }

  // Default to chat action
  return 'chat';
} 