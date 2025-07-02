create subdirectories for folder org
create new directory

electron/main/
├── langgraph/
│   ├── launcher/
│   │   ├── index.ts           // Defines the launcher workflow graph
│   │   ├── state.ts           // Defines LauncherAppState
│   │   └── nodes/
│   │       ├── intentParserNode.ts
│   │       ├── appStatusCheckNode.ts
│   │       └── commandExecutorNode.ts
│   │
│   ├── summary/               // The old, inactive workflow (safe for reference)
│   │   ├── index.ts           // Defines the summary workflow graph
│   │   ├── state.ts           // Defines the original AppState
│   │   └── nodes/
│   │       ├── processUserTurn.ts
│   │       └── generateSummary.ts
│   │
│   └── README.md
│
├── langgraph-handler.ts       // The single, modified IPC handler
├── os-executor.ts             // The new OS interaction module
└── ...




Action Plan: File Modifications and Code Snippets
Here is the breakdown of files to create and modify.
Phase 1: Create New Core Logic Files (Backend)
These are all new files. You will not be editing any existing files in this phase.
1. electron/main/os-executor.ts (New File)
Action: Create this file.
Purpose: The secure, sandboxed module for all operating system interactions.
Code:
Generated typescript
import { exec } from 'child_process';
import { logger } from '../../src/utils/logger';

// SECURITY: This is your allow-list. Add all apps you want to support here.
const APP_COMMAND_MAP: { [key: string]: { name: string; open: string; focus: string } } = {
  // macOS Examples
  'visual studio code': { name: 'Code', open: 'open "/Applications/Visual Studio Code.app"', focus: 'open -a "Visual Studio Code"' },
  'chrome': { name: 'Google Chrome', open: 'open "/Applications/Google Chrome.app"', focus: 'open -a "Google Chrome"' },
  'terminal': { name: 'Terminal', open: 'open -a Terminal', focus: 'open -a Terminal' },
  // Windows Examples
  'notepad': { name: 'notepad.exe', open: 'start notepad.exe', focus: 'start notepad.exe' },
  'calculator': { name: 'calc.exe', open: 'start calc.exe', focus: 'start calc.exe' },
};

function execute(command: string): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        logger.error(`Execution Error: ${error.message}`, { command });
        resolve({ success: false, output: stderr || error.message });
      } else {
        resolve({ success: true, output: stdout });
      }
    });
  });
}

export async function isAppRunning(appName: string): Promise<boolean> {
  const appConfig = APP_COMMAND_MAP[appName.toLowerCase()];
  if (!appConfig) return false;
  const processName = appConfig.name;
  const command = process.platform === 'darwin' ? `ps -ax | grep -i "${processName}" | grep -v grep` : `tasklist | findstr /i "${processName}"`;
  const { success, output } = await execute(command);
  return success && output.trim().length > 0;
}

export async function launchApp(appName: string): Promise<{ success: boolean; message: string }> {
  const appConfig = APP_COMMAND_MAP[appName.toLowerCase()];
  if (!appConfig) return { success: false, message: `Application '${appName}' is not configured.` };
  const { success } = await execute(appConfig.open);
  return { success, message: success ? `Launched ${appName}` : `Failed to launch ${appName}` };
}

export async function focusApp(appName: string): Promise<{ success: boolean; message: string }> {
  const appConfig = APP_COMMAND_MAP[appName.toLowerCase()];
  if (!appConfig) return { success: false, message: `Application '${appName}' is not configured.` };
  const { success } = await execute(appConfig.focus);
  return { success, message: success ? `Focused ${appName}` : `Failed to focus ${appName}` };
}
Use code with caution.
TypeScript
2. electron/main/langgraph/launcher-state.ts (New File)
Action: Create this file for the new state definition.
Purpose: To define the data structure for the launcher workflow.
Code:
Generated typescript
import { Annotation } from '@langchain/langgraph';

export interface LauncherAppState {
  transcribed_text: string;
  identified_app_name: string | null;
  is_app_running: boolean | null;
  execution_result: string | null;
  error: string | null;
}

// You'll need an annotation for LangGraph's StateGraph
export const LauncherAppStateAnnotation = Annotation.Root({
    // Define reducers for each field, typically just replacing the old value
    transcribed_text: Annotation<string>({ reducer: (v, u) => u ?? v, default: () => '' }),
    identified_app_name: Annotation<string | null>({ reducer: (v, u) => u ?? v, default: () => null }),
    is_app_running: Annotation<boolean | null>({ reducer: (v, u) => u ?? v, default: () => null }),
    execution_result: Annotation<string | null>({ reducer: (v, u) => u ?? v, default: () => null }),
    error: Annotation<string | null>({ reducer: (v, u) => u ?? v, default: () => null }),
});
Use code with caution.
TypeScript
3. electron/main/langgraph/nodes/intentParserNode.ts (New File)
Action: Create this file for the first agent.
Purpose: To understand the user's command.
Code:
Generated typescript
import { LauncherAppState } from '../launcher-state';
import { logger } from '../../../src/utils/logger';
import { openai } from '../../../services/openaiService'; // You may need to create/import this

export async function intentParserNode(state: LauncherAppState): Promise<Partial<LauncherAppState>> {
  logger.info('Running Intent Parser Node', { text: state.transcribed_text });
  const knownAppNames = ['Visual Studio Code', 'Chrome', 'Terminal', 'Notepad', 'Calculator']; // Must match your os-executor map
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `You are an expert at identifying application names from user commands. The known applications are: ${knownAppNames.join(', ')}. Respond only with the name of the application you identify. If no known application is mentioned, respond with "UNKNOWN".` },
        { role: 'user', content: `From the following text, which application should I open? "${state.transcribed_text}"` }
      ],
      temperature: 0,
    });
    const identifiedApp = response.choices[0].message.content?.trim();
    if (identifiedApp && identifiedApp !== 'UNKNOWN') {
      return { identified_app_name: identifiedApp };
    }
    return { identified_app_name: null, execution_result: "Sorry, I couldn't identify a known application." };
  } catch (error) {
    return { error: 'Failed to parse command.' };
  }
}
Use code with caution.
TypeScript
4. electron/main/langgraph/nodes/appStatusCheckNode.ts (New File)
Action: Create this file.
Purpose: To check if the application is already running.
Code:
Generated typescript
import { LauncherAppState } from '../launcher-state';
import { isAppRunning } from '../../os-executor';
import { logger } from '../../../src/utils/logger';

export async function appStatusCheckNode(state: LauncherAppState): Promise<Partial<LauncherAppState>> {
  const appName = state.identified_app_name;
  if (!appName) return { error: 'Cannot check status without an app name.' };
  
  try {
    const isRunning = await isAppRunning(appName);
    logger.info(`App status for '${appName}': ${isRunning ? 'Running' : 'Not Running'}`);
    return { is_app_running: isRunning };
  } catch (error) {
    return { error: 'Failed to check if application is running.' };
  }
}
Use code with caution.
TypeScript
5. electron/main/langgraph/nodes/commandExecutorNode.ts (New File)
Action: Create this file.
Purpose: To execute the launch or focus command.
Code:
Generated typescript
import { LauncherAppState } from '../launcher-state';
import { launchApp, focusApp } from '../../os-executor';
import { logger } from '../../../src/utils/logger';

export async function commandExecutorNode(state: LauncherAppState): Promise<Partial<LauncherAppState>> {
  const { identified_app_name, is_app_running } = state;
  if (!identified_app_name) return { error: 'Cannot execute command without an app name.' };
  
  try {
    const result = is_app_running ? await focusApp(identified_app_name) : await launchApp(identified_app_name);
    return { execution_result: result.message };
  } catch (error) {
    return { error: 'Failed to execute the command.' };
  }
}
Use code with caution.
TypeScript
6. electron/main/langgraph/launcher-workflow.ts (New File)
Action: Create this file to define the new graph.
Purpose: Wires all the new nodes together.
Code:
Generated typescript
import { StateGraph, END } from '@langchain/langgraph';
import { LauncherAppState, LauncherAppStateAnnotation } from './launcher-state';
import { intentParserNode } from './nodes/intentParserNode';
import { appStatusCheckNode } from './nodes/appStatusCheckNode';
import { commandExecutorNode } from './nodes/commandExecutorNode';

function routeAfterParsing(state: LauncherAppState): 'checkStatus' | '__end__' {
  return state.identified_app_name ? 'checkStatus' : '__end__';
}

export function createLauncherWorkflow() {
  const workflow = new StateGraph(LauncherAppStateAnnotation);
  workflow.addNode('intentParser', intentParserNode);
  workflow.addNode('appStatusChecker', appStatusCheckNode);
  workflow.addNode('commandExecutor', commandExecutorNode);
  workflow.setEntryPoint('intentParser');
  workflow.addConditionalEdges('intentParser', routeAfterParsing, {
    checkStatus: 'appStatusChecker',
    __end__: END,
  });
  workflow.addEdge('appStatusChecker', 'commandExecutor');
  workflow.addEdge('commandExecutor', END);
  return workflow.compile();
}
Use code with caution.
TypeScript
Phase 2: Adapt Existing Files (Backend & Frontend)
These are modifications to existing files.
7. electron/main/langgraph-handler.ts (Modification)
Action: Point this handler to your new workflow.
Code Snippet:
Generated typescript
// At the top of the file
import { createLauncherWorkflow } from './langgraph/launcher-workflow'; // Your new file

// Initialize the new workflow permanently
const activeWorkflowCompiler = createLauncherWorkflow();

// Inside initializeLangGraphHandlers()
ipcMain.handle('langgraph:execute', async (event, initialState: any) => {
    try {
        const result = await activeWorkflowCompiler.invoke(initialState);
        return { success: true, data: result };
    } catch (error) {
        // ... error handling
        return { success: false, error: (error as Error).message };
    }
});

// NOTE: You will also need to update createSession, etc. to use the new state shape.
Use code with caution.
TypeScript
8. src/App.tsx (Modification)
Action: Change the UI display and adapt the audio recording callback.
Code Snippet:
Generated tsx
import { useState, useCallback } from 'react';
// ... other imports
import { LauncherAppState } from './types/LauncherAppState'; // You'll create this simple type file

// ...

function AppInner() {
  // New state for simple status display
  const [statusMessage, setStatusMessage] = useState('Click the mic and say a command.');
  const [isProcessing, setIsProcessing] = useState(false);
  // ... your existing useLangGraph hook would be adapted or replaced

  const audioRecording = useAudioRecording(async (audioBlob, duration) => {
    // This is the core logic change
    setIsProcessing(true);
    setStatusMessage('Transcribing audio...');
    
    // You'll need a way to call the whisperService and langgraphService
    const transcribedText = await whisperService.transcribeBlob(audioBlob); // Simplified for example
    setStatusMessage('Parsing command...');

    const initialState: LauncherAppState = {
      transcribed_text: transcribedText,
      identified_app_name: null,
      is_app_running: null,
      execution_result: null,
      error: null,
    };

    const finalState = await langgraphService.execute(initialState); // Simplified for example
    
    setStatusMessage(finalState.execution_result || finalState.error || 'An unknown error occurred.');
    setIsProcessing(false);
  });

  // In the return() statement:
  return (
    <div className="app-container">
      {/* ... sidebar (can be simplified or hidden) ... */}
      <main className="chat-main">
        {/* NEW simple status display instead of <Chat /> */}
        <div className="status-display-area">
          <h2 className="status-text">{statusMessage}</h2>
          {isProcessing && <div className="spinner"></div>}
        </div>
        
        <div className="chat-input-area">
          <InputBar
            onVoiceRecord={audioRecording.startRecording}
            isProcessing={isProcessing}
            disabled={true} // Disable text input for voice-only
            placeholder="Click the mic to speak a command"
            // ... other props
          />
        </div>
      </main>
      {/* ... permission dialog, etc. ... */}
    </div>
  );
}
Use code with caution.
Tsx
9. src/types/LauncherAppState.ts (New File)
Action: Create this file to provide type safety on the frontend.
Code:
Generated typescript
export interface LauncherAppState {
  transcribed_text: string;
  identified_app_name: string | null;
  is_app_running: boolean | null;
  execution_result: string | null;
  error: string | null;
}
Use code with caution.
TypeScript
This list gives you all the necessary new files and the key modifications to existing ones. By creating the new files first and then adapting langgraph-handler.ts and App.tsx, you ensure a clean and controlled pivot.