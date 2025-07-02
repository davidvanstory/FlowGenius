/**
 * PermissionDialog Component
 * 
 * A modal dialog component for handling microphone permission requests with user-friendly prompts.
 * Provides clear instructions and recovery options when microphone access is denied or unavailable.
 * 
 * Features:
 * - User-friendly permission request dialog
 * - Browser-specific instructions
 * - Troubleshooting steps for common issues
 * - Accessibility features
 * - Recovery actions and retry functionality
 */

import React, { useCallback, useEffect, useState } from 'react';
import { logger } from '../utils/logger';

/**
 * Permission state enumeration
 */
export enum PermissionState {
  UNKNOWN = 'unknown',
  GRANTED = 'granted',
  DENIED = 'denied',
  PROMPT = 'prompt'
}

/**
 * Browser detection for specific instructions
 */
interface BrowserInfo {
  name: string;
  version: string;
  isChrome: boolean;
  isFirefox: boolean;
  isSafari: boolean;
  isEdge: boolean;
}

/**
 * Props interface for PermissionDialog component
 */
interface PermissionDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when permission is granted */
  onPermissionGranted: () => void;
  /** Callback when permission is denied */
  onPermissionDenied: (reason: string) => void;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Whether to show troubleshooting steps */
  showTroubleshooting?: boolean;
  /** Custom error message to display */
  errorMessage?: string;
}

/**
 * PermissionDialog component for microphone access requests
 */
export const PermissionDialog: React.FC<PermissionDialogProps> = ({
  isOpen,
  onPermissionGranted,
  onPermissionDenied,
  onClose,
  showTroubleshooting = false,
  errorMessage
}) => {
  const [permissionState, setPermissionState] = useState<PermissionState>(PermissionState.UNKNOWN);
  const [isChecking, setIsChecking] = useState(false);
  const [browserInfo, setBrowserInfo] = useState<BrowserInfo | null>(null);
  const [deviceCount, setDeviceCount] = useState<number>(0);

  /**
   * Detect browser information for specific instructions
   */
  const detectBrowser = useCallback((): BrowserInfo => {
    const userAgent = navigator.userAgent;
    
    let name = 'Unknown';
    let version = '';
    let isChrome = false;
    let isFirefox = false;
    let isSafari = false;
    let isEdge = false;

    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
      name = 'Chrome';
      isChrome = true;
      const match = userAgent.match(/Chrome\/(\d+)/);
      version = match?.[1] ?? '';
    } else if (userAgent.includes('Firefox')) {
      name = 'Firefox';
      isFirefox = true;
      const match = userAgent.match(/Firefox\/(\d+)/);
      version = match?.[1] ?? '';
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      name = 'Safari';
      isSafari = true;
      const match = userAgent.match(/Version\/(\d+)/);
      version = match?.[1] ?? '';
    } else if (userAgent.includes('Edg')) {
      name = 'Edge';
      isEdge = true;
      const match = userAgent.match(/Edg\/(\d+)/);
      version = match?.[1] ?? '';
    }

    logger.debug('🌐 Browser detected', { name, version, userAgent: userAgent.substring(0, 100) });
    
    return { name, version, isChrome, isFirefox, isSafari, isEdge };
  }, []);

  /**
   * Check current microphone permission status
   */
  const checkPermissionStatus = useCallback(async () => {
    try {
      logger.info('🔍 PermissionDialog: Checking microphone permission status');
      
      if (!navigator.permissions) {
        logger.warn('⚠️ Permissions API not supported');
        setPermissionState(PermissionState.UNKNOWN);
        return;
      }

      const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      const state = permission.state as PermissionState;
      
      logger.info('✅ Permission status checked', { state });
      setPermissionState(state);

      // Listen for permission changes
      permission.onchange = () => {
        const newState = permission.state as PermissionState;
        logger.info('🔄 Permission state changed', { from: state, to: newState });
        setPermissionState(newState);
        
        if (newState === PermissionState.GRANTED) {
          onPermissionGranted();
        }
      };

    } catch (error) {
      logger.error('❌ Failed to check permission status', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      setPermissionState(PermissionState.UNKNOWN);
    }
  }, [onPermissionGranted]);

  /**
   * Enumerate available audio devices
   */
  const checkAudioDevices = useCallback(async () => {
    try {
      logger.debug('🎤 Checking available audio devices');
      
      if (!navigator.mediaDevices?.enumerateDevices) {
        logger.warn('⚠️ enumerateDevices not supported');
        return;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      
      logger.info('📊 Audio devices found', { 
        total: devices.length, 
        audioInputs: audioInputs.length,
        devices: audioInputs.map(d => ({ deviceId: d.deviceId, label: d.label }))
      });
      
      setDeviceCount(audioInputs.length);
    } catch (error) {
      logger.error('❌ Failed to enumerate devices', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }, []);

  /**
   * Request microphone permission
   */
  const requestPermission = useCallback(async () => {
    if (isChecking) return;

    setIsChecking(true);
    logger.info('🎤 PermissionDialog: Requesting microphone permission');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      logger.info('✅ Microphone permission granted');
      
      // Stop the stream immediately since we only needed permission
      stream.getTracks().forEach(track => {
        track.stop();
        logger.debug('🛑 Stopped permission test track', { kind: track.kind });
      });
      
      setPermissionState(PermissionState.GRANTED);
      onPermissionGranted();
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('❌ Microphone permission denied', { error: errorMsg });
      
      setPermissionState(PermissionState.DENIED);
      onPermissionDenied(errorMsg);
    } finally {
      setIsChecking(false);
    }
  }, [isChecking, onPermissionGranted, onPermissionDenied]);

  /**
   * Get browser-specific instructions
   */
  const getBrowserInstructions = useCallback(() => {
    if (!browserInfo) return null;

    const { isChrome, isFirefox, isSafari, isEdge, name } = browserInfo;

    if (isChrome || isEdge) {
      return (
        <div className="browser-instructions">
          <h4>For {name}:</h4>
          <ol>
            <li>Look for the microphone icon in the address bar</li>
            <li>Click on it and select "Allow"</li>
            <li>If blocked, click the lock icon → Site settings → Microphone → Allow</li>
            <li>Refresh the page after changing settings</li>
          </ol>
        </div>
      );
    }

    if (isFirefox) {
      return (
        <div className="browser-instructions">
          <h4>For Firefox:</h4>
          <ol>
            <li>Look for the microphone icon in the address bar</li>
            <li>Click "Allow" when prompted</li>
            <li>If blocked, click the shield icon → Permissions → Microphone → Allow</li>
            <li>Refresh the page after changing settings</li>
          </ol>
        </div>
      );
    }

    if (isSafari) {
      return (
        <div className="browser-instructions">
          <h4>For Safari:</h4>
          <ol>
            <li>Go to Safari → Preferences → Websites</li>
            <li>Click "Microphone" in the left sidebar</li>
            <li>Set this website to "Allow"</li>
            <li>Refresh the page</li>
          </ol>
        </div>
      );
    }

    return (
      <div className="browser-instructions">
        <h4>General Instructions:</h4>
        <ol>
          <li>Look for a microphone icon in your browser's address bar</li>
          <li>Click "Allow" when prompted for microphone access</li>
          <li>Check your browser's site settings if access is blocked</li>
          <li>Refresh the page after changing permissions</li>
        </ol>
      </div>
    );
  }, [browserInfo]);

  /**
   * Initialize component
   */
  useEffect(() => {
    if (isOpen) {
      logger.info('🎤 PermissionDialog: Dialog opened, initializing');
      
      const browser = detectBrowser();
      setBrowserInfo(browser);
      
      checkPermissionStatus();
      checkAudioDevices();
    }
  }, [isOpen, detectBrowser, checkPermissionStatus, checkAudioDevices]);

  /**
   * Handle keyboard shortcuts
   */
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        logger.debug('⌨️ Dialog closed with Escape key');
        onClose();
      } else if (event.key === 'Enter' && !isChecking) {
        logger.debug('⌨️ Permission requested with Enter key');
        requestPermission();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isChecking, onClose, requestPermission]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="permission-dialog-overlay" onClick={onClose}>
      <div 
        className="permission-dialog" 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="permission-dialog-title"
        aria-describedby="permission-dialog-description"
      >
        {/* Header */}
        <div className="dialog-header">
          <h2 id="permission-dialog-title" className="dialog-title">
            🎤 Microphone Access Required
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="dialog-close-button"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="dialog-content">
          <div id="permission-dialog-description" className="dialog-description">
            <p>
              FlowGenius needs access to your microphone to record voice messages. 
              Your audio is processed securely and never stored permanently.
            </p>
          </div>

          {/* Error message */}
          {errorMessage && (
            <div className="error-message" role="alert">
              <span className="error-icon">⚠️</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Permission status */}
          <div className="permission-status">
            <div className="status-indicator">
              <span className="status-label">Current Status:</span>
              <span className={`status-value ${permissionState}`}>
                {permissionState === PermissionState.GRANTED && '✅ Granted'}
                {permissionState === PermissionState.DENIED && '❌ Denied'}
                {permissionState === PermissionState.PROMPT && '❓ Needs Permission'}
                {permissionState === PermissionState.UNKNOWN && '❓ Unknown'}
              </span>
            </div>
            
            {deviceCount > 0 && (
              <div className="device-info">
                <span className="device-label">Audio Devices:</span>
                <span className="device-count">{deviceCount} found</span>
              </div>
            )}
          </div>

          {/* Browser instructions */}
          {showTroubleshooting && getBrowserInstructions()}

          {/* Troubleshooting */}
          {showTroubleshooting && (
            <div className="troubleshooting">
              <h4>Troubleshooting:</h4>
              <ul>
                <li>Make sure your microphone is connected and working</li>
                <li>Check that no other applications are using your microphone</li>
                <li>Try refreshing the page and allowing permission again</li>
                <li>Check your browser's site settings for microphone permissions</li>
                <li>Ensure your browser is up to date</li>
                {deviceCount === 0 && (
                  <li><strong>No microphone detected - please connect a microphone</strong></li>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="dialog-actions">
          <button
            type="button"
            onClick={onClose}
            className="dialog-button secondary"
            disabled={isChecking}
          >
            Cancel
          </button>
          
          {permissionState === PermissionState.GRANTED ? (
            <button
              type="button"
              onClick={() => {
                logger.info('✅ Permission already granted, proceeding to recording');
                onPermissionGranted();
              }}
              className="dialog-button primary"
            >
              Continue to Recording ✅
            </button>
          ) : (
            <button
              type="button"
              onClick={requestPermission}
              className="dialog-button primary"
              disabled={isChecking}
            >
              {isChecking ? (
                <>
                  <span className="loading-spinner"></span>
                  Requesting...
                </>
              ) : (
                'Allow Microphone Access'
              )}
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="dialog-footer">
          <p className="privacy-note">
            🔒 Your privacy is protected. Audio is only processed when you're actively recording.
          </p>
        </div>
      </div>
    </div>
  );
}; 