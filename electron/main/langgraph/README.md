# LangGraph Directory

This directory contains the LangGraph workflow engine implementation for the FlowGenius application. LangGraph manages the conversational workflow and state transitions between brainstorming, summarization, and PRD generation stages.

## Directory Structure

### Core Files
- `index.ts` - Main LangGraph workflow setup and initialization
- `state.ts` - LangGraph state management utilities and AppState interface integration
- `router.ts` - Conditional routing logic for LangGraph workflow

### Nodes Directory (`nodes/`)
LangGraph nodes represent individual processing steps in the workflow:
- `processUserTurn.ts` - Handles standard chat messages during brainstorming
- `processVoiceInput.ts` - Processes voice-to-text input from user recordings
- `generateSummary.ts` - Generates detailed summaries using GPT-4o after brainstorming
- `index.ts` - Exports all LangGraph nodes

### Edges Directory (`edges/`)
LangGraph edges define the connections and transitions between nodes:
- Custom edge conditions and routing logic
- State-based transition rules

## LangGraph Workflow

The FlowGenius LangGraph workflow follows this pattern:

1. **Entry Point**: `processUserTurn` (handles all user inputs)
2. **Routing Logic**: Based on `last_user_action` in AppState:
   - `'chat'` → Continue in current stage
   - `'Brainstorm Done'` → Route to `generateSummary`
   - `'Summary Done'` → Route to `generatePRD` (future)
   - `'PRD Done'` → Terminal state

3. **State Management**: Each node receives and returns the complete AppState
4. **Error Handling**: All nodes include comprehensive error handling and logging

## Node Implementation Guidelines

1. **Function Signature**: All nodes must accept and return `AppState`
2. **Logging**: Extensive logging for debugging and monitoring
3. **Error Handling**: Graceful error handling with user-friendly messages
4. **State Updates**: Immutable state updates using proper TypeScript practices
5. **Testing**: Comprehensive unit tests for each node

## Example Node Structure

```typescript
/**
 * LangGraph node for [specific functionality]
 */
import { AppState } from '../types/AppState';
import { logger } from '../utils/logger';

export async function nodeName(state: AppState): Promise<AppState> {
  try {
    logger.info('Starting node execution', { 
      nodeType: 'nodeName',
      ideaId: state.idea_id,
      currentStage: state.current_stage 
    });

    // Node implementation
    const updatedState = {
      ...state,
      // state updates
    };

    logger.info('Node execution completed successfully');
    return updatedState;
  } catch (error) {
    logger.error('Node execution failed', { error, state });
    return {
      ...state,
      error: 'User-friendly error message'
    };
  }
}
```

## Testing

- All nodes must have comprehensive unit tests
- Test with various AppState configurations
- Mock external API calls
- Test error conditions and edge cases 