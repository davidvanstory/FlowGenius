/**
 * Test Setup Configuration for FlowGenius
 * 
 * This file configures the testing environment for React components using Vitest
 * and React Testing Library. It provides global setup for all tests including
 * DOM matchers, cleanup, and environment configuration.
 * 
 * Features:
 * - React Testing Library integration
 * - Custom Jest-DOM matchers
 * - Automatic cleanup after each test
 * - Global test utilities
 * - Mock configurations for Electron APIs
 */

import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

/**
 * Cleanup after each test to prevent memory leaks and test interference
 */
afterEach(() => {
  console.log('🧹 Test cleanup: Cleaning up after test');
  cleanup();
});

/**
 * Setup before each test
 */
beforeEach(() => {
  console.log('🚀 Test setup: Preparing test environment');
  
  // Clear all mocks before each test
  vi.clearAllMocks();
  
  // Reset any module mocks
  vi.resetModules();
});

/**
 * Mock Electron APIs for testing in Node.js environment
 */
const mockElectronAPI = {
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    send: vi.fn(),
  },
  platform: 'darwin',
  versions: {
    node: '18.0.0',
    chrome: '100.0.0',
    electron: '20.0.0',
  },
};

// Mock window.electron for components that use Electron APIs
Object.defineProperty(window, 'electron', {
  value: mockElectronAPI,
  writable: true,
});

/**
 * Mock console methods to reduce noise in tests
 * Comment out during debugging if you need to see console output
 */
global.console = {
  ...console,
  // Uncomment to silence console.log in tests
  // log: vi.fn(),
  // info: vi.fn(),
  // warn: vi.fn(),
  // error: vi.fn(),
};

/**
 * Mock localStorage for tests
 */
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

/**
 * Mock sessionStorage for tests
 */
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
});

/**
 * Mock MediaRecorder API for audio recording tests
 */
class MockMediaRecorder {
  state: string = 'inactive';
  stream: MediaStream;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstart: (() => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(stream: MediaStream) {
    console.log('🎤 MockMediaRecorder: Creating mock MediaRecorder', { stream });
    this.stream = stream;
  }

  start() {
    console.log('🎤 MockMediaRecorder: Starting recording');
    this.state = 'recording';
    if (this.onstart) this.onstart();
  }

  stop() {
    console.log('🎤 MockMediaRecorder: Stopping recording');
    this.state = 'inactive';
    if (this.onstop) this.onstop();
    
    // Simulate data available event
    if (this.ondataavailable) {
      const mockBlob = new Blob(['mock audio data'], { type: 'audio/wav' });
      this.ondataavailable({ data: mockBlob } as BlobEvent);
    }
  }

  pause() {
    console.log('🎤 MockMediaRecorder: Pausing recording');
    this.state = 'paused';
  }

  resume() {
    console.log('🎤 MockMediaRecorder: Resuming recording');
    this.state = 'recording';
  }

  requestData() {
    console.log('🎤 MockMediaRecorder: Requesting data');
    if (this.ondataavailable) {
      const mockBlob = new Blob(['mock audio data'], { type: 'audio/wav' });
      this.ondataavailable({ data: mockBlob } as BlobEvent);
    }
  }

  static isTypeSupported(type: string): boolean {
    console.log('🎤 MockMediaRecorder: Checking type support', { type });
    return ['audio/wav', 'audio/webm', 'audio/mp4'].includes(type);
  }
}

// Mock getUserMedia for microphone access tests
const mockGetUserMedia = vi.fn().mockResolvedValue({
  getTracks: () => [
    {
      kind: 'audio',
      label: 'Mock Microphone',
      stop: vi.fn(),
      getSettings: () => ({
        sampleRate: 44100,
        channelCount: 1,
      }),
    },
  ],
  getAudioTracks: () => [
    {
      kind: 'audio',
      label: 'Mock Microphone',
      stop: vi.fn(),
    },
  ],
});

Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: mockGetUserMedia,
    enumerateDevices: vi.fn().mockResolvedValue([
      {
        deviceId: 'mock-audio-input',
        kind: 'audioinput',
        label: 'Mock Microphone',
        groupId: 'mock-group',
      },
    ]),
  },
  writable: true,
});

// Set MediaRecorder on global window
Object.defineProperty(window, 'MediaRecorder', {
  value: MockMediaRecorder,
  writable: true,
});

/**
 * Polyfill fetch for Node.js testing environment
 * Uses undici for real HTTP requests in tests
 */
import { fetch } from 'undici';
global.fetch = fetch as any;

/**
 * Mock environment variables
 */
process.env.NODE_ENV = 'test';

/**
 * Global test utilities
 */
export const testUtils = {
  /**
   * Wait for a specified amount of time
   */
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Wait for the next tick
   */
  waitForNextTick: () => new Promise(resolve => process.nextTick(resolve)),

  /**
   * Create a mock function with logging
   */
  createMockFn: (name: string) => {
    const mockFn = vi.fn();
    
    // Add logging to track calls
    return mockFn.mockImplementation((...args) => {
      console.log(`📞 Mock function called: ${name}`, { args });
      return undefined;
    });
  },

  /**
   * Mock implementation that throws an error
   */
  createMockError: (message: string) => {
    return vi.fn().mockImplementation(() => {
      throw new Error(message);
    });
  },

  /**
   * Mock implementation that returns a promise
   */
  createMockPromise: <T>(resolveValue: T, delay = 0) => {
    return vi.fn().mockImplementation(() => {
      return new Promise(resolve => {
        setTimeout(() => resolve(resolveValue), delay);
      });
    });
  },
};

console.log('✅ Test setup: Test environment configured successfully');
console.log('🧪 Test setup: React Testing Library, Vitest, and mocks ready');
console.log('🎯 Test setup: Electron APIs mocked for component testing');
console.log('🎤 Test setup: MediaRecorder API mocked for audio testing'); 