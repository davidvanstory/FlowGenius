/**
 * Chat Component
 * 
 * OpenAI-style chat interface with message display, auto-scrolling, and continuous thread design.
 * Handles message rendering, typing indicators, and proper accessibility features.
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { ChatMessage, WorkflowStage } from '../types/AppState';
import { logger } from '../utils/logger';

/**
 * Props interface for the Chat component
 */
export interface ChatProps {
  /** Array of chat messages to display */
  messages: ChatMessage[];
  /** Current workflow stage for context */
  currentStage: WorkflowStage;
  /** Whether the AI is currently processing/typing */
  isProcessing?: boolean;
  /** Whether the AI is specifically generating a summary */
  isGeneratingSummary?: boolean;
  /** Whether to auto-scroll to bottom on new messages */
  autoScroll?: boolean;
  /** Custom welcome message component */
  welcomeComponent?: React.ReactNode;
  /** Callback when user scrolls to see if they're at bottom */
  onScrollChange?: (isAtBottom: boolean) => void;
  /** Custom message actions (copy, regenerate, etc.) */
  onMessageAction?: (action: string, messageIndex: number) => void;
}

/**
 * Props for individual message components
 */
interface MessageProps {
  message: ChatMessage;
  index: number;
  onAction?: (action: string, index: number) => void;
}

/**
 * Individual message component with proper styling and interactions
 */
const Message = ({ message, index, onAction }: MessageProps) => {
  const messageRef = useRef<HTMLDivElement>(null);

  /**
   * Format timestamp for display
   */
  const formattedTime = useMemo(() => {
    if (!message.created_at) return '';
    
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(message.created_at));
  }, [message.created_at]);

  /**
   * Get stage badge styling
   */
  const stageBadgeStyle = useMemo(() => {
    const styles: Record<WorkflowStage, string> = {
      brainstorm: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      summary: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      prd: 'bg-green-500/10 text-green-400 border-green-500/20',
      market_research: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    };
    return styles[message.stage_at_creation || 'brainstorm'];
  }, [message.stage_at_creation]);

  /**
   * Handle message actions (copy, regenerate, etc.)
   */
  const handleAction = useCallback((action: string) => {
    logger.debug('🔧 Message action triggered', { action, messageIndex: index, messageRole: message.role });
    onAction?.(action, index);
  }, [index, message.role, onAction]);

  /**
   * Copy message content to clipboard
   */
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      logger.info('📋 Message copied to clipboard', { messageIndex: index });
      // TODO: Show toast notification
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Failed to copy message', { error: errorMessage, messageIndex: index });
    }
  }, [message.content, index]);

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  return (
    <div
      ref={messageRef}
      className={`
        group relative flex gap-4 px-4 py-6 transition-colors duration-200
        ${isUser ? 'bg-white' : 'bg-gray-50'}
        hover:bg-gray-100/60
      `}
      role="article"
      aria-label={`${message.role} message`}
    >
      {/* Message Avatar */}
      <div className="flex-shrink-0">
        <div
          className={`
            w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold
            ${isUser 
              ? 'bg-emerald-600 text-white' 
              : 'bg-gray-800 text-white'
            }
          `}
          aria-hidden="true"
        >
          {isUser ? 'U' : 'AI'}
        </div>
      </div>

      {/* Message Content */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* Message Header */}
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-gray-800">
            {isUser ? 'You' : 'Deep Thinker'}
          </span>
          {formattedTime && (
            <span className="text-gray-600">{formattedTime}</span>
          )}
          {message.stage_at_creation && (
            <span className={`
              px-2 py-1 text-xs font-medium rounded-full border
              ${stageBadgeStyle}
            `}>
              {message.stage_at_creation}
            </span>
          )}
        </div>

        {/* Message Text */}
        <div
          className={`
            prose prose-sm max-w-none leading-relaxed
            ${isUser ? 'prose-emerald' : 'prose-gray'}
          `}
        >
          {/* Handle line breaks and basic formatting */}
          {message.content.split('\n').map((line, lineIndex) => (
            <p key={lineIndex} className={`${lineIndex === 0 ? 'mt-0' : ''} text-gray-800 font-normal`}>
              {line || '\u00A0'} {/* Non-breaking space for empty lines */}
            </p>
          ))}
        </div>

        {/* Image Display (if present) */}
        {message.image_url && (
          <div className="mt-3">
            <img
              src={message.image_url}
              alt="Uploaded image"
              className="max-w-sm rounded-lg border border-gray-200 shadow-sm"
              loading="lazy"
            />
          </div>
        )}

        {/* Message Actions */}
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={handleCopy}
            className="
              p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100
              focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2
              transition-colors duration-200
            "
            aria-label="Copy message"
            title="Copy message"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>

          {isAssistant && onAction && (
            <button
              onClick={() => handleAction('regenerate')}
              className="
                p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100
                focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2
                transition-colors duration-200
              "
              aria-label="Regenerate response"
              title="Regenerate response"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Enhanced typing indicator component that shows different messages based on context
 */
const TypingIndicator = ({ currentStage, isGeneratingSummary }: { 
  currentStage: WorkflowStage; 
  isGeneratingSummary?: boolean; 
}) => {
  /**
   * Get appropriate loading message based on context
   */
  const loadingMessage = useMemo(() => {
    logger.debug('🔄 TypingIndicator: Determining loading message', { 
      currentStage, 
      isGeneratingSummary 
    });

    if (isGeneratingSummary) {
      return 'analyzing conversation and generating summary...';
    }

    switch (currentStage) {
      case 'brainstorm':
        return 'thinking about your idea...';
      case 'summary':
        return 'processing your request...';
      case 'prd':
        return 'creating product requirements...';
      default:
        return 'processing your request...';
    }
  }, [currentStage, isGeneratingSummary]);

  /**
   * Get appropriate loading icon based on context
   */
  const loadingIcon = useMemo(() => {
    if (isGeneratingSummary) {
      return '📄'; // Document icon for summary generation
    }

    switch (currentStage) {
      case 'brainstorm':
        return '💭'; // Thought bubble for brainstorming
      case 'summary':
        return '📋'; // Clipboard for summary stage
      case 'prd':
        return '📝'; // Memo for PRD stage
      default:
        return '🤖'; // Robot for generic processing
    }
  }, [currentStage, isGeneratingSummary]);

  return (
    <div className="flex gap-4 px-4 py-6 bg-gray-50">
      <div className="flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-gray-800 text-white flex items-center justify-center text-sm font-semibold">
          AI
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-gray-800">Deep Thinker</span>
          <span className="text-gray-600">{loadingMessage}</span>
          {isGeneratingSummary && (
            <span className="text-blue-600 text-xs font-medium px-2 py-1 bg-blue-50 rounded-full border border-blue-200 summary-generation-indicator">
              Generating Summary
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"
                style={{
                  animationDelay: `${i * 0.2}s`,
                  animationDuration: '1.4s',
                }}
              />
            ))}
          </div>
          <span className={`text-xl animate-pulse ${isGeneratingSummary ? 'loading-icon-bounce' : ''}`}>
            {loadingIcon}
          </span>
          {isGeneratingSummary && (
            <span className="text-xs text-gray-500 ml-2">
              This may take a few moments...
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Default welcome message component
 */
const DefaultWelcome = ({ currentStage }: { currentStage: WorkflowStage }) => (
  <div className="flex-1 flex items-center justify-center p-8">
    <div className="text-center max-w-md space-y-6">
      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
        <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      
      <div className="space-y-2">
        <h3 className="text-xl font-semibold text-gray-900">
          Talk to me, what's up?
        </h3>
      </div>


    </div>
  </div>
);

/**
 * Main Chat component
 */
export const Chat = ({
  messages,
  currentStage,
  isProcessing = false,
  isGeneratingSummary = false,
  autoScroll = true,
  welcomeComponent,
  onScrollChange,
  onMessageAction,
}: ChatProps) => {
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef(true);

  /**
   * Scroll to bottom of chat
   */
  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'end',
      });
    }
  }, []);

  /**
   * Check if user is at bottom of chat
   */
  const checkIfAtBottom = useCallback(() => {
    if (!chatContainerRef.current) return false;
    
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const threshold = 100; // pixels from bottom
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - threshold;
    
    return isAtBottom;
  }, []);

  /**
   * Handle scroll events
   */
  const handleScroll = useCallback(() => {
    const isAtBottom = checkIfAtBottom();
    isUserAtBottomRef.current = isAtBottom;
    onScrollChange?.(isAtBottom);
  }, [checkIfAtBottom, onScrollChange]);

  /**
   * Auto-scroll to bottom when new messages arrive
   */
  useEffect(() => {
    if (autoScroll && isUserAtBottomRef.current) {
      // Small delay to ensure DOM has updated
      const timeoutId = setTimeout(() => scrollToBottom(), 100);
      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [messages.length, autoScroll, scrollToBottom]);

  /**
   * Auto-scroll when processing state changes
   */
  useEffect(() => {
    if (isProcessing && isUserAtBottomRef.current) {
      const timeoutId = setTimeout(() => scrollToBottom(), 100);
      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [isProcessing, scrollToBottom]);

  /**
   * Log chat interactions
   */
  useEffect(() => {
    logger.debug('💬 Chat component rendered', {
      messageCount: messages.length,
      currentStage,
      isProcessing,
      isGeneratingSummary,
      isAtBottom: isUserAtBottomRef.current,
    });
  }, [messages.length, currentStage, isProcessing, isGeneratingSummary]);

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Chat Messages Container */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto scroll-smooth"
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {!hasMessages ? (
          // Welcome message when no messages
          welcomeComponent || <DefaultWelcome currentStage={currentStage} />
        ) : (
          // Messages list
          <div className="divide-y divide-gray-100">
            {messages.map((message, index) => (
              <Message
                key={`${message.created_at?.getTime() || Date.now()}-${index}`}
                message={message}
                index={index}
                onAction={onMessageAction}
              />
            ))}
            
            {/* Enhanced typing indicator with summary generation context */}
            {isProcessing && (
              <TypingIndicator 
                currentStage={currentStage} 
                isGeneratingSummary={isGeneratingSummary}
              />
            )}
          </div>
        )}
        
        {/* Scroll anchor */}
        <div ref={messagesEndRef} className="h-px" aria-hidden="true" />
      </div>

      {/* Scroll to bottom button (when not at bottom) */}
      {hasMessages && !isUserAtBottomRef.current && (
        <div className="absolute bottom-4 right-4">
          <button
            onClick={() => scrollToBottom()}
            className="
              p-2 bg-white border border-gray-200 rounded-full shadow-lg
              hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2
              transition-all duration-200
            "
            aria-label="Scroll to bottom"
            title="Scroll to bottom"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default Chat; 