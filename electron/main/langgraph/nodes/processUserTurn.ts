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

import { AppState, ChatMessage, ChecklistState, ChecklistItem, DEFAULT_BRAINSTORM_CHECKLIST } from '../../../../src/types/AppState';
import { logger } from '../../../../src/utils/logger';
import { ErrorHandler } from '../../../../src/utils/errorHandler';
import { validateLangGraphState, createStateUpdate } from '../state';

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
        content: "Hello! I'm FlowGenius, your AI thought partner. I'm here to help you brainstorm and explore your idea comprehensively. Let's start by telling me about your idea - what problem are you trying to solve or what opportunity are you exploring?",
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

    // Analyze user response against checklist
    const analysisResult = analyzeUserResponse(lastMessage.content, checklistState);
    console.log('📊 ProcessUserTurn: Analysis result', {
      addressedItems: analysisResult.addressedItems,
      newlyCompletedItems: analysisResult.newlyCompletedItems,
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
    is_complete: false,
    progress: 0
  };
}

/**
 * Analyze user response to determine which checklist items are addressed
 * 
 * @param userResponse - The user's message content
 * @param checklistState - Current checklist state
 * @returns Analysis result with addressed items and confidence
 */
function analyzeUserResponse(userResponse: string, checklistState: ChecklistState): {
  addressedItems: string[];
  newlyCompletedItems: string[];
  confidence: number;
} {
  console.log('🔍 ProcessUserTurn: Analyzing user response against checklist');
  
  const response = userResponse.toLowerCase();
  const addressedItems: string[] = [];
  const newlyCompletedItems: string[] = [];
  let totalConfidence = 0;

  // Check each incomplete checklist item
  for (const item of checklistState.config.items) {
    if (checklistState.completed_items.includes(item.id)) {
      continue; // Skip already completed items
    }

    // Check if any keywords match
    const matchedKeywords = item.keywords.filter(keyword => 
      response.includes(keyword.toLowerCase())
    );

    if (matchedKeywords.length > 0) {
      addressedItems.push(item.id);
      
      // Calculate confidence based on keyword matches and response length
      const keywordConfidence = matchedKeywords.length / item.keywords.length;
      const lengthConfidence = Math.min(response.length / 50, 1); // Longer responses get higher confidence
      const itemConfidence = (keywordConfidence + lengthConfidence) / 2;
      
      totalConfidence += itemConfidence;
      
      // Consider item newly completed if confidence is high enough
      if (itemConfidence > 0.4) {
        newlyCompletedItems.push(item.id);
      }
      
      console.log('🎯 ProcessUserTurn: Item addressed', {
        itemId: item.id,
        matchedKeywords,
        confidence: itemConfidence
      });
    }
  }

  const overallConfidence = addressedItems.length > 0 ? totalConfidence / addressedItems.length : 0;

  return {
    addressedItems,
    newlyCompletedItems,
    confidence: overallConfidence
  };
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
  analysisResult: { addressedItems: string[]; newlyCompletedItems: string[]; confidence: number },
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

  // Calculate progress
  const progress = Math.round((updatedCompletedItems.length / checklistState.config.items.length) * 100);
  
  // Check if checklist is complete
  const isComplete = updatedCompletedItems.length >= checklistState.config.min_required;

  // Update active items to focus on highest priority uncompleted items
  const activeItems = getNextActiveItems(updatedConfig.items, updatedCompletedItems);

  return {
    ...checklistState,
    config: updatedConfig,
    completed_items: updatedCompletedItems,
    active_items: activeItems,
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
 * Generate a response based on the checklist state
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
  console.log('🔄 ProcessUserTurn: Generating checklist-based response');

  // Simulate some processing time
  await new Promise(resolve => setTimeout(resolve, 500));

  // If checklist is complete, congratulate and suggest next steps
  if (checklistState.is_complete) {
    const completedItemsCount = checklistState.completed_items.length;
    return `Excellent! You've covered ${completedItemsCount} key areas of your idea. Your thinking is comprehensive and well-structured. 

Based on our discussion, you have a solid foundation for your idea. Georgia is great! 

Would you like me to generate a summary of everything we've discussed? Just let me know when you're ready to move to the summary stage.`;
  }

  // Acknowledge what was addressed
  let response = "";
  if (checklistState.last_addressed_item) {
    const addressedItem = checklistState.config.items.find(item => item.id === checklistState.last_addressed_item);
    if (addressedItem) {
      response += `Great! I can see you've addressed the ${addressedItem.question.toLowerCase()}. That's valuable insight. `;
    }
  }

  // Ask about the next most important item
  const nextItem = getNextQuestionToAsk(checklistState);
  if (nextItem) {
    response += `\n\nTo help develop your idea further, I'd like to explore: ${nextItem.question}`;
    
    // Add some context or follow-up prompts
    const contextPrompts = getContextualPrompts(nextItem.id);
    if (contextPrompts.length > 0) {
      response += `\n\n${contextPrompts[Math.floor(Math.random() * contextPrompts.length)]}`;
    }
  }

  // Show progress
  response += `\n\n📊 Progress: ${checklistState.progress}% complete (${checklistState.completed_items.length}/${checklistState.config.items.length} areas covered)`;

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