/**
 * WhisperService Integration Test
 * 
 * This test requires a real OpenAI API key and can be run manually to verify
 * that the WhisperService actually works with the OpenAI Whisper API.
 * 
 * To run this test:
 * 1. Set OPENAI_API_KEY environment variable
 * 2. Run: npm test -- src/services/whisperService.integration.test.ts
 * 
 * Note: This will make actual API calls and may incur costs!
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WhisperService, createWhisperService } from './whisperService';
import { logger } from '../utils/logger';

// Skip these tests unless OPENAI_API_KEY is provided
const shouldRunIntegrationTests = !!process.env.OPENAI_API_KEY;
const describeIf = shouldRunIntegrationTests ? describe : describe.skip;

describeIf('WhisperService Integration Tests', () => {
  let whisperService: WhisperService;

  beforeEach(() => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable required for integration tests');
    }
    
    console.log('🎙️ Setting up WhisperService integration test');
    whisperService = createWhisperService();
  });

  /**
   * Create a test audio blob with actual audio data
   * This creates a minimal WAV file with a 1-second 440Hz tone (A note)
   */
  function createTestAudioBlob(): Blob {
    console.log('🎵 Creating test audio blob with 440Hz tone');
    
    const sampleRate = 16000; // Optimal for Whisper
    const duration = 2; // 2 seconds
    const frequency = 440; // A note
    const samples = sampleRate * duration;
    
    // Create WAV file buffer
    const buffer = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples * 2, true);
    
    // Generate 440Hz sine wave
    for (let i = 0; i < samples; i++) {
      const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate);
      const value = Math.round(sample * 32767 * 0.5); // 50% volume
      view.setInt16(44 + i * 2, value, true);
    }
    
    const blob = new Blob([buffer], { type: 'audio/wav' });
    console.log(`✅ Created ${blob.size} byte WAV file with ${duration}s of ${frequency}Hz tone`);
    
    return blob;
  }

  /**
   * Create a test audio blob with speech-like content
   * This creates a more complex waveform that might be better recognized by Whisper
   */
  function createSpeechLikeAudioBlob(): Blob {
    console.log('🗣️ Creating speech-like test audio blob');
    
    const sampleRate = 16000;
    const duration = 3; // 3 seconds
    const samples = sampleRate * duration;
    
    // Create WAV file buffer
    const buffer = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(buffer);
    
    // WAV header (same as above)
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples * 2, true);
    
    // Generate complex waveform with multiple frequencies (like speech formants)
    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      
      // Mix multiple sine waves to create speech-like formants
      const f1 = 250 + 50 * Math.sin(2 * Math.PI * 3 * t); // First formant
      const f2 = 1200 + 200 * Math.sin(2 * Math.PI * 7 * t); // Second formant
      const f3 = 2400 + 100 * Math.sin(2 * Math.PI * 11 * t); // Third formant
      
      const sample = 
        0.6 * Math.sin(2 * Math.PI * f1 * t) +
        0.3 * Math.sin(2 * Math.PI * f2 * t) +
        0.1 * Math.sin(2 * Math.PI * f3 * t);
      
      // Add some noise and envelope
      const envelope = Math.exp(-t * 0.5) * (1 + 0.1 * Math.random());
      const value = Math.round(sample * envelope * 16383); // Lower volume
      
      view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, value)), true);
    }
    
    const blob = new Blob([buffer], { type: 'audio/wav' });
    console.log(`✅ Created ${blob.size} byte speech-like WAV file`);
    
    return blob;
  }

  it('should connect to OpenAI Whisper API', async () => {
    console.log('🔍 Testing connection to OpenAI Whisper API');
    
    const result = await whisperService.testConnection();
    
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    
    console.log('✅ Successfully connected to OpenAI Whisper API');
  }, 30000); // 30 second timeout

  it('should transcribe simple audio tone', async () => {
    console.log('🎵 Testing transcription of simple audio tone');
    
    const audioBlob = createTestAudioBlob();
    
    const result = await whisperService.transcribeBlob(audioBlob, {
      responseFormat: 'verbose_json',
      validateAudio: true
    });
    
    console.log('📝 Transcription result:', {
      success: result.success,
      textLength: result.data?.text?.length || 0,
      text: result.data?.text?.substring(0, 100) + '...',
      language: result.data?.language,
      duration: result.data?.duration,
      processingTime: result.data?.metadata.processingTime
    });
    
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.text).toBeDefined();
    expect(result.data!.metadata.fileSize).toBe(audioBlob.size);
    expect(result.data!.metadata.audioValidation.isValid).toBe(true);
    
    console.log('✅ Successfully transcribed audio tone');
  }, 60000); // 60 second timeout

  it('should transcribe speech-like audio', async () => {
    console.log('🗣️ Testing transcription of speech-like audio');
    
    const audioBlob = createSpeechLikeAudioBlob();
    
    const result = await whisperService.transcribeBlob(audioBlob, {
      responseFormat: 'verbose_json',
      validateAudio: true,
      language: 'en' // Hint that it's English
    });
    
    console.log('📝 Speech-like transcription result:', {
      success: result.success,
      textLength: result.data?.text?.length || 0,
      text: result.data?.text,
      language: result.data?.language,
      duration: result.data?.duration,
      segments: result.data?.segments?.length || 0,
      processingTime: result.data?.metadata.processingTime
    });
    
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.text).toBeDefined();
    
    console.log('✅ Successfully transcribed speech-like audio');
  }, 60000); // 60 second timeout

  it('should handle audio validation during transcription', async () => {
    console.log('🔍 Testing audio validation integration');
    
    const audioBlob = createTestAudioBlob();
    
    const result = await whisperService.transcribeBlob(audioBlob, {
      validateAudio: true,
      responseFormat: 'text'
    });
    
    expect(result.success).toBe(true);
    expect(result.data?.metadata.audioValidation).toBeDefined();
    expect(result.data?.metadata.audioValidation.isValid).toBe(true);
    expect(result.data?.metadata.audioValidation.errors).toHaveLength(0);
    
    console.log('📊 Audio validation results:', {
      isValid: result.data?.metadata.audioValidation.isValid,
      warnings: result.data?.metadata.audioValidation.warnings.length,
      recommendations: result.data?.metadata.audioValidation.recommendations.length
    });
    
    console.log('✅ Audio validation integration working correctly');
  }, 60000);

  it('should track request statistics', async () => {
    console.log('📊 Testing request statistics tracking');
    
    const initialStatus = whisperService.getStatus();
    const initialCount = initialStatus.requestCount;
    
    const audioBlob = createTestAudioBlob();
    
    await whisperService.transcribeBlob(audioBlob, {
      validateAudio: false,
      responseFormat: 'text'
    });
    
    const finalStatus = whisperService.getStatus();
    
    expect(finalStatus.requestCount).toBe(initialCount + 1);
    expect(finalStatus.lastRequestTime).toBeGreaterThan(initialStatus.lastRequestTime);
    
    console.log('📈 Request statistics:', {
      initialCount,
      finalCount: finalStatus.requestCount,
      lastRequestTime: new Date(finalStatus.lastRequestTime).toISOString()
    });
    
    console.log('✅ Request statistics tracking working correctly');
  }, 60000);

  it('should handle different response formats', async () => {
    console.log('📝 Testing different response formats');
    
    const audioBlob = createTestAudioBlob();
    
    // Test text format
    const textResult = await whisperService.transcribeBlob(audioBlob, {
      responseFormat: 'text',
      validateAudio: false
    });
    
    expect(textResult.success).toBe(true);
    expect(typeof textResult.data?.text).toBe('string');
    
    // Test verbose_json format
    const jsonResult = await whisperService.transcribeBlob(audioBlob, {
      responseFormat: 'verbose_json',
      validateAudio: false
    });
    
    expect(jsonResult.success).toBe(true);
    expect(jsonResult.data?.language).toBeDefined();
    expect(jsonResult.data?.duration).toBeDefined();
    
    console.log('📋 Response format comparison:', {
      textLength: textResult.data?.text?.length || 0,
      jsonText: jsonResult.data?.text?.length || 0,
      hasLanguage: !!jsonResult.data?.language,
      hasDuration: !!jsonResult.data?.duration,
      hasSegments: !!jsonResult.data?.segments
    });
    
    console.log('✅ Different response formats working correctly');
  }, 120000); // 2 minute timeout for multiple requests
});

// Instructions for running the test
if (!shouldRunIntegrationTests) {
  console.log(`
🚫 Integration tests skipped - no OPENAI_API_KEY provided

To run these tests:
1. Set your OpenAI API key: export OPENAI_API_KEY="your-key-here"
2. Run the tests: npm test -- src/services/whisperService.integration.test.ts

⚠️  Warning: These tests make actual API calls and may incur costs!
  `);
} 