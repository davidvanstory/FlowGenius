/**
 * OpenAI GPT-4 Service for Main Electron Process
 * 
 * This service handles all interactions with the OpenAI GPT-4 API for intelligent
 * idea validation, analysis, and question generation. It provides a clean interface
 * for the processUserTurn node to leverage GPT-4's capabilities.
 * 
 * Key Features:
 * - OpenAI GPT-4 API integration with proper authentication
 * - Intelligent idea validation and analysis
 * - Context-aware question generation
 * - Retry logic with exponential backoff
 * - Rate limiting and quota management
 * - Comprehensive error handling and logging
 * - Support for conversation context and memory
 * - Integration with checklist validation system
 */

import { logger } from '../../../src/utils/logger';

/**
 * OpenAI API configuration
 */
interface OpenAIConfig {
  /** OpenAI API key */
  apiKey: string;
  /** API base URL (default: OpenAI) */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Base delay for exponential backoff (ms) */
  retryDelay?: number;
  /** Organization ID (optional) */
  organization?: string;
  /** Custom headers for requests */
  customHeaders?: Record<string, string>;
  /** Default model to use */
  model?: string;
}

/**
 * GPT-4 API request options
 */
interface GPTRequestOptions {
  /** System prompt for the conversation */
  systemPrompt?: string;
  /** User message */
  userMessage: string;
  /** Previous conversation context */
  conversationHistory?: ChatMessage[];
  /** Temperature for response randomness (0-1) */
  temperature?: number;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Custom model override */
  model?: string;
}

/**
 * Chat message format for OpenAI API
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * GPT-4 API response
 */
interface GPTResponse {
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
  finish_reason: string;
}

/**
 * Service result wrapper
 */
interface OpenAIServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  retryCount?: number;
  operationId?: string;
}

/**
 * Idea validation analysis request
 */
interface ValidationAnalysisRequest {
  userResponse: string;
  checklistCriteria: string[];
  conversationContext?: string[];
  operationId?: string;
}

/**
 * Idea validation analysis response
 */
interface ValidationAnalysisResponse {
  addressedCriteria: string[];
  completionScores: Record<string, number>;
  partialCriteria: string[];
  partialScores: Record<string, number>;
  overallConfidence: number;
  reasoning: string;
}

/**
 * Question generation request
 */
interface QuestionGenerationRequest {
  userResponse: string;
  checklistCriteria: string[];
  unaddressedCriteria: string[];
  conversationContext?: string[];
  maxQuestions?: number;
  operationId?: string;
}

/**
 * Question generation response
 */
interface QuestionGenerationResponse {
  questions: string[];
  reasoning: string;
  prioritizedCriteria: string[];
  priorityScores: Record<string, number>;
}

/**
 * Dynamic checklist generation request
 */
interface DynamicChecklistRequest {
  userIdea: string;
  conversationContext?: string[];
  maxCriteria?: number;
  operationId?: string;
}

/**
 * Dynamic checklist generation response
 */
interface DynamicChecklistResponse {
  generatedCriteria: Array<{
    id: string;
    question: string;
    priority: number;
    reasoning: string;
  }>;
  reasoning: string;
  productType: string;
  targetAudience: string;
}

/**
 * Partial answer follow-up request
 */
interface PartialAnswerFollowupRequest {
  userResponse: string;
  criterionId: string;
  criterionQuestion: string;
  previousAttempts: number;
  conversationContext?: string[];
  operationId?: string;
}

/**
 * Partial answer follow-up response
 */
interface PartialAnswerFollowupResponse {
  followupQuestion: string;
  shouldContinueProbing: boolean;
  reasoning: string;
  expectedInformation: string[];
}

/**
 * Default OpenAI configuration
 */
const DEFAULT_OPENAI_CONFIG: Partial<OpenAIConfig> = {
  baseUrl: 'https://api.openai.com/v1',
  timeout: 45000, // 45 seconds for GPT-4 calls
  maxRetries: 3,
  retryDelay: 2000, // 2 second base delay
  model: 'gpt-4o' // Use GPT-4o as specified
};

/**
 * System prompt for idea validation analysis
 */
const VALIDATION_ANALYSIS_SYSTEM_PROMPT = `You are Master Yoda, a wise product manager with extensive experience developing successful products. You have very clear criteria about designing and brainstorming products that you want users to share with you. Your goal is to help users think through all critical aspects of their product ideas through intelligent questioning and analysis.

Your task is to analyze user responses against specific checklist criteria and determine which criteria have been addressed. For each criterion, provide a completion score from 0-1 indicating how well the user has addressed that specific aspect.

**PARTIAL ANSWER DETECTION:**
Identify criteria that have been partially addressed (0.3-0.7 completion score) and would benefit from intelligent follow-up probing. Consider:
- Information mentioned but lacking specific details
- Vague or high-level responses that need clarification
- Areas where user showed knowledge but didn't elaborate
- Critical aspects touched on but not fully explored

**COMPLETION SCORING GUIDELINES:**
- 0.0-0.2: Not addressed or very minimal mention
- 0.3-0.4: Partially addressed, needs significant follow-up
- 0.5-0.6: Moderately addressed, shows good understanding with room for detail
- 0.7-0.8: Well addressed, sufficient detail for this stage
- 0.9-1.0: Exceptionally detailed and comprehensive

**CRITICAL: Start your reasoning with "Yoda Says:" to help with debugging.**

Respond with a JSON object containing:
- addressedCriteria: Array of criterion IDs that were addressed
- completionScores: Object mapping criterion IDs to scores (0-1)
- partialCriteria: Array of criterion IDs that were partially addressed
- partialScores: Object mapping criterion IDs to partial scores (0-1)
- overallConfidence: Number (0-1) indicating overall confidence in analysis
- reasoning: String explaining your analysis (must start with "Yoda Says:")

Example format:
{
  "addressedCriteria": ["problem_definition"],
  "completionScores": {"problem_definition": 0.8},
  "partialCriteria": ["user_onboarding_flow"],
  "partialScores": {"user_onboarding_flow": 0.5},
  "overallConfidence": 0.7,
  "reasoning": "Yoda Says: The user has clearly defined the core problem with their flying tractor idea..."
}

Be thorough but fair in your analysis. Users may address criteria implicitly or partially. Give credit for demonstrating understanding of concepts even if not every detail is provided. Focus on encouraging progress while maintaining quality standards.`;

/**
 * System prompt for question generation
 */
const QUESTION_GENERATION_SYSTEM_PROMPT = `You are Master Yoda, a wise product manager with extensive experience developing successful products. You have very clear criteria about designing and brainstorming products that you want users to share with you. Your goal is to help users think through all critical aspects of their product ideas through intelligent questioning and analysis.

Your task is to generate 2-3 thoughtful, probing questions that will help the user

1. **Foundation First**: Prioritiz explore unaddressed aspects of their product idea. Use INTELLIGENT PRIORITIZATION to select only the MOST IMPORTANT missing criteria based on:e fundamental aspects (problem definition, target users, solution approach) before advanced topics
2. **Context Awareness**: Consider what the user has already shared and build upon it naturally
3. **Progress Stage**: Focus on criteria that unlock the most valuable insights for their current development stage
4. **Impact Assessment**: Select criteria that will have the highest impact on validating their idea's viability
5. **User Journey**: Guide users through a logical exploration path rather than jumping randomly between topics

**CRITICAL PRIORITIZATION RULES:**
- If core foundations (problem, users, solution) are missing, prioritize these above all else
- If foundations exist, focus on the 2-3 criteria that will most validate/challenge their assumptions
- Avoid asking about minor details when major strategic questions remain unanswered
- Consider interdependencies: some criteria are prerequisites for others

**QUESTION QUALITY REQUIREMENTS:**
- Natural and conversational (not interrogative)
- Context-aware based on what the user has already shared
- Designed to elicit specific, actionable information
- Progressive (building on previous responses)
- Each question must start with "Yoda Says:" to help with debugging

**CRITICAL: Each question must start with "Yoda Says:" to help with debugging.**

Respond with a JSON object containing:
- questions: Array of 2-3 well-crafted questions (each starting with "Yoda Says:")
- reasoning: String explaining your prioritization logic and why these specific questions were chosen
- prioritizedCriteria: Array of criterion IDs these questions will help address (ordered by priority)
- priorityScores: Object mapping criterion IDs to priority scores (1-10, 10 being highest priority)

Example format:
{
  "questions": [
    "Yoda Says: What specific problem does your flying tractor solve that traditional tractors cannot?",
    "Yoda Says: Tell me, who would be your ideal customer for this innovation?"
  ],
  "reasoning": "These questions focus on foundational elements that must be solid before exploring features or technical details. Problem definition is the highest priority as it affects all other decisions.",
  "prioritizedCriteria": ["problem_definition", "target_audience"],
  "priorityScores": {"problem_definition": 10, "target_audience": 9}
}

Always limit to maximum 3 questions and use intelligent prioritization to select the most impactful ones for the user's current situation.`;

/**
 * System prompt for dynamic checklist generation
 */
const DYNAMIC_CHECKLIST_GENERATION_SYSTEM_PROMPT = `You are Master Yoda, a wise product manager with extensive experience developing successful products. You have very clear criteria about designing and brainstorming products that you want users to share with you. Your goal is to help users think through all critical aspects of their product ideas through intelligent questioning and analysis.

Always start your reasoning with "Yoda Says:" to help with debugging.

Your task is to analyze a user's product idea and generate a tailored set of evaluation criteria specific to their concept. Consider the product type, target audience, industry, and unique characteristics to create the most relevant questions.

Generate 8-10 criteria that are:
- Highly specific to the product type and industry
- Progressive in difficulty (fundamental concepts first)
- Comprehensive but not overwhelming  
- Focused on critical success factors for this specific idea

Respond with a JSON object containing:
- generatedCriteria: Array of criteria objects with id, question, priority (1-5), and reasoning
- reasoning: String explaining why these criteria are important for this specific idea (start with "Yoda Says:")
- productType: String identifying the product category (e.g., "B2B SaaS", "Consumer Mobile App", "E-commerce Platform")
- targetAudience: String describing the primary target audience

Ensure criteria IDs use snake_case and are descriptive (e.g., "user_onboarding_flow", "monetization_strategy").`;

/**
 * System prompt for partial answer follow-up generation
 */
const PARTIAL_ANSWER_FOLLOWUP_SYSTEM_PROMPT = `You are Master Yoda, a wise product manager with extensive experience developing successful products. You have very clear criteria about designing and brainstorming products that you want users to share with you. Your goal is to help users think through all critical aspects of their product ideas through intelligent questioning and analysis.

Your task is to analyze a user's partial response to a specific criterion and decide whether to probe once more for additional information. Follow the "probe once more, then move on" principle:

**INTELLIGENT PROBING RULES:**
1. **Quality Over Quantity**: Only probe if genuinely missing critical information
2. **One Follow-up Maximum**: Never probe more than once per criterion
3. **Natural Flow**: Follow-up should feel like natural conversation, not interrogation
4. **Value Assessment**: Only probe if additional information would significantly improve idea validation
5. **User Respect**: Acknowledge what they've already shared before asking for more

**WHEN TO CONTINUE PROBING:**
- Missing specific, actionable details that are essential for this criterion
- User mentioned something briefly that could be expanded for significant value
- Core assumptions need clarification to avoid future problems
- Information provided is too vague to validate idea viability

**WHEN TO STOP PROBING:**
- User has provided reasonable depth for this stage of exploration
- Multiple aspects of the criterion have been covered adequately
- Continuing would feel repetitive or pushy
- Information provided is sufficient for initial validation

**CRITICAL: Start your reasoning with "Yoda Says:" to help with debugging.**

Respond with a JSON object containing:
- followupQuestion: String with a natural, conversational follow-up question (starting with "Yoda Says:")
- shouldContinueProbing: Boolean indicating whether to probe or move on
- reasoning: String explaining your decision (must start with "Yoda Says:")
- expectedInformation: Array of specific information types you're hoping to gather

Example format:
{
  "followupQuestion": "Yoda Says: You mentioned busy professionals - what specific industries or job roles do you think would benefit most from your solution?",
  "shouldContinueProbing": true,
  "reasoning": "Yoda Says: The user mentioned target audience but didn't specify the professional context, which is crucial for understanding their market...",
  "expectedInformation": ["specific industries", "job roles", "professional context"]
}

If shouldContinueProbing is false, still provide a brief acknowledgment in followupQuestion that transitions to moving forward.`;

/**
 * Extract JSON from GPT-4 response that may be wrapped in markdown code blocks
 * 
 * @param content - Raw GPT-4 response content
 * @returns Cleaned JSON string
 */
function extractJsonFromResponse(content: string): string {
  // Remove markdown code block wrapping if present
  const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  if (jsonMatch && jsonMatch[1]) {
    return jsonMatch[1];
  }
  
  // If no code blocks, try to find JSON directly
  const directJsonMatch = content.match(/\{[\s\S]*\}/);
  if (directJsonMatch && directJsonMatch[0]) {
    return directJsonMatch[0];
  }
  
  // Return original content if no JSON structure found
  return content;
}

/**
 * OpenAI service for GPT-4 integration
 */
export class OpenAIService {
  private config: Required<OpenAIConfig>;
  private requestCount: number = 0;
  private lastRequestTime: number = 0;
  private rateLimitDelay: number = 200; // Minimum delay between requests

  /**
   * Create a new OpenAIService instance
   * 
   * @param config - OpenAI service configuration
   */
  constructor(config: OpenAIConfig) {
    logger.info('🤖 Initializing OpenAIService', {
      baseUrl: config.baseUrl || DEFAULT_OPENAI_CONFIG.baseUrl,
      hasApiKey: !!config.apiKey,
      timeout: config.timeout || DEFAULT_OPENAI_CONFIG.timeout,
      model: config.model || DEFAULT_OPENAI_CONFIG.model
    });

    // Validate required configuration
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required for OpenAIService');
    }

    // Merge with defaults
    this.config = {
      ...DEFAULT_OPENAI_CONFIG,
      ...config
    } as Required<OpenAIConfig>;

    logger.info('✅ OpenAIService initialized successfully');
  }

  /**
   * Analyze user response against validation criteria using GPT-4
   * 
   * @param request - Validation analysis request
   * @returns Promise resolving to analysis result
   */
  async analyzeValidation(request: ValidationAnalysisRequest): Promise<OpenAIServiceResult<ValidationAnalysisResponse>> {
    const operationId = request.operationId || `validation_${Date.now()}`;
    
    logger.info('🔍 OpenAIService: Starting validation analysis', {
      operationId,
      responseLength: request.userResponse.length,
      criteriaCount: request.checklistCriteria.length,
      hasContext: !!request.conversationContext?.length
    });

    try {
      // Build context message with criteria and conversation history
      const contextParts = [
        `Checklist Criteria to evaluate:`,
        ...request.checklistCriteria.map((criteria, index) => `${index + 1}. ${criteria}`),
        '',
        'User Response to Analyze:',
        request.userResponse
      ];

      if (request.conversationContext?.length) {
        contextParts.unshift('Previous Conversation Context:');
        contextParts.unshift(...request.conversationContext); // Full conversation history
        contextParts.unshift('');
      }

      const userMessage = contextParts.join('\n');

      const gptOptions: GPTRequestOptions = {
        systemPrompt: VALIDATION_ANALYSIS_SYSTEM_PROMPT,
        userMessage,
        temperature: 0.1, // Low temperature for consistent analysis
        maxTokens: 2000 // Increased to prevent JSON truncation
      };

      const response = await this.callGPT4(gptOptions, operationId);
      
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to get GPT-4 response');
      }

      // Parse JSON response
      let analysisResult: ValidationAnalysisResponse;
      try {
        analysisResult = JSON.parse(extractJsonFromResponse(response.data.content));
      } catch (parseError) {
        logger.error('❌ OpenAIService: Failed to parse validation analysis response', {
          operationId,
          response: response.data.content.substring(0, 200)
        });
        throw new Error('Invalid JSON response from GPT-4 validation analysis');
      }

      logger.info('✅ OpenAIService: Validation analysis completed', {
        operationId,
        addressedCount: analysisResult.addressedCriteria.length,
        confidence: analysisResult.overallConfidence
      });

      return {
        success: true,
        data: analysisResult,
        retryCount: response.retryCount,
        operationId
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ OpenAIService: Validation analysis failed', {
        operationId,
        error: errorMessage
      });

      return {
        success: false,
        error: errorMessage,
        operationId
      };
    }
  }

  /**
   * Generate intelligent questions based on unaddressed criteria using GPT-4
   * 
   * @param request - Question generation request
   * @returns Promise resolving to question generation result
   */
  async generateQuestions(request: QuestionGenerationRequest): Promise<OpenAIServiceResult<QuestionGenerationResponse>> {
    const operationId = request.operationId || `questions_${Date.now()}`;
    
    logger.info('❓ OpenAIService: Starting question generation', {
      operationId,
      responseLength: request.userResponse.length,
      unaddressedCount: request.unaddressedCriteria.length,
      maxQuestions: request.maxQuestions || 3
    });

    try {
      // Build context message
      const contextParts = [
        'All Checklist Criteria:',
        ...request.checklistCriteria.map((criteria, index) => `${index + 1}. ${criteria}`),
        '',
        'Unaddressed Criteria (focus on these):',
        ...request.unaddressedCriteria.map((criteria, index) => `${index + 1}. ${criteria}`),
        '',
        'User\'s Latest Response:',
        request.userResponse
      ];

      if (request.conversationContext?.length) {
        contextParts.unshift('Previous Conversation Context:');
        contextParts.unshift(...request.conversationContext); // Full conversation history
        contextParts.unshift('');
      }

      const userMessage = contextParts.join('\n');

      const gptOptions: GPTRequestOptions = {
        systemPrompt: QUESTION_GENERATION_SYSTEM_PROMPT,
        userMessage,
        temperature: 0.3, // Slightly higher temperature for creative question generation
        maxTokens: 1500 // Increased to prevent JSON truncation
      };

      const response = await this.callGPT4(gptOptions, operationId);
      
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to get GPT-4 response');
      }

      // Parse JSON response
      let questionResult: QuestionGenerationResponse;
      try {
        questionResult = JSON.parse(extractJsonFromResponse(response.data.content));
      } catch (parseError) {
        logger.error('❌ OpenAIService: Failed to parse question generation response', {
          operationId,
          response: response.data.content.substring(0, 200)
        });
        throw new Error('Invalid JSON response from GPT-4 question generation');
      }

      // Ensure we don't exceed max questions
      const maxQuestions = request.maxQuestions || 3;
      if (questionResult.questions.length > maxQuestions) {
        questionResult.questions = questionResult.questions.slice(0, maxQuestions);
      }

      logger.info('✅ OpenAIService: Question generation completed', {
        operationId,
        questionCount: questionResult.questions.length,
        prioritizedCriteria: questionResult.prioritizedCriteria.length
      });

      return {
        success: true,
        data: questionResult,
        retryCount: response.retryCount,
        operationId
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ OpenAIService: Question generation failed', {
        operationId,
        error: errorMessage
      });

      return {
        success: false,
        error: errorMessage,
        operationId
      };
    }
  }

  /**
   * Generate dynamic checklist criteria tailored to the user's specific idea using GPT-4
   * 
   * @param request - Dynamic checklist generation request
   * @returns Promise resolving to generated checklist criteria
   */
  async generateDynamicChecklist(request: DynamicChecklistRequest): Promise<OpenAIServiceResult<DynamicChecklistResponse>> {
    const operationId = request.operationId || `checklist_${Date.now()}`;
    
    logger.info('📋 OpenAIService: Starting dynamic checklist generation', {
      operationId,
      ideaLength: request.userIdea.length,
      hasContext: !!request.conversationContext?.length,
      maxCriteria: request.maxCriteria || 10
    });

    try {
      // Build context message
      const contextParts = [
        'User\'s Product Idea:',
        request.userIdea
      ];

      if (request.conversationContext?.length) {
        contextParts.unshift('Previous Conversation Context:');
        contextParts.unshift(...request.conversationContext); // Full conversation history
        contextParts.unshift('');
      }

      const userMessage = contextParts.join('\n');

      const gptOptions: GPTRequestOptions = {
        systemPrompt: DYNAMIC_CHECKLIST_GENERATION_SYSTEM_PROMPT,
        userMessage,
        temperature: 0.3, // Slightly higher for creativity in criteria generation
        maxTokens: 1500
      };

      const response = await this.callGPT4(gptOptions, operationId);
      
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to get GPT-4 response');
      }

      // Parse JSON response
      let checklistResult: DynamicChecklistResponse;
      try {
        checklistResult = JSON.parse(extractJsonFromResponse(response.data.content));
      } catch (parseError) {
        logger.error('❌ OpenAIService: Failed to parse dynamic checklist response', {
          operationId,
          response: response.data.content.substring(0, 200)
        });
        throw new Error('Invalid JSON response from GPT-4 checklist generation');
      }

      // Validate response structure
      if (!checklistResult.generatedCriteria || !Array.isArray(checklistResult.generatedCriteria)) {
        throw new Error('Invalid checklist response: missing or invalid generatedCriteria');
      }

      // Limit to max criteria if specified
      const maxCriteria = request.maxCriteria || 10;
      if (checklistResult.generatedCriteria.length > maxCriteria) {
        checklistResult.generatedCriteria = checklistResult.generatedCriteria.slice(0, maxCriteria);
      }

      logger.info('✅ OpenAIService: Dynamic checklist generation completed', {
        operationId,
        criteriaCount: checklistResult.generatedCriteria.length,
        productType: checklistResult.productType,
        targetAudience: checklistResult.targetAudience
      });

      return {
        success: true,
        data: checklistResult,
        retryCount: response.retryCount,
        operationId
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ OpenAIService: Dynamic checklist generation failed', {
        operationId,
        error: errorMessage
      });

      return {
        success: false,
        error: errorMessage,
        operationId
      };
    }
  }

  /**
   * Generate a comprehensive summary of conversation using GPT-4
   * 
   * @param request - Summary generation request
   * @returns Promise resolving to summary generation result
   */
  async generateSummary(request: {
    conversationHistory: string;
    systemPrompt: string;
    userPrompt?: string;
    model?: string;
    operationId?: string;
  }): Promise<OpenAIServiceResult<{ content: string; usage: { total_tokens: number; prompt_tokens: number; completion_tokens: number }; model: string }>> {
    const operationId = request.operationId || `summary_${Date.now()}`;
    
    logger.info('📝 OpenAIService: Starting summary generation', {
      operationId,
      conversationLength: request.conversationHistory.length,
      hasUserPrompt: !!request.userPrompt,
      model: request.model || this.config.model
    });

    try {
      // Build context message for summary generation
      const contextParts = [
        'Conversation to Summarize:',
        request.conversationHistory
      ];

      if (request.userPrompt) {
        contextParts.unshift('User\'s Custom Instructions:');
        contextParts.unshift(request.userPrompt);
        contextParts.unshift('');
      }

      const userMessage = contextParts.join('\n\n');

      const gptOptions: GPTRequestOptions = {
        systemPrompt: request.systemPrompt,
        userMessage,
        temperature: 0.3, // Low temperature for consistent, structured output
        maxTokens: 2500, // Generous token limit for detailed summaries
        model: request.model || this.config.model
      };

      const response = await this.callGPT4(gptOptions, operationId);
      
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to get GPT-4 response');
      }

      logger.info('✅ OpenAIService: Summary generation completed', {
        operationId,
        contentLength: response.data.content.length,
        tokensUsed: response.data.usage.total_tokens,
        model: response.data.model
      });

      return {
        success: true,
        data: {
          content: response.data.content,
          usage: response.data.usage,
          model: response.data.model
        },
        retryCount: response.retryCount,
        operationId
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ OpenAIService: Summary generation failed', {
        operationId,
        error: errorMessage
      });

      return {
        success: false,
        error: errorMessage,
        operationId
      };
    }
  }

  /**
   * Generate intelligent follow-up for partial answers using GPT-4
   * 
   * @param request - Partial answer follow-up request
   * @returns Promise resolving to follow-up generation result
   */
  async generatePartialAnswerFollowup(request: PartialAnswerFollowupRequest): Promise<OpenAIServiceResult<PartialAnswerFollowupResponse>> {
    const operationId = request.operationId || `followup_${Date.now()}`;
    
    logger.info('🎯 OpenAIService: Starting partial answer follow-up generation', {
      operationId,
      criterionId: request.criterionId,
      previousAttempts: request.previousAttempts,
      responseLength: request.userResponse.length,
      hasContext: !!request.conversationContext?.length
    });

    try {
      // Build context message for intelligent follow-up
      const contextParts = [
        `Criterion Being Explored:`,
        `ID: ${request.criterionId}`,
        `Question: ${request.criterionQuestion}`,
        `Previous Follow-up Attempts: ${request.previousAttempts}`,
        '',
        `User's Current Response:`,
        request.userResponse
      ];

      if (request.conversationContext?.length) {
        contextParts.unshift('Previous Conversation Context:');
        contextParts.unshift(...request.conversationContext.slice(-10)); // Last 10 exchanges for context
        contextParts.unshift('');
      }

      const userMessage = contextParts.join('\n');

      const gptOptions: GPTRequestOptions = {
        systemPrompt: PARTIAL_ANSWER_FOLLOWUP_SYSTEM_PROMPT,
        userMessage,
        temperature: 0.2, // Low temperature for consistent follow-up logic
        maxTokens: 1000
      };

      const response = await this.callGPT4(gptOptions, operationId);
      
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to get GPT-4 response');
      }

      // Parse JSON response
      let followupResult: PartialAnswerFollowupResponse;
      try {
        followupResult = JSON.parse(extractJsonFromResponse(response.data.content));
      } catch (parseError) {
        logger.error('❌ OpenAIService: Failed to parse partial answer followup response', {
          operationId,
          response: response.data.content.substring(0, 200)
        });
        throw new Error('Invalid JSON response from GPT-4 partial answer followup');
      }

      // Validate response structure
      if (!followupResult.followupQuestion || typeof followupResult.shouldContinueProbing !== 'boolean') {
        throw new Error('Invalid followup response: missing required fields');
      }

      logger.info('✅ OpenAIService: Partial answer follow-up generated', {
        operationId,
        shouldContinueProbing: followupResult.shouldContinueProbing,
        expectedInfoCount: followupResult.expectedInformation?.length || 0
      });

      return {
        success: true,
        data: followupResult,
        retryCount: response.retryCount,
        operationId
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ OpenAIService: Partial answer follow-up generation failed', {
        operationId,
        criterionId: request.criterionId,
        error: errorMessage
      });

      return {
        success: false,
        error: errorMessage,
        operationId
      };
    }
  }

  /**
   * Make a raw GPT-4 API call
   * 
   * @param options - GPT request options
   * @param operationId - Operation identifier for logging
   * @returns Promise resolving to GPT response
   */
  private async callGPT4(options: GPTRequestOptions, operationId: string): Promise<OpenAIServiceResult<GPTResponse>> {
    await this.enforceRateLimit();
    
    const startTime = Date.now();
    let attempt = 0;

    while (attempt < this.config.maxRetries) {
      attempt++;
      
      try {
        logger.info('📡 OpenAIService: Making GPT-4 API call', {
          operationId,
          attempt,
          model: options.model || this.config.model,
          temperature: options.temperature,
          maxTokens: options.maxTokens
        });

        // Build messages array
        const messages: ChatMessage[] = [];
        
        if (options.systemPrompt) {
          messages.push({ role: 'system', content: options.systemPrompt });
        }
        
        if (options.conversationHistory?.length) {
          messages.push(...options.conversationHistory);
        }
        
        messages.push({ role: 'user', content: options.userMessage });

        // Prepare request body
        const requestBody = {
          model: options.model || this.config.model,
          messages,
          temperature: options.temperature || 0.2,
          max_tokens: options.maxTokens || 1000,
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0,
        };

        // Prepare headers
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          ...this.config.customHeaders
        };

        if (this.config.organization) {
          headers['OpenAI-Organization'] = this.config.organization;
        }

        // Make API request
        const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(this.config.timeout)
        });

        const responseData = await response.json();

        if (!response.ok) {
          throw new Error(`GPT-4 API error: ${response.status} ${response.statusText} - ${JSON.stringify(responseData)}`);
        }

        // Extract response data
        const choice = responseData.choices?.[0];
        if (!choice) {
          throw new Error('No choices returned from GPT-4 API');
        }

        const result: GPTResponse = {
          content: choice.message.content,
          usage: responseData.usage,
          model: responseData.model,
          finish_reason: choice.finish_reason
        };

        this.requestCount++;
        this.lastRequestTime = Date.now();

        logger.info('✅ OpenAIService: GPT-4 API call successful', {
          operationId,
          attempt,
          executionTime: Date.now() - startTime,
          tokens: result.usage.total_tokens,
          finishReason: result.finish_reason
        });

        return {
          success: true,
          data: result,
          retryCount: attempt - 1,
          operationId
        };

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        logger.warn(`⚠️ OpenAIService: GPT-4 API call failed (attempt ${attempt}/${this.config.maxRetries})`, {
          operationId,
          error: errorMessage,
          attempt
        });

        // Check if this is a non-retryable error
        if (this.isNonRetryableError(error as Error)) {
          logger.error('❌ OpenAIService: Non-retryable error encountered', {
            operationId,
            error: errorMessage
          });
          
          return {
            success: false,
            error: errorMessage,
            retryCount: attempt - 1,
            operationId
          };
        }

        // If this was the last attempt, return error
        if (attempt >= this.config.maxRetries) {
          logger.error('❌ OpenAIService: All retry attempts failed', {
            operationId,
            error: errorMessage,
            totalAttempts: attempt
          });
          
          return {
            success: false,
            error: `Failed after ${attempt} attempts: ${errorMessage}`,
            retryCount: attempt - 1,
            operationId
          };
        }

        // Wait before retrying with exponential backoff
        const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
        logger.info(`⏳ OpenAIService: Retrying in ${delay}ms...`, { operationId, attempt });
        await this.sleep(delay);
      }
    }

    // This should never be reached, but just in case
    return {
      success: false,
      error: 'Unexpected error in retry loop',
      operationId
    };
  }

  /**
   * Enforce rate limiting between requests
   */
  private async enforceRateLimit(): Promise<void> {
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      logger.debug('⏳ OpenAIService: Rate limiting - waiting', { waitTime });
      await this.sleep(waitTime);
    }
  }

  /**
   * Check if an error should not be retried
   * 
   * @param error - Error to check
   * @returns True if error should not be retried
   */
  private isNonRetryableError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    
    // Don't retry on authentication errors
    if (errorMessage.includes('unauthorized') || errorMessage.includes('invalid api key')) {
      return true;
    }
    
    // Don't retry on quota exceeded (different from rate limiting)
    if (errorMessage.includes('quota exceeded') || errorMessage.includes('billing')) {
      return true;
    }

    // Don't retry on model not found
    if (errorMessage.includes('model not found') || errorMessage.includes('invalid model')) {
      return true;
    }

    return false;
  }

  /**
   * Sleep for specified duration
   * 
   * @param ms - Milliseconds to sleep
   * @returns Promise that resolves after delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get service status and statistics
   * 
   * @returns Service status information
   */
  getStatus(): {
    requestCount: number;
    lastRequestTime: number;
    config: {
      baseUrl: string;
      timeout: number;
      maxRetries: number;
      hasApiKey: boolean;
      model: string;
    };
  } {
    return {
      requestCount: this.requestCount,
      lastRequestTime: this.lastRequestTime,
      config: {
        baseUrl: this.config.baseUrl,
        timeout: this.config.timeout,
        maxRetries: this.config.maxRetries,
        hasApiKey: !!this.config.apiKey,
        model: this.config.model
      }
    };
  }
}

/**
 * Create an OpenAIService instance with environment configuration
 * 
 * @returns Configured OpenAIService instance
 * @throws Error if required environment variables are missing
 */
export function createOpenAIService(): OpenAIService {
  logger.info('🏭 Creating OpenAIService from environment configuration');

  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  // Create configuration from environment
  const config: OpenAIConfig = {
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_CONFIG.baseUrl,
    timeout: parseInt(process.env.OPENAI_TIMEOUT || '45000'),
    maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES || '3'),
    retryDelay: parseInt(process.env.OPENAI_RETRY_DELAY || '2000'),
    organization: process.env.OPENAI_ORGANIZATION,
    model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_CONFIG.model
  };

  logger.info('✅ OpenAIService configuration created', {
    hasApiKey: !!config.apiKey,
    baseUrl: config.baseUrl,
    timeout: config.timeout,
    maxRetries: config.maxRetries,
    model: config.model
  });

  return new OpenAIService(config);
}

/**
 * Export types for external use
 */
export type {
  OpenAIConfig,
  GPTRequestOptions,
  GPTResponse,
  OpenAIServiceResult,
  ValidationAnalysisRequest,
  ValidationAnalysisResponse,
  QuestionGenerationRequest,
  QuestionGenerationResponse,
  PartialAnswerFollowupRequest,
  PartialAnswerFollowupResponse,
  ChatMessage
}; 