/**
 * AudioRecorder Component
 * 
 * A React component for recording audio using the MediaRecorder API.
 * Provides voice recording functionality for FlowGenius with proper browser compatibility,
 * error handling, and visual feedback during recording.
 * 
 * Features:
 * - MediaRecorder API integration with fallback support
 * - Microphone permission handling
 * - Real-time recording feedback
 * - Audio format validation
 * - Comprehensive error handling
 * - Accessibility features
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { logger } from '../utils/logger';
import { handleAudioError } from '../utils/errorHandler';

/**
 * Global registry to track all active MediaRecorder instances
 * This helps prevent memory leaks when components remount
 */
const globalMediaRecorderRegistry = new Map<string, { mediaRecorder: MediaRecorder; instanceId: string }>();

/**
 * Global cleanup function to stop all orphaned MediaRecorder instances
 */
function cleanupAllMediaRecorders() {
  logger.info('🧹 Global cleanup: Stopping all registered MediaRecorder instances', { 
    activeCount: globalMediaRecorderRegistry.size 
  });
  
  for (const [, { mediaRecorder, instanceId }] of globalMediaRecorderRegistry.entries()) {
    try {
      if (mediaRecorder.state === 'recording' || mediaRecorder.state === 'paused') {
        logger.warn('🛑 Force stopping orphaned MediaRecorder', { instanceId, state: mediaRecorder.state });
        mediaRecorder.stop();
      }
      
      // Clear event handlers
      mediaRecorder.ondataavailable = null;
      mediaRecorder.onstop = null;
      mediaRecorder.onstart = null;
      mediaRecorder.onerror = null;
      mediaRecorder.onpause = null;
      mediaRecorder.onresume = null;
    } catch (error) {
      logger.warn('⚠️ Error cleaning up orphaned MediaRecorder', { 
        instanceId, 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }
  
  globalMediaRecorderRegistry.clear();
  logger.info('✅ Global cleanup completed');
}

/**
 * Recording state enumeration
 */
export enum RecordingState {
  IDLE = 'idle',
  REQUESTING_PERMISSION = 'requesting_permission',
  RECORDING = 'recording',
  STOPPING = 'stopping',
  ERROR = 'error'
}

/**
 * Audio recording configuration
 */
interface AudioConfig {
  /** Audio sample rate (default: 44100) */
  sampleRate?: number;
  /** Number of audio channels (default: 1) */
  channelCount?: number;
  /** Audio bit depth (default: 16) */
  bitsPerSample?: number;
  /** Maximum recording duration in seconds (default: 300) */
  maxDurationSeconds?: number;
  /** Preferred audio format (default: 'audio/webm') */
  mimeType?: string;
}

/**
 * Props interface for AudioRecorder component
 */
interface AudioRecorderProps {
  /** Callback when recording is completed successfully */
  onRecordingComplete: (audioBlob: Blob, duration: number) => void;
  /** Callback when recording fails */
  onRecordingError: (error: string) => void;
  /** Callback when recording state changes */
  onStateChange?: (state: RecordingState) => void;
  /** Audio recording configuration */
  config?: AudioConfig;
  /** Whether the recorder is disabled */
  disabled?: boolean;
  /** Custom CSS class name */
  className?: string;
  /** Whether to show visual feedback during recording */
  showVisualFeedback?: boolean;
  /** Whether to auto-start recording on mount */
  autoStart?: boolean;
  /** External stop signal - changes to trigger stop */
  stopSignal?: number;
}

/**
 * Default audio configuration optimized for speech recognition
 */
const DEFAULT_AUDIO_CONFIG: Required<AudioConfig> = {
  sampleRate: 44100,
  channelCount: 1,
  bitsPerSample: 16,
  maxDurationSeconds: 300, // 5 minutes
  mimeType: 'audio/webm'
};

/**
 * Supported audio MIME types in order of preference (prioritizing OpenAI Whisper compatibility)
 */
const SUPPORTED_MIME_TYPES = [
  'audio/mp4',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mpeg',
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/wav'
];

/**
 * AudioRecorder component for capturing voice input
 */
export const AudioRecorder: React.FC<AudioRecorderProps> = ({
  onRecordingComplete,
  onRecordingError,
  onStateChange,
  config = {},
  disabled = false,
  className = '',
  showVisualFeedback = true,
  autoStart = false,
  stopSignal = 0
}) => {
  // Merge user config with defaults
  const audioConfig = { ...DEFAULT_AUDIO_CONFIG, ...config };
  
  // Component state
  const [recordingState, setRecordingState] = useState<RecordingState>(RecordingState.IDLE);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Refs for MediaRecorder and related objects
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioLevelIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const lastChunkLogTimeRef = useRef<number>(0);
  const chunkCountSinceLastLogRef = useRef<number>(0);
  const instanceIdRef = useRef<string>(`recorder_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);
  const recordingStateRef = useRef<RecordingState>(RecordingState.IDLE);

  /**
   * Update recording state and notify parent component
   */
  const updateRecordingState = useCallback((newState: RecordingState) => {
    logger.info('🎤 AudioRecorder: State change', { 
      from: recordingState, 
      to: newState,
      instanceId: instanceIdRef.current,
      timestamp: new Date()
    });
    
    recordingStateRef.current = newState;
    setRecordingState(newState);
    onStateChange?.(newState);
  }, [recordingState, onStateChange]);

  /**
   * Check browser compatibility for MediaRecorder API
   */
  const checkBrowserCompatibility = useCallback((): { supported: boolean; mimeType: string } => {
    logger.debug('🔍 AudioRecorder: Checking browser compatibility');

    // Check if MediaRecorder is supported
    if (!window.MediaRecorder) {
      logger.error('❌ AudioRecorder: MediaRecorder API not supported');
      return { supported: false, mimeType: '' };
    }

    // Find the best supported MIME type
    for (const mimeType of SUPPORTED_MIME_TYPES) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        logger.info('✅ AudioRecorder: Found supported MIME type', { mimeType });
        return { supported: true, mimeType };
      }
    }

    // Fallback to basic support check
    const fallbackMimeType = 'audio/webm';
    const isSupported = MediaRecorder.isTypeSupported(fallbackMimeType);
    
    logger.warn('⚠️ AudioRecorder: Using fallback MIME type', { 
      mimeType: fallbackMimeType, 
      supported: isSupported 
    });
    
    return { supported: isSupported, mimeType: fallbackMimeType };
  }, []);

  /**
   * Request microphone permission and get media stream
   */
  const requestMicrophoneAccess = useCallback(async (): Promise<MediaStream> => {
    logger.info('🎤 AudioRecorder: Requesting microphone access');

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          sampleRate: audioConfig.sampleRate,
          channelCount: audioConfig.channelCount,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      logger.info('✅ AudioRecorder: Microphone access granted', {
        tracks: stream.getAudioTracks().length,
        settings: stream.getAudioTracks()[0]?.getSettings()
      });

      return stream;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('❌ AudioRecorder: Microphone access denied', { error: errorMsg });
      
      if (errorMsg.includes('Permission denied') || errorMsg.includes('NotAllowedError')) {
        throw new Error('Microphone permission denied. Please allow microphone access and try again.');
      } else if (errorMsg.includes('NotFoundError')) {
        throw new Error('No microphone found. Please connect a microphone and try again.');
      } else if (errorMsg.includes('NotReadableError')) {
        throw new Error('Microphone is being used by another application. Please close other apps and try again.');
      } else {
        throw new Error(`Microphone access failed: ${errorMsg}`);
      }
    }
  }, [audioConfig]);

  /**
   * Set up audio level monitoring for visual feedback
   */
  const setupAudioLevelMonitoring = useCallback((stream: MediaStream) => {
    if (!showVisualFeedback) return;

    try {
      logger.debug('📊 AudioRecorder: Setting up audio level monitoring');

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      microphone.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // Start monitoring audio levels
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      audioLevelIntervalRef.current = setInterval(() => {
        if (analyserRef.current && recordingStateRef.current === RecordingState.RECORDING) {
          analyserRef.current.getByteFrequencyData(dataArray);
          
          // Calculate average audio level (0-100)
          const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
          const normalizedLevel = Math.round((average / 255) * 100);
          
          setAudioLevel(normalizedLevel);
        }
      }, 100);

      logger.info('✅ AudioRecorder: Audio level monitoring started');
    } catch (error) {
      logger.warn('⚠️ AudioRecorder: Failed to set up audio level monitoring', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      // Continue without audio level monitoring
    }
  }, [showVisualFeedback, recordingState]);

  /**
   * Start recording audio
   */
  const startRecording = useCallback(async () => {
    if (disabled || recordingState !== RecordingState.IDLE) {
      logger.debug('🚫 AudioRecorder: Start recording blocked', { disabled, recordingState });
      return;
    }

    logger.info('🎤 AudioRecorder: Starting recording process');
    updateRecordingState(RecordingState.REQUESTING_PERMISSION);
    setErrorMessage('');
    setRecordingDuration(0);
    setAudioLevel(0);

    try {
      // Check browser compatibility
      const { supported, mimeType } = checkBrowserCompatibility();
      if (!supported) {
        throw new Error('Audio recording is not supported in this browser. Please use Chrome, Firefox, or Safari.');
      }

      // Request microphone access
      const stream = await requestMicrophoneAccess();
      mediaStreamRef.current = stream;

      // Set up audio level monitoring
      setupAudioLevelMonitoring(stream);

      // Clean up any existing orphaned instances before creating new one
      if (globalMediaRecorderRegistry.size > 0) {
        logger.warn('⚠️ Found orphaned MediaRecorder instances before creating new one', { 
          orphanedCount: globalMediaRecorderRegistry.size,
          instanceId: instanceIdRef.current
        });
        cleanupAllMediaRecorders();
      }

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType || audioConfig.mimeType
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Register MediaRecorder in global registry
      const registryKey = `${instanceIdRef.current}_${Date.now()}`;
      globalMediaRecorderRegistry.set(registryKey, { 
        mediaRecorder, 
        instanceId: instanceIdRef.current 
      });
      
      logger.info('📝 MediaRecorder registered globally', { 
        instanceId: instanceIdRef.current,
        registryKey,
        totalActive: globalMediaRecorderRegistry.size
      });

      // Set up MediaRecorder event handlers
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          chunkCountSinceLastLogRef.current++;
          
          // Throttle logging: log every 2 seconds or every 20 chunks, whichever comes first
          const now = Date.now();
          const timeSinceLastLog = now - lastChunkLogTimeRef.current;
          const shouldLog = timeSinceLastLog >= 2000 || chunkCountSinceLastLogRef.current >= 20;
          
          if (shouldLog) {
            logger.debug('📊 AudioRecorder: Data chunks received', { 
              latestChunkSize: event.data.size,
              totalChunks: audioChunksRef.current.length,
              chunksInPeriod: chunkCountSinceLastLogRef.current,
              periodMs: timeSinceLastLog,
              instanceId: instanceIdRef.current
            });
            
            lastChunkLogTimeRef.current = now;
            chunkCountSinceLastLogRef.current = 0;
          }
        }
      };

      mediaRecorder.onstop = () => {
        logger.info('🛑 AudioRecorder: Recording stopped');
        
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mimeType || audioConfig.mimeType 
        });
        
        // Calculate actual duration from timestamps
        const actualDuration = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
        
        logger.info('✅ AudioRecorder: Recording completed', {
          blobSize: audioBlob.size,
          duration: actualDuration,
          mimeType: audioBlob.type
        });

        // Clean up
        cleanupRecording();
        
        // Notify completion with actual duration
        onRecordingComplete(audioBlob, actualDuration);
        updateRecordingState(RecordingState.IDLE);
      };

      mediaRecorder.onerror = (event) => {
        const error = (event as any).error || new Error('Recording failed');
        logger.error('❌ AudioRecorder: MediaRecorder error', { error: error.message });
        handleRecordingError(error.message);
      };

      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms
      recordingStartTimeRef.current = Date.now();
      updateRecordingState(RecordingState.RECORDING);

      // Clear any existing duration interval before creating new one
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
        logger.debug('🕒 AudioRecorder: Cleared existing duration interval before creating new one');
      }

      // Start duration tracking
      durationIntervalRef.current = setInterval(() => {
        // Check if we're still in recording state to prevent stale intervals
        if (recordingStateRef.current !== RecordingState.RECORDING) {
          logger.warn('⚠️ AudioRecorder: Duration interval running in wrong state, clearing', { 
            currentState: recordingStateRef.current,
            instanceId: instanceIdRef.current 
          });
          if (durationIntervalRef.current) {
            clearInterval(durationIntervalRef.current);
            durationIntervalRef.current = null;
          }
          return;
        }

        const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
        setRecordingDuration(elapsed);

        // Check max duration
        if (elapsed >= audioConfig.maxDurationSeconds) {
          logger.warn('⏰ AudioRecorder: Maximum recording duration reached', {
            elapsed,
            maxDuration: audioConfig.maxDurationSeconds,
            instanceId: instanceIdRef.current
          });
          
          // Clear this interval immediately to prevent multiple warnings
          if (durationIntervalRef.current) {
            clearInterval(durationIntervalRef.current);
            durationIntervalRef.current = null;
            logger.debug('🕒 AudioRecorder: Duration interval cleared after max duration reached');
          }
          
          stopRecording();
        }
      }, 1000);

      logger.info('✅ AudioRecorder: Recording started successfully');

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('❌ AudioRecorder: Failed to start recording', { error: errorMsg });
      handleRecordingError(errorMsg);
    }
  }, [disabled, recordingState, updateRecordingState, checkBrowserCompatibility, requestMicrophoneAccess, setupAudioLevelMonitoring, audioConfig, onRecordingComplete]);

  /**
   * Stop recording audio
   */
  const stopRecording = useCallback(() => {
    if (recordingState !== RecordingState.RECORDING) {
      logger.debug('🚫 AudioRecorder: Stop recording blocked', { recordingState });
      return;
    }

    logger.info('🛑 AudioRecorder: Stopping recording');
    updateRecordingState(RecordingState.STOPPING);

    // Clear intervals immediately to stop any ongoing timers
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
      logger.debug('🕒 AudioRecorder: Duration tracking interval cleared during stop');
    }

    if (audioLevelIntervalRef.current) {
      clearInterval(audioLevelIntervalRef.current);
      audioLevelIntervalRef.current = null;
      logger.debug('📊 AudioRecorder: Audio level monitoring interval cleared during stop');
    }

    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    } catch (error) {
      logger.error('❌ AudioRecorder: Error stopping MediaRecorder', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      // If MediaRecorder.stop() fails, we still need to clean up
      cleanupRecording();
    }
  }, [recordingState, updateRecordingState]);

  /**
   * Handle recording errors
   */
  const handleRecordingError = useCallback((errorMessage: string) => {
    logger.error('❌ AudioRecorder: Recording error occurred', { errorMessage });
    
    const errorInfo = handleAudioError(new Error(errorMessage), 'recording');
    setErrorMessage(errorInfo.userMessage);
    updateRecordingState(RecordingState.ERROR);
    
    cleanupRecording();
    onRecordingError(errorInfo.userMessage);
  }, [updateRecordingState, onRecordingError]);

  /**
   * Clean up recording resources
   */
  const cleanupRecording = useCallback(() => {
    logger.debug('🧹 AudioRecorder: Cleaning up recording resources', { 
      instanceId: instanceIdRef.current 
    });

    // Clear intervals with extra logging
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
      logger.debug('🕒 AudioRecorder: Duration interval cleared in cleanup');
    }

    if (audioLevelIntervalRef.current) {
      clearInterval(audioLevelIntervalRef.current);
      audioLevelIntervalRef.current = null;
      logger.debug('📊 AudioRecorder: Audio level interval cleared in cleanup');
    }

    // Clean up MediaRecorder and clear event handlers to prevent memory leaks
    if (mediaRecorderRef.current) {
      const mediaRecorder = mediaRecorderRef.current;
      
      // Stop recording if still active
      if (mediaRecorder.state === 'recording' || mediaRecorder.state === 'paused') {
        try {
          mediaRecorder.stop();
          logger.debug('🛑 AudioRecorder: Forced MediaRecorder stop during cleanup', { 
            instanceId: instanceIdRef.current 
          });
        } catch (error) {
          logger.warn('⚠️ AudioRecorder: Error stopping MediaRecorder during cleanup', { 
            instanceId: instanceIdRef.current,
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      }
      
      // Clear all event handlers to prevent orphaned callbacks
      mediaRecorder.ondataavailable = null;
      mediaRecorder.onstop = null;
      mediaRecorder.onstart = null;
      mediaRecorder.onerror = null;
      mediaRecorder.onpause = null;
      mediaRecorder.onresume = null;
      
      // Remove from global registry
      for (const [key, { mediaRecorder: registeredRecorder, instanceId }] of globalMediaRecorderRegistry.entries()) {
        if (registeredRecorder === mediaRecorder || instanceId === instanceIdRef.current) {
          globalMediaRecorderRegistry.delete(key);
          logger.debug('🗑️ MediaRecorder unregistered from global registry', { 
            instanceId: instanceIdRef.current,
            registryKey: key,
            remainingActive: globalMediaRecorderRegistry.size
          });
          break;
        }
      }
      
      logger.debug('🧹 AudioRecorder: MediaRecorder event handlers cleared', { 
        instanceId: instanceIdRef.current 
      });
      mediaRecorderRef.current = null;
    }

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        track.stop();
        logger.debug('🛑 AudioRecorder: Stopped media track', { kind: track.kind });
      });
      mediaStreamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(error => {
        logger.warn('⚠️ AudioRecorder: Failed to close audio context', { error });
      });
      audioContextRef.current = null;
    }

    // Clear refs and reset counters
    analyserRef.current = null;
    audioChunksRef.current = [];
    lastChunkLogTimeRef.current = 0;
    chunkCountSinceLastLogRef.current = 0;
    
    setAudioLevel(0);
    
    logger.debug('✅ AudioRecorder: Cleanup completed successfully', { 
      instanceId: instanceIdRef.current 
    });
  }, []);

  /**
   * Format recording duration for display
   */
  const formatDuration = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  /**
   * Initialize component and clean up any orphaned instances
   */
  useEffect(() => {
    logger.info('🎤 AudioRecorder: Component mounted', { 
      instanceId: instanceIdRef.current,
      autoStart,
      disabled 
    });
    
    // Initialize ref with current state
    recordingStateRef.current = recordingState;
    
    // Clean up any orphaned MediaRecorder instances from previous component unmounts
    if (globalMediaRecorderRegistry.size > 0) {
      logger.warn('⚠️ Found orphaned MediaRecorder instances, cleaning up', { 
        orphanedCount: globalMediaRecorderRegistry.size,
        instanceId: instanceIdRef.current
      });
      cleanupAllMediaRecorders();
    }
  }, []); // Only run on mount

  /**
   * Keep ref synced with state
   */
  useEffect(() => {
    recordingStateRef.current = recordingState;
  }, [recordingState]);

  /**
   * Auto-start recording if requested
   */
  useEffect(() => {
    if (autoStart && recordingState === RecordingState.IDLE && !disabled) {
      logger.info('🚀 AudioRecorder: Auto-starting recording', { 
        instanceId: instanceIdRef.current 
      });
      startRecording();
    }
  }, [autoStart, recordingState, disabled, startRecording]);

  /**
   * Listen for external stop signal
   */
  useEffect(() => {
    logger.debug('🔄 AudioRecorder: stopSignal or recordingState changed', {
      stopSignal,
      recordingState,
      instanceId: instanceIdRef.current
    });
    
    // If stopSignal changes and we're recording, stop
    if (stopSignal > 0 && recordingState === RecordingState.RECORDING) {
      logger.info('🛑 AudioRecorder: External stop signal received, stopping recording', {
        instanceId: instanceIdRef.current,
        stopSignal,
        recordingState
      });
      stopRecording();
    } else if (stopSignal > 0) {
      logger.warn('⚠️ AudioRecorder: Stop signal received but not recording', {
        stopSignal,
        recordingState,
        instanceId: instanceIdRef.current
      });
    }
  }, [stopSignal, recordingState, stopRecording]);

  /**
   * Cleanup on component unmount
   */
  useEffect(() => {
    return () => {
      logger.debug('🧹 AudioRecorder: Component unmounting, cleaning up', { 
        instanceId: instanceIdRef.current 
      });
      cleanupRecording();
    };
  }, [cleanupRecording]);

  /**
   * Get CSS classes for recording state
   */
  const getRecordingStateClasses = useCallback(() => {
    const baseClasses = 'audio-recorder';
    const stateClasses = {
      [RecordingState.IDLE]: 'idle',
      [RecordingState.REQUESTING_PERMISSION]: 'requesting-permission',
      [RecordingState.RECORDING]: 'recording',
      [RecordingState.STOPPING]: 'stopping',
      [RecordingState.ERROR]: 'error'
    };

    return `${baseClasses} ${stateClasses[recordingState]} ${className}`.trim();
  }, [recordingState, className]);

  return (
    <div className={getRecordingStateClasses()}>
      {/* Recording button */}
      <button
        type="button"
        onClick={recordingState === RecordingState.RECORDING ? stopRecording : startRecording}
        disabled={disabled || recordingState === RecordingState.REQUESTING_PERMISSION || recordingState === RecordingState.STOPPING}
        className="audio-recorder-button"
        aria-label={recordingState === RecordingState.RECORDING ? 'Stop recording' : 'Start recording'}
        title={recordingState === RecordingState.RECORDING ? 'Stop recording' : 'Start voice recording'}
      >
        {recordingState === RecordingState.RECORDING ? (
          <div className="recording-indicator">
            🛑
          </div>
        ) : recordingState === RecordingState.REQUESTING_PERMISSION ? (
          <div className="permission-indicator">
            ⏳
          </div>
        ) : (
          <div className="microphone-icon">
            🎤
          </div>
        )}
      </button>

      {/* Recording status and feedback */}
      {recordingState !== RecordingState.IDLE && (
        <div className="recording-status">
          {recordingState === RecordingState.REQUESTING_PERMISSION && (
            <div className="status-message">Requesting microphone access...</div>
          )}
          
          {recordingState === RecordingState.RECORDING && (
            <>
              <div className="recording-duration">
                {formatDuration(recordingDuration)}
              </div>
              
              {showVisualFeedback && (
                <div className="audio-level-indicator">
                  <div 
                    className="audio-level-bar"
                    style={{ 
                      width: `${audioLevel}%`,
                      backgroundColor: audioLevel > 70 ? '#ef4444' : audioLevel > 40 ? '#f59e0b' : '#10b981'
                    }}
                  />
                </div>
              )}
            </>
          )}
          
          {recordingState === RecordingState.STOPPING && (
            <div className="status-message">Processing recording...</div>
          )}
          
          {recordingState === RecordingState.ERROR && errorMessage && (
            <div className="error-message" role="alert">
              {errorMessage}
            </div>
          )}
        </div>
      )}

      {/* Recording limits info */}
      {recordingState === RecordingState.RECORDING && (
        <div className="recording-info">
          Max duration: {Math.floor(audioConfig.maxDurationSeconds / 60)} minutes
        </div>
      )}
    </div>
  );
}; 