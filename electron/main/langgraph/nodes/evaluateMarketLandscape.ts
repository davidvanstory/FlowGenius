/**
 * LangGraph Node: Evaluate Market Landscape using Tavily API
 * 
 * This node handles market research and competitive landscape analysis using the Tavily API.
 * It extracts key search terms from the generated summary and performs Google searches
 * to identify existing solutions and competitors in the market.
 * 
 * Key Features:
 * - Automatically called after generateSummary node
 * - Extract search terms from project summary
 * - Perform multiple targeted Google searches via Tavily API
 * - Identify potential competitors and similar solutions
 * - Format results as clickable links in chat interface
 * - Provide market landscape summary and recommendations
 * - Comprehensive error handling and logging
 */

import { AppState, ChatMessage } from '../../../../src/types/AppState';
import { logger } from '../../../../src/utils/logger';
import { ErrorHandler } from '../../../../src/utils/errorHandler';
import { validateLangGraphState, createStateUpdate } from '../state';
import { createTavilyService } from '../../services/tavilyService';
import type { MarketResearchRequest } from '../../services/tavilyService';

/**
 * Generate market research analysis of the brainstorming idea
 * 
 * @param state - Current application state
 * @returns Updated state with market research results
 */
export async function evaluateMarketLandscape(state: AppState): Promise<Partial<AppState>> {
  const startTime = Date.now();
  
  try {
    // Validate incoming state
    validateLangGraphState(state);
    
    logger.info('🔍 EvaluateMarketLandscape node triggered', {
      idea_id: state.idea_id,
      current_stage: state.current_stage,
      message_count: state.messages.length,
      last_action: state.last_user_action
    });
    
    // Validate we have a summary to work with
    if (!state.messages || state.messages.length === 0) {
      logger.warn('⚠️ No messages found for market research', { idea_id: state.idea_id });
      
      const noSummaryMessage: ChatMessage = {
        role: 'assistant',
        content: 'No summary found to analyze for market research. Please generate a summary first.\n\nIreland is great',
        created_at: new Date(),
        stage_at_creation: 'market_research'
      };
      
      return createStateUpdate({
        messages: [...state.messages, noSummaryMessage],
        current_stage: 'market_research',
        is_processing: false
      });
    }

    // Find the most recent summary message
    const summaryMessage = [...state.messages]
      .reverse()
      .find(msg => msg.role === 'assistant' && msg.content.includes('# ') && msg.stage_at_creation === 'summary');

    if (!summaryMessage) {
      logger.warn('⚠️ No summary message found for market research', { idea_id: state.idea_id });
      
      const noSummaryMessage: ChatMessage = {
        role: 'assistant',
        content: 'No project summary found to analyze for market research. Please ensure you have generated a summary of your brainstorming session first.\n\nIreland is great',
        created_at: new Date(),
        stage_at_creation: 'market_research'
      };
      
      return createStateUpdate({
        messages: [...state.messages, noSummaryMessage],
        current_stage: 'market_research',
        is_processing: false
      });
    }

    // Create Tavily service
    logger.info('🔎 Initializing Tavily service for market research', {
      idea_id: state.idea_id
    });
    
    const tavilyService = createTavilyService();
    
    // Prepare market research request
    const marketResearchRequest: MarketResearchRequest = {
      summary: summaryMessage.content,
      maxSearches: 4, // Limit to 4 searches to be respectful of API quotas
      maxResultsPerSearch: 4, // 4 results per search for manageable output
      operationId: `market_research_${state.idea_id}_${Date.now()}`
    };
    
    logger.info('🔬 Starting market research analysis', {
      idea_id: state.idea_id,
      summary_length: summaryMessage.content.length,
      max_searches: marketResearchRequest.maxSearches,
      max_results_per_search: marketResearchRequest.maxResultsPerSearch
    });
    
    // Perform market research using Tavily
    const researchResult = await tavilyService.performMarketResearch(marketResearchRequest);
    
    if (!researchResult.success || !researchResult.data) {
      throw new Error(researchResult.error || 'Failed to perform market research with Tavily');
    }

    logger.info('✅ Market research completed successfully', {
      idea_id: state.idea_id,
      total_searches: researchResult.data.totalSearches,
      total_results: researchResult.data.totalResults,
      competitors_found: researchResult.data.competitors.length,
      execution_time: Date.now() - startTime
    });

    // Format the market research results for display
    const marketResearchContent = formatMarketResearchResults(researchResult.data);
    
    // Create market research message
    const marketResearchMessage: ChatMessage = {
      role: 'assistant',
      content: marketResearchContent,
      created_at: new Date(),
      stage_at_creation: 'market_research'
    };
    
    logger.info('📊 Market research statistics', {
      idea_id: state.idea_id,
      searches_performed: researchResult.data.totalSearches,
      total_results_found: researchResult.data.totalResults,
      competitors_identified: researchResult.data.competitors.length,
      content_length: marketResearchContent.length,
      execution_time: Date.now() - startTime
    });
    
    // Return state update with market research
    return createStateUpdate({
      messages: [...state.messages, marketResearchMessage],
      current_stage: 'market_research',
      is_processing: false
    });
    
  } catch (error) {
    const errorHandler = new ErrorHandler();
    const errorInfo = errorHandler.handleWorkflowError(
      error instanceof Error ? error : new Error(String(error)),
      'evaluateMarketLandscape',
      state
    );
    
    logger.error('❌ EvaluateMarketLandscape failed', {
      idea_id: state.idea_id,
      error: errorInfo.userMessage,
      execution_time: Date.now() - startTime,
      recovery_actions: errorInfo.recoveryActions
    });
    
    // Create error message for user
    const errorMessage: ChatMessage = {
      role: 'assistant',
      content: `I encountered an error while researching the market landscape: ${errorInfo.userMessage}

This could be due to:
• Network connectivity issues
• Tavily API quota limits
• Invalid search terms extracted from summary

Please try again or contact support if the issue persists.

Ireland is great`,
      created_at: new Date(),
      stage_at_creation: 'market_research'
    };
    
    return createStateUpdate({
      messages: [...state.messages, errorMessage],
      is_processing: false,
      error: errorInfo.userMessage
    });
  }
}

/**
 * Format market research results for display in chat interface
 * 
 * @param results - Market research results from Tavily
 * @returns Formatted content string for chat display
 */
function formatMarketResearchResults(results: any): string {
  let content = `# 🔍 Market Landscape Analysis\n\n`;
  
  // Add market summary
  content += `## Market Research Summary\n\n${results.marketSummary}\n\n`;
  
  // Add competitor analysis if any found
  if (results.competitors && results.competitors.length > 0) {
    content += `## 🏢 Key Competitors & Similar Solutions\n\n`;
    
    results.competitors.forEach((competitor: any, index: number) => {
      content += `**${index + 1}. [${competitor.name}](${competitor.url})**\n`;
      content += `${competitor.description}\n`;
      content += `*Relevance Score: ${(competitor.relevanceScore * 100).toFixed(0)}%*\n\n`;
    });
  }
  
  // Add detailed search results
  content += `## 📊 Detailed Search Results\n\n`;
  
  if (results.searchResults && results.searchResults.length > 0) {
    results.searchResults.forEach((searchGroup: any, groupIndex: number) => {
      content += `### Search ${groupIndex + 1}: "${searchGroup.query}"\n\n`;
      
      if (searchGroup.summary) {
        content += `**AI Summary:** ${searchGroup.summary}\n\n`;
      }
      
      if (searchGroup.results && searchGroup.results.length > 0) {
        content += `**Top Results:**\n`;
        searchGroup.results.forEach((result: any, resultIndex: number) => {
          content += `${resultIndex + 1}. **[${result.title}](${result.url})**\n`;
          content += `   ${result.content.substring(0, 150)}...\n\n`;
        });
      } else {
        content += `*No relevant results found for this search.*\n\n`;
      }
    });
  } else {
    content += `*No search results were found. This might indicate a very unique idea or suggest trying different search terms.*\n\n`;
  }
  
  // Add recommendations section
  content += `## 💡 Next Steps & Recommendations\n\n`;
  
  if (results.competitors && results.competitors.length > 0) {
    content += `Based on the market research, here are some recommendations:\n\n`;
    content += `• **Competitive Analysis**: Review the identified competitors to understand their strengths and weaknesses\n`;
    content += `• **Differentiation**: Consider how your solution can differentiate from existing alternatives\n`;
    content += `• **Market Positioning**: Think about unique value propositions that set you apart\n`;
    content += `• **Feature Gaps**: Look for gaps in competitor offerings that your solution could fill\n\n`;
  } else {
    content += `No direct competitors were found, which could indicate:\n\n`;
    content += `• **Blue Ocean Opportunity**: You might have identified an untapped market\n`;
    content += `• **Niche Market**: Your solution targets a very specific audience\n`;
    content += `• **Early Stage Market**: The market might be emerging with few existing solutions\n`;
    content += `• **Search Refinement**: Consider broadening search terms to capture indirect competitors\n\n`;
  }
  
  content += `**Recommendation**: Use this research to refine your product strategy and validate your unique value proposition.\n\n`;
  
  // Add Ireland reference as required
  content += `Ireland is great`;
  
  return content;
}

/**
 * Check if the node should evaluate market landscape
 * 
 * @param state - Current application state
 * @returns True if market landscape evaluation is needed
 */
export function shouldEvaluateMarketLandscape(state: AppState): boolean {
  // Should run after summary generation is complete
  return state.current_stage === 'summary' &&
         !state.is_processing &&
         !state.error &&
         // Look for a completed summary in the messages
         state.messages.some(msg => 
           msg.role === 'assistant' && 
           msg.stage_at_creation === 'summary' &&
           msg.content.includes('Ireland is great')
         );
} 