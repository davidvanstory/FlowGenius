/**
 * Tavily Search Service for Main Electron Process
 * 
 * This service handles all interactions with the Tavily API for market research
 * and competitive landscape analysis. It provides Google search functionality
 * to evaluate if product ideas already exist in the market.
 * 
 * Key Features:
 * - Tavily API integration with proper authentication
 * - Market research and competitive analysis
 * - Multiple targeted searches based on idea summaries
 * - Search result formatting with clickable links
 * - Retry logic with exponential backoff
 * - Rate limiting and quota management
 * - Comprehensive error handling and logging
 */

import { logger } from '../../../src/utils/logger';

/**
 * Tavily API configuration
 */
interface TavilyConfig {
  /** Tavily API key */
  apiKey: string;
  /** API base URL (default: Tavily) */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Base delay for exponential backoff (ms) */
  retryDelay?: number;
  /** Custom headers for requests */
  customHeaders?: Record<string, string>;
}

/**
 * Tavily search request options
 */
interface TavilySearchOptions {
  /** Search query */
  query: string;
  /** Search depth (basic or advanced) */
  search_depth?: 'basic' | 'advanced';
  /** Search topic */
  topic?: 'general' | 'news';
  /** Maximum number of results */
  max_results?: number;
  /** Include images in results */
  include_images?: boolean;
  /** Include answer summary */
  include_answer?: boolean;
  /** Include raw content */
  include_raw_content?: boolean;
  /** Include domains to search */
  include_domains?: string[];
  /** Exclude domains from search */
  exclude_domains?: string[];
}

/**
 * Tavily search result item
 */
interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
  favicon?: string;
}

/**
 * Tavily API response
 */
interface TavilyApiResponse {
  query: string;
  answer?: string;
  images?: string[];
  results: TavilySearchResult[];
  response_time: number;
}

/**
 * Market research request
 */
interface MarketResearchRequest {
  /** Generated summary to extract search terms from */
  summary: string;
  /** Custom search terms (optional) */
  customSearchTerms?: string[];
  /** Maximum number of search queries to perform */
  maxSearches?: number;
  /** Maximum results per search */
  maxResultsPerSearch?: number;
  /** Operation ID for logging */
  operationId?: string;
}

/**
 * Market research response
 */
interface MarketResearchResponse {
  /** Array of search results grouped by query */
  searchResults: Array<{
    query: string;
    results: TavilySearchResult[];
    summary?: string;
  }>;
  /** Overall market landscape summary */
  marketSummary: string;
  /** Key competitors or similar products found */
  competitors: Array<{
    name: string;
    url: string;
    description: string;
    relevanceScore: number;
  }>;
  /** Total number of searches performed */
  totalSearches: number;
  /** Total results found */
  totalResults: number;
}

/**
 * Service result wrapper
 */
interface TavilyServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  retryCount?: number;
  operationId?: string;
}

/**
 * Default Tavily configuration
 */
const DEFAULT_TAVILY_CONFIG: Partial<TavilyConfig> = {
  baseUrl: 'https://api.tavily.com',
  timeout: 30000, // 30 seconds for search calls
  maxRetries: 3,
  retryDelay: 1000, // 1 second base delay
};

/**
 * Tavily service for market research and competitive analysis
 */
export class TavilyService {
  private config: Required<TavilyConfig>;
  private requestCount: number = 0;
  private lastRequestTime: number = 0;
  private rateLimitDelay: number = 500; // Minimum delay between requests

  /**
   * Create a new TavilyService instance
   * 
   * @param config - Tavily service configuration
   */
  constructor(config: TavilyConfig) {
    logger.info('🔍 Initializing TavilyService', {
      baseUrl: config.baseUrl || DEFAULT_TAVILY_CONFIG.baseUrl,
      hasApiKey: !!config.apiKey,
      timeout: config.timeout || DEFAULT_TAVILY_CONFIG.timeout
    });

    // Validate required configuration
    if (!config.apiKey) {
      throw new Error('Tavily API key is required for TavilyService');
    }

    // Merge with defaults
    this.config = {
      ...DEFAULT_TAVILY_CONFIG,
      ...config
    } as Required<TavilyConfig>;

    logger.info('✅ TavilyService initialized successfully');
  }

  /**
   * Perform market research based on idea summary
   * 
   * @param request - Market research request
   * @returns Promise resolving to market research result
   */
  async performMarketResearch(request: MarketResearchRequest): Promise<TavilyServiceResult<MarketResearchResponse>> {
    const operationId = request.operationId || `market_research_${Date.now()}`;
    
    logger.info('🔬 TavilyService: Starting market research', {
      operationId,
      summaryLength: request.summary.length,
      hasCustomTerms: !!request.customSearchTerms?.length,
      maxSearches: request.maxSearches || 4
    });

    try {
      // Extract search terms from summary
      const searchTerms = this.extractSearchTerms(request.summary, request.customSearchTerms);
      
      // Limit number of searches
      const maxSearches = request.maxSearches || 4;
      const searchesToPerform = searchTerms.slice(0, maxSearches);
      
      logger.info('🎯 TavilyService: Extracted search terms', {
        operationId,
        totalTerms: searchTerms.length,
        searchesToPerform: searchesToPerform.length,
        terms: searchesToPerform
      });

      // Perform multiple searches
      const searchResults: MarketResearchResponse['searchResults'] = [];
      let totalResults = 0;

      for (const searchTerm of searchesToPerform) {
        logger.info('🔍 TavilyService: Performing search', {
          operationId,
          query: searchTerm
        });

        const searchOptions: TavilySearchOptions = {
          query: searchTerm,
          search_depth: 'basic',
          topic: 'general',
          max_results: request.maxResultsPerSearch || 5,
          include_answer: true,
          include_images: false,
          include_raw_content: false
        };

        const searchResult = await this.search(searchOptions, operationId);
        
        if (searchResult.success && searchResult.data) {
          searchResults.push({
            query: searchTerm,
            results: searchResult.data.results,
            summary: searchResult.data.answer
          });
          totalResults += searchResult.data.results.length;
        } else {
          logger.warn('⚠️ TavilyService: Search failed', {
            operationId,
            query: searchTerm,
            error: searchResult.error
          });
        }

        // Add delay between searches to respect rate limits
        await this.enforceRateLimit();
      }

      // Analyze results and extract competitors
      const competitors = this.extractCompetitors(searchResults);
      const marketSummary = this.generateMarketSummary(searchResults, competitors);

      logger.info('✅ TavilyService: Market research completed', {
        operationId,
        totalSearches: searchResults.length,
        totalResults,
        competitorsFound: competitors.length
      });

      return {
        success: true,
        data: {
          searchResults,
          marketSummary,
          competitors,
          totalSearches: searchResults.length,
          totalResults
        },
        operationId
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ TavilyService: Market research failed', {
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
   * Perform a single search using Tavily API
   * 
   * @param options - Search options
   * @param operationId - Operation identifier for logging
   * @returns Promise resolving to search result
   */
  async search(options: TavilySearchOptions, operationId: string): Promise<TavilyServiceResult<TavilyApiResponse>> {
    await this.enforceRateLimit();
    
    const startTime = Date.now();
    let attempt = 0;

    while (attempt < this.config.maxRetries) {
      attempt++;
      
      try {
        logger.info('📡 TavilyService: Making Tavily API call', {
          operationId,
          attempt,
          query: options.query,
          search_depth: options.search_depth,
          max_results: options.max_results
        });

        // Prepare request body
        const requestBody = {
          api_key: this.config.apiKey,
          query: options.query,
          search_depth: options.search_depth || 'basic',
          topic: options.topic || 'general',
          max_results: options.max_results || 5,
          include_images: options.include_images || false,
          include_answer: options.include_answer || false,
          include_raw_content: options.include_raw_content || false,
          ...(options.include_domains && { include_domains: options.include_domains }),
          ...(options.exclude_domains && { exclude_domains: options.exclude_domains })
        };

        // Prepare headers
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...this.config.customHeaders
        };

        // Make API request
        const response = await fetch(`${this.config.baseUrl}/search`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(this.config.timeout)
        });

        const responseData = await response.json();

        if (!response.ok) {
          throw new Error(`Tavily API error: ${response.status} ${response.statusText} - ${JSON.stringify(responseData)}`);
        }

        // Validate response structure
        if (!responseData.results || !Array.isArray(responseData.results)) {
          throw new Error('Invalid response structure from Tavily API');
        }

        this.requestCount++;
        this.lastRequestTime = Date.now();

        logger.info('✅ TavilyService: Tavily API call successful', {
          operationId,
          attempt,
          executionTime: Date.now() - startTime,
          resultsCount: responseData.results.length,
          query: responseData.query
        });

        return {
          success: true,
          data: responseData as TavilyApiResponse,
          retryCount: attempt - 1,
          operationId
        };

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        logger.warn(`⚠️ TavilyService: Tavily API call failed (attempt ${attempt}/${this.config.maxRetries})`, {
          operationId,
          error: errorMessage,
          attempt,
          query: options.query
        });

        // Check if this is a non-retryable error
        if (this.isNonRetryableError(error as Error)) {
          logger.error('❌ TavilyService: Non-retryable error encountered', {
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
          logger.error('❌ TavilyService: All retry attempts failed', {
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
        logger.info(`⏳ TavilyService: Retrying in ${delay}ms...`, { operationId, attempt });
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
   * Extract search terms from idea summary
   * 
   * @param summary - The generated summary
   * @param customTerms - Optional custom search terms
   * @returns Array of search terms
   */
  private extractSearchTerms(summary: string, customTerms?: string[]): string[] {
    const searchTerms: string[] = [];

    // Add custom terms first if provided
    if (customTerms?.length) {
      searchTerms.push(...customTerms);
    }

    // Extract project name if available
    const projectNameMatch = summary.match(/# (.*?)(?:\n|$)/);
    if (projectNameMatch && projectNameMatch[1]) {
      const projectName = projectNameMatch[1].trim();
      searchTerms.push(`"${projectName}" app`);
      searchTerms.push(`${projectName} product`);
    }

    // Extract description and create searches
    const descriptionMatch = summary.match(/## Project Description\s*\n(.*?)(?:\n##|$)/s);
    if (descriptionMatch && descriptionMatch[1]) {
      const description = descriptionMatch[1].trim();
      
      // Extract key phrases for search
      const keywords = this.extractKeywords(description);
      searchTerms.push(...keywords.map(k => `${k} software`));
      searchTerms.push(...keywords.map(k => `${k} app`));
    }

    // Extract target audience
    const audienceMatch = summary.match(/## Target Audience\s*\n(.*?)(?:\n##|$)/s);
    if (audienceMatch && audienceMatch[1]) {
      const audience = audienceMatch[1].trim();
      const audienceKeywords = this.extractKeywords(audience);
      searchTerms.push(...audienceKeywords.map(k => `${k} solution`));
    }

    // Remove duplicates and limit to reasonable number
    const uniqueTerms = [...new Set(searchTerms)];
    
    // Generic searches if we don't have enough specific terms
    if (uniqueTerms.length < 3) {
      uniqueTerms.push('similar product ideas', 'existing solutions', 'market competition');
    }

    return uniqueTerms.slice(0, 6); // Limit to 6 searches maximum
  }

  /**
   * Extract keywords from text for search
   * 
   * @param text - Text to extract keywords from
   * @returns Array of keywords
   */
  private extractKeywords(text: string): string[] {
    // Simple keyword extraction - look for meaningful phrases
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    // Filter out common words
    const stopWords = new Set([
      'this', 'that', 'with', 'have', 'will', 'from', 'they', 'been', 
      'their', 'would', 'there', 'could', 'other', 'into', 'after',
      'first', 'well', 'also', 'some', 'what', 'your', 'when',
      'make', 'time', 'very', 'just', 'how', 'much', 'new', 'way'
    ]);
    
    const keywords = words.filter(word => !stopWords.has(word));
    
    // Return top keywords
    return keywords.slice(0, 5);
  }

  /**
   * Extract competitors from search results
   * 
   * @param searchResults - Array of search results
   * @returns Array of competitor information
   */
  private extractCompetitors(searchResults: MarketResearchResponse['searchResults']): MarketResearchResponse['competitors'] {
    const competitors: MarketResearchResponse['competitors'] = [];
    
    for (const searchGroup of searchResults) {
      for (const result of searchGroup.results) {
        // Look for results that seem like products or companies
        if (this.isCompetitorResult(result)) {
          competitors.push({
            name: this.extractCompanyName(result.title),
            url: result.url,
            description: result.content.substring(0, 200) + '...',
            relevanceScore: result.score
          });
        }
      }
    }

    // Sort by relevance score and limit to top 3 competitors
    return competitors
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 3);
  }

  /**
   * Check if a search result represents a potential competitor
   * 
   * @param result - Search result to check
   * @returns True if likely a competitor
   */
  private isCompetitorResult(result: TavilySearchResult): boolean {
    const content = `${result.title} ${result.content}`.toLowerCase();
    
    // Look for indicators that this is a product/service
    const productIndicators = [
      'app', 'software', 'platform', 'service', 'solution', 'product',
      'startup', 'company', 'business', 'tool', 'website', 'download'
    ];
    
    return productIndicators.some(indicator => content.includes(indicator));
  }

  /**
   * Extract company/product name from title
   * 
   * @param title - Title to extract name from
   * @returns Extracted name
   */
  private extractCompanyName(title: string): string {
    // Simple extraction - take first part before common separators
    const separators = [' - ', ' | ', ' : ', ' — '];
    
    for (const separator of separators) {
      if (title.includes(separator)) {
        const parts = title.split(separator);
        return parts[0]?.trim() || title;
      }
    }
    
    // If no separators, take first few words
    const words = title.split(' ');
    return words.slice(0, 3).join(' ');
  }

  /**
   * Generate market summary from search results
   * 
   * @param searchResults - Search results to analyze
   * @param competitors - Found competitors
   * @returns Market summary text
   */
  private generateMarketSummary(
    searchResults: MarketResearchResponse['searchResults'], 
    competitors: MarketResearchResponse['competitors']
  ): string {
    if (searchResults.length === 0) {
      return "No search results found. This could indicate a unique market opportunity.";
    }

    const totalResults = searchResults.reduce((sum, group) => sum + group.results.length, 0);
    const competitorCount = competitors.length;

    let summary = `Market Research Results:\n\n`;
    summary += `• Found ${totalResults} relevant results across ${searchResults.length} search queries\n`;
    summary += `• Identified ${competitorCount} potential competitors or similar solutions\n\n`;

    if (competitorCount > 0) {
      summary += `Key Competitors Found:\n`;
      competitors.slice(0, 3).forEach((comp, index) => {
        summary += `${index + 1}. ${comp.name} - ${comp.description}\n`;
      });
    } else {
      summary += `No direct competitors found, which could indicate:\n`;
      summary += `• A unique market opportunity\n`;
      summary += `• A niche market with low online presence\n`;
      summary += `• Need for more specific search terms\n`;
    }

    summary += `\nRecommendation: Review the search results below to assess the competitive landscape and validate your idea's uniqueness.`;

    return summary;
  }

  /**
   * Enforce rate limiting between requests
   */
  private async enforceRateLimit(): Promise<void> {
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      logger.debug('⏳ TavilyService: Rate limiting - waiting', { waitTime });
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
    
    // Don't retry on quota exceeded
    if (errorMessage.includes('quota exceeded') || errorMessage.includes('rate limit')) {
      return true;
    }

    // Don't retry on 400 Bad Request
    if (errorMessage.includes('400') || errorMessage.includes('bad request')) {
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
    };
  } {
    return {
      requestCount: this.requestCount,
      lastRequestTime: this.lastRequestTime,
      config: {
        baseUrl: this.config.baseUrl,
        timeout: this.config.timeout,
        maxRetries: this.config.maxRetries,
        hasApiKey: !!this.config.apiKey
      }
    };
  }
}

/**
 * Create a TavilyService instance with environment configuration
 * 
 * @returns Configured TavilyService instance
 * @throws Error if required environment variables are missing
 */
export function createTavilyService(): TavilyService {
  logger.info('🏭 Creating TavilyService from environment configuration');

  const apiKey = process.env.TAVILY_API_KEY;
  
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY environment variable is required');
  }

  // Create configuration from environment
  const config: TavilyConfig = {
    apiKey,
    baseUrl: process.env.TAVILY_BASE_URL || DEFAULT_TAVILY_CONFIG.baseUrl,
    timeout: parseInt(process.env.TAVILY_TIMEOUT || '30000'),
    maxRetries: parseInt(process.env.TAVILY_MAX_RETRIES || '3'),
    retryDelay: parseInt(process.env.TAVILY_RETRY_DELAY || '1000')
  };

  logger.info('✅ TavilyService configuration created', {
    hasApiKey: !!config.apiKey,
    baseUrl: config.baseUrl,
    timeout: config.timeout,
    maxRetries: config.maxRetries
  });

  return new TavilyService(config);
}

/**
 * Export types for external use
 */
export type {
  TavilyConfig,
  TavilySearchOptions,
  TavilySearchResult,
  TavilyApiResponse,
  MarketResearchRequest,
  MarketResearchResponse,
  TavilyServiceResult
};
