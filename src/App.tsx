/**
 * Main Application Component
 * 
 * This is the root component for FlowGenius that implements an OpenAI-style layout
 * with a left sidebar for session management and a main chat pane for conversations.
 * It manages the global application state and provides the layout structure.
 */

import { useState, useEffect, useCallback } from 'react';
import { AppState, createInitialAppState, ChatMessage, IdeaEntity } from './types/AppState';
import { logger } from './utils/logger';
import Sidebar from './components/Sidebar';
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
 * Main App component that provides the OpenAI-style layout and state management
 */
function App() {
  // Generate a unique session ID for this app instance
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  
  // Main application state using the AppState interface
  const [appState, setAppState] = useState<AppState>(() => {
    logger.info('🎯 Initializing FlowGenius application state', { sessionId });
    return createInitialAppState(sessionId, 'user_123');
  });

  // UI state for sidebar visibility (responsive design)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Loading states for different operations
  const [isLoading, setIsLoading] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(false);

  // Mock sessions data - will be replaced with real database data
  const [sessions, setSessions] = useState<IdeaEntity[]>(() => createMockSessions(sessionId));

  /**
   * Updates the application state with new data
   * @param updates - Partial AppState updates to apply
   */
  const updateAppState = useCallback((updates: Partial<AppState>) => {
    logger.debug('📝 Updating application state', { updates, currentState: appState });
    
    setAppState(prevState => {
      const newState = {
        ...prevState,
        ...updates,
        updated_at: new Date()
      };
      
      logger.debug('✅ Application state updated', { 
        previousStage: prevState.current_stage,
        newStage: newState.current_stage,
        messageCount: newState.messages.length
      });
      
      return newState;
    });
  }, [appState]);

  /**
   * Adds a new message to the current conversation
   * @param message - The chat message to add
   */
  const addMessage = useCallback((message: Omit<ChatMessage, 'created_at' | 'stage_at_creation'>) => {
    logger.info('💬 Adding new message to conversation', { 
      role: message.role, 
      contentLength: message.content.length,
      currentStage: appState.current_stage
    });

    const fullMessage: ChatMessage = {
      ...message,
      created_at: new Date(),
      stage_at_creation: appState.current_stage
    };

    updateAppState({
      messages: [...appState.messages, fullMessage]
    });
  }, [appState.current_stage, appState.messages, updateAppState]);

  /**
   * Toggles the sidebar visibility for responsive design
   */
  const toggleSidebar = useCallback(() => {
    logger.debug('🔄 Toggling sidebar visibility', { currentState: isSidebarOpen });
    setIsSidebarOpen(prev => !prev);
  }, [isSidebarOpen]);

  /**
   * Creates a new session/idea
   */
  const createNewSession = useCallback(() => {
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    logger.info('🆕 Creating new session', { newSessionId, previousSession: appState.idea_id });
    
    setIsSessionLoading(true);
    
    // Simulate API call delay
    setTimeout(() => {
      const newState = createInitialAppState(newSessionId, appState.user_id);
      setAppState(newState);
      
             // Add new session to sessions list
       const newSession: IdeaEntity = {
         id: newSessionId,
         title: `New Session ${new Date().toLocaleTimeString()}`,
         current_stage: 'brainstorm',
         created_at: new Date(),
         user_id: appState.user_id ?? 'user_123'
       };
      
      setSessions(prevSessions => [newSession, ...prevSessions]);
      setIsSessionLoading(false);
      
      logger.info('✅ New session created successfully', { sessionId: newSessionId });
    }, 500);
  }, [appState.idea_id, appState.user_id]);

  /**
   * Switches to a different session
   * @param sessionId - The ID of the session to switch to
   */
  const switchToSession = useCallback((sessionId: string) => {
    logger.info('🔄 Switching to session', { sessionId, currentSession: appState.idea_id });
    
    setIsSessionLoading(true);
    
    // Find the session in our mock data
    const targetSession = sessions.find(session => session.id === sessionId);
    
    if (!targetSession) {
      logger.error('❌ Session not found', { sessionId });
      setIsSessionLoading(false);
      return;
    }
    
    // Simulate API call delay
    setTimeout(() => {
      // Create new app state for the selected session
      // TODO: Load actual chat history from database
      const newState = createInitialAppState(sessionId, targetSession.user_id);
      newState.title = targetSession.title;
      newState.current_stage = targetSession.current_stage;
      newState.created_at = targetSession.created_at;
      
      // Add some mock messages for demonstration
      if (sessionId !== appState.idea_id) {
        newState.messages = [
          {
            role: 'assistant',
            content: `Welcome back to "${targetSession.title}"! This session is currently in the ${targetSession.current_stage} stage.`,
            created_at: new Date(Date.now() - 1000 * 60 * 5),
            stage_at_creation: targetSession.current_stage
          }
        ];
      }
      
      setAppState(newState);
      setIsSessionLoading(false);
      
      // Close sidebar on mobile after session switch
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      }
      
      logger.info('✅ Session switch completed', { sessionId, title: targetSession.title });
    }, 300);
  }, [appState.idea_id, sessions]);

  /**
   * Deletes a session
   * @param sessionId - The ID of the session to delete
   */
  const deleteSession = useCallback((sessionId: string) => {
    logger.info('🗑️ Deleting session', { sessionId });
    
    setSessions(prevSessions => prevSessions.filter(session => session.id !== sessionId));
    
    // If deleting current session, switch to another one or create new
    if (sessionId === appState.idea_id) {
      const remainingSessions = sessions.filter(session => session.id !== sessionId);
      if (remainingSessions.length > 0 && remainingSessions[0]) {
        switchToSession(remainingSessions[0].id);
      } else {
        createNewSession();
      }
    }
    
    logger.info('✅ Session deleted successfully', { sessionId });
  }, [appState.idea_id, sessions, switchToSession, createNewSession]);

  /**
   * Renames a session
   * @param sessionId - The ID of the session to rename
   * @param newTitle - The new title for the session
   */
  const renameSession = useCallback((sessionId: string, newTitle: string) => {
    logger.info('📝 Renaming session', { sessionId, newTitle });
    
    setSessions(prevSessions => 
      prevSessions.map(session => 
        session.id === sessionId 
          ? { ...session, title: newTitle }
          : session
      )
    );
    
    // Update current app state title if renaming current session
    if (sessionId === appState.idea_id) {
      updateAppState({ title: newTitle });
    }
    
    logger.info('✅ Session renamed successfully', { sessionId, newTitle });
  }, [appState.idea_id, updateAppState]);

  // Log app initialization
  useEffect(() => {
    logger.info('🚀 FlowGenius App component mounted', {
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
  }, [appState.idea_id, appState.current_stage, appState.messages.length, sessions.length]);

  // Log state changes for debugging
  useEffect(() => {
    logger.debug('📊 App state changed', {
      stage: appState.current_stage,
      messageCount: appState.messages.length,
      isProcessing: appState.is_processing,
      lastAction: appState.last_user_action
    });
  }, [appState.current_stage, appState.messages.length, appState.is_processing, appState.last_user_action]);

  return (
    <div className="app-container">
      {/* Loading overlay */}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Processing...</p>
          </div>
        </div>
      )}

      {/* Mobile header with hamburger menu */}
      <div className="mobile-header">
        <button 
          className="hamburger-button"
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
        >
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
        </button>
        <h1 className="mobile-title">FlowGenius</h1>
      </div>

      {/* Main layout container */}
      <div className="main-layout">
        {/* Sidebar Component */}
        <Sidebar
          currentAppState={appState}
          isOpen={isSidebarOpen}
          onToggle={toggleSidebar}
          onCreateNewSession={createNewSession}
          onSessionSwitch={switchToSession}
          sessions={sessions}
          isLoading={isSessionLoading}
          onDeleteSession={deleteSession}
          onRenameSession={renameSession}
        />

        {/* Main Chat Area */}
        <main className="chat-main">
          {/* Chat header with current session info */}
          <header className="chat-header">
            <div className="chat-header-content">
              <h1 className="chat-title">
                {appState.title || 'New Conversation'}
              </h1>
              <div className="chat-status">
                <span className={`status-indicator ${appState.is_processing ? 'processing' : 'ready'}`}>
                  {appState.is_processing ? 'Processing...' : `${appState.current_stage} stage`}
                </span>
              </div>
            </div>
          </header>

          {/* Chat messages area */}
          <div className="chat-content">
            {/* Chat component will be implemented in task 2.3 */}
            {appState.messages.length === 0 ? (
              <div className="welcome-message">
                <h2>Welcome to FlowGenius</h2>
                <p>Start a conversation to begin developing your ideas through our AI-powered workflow.</p>
                <div className="workflow-stages">
                  <div className="stage-item">
                    <span className="stage-number">1</span>
                    <span className="stage-name">Brainstorm</span>
                  </div>
                  <div className="stage-arrow">→</div>
                  <div className="stage-item">
                    <span className="stage-number">2</span>
                    <span className="stage-name">Summary</span>
                  </div>
                  <div className="stage-arrow">→</div>
                  <div className="stage-item">
                    <span className="stage-number">3</span>
                    <span className="stage-name">PRD</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="messages-container">
                {appState.messages.map((message, index) => (
                  <div 
                    key={index} 
                    className={`message ${message.role}`}
                  >
                    <div className="message-content">
                      <div className="message-avatar">
                        {message.role === 'user' ? 'U' : 'AI'}
                      </div>
                      <div className="message-text">
                        {message.content}
                      </div>
                    </div>
                    <div className="message-meta">
                      <span className="message-time">
                        {message.created_at?.toLocaleTimeString()}
                      </span>
                      <span className="message-stage">
                        {message.stage_at_creation}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="chat-input-area">
            {/* InputBar component will be implemented in task 2.4 */}
            <div className="input-placeholder">
              <input 
                type="text" 
                placeholder="Type your message here..."
                className="temp-input"
                disabled
              />
              <button className="temp-mic-button" disabled>🎤</button>
              <button className="temp-send-button" disabled>Send</button>
            </div>
            <p className="input-disclaimer">
              This is a placeholder. Input functionality will be implemented in the next task.
            </p>
          </div>
        </main>
      </div>

      {/* Error display */}
      {appState.error && (
        <div className="error-banner">
          <div className="error-content">
            <span className="error-icon">⚠️</span>
            <span className="error-message">{appState.error}</span>
            <button 
              className="error-dismiss"
              onClick={() => updateAppState({ error: undefined })}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
