/**
 * LangGraph Node: Process Voice Input
 * 
 * This node handles voice-to-text conversion using the Whisper API.
 * It processes audio data from voice recordings, converts speech to text,
 * and updates the conversation state with transcribed text.
 * 
 * Key Features:
 * - Process audio data from voice recordings
 * - Convert speech to text using Whisper API
 * - Update conversation state with transcribed text
 * - Handle audio format validation
 * - Comprehensive error handling and retry logic
 * - Performance monitoring and logging
 */

import { AppState, ChatMessage, VoiceTranscription } from '../../../../src/types/AppState';
import { logger } from '../../../../src/utils/logger';
import { ErrorHandler } from '../../../../src/utils/errorHandler';
import { validateLangGraphState, createStateUpdate } from '../state';
import { createWhisperService } from '../../../../src/services/whisperService';

/**
 * Process voice input and convert to text using Whisper API
 * 
 * This node processes voice audio data stored in the state, sends it to the Whisper API
 * for transcription, and creates a user message with the transcribed text.
 * 
 * @param state - Current application state containing voice audio data
 * @returns Updated state with voice transcription results
 */
export async function processVoiceInput(state: AppState): Promise<Partial<AppState>> {
  const startTime = Date.now();
  const nodeId = `processVoiceInput_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  
  console.log('🎤 ProcessVoiceInput: Starting voice-to-text processing', {
    nodeId,
    ideaId: state.idea_id,
    currentStage: state.current_stage,
    lastAction: state.last_user_action,
    hasVoiceData: !!state.voice_audio_data,
    audioSize: state.voice_audio_data?.size,
    audioType: state.voice_audio_data?.mimeType
  });

  try {
    // Validate incoming state
    console.log('🔍 ProcessVoiceInput: Validating input state');
    validateLangGraphState(state);

    // Check if we have voice audio data to process
    if (!state.voice_audio_data) {
      const errorMsg = 'No voice audio data found in state';
      console.log('❌ ProcessVoiceInput: Missing audio data', { nodeId });
      logger.error('ProcessVoiceInput failed - no audio data', {
        idea_id: state.idea_id,
        nodeId,
        execution_time: Date.now() - startTime
      });

      return createStateUpdate({
        voice_transcription: {
          status: 'failed' as const,
          error: errorMsg,
          started_at: new Date(),
          completed_at: new Date()
        },
        is_processing: false,
        error: errorMsg
      });
    }

    // Check if already processing
    if (state.is_processing) {
      console.log('⏸️ ProcessVoiceInput: Already processing, skipping');
      logger.warn('ProcessVoiceInput called while already processing', {
        idea_id: state.idea_id,
        nodeId
      });
      return {}; // Return empty update to avoid changes
    }

    // Initialize transcription status
    const transcriptionStarted: VoiceTranscription = {
      status: 'processing',
      started_at: new Date()
    };

    console.log('🔄 ProcessVoiceInput: Starting transcription process', {
      nodeId,
      audioSize: state.voice_audio_data.size,
      audioDuration: state.voice_audio_data.duration,
      audioType: state.voice_audio_data.mimeType
    });

    // Update state to show processing started
    const processingUpdate = createStateUpdate({
      voice_transcription: transcriptionStarted,
      is_processing: true
    });

    // Create WhisperService instance
    let whisperService;
    try {
      console.log('🏭 ProcessVoiceInput: Creating WhisperService instance');
      whisperService = await createWhisperService();
      logger.info('WhisperService created successfully', { nodeId });
    } catch (error) {
      const errorMsg = `Failed to initialize Whisper service: ${error instanceof Error ? error.message : String(error)}`;
      console.log('❌ ProcessVoiceInput: WhisperService creation failed', { nodeId, error: errorMsg });
      
      return createStateUpdate({
        voice_transcription: {
          status: 'failed' as const,
          error: errorMsg,
          started_at: transcriptionStarted.started_at,
          completed_at: new Date()
        },
        is_processing: false,
        error: errorMsg
      });
    }

    // Transcribe the audio file
    console.log('🗣️ ProcessVoiceInput: Sending audio file to Whisper API', {
      filePath: state.voice_audio_data.filePath
    });
    const transcriptionResult = await whisperService.transcribeFile(state.voice_audio_data.filePath, {
      responseFormat: 'verbose_json',
      temperature: 0,
      validateAudio: true,
      includeConfidence: true,
      timestampGranularities: ['segment']
    });

    const executionTime = Date.now() - startTime;

    if (!transcriptionResult.success || !transcriptionResult.data) {
      const errorMsg = transcriptionResult.error || 'Voice transcription failed';
      console.log('❌ ProcessVoiceInput: Whisper API transcription failed', {
        nodeId,
        error: errorMsg,
        executionTime
      });

      logger.error('ProcessVoiceInput Whisper API failed', {
        idea_id: state.idea_id,
        nodeId,
        error: errorMsg,
        execution_time: executionTime
      });

      return createStateUpdate({
        voice_transcription: {
          status: 'failed' as const,
          error: errorMsg,
          started_at: transcriptionStarted.started_at,
          completed_at: new Date()
        },
        is_processing: false,
        error: errorMsg
      });
    }

    // Extract transcription data
    const transcriptionData = transcriptionResult.data;
    const transcribedText = transcriptionData.text.trim();

    console.log('✅ ProcessVoiceInput: Transcription successful', {
      nodeId,
      textLength: transcribedText.length,
      language: transcriptionData.language,
      duration: transcriptionData.duration,
      executionTime
    });

    // Validate transcribed text
    if (!transcribedText || transcribedText.length === 0) {
      const errorMsg = 'Voice transcription resulted in empty text';
      console.log('⚠️ ProcessVoiceInput: Empty transcription result', { nodeId });

      return createStateUpdate({
        voice_transcription: {
          status: 'failed' as const,
          error: errorMsg,
          started_at: transcriptionStarted.started_at,
          completed_at: new Date()
        },
        is_processing: false,
        error: errorMsg
      });
    }

    // Create successful transcription record
    const completedTranscription: VoiceTranscription = {
      status: 'completed',
      text: transcribedText,
      language: transcriptionData.language,
      duration: transcriptionData.duration,
      confidence: transcriptionData.segments?.[0]?.confidence || undefined,
      started_at: transcriptionStarted.started_at,
      completed_at: new Date()
    };

    // Create user message from transcribed text
    const voiceMessage: ChatMessage = {
      role: 'user',
      content: transcribedText,
      created_at: new Date(),
      stage_at_creation: state.current_stage
    };

    console.log('💬 ProcessVoiceInput: Creating user message from transcription', {
      nodeId,
      messageContent: transcribedText.substring(0, 100) + (transcribedText.length > 100 ? '...' : ''),
      stage: state.current_stage
    });

    // Log successful completion
    logger.info('ProcessVoiceInput completed successfully', {
      idea_id: state.idea_id,
      nodeId,
      transcribed_text_length: transcribedText.length,
      detected_language: transcriptionData.language,
      audio_duration: transcriptionData.duration,
      execution_time: executionTime,
      whisper_processing_time: transcriptionData.metadata.processingTime
    });

    // Create final state update
    const finalUpdate = createStateUpdate({
      messages: [voiceMessage],
      voice_transcription: completedTranscription,
      // Clear voice audio data after successful processing
      voice_audio_data: undefined,
      last_user_action: 'chat' as const, // Continue in chat mode after transcription
      is_processing: false
    });

    // Clean up temporary audio file after successful processing
    // Note: We could add this in the future if needed, but for now we rely on 
    // the automatic cleanup timer in AudioFileManager

    console.log('🎉 ProcessVoiceInput: Node execution completed successfully', {
      nodeId,
      executionTime,
      newMessageCount: 1,
      transcriptionStatus: completedTranscription.status
    });

    return finalUpdate;

  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    console.log('❌ ProcessVoiceInput: Unexpected error occurred', {
      nodeId,
      error: errorMsg,
      executionTime
    });

    const errorHandler = new ErrorHandler();
    const errorInfo = errorHandler.handleWorkflowError(
      error instanceof Error ? error : new Error(String(error)),
      'processVoiceInput',
      state
    );

    logger.error('ProcessVoiceInput failed with unexpected error', {
      idea_id: state.idea_id,
      nodeId,
      error: errorInfo.userMessage,
      execution_time: executionTime,
      recovery_actions: errorInfo.recoveryActions
    });

    // Return error state update
    return createStateUpdate({
      voice_transcription: {
        status: 'failed' as const,
        error: errorInfo.userMessage,
        started_at: new Date(),
        completed_at: new Date()
      },
      // Clear voice audio data on error to prevent retry loops
      voice_audio_data: undefined,
      is_processing: false,
      error: errorInfo.userMessage
    });
  }
}

/**
 * Check if the node should process voice input
 * 
 * @param state - Current application state
 * @returns True if voice processing is needed
 */
export function shouldProcessVoice(state: AppState): boolean {
  const shouldProcess = !!(
    state.voice_audio_data && 
    !state.is_processing &&
    !state.error &&
    (!state.voice_transcription || state.voice_transcription.status !== 'processing')
  );

  console.log('🤔 ProcessVoiceInput: Checking if should process voice', {
    hasVoiceData: !!state.voice_audio_data,
    isProcessing: state.is_processing,
    hasError: !!state.error,
    transcriptionStatus: state.voice_transcription?.status,
    shouldProcess
  });

  return shouldProcess;
}

/**
 * Get voice processing status from state
 * 
 * @param state - Current application state
 * @returns Voice processing status information
 */
export function getVoiceProcessingStatus(state: AppState): {
  isProcessing: boolean;
  hasAudioData: boolean;
  transcriptionStatus?: string;
  lastError?: string;
} {
  return {
    isProcessing: !!state.is_processing && !!state.voice_audio_data,
    hasAudioData: !!state.voice_audio_data,
    transcriptionStatus: state.voice_transcription?.status,
    lastError: state.voice_transcription?.error || state.error
  };
} 