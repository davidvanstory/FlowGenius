/**
 * Main Application Component
 * 
 * This is the root component for FlowGenius that implements an OpenAI-style layout
 * with a left sidebar for session management and a main chat pane for conversations.
 * It now uses the LangGraph context for state management and workflow execution.
 */

import { useState, useEffect, useCallback } from 'react';
import { IdeaEntity } from './types/AppState';
import { logger } from './utils/logger';
import { LangGraphProvider, useLangGraph, useSendMessage, useSessionManagement, useStageManagement } from './hooks/useLangGraph';
import { useAudioRecording } from './hooks/useAudioRecording';
// WhisperService now handled by LangGraph processVoiceInput node
import Sidebar from './components/Sidebar';
import Chat from './components/Chat';
import InputBar from './components/InputBar';
import { AudioRecorder, RecordingState } from './components/AudioRecorder';
import { PermissionDialog } from './components/PermissionDialog';
import './App.css';

/**
 * Mock session data for testing the sidebar functionality
 * TODO: Replace with real database integration in task 4.0
 */
const createMockSessions = (currentSessionId: string): IdeaEntity[] => [
  {
    id: currentSessionId,
    title: 'AI-Powered Task Manager',
    current_stage: 'brainstorm',
    created_at: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
    user_id: 'user_123'
  },
  {
    id: 'session_1704067200000_abc123',
    title: 'E-commerce Mobile App',
    current_stage: 'summary',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    user_id: 'user_123'
  },
  {
    id: 'session_1704060000000_def456',
    title: 'Social Media Analytics Dashboard',
    current_stage: 'prd',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    user_id: 'user_123'
  },
  {
    id: 'session_1703980000000_ghi789',
    title: 'Voice Assistant Integration',
    current_stage: 'brainstorm',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 48), // 2 days ago
    user_id: 'user_123'
  }
];

/**
 * Inner App component that uses LangGraph hooks
 * This component has access to the LangGraph context
 */
function AppInner() {
  // LangGraph hooks for state and actions
  const { state: langGraphState, clearError, sendVoiceInput } = useLangGraph();
  const { sendMessage, isLoading: isSendingMessage, error: sendMessageError } = useSendMessage();
  const { createNewSession, currentSession, isLoading: isSessionLoading } = useSessionManagement();
  const { completeStage, isLoading: isCompletingStage } = useStageManagement();


  
  // Input state for the message input bar
  const [inputValue, setInputValue] = useState('');

  // Processing state for voice transcription
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Mock sessions data - will be replaced with real database data
  const [sessions, setSessions] = useState<IdeaEntity[]>(() => 
    createMockSessions(langGraphState.appState.idea_id)
  );

  // Extract current app state from LangGraph context
  const appState = langGraphState.appState;
  const isProcessing = langGraphState.isExecuting || isSendingMessage || isTranscribing || isCompletingStage;
  const currentError = langGraphState.error || sendMessageError;

  // Audio recording hook with LangGraph voice integration
  const audioRecording = useAudioRecording(async (audioBlob, duration) => {
    logger.info('🎤 Audio recording completed, saving to temporary file for LangGraph processing', { 
      blobSize: audioBlob.size, 
      duration,
      mimeType: audioBlob.type 
    });
    
    setIsTranscribing(true);
    
    try {
      // Convert Blob to ArrayBuffer for IPC transfer
      logger.info('🔄 Converting audio blob to buffer for file save', {
        blobSize: audioBlob.size,
        mimeType: audioBlob.type
      });

      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = new Uint8Array(arrayBuffer);

      // Save audio to temporary file using IPC
      logger.info('💾 Saving audio to temporary file via IPC', {
        bufferSize: audioBuffer.length,
        originalName: `voice_recording_${Date.now()}`,
        mimeType: audioBlob.type
      });

      const saveResult = await window.electron.audio.saveAudioFile(
        audioBuffer,
        `voice_recording_${Date.now()}`,
        audioBlob.type
      );

      if (!saveResult.success || !saveResult.filePath) {
        throw new Error(`Failed to save audio file: ${saveResult.error || 'No file path returned'}`);
      }

      logger.info('✅ Audio file saved successfully', {
        filePath: saveResult.filePath,
        fileSize: saveResult.metadata?.size
      });

      // Send the file path to LangGraph for processing
      logger.info('🔄 Sending voice file path to LangGraph workflow', {
        filePath: saveResult.filePath,
        duration,
        mimeType: audioBlob.type
      });

      await sendVoiceInput(saveResult.filePath, duration, audioBlob.type, audioBlob.size);

      logger.info('✅ Voice input sent to LangGraph successfully', {
        filePath: saveResult.filePath,
        duration
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('❌ Failed to process voice input', { 
        error: errorMsg,
        duration 
      });

      // Fallback: send error message to chat
      const errorMessage = `[Voice recording: ${duration}s - Processing failed: ${errorMsg}]`;
      await handleSendMessage(errorMessage);

    } finally {
      setIsTranscribing(false);
    }
  });

  /**
   * Handles input value changes
   */
  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
  }, []);



  /**
   * Handles sending a message through the LangGraph workflow
   */
  const handleSendMessage = useCallback(async (message: string) => {
    // Validate message
    if (!message.trim() || isProcessing) {
      logger.debug('🚫 Message send blocked', { 
        hasContent: !!message.trim(),
        isProcessing
      });
      return;
    }

    logger.info('📤 Sending user message via LangGraph', { 
      messageLength: message.length,
      currentStage: appState.current_stage,
      sessionId: appState.idea_id
    });

    try {
      // Send message through LangGraph workflow
      await sendMessage(message);
      
      // Clear input on successful send
      setInputValue('');
      
      logger.info('✅ Message sent successfully via LangGraph', { 
        messageLength: message.length,
        sessionId: appState.idea_id
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ Failed to send message via LangGraph', { 
        error: errorMessage,
        sessionId: appState.idea_id
      });
    }
  }, [sendMessage, isProcessing, appState.current_stage, appState.idea_id]);

  /**
   * Handles voice recording requests from the InputBar
   */
  const handleVoiceRecord = useCallback(() => {
    logger.info('🎤 Voice recording requested');
    audioRecording.startRecording();
  }, [audioRecording]);

  /**
   * Handles file upload requests from the InputBar
   * TODO: Implement file upload functionality in future tasks
   */
  const handleFileUpload = useCallback(() => {
    logger.info('📎 File upload requested (not yet implemented)');
    // TODO: Implement file upload functionality
  }, []);

  /**
   * Handles generate summary request from the Chat component
   */
  const handleGenerateSummary = useCallback(async () => {
    logger.info('📄 Generate summary requested', { 
      currentStage: appState.current_stage,
      messageCount: appState.messages.length,
      sessionId: appState.idea_id
    });

    if (appState.current_stage !== 'brainstorm') {
      logger.warn('⚠️ Generate summary requested but not in brainstorm stage', { 
        currentStage: appState.current_stage 
      });
      return;
    }

    if (appState.messages.length === 0) {
      logger.warn('⚠️ Generate summary requested but no messages to summarize', { 
        sessionId: appState.idea_id 
      });
      return;
    }

    try {
      await completeStage('brainstorm');
      logger.info('✅ Summary generation triggered successfully', { 
        sessionId: appState.idea_id 
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ Failed to trigger summary generation', { 
        error: errorMessage,
        sessionId: appState.idea_id
      });
    }
  }, [completeStage, appState.current_stage, appState.messages.length, appState.idea_id]);

  /**
   * Creates a new session using LangGraph
   */
  const handleCreateNewSession = useCallback(async () => {
    logger.info('🆕 Creating new session via LangGraph');
    
    try {
      await createNewSession('user_123');
      
      // Add new session to mock sessions list
      const newSession: IdeaEntity = {
        id: currentSession,
        title: `New Session ${new Date().toLocaleTimeString()}`,
        current_stage: 'brainstorm',
        created_at: new Date(),
        user_id: 'user_123'
      };
      
      setSessions(prevSessions => [newSession, ...prevSessions]);
      
      logger.info('✅ New session created successfully via LangGraph', { 
        sessionId: currentSession 
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ Failed to create new session', { error: errorMessage });
    }
  }, [createNewSession, currentSession]);

  /**
   * Switches to a different session
   * TODO: This will be fully implemented when we add session persistence in task 4.0
   */
  const handleSessionSwitch = useCallback((sessionId: string) => {
    logger.info('🔄 Session switch requested (placeholder)', { sessionId });
    // TODO: Implement actual session switching with LangGraph context
    // For now, just log the request
  }, []);

  /**
   * Deletes a session
   * TODO: Implement when we add session persistence in task 4.0
   */
  const handleDeleteSession = useCallback((sessionId: string) => {
    logger.info('🗑️ Session deletion requested (placeholder)', { sessionId });
    // TODO: Implement actual session deletion
  }, []);

  /**
   * Renames a session
   * TODO: Implement when we add session persistence in task 4.0
   */
  const handleRenameSession = useCallback((sessionId: string, newTitle: string) => {
    logger.info('✏️ Session rename requested (placeholder)', { sessionId, newTitle });
    // TODO: Implement actual session renaming
  }, []);

  /**
   * Clears the current error state
   */
  const handleClearError = useCallback(() => {
    logger.info('🧹 Clearing error state');
    clearError();
  }, [clearError]);

  // Log app initialization and state changes (only log on mount and unmount)
  useEffect(() => {
    logger.info('🚀 FlowGenius App component mounted with LangGraph', {
      sessionId: appState.idea_id,
      currentStage: appState.current_stage,
      messageCount: appState.messages.length,
      totalSessions: sessions.length
    });

    return () => {
      logger.info('🔄 FlowGenius App component unmounting', {
        sessionId: appState.idea_id,
        finalMessageCount: appState.messages.length
      });
    };
  }, []); // Empty dependency array - only run on mount/unmount

  // Log LangGraph state changes for debugging (throttled)
  useEffect(() => {
    logger.debug('📊 LangGraph state changed', {
      stage: appState.current_stage,
      messageCount: appState.messages.length,
      isExecuting: langGraphState.isExecuting,
      lastAction: appState.last_user_action,
      hasError: !!langGraphState.error
    });
  }, [
    appState.current_stage, 
    appState.idea_id  // Only re-run when stage or session changes, not on every message
  ]);

  return (
    <div className="app-container">


      {/* Main layout container */}
      <div className="main-layout">
        {/* Sidebar Component */}
        <Sidebar
          currentAppState={appState}
          onCreateNewSession={handleCreateNewSession}
          onSessionSwitch={handleSessionSwitch}
          sessions={sessions}
          isLoading={isSessionLoading}
          onDeleteSession={handleDeleteSession}
          onRenameSession={handleRenameSession}
        />

        {/* Main Chat Area */}
        <main className="chat-main">
          {/* Chat header with current session info */}
          <header className="chat-header">
            <div className="chat-header-content">
              <h1 className="chat-title">
                {appState.title || 'Deep Thinker'}
              </h1>
              <div className="chat-status">
                <span className={`status-indicator ${isProcessing ? 'processing' : 'ready'}`}>
                  {isProcessing ? 'Processing...' : `${appState.current_stage} stage`}
                </span>
                {langGraphState.executionHistory.length > 0 && (
                  <span className="execution-count">
                    {langGraphState.executionHistory.length} executions
                  </span>
                )}
              </div>
            </div>
          </header>

          {/* Chat messages area */}
          <div className="chat-content">
            <Chat
              messages={appState.messages}
              currentStage={appState.current_stage}
              isProcessing={isProcessing}
              autoScroll={true}
              onMessageAction={(action, messageIndex) => {
                logger.info('🎯 Chat message action triggered', { action, messageIndex });
                // TODO: Implement message actions (copy, regenerate, etc.)
              }}
              onGenerateSummary={handleGenerateSummary}
            />
          </div>

          {/* Input area */}
          <div className="chat-input-area">
            <InputBar
              value={inputValue}
              onChange={handleInputChange}
              onSend={handleSendMessage}
              onVoiceRecord={handleVoiceRecord}
              onFileUpload={handleFileUpload}
              isProcessing={isProcessing}
              isVoiceEnabled={true}
              isUploadEnabled={true} // For future implementation
              placeholder="Message Deep Thinker..."
              disabled={isProcessing}
            />
            
            {/* Hidden AudioRecorder for background recording functionality */}
            {audioRecording.hasPermission && (
              <div style={{ 
                position: 'absolute', 
                left: '-9999px', 
                top: '-9999px', 
                visibility: 'hidden',
                pointerEvents: 'none'
              }}>
                <AudioRecorder
                  onRecordingComplete={(audioBlob, duration) => {
                    logger.info('🎤 AudioRecorder completed recording', { blobSize: audioBlob.size, duration });
                    audioRecording.handleRecordingComplete(audioBlob, duration);
                  }}
                  onRecordingError={(error) => {
                    logger.error('❌ AudioRecorder error', { error });
                    audioRecording.handleRecordingError(error);
                  }}
                  onStateChange={(state) => {
                    logger.info('🔄 AudioRecorder state change', { 
                      from: audioRecording.recordingState,
                      to: state,
                      stopSignal: audioRecording.stopSignal
                    });
                    audioRecording.handleRecordingStateChange(state);
                  }}
                  disabled={isProcessing}
                  autoStart={audioRecording.recordingState === RecordingState.RECORDING}
                  showVisualFeedback={false}
                  stopSignal={audioRecording.stopSignal}
                />
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Non-intrusive Recording Indicator */}
      {audioRecording.recordingState === RecordingState.RECORDING && (
        <div className="recording-indicator-overlay">
          <div className="recording-indicator">
            <div className="recording-pulse"></div>
            <span className="recording-text">🎤 Recording...</span>
            <button 
              className="stop-recording-btn"
              onClick={() => {
                logger.info('🛑 Stop recording button clicked', {
                  currentRecordingState: audioRecording.recordingState,
                  currentStopSignal: audioRecording.stopSignal
                });
                audioRecording.stopRecording();
                logger.info('🛑 Stop recording called, new stopSignal should be:', { 
                  expectedStopSignal: audioRecording.stopSignal + 1 
                });
              }}
              title="Stop recording"
            >
              ⏹️
            </button>
          </div>
        </div>
      )}

      {/* Permission Dialog */}
      <PermissionDialog
        isOpen={audioRecording.isPermissionDialogOpen}
        onPermissionGranted={audioRecording.handlePermissionGranted}
        onPermissionDenied={audioRecording.handlePermissionDenied}
        onClose={audioRecording.closePermissionDialog}
        showTroubleshooting={audioRecording.showTroubleshooting}
        errorMessage={audioRecording.errorMessage || undefined}
      />

      {/* Error display */}
      {currentError && (
        <div className="error-banner">
          <div className="error-content">
            <span className="error-icon">⚠️</span>
            <span className="error-message">{currentError}</span>
            <button 
              className="error-dismiss"
              onClick={handleClearError}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Debug info in development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="debug-info">
          <details>
            <summary>🔍 LangGraph Debug Info</summary>
            <pre>{JSON.stringify({
              currentStage: appState.current_stage,
              lastAction: appState.last_user_action,
              messageCount: appState.messages.length,
              isExecuting: langGraphState.isExecuting,
              executionCount: langGraphState.metrics.totalExecutions,
              avgExecutionTime: Math.round(langGraphState.metrics.averageExecutionTime)
            }, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

/**
 * Main App component with LangGraph provider
 * This wraps the inner component with the LangGraph context
 */
function App() {
  return (
    <LangGraphProvider>
      <AppInner />
    </LangGraphProvider>
  );
}

export default App;
