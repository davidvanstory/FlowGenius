/**
 * Environment Validation Utility
 * 
 * This module validates that all required environment variables are set
 * and that external service connections can be established.
 * Used during application startup to catch configuration issues early.
 */

import { logger } from './logger';

/**
 * Interface defining all required environment variables
 */
interface RequiredEnvVars {
  OPENAI_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  TAVILY_API_KEY: string;
}

/**
 * Interface defining optional environment variables with defaults
 */
interface OptionalEnvVars {
  NODE_ENV: string;
  MAX_RECORDING_DURATION: string;
  MAX_FILE_UPLOAD_SIZE: string;
}

/**
 * Validation result interface
 */
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  config: {
    required: Partial<RequiredEnvVars>;
    optional: OptionalEnvVars;
  };
}

/**
 * List of required environment variables
 */
const REQUIRED_ENV_VARS: (keyof RequiredEnvVars)[] = [
  'OPENAI_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'TAVILY_API_KEY'
];

/**
 * Default values for optional environment variables
 */
const DEFAULT_ENV_VALUES: OptionalEnvVars = {
  NODE_ENV: 'development',
  MAX_RECORDING_DURATION: '300', // 5 minutes
  MAX_FILE_UPLOAD_SIZE: '10' // 10MB
};

/**
 * Validates that a URL is properly formatted
 * @param url - The URL to validate
 * @returns True if valid, false otherwise
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates that an API key has the expected format
 * @param key - The API key to validate
 * @param expectedPrefix - Expected prefix (e.g., 'sk-' for OpenAI)
 * @returns True if valid, false otherwise
 */
function isValidApiKey(key: string, expectedPrefix?: string): boolean {
  if (!key || key.trim().length === 0) {
    return false;
  }
  
  if (expectedPrefix && !key.startsWith(expectedPrefix)) {
    return false;
  }
  
  // Basic length check - most API keys are at least 20 characters
  return key.length >= 20;
}

/**
 * Tests connection to OpenAI API
 * @param apiKey - OpenAI API key
 * @returns Promise resolving to true if connection successful
 */
async function testOpenAIConnection(apiKey: string): Promise<boolean> {
  try {
    logger.info('🔍 Testing OpenAI API connection...');
    
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      logger.info('✅ OpenAI API connection successful');
      return true;
    } else {
      logger.error(`❌ OpenAI API connection failed: ${response.status} ${response.statusText}`);
      return false;
    }
     } catch (error) {
     logger.error('❌ OpenAI API connection failed', { error: error as Error });
     return false;
   }
}

/**
 * Tests connection to Supabase
 * @param url - Supabase URL
 * @param anonKey - Supabase anonymous key
 * @returns Promise resolving to true if connection successful
 */
async function testSupabaseConnection(url: string, anonKey: string): Promise<boolean> {
  try {
    logger.info('🔍 Testing Supabase connection...');
    
    const response = await fetch(`${url}/rest/v1/`, {
      headers: {
        'apikey': anonKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok || response.status === 404) {
      // 404 is expected for the root endpoint
      logger.info('✅ Supabase connection successful');
      return true;
    } else {
      logger.error(`❌ Supabase connection failed: ${response.status} ${response.statusText}`);
      return false;
    }
     } catch (error) {
     logger.error('❌ Supabase connection failed', { error: error as Error });
     return false;
   }
}

/**
 * Validates all environment variables
 * @returns ValidationResult with detailed information about validation status
 */
export function validateEnvironmentVariables(): ValidationResult {
  logger.info('🔧 Starting environment validation...');
  
  const errors: string[] = [];
  const warnings: string[] = [];
  const requiredConfig: Partial<RequiredEnvVars> = {};
  
  // Check required environment variables
  for (const envVar of REQUIRED_ENV_VARS) {
    const value = process.env[envVar];
    
    if (!value) {
      errors.push(`Missing required environment variable: ${envVar}`);
      logger.error(`❌ Missing required environment variable: ${envVar}`);
    } else {
      requiredConfig[envVar] = value;
      logger.info(`✅ Found ${envVar}`);
      
      // Validate specific formats
      switch (envVar) {
        case 'OPENAI_API_KEY':
          if (!isValidApiKey(value, 'sk-')) {
            errors.push(`Invalid OpenAI API key format. Expected to start with 'sk-'`);
          }
          break;
          
        case 'SUPABASE_URL':
          if (!isValidUrl(value)) {
            errors.push(`Invalid Supabase URL format: ${value}`);
          } else if (!value.includes('supabase.co')) {
            warnings.push(`Supabase URL doesn't contain 'supabase.co'. Please verify this is correct.`);
          }
          break;
          
        case 'SUPABASE_ANON_KEY':
          if (!isValidApiKey(value)) {
            errors.push(`Invalid Supabase anonymous key format`);
          }
          break;
          
        case 'TAVILY_API_KEY':
          if (!isValidApiKey(value, 'tvly-')) {
            errors.push(`Invalid Tavily API key format. Expected to start with 'tvly-'`);
          }
          break;
      }
    }
  }
  
  // Set up optional environment variables with defaults
  const optionalConfig: OptionalEnvVars = {
    NODE_ENV: process.env.NODE_ENV || DEFAULT_ENV_VALUES.NODE_ENV,
    MAX_RECORDING_DURATION: process.env.MAX_RECORDING_DURATION || DEFAULT_ENV_VALUES.MAX_RECORDING_DURATION,
    MAX_FILE_UPLOAD_SIZE: process.env.MAX_FILE_UPLOAD_SIZE || DEFAULT_ENV_VALUES.MAX_FILE_UPLOAD_SIZE
  };
  
  // Log optional configurations
  logger.info(`📋 Environment: ${optionalConfig.NODE_ENV}`);
  logger.info(`⏱️  Max recording duration: ${optionalConfig.MAX_RECORDING_DURATION}s`);
  logger.info(`📁 Max file upload size: ${optionalConfig.MAX_FILE_UPLOAD_SIZE}MB`);
  
  // Validate numeric values
  const maxRecordingDuration = parseInt(optionalConfig.MAX_RECORDING_DURATION);
  if (isNaN(maxRecordingDuration) || maxRecordingDuration <= 0) {
    warnings.push(`Invalid MAX_RECORDING_DURATION value. Using default: ${DEFAULT_ENV_VALUES.MAX_RECORDING_DURATION}s`);
    optionalConfig.MAX_RECORDING_DURATION = DEFAULT_ENV_VALUES.MAX_RECORDING_DURATION;
  }
  
  const maxFileUploadSize = parseInt(optionalConfig.MAX_FILE_UPLOAD_SIZE);
  if (isNaN(maxFileUploadSize) || maxFileUploadSize <= 0) {
    warnings.push(`Invalid MAX_FILE_UPLOAD_SIZE value. Using default: ${DEFAULT_ENV_VALUES.MAX_FILE_UPLOAD_SIZE}MB`);
    optionalConfig.MAX_FILE_UPLOAD_SIZE = DEFAULT_ENV_VALUES.MAX_FILE_UPLOAD_SIZE;
  }
  
  const isValid = errors.length === 0;
  
  if (isValid) {
    logger.info('✅ Environment validation passed');
  } else {
    logger.error(`❌ Environment validation failed with ${errors.length} error(s)`);
  }
  
  if (warnings.length > 0) {
    logger.warn(`⚠️  Environment validation completed with ${warnings.length} warning(s)`);
  }
  
  return {
    isValid,
    errors,
    warnings,
    config: {
      required: requiredConfig,
      optional: optionalConfig
    }
  };
}

/**
 * Tests connections to all external services
 * @param config - Validated configuration
 * @returns Promise resolving to true if all connections successful
 */
export async function testExternalConnections(config: ValidationResult['config']): Promise<boolean> {
  logger.info('🌐 Testing external service connections...');
  
  const { required } = config;
  
  if (!required.OPENAI_API_KEY || !required.SUPABASE_URL || !required.SUPABASE_ANON_KEY) {
    logger.error('❌ Cannot test connections: missing required configuration');
    return false;
  }
  
  const results = await Promise.allSettled([
    testOpenAIConnection(required.OPENAI_API_KEY),
    testSupabaseConnection(required.SUPABASE_URL, required.SUPABASE_ANON_KEY)
  ]);
  
  const allSuccessful = results.every(result => 
    result.status === 'fulfilled' && result.value === true
  );
  
  if (allSuccessful) {
    logger.info('✅ All external service connections successful');
  } else {
    logger.error('❌ One or more external service connections failed');
  }
  
  return allSuccessful;
}

/**
 * Comprehensive environment validation and connection testing
 * @param testConnections - Whether to test external connections (default: true)
 * @returns Promise resolving to validation result with connection status
 */
export async function validateEnvironment(testConnections: boolean = true): Promise<ValidationResult & { connectionsValid?: boolean }> {
  const validationResult = validateEnvironmentVariables();
  
  if (!validationResult.isValid) {
    return validationResult;
  }
  
  if (testConnections) {
    const connectionsValid = await testExternalConnections(validationResult.config);
    return {
      ...validationResult,
      connectionsValid
    };
  }
  
  return validationResult;
}

/**
 * Prints a user-friendly summary of validation results
 * @param result - Validation result to display
 */
export function displayValidationSummary(result: ValidationResult & { connectionsValid?: boolean }): void {
  console.log('\n' + '='.repeat(60));
  console.log('🔧 FLOWGENIUS ENVIRONMENT VALIDATION SUMMARY');
  console.log('='.repeat(60));
  
  if (result.isValid) {
    console.log('✅ Environment Configuration: VALID');
  } else {
    console.log('❌ Environment Configuration: INVALID');
    console.log('\n🚨 ERRORS:');
    result.errors.forEach(error => console.log(`   • ${error}`));
  }
  
  if (result.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    result.warnings.forEach(warning => console.log(`   • ${warning}`));
  }
  
  if (typeof result.connectionsValid === 'boolean') {
    if (result.connectionsValid) {
      console.log('✅ External Connections: SUCCESSFUL');
    } else {
      console.log('❌ External Connections: FAILED');
    }
  }
  
  if (!result.isValid || result.connectionsValid === false) {
    console.log('\n📝 NEXT STEPS:');
    console.log('   1. Create a .env file in your project root');
    console.log('   2. Copy the contents of .env.example');
    console.log('   3. Fill in your actual API keys and URLs');
    console.log('   4. Restart the application');
  }
  
  console.log('='.repeat(60) + '\n');
}

/**
 * Gets the validated environment configuration
 * @returns The validated configuration object
 */
export function getValidatedConfig(): (RequiredEnvVars & OptionalEnvVars) | null {
  const result = validateEnvironmentVariables();
  
  if (!result.isValid) {
    return null;
  }
  
  return {
    ...result.config.required as RequiredEnvVars,
    ...result.config.optional
  };
} 