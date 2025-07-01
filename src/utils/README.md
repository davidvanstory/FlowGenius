# Utils Directory

This directory contains utility functions and helper modules that are used throughout the FlowGenius application.

## Directory Structure

### Core Utilities
- `logger.ts` - Centralized logging utility with different log levels (debug, info, warn, error)
- `errorHandler.ts` - Global error handling utility with user-friendly error messages
- `audioUtils.ts` - Audio processing utilities (format conversion, validation)

### Utility Guidelines

1. **File Naming**: Use camelCase with descriptive names (e.g., `audioUtils.ts`)
2. **Structure**: Each utility should have:
   - Main utility file with exported functions
   - Corresponding test file (`utilityName.test.ts`)
   - Type definitions for parameters and return values
3. **Pure Functions**: Utilities should be pure functions when possible
4. **Documentation**: All functions must include JSDoc comments
5. **Testing**: All utilities must be thoroughly tested

## Utility Categories

### Logging (`logger.ts`)
- Centralized logging with configurable levels
- Console and file output options
- Structured logging with metadata

### Error Handling (`errorHandler.ts`)
- Global error boundary integration
- User-friendly error message formatting
- Error reporting and tracking

### Audio Processing (`audioUtils.ts`)
- Audio format validation and conversion
- MediaRecorder API utilities
- Audio file processing helpers

## Testing

- All utilities must have comprehensive unit tests
- Tests should cover edge cases and error conditions
- Pure functions should test input/output mappings
- Test files should be named `utilityName.test.ts` 