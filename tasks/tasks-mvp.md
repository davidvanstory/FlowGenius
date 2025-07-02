## Relevant Files

- `src/types/AppState.ts` - Core TypeScript interface for the entire application state as defined in FlowGenius.md
- `src/types/AppState.test.ts` - Unit tests for AppState interface validation
- `src/supabaseClient.ts` - Supabase client configuration and initialization
- `src/supabaseClient.test.ts` - Unit tests for Supabase client connection and operations
- `src/components/Sidebar.tsx` - Session management sidebar component (OpenAI-style)
- `src/components/Sidebar.test.tsx` - Unit tests for Sidebar component
- `src/components/Chat.tsx` - Main chat interface component with message display
- `src/components/Chat.test.tsx` - Unit tests for Chat component
- `src/components/AudioRecorder.tsx` - Voice recording component with MediaRecorder API
- `src/components/AudioRecorder.test.tsx` - Unit tests for AudioRecorder component
- `src/components/InputBar.tsx` - Bottom input bar with text field, microphone, and upload icons
- `src/components/InputBar.test.tsx` - Unit tests for InputBar component
- `src/components/ConsoleLog.tsx` - Collapsible console log panel for debugging app errors and logs
- `src/components/ConsoleLog.test.tsx` - Unit tests for ConsoleLog component
- `src/langgraph/index.ts` - Main LangGraph workflow setup and initialization
- `src/hooks/useLangGraph.tsx` - React context and hooks for LangGraph integration
- `src/langgraph/nodes/processUserTurn.ts` - LangGraph node for handling standard chat messages
- `src/langgraph/nodes/processVoiceInput.ts` - LangGraph node for processing voice-to-text
- `src/langgraph/nodes/generateSummary.ts` - LangGraph node for generating summaries with GPT-4o
- `src/langgraph/nodes/index.ts` - Export all LangGraph nodes
- `src/langgraph/router.ts` - Conditional routing logic for LangGraph workflow
- `src/langgraph/state.ts` - LangGraph state management utilities and AppState interface
- `src/langgraph/langgraph.test.ts` - Unit tests for LangGraph workflow
- `src/services/whisperService.ts` - Service for handling Whisper API calls
- `src/services/whisperService.test.ts` - Unit tests for Whisper service
- `src/services/openaiService.ts` - Service for handling OpenAI GPT-4o API calls
- `src/services/openaiService.test.ts` - Unit tests for OpenAI service
- `src/services/supabaseService.ts` - Service for database operations (ideas, chat_messages, prompts)
- `src/services/supabaseService.test.ts` - Unit tests for Supabase service
- `src/utils/logger.ts` - Centralized logging utility for debugging and monitoring
- `src/utils/errorHandler.ts` - Global error handling utility with user-friendly error messages and recovery suggestions
- `src/utils/errorHandler.ts` - Global error handling utility
- `src/utils/audioUtils.ts` - Audio processing utilities (format conversion, validation)
- `src/utils/audioUtils.test.ts` - Unit tests for audio utilities
- `src/styles/globals.css` - Global CSS styles with OpenAI-inspired design system, CSS custom properties, typography, and comprehensive utility classes
- `src/styles/components.css` - Component-specific CSS styles with button variants, input components, cards, navigation, status indicators, and loading states
- `src/styles/responsive.css` - Desktop-focused responsive design for Electron window resizing with breakpoints for compact, standard, large, and ultra-wide desktop layouts
- `src/App.tsx` - Main application component with layout and state management
- `src/App.test.tsx` - Unit tests for main App component
- `.env.example` - Example environment variables file
- `README.md` - Updated project documentation with setup instructions
- `package.json` - Updated dependencies for LangGraph, Supabase, audio recording

### Notes

- **LangGraph First**: We build the LangGraph workflow engine early (task 3.0) because it's the orchestration layer that connects all features. This prevents having to retrofit isolated functions later.
- Unit tests should typically be placed alongside the code files they are testing (e.g., `MyComponent.tsx` and `MyComponent.test.tsx` in the same directory).
- Use `npm test` to run all tests found by the Jest configuration.
- All components must be thoroughly commented with JSDoc and include extensive console logging.
- The codebase must be modular and extensible for easy addition of future features.
- UI styling must closely match OpenAI's ChatGPT interface based on the provided screenshots.

## Tasks

- [x] 1.0 Set up project structure for modular, extensible architecture
  - [x] 1.1 Create comprehensive TypeScript interfaces for AppState matching FlowGenius.md specification
  - [x] 1.2 Set up folder structure for modular components (components/, services/, utils/, langgraph/, styles/)
  - [x] 1.3 Configure TypeScript strict mode and ESLint rules for code quality
  - [x] 1.4 Set up centralized logging utility with different log levels (debug, info, warn, error)
  - [x] 1.5 Create global error handling utility with user-friendly error messages
  - [x] 1.6 Set up testing framework (Vitest + React Testing Library) with configuration for React components and TypeScript
  - [x] 1.7 Create .env.example file with all required environment variables documented
  - [x] 1.8 Update package.json with all required dependencies (LangGraph, Supabase, audio libraries)
  - [x] 1.9 Create environment validation script to check all required API keys and connections on startup

- [ ] 2.0 Implement OpenAI-style UI with sidebar, chat, and input bar
  - [x] 2.1 Create main App.tsx layout with left sidebar and main chat pane (matching OpenAI's layout)
  - [x] 2.2 Implement Sidebar component with session list, create new session button, and OpenAI styling
  - [x] 2.3 Create Chat component with message display, scrolling, and continuous thread design
  - [x] 2.4 Build InputBar component with text field, microphone icon, and upload icon (styled like OpenAI)
  - [ ] 2.5 Create ConsoleLog component for real-time debugging (collapsible panel showing app logs/errors)
  - [x] 2.6 Implement global CSS styles matching OpenAI's color scheme, typography, and spacing
  - [x] 2.7 Add responsive design considerations for different window sizes
  - [ ] 2.8 Create component-specific CSS with proper hover states and animations
  - [ ] 2.9 Implement proper accessibility features (ARIA labels, keyboard navigation)

- [ ] 3.0 Set up LangGraph workflow engine for MVP (recording → summarization)
  - [x] 3.1 Initialize LangGraph StateGraph with AppState interface from FlowGenius.md
  - [x] 3.2 Create base node structure for processUserTurn (will handle chat messages)
  - [x] 3.3 Create placeholder nodes for V2T and summarization (to be implemented)
  - [x] 3.4 Implement conditional routing logic based on last_user_action
  - [x] 3.5 Create state management utilities for LangGraph workflow
  - [x] 3.6 Add workflow execution logging and debugging capabilities
  - [x] 3.7 Implement workflow error handling and recovery mechanisms
  - [ ] 3.8 Create workflow testing utilities with mock implementations
  - [x] 3.9 Create React hooks/context for connecting UI components to LangGraph workflow

- [ ] 4.0 Integrate Supabase for persistent chat/session data
  - [ ] 4.1 Set up Supabase client configuration with environment variables
  - [ ] 4.2 Create database schema matching FlowGenius.md (ideas, chat_messages, prompts tables)
  - [ ] 4.3 Implement SupabaseService with CRUD operations for all entities
  - [ ] 4.4 Add real-time subscriptions for chat messages and session updates
  - [ ] 4.5 Create data validation and sanitization for all database operations
  - [ ] 4.6 Implement proper error handling for network failures and database errors
  - [ ] 4.7 Add database migration scripts and setup documentation
  - [ ] 4.8 Create comprehensive logging for all database operations

- [ ] 5.0 Implement voice-to-text node with Whisper API
  - [x] 5.1 Create AudioRecorder component using MediaRecorder API with proper browser compatibility
  - [x] 5.2 Implement microphone permission handling with user-friendly prompts
  - [ ] 5.3 Add visual feedback during recording (blue ebbing microphone icon like GPT-4o)
  - [x] 5.4 Create audio format validation and conversion utilities (ensure Whisper API compatibility)
  - [x] 5.5 Build WhisperService for handling API calls with proper error handling and retries
  - [ ] 5.6 Integrate V2T functionality as a LangGraph node
  - [ ] 5.7 Add recording duration limits and progress indicators
  - [ ] 5.8 Create comprehensive error handling for audio recording failures

- [ ] 6.0 Implement summarization node using OpenAI GPT-4o
  - [ ] 6.1 Create OpenAI service with GPT-4o API integration and proper authentication
  - [ ] 6.2 Implement generateSummary as a proper LangGraph node with context management
  - [ ] 6.3 Create prompt templates for summarization (ending with "Ireland is great" as specified)
  - [ ] 6.4 Add token counting and context window management for large conversations
  - [ ] 6.5 Implement streaming responses for better user experience
  - [ ] 6.6 Add retry logic and rate limiting for API calls
  - [ ] 6.7 Create response validation and error handling for malformed AI responses
  - [ ] 6.8 Add comprehensive logging for all AI interactions and debugging

- [ ] 7.0 Implement simple session management sidebar (scaffold for future)
  - [ ] 7.1 Create session list display with idea titles and creation dates
  - [ ] 7.2 Implement "Create New Session" functionality with database persistence
  - [ ] 7.3 Add session switching with proper state management and chat history loading
  - [ ] 7.4 Create session deletion functionality (soft delete for data integrity)
  - [ ] 7.5 Implement session search and filtering capabilities (scaffold for future)
  - [ ] 7.6 Add session export functionality (copy to clipboard, JSON export)
  - [ ] 7.7 Create session metadata display (stage, message count, last updated)
  - [ ] 7.8 Implement proper loading states and error handling for session operations
  - [ ] 7.9 Ensure LangGraph state syncs properly with UI state and database on session switches

- [ ] 8.0 Add logging, error handling, and comments throughout
  - [ ] 8.1 Add JSDoc comments to all functions, classes, and interfaces
  - [ ] 8.2 Implement comprehensive console logging for all user interactions
  - [ ] 8.3 Add error boundaries in React components for graceful error handling
  - [ ] 8.4 Create user-friendly error messages and recovery suggestions
  - [ ] 8.5 Add performance monitoring and logging for API calls and database operations
  - [ ] 8.6 Implement debug mode with verbose logging for development
  - [ ] 8.7 Add input validation and sanitization with proper error messages
  - [ ] 8.8 Create comprehensive testing documentation and examples
  - [ ] 8.9 Create end-to-end tests for complete voice → summary workflow 