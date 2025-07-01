/**
 * Application Startup Utility
 * 
 * This module handles the initialization sequence for FlowGenius,
 * including environment validation, service connections, and error handling.
 * Used by the main application to ensure all prerequisites are met before startup.
 */

import { logger } from './logger';
import { validateEnvironment, displayValidationSummary, getValidatedConfig } from './envValidator';

/**
 * Startup result interface
 */
export interface StartupResult {
  success: boolean;
  config: any | null;
  errors: string[];
  canContinue: boolean;
}

/**
 * Performs comprehensive application startup checks
 * @param skipConnectionTests - Whether to skip external connection tests (default: false)
 * @returns Promise resolving to startup result
 */
export async function initializeApplication(skipConnectionTests: boolean = false): Promise<StartupResult> {
  logger.info('🚀 Starting FlowGenius application initialization...');
  
  try {
    // Check if we're in a browser environment (Electron renderer)
    const isBrowser = typeof process === 'undefined';
    
    if (isBrowser) {
      // In browser/renderer context, we can't access environment variables directly
      // Environment validation should be done in the main process
      logger.info('📋 Running in browser/renderer context - skipping environment validation');
      logger.info('⚠️  Environment validation should be handled by the main process');
      
      // Step 2: Initialize core services for browser context
      logger.info('🔧 Initializing core services for renderer process');
      await initializeCoreServices(null);
      
      logger.info('🎉 FlowGenius renderer initialization completed successfully!');
      
      return {
        success: true,
        config: null, // Config will be provided by main process
        errors: [],
        canContinue: true
      };
    }
    
    // Step 1: Validate environment variables and test connections (main process only)
    logger.info('📋 Step 1: Environment validation');
    const validationResult = await validateEnvironment(!skipConnectionTests);
    
    // Display comprehensive validation summary
    displayValidationSummary(validationResult);
    
    // Check if we can continue with startup
    const canContinue = validationResult.isValid && (
      skipConnectionTests || validationResult.connectionsValid !== false
    );
    
    if (!canContinue) {
      const errors = [
        ...validationResult.errors,
        ...(validationResult.connectionsValid === false ? ['External service connections failed'] : [])
      ];
      
      logger.error('❌ Application startup failed due to environment issues');
      return {
        success: false,
        config: null,
        errors,
        canContinue: false
      };
    }
    
    // Step 2: Get validated configuration
    logger.info('⚙️  Step 2: Loading configuration');
    const config = getValidatedConfig();
    
    if (!config) {
      logger.error('❌ Failed to load validated configuration');
      return {
        success: false,
        config: null,
        errors: ['Failed to load configuration'],
        canContinue: false
      };
    }
    
    logger.info('✅ Configuration loaded successfully', {
      environment: config.NODE_ENV,
      maxRecordingDuration: config.MAX_RECORDING_DURATION,
      maxFileUploadSize: config.MAX_FILE_UPLOAD_SIZE
    });
    
    // Step 3: Initialize core services (placeholder for future)
    logger.info('🔧 Step 3: Initializing core services');
    await initializeCoreServices(config);
    
    logger.info('🎉 FlowGenius application initialization completed successfully!');
    
    return {
      success: true,
      config,
      errors: [],
      canContinue: true
    };
    
  } catch (error) {
    logger.error('💥 Critical error during application initialization', { 
      error: error as Error 
    });
    
    return {
      success: false,
      config: null,
      errors: [`Critical initialization error: ${(error as Error).message}`],
      canContinue: false
    };
  }
}

/**
 * Initialize core application services
 * @param config - Validated application configuration (null in browser context)
 */
async function initializeCoreServices(config: any | null): Promise<void> {
  logger.info('🔌 Initializing core services...');
  
  if (config === null) {
    logger.info('🌐 Browser/renderer context - services will be initialized via IPC');
    // In browser context, services will be initialized through IPC with main process
    return;
  }
  
  // Future service initializations will go here:
  // - Supabase client setup
  // - LangGraph workflow initialization
  // - Audio service setup
  // - OpenAI service configuration
  
  logger.info('✅ Core services initialized');
}

/**
 * Graceful shutdown handler
 */
export function setupGracefulShutdown(): void {
  // Check if we're in a browser environment (no process object)
  const isBrowser = typeof process === 'undefined';
  
  if (isBrowser) {
    logger.info('🌐 Browser context - graceful shutdown handled by main process');
    
    // In browser context, handle window unload events
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        logger.info('🛑 Browser window closing, cleaning up...');
        // Future cleanup operations for browser context
      });
    }
    return;
  }
  
  const shutdownHandler = (signal: string) => {
    logger.info(`🛑 Received ${signal}, starting graceful shutdown...`);
    
    // Future cleanup operations:
    // - Close database connections
    // - Stop audio recording
    // - Save pending data
    // - Clean up temporary files
    
    logger.info('👋 Graceful shutdown completed');
    process.exit(0);
  };
  
  // Handle different shutdown signals
  process.on('SIGINT', () => shutdownHandler('SIGINT'));
  process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
  process.on('SIGQUIT', () => shutdownHandler('SIGQUIT'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('💥 Uncaught exception detected', { error });
    shutdownHandler('uncaughtException');
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('💥 Unhandled promise rejection detected', { 
      reason: reason as Error,
      promise: promise.toString()
    });
    shutdownHandler('unhandledRejection');
  });
}

/**
 * Development mode helper that provides additional debugging information
 */
export function enableDevelopmentMode(): void {
  // Check if we're in a browser environment (no process object)
  const isBrowser = typeof process === 'undefined';
  const isDevelopment = isBrowser || process.env?.NODE_ENV === 'development' || import.meta.env?.MODE === 'development';
  
  if (!isDevelopment) {
    return;
  }
  
  logger.info('🛠️  Development mode enabled');
  
  // Enable additional debugging
  logger.configure({
    level: 0, // DEBUG level
    enableConsole: true,
    enableStructuredLogging: true
  });
  
  // Log environment information (only if process is available)
  if (!isBrowser) {
    logger.debug('Environment information', {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      electronVersion: process.versions.electron || 'Not running in Electron',
      chromeVersion: process.versions.chrome || 'Not available'
    });
  } else {
    logger.debug('Environment information', {
      userAgent: navigator.userAgent,
      environment: 'browser/renderer',
      viteBuildMode: import.meta.env?.MODE || 'unknown'
    });
  }
}

/**
 * Production mode helper that optimizes logging for performance
 */
export function enableProductionMode(): void {
  // Check if we're in a browser environment (no process object)
  const isBrowser = typeof process === 'undefined';
  const isProduction = !isBrowser && process.env?.NODE_ENV === 'production' || import.meta.env?.MODE === 'production';
  
  if (!isProduction) {
    return;
  }
  
  logger.info('🏭 Production mode enabled');
  
  // Optimize logging for production
  logger.configure({
    level: 1, // INFO level
    enableConsole: false,
    enableFile: true,
    enableStructuredLogging: true
  });
} 