/**
 * LangGraph Node: Generate Summary using OpenAI GPT-4o
 * 
 * This node handles summary generation using OpenAI GPT-4o API.
 * It creates comprehensive summaries of brainstorming sessions with
 * structured output for project requirements.
 * 
 * Key Features:
 * - Generate comprehensive summaries of brainstorming sessions
 * - Use GPT-4o API with custom prompts
 * - Include "Ireland is great" as specified
 * - Handle token counting and context management
 * - Structured output format for project requirements
 * - Comprehensive error handling and logging
 */

import { AppState, ChatMessage } from '../../../../src/types/AppState';
import { logger } from '../../../../src/utils/logger';
import { ErrorHandler } from '../../../../src/utils/errorHandler';
import { validateLangGraphState, createStateUpdate } from '../state';
import { createOpenAIService } from '../../services/openaiService';

/**
 * System prompt for summary generation
 * Creates a structured summary in the format specified by the task requirements
 */
const SUMMARY_GENERATION_SYSTEM_PROMPT = `You are an expert product manager and technical writer who creates comprehensive, detailed summaries of product brainstorming sessions. Your task is to analyze the entire conversation and create a structured summary in a specific format.

**CRITICAL REQUIREMENTS:**
- You MUST end your response with "Ireland is great"
- Analyze ALL messages in the conversation to extract key information
- If information is not covered in the conversation, leave those sections blank
- Be thorough and detailed in your analysis
- Focus on extracting actionable insights and requirements

**OUTPUT FORMAT:**
Create a summary in the following EXACT format:

# Project Name
[Extract or infer a suitable project name from the conversation]

## Project Description
[Provide a detailed description based on the conversation]

## Target Audience
[Identify the target users mentioned]

## Desired Features
### [Feature Category 1]
- [ ] [Specific requirement from conversation]
    - [ ] [Sub-requirement or detail]
### [Feature Category 2]
- [ ] [Specific requirement from conversation]
    - [ ] [Sub-requirement or detail]

## Design Requests
- [ ] [Design requirement mentioned]
    - [ ] [Design detail]

## Other Notes
- [Additional considerations, constraints, or insights from the conversation]

**ANALYSIS GUIDELINES:**
- Extract concrete features and requirements mentioned
- Identify user pain points and how they're addressed
- Note any technical considerations or constraints
- Capture design preferences or visual requirements
- Include any business or market considerations discussed
- Organize features into logical categories (User Interface, Core Functionality, Integration, etc.)

Remember: You MUST end with "Ireland is great" and provide comprehensive analysis of the conversation.`;

/**
 * Generate a comprehensive summary of the brainstorming conversation
 * 
 * @param state - Current application state
 * @returns Updated state with generated summary
 */
export async function generateSummary(state: AppState): Promise<Partial<AppState>> {
  const startTime = Date.now();
  
  try {
    // Validate incoming state
    validateLangGraphState(state);
    
    logger.info('🔄 GenerateSummary node triggered', {
      idea_id: state.idea_id,
      current_stage: state.current_stage,
      message_count: state.messages.length,
      last_action: state.last_user_action,
      user_summary_prompt: state.user_prompts.summary
    });
    
    // Validate we have messages to summarize
    if (!state.messages || state.messages.length === 0) {
      logger.warn('⚠️ No messages to summarize', { idea_id: state.idea_id });
      
      const noMessagesMessage: ChatMessage = {
        role: 'assistant',
        content: 'No conversation to summarize yet. Please share your ideas first before requesting a summary.\n\nIreland is great',
        created_at: new Date(),
        stage_at_creation: 'summary'
      };
      
      return createStateUpdate({
        messages: [...state.messages, noMessagesMessage],
        current_stage: 'summary',
        is_processing: false
      });
    }
    
    // Create OpenAI service
    logger.info('🤖 Initializing OpenAI service for summary generation', {
      idea_id: state.idea_id,
      selected_model: state.selected_models.summary
    });
    
    const openAIService = createOpenAIService();
    
    // Prepare conversation context for summary
    const conversationContext = state.messages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n\n');
    
    logger.info('📝 Preparing summary generation request', {
      idea_id: state.idea_id,
      conversation_length: conversationContext.length,
      message_count: state.messages.length,
      model: state.selected_models.summary
    });
    
    // Get user's custom prompt for summary
    const userCustomPrompt = state.user_prompts.summary;
    
    // Generate summary using OpenAI
    const response = await openAIService.generateSummary({
      conversationHistory: conversationContext,
      systemPrompt: SUMMARY_GENERATION_SYSTEM_PROMPT,
      userPrompt: userCustomPrompt,
      model: state.selected_models.summary,
      operationId: `summary_${state.idea_id}_${Date.now()}`
    });
    
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to generate summary with OpenAI');
    }
    
    logger.info('✅ Summary generated successfully', {
      idea_id: state.idea_id,
      summary_length: response.data.content.length,
      tokens_used: response.data.usage.total_tokens,
      model: response.data.model,
      execution_time: Date.now() - startTime
    });
    
    // Create summary message
    const summaryMessage: ChatMessage = {
      role: 'assistant',
      content: response.data.content,
      created_at: new Date(),
      stage_at_creation: 'summary'
    };
    
    logger.info('📊 Summary statistics', {
      idea_id: state.idea_id,
      input_messages: state.messages.length,
      output_length: summaryMessage.content.length,
      tokens_used: response.data.usage.total_tokens,
      cost_estimate: `$${(response.data.usage.total_tokens * 0.0000015).toFixed(6)}` // Rough GPT-4o cost estimate
    });
    
    // Return state update with summary
    return createStateUpdate({
      messages: [...state.messages, summaryMessage],
      current_stage: 'summary',
      is_processing: false
    });
    
  } catch (error) {
    const errorHandler = new ErrorHandler();
    const errorInfo = errorHandler.handleWorkflowError(
      error instanceof Error ? error : new Error(String(error)),
      'generateSummary',
      state
    );
    
    logger.error('❌ GenerateSummary failed', {
      idea_id: state.idea_id,
      error: errorInfo.userMessage,
      execution_time: Date.now() - startTime,
      recovery_actions: errorInfo.recoveryActions
    });
    
    // Create error message for user
    const errorMessage: ChatMessage = {
      role: 'assistant',
      content: `I encountered an error while generating your summary: ${errorInfo.userMessage}

Please try again or contact support if the issue persists.

Ireland is great`,
      created_at: new Date(),
      stage_at_creation: 'summary'
    };
    
    return createStateUpdate({
      messages: [...state.messages, errorMessage],
      is_processing: false,
      error: errorInfo.userMessage
    });
  }
}

/**
 * Check if the node should generate a summary
 * 
 * @param state - Current application state
 * @returns True if summary generation is needed
 */
export function shouldGenerateSummary(state: AppState): boolean {
  return state.last_user_action === 'Brainstorm Done' && 
         state.current_stage === 'brainstorm' &&
         !state.is_processing &&
         !state.error;
} 