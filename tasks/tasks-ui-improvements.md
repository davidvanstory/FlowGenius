## Relevant Files

- `src/components/Sidebar.tsx` - Main sidebar component that needs persistence and simplification updates
- `src/components/Sidebar.test.tsx` - Unit tests for sidebar component
- `src/components/Chat.tsx` - Main chat component that needs text legibility improvements
- `src/components/Chat.test.tsx` - Unit tests for chat component
- `src/components/AudioRecorder.tsx` - Recording component that needs positioning and click reduction
- `src/components/AudioRecorder.test.tsx` - Unit tests for audio recorder component
- `src/components/PermissionDialog.tsx` - Permission dialog that needs to be eliminated from the flow
- `src/components/PermissionDialog.test.tsx` - Unit tests for permission dialog component
- `src/components/InputBar.tsx` - Input component with microphone button that needs direct recording
- `src/components/InputBar.test.tsx` - Unit tests for input bar component
- `src/hooks/useAudioRecording.tsx` - Recording hook that needs flow simplification
- `src/hooks/useAudioRecording.test.tsx` - Unit tests for audio recording hook
- `src/App.tsx` - Main app component that manages sidebar state and recording modal positioning
- `src/App.css` - Main app styles that need sidebar layout adjustments
- `src/styles/components.css` - Component styles that need text legibility and recording UI improvements
- `src/styles/responsive.css` - Responsive styles that need sidebar behavior updates

### Notes

- Unit tests should be created/updated for all component changes to ensure functionality is maintained
- Use `npm test` or `npm run test:watch` to run tests during development
- The sidebar toggle functionality should be completely removed, not just hidden
- Recording flow should bypass permission dialog when possible and start immediately
- Text contrast should follow accessibility guidelines (WCAG AA minimum)

## Tasks

- [x] 1.0 Make Sidebar Always Persistent and Remove Toggle Functionality
  - [x] 1.1 Remove `isSidebarOpen` state and `toggleSidebar` function from App.tsx
  - [x] 1.2 Remove `isOpen` and `onToggle` props from Sidebar component
  - [x] 1.3 Update CSS to make sidebar always visible (remove transform/translate styles)
  - [x] 1.4 Remove mobile hamburger menu button from App.tsx
- [x] 2.0 Simplify Sidebar Content and Remove Workflow Stage Tags  
  - [x] 2.1 Remove stage badge display from SessionItem component in Sidebar.tsx
  - [x] 2.2 Remove stage filtering from session search functionality
  - [x] 2.3 Clean up session display to show only title and date
- [x] 3.0 Improve Main Chat Text Legibility and Contrast
  - [x] 3.1 Update message text colors in Chat.tsx for better contrast
  - [x] 3.2 Improve chat background colors in components.css
  - [x] 3.3 Update gray text colors to meet accessibility standards
  - [x] 3.4 Reduce the size of the text input field to be half the size and make the text input section white for consistency with the rest of the "new Conversation" panel 

- [x] 4.0 Move the generate summary button to appear in the text input field section of the application, instead of randomly in the bottom right corner. make it fit nicely and well integrated with the other buttons

- [x] 5.0 Add loading state for summary generation to indicate processing is happening
  - [x] 5.1 Enhanced TypingIndicator component to show context-specific messages based on workflow stage
  - [x] 5.2 Added specific "Generating Summary" indicator with visual badge when summary is being processed
  - [x] 5.3 Added isGeneratingSummary state tracking in App.tsx to monitor summary generation progress
  - [x] 5.4 Enhanced CSS animations for summary generation loading state with pulse and bounce effects
  - [x] 5.5 Added appropriate loading icons for different workflow stages (💭 for brainstorm, 📄 for summary, 📝 for PRD)
  - [x] 5.6 Added "This may take a few moments..." message for summary generation to set user expectations

