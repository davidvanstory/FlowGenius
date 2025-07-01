/**
 * Centralized Logging Utility for FlowGenius
 * 
 * This utility provides comprehensive logging capabilities across the entire application,
 * including Electron main process, preload scripts, and React renderer process.
 * 
 * Features:
 * - Multiple log levels (debug, info, warn, error)
 * - Environment-aware logging (development vs production)
 * - Structured logging with metadata
 * - Performance timing utilities
 * - File and console output
 * - Electron-safe implementation
 */

/**
 * Available log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Log level names for display
 */
const LOG_LEVEL_NAMES = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
} as const;

/**
 * Console styling for different log levels
 */
const LOG_LEVEL_STYLES = {
  [LogLevel.DEBUG]: 'color: #6B7280; font-weight: normal;',
  [LogLevel.INFO]: 'color: #3B82F6; font-weight: normal;',
  [LogLevel.WARN]: 'color: #F59E0B; font-weight: bold;',
  [LogLevel.ERROR]: 'color: #EF4444; font-weight: bold;',
} as const;

/**
 * Metadata interface for structured logging
 */
export interface LogMetadata {
  [key: string]: any;
  timestamp?: Date;
  component?: string;
  action?: string;
  userId?: string;
  sessionId?: string;
  ideaId?: string;
  nodeType?: string;
  duration?: number;
  error?: Error | string;
}

/**
 * Logger configuration interface
 */
export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  enableStructuredLogging: boolean;
  maxLogFileSize: number;
  component?: string;
}

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
  enableConsole: true,
  enableFile: process.env.NODE_ENV === 'production',
  enableStructuredLogging: true,
  maxLogFileSize: 10 * 1024 * 1024, // 10MB
};

/**
 * Performance timer interface for measuring execution time
 */
interface PerformanceTimer {
  start: number;
  label: string;
  metadata?: LogMetadata;
}

/**
 * Main Logger class
 */
class Logger {
  private config: LoggerConfig;
  private timers: Map<string, PerformanceTimer> = new Map();
  private logBuffer: string[] = [];
  private isElectronMain: boolean;
  private isElectronRenderer: boolean;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Detect Electron environment
    this.isElectronMain = typeof window === 'undefined' && typeof process !== 'undefined';
    this.isElectronRenderer = typeof window !== 'undefined' && typeof window.electron !== 'undefined';
    
    // Initialize logger
    this.initialize();
  }

  /**
   * Initialize the logger based on environment
   */
  private initialize(): void {
    if (this.isElectronMain) {
      this.info('Logger initialized in Electron main process', {
        component: 'Logger',
        action: 'initialize',
        environment: 'electron-main'
      });
    } else if (this.isElectronRenderer) {
      this.info('Logger initialized in Electron renderer process', {
        component: 'Logger',
        action: 'initialize',
        environment: 'electron-renderer'
      });
    } else {
      this.info('Logger initialized in browser environment', {
        component: 'Logger',
        action: 'initialize',
        environment: 'browser'
      });
    }
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.level;
  }

  /**
   * Format timestamp for logging
   */
  private formatTimestamp(date: Date = new Date()): string {
    return date.toISOString();
  }

  /**
   * Format log message with metadata
   */
  private formatMessage(level: LogLevel, message: string, metadata?: LogMetadata): string {
    const timestamp = this.formatTimestamp();
    const levelName = LOG_LEVEL_NAMES[level];
    const component = metadata?.component || this.config.component || 'Unknown';
    
    let formattedMessage = `[${timestamp}] [${levelName}] [${component}] ${message}`;
    
    if (metadata && Object.keys(metadata).length > 0) {
      const cleanMetadata = { ...metadata };
      delete cleanMetadata.timestamp;
      delete cleanMetadata.component;
      
      if (Object.keys(cleanMetadata).length > 0) {
        formattedMessage += ` | ${JSON.stringify(cleanMetadata)}`;
      }
    }
    
    return formattedMessage;
  }

  /**
   * Output log to console with styling
   */
  private outputToConsole(level: LogLevel, message: string, metadata?: LogMetadata): void {
    if (!this.config.enableConsole) return;

    const formattedMessage = this.formatMessage(level, message, metadata);
    const style = LOG_LEVEL_STYLES[level];

    // Use appropriate console method based on level
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(`%c${formattedMessage}`, style);
        break;
      case LogLevel.INFO:
        console.info(`%c${formattedMessage}`, style);
        break;
      case LogLevel.WARN:
        console.warn(`%c${formattedMessage}`, style);
        break;
      case LogLevel.ERROR:
        console.error(`%c${formattedMessage}`, style);
        if (metadata?.error instanceof Error) {
          console.error(metadata.error.stack);
        }
        break;
    }
  }

  /**
   * Add log to buffer for file output (Electron main process only)
   */
  private addToBuffer(level: LogLevel, message: string, metadata?: LogMetadata): void {
    if (!this.config.enableFile || !this.isElectronMain) return;

    const formattedMessage = this.formatMessage(level, message, metadata);
    this.logBuffer.push(formattedMessage);

    // Flush buffer if it gets too large
    if (this.logBuffer.length > 1000) {
      this.flushBuffer();
    }
  }

  /**
   * Flush log buffer to file (Electron main process only)
   */
  private flushBuffer(): void {
    if (!this.isElectronMain || this.logBuffer.length === 0) return;

    try {
      // This would be implemented with fs in the main process
      // For now, we'll just clear the buffer
      this.logBuffer = [];
    } catch (error) {
      console.error('Failed to flush log buffer:', error);
    }
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, metadata?: LogMetadata): void {
    if (!this.shouldLog(level)) return;

    // Add timestamp and component to metadata
    const enrichedMetadata: LogMetadata = {
      timestamp: new Date(),
      component: this.config.component,
      ...metadata,
    };

    // Output to console
    this.outputToConsole(level, message, enrichedMetadata);

    // Add to file buffer if enabled
    this.addToBuffer(level, message, enrichedMetadata);
  }

  /**
   * Debug level logging
   */
  debug(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  /**
   * Info level logging
   */
  info(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  /**
   * Warning level logging
   */
  warn(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  /**
   * Error level logging
   */
  error(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.ERROR, message, metadata);
  }

  /**
   * Start a performance timer
   */
  startTimer(label: string, metadata?: LogMetadata): void {
    const timer: PerformanceTimer = {
      start: Date.now(),
      label,
      metadata,
    };
    
    this.timers.set(label, timer);
    this.debug(`Timer started: ${label}`, metadata);
  }

  /**
   * End a performance timer and log the duration
   */
  endTimer(label: string, additionalMetadata?: LogMetadata): number {
    const timer = this.timers.get(label);
    if (!timer) {
      this.warn(`Timer not found: ${label}`);
      return 0;
    }

    const duration = Date.now() - timer.start;
    this.timers.delete(label);

    const metadata: LogMetadata = {
      ...timer.metadata,
      ...additionalMetadata,
      duration,
    };

    this.info(`Timer ended: ${label} (${duration}ms)`, metadata);
    return duration;
  }

  /**
   * Log function entry with parameters
   */
  functionEntry(functionName: string, parameters?: any, metadata?: LogMetadata): void {
    this.debug(`→ Entering ${functionName}`, {
      ...metadata,
      action: 'function-entry',
      function: functionName,
      parameters: parameters ? JSON.stringify(parameters) : undefined,
    });
  }

  /**
   * Log function exit with return value
   */
  functionExit(functionName: string, returnValue?: any, metadata?: LogMetadata): void {
    this.debug(`← Exiting ${functionName}`, {
      ...metadata,
      action: 'function-exit',
      function: functionName,
      returnValue: returnValue ? JSON.stringify(returnValue) : undefined,
    });
  }

  /**
   * Log API call start
   */
  apiCallStart(endpoint: string, method: string, metadata?: LogMetadata): void {
    this.info(`API Call: ${method} ${endpoint}`, {
      ...metadata,
      action: 'api-call-start',
      endpoint,
      method,
    });
  }

  /**
   * Log API call completion
   */
  apiCallEnd(endpoint: string, method: string, statusCode: number, duration: number, metadata?: LogMetadata): void {
    const level = statusCode >= 400 ? LogLevel.ERROR : LogLevel.INFO;
    this.log(level, `API Response: ${method} ${endpoint} - ${statusCode} (${duration}ms)`, {
      ...metadata,
      action: 'api-call-end',
      endpoint,
      method,
      statusCode,
      duration,
    });
  }

  /**
   * Log user interaction
   */
  userInteraction(action: string, element?: string, metadata?: LogMetadata): void {
    this.info(`User Interaction: ${action}`, {
      ...metadata,
      action: 'user-interaction',
      userAction: action,
      element,
    });
  }

  /**
   * Log state change
   */
  stateChange(from: string, to: string, metadata?: LogMetadata): void {
    this.info(`State Change: ${from} → ${to}`, {
      ...metadata,
      action: 'state-change',
      fromState: from,
      toState: to,
    });
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalConfig: Partial<LoggerConfig>): Logger {
    return new Logger({
      ...this.config,
      ...additionalConfig,
    });
  }

  /**
   * Update logger configuration
   */
  configure(newConfig: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.info('Logger configuration updated', {
      component: 'Logger',
      action: 'configure',
      newConfig,
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): LoggerConfig {
    return { ...this.config };
  }
}

/**
 * Default logger instance
 */
export const logger = new Logger({
  component: 'FlowGenius',
});

/**
 * Create a logger for a specific component
 */
export function createLogger(component: string, config?: Partial<LoggerConfig>): Logger {
  return new Logger({
    ...config,
    component,
  });
}

/**
 * Utility function for logging function execution with automatic timing
 */
export function loggedFunction<T extends (...args: any[]) => any>(
  fn: T,
  functionName?: string,
  componentLogger?: Logger
): T {
  const log = componentLogger || logger;
  const name = functionName || fn.name || 'anonymous';

  return ((...args: any[]) => {
    const timerId = `${name}-${Date.now()}`;
    
    log.functionEntry(name, args);
    log.startTimer(timerId);
    
    try {
      const result = fn(...args);
      
      // Handle async functions
      if (result instanceof Promise) {
        return result
          .then((resolvedResult) => {
            log.endTimer(timerId);
            log.functionExit(name, resolvedResult);
            return resolvedResult;
          })
          .catch((error) => {
            log.endTimer(timerId);
            log.error(`Function ${name} threw error`, { error, function: name });
            throw error;
          });
      }
      
      // Handle sync functions
      log.endTimer(timerId);
      log.functionExit(name, result);
      return result;
         } catch (error) {
       log.endTimer(timerId);
       log.error(`Function ${name} threw error`, { error: error as Error, function: name });
       throw error;
     }
  }) as T;
}

// All types and enums are already exported above 