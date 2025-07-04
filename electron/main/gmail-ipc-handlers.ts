/**
 * Gmail IPC Handlers for FlowGenius
 * 
 * This module provides IPC handlers that bridge the Electron renderer process
 * with email sending functionality.
 * 
 * Features:
 * - Email sending via logged output (for now)
 * - Connection status checking
 * - Error handling and logging
 * - Email formatting and validation
 */

import { ipcMain } from 'electron';
import { logger } from '../../src/utils/logger';

// Types for Gmail operations
export interface GmailSendParams {
  recipient_email: string;
  subject: string;
  body: string;
  is_html: boolean;
  cc?: string[];
  bcc?: string[];
}

export interface GmailResponse {
  successful: boolean;
  data?: {
    response_data?: {
      id: string;
      threadId: string;
      labelIds: string[];
    };
  };
  error?: string;
}

/**
 * Initialize Gmail IPC handlers
 */
export function initializeGmailIpcHandlers(): void {
  logger.info('🔌 Initializing Gmail IPC handlers');

  // Check Gmail connection status
  ipcMain.handle('gmail:check-connection', async () => {
    try {
      logger.info('🔍 Checking Gmail connection');
      
      const result = await checkGmailConnectionMCP();
      
      logger.info('✅ Gmail connection check completed', {
        connected: result.connected
      });
      
      return { success: true, data: result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ Gmail connection check failed', { error: errorMessage });
      
      return { success: false, error: errorMessage };
    }
  });

  // Send Gmail email
  ipcMain.handle('gmail:send-email', async (event, params: GmailSendParams) => {
    try {
      logger.info('📧 Sending Gmail email', {
        recipient: params.recipient_email,
        subject: params.subject,
        is_html: params.is_html
      });
      
      // Validate parameters
      if (!params.recipient_email || !params.subject || !params.body) {
        throw new Error('Missing required email parameters');
      }
      
      // Send email
      const result = await sendGmailEmailMCP(params);
      
      if (!result.successful) {
        throw new Error(result.error || 'Gmail sending failed');
      }
      
      logger.info('✅ Gmail email sent successfully', {
        recipient: params.recipient_email,
        message_id: result.data?.response_data?.id
      });
      
      return { success: true, data: result.data };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ Gmail email sending failed', { 
        error: errorMessage,
        recipient: params.recipient_email 
      });
      
      return { success: false, error: errorMessage };
    }
  });

  logger.info('✅ Gmail IPC handlers initialized');
}

/**
 * Check Gmail connection
 */
export async function checkGmailConnectionMCP(): Promise<{ connected: boolean; connectedAccountId?: string }> {
  try {
    logger.info('🔍 Checking Gmail connection status');
    
    // For now, we'll return a status indicating that email sending is available
    // but will be logged to console instead of actually sent
    logger.info('✅ Gmail ready for console logging mode');
    
    return {
      connected: true,
      connectedAccountId: 'console_logger'
    };
    
  } catch (error) {
    logger.error('❌ Gmail connection check failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    return { connected: false };
  }
}

/**
 * Send email (currently logs to console)
 */
export async function sendGmailEmailMCP(params: GmailSendParams): Promise<GmailResponse> {
  try {
    logger.info('📨 Sending email', {
      recipient: params.recipient_email,
      subject: params.subject
    });
    
    const emailId = `email_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    
    // Log the full email to console for verification
    console.log('\n' + '='.repeat(80));
    console.log('📧 FLOWGENIUS EMAIL - CONSOLE OUTPUT');
    console.log('='.repeat(80));
    console.log(`Email ID: ${emailId}`);
    console.log(`To: ${params.recipient_email}`);
    if (params.cc?.length) console.log(`CC: ${params.cc.join(', ')}`);
    if (params.bcc?.length) console.log(`BCC: ${params.bcc.join(', ')}`);
    console.log(`Subject: ${params.subject}`);
    console.log(`Content-Type: ${params.is_html ? 'text/html' : 'text/plain'}`);
    console.log(`Date: ${new Date().toISOString()}`);
    console.log('─'.repeat(80));
    console.log('BODY:');
    console.log('─'.repeat(80));
    console.log(params.body);
    console.log('='.repeat(80) + '\n');
    
    logger.info('✅ Email logged to console successfully', {
      email_id: emailId,
      recipient: params.recipient_email
    });
    
    return {
      successful: true,
      data: {
        response_data: {
          id: emailId,
          threadId: `thread_${emailId}`,
          labelIds: ['SENT', 'CONSOLE_LOGGED']
        }
      }
    };
    
  } catch (error) {
    logger.error('❌ Failed to send email', {
      error: error instanceof Error ? error.message : String(error),
      recipient: params.recipient_email
    });
    
    return {
      successful: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Cleanup Gmail IPC handlers
 */
export function cleanupGmailIpcHandlers(): void {
  logger.info('🧹 Cleaning up Gmail IPC handlers');
  ipcMain.removeAllListeners('gmail:check-connection');
  ipcMain.removeAllListeners('gmail:send-email');
  logger.info('✅ Gmail IPC handlers cleaned up');
} 