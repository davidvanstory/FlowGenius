/**
 * useAudioRecording Hook
 * 
 * Custom React hook for managing audio recording functionality.
 * Integrates the AudioRecorder component with permission handling
 * and provides a clean interface for voice input in the application.
 * 
 * Features:
 * - Audio recording state management
 * - Permission dialog integration
 * - Recording lifecycle management
 * - Error handling and recovery
 * - Audio blob handling for further processing
 */

import { useState, useCallback } from 'react';
import { logger } from '../utils/logger';
import { RecordingState } from '../components/AudioRecorder';
import { PermissionState } from '../components/PermissionDialog';

/**
 * Audio recording hook state interface
 */
interface AudioRecordingState {
  /** Current recording state */
  recordingState: RecordingState;
  /** Whether permission dialog is open */
  isPermissionDialogOpen: boolean;
  /** Whether permission has been granted */
  hasPermission: boolean;
  /** Current error message if any */
  errorMessage: string | null;
  /** Whether to show troubleshooting in permission dialog */
  showTroubleshooting: boolean;
  /** The last recorded audio blob */
  lastRecording: Blob | null;
  /** Duration of the last recording in seconds */
  lastRecordingDuration: number;
  /** Stop signal for external components */
  stopSignal: number;
}

/**
 * Audio recording hook return interface
 */
interface UseAudioRecordingReturn extends AudioRecordingState {
  /** Start or request to start recording */
  startRecording: () => void;
  /** Stop current recording */
  stopRecording: () => void;
  /** Handle recording completion */
  handleRecordingComplete: (audioBlob: Blob, duration: number) => void;
  /** Handle recording error */
  handleRecordingError: (error: string) => void;
  /** Handle recording state change */
  handleRecordingStateChange: (state: RecordingState) => void;
  /** Handle permission granted */
  handlePermissionGranted: () => void;
  /** Handle permission denied */
  handlePermissionDenied: (reason: string) => void;
  /** Close permission dialog */
  closePermissionDialog: () => void;
  /** Clear the last recording */
  clearRecording: () => void;
  /** Reset all state */
  resetRecording: () => void;
}

/**
 * Audio recording hook options interface
 */
interface UseAudioRecordingOptions {
  /** Whether to enable automatic playback after recording (default: true) */
  playbackEnabled?: boolean;
}

/**
 * Custom hook for audio recording functionality
 * 
 * @param onRecordingComplete - Callback when recording is successfully completed
 * @param options - Optional configuration for the audio recording behavior
 * @returns Audio recording state and control functions
 */
export function useAudioRecording(
  onRecordingComplete?: (audioBlob: Blob, duration: number) => void,
  options: UseAudioRecordingOptions = {}
): UseAudioRecordingReturn {
  // Extract options with defaults
  const { playbackEnabled = true } = options;
  
  // State management
  const [state, setState] = useState<AudioRecordingState>({
    recordingState: RecordingState.IDLE,
    isPermissionDialogOpen: false,
    hasPermission: false,
    errorMessage: null,
    showTroubleshooting: false,
    lastRecording: null,
    lastRecordingDuration: 0,
    stopSignal: 0
  });

  /**
   * Check if microphone permission has been granted
   */
  const checkPermission = useCallback(async (): Promise<boolean> => {
    try {
      logger.debug('🔍 Checking microphone permission status');
      
      // Try to access microphone directly first - this is more reliable
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
        });
        
        // If we get here, permission is granted
        stream.getTracks().forEach(track => track.stop()); // Clean up immediately
        
        logger.info('✅ Microphone permission confirmed - direct access successful');
        setState(prev => ({ ...prev, hasPermission: true }));
        return true;
        
      } catch (directAccessError) {
        // Direct access failed, check permission state
        if (navigator.permissions && 'microphone' in navigator.permissions) {
          const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          const isGranted = permission.state === 'granted';
          
          logger.info('📊 Permission state check result', { state: permission.state, isGranted });
          setState(prev => ({ ...prev, hasPermission: isGranted }));
          return isGranted;
        }
        
        // No permission API, assume permission needed
        logger.warn('⚠️ Direct access failed and no Permissions API, will request permission');
        setState(prev => ({ ...prev, hasPermission: false }));
        return false;
      }
      
    } catch (error) {
      logger.error('❌ Error checking permission', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      setState(prev => ({ ...prev, hasPermission: false }));
      return false;
    }
  }, []);

  /**
   * Start recording or show permission dialog
   */
  const startRecording = useCallback(async () => {
    logger.info('🎤 Start recording requested');
    
    // Clear any previous errors and reset stop signal
    setState(prev => ({ 
      ...prev, 
      errorMessage: null, 
      stopSignal: 0 // Reset stop signal for new recording
    }));
    
    // Check if we have permission
    const hasPermission = await checkPermission();
    
    if (!hasPermission) {
      logger.info('🔐 Permission required, showing dialog');
      setState(prev => ({ 
        ...prev, 
        isPermissionDialogOpen: true,
        showTroubleshooting: false,
        stopSignal: 0 // Ensure stop signal is reset
      }));
    } else {
      logger.info('✅ Permission already granted, starting recording immediately');
      setState(prev => ({ 
        ...prev, 
        hasPermission: true,
        recordingState: RecordingState.RECORDING, // Skip intermediate state, go directly to recording
        stopSignal: 0 // Ensure stop signal is reset for immediate recording
      }));
    }
  }, [checkPermission]);

  /**
   * Handle recording completion
   */
  const handleRecordingComplete = useCallback((audioBlob: Blob, duration: number) => {
    logger.info('✅ Recording completed', { 
      blobSize: audioBlob.size, 
      duration,
      mimeType: audioBlob.type 
    });
    
    // Only play back the audio if playback is enabled
    if (playbackEnabled) {
      // Create a URL for the audio blob to enable playback
      const audioUrl = URL.createObjectURL(audioBlob);
      logger.info('🔊 Audio playback URL created', { url: audioUrl });
      
      // Create an audio element to play the recording
      const audio = new Audio(audioUrl);
      audio.volume = 0.7;
      
      // Log when audio plays
      audio.onplay = () => logger.info('▶️ Playing back recorded audio');
      audio.onended = () => {
        logger.info('⏹️ Audio playback finished');
        URL.revokeObjectURL(audioUrl); // Clean up the URL
      };
      
      // Play the audio automatically for testing
      audio.play().catch(err => {
        logger.error('❌ Failed to play audio', { error: err.message });
      });
    } else {
      logger.info('🔇 Audio playback disabled - skipping playback');
    }
    
    setState(prev => ({
      ...prev,
      recordingState: RecordingState.IDLE,
      lastRecording: audioBlob,
      lastRecordingDuration: duration,
      errorMessage: null,
      stopSignal: 0 // Reset stop signal after recording completion to prepare for next recording
    }));
    
    // Call the provided callback
    onRecordingComplete?.(audioBlob, duration);
  }, [onRecordingComplete, playbackEnabled]);

  /**
   * Handle recording error
   */
  const handleRecordingError = useCallback((error: string) => {
    logger.error('❌ Recording error', { error });
    
    setState(prev => ({
      ...prev,
      recordingState: RecordingState.ERROR,
      errorMessage: error,
      showTroubleshooting: true
    }));
    
    // Check if it's a permission error and show dialog
    if (error.toLowerCase().includes('permission') || 
        error.toLowerCase().includes('denied') ||
        error.toLowerCase().includes('microphone')) {
      setState(prev => ({
        ...prev,
        isPermissionDialogOpen: true,
        showTroubleshooting: true,
        hasPermission: false
      }));
    }
  }, []);

  /**
   * Handle recording state change
   */
  const handleRecordingStateChange = useCallback((newState: RecordingState) => {
    setState(prev => {
      logger.debug('🔄 Recording state changed', { 
        from: prev.recordingState, 
        to: newState 
      });
      
      return { ...prev, recordingState: newState };
    });
  }, []); // No dependencies to ensure callback stability

  /**
   * Handle permission granted
   */
  const handlePermissionGranted = useCallback(() => {
    logger.info('✅ Microphone permission granted, starting recording immediately');
    
    setState(prev => ({
      ...prev,
      hasPermission: true,
      isPermissionDialogOpen: false,
      errorMessage: null,
      showTroubleshooting: false,
      recordingState: RecordingState.RECORDING, // Start recording immediately after permission granted
      stopSignal: 0 // Reset stop signal when starting new recording after permission grant
    }));
  }, []);

  /**
   * Handle permission denied
   */
  const handlePermissionDenied = useCallback((reason: string) => {
    logger.error('❌ Microphone permission denied', { reason });
    
    setState(prev => ({
      ...prev,
      hasPermission: false,
      errorMessage: `Microphone access denied: ${reason}`,
      showTroubleshooting: true
    }));
  }, []);

  /**
   * Close permission dialog
   */
  const closePermissionDialog = useCallback(() => {
    logger.debug('🚪 Closing permission dialog');
    
    setState(prev => ({
      ...prev,
      isPermissionDialogOpen: false
    }));
  }, []);

  /**
   * Clear the last recording
   */
  const clearRecording = useCallback(() => {
    logger.debug('🗑️ Clearing last recording');
    
    setState(prev => ({
      ...prev,
      lastRecording: null,
      lastRecordingDuration: 0
    }));
  }, []);

  /**
   * Reset all recording state
   */
  const resetRecording = useCallback(() => {
    logger.info('🔄 Resetting all recording state');
    
    setState({
      recordingState: RecordingState.IDLE,
      isPermissionDialogOpen: false,
      hasPermission: false,
      errorMessage: null,
      showTroubleshooting: false,
      lastRecording: null,
      lastRecordingDuration: 0,
      stopSignal: 0
    });
  }, []);

  /**
   * Stop current recording
   */
  const stopRecording = useCallback(() => {
    setState(prev => {
      logger.info('🛑 Stop recording requested from hook', {
        currentState: prev.recordingState,
        currentStopSignal: prev.stopSignal
      });
      
      if (prev.recordingState === RecordingState.RECORDING) {
        logger.info('✅ State is RECORDING, incrementing stopSignal', {
          from: prev.stopSignal,
          to: prev.stopSignal + 1
        });
        return {
          ...prev,
          stopSignal: prev.stopSignal + 1
        };
      } else {
        logger.warn('⚠️ Cannot stop recording - not in RECORDING state', {
          currentState: prev.recordingState
        });
        return prev;
      }
    });
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    handleRecordingComplete,
    handleRecordingError,
    handleRecordingStateChange,
    handlePermissionGranted,
    handlePermissionDenied,
    closePermissionDialog,
    clearRecording,
    resetRecording
  };
} 