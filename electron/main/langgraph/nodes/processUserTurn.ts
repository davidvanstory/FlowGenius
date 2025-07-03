/**
 * LangGraph Node: Process User Turn with Checklist-Based Questioning
 * 
 * This node handles standard chat messages during the brainstorming stage with
 * an intelligent checklist system that ensures comprehensive idea exploration.
 * It processes user input, analyzes responses against a checklist, and asks
 * targeted questions to ensure all key aspects are covered.
 * 
 * Key Features:
 * - Analyzes voice transcription and chat responses
 * - Maintains a comprehensive checklist of topics to explore
 * - Asks targeted questions based on uncompleted checklist items
 * - Tracks completion and progress through the checklist
 * - Uses keyword matching and context analysis
 * - Comprehensive logging and error handling
 * - State validation and updates
 */

import { AppState, ChatMessage, ChecklistState, ChecklistItem, DEFAULT_BRAINSTORM_CHECKLIST, DynamicChecklistState } from '../../../../src/types/AppState';
import { logger } from '../../../../src/utils/logger';
import { ErrorHandler } from '../../../../src/utils/errorHandler';
import { validateLangGraphState, createStateUpdate } from '../state';
import { createOpenAIService } from '../../services/openaiService';

/**
 * Task 1.7 Complete: Enhanced conversation context memory system
 * 
 * Instead of complex context management, we now use GPT-4's full 128k token
 * context window by passing the entire conversation history. This provides:
 * - Perfect memory of all user interactions
 * - No information loss from artificial context windows  
 * - Simpler implementation with better results
 * - GPT-4's built-in attention mechanism handles relevance
 */

/**
 * Process a user turn with checklist-based questioning
 * 
 * This node analyzes user responses, updates the checklist based on topics covered,
 * and asks targeted questions to ensure comprehensive exploration of the idea.
 * 
 * @param state - Current application state
 * @returns Updated state with AI response and checklist updates
 */
export async function processUserTurn(state: AppState): Promise<Partial<AppState>> {
  const startTime = Date.now();
  console.log('🗣️ ProcessUserTurn: Starting checklist-based questioning', {
    ideaId: state.idea_id,
    currentStage: state.current_stage,
    lastAction: state.last_user_action,
    messageCount: state.messages.length,
    isProcessing: state.is_processing,
    hasChecklist: !!state.checklist_state,
    hasVoiceTranscription: !!state.voice_transcription
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

    // Initialize checklist if not present
    let checklistState = state.checklist_state;
    if (!checklistState) {
      console.log('📋 ProcessUserTurn: Initializing checklist state');
      checklistState = initializeChecklist();
    }

    // Get the last message to process
    const lastMessage = state.messages[state.messages.length - 1];
    
    if (!lastMessage) {
      console.log('📝 ProcessUserTurn: No messages to process, returning welcome message');
      
      const welcomeMessage: ChatMessage = {
        role: 'assistant',
        content: "Yoda Says: Hello! I'm FlowGenius, your AI thought partner. I'm here to help you brainstorm and explore your idea comprehensively. Let's start by telling me about your idea - what problem are you trying to solve or what opportunity are you exploring?",
        created_at: new Date(),
        stage_at_creation: state.current_stage
      };

      const updatedChecklistState = {
        ...checklistState,
        active_items: ['problem_definition'] // Start with the most important item
      };

      return createStateUpdate({
        messages: [welcomeMessage],
        checklist_state: updatedChecklistState,
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

    console.log('💭 ProcessUserTurn: Processing user message with checklist analysis', {
      content: lastMessage.content.substring(0, 100) + '...',
      stage: state.current_stage,
      checklistProgress: checklistState.progress,
      completedItems: checklistState.completed_items.length,
      activeItems: checklistState.active_items.length
    });

    // Analyze user response against checklist using GPT-4 with full conversation context
    const analysisResult = await analyzeUserResponse(lastMessage.content, checklistState, state.messages.map(m => m.content));
    console.log('📊 ProcessUserTurn: Analysis result', {
      addressedItems: analysisResult.addressedItems,
      newlyCompletedItems: analysisResult.newlyCompletedItems,
      partialItems: analysisResult.partialItems,
      newlyPartialItems: analysisResult.newlyPartialItems,
      confidence: analysisResult.confidence
    });

    // Update checklist based on analysis
    const updatedChecklistState = updateChecklistFromAnalysis(checklistState, analysisResult, lastMessage.content);
    console.log('✅ ProcessUserTurn: Checklist updated', {
      progress: updatedChecklistState.progress,
      completedItems: updatedChecklistState.completed_items.length,
      isComplete: updatedChecklistState.is_complete
    });

    // Generate response based on checklist state
    const response = await generateChecklistBasedResponse(state, lastMessage, updatedChecklistState);

    console.log('✅ ProcessUserTurn: Generated checklist-based response', {
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
      checklist_state: updatedChecklistState,
      is_processing: false,
      last_user_action: 'chat'
    });

    logger.info('ProcessUserTurn completed successfully with checklist', {
      idea_id: state.idea_id,
      current_stage: state.current_stage,
      execution_time: Date.now() - startTime,
      response_length: response.length,
      checklist_progress: updatedChecklistState.progress,
      checklist_complete: updatedChecklistState.is_complete
    });

    console.log('🎉 ProcessUserTurn: Node execution completed successfully', {
      executionTime: Date.now() - startTime,
      checklistProgress: updatedChecklistState.progress,
      isComplete: updatedChecklistState.is_complete
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
 * Initialize checklist state for the current stage
 * 
 * @returns Initial checklist state
 */
function initializeChecklist(): ChecklistState {
  console.log('🚀 ProcessUserTurn: Initializing new checklist state');
  
  const config = { ...DEFAULT_BRAINSTORM_CHECKLIST };
  
  return {
    config,
    completed_items: [],
    active_items: [],
    followup_count: 0,
    criterion_followups: {},
    partial_items: [],
    is_complete: false,
    progress: 0
  };
}

/**
 * Analyze user response using GPT-4 to determine which checklist items are addressed
 * 
 * @param userResponse - The user's message content
 * @param checklistState - Current checklist state
 * @param conversationContext - Recent conversation context for GPT-4 analysis
 * @returns Analysis result with addressed items, partial items, and confidence
 */
async function analyzeUserResponse(
  userResponse: string, 
  checklistState: ChecklistState, 
  conversationContext?: string[]
): Promise<{
  addressedItems: string[];
  newlyCompletedItems: string[];
  partialItems: string[];
  newlyPartialItems: string[];
  confidence: number;
}> {
  console.log('🤖 ProcessUserTurn: Analyzing user response with GPT-4 for partial answer detection');
  
  try {
    // Initialize OpenAI service
    const openaiService = createOpenAIService();
    
    // Build criteria list for GPT-4 analysis
    const checklistCriteria = checklistState.config.items
      .filter(item => !checklistState.completed_items.includes(item.id))
      .map(item => `${item.id}: ${item.question}`);

    if (checklistCriteria.length === 0) {
      console.log('✅ ProcessUserTurn: All checklist items already completed');
      return {
        addressedItems: [],
        newlyCompletedItems: [],
        partialItems: [],
        newlyPartialItems: [],
        confidence: 1.0
      };
    }

    console.log('📋 ProcessUserTurn: Analyzing against criteria with partial detection', {
      criteriaCount: checklistCriteria.length,
      responseLength: userResponse.length,
      hasContext: !!conversationContext?.length
    });

    // Call GPT-4 to analyze the response
    const analysisResult = await openaiService.analyzeValidation({
      userResponse,
      checklistCriteria,
      conversationContext,
      operationId: `processUserTurn_${Date.now()}`
    });

    if (!analysisResult.success || !analysisResult.data) {
      console.log('❌ ProcessUserTurn: GPT-4 analysis failed - throwing error');
      logger.error('GPT-4 analysis failed in processUserTurn', {
        error: analysisResult.error,
        userResponseLength: userResponse.length
      });
      
      // Throw error instead of falling back
      throw new Error(`GPT-4 analysis failed: ${analysisResult.error}`);
    }

    const { addressedCriteria, completionScores, partialCriteria, partialScores, overallConfidence } = analysisResult.data;

    // Convert addressed criteria to item IDs and determine completion
    const addressedItems: string[] = [];
    const newlyCompletedItems: string[] = [];
    const partialItems: string[] = [];
    const newlyPartialItems: string[] = [];

    // Process fully addressed criteria
    for (const criterionId of addressedCriteria) {
      const item = checklistState.config.items.find(item => item.id === criterionId);
      if (item && !checklistState.completed_items.includes(item.id)) {
        addressedItems.push(item.id);
        
        // Consider item completed if GPT-4 confidence is high enough
        const itemScore = completionScores[criterionId] || 0;
        if (itemScore >= 0.8) {  // High threshold for completion
          newlyCompletedItems.push(item.id);
        }
      }
    }

    // Process partially addressed criteria
    for (const criterionId of partialCriteria) {
      const item = checklistState.config.items.find(item => item.id === criterionId);
      if (item && !checklistState.completed_items.includes(item.id) && !checklistState.partial_items.includes(item.id)) {
        partialItems.push(item.id);
        newlyPartialItems.push(item.id);
      }
    }

    console.log('🎯 ProcessUserTurn: GPT-4 analysis completed with partial detection', {
      addressedItems: addressedItems.length,
      newlyCompletedItems: newlyCompletedItems.length,
      partialItems: partialItems.length,
      newlyPartialItems: newlyPartialItems.length,
      overallConfidence
    });

    return {
      addressedItems,
      newlyCompletedItems,
      partialItems,
      newlyPartialItems,
      confidence: overallConfidence
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log('❌ ProcessUserTurn: Error in GPT-4 analysis - throwing error', {
      error: errorMessage
    });
    
    logger.error('Error in GPT-4 response analysis', {
      error: errorMessage,
      userResponseLength: userResponse.length
    });

    // Throw error instead of falling back
    throw new Error(`GPT-4 analysis error: ${errorMessage}`);
  }
}



/**
 * Update checklist state based on analysis results
 * 
 * @param checklistState - Current checklist state
 * @param analysisResult - Results from response analysis
 * @param userResponse - The user's response text
 * @returns Updated checklist state
 */
function updateChecklistFromAnalysis(
  checklistState: ChecklistState,
  analysisResult: { addressedItems: string[]; newlyCompletedItems: string[]; partialItems: string[]; newlyPartialItems: string[]; confidence: number },
  userResponse: string
): ChecklistState {
  console.log('🔄 ProcessUserTurn: Updating checklist from analysis');
  
  const updatedCompletedItems = [...checklistState.completed_items];
  const updatedConfig = { ...checklistState.config };
  
  // Mark newly completed items
  for (const itemId of analysisResult.newlyCompletedItems) {
    if (!updatedCompletedItems.includes(itemId)) {
      updatedCompletedItems.push(itemId);
      
      // Update the item in the config
      const itemIndex = updatedConfig.items.findIndex(item => item.id === itemId);
      if (itemIndex !== -1) {
        const existingItem = updatedConfig.items[itemIndex];
        if (existingItem) {
          updatedConfig.items[itemIndex] = {
            id: existingItem.id,
            question: existingItem.question,
            keywords: existingItem.keywords,
            priority: existingItem.priority,
            completed: true,
            response: userResponse.substring(0, 200), // Store first 200 chars
            completed_at: new Date()
          };
        }
      }
    }
  }

  // Mark newly partial items
  for (const itemId of analysisResult.newlyPartialItems) {
    if (!updatedCompletedItems.includes(itemId) && !checklistState.partial_items.includes(itemId)) {
      // Add to partial items list but don't mark as completed
      // Update the item in the config with partial response
      const itemIndex = updatedConfig.items.findIndex(item => item.id === itemId);
      if (itemIndex !== -1) {
        const existingItem = updatedConfig.items[itemIndex];
        if (existingItem) {
          updatedConfig.items[itemIndex] = {
            id: existingItem.id,
            question: existingItem.question,
            keywords: existingItem.keywords,
            priority: existingItem.priority,
            completed: false, // Not fully completed yet
            response: userResponse.substring(0, 200), // Store first 200 chars
            completed_at: undefined // Don't set completion date for partial items
          };
        }
      }
    }
  }

  // Calculate progress
  const progress = Math.round((updatedCompletedItems.length / checklistState.config.items.length) * 100);
  
  // Check if checklist is complete
  const isComplete = updatedCompletedItems.length >= checklistState.config.min_required;

  // Update active items to focus on highest priority uncompleted items
  const activeItems = getNextActiveItems(updatedConfig.items, updatedCompletedItems);

  // Update partial items list
  const updatedPartialItems = [
    ...checklistState.partial_items.filter(id => !updatedCompletedItems.includes(id)), // Keep existing partial items that aren't completed
    ...analysisResult.newlyPartialItems // Add newly identified partial items
  ];

  // Update criterion followups tracking
  const updatedCriterionFollowups = { ...checklistState.criterion_followups };

  return {
    ...checklistState,
    config: updatedConfig,
    completed_items: updatedCompletedItems,
    active_items: activeItems,
    partial_items: updatedPartialItems,
    criterion_followups: updatedCriterionFollowups,
    progress,
    is_complete: isComplete,
    last_addressed_item: analysisResult.newlyCompletedItems[0] || checklistState.last_addressed_item
  };
}

/**
 * Get the next active items to focus on
 * 
 * @param items - All checklist items
 * @param completedItems - Already completed item IDs
 * @returns Array of active item IDs
 */
function getNextActiveItems(items: ChecklistItem[], completedItems: string[]): string[] {
  console.log('🎯 ProcessUserTurn: Determining next active items');
  
  const incompleteItems = items.filter(item => !completedItems.includes(item.id));
  
  // Sort by priority (highest first)
  incompleteItems.sort((a, b) => b.priority - a.priority);
  
  // Return top 2 highest priority items
  return incompleteItems.slice(0, 2).map(item => item.id);
}

/**
 * Generate an intelligent response using GPT-4 based on checklist state and conversation context
 * Enhanced with intelligent partial answer follow-up probing (Task 1.9)
 * 
 * @param state - Current application state
 * @param userMessage - The user's message
 * @param checklistState - Updated checklist state
 * @returns Generated response string
 */
async function generateChecklistBasedResponse(
  state: AppState,
  userMessage: ChatMessage,
  checklistState: ChecklistState
): Promise<string> {
  console.log('🤖 ProcessUserTurn: Generating GPT-4 powered response with partial answer detection');

  try {
    // If checklist is complete, use GPT-4 for personalized congratulations
    if (checklistState.is_complete) {
      return await generateCompletionResponse(state, checklistState);
    }

    // First, check if we should follow up on any partial answers
    console.log('🎯 ProcessUserTurn: Checking for partial answer follow-up opportunities', {
      partialItems: checklistState.partial_items.length,
      criterionFollowups: Object.keys(checklistState.criterion_followups).length
    });

    const partialFollowupResponse = await handlePartialAnswerFollowup(state, userMessage, checklistState);
    
    if (partialFollowupResponse) {
      console.log('📍 ProcessUserTurn: Generated partial answer follow-up', {
        lastProbedItem: checklistState.last_probed_item,
        followupLength: partialFollowupResponse.length
      });

      // Add progress indicator for follow-up responses
      let response = partialFollowupResponse;
      response += `\n\n📊 Progress: ${checklistState.progress}% complete (${checklistState.completed_items.length}/${checklistState.config.items.length} areas covered)`;
      
      return response;
    }

    // If no partial follow-up needed, use GPT-4 to generate intelligent, context-aware questions
    return await generateIntelligentQuestions(state, userMessage, checklistState);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log('❌ ProcessUserTurn: GPT-4 response generation failed - throwing error', {
      error: errorMessage
    });
    
    logger.error('GPT-4 response generation failed in processUserTurn', {
      error: errorMessage,
      checklistProgress: checklistState.progress
    });

    // Throw error instead of falling back
    throw new Error(`GPT-4 service unavailable: ${errorMessage}`);
  }
}

/**
 * Generate personalized completion response using GPT-4
 * 
 * @param state - Current application state  
 * @param checklistState - Completed checklist state
 * @returns Personalized completion message
 */
async function generateCompletionResponse(
  state: AppState,
  checklistState: ChecklistState
): Promise<string> {
  console.log('🎉 ProcessUserTurn: Generating GPT-4 completion response');

  try {
    const openaiService = createOpenAIService();
    
    // Build conversation summary for personalized response
    const conversationSummary = state.messages
      .filter(m => m.role === 'user')
      .slice(-5)
      .map(m => m.content)
      .join('\n\n');

    const completedCriteria = checklistState.config.items
      .filter(item => checklistState.completed_items.includes(item.id))
      .map(item => `- ${item.question}: ${item.response || 'Addressed'}`)
      .join('\n');

    const prompt = `The user has completed comprehensive brainstorming for their product idea. Here's what they've covered:

${completedCriteria}

Recent conversation context:
${conversationSummary}

Generate a personalized, enthusiastic completion message that:
1. Congratulates them specifically on their thoroughness
2. Highlights 1-2 particularly strong aspects of their idea
3. Suggests they're ready for the summary stage
4. Ends with "Georgia is great!" as required

Keep it conversational and encouraging, about 3-4 sentences.`;

    const response = await openaiService.generateQuestions({
      userResponse: prompt,
      checklistCriteria: ['completion_message'],
      unaddressedCriteria: [],
      conversationContext: state.messages.slice(-10).map(m => m.content),
      maxQuestions: 1,
      operationId: `completion_${Date.now()}`
    });

    if (response.success && response.data?.questions[0]) {
      return response.data.questions[0];
    }

    // Throw error if GPT-4 fails
    throw new Error('GPT-4 completion response generation failed');

  } catch (error) {
    console.log('❌ ProcessUserTurn: Error generating completion response');
    throw new Error(`GPT-4 completion response error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generate intelligent, context-aware questions using GPT-4
 * 
 * @param state - Current application state
 * @param userMessage - The user's message  
 * @param checklistState - Current checklist state
 * @returns Intelligent response with questions
 */
async function generateIntelligentQuestions(
  state: AppState,
  userMessage: ChatMessage,
  checklistState: ChecklistState
): Promise<string> {
  console.log('💭 ProcessUserTurn: Generating intelligent questions with GPT-4 prioritization');

  const openaiService = createOpenAIService();

  // Build lists for GPT-4 with priority-aware ordering
  const allCriteria = checklistState.config.items
    .sort((a, b) => b.priority - a.priority) // Sort by priority for better context
    .map(item => `${item.id}: ${item.question}`);
    
  const unaddressedCriteria = checklistState.config.items
    .filter(item => !checklistState.completed_items.includes(item.id))
    .sort((a, b) => b.priority - a.priority) // Prioritize by importance
    .map(item => `${item.id}: ${item.question}`);

  const conversationContext = state.messages.map(m => m.content);

  console.log('📊 ProcessUserTurn: GPT-4 question prioritization request', {
    totalCriteria: allCriteria.length,
    unaddressedCriteria: unaddressedCriteria.length,
    progress: checklistState.progress,
    contextMessages: conversationContext.length,
    highestPriorityUnaddressed: unaddressedCriteria[0]?.split(':')[0] || 'none'
  });

  const questionResult = await openaiService.generateQuestions({
    userResponse: userMessage.content,
    checklistCriteria: allCriteria,
    unaddressedCriteria,
    conversationContext,
    maxQuestions: 3, // Allow up to 3 but GPT-4 will intelligently prioritize to 2-3 most important
    operationId: `questions_${Date.now()}`
  });

  if (!questionResult.success || !questionResult.data) {
    throw new Error(questionResult.error || 'Failed to generate questions');
  }

  const { questions, reasoning, prioritizedCriteria, priorityScores } = questionResult.data;

  // Build intelligent response with prioritization context
  let response = "";

  // Acknowledge progress if items were addressed
  if (checklistState.last_addressed_item) {
    const lastItem = checklistState.config.items.find(item => item.id === checklistState.last_addressed_item);
    if (lastItem) {
      response += `Great insights on ${lastItem.question.toLowerCase()}! That adds valuable depth to your idea.\n\n`;
    }
  }

  // Add GPT-4 generated questions with prioritization awareness
  if (questions.length > 0) {
    response += questions.join('\n\n');
    
    // Add subtle prioritization context for debugging/transparency
    console.log('🎯 ProcessUserTurn: GPT-4 question prioritization results', {
      questionCount: questions.length,
      topPriorityCriteria: prioritizedCriteria.slice(0, 3),
      maxPriorityScore: Math.max(...Object.values(priorityScores || {})),
      reasoning: reasoning.substring(0, 100)
    });
  } else {
    // Fallback if no questions generated
    response += "Yoda Says: Excellent progress! You've covered the key areas comprehensively.";
  }

  // Add progress indicator
  response += `\n\n📊 Progress: ${checklistState.progress}% complete (${checklistState.completed_items.length}/${checklistState.config.items.length} areas covered)`;

  console.log('✅ ProcessUserTurn: GPT-4 prioritized response generated', {
    questionCount: questions.length,
    responseLength: response.length,
    prioritizedCriteria: prioritizedCriteria.length,
    reasoning: reasoning.substring(0, 100)
  });

  return response;
}



/**
 * Get the next question to ask based on checklist state
 * 
 * @param checklistState - Current checklist state
 * @returns Next checklist item to address
 */
function getNextQuestionToAsk(checklistState: ChecklistState): ChecklistItem | null {
  console.log('❓ ProcessUserTurn: Getting next question to ask');
  
  // Get highest priority active item
  for (const activeItemId of checklistState.active_items) {
    const item = checklistState.config.items.find(item => item.id === activeItemId);
    if (item && !checklistState.completed_items.includes(item.id)) {
      return item;
    }
  }

  // If no active items, get highest priority incomplete item
  const incompleteItems = checklistState.config.items.filter(item => 
    !checklistState.completed_items.includes(item.id)
  );
  
  if (incompleteItems.length > 0) {
    incompleteItems.sort((a, b) => b.priority - a.priority);
    return incompleteItems[0] || null;
  }

  return null;
}

/**
 * Get contextual prompts for specific checklist items
 * 
 * @param itemId - The checklist item ID
 * @returns Array of contextual prompts
 */
function getContextualPrompts(itemId: string): string[] {
  const prompts: Record<string, string[]> = {
    problem_definition: [
      "Think about the frustrations or inefficiencies people currently experience.",
      "What gap exists in the current market or solutions?",
      "How do people currently solve this problem, and why isn't it working well?"
    ],
    target_audience: [
      "Who would benefit most from this solution?",
      "What demographics, interests, or characteristics define your ideal user?",
      "Are there specific industries, age groups, or user types you're targeting?"
    ],
    value_proposition: [
      "What makes your approach different from existing solutions?",
      "What key benefits would users get that they can't get elsewhere?",
      "How would you complete this sentence: 'Unlike other solutions, ours...'"
    ],
    market_size: [
      "How many people have this problem?",
      "What's the potential revenue opportunity?",
      "Is this market growing, stable, or declining?"
    ],
    competition: [
      "Who else is solving this problem?",
      "What are the strengths and weaknesses of existing solutions?",
      "How would your solution be clearly better?"
    ],
    resources_needed: [
      "What skills, team members, or expertise do you need?",
      "What funding or investment might be required?",
      "What technology, tools, or infrastructure would you need?"
    ],
    success_metrics: [
      "How will you know if your solution is working?",
      "What numbers would you track to measure success?",
      "What would 'success' look like in 6 months or a year?"
    ],
    timeline: [
      "When would you like to launch or start seeing results?",
      "What are the key milestones along the way?",
      "How quickly do you need to move to stay competitive?"
    ],
    risks_challenges: [
      "What could go wrong with this idea?",
      "What obstacles might slow you down or stop you?",
      "What assumptions are you making that might not be true?"
    ],
    next_steps: [
      "What's the very first thing you would do to move forward?",
      "What could you start working on today or this week?",
      "What information or validation do you need before proceeding?"
    ]
  };

  return prompts[itemId] || [];
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
 * Handle intelligent partial answer follow-up probing
 * Implements "probe once more, then move on" principle
 * 
 * @param state - Current application state
 * @param userMessage - The user's message
 * @param checklistState - Current checklist state with partial items
 * @returns Follow-up response or null if no follow-up needed
 */
async function handlePartialAnswerFollowup(
  state: AppState,
  userMessage: ChatMessage,
  checklistState: ChecklistState
): Promise<string | null> {
  console.log('🎯 ProcessUserTurn: Checking for partial answer follow-up opportunities');

  // Find the highest priority partial item that hasn't been followed up on yet
  const prioritizedPartialItems = checklistState.partial_items
    .map(itemId => checklistState.config.items.find(item => item.id === itemId))
    .filter(item => item !== undefined)
    .filter(item => (checklistState.criterion_followups[item!.id] || 0) === 0) // Only items with 0 follow-ups
    .sort((a, b) => b!.priority - a!.priority); // Sort by priority

  if (prioritizedPartialItems.length === 0) {
    console.log('📝 ProcessUserTurn: No partial items eligible for follow-up');
    return null;
  }

  const itemToFollowUp = prioritizedPartialItems[0]!;
  
  console.log('🔍 ProcessUserTurn: Generating follow-up for partial item', {
    itemId: itemToFollowUp.id,
    itemQuestion: itemToFollowUp.question,
    priority: itemToFollowUp.priority,
    previousAttempts: checklistState.criterion_followups[itemToFollowUp.id] || 0
  });

  try {
    const openaiService = createOpenAIService();
    
    const followupResult = await openaiService.generatePartialAnswerFollowup({
      userResponse: userMessage.content,
      criterionId: itemToFollowUp.id,
      criterionQuestion: itemToFollowUp.question,
      previousAttempts: checklistState.criterion_followups[itemToFollowUp.id] || 0,
      conversationContext: state.messages.map(m => m.content),
      operationId: `partial_followup_${itemToFollowUp.id}_${Date.now()}`
    });

    if (!followupResult.success || !followupResult.data) {
      console.log('⚠️ ProcessUserTurn: Follow-up generation failed, skipping');
      return null;
    }

    const { followupQuestion, shouldContinueProbing, reasoning } = followupResult.data;

    console.log('🎯 ProcessUserTurn: Follow-up analysis completed', {
      itemId: itemToFollowUp.id,
      shouldContinueProbing,
      reasoning: reasoning.substring(0, 100)
    });

    if (shouldContinueProbing) {
      // Increment follow-up count for this criterion
      checklistState.criterion_followups[itemToFollowUp.id] = (checklistState.criterion_followups[itemToFollowUp.id] || 0) + 1;
      checklistState.last_probed_item = itemToFollowUp.id;
      
      return followupQuestion;
    }

    // If GPT-4 says not to probe, remove from partial items and move on
    checklistState.partial_items = checklistState.partial_items.filter(id => id !== itemToFollowUp.id);
    console.log('✅ ProcessUserTurn: Moving on from partial item', { itemId: itemToFollowUp.id });
    
    return null; // No follow-up, proceed with normal question generation

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log('❌ ProcessUserTurn: Error in follow-up generation', {
      itemId: itemToFollowUp.id,
      error: errorMessage
    });
    
    logger.warn('Error generating partial answer follow-up', {
      itemId: itemToFollowUp.id,
      error: errorMessage
    });

    return null; // Fall back to normal question generation
  }
} 