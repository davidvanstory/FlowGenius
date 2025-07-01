/**
 * Sidebar Component
 * 
 * OpenAI-style sidebar for session management with create new session functionality,
 * session list display, and user information. Uses Tailwind CSS for styling and 
 * follows accessibility best practices.
 */

import { useState, useCallback, useMemo } from 'react';
import { AppState, IdeaEntity, WorkflowStage } from '../types/AppState';
import { logger } from '../utils/logger';

/**
 * Props interface for the Sidebar component
 */
export interface SidebarProps {
  /** Current application state */
  currentAppState: AppState;
  /** Whether the sidebar is open (for mobile responsive design) */
  isOpen: boolean;
  /** Function to toggle sidebar visibility */
  onToggle: () => void;
  /** Function to create a new session */
  onCreateNewSession: () => void;
  /** Function to switch to a different session */
  onSessionSwitch: (sessionId: string) => void;
  /** List of all available sessions/ideas */
  sessions: IdeaEntity[];
  /** Loading state for session operations */
  isLoading?: boolean;
  /** Function to delete a session */
  onDeleteSession?: (sessionId: string) => void;
  /** Function to rename a session */
  onRenameSession?: (sessionId: string, newTitle: string) => void;
}

/**
 * Interface for session item props
 */
interface SessionItemProps {
  session: IdeaEntity;
  isActive: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  onRename?: (newTitle: string) => void;
}

/**
 * Individual session item component
 */
const SessionItem = ({ 
  session, 
  isActive, 
  onSelect, 
  onDelete, 
  onRename 
}: SessionItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);
  const [showMenu, setShowMenu] = useState(false);

  /**
   * Handle session rename submission
   */
  const handleRename = useCallback(() => {
    if (editTitle.trim() && editTitle !== session.title && onRename) {
      logger.info('📝 Renaming session', { 
        sessionId: session.id, 
        oldTitle: session.title, 
        newTitle: editTitle.trim() 
      });
      onRename(editTitle.trim());
    }
    setIsEditing(false);
    setShowMenu(false);
  }, [editTitle, session.id, session.title, onRename]);

  /**
   * Handle session deletion
   */
  const handleDelete = useCallback(() => {
    if (onDelete && window.confirm(`Are you sure you want to delete "${session.title}"?`)) {
      logger.info('🗑️ Deleting session', { sessionId: session.id, title: session.title });
      onDelete();
    }
    setShowMenu(false);
  }, [onDelete, session.id, session.title]);

  /**
   * Format the session creation date
   */
  const formattedDate = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(session.created_at));
  }, [session.created_at]);

  /**
   * Get stage color for visual indication
   */
  const stageColor = useMemo(() => {
    const colors: Record<WorkflowStage, string> = {
      brainstorm: 'bg-blue-500/20 text-blue-400',
      summary: 'bg-yellow-500/20 text-yellow-400',
      prd: 'bg-green-500/20 text-green-400',
    };
    return colors[session.current_stage] || 'bg-gray-500/20 text-gray-400';
  }, [session.current_stage]);

  return (
    <div
      className={`
        group relative flex flex-col p-3 rounded-lg cursor-pointer transition-all duration-200
        ${isActive 
          ? 'bg-white/10 border border-white/20' 
          : 'hover:bg-white/5 border border-transparent hover:border-white/10'
        }
      `}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      aria-label={`Session: ${session.title}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Session Title */}
      <div className="flex items-start justify-between gap-2 mb-2">
        {isEditing ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') {
                setIsEditing(false);
                setEditTitle(session.title);
              }
              e.stopPropagation();
            }}
            className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
                     <h3 className="flex-1 text-sm font-medium text-white leading-tight overflow-hidden" style={{
             display: '-webkit-box',
             WebkitLineClamp: 2,
             WebkitBoxOrient: 'vertical',
           }}>
             {session.title}
           </h3>
        )}
        
        {/* Session Menu */}
        <div className="relative">
          <button
            className={`
              p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity
              hover:bg-white/10 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-emerald-500
              ${showMenu ? 'opacity-100' : ''}
            `}
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            aria-label="Session options"
          >
            <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>
          
          {showMenu && (
            <div className="absolute right-0 top-8 w-32 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-10">
              <button
                className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 rounded-t-lg"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                  setShowMenu(false);
                }}
              >
                Rename
              </button>
              {onDelete && (
                <button
                  className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-gray-700 rounded-b-lg"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete();
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Session Metadata */}
      <div className="flex items-center justify-between text-xs">
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${stageColor}`}>
          {session.current_stage}
        </span>
        <span className="text-gray-400">{formattedDate}</span>
      </div>
    </div>
  );
};

/**
 * Main Sidebar component
 */
export const Sidebar = ({
  currentAppState,
  isOpen,
  onToggle,
  onCreateNewSession,
  onSessionSwitch,
  sessions,
  isLoading = false,
  onDeleteSession,
  onRenameSession,
}: SidebarProps) => {
  const [searchQuery, setSearchQuery] = useState('');

  /**
   * Filter sessions based on search query
   */
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    
    const query = searchQuery.toLowerCase();
    return sessions.filter(session => 
      session.title.toLowerCase().includes(query) ||
      session.current_stage.toLowerCase().includes(query)
    );
  }, [sessions, searchQuery]);

  /**
   * Handle new session creation
   */
  const handleCreateNewSession = useCallback(() => {
    logger.info('🆕 Creating new session from sidebar');
    onCreateNewSession();
  }, [onCreateNewSession]);

  /**
   * Handle session selection
   */
  const handleSessionSelect = useCallback((sessionId: string) => {
    logger.info('🔄 Switching to session', { sessionId, currentSession: currentAppState.idea_id });
    onSessionSwitch(sessionId);
  }, [onSessionSwitch, currentAppState.idea_id]);

  /**
   * Handle session deletion
   */
  const handleSessionDelete = useCallback((sessionId: string) => {
    if (onDeleteSession) {
      onDeleteSession(sessionId);
    }
  }, [onDeleteSession]);

  /**
   * Handle session rename
   */
  const handleSessionRename = useCallback((sessionId: string, newTitle: string) => {
    if (onRenameSession) {
      onRenameSession(sessionId, newTitle);
    }
  }, [onRenameSession]);

  return (
    <aside
      className={`
        flex flex-col h-full w-80 bg-gray-900 border-r border-gray-700 transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:w-80
        fixed top-0 left-0 z-50 lg:z-auto
      `}
      aria-label="Session management sidebar"
    >
      {/* Sidebar Header */}
      <div className="flex flex-col p-4 border-b border-gray-700">
        {/* Logo and Close Button */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-white">FlowGenius</h1>
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            onClick={onToggle}
            aria-label="Close sidebar"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* New Session Button */}
        <button
          className="
            flex items-center justify-center gap-2 w-full p-3 
            bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800
            text-white font-medium rounded-lg transition-colors duration-200
            focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-gray-900
            disabled:opacity-50 disabled:cursor-not-allowed
          "
          onClick={handleCreateNewSession}
          disabled={isLoading}
          aria-label="Create new session"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          )}
          New Session
        </button>

        {/* Search Bar */}
        <div className="relative mt-4">
          <input
            type="text"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="
              w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-600 rounded-lg
              text-white placeholder-gray-400 text-sm
              focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent
            "
          />
          <svg 
            className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && sessions.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-gray-600 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm">
              {searchQuery ? 'No sessions match your search' : 'No sessions yet'}
            </p>
            {!searchQuery && (
              <p className="text-gray-500 text-xs mt-2">
                Create your first session to get started
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={session.id === currentAppState.idea_id}
                onSelect={() => handleSessionSelect(session.id)}
                onDelete={onDeleteSession ? () => handleSessionDelete(session.id) : undefined}
                onRename={onRenameSession ? (newTitle) => handleSessionRename(session.id, newTitle) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
            {currentAppState.user_id?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {currentAppState.user_id || 'Anonymous User'}
            </p>
            <p className="text-xs text-gray-400 truncate">
              {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            className="p-2 rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            aria-label="User settings"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar; 