# Services Directory

This directory contains all service modules for external API integrations and business logic in the FlowGenius application.

## Directory Structure

### API Services
- `openaiService.ts` - Service for handling OpenAI GPT-4o API calls
- `whisperService.ts` - Service for handling Whisper API calls (voice-to-text)
- `supabaseService.ts` - Service for database operations (ideas, chat_messages, prompts)

### Service Guidelines

1. **File Naming**: Use camelCase with "Service" suffix (e.g., `openaiService.ts`)
2. **Structure**: Each service should have:
   - Main service file with exported functions
   - Corresponding test file (`serviceName.test.ts`)
   - Type definitions for API requests/responses
3. **Error Handling**: All services must include proper error handling and logging
4. **Documentation**: All functions must include JSDoc comments
5. **Configuration**: Use environment variables for API keys and endpoints

## Testing

- All services must have comprehensive unit tests
- Tests should cover success cases, error cases, and edge cases
- Use mocking for external API calls in tests
- Test files should be named `serviceName.test.ts` 