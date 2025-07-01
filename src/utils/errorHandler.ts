/**
 * Global Error Handling Utility for FlowGenius
 * 
 * This utility provides comprehensive error handling capabilities across the entire application,
 * including user-friendly error messages, error classification, recovery suggestions, and
 * integration with the centralized logging system.
 * 
 * Features:
 * - Error classification and categorization
 * - User-friendly error message generation
 * - Error recovery suggestions
 * - Integration with React Error Boundaries
 * - API error handling with retry logic
 * - Database error handling
 * - Audio/media error handling
 * - LangGraph workflow error handling
 * - Automatic error reporting and logging
 */

import { logger, type LogMetadata } from './logger';

/**
 * Error severity levels for prioritization and handling
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Error categories for classification and specific handling
 */
export enum ErrorCategory {
  NETWORK = 'network',
  API = 'api',
  DATABASE = 'database',
  AUTHENTICATION = 'auth',
  PERMISSION = 'permission',
  VALIDATION = 'validation',
  AUDIO = 'audio',
  FILE_SYSTEM = 'file_system',
  WORKFLOW = 'workflow',
  UI = 'ui',
  UNKNOWN = 'unknown'
}

/**
 * Error recovery action types
 */
export enum RecoveryAction {
  RETRY = 'retry',
  REFRESH = 'refresh',
  LOGIN = 'login',
  CONTACT_SUPPORT = 'contact_support',
  CHECK_CONNECTION = 'check_connection',
  CHECK_PERMISSIONS = 'check_permissions',
  TRY_AGAIN_LATER = 'try_again_later',
  NONE = 'none'
}

/**
 * Structured error information interface
 */
export interface ErrorInfo {
  /** Unique error identifier for tracking */
  id: string;
  /** Error category for classification */
  category: ErrorCategory;
  /** Error severity level */
  severity: ErrorSeverity;
  /** User-friendly error message */
  userMessage: string;
  /** Technical error message for developers */
  technicalMessage: string;
  /** Suggested recovery actions */
  recoveryActions: RecoveryAction[];
  /** Additional context metadata */
  metadata?: LogMetadata;
  /** Timestamp when error occurred */
  timestamp: Date;
  /** Whether this error should be reported to external services */
  shouldReport: boolean;
  /** Stack trace if available */
  stack?: string;
}

/**
 * Error recovery suggestion interface
 */
export interface RecoverySuggestion {
  action: RecoveryAction;
  label: string;
  description: string;
  isAutomatic?: boolean;
}

/**
 * User-friendly error messages mapped by category and common error patterns
 */
const USER_FRIENDLY_MESSAGES: Record<ErrorCategory, Record<string, string>> = {
  [ErrorCategory.NETWORK]: {
    'fetch_failed': 'Unable to connect to the server. Please check your internet connection.',
    'timeout': 'The request took too long to complete. Please try again.',
    'offline': 'You appear to be offline. Please check your internet connection.',
    'default': 'A network error occurred. Please check your connection and try again.'
  },
  [ErrorCategory.API]: {
    'unauthorized': 'Your session has expired. Please log in again.',
    'forbidden': 'You don\'t have permission to perform this action.',
    'not_found': 'The requested resource could not be found.',
    'rate_limit': 'Too many requests. Please wait a moment and try again.',
    'server_error': 'The server encountered an error. Please try again later.',
    'openai_error': 'AI service is temporarily unavailable. Please try again.',
    'whisper_error': 'Voice processing failed. Please try recording again.',
    'default': 'An API error occurred. Please try again.'
  },
  [ErrorCategory.DATABASE]: {
    'connection_failed': 'Unable to connect to the database. Please try again.',
    'query_failed': 'Database operation failed. Please try again.',
    'constraint_violation': 'The data provided is invalid or conflicts with existing records.',
    'timeout': 'Database operation timed out. Please try again.',
    'default': 'A database error occurred. Please try again.'
  },
  [ErrorCategory.AUTHENTICATION]: {
    'invalid_credentials': 'Invalid username or password. Please try again.',
    'session_expired': 'Your session has expired. Please log in again.',
    'account_locked': 'Your account has been temporarily locked. Please contact support.',
    'default': 'Authentication failed. Please try logging in again.'
  },
  [ErrorCategory.PERMISSION]: {
    'microphone': 'Microphone access is required. Please allow microphone permissions.',
    'camera': 'Camera access is required for this feature. Please enable it in your browser settings.',
    'storage': 'Storage access is required. Please enable it in your browser settings.',
    'default': 'Permission denied. Please check your browser settings.'
  },
  [ErrorCategory.VALIDATION]: {
    'invalid_input': 'The information you entered is not valid. Please check and try again.',
    'required_field': 'Please fill in all required fields.',
    'invalid_format': 'The format of the data you entered is incorrect.',
    'default': 'Please check your input and try again.'
  },
  [ErrorCategory.AUDIO]: {
    'permission_denied': 'Microphone access is required. Please allow microphone permissions.',
    'recording_failed': 'Voice recording failed. Please check your microphone and try again.',
    'playback_failed': 'Audio playback failed. Please try again.',
    'format_unsupported': 'This audio format is not supported.',
    'device_unavailable': 'No microphone found. Please connect a microphone and try again.',
    'default': 'An audio error occurred. Please check your microphone and try again.'
  },
  [ErrorCategory.FILE_SYSTEM]: {
    'file_not_found': 'The requested file could not be found.',
    'access_denied': 'Access to the file was denied.',
    'disk_full': 'Not enough storage space available.',
    'default': 'A file system error occurred.'
  },
  [ErrorCategory.WORKFLOW]: {
    'node_execution_failed': 'A step in the process failed. Please try again.',
    'invalid_state': 'The application is in an invalid state. Please refresh the page.',
    'transition_failed': 'Unable to proceed to the next step. Please try again.',
    'default': 'A workflow error occurred. Please try again.'
  },
  [ErrorCategory.UI]: {
    'component_crash': 'A component stopped working. Please refresh the page.',
    'render_error': 'Unable to display this content. Please try refreshing.',
    'default': 'A display error occurred. Please refresh the page.'
  },
  [ErrorCategory.UNKNOWN]: {
    'default': 'An unexpected error occurred. Please try again or contact support if the problem persists.'
  }
};

/**
 * Recovery suggestions mapped by action type
 */
const RECOVERY_SUGGESTIONS: Record<RecoveryAction, RecoverySuggestion> = {
  [RecoveryAction.RETRY]: {
    action: RecoveryAction.RETRY,
    label: 'Try Again',
    description: 'Retry the operation that failed'
  },
  [RecoveryAction.REFRESH]: {
    action: RecoveryAction.REFRESH,
    label: 'Refresh Page',
    description: 'Refresh the page to reset the application state'
  },
  [RecoveryAction.LOGIN]: {
    action: RecoveryAction.LOGIN,
    label: 'Log In',
    description: 'Log in again to restore your session'
  },
  [RecoveryAction.CONTACT_SUPPORT]: {
    action: RecoveryAction.CONTACT_SUPPORT,
    label: 'Contact Support',
    description: 'Get help from our support team'
  },
  [RecoveryAction.CHECK_CONNECTION]: {
    action: RecoveryAction.CHECK_CONNECTION,
    label: 'Check Connection',
    description: 'Verify your internet connection and try again'
  },
  [RecoveryAction.CHECK_PERMISSIONS]: {
    action: RecoveryAction.CHECK_PERMISSIONS,
    label: 'Check Permissions',
    description: 'Review and update your browser permissions'
  },
  [RecoveryAction.TRY_AGAIN_LATER]: {
    action: RecoveryAction.TRY_AGAIN_LATER,
    label: 'Try Later',
    description: 'Wait a few minutes and try again'
  },
  [RecoveryAction.NONE]: {
    action: RecoveryAction.NONE,
    label: 'No Action',
    description: 'No specific action required'
  }
};

/**
 * Global Error Handler class
 */
export class ErrorHandler {
  private errorCount: Map<string, number> = new Map();
  private lastErrorTime: Map<string, number> = new Map();
  private errorReportingEnabled: boolean = true;

  /**
   * Generate a unique error ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Classify error based on error object and context
   */
  private classifyError(error: Error | string, context?: string): ErrorCategory {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorName = typeof error === 'string' ? '' : error.name;
    const stack = typeof error === 'string' ? '' : error.stack || '';

    // Database errors - check FIRST to avoid misclassification with network
    if (context?.includes('database') || context?.includes('supabase') ||
        context?.includes('db') || errorMessage.includes('database') || 
        errorMessage.includes('query') || errorMessage.includes('sql') ||
        errorMessage.includes('connection_string') || errorMessage.includes('db error')) {
      return ErrorCategory.DATABASE;
    }

    // API errors
    if (context?.includes('api') || errorMessage.includes('API') || 
        errorMessage.includes('openai') || errorMessage.includes('whisper')) {
      return ErrorCategory.API;
    }

    // Network errors - check after database to avoid conflicts
    if (errorMessage.includes('fetch') || errorMessage.includes('network') || 
        (errorMessage.includes('connection') && !errorMessage.includes('database')) || 
        errorName === 'NetworkError') {
      return ErrorCategory.NETWORK;
    }

    // Authentication errors
    if (errorMessage.includes('auth') || errorMessage.includes('unauthorized') ||
        errorMessage.includes('login') || errorMessage.includes('session')) {
      return ErrorCategory.AUTHENTICATION;
    }

    // Permission errors - check for access/permission related issues first
    if (errorMessage.includes('permission') || errorMessage.includes('denied') ||
        (errorMessage.includes('microphone') && errorMessage.includes('denied')) ||
        (errorMessage.includes('camera') && errorMessage.includes('denied')) ||
        errorMessage.includes('access denied')) {
      return ErrorCategory.PERMISSION;
    }

    // Validation errors
    if (errorMessage.includes('validation') || errorMessage.includes('invalid') ||
        errorMessage.includes('required') || errorName === 'ValidationError') {
      return ErrorCategory.VALIDATION;
    }

    // Audio errors - exclude permission-related microphone errors
    if (context?.includes('audio') || errorMessage.includes('audio') ||
        errorMessage.includes('recording') || 
        (errorMessage.includes('microphone') && !errorMessage.includes('denied'))) {
      return ErrorCategory.AUDIO;
    }

    // File system errors
    if (errorMessage.includes('file') || errorMessage.includes('storage') ||
        errorName === 'FileSystemError') {
      return ErrorCategory.FILE_SYSTEM;
    }

    // Workflow errors
    if (context?.includes('workflow') || context?.includes('langgraph') ||
        errorMessage.includes('node') || errorMessage.includes('state')) {
      return ErrorCategory.WORKFLOW;
    }

    // UI errors
    if (context?.includes('component') || context?.includes('render') ||
        errorName === 'ChunkLoadError' || stack.includes('React')) {
      return ErrorCategory.UI;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Determine error severity based on category and context
   */
  private determineSeverity(category: ErrorCategory, error: Error | string): ErrorSeverity {
    const errorMessage = typeof error === 'string' ? error : error.message;

    switch (category) {
      case ErrorCategory.AUTHENTICATION:
      case ErrorCategory.DATABASE:
        return ErrorSeverity.HIGH;
      
      case ErrorCategory.NETWORK:
      case ErrorCategory.API:
        return errorMessage.includes('timeout') ? ErrorSeverity.MEDIUM : ErrorSeverity.HIGH;
      
      case ErrorCategory.PERMISSION:
        return ErrorSeverity.MEDIUM;
      
      case ErrorCategory.VALIDATION:
      case ErrorCategory.AUDIO:
        return ErrorSeverity.LOW;
      
      case ErrorCategory.FILE_SYSTEM:
      case ErrorCategory.WORKFLOW:
        return ErrorSeverity.HIGH;
      
      case ErrorCategory.UI:
        return ErrorSeverity.MEDIUM;
      
      default:
        return ErrorSeverity.MEDIUM;
    }
  }

  /**
   * Get user-friendly error message
   */
  private getUserFriendlyMessage(category: ErrorCategory, error: Error | string): string {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const categoryMessages = USER_FRIENDLY_MESSAGES[category];

    // Try to find a specific message based on error content
    for (const [key, message] of Object.entries(categoryMessages)) {
      if (key !== 'default' && errorMessage.toLowerCase().includes(key.replace('_', ' '))) {
        return message;
      }
    }

    // Return default message for category
    return categoryMessages.default || 'An error occurred. Please try again.';
  }

  /**
   * Determine recovery actions based on error category
   */
  private getRecoveryActions(category: ErrorCategory): RecoveryAction[] {
    switch (category) {
      case ErrorCategory.NETWORK:
        return [RecoveryAction.CHECK_CONNECTION, RecoveryAction.RETRY];
      
      case ErrorCategory.API:
        return [RecoveryAction.RETRY, RecoveryAction.TRY_AGAIN_LATER];
      
      case ErrorCategory.DATABASE:
        return [RecoveryAction.RETRY, RecoveryAction.REFRESH];
      
      case ErrorCategory.AUTHENTICATION:
        return [RecoveryAction.LOGIN, RecoveryAction.REFRESH];
      
      case ErrorCategory.PERMISSION:
        return [RecoveryAction.CHECK_PERMISSIONS, RecoveryAction.REFRESH];
      
      case ErrorCategory.VALIDATION:
        return [RecoveryAction.RETRY];
      
      case ErrorCategory.AUDIO:
        return [RecoveryAction.CHECK_PERMISSIONS, RecoveryAction.RETRY];
      
      case ErrorCategory.FILE_SYSTEM:
        return [RecoveryAction.RETRY, RecoveryAction.CONTACT_SUPPORT];
      
      case ErrorCategory.WORKFLOW:
        return [RecoveryAction.REFRESH, RecoveryAction.RETRY];
      
      case ErrorCategory.UI:
        return [RecoveryAction.REFRESH];
      
      default:
        return [RecoveryAction.RETRY, RecoveryAction.CONTACT_SUPPORT];
    }
  }

  /**
   * Check if error should be reported based on frequency and severity
   */
  private shouldReportError(errorInfo: ErrorInfo): boolean {
    if (!this.errorReportingEnabled) return false;

    const errorKey = `${errorInfo.category}_${errorInfo.technicalMessage}`;
    const now = Date.now();
    const lastTime = this.lastErrorTime.get(errorKey) || 0;
    const count = this.errorCount.get(errorKey) || 0;

    // Always report critical errors
    if (errorInfo.severity === ErrorSeverity.CRITICAL) {
      return true;
    }

    // Report high severity errors multiple times but with throttling
    if (errorInfo.severity === ErrorSeverity.HIGH) {
      // Allow reporting for first few occurrences or if enough time has passed
      return count < 3 || (now - lastTime >= 5 * 60 * 1000);
    }

    // Don't report if same error occurred recently (within 5 minutes) for medium/low severity
    if (now - lastTime < 5 * 60 * 1000 && count > 0) {
      return false;
    }

    // Report medium severity errors occasionally
    if (errorInfo.severity === ErrorSeverity.MEDIUM && count < 2) {
      return true;
    }

    // Don't report low severity errors frequently
    return errorInfo.severity === ErrorSeverity.LOW && count === 0;
  }

  /**
   * Update error tracking counters
   */
  private updateErrorTracking(errorInfo: ErrorInfo): void {
    const errorKey = `${errorInfo.category}_${errorInfo.technicalMessage}`;
    const currentCount = this.errorCount.get(errorKey) || 0;
    
    this.errorCount.set(errorKey, currentCount + 1);
    this.lastErrorTime.set(errorKey, Date.now());
  }

  /**
   * Handle and process an error
   */
  public handleError(
    error: Error | string,
    context?: string,
    metadata?: LogMetadata
  ): ErrorInfo {
    console.log(`🚨 ErrorHandler: Processing error`, { error, context, metadata });

    const category = this.classifyError(error, context);
    const severity = this.determineSeverity(category, error);
    const userMessage = this.getUserFriendlyMessage(category, error);
    const recoveryActions = this.getRecoveryActions(category);
    
    const technicalMessage = typeof error === 'string' ? error : error.message;
    const stack = typeof error === 'string' ? undefined : error.stack;

    const errorInfo: ErrorInfo = {
      id: this.generateErrorId(),
      category,
      severity,
      userMessage,
      technicalMessage,
      recoveryActions,
      metadata: {
        ...metadata,
        context,
        component: 'ErrorHandler'
      },
      timestamp: new Date(),
      shouldReport: false, // Will be determined below
      stack
    };

    // Determine if error should be reported (before updating tracking)
    errorInfo.shouldReport = this.shouldReportError(errorInfo);

    // Update tracking after determining reporting
    this.updateErrorTracking(errorInfo);

    // Log the error
    logger.error(`Error handled: ${userMessage}`, {
      ...errorInfo.metadata,
      errorId: errorInfo.id,
      category: errorInfo.category,
      severity: errorInfo.severity,
      technicalMessage: errorInfo.technicalMessage,
      shouldReport: errorInfo.shouldReport,
      error: typeof error === 'string' ? new Error(error) : error
    });

    console.log(`📊 ErrorHandler: Error processed`, {
      id: errorInfo.id,
      category: errorInfo.category,
      severity: errorInfo.severity,
      userMessage: errorInfo.userMessage,
      recoveryActions: errorInfo.recoveryActions
    });

    return errorInfo;
  }

  /**
   * Handle API errors with specific context
   */
  public handleApiError(
    error: Error | string,
    endpoint?: string,
    method?: string,
    statusCode?: number
  ): ErrorInfo {
    console.log(`🌐 ErrorHandler: Handling API error`, { error, endpoint, method, statusCode });

    return this.handleError(error, 'api', {
      endpoint,
      method,
      statusCode,
      action: 'api-call'
    });
  }

  /**
   * Handle database errors with specific context
   */
  public handleDatabaseError(
    error: Error | string,
    operation?: string,
    table?: string
  ): ErrorInfo {
    console.log(`🗄️ ErrorHandler: Handling database error`, { error, operation, table });

    return this.handleError(error, 'database', {
      operation,
      table,
      action: 'database-operation'
    });
  }

  /**
   * Handle audio/media errors with specific context
   */
  public handleAudioError(
    error: Error | string,
    operation?: string,
    deviceInfo?: any
  ): ErrorInfo {
    console.log(`🎤 ErrorHandler: Handling audio error`, { error, operation, deviceInfo });

    return this.handleError(error, 'audio', {
      operation,
      deviceInfo,
      action: 'audio-operation'
    });
  }

  /**
   * Handle workflow/LangGraph errors with specific context
   */
  public handleWorkflowError(
    error: Error | string,
    nodeName?: string,
    stateData?: any
  ): ErrorInfo {
    console.log(`⚙️ ErrorHandler: Handling workflow error`, { error, nodeName, stateData });

    return this.handleError(error, 'workflow', {
      nodeName,
      stateData: stateData ? JSON.stringify(stateData) : undefined,
      action: 'workflow-execution'
    });
  }

  /**
   * Get recovery suggestions for an error
   */
  public getRecoverySuggestions(errorInfo: ErrorInfo): RecoverySuggestion[] {
    console.log(`💡 ErrorHandler: Getting recovery suggestions for error ${errorInfo.id}`);

    return errorInfo.recoveryActions.map(action => RECOVERY_SUGGESTIONS[action]);
  }

  /**
   * Enable or disable error reporting
   */
  public setErrorReporting(enabled: boolean): void {
    console.log(`📋 ErrorHandler: Error reporting ${enabled ? 'enabled' : 'disabled'}`);
    this.errorReportingEnabled = enabled;
  }

  /**
   * Clear error tracking data (useful for testing or memory management)
   */
  public clearErrorTracking(): void {
    console.log(`🧹 ErrorHandler: Clearing error tracking data`);
    this.errorCount.clear();
    this.lastErrorTime.clear();
  }

  /**
   * Get error statistics for monitoring
   */
  public getErrorStats(): {
    totalErrors: number;
    errorsByCategory: Record<ErrorCategory, number>;
    recentErrors: number;
  } {
    const totalErrors = Array.from(this.errorCount.values()).reduce((sum, count) => sum + count, 0);
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    
    let recentErrors = 0;
    const errorsByCategory: Record<ErrorCategory, number> = {} as Record<ErrorCategory, number>;

    // Initialize category counts
    Object.values(ErrorCategory).forEach(category => {
      errorsByCategory[category] = 0;
    });

    // Count errors by category and recent errors
    for (const [errorKey, count] of this.errorCount.entries()) {
      const category = errorKey.split('_')[0] as ErrorCategory;
      errorsByCategory[category] += count;

      const lastTime = this.lastErrorTime.get(errorKey) || 0;
      if (lastTime > oneHourAgo) {
        recentErrors += count;
      }
    }

    return {
      totalErrors,
      errorsByCategory,
      recentErrors
    };
  }
}

/**
 * React Error Boundary helper function
 */
export function createErrorBoundaryHandler(componentName: string) {
  return (error: Error, errorInfo: React.ErrorInfo) => {
    console.log(`⚛️ ErrorHandler: React Error Boundary triggered in ${componentName}`, { error, errorInfo });

    const errorHandler = new ErrorHandler();
    return errorHandler.handleError(error, `component-${componentName}`, {
      componentStack: errorInfo.componentStack,
      errorBoundary: componentName
    });
  };
}

/**
 * Async function wrapper with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context?: string
): T {
  return (async (...args: any[]) => {
    try {
      console.log(`🔄 ErrorHandler: Executing function with error handling`, { context, args });
      return await fn(...args);
    } catch (error) {
      console.log(`❌ ErrorHandler: Function threw error`, { context, error });
      const errorHandler = new ErrorHandler();
      const errorInfo = errorHandler.handleError(error as Error, context);
      
      // Re-throw the original error but add error info for context
      const originalError = error as Error;
      (originalError as any).errorInfo = errorInfo;
      throw originalError;
    }
  }) as T;
}

/**
 * Global error handler instance
 */
export const errorHandler = new ErrorHandler();

/**
 * Convenience functions for common error types
 */
export const handleError = errorHandler.handleError.bind(errorHandler);
export const handleApiError = errorHandler.handleApiError.bind(errorHandler);
export const handleDatabaseError = errorHandler.handleDatabaseError.bind(errorHandler);
export const handleAudioError = errorHandler.handleAudioError.bind(errorHandler);
export const handleWorkflowError = errorHandler.handleWorkflowError.bind(errorHandler);

/**
 * Export types and enums for external use
 */

console.log(`✅ ErrorHandler: Global error handling utility initialized`);