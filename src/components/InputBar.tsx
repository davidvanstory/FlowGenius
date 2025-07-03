/**
 * InputBar Component
 * 
 * Bottom input bar component for FlowGenius with text field, microphone, and upload functionality.
 * Styled to match OpenAI's ChatGPT interface with modern design patterns.
 * 
 * Features:
 * - Text input with auto-resize
 * - Microphone icon for voice input
 * - Upload icon for file attachments
 * - Send button with proper state management
 * - Keyboard shortcuts (Enter to send, Shift+Enter for new line)
 * - Accessibility features
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { logger } from '../utils/logger';

/**
 * Props interface for InputBar component
 */
interface InputBarProps {
  /** Current message being typed */
  value: string;
  /** Callback when input value changes */
  onChange: (value: string) => void;
  /** Callback when message is sent */
  onSend: (message: string) => void;
  /** Callback when voice recording is requested */
  onVoiceRecord?: () => void;
  /** Callback when file upload is requested */
  onFileUpload?: () => void;
  /** Callback when generate summary is requested */
  onGenerateSummary?: () => void;
  /** Whether the application is currently processing */
  isProcessing?: boolean;
  /** Whether voice recording is available */
  isVoiceEnabled?: boolean;
  /** Whether file upload is available */
  isUploadEnabled?: boolean;
  /** Whether generate summary is available */
  isSummaryEnabled?: boolean;
  /** Current workflow stage */
  currentStage?: string;
  /** Whether there are messages to summarize */
  hasMessages?: boolean;
  /** Placeholder text for the input field */
  placeholder?: string;
  /** Maximum character limit */
  maxLength?: number;
  /** Whether the input is disabled */
  disabled?: boolean;
}

/**
 * InputBar component for message input with voice and file upload capabilities
 */
export const InputBar: React.FC<InputBarProps> = ({
  value,
  onChange,
  onSend,
  onVoiceRecord,
  onFileUpload,
  onGenerateSummary,
  isProcessing = false,
  isVoiceEnabled = false,
  isUploadEnabled = false,
  isSummaryEnabled = false,
  currentStage = 'brainstorm',
  hasMessages = false,
  placeholder = "Message Deep Thinker...",
  maxLength = 4000,
  disabled = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isComposing, setIsComposing] = useState(false);

  /**
   * Auto-resize textarea based on content
   */
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to calculate new height
    textarea.style.height = 'auto';
    
    // Calculate new height (max 5 lines)
    const lineHeight = 24; // 1.5rem in pixels
    const maxHeight = lineHeight * 5;
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    
    textarea.style.height = `${newHeight}px`;
    
    logger.debug('📏 Textarea height adjusted', { 
      scrollHeight: textarea.scrollHeight, 
      newHeight,
      maxHeight 
    });
  }, []);

  /**
   * Handle input change with character limit enforcement
   */
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    
    // Enforce character limit
    if (newValue.length > maxLength) {
      logger.warn('⚠️ Character limit exceeded', { 
        currentLength: newValue.length, 
        maxLength 
      });
      return;
    }

    onChange(newValue);
    logger.debug('✏️ Input value changed', { 
      length: newValue.length, 
      maxLength,
      hasContent: newValue.trim().length > 0
    });
  }, [onChange, maxLength]);

  /**
   * Handle send message
   */
  const handleSend = useCallback(() => {
    const trimmedValue = value.trim();
    
    if (!trimmedValue || isProcessing || disabled) {
      logger.debug('🚫 Send blocked', { 
        hasContent: !!trimmedValue, 
        isProcessing, 
        disabled 
      });
      return;
    }

    logger.info('📤 Sending message', { 
      messageLength: trimmedValue.length,
      messagePreview: trimmedValue.substring(0, 50) + (trimmedValue.length > 50 ? '...' : '')
    });

    onSend(trimmedValue);
  }, [value, onSend, isProcessing, disabled]);

  /**
   * Handle keyboard shortcuts
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Don't handle shortcuts during composition (IME input)
    if (isComposing) return;

    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Shift+Enter: new line (default behavior)
        logger.debug('⤵️ New line added with Shift+Enter');
        return;
      } else {
        // Enter: send message
        e.preventDefault();
        handleSend();
      }
    }

    // Escape: clear input
    if (e.key === 'Escape') {
      onChange('');
      logger.debug('🗑️ Input cleared with Escape key');
    }
  }, [isComposing, handleSend, onChange]);

  /**
   * Handle voice recording
   */
  const handleVoiceRecord = useCallback(() => {
    if (!isVoiceEnabled || isProcessing || disabled) {
      logger.debug('🚫 Voice recording blocked', { 
        isVoiceEnabled, 
        isProcessing, 
        disabled 
      });
      return;
    }

    logger.info('🎤 Voice recording requested');
    onVoiceRecord?.();
  }, [isVoiceEnabled, isProcessing, disabled, onVoiceRecord]);

  /**
   * Handle file upload
   */
  const handleFileUpload = useCallback(() => {
    if (!isUploadEnabled || isProcessing || disabled) {
      logger.debug('🚫 File upload blocked', { 
        isUploadEnabled, 
        isProcessing, 
        disabled 
      });
      return;
    }

    logger.info('📎 File upload requested');
    onFileUpload?.();
  }, [isUploadEnabled, isProcessing, disabled, onFileUpload]);

  /**
   * Handle generate summary
   */
  const handleGenerateSummary = useCallback(() => {
    if (!isSummaryEnabled || isProcessing || disabled || currentStage !== 'brainstorm' || !hasMessages) {
      logger.debug('🚫 Generate summary blocked', { 
        isSummaryEnabled, 
        isProcessing, 
        disabled,
        currentStage,
        hasMessages
      });
      return;
    }

    logger.info('📄 Generate summary requested');
    onGenerateSummary?.();
  }, [isSummaryEnabled, isProcessing, disabled, currentStage, hasMessages, onGenerateSummary]);

  /**
   * Auto-resize textarea when value changes
   */
  useEffect(() => {
    adjustTextareaHeight();
  }, [value, adjustTextareaHeight]);

  /**
   * Focus textarea on mount
   */
  useEffect(() => {
    if (textareaRef.current && !disabled) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  const canSend = value.trim().length > 0 && !isProcessing && !disabled;
  const remainingChars = maxLength - value.length;
  const isNearLimit = remainingChars < 100;

  logger.debug('🎨 InputBar render', {
    valueLength: value.length,
    canSend,
    isProcessing,
    isFocused,
    isVoiceEnabled,
    isUploadEnabled,
    isSummaryEnabled,
    currentStage,
    hasMessages
  });

  return (
    <div className="input-bar-container">
      {/* Character count warning */}
      {isNearLimit && (
        <div className="character-warning">
          <span className={remainingChars < 20 ? 'text-red-400' : 'text-yellow-400'}>
            {remainingChars} characters remaining
          </span>
        </div>
      )}

      {/* Main input area */}
      <div className={`input-bar ${isFocused ? 'focused' : ''} ${disabled ? 'disabled' : ''}`}>
        {/* File upload button */}
        <button
          type="button"
          onClick={handleFileUpload}
          disabled={!isUploadEnabled || isProcessing || disabled}
          className="input-action-button upload-button"
          aria-label="Upload file"
          title="Upload file"
        >
          📎
        </button>

        {/* Text input area */}
        <div className="input-text-container">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder={placeholder}
            disabled={disabled || isProcessing}
            maxLength={maxLength}
            rows={1}
            className="input-textarea"
            aria-label="Message input"
          />
        </div>

        {/* Generate Summary button (only in brainstorm stage with messages) */}
        {currentStage === 'brainstorm' && hasMessages && (
          <button
            type="button"
            onClick={handleGenerateSummary}
            disabled={!isSummaryEnabled || isProcessing || disabled}
            className={`
              input-action-button summary-button
              ${(isSummaryEnabled && hasMessages && currentStage === 'brainstorm' && !isProcessing) ? 'enabled' : 'disabled'}
            `}
            aria-label="Generate summary"
            title="Generate summary of this brainstorming session"
          >
            📄
          </button>
        )}

        {/* Voice recording button */}
        <button
          type="button"
          onClick={handleVoiceRecord}
          disabled={!isVoiceEnabled || isProcessing || disabled}
          className="input-action-button voice-button"
          aria-label="Record voice message"
          title="Record voice message"
        >
          🎤
        </button>

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className={`input-action-button send-button ${canSend ? 'enabled' : 'disabled'}`}
          aria-label="Send message"
          title="Send message"
        >
          {isProcessing ? (
            <div style={{ 
              width: '16px', 
              height: '16px', 
              border: '2px solid #8e8ea0', 
              borderTop: '2px solid #10a37f', 
              borderRadius: '50%', 
              animation: 'spin 1s linear infinite' 
            }}>
            </div>
          ) : (
            '▶️'
          )}
        </button>
      </div>


    </div>
  );
};

export default InputBar; 