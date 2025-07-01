import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { initializeApplication, setupGracefulShutdown, enableDevelopmentMode } from './utils/startup';
import { logger } from './utils/logger';

import './index.css';

import './demos/ipc';
// If you want use Node.js, the`nodeIntegration` needs to be enabled in the Main process.
// import './demos/node'

/**
 * Application startup with environment validation
 */
async function startApplication(): Promise<void> {
  try {
    logger.info('🎯 FlowGenius application starting...');
    
    // Enable development mode if applicable
    enableDevelopmentMode();
    
    // Setup graceful shutdown handlers
    setupGracefulShutdown();
    
    // Initialize application with environment validation
    const startupResult = await initializeApplication();
    
    if (!startupResult.success || !startupResult.canContinue) {
      logger.error('❌ Application startup failed, cannot continue');
      
      // Render error state instead of main app
      ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
        <React.StrictMode>
          <div style={{ 
            padding: '2rem', 
            fontFamily: 'system-ui, sans-serif',
            backgroundColor: '#1a1a1a',
            color: '#ffffff',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <h1 style={{ color: '#ef4444', marginBottom: '1rem' }}>
              ❌ FlowGenius Startup Failed
            </h1>
            <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
              <p>The application could not start due to configuration issues:</p>
              <ul style={{ textAlign: 'left', marginTop: '1rem' }}>
                {startupResult.errors.map((error, index) => (
                  <li key={index} style={{ margin: '0.5rem 0' }}>• {error}</li>
                ))}
              </ul>
            </div>
            <div style={{ 
              backgroundColor: '#374151', 
              padding: '1rem', 
              borderRadius: '0.5rem',
              textAlign: 'left',
              fontSize: '0.875rem'
            }}>
              <p><strong>Next Steps:</strong></p>
              <ol style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                <li>Create a .env file in your project root</li>
                <li>Copy the contents of .env.example</li>
                <li>Fill in your actual API keys and URLs</li>
                <li>Restart the application</li>
              </ol>
            </div>
          </div>
        </React.StrictMode>
      );
      return;
    }
    
    logger.info('✅ Application startup successful, rendering main app');
    
    // Render the main application
    ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
    
  } catch (error) {
    logger.error('💥 Critical error during application startup', { error: error as Error });
    
    // Render critical error state
    ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
      <React.StrictMode>
        <div style={{ 
          padding: '2rem', 
          fontFamily: 'system-ui, sans-serif',
          backgroundColor: '#1a1a1a',
          color: '#ffffff',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <h1 style={{ color: '#ef4444', marginBottom: '1rem' }}>
            💥 Critical Error
          </h1>
          <p>A critical error occurred during application startup.</p>
          <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#9ca3af' }}>
            Check the console for detailed error information.
          </p>
        </div>
      </React.StrictMode>
    );
  } finally {
    // Remove loading indicator regardless of startup result
    postMessage({ payload: 'removeLoading' }, '*');
  }
}

// Start the application
startApplication();
