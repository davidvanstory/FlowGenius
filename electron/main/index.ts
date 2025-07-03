import { config } from 'dotenv'
import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { update } from './update'
import { initializeLangGraphHandlers, cleanupLangGraphHandlers } from './langgraph-handler'
import { initializeAudioSystem, cleanupAudioHandlers } from './audio-ipc-handlers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load environment variables from .env file
config({ path: path.join(__dirname, '../../.env') });

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

async function createWindow() {
  win = new BrowserWindow({
    title: 'Main window',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // nodeIntegration: true,

      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      // contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) { // #298
    win.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Auto update
  update(win)
}

app.whenReady().then(async () => {
  // Initialize environment variables IPC handler
  initializeEnvironmentHandlers()
  
  // Initialize LangGraph IPC handlers
  initializeLangGraphHandlers()
  
  // Initialize Audio system
  try {
    await initializeAudioSystem()
    console.log('✅ Audio system initialized')
  } catch (error) {
    console.error('❌ Failed to initialize audio system:', error)
  }
  
  // Create main window
  createWindow()
})

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') {
    // Cleanup LangGraph handlers before quitting
    cleanupLangGraphHandlers()
    // Cleanup Audio handlers before quitting
    cleanupAudioHandlers()
    app.quit()
  }
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length > 0) {
    allWindows[0]?.focus()
  } else {
    createWindow()
  }
})

/**
 * Initialize environment variables IPC handlers
 * Provides secure access to environment variables from renderer process
 */
function initializeEnvironmentHandlers(): void {
  console.log('🔐 Initializing environment variable IPC handlers');

  /**
   * Get environment variables needed by renderer process
   * Only exposes necessary environment variables for security
   */
  ipcMain.handle('env:get-vars', async () => {
    try {
      console.log('📨 IPC: Getting environment variables');

      // Only expose the environment variables that are actually needed
      // This is a security best practice - never expose all process.env
      const envVars = {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        NODE_ENV: process.env.NODE_ENV,
        // Add other necessary env vars here as needed
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
        TAVILY_API_KEY: process.env.TAVILY_API_KEY
      };

      console.log('✅ IPC: Environment variables retrieved', {
        hasOpenAIKey: !!envVars.OPENAI_API_KEY,
        nodeEnv: envVars.NODE_ENV,
        hasSupabaseUrl: !!envVars.SUPABASE_URL,
        hasSupabaseKey: !!envVars.SUPABASE_ANON_KEY,
        hasTavilyKey: !!envVars.TAVILY_API_KEY
      });

      return {
        success: true,
        data: envVars
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error('❌ IPC: Failed to get environment variables', {
        error: errorMessage
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  });

  console.log('✅ Environment variable IPC handlers initialized');
}

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})
