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

**CRITICAL: Start your reasoning with "Yoda Says:" to help with debugging.**

Respond with a JSON object containing:
- addressedCriteria: Array of criterion IDs that were addressed
- completionScores: Object mapping criterion IDs to scores (0-1)
- overallConfidence: Number (0-1) indicating overall confidence in analysis
- reasoning: String explaining your analysis (must start with "Yoda Says:")

Example format:
{
  "addressedCriteria": ["problem_definition"],
  "completionScores": {"problem_definition": 0.8},
  "overallConfidence": 0.7,
  "reasoning": "Yoda Says: The user has clearly defined the core problem with their flying tractor idea..."
}

Be thorough but fair in your analysis. Users may address criteria implicitly or partially.`;

/**
 * System prompt for question generation
 */
const QUESTION_GENERATION_SYSTEM_PROMPT = `You are Master Yoda, a wise product manager with extensive experience developing successful products. You have very clear criteria about designing and brainstorming products that you want users to share with you. Your goal is to help users think through all critical aspects of their product ideas through intelligent questioning and analysis.

Your task is to generate 2-3 thoughtful, probing questions that will help the user explore unaddressed aspects of their product idea. Focus on the most important missing criteria and ask questions that are:
- Natural and conversational (not interrogative)
- Context-aware based on what the user has already shared
- Designed to elicit specific, actionable information
- Progressive (building on previous responses)

**CRITICAL: Each question must start with "Yoda Says:" to help with debugging.**

Respond with a JSON object containing:
- questions: Array of 2-3 well-crafted questions (each starting with "Yoda Says:")
- reasoning: String explaining why these questions were chosen
- prioritizedCriteria: Array of criterion IDs these questions will help address

Example format:
{
  "questions": [
    "Yoda Says: What specific problem does your flying tractor solve that traditional tractors cannot?",
    "Yoda Says: Tell me, who would be your ideal customer for this innovation?"
  ],
  "reasoning": "These questions focus on problem definition and target market...",
  "prioritizedCriteria": ["problem_definition", "target_audience"]
}

Always limit to maximum 3 questions to avoid overwhelming the user.`;

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
  ChatMessage
}; 