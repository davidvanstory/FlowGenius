import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src'),
    },
  },
  test: {
    root: __dirname,
    // Include both e2e tests and unit tests
    include: [
      'test/**/*.{test,spec}.?(c|m)[jt]s?(x)',
      'src/**/*.{test,spec}.?(c|m)[jt]s?(x)',
      'electron/**/*.{test,spec}.?(c|m)[jt]s?(x)'
    ],
    testTimeout: 1000 * 45, // Increased timeout for real GPT-4 API calls
    // Configure environment for React component testing
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    // Enable globals for describe, it, expect, etc.
    globals: true,
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'dist-electron/',
        'test/',
        '**/*.d.ts',
        '**/*.config.*',
        'coverage/**',
      ],
    },
  },
});
