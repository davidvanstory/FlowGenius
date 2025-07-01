# Components Directory

This directory contains all React components for the FlowGenius application, organized in a modular structure for maintainability and scalability.

## Directory Structure

### Core UI Components
- `Chat/` - Main chat interface component with message display
- `Sidebar/` - Session management sidebar component (OpenAI-style)  
- `InputBar/` - Bottom input bar with text field, microphone, and upload icons
- `AudioRecorder/` - Voice recording component with MediaRecorder API
- `ConsoleLog/` - Collapsible console log panel for debugging

### Shared/Utility Components  
- `shared/` - Reusable UI components (buttons, modals, etc.)
- `layout/` - Layout components for consistent structure

### Legacy Components
- `update/` - Electron auto-updater components (preserved from original template)

## Component Guidelines

1. **File Naming**: Use PascalCase for component files (e.g., `Chat.tsx`)
2. **Structure**: Each component should have its own directory with:
   - `index.tsx` - Main component file
   - `ComponentName.test.tsx` - Unit tests
   - `ComponentName.module.css` - Component-specific styles (if needed)
3. **Documentation**: All components must include JSDoc comments
4. **Exports**: Use named exports for components and default exports for the main component
5. **Props**: Define TypeScript interfaces for all props

## Testing

- All components must have corresponding test files
- Tests should cover component rendering, user interactions, and edge cases
- Use React Testing Library for testing components

## Styling

- Follow OpenAI ChatGPT design principles
- Use CSS modules for component-specific styles
- Global styles are in the `src/styles/` directory 