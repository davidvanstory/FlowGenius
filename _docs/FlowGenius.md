# Project Name
FlowGenius

## Project Description
FlowGenius is a desktop-first, voice-first application designed to solve the personal productivity challenge of moving from idea to structured documentation. It eliminates the fragmented and manual workflow of using separate tools for brainstorming, transcription, summarization, and drafting. The core of the application is a unified, conversational interface that guides the user through a three-stage process—Brainstorm, Summarize, and PRD Generation—while preserving their unique voice and thought process. It serves as a persistent, intelligent thought partner that archives every idea for easy iteration and export.

## Target Audience
Product managers, developers, founders, and any individual who engages in frequent ideation and needs to translate those thoughts into structured documents like PRDs, project briefs, or technical specs.

## Desired Features
### Core Workflow & Interface
- [ ] Unified, single-pane chat interface for the entire workflow.
- [ ] Implement a three-stage conversational workflow:
    - [ ] **1. Brainstorm:** A free-form conversational stage for ideation.
    - [ ] **2. Summarization:** Condenses the brainstorm session into a detailed, structured summary.
    - [ ] **3. PRD Generation:** Transforms the summary into a formatted Product Requirements Document.
- [ ] A dynamic action button with state-dependent labels to guide the user:
    - [ ] After Brainstorming: **"Brainstorm Done"** (triggers Summary).
    - [ ] After Summary: **"Summary Done"** (triggers PRD).
    - [ ] After PRD: **"PRD Done"**.
- [ ] A visual progress indicator (e.g., Brainstorm > Summary > PRD) that clearly shows the user's current stage for an idea.
    - [ ] The indicator should show an "in-progress" state.
    - [ ] The indicator should show a "completed" state with a checkmark.
- [ ] Allow for easy copy/paste of the final PRD from the chat interface.

### Session and Data Management
- [ ] Implement a session management sidebar.
    - [ ] Display a list of all ideas (e.g., "Idea 1", "Idea 2").
    - [ ] Allow creating a new idea session via a "+" button.
    - [ ] Each idea in the list should retain its own state and chat history.
- [ ] Store all session data in a database, including chat history, transcripts, summaries, PRDs, prompts, and uploaded images.

### AI & Prompting
- [ ] Integrate voice-to-text (V2T) to be available at all times via a microphone icon in the input bar.
- [ ] Support continuous voice-based interaction and refinement during all stages.
- [ ] Provide a settings area for Prompt Management.
    - [ ] Allow user to define and edit a custom system prompt for the Brainstorming stage.
    - [ ] Allow user to define and edit a custom prompt for the Summarization stage.
    - [ ] Allow user to define and edit a custom prompt for the PRD Generation stage.
- [ ] Allow the user to select different AI models (e.g., GPT-4o, Gemini, Claude) for each stage of the workflow using cloud-based APIs.
- [ ] Ensure the AI maintains context and can make targeted edits to a draft without losing the rest of the content.

### Media & Attachments
- [ ] Allow users to upload images (sketches, screenshots) directly into the chat interface.
    - [ ] The input bar should feature a dedicated icon for file uploads from the start.
    - [ ] The AI should hold the image as context for subsequent prompts and analyze it when included in a user's turn.

## Design Requests
### Layout & Visual Style
- [ ] **Primary Design Inspiration:** The visual style should be heavily inspired by the OpenAI ChatGPT interface—it should be clean, crisp, and minimalist, with a strong focus on the conversational experience.
- [ ] Main layout should consist of a left sidebar for sessions and a large main pane for the chat.
- [ ] The chat interface should be a single, continuous, undivided thread.
- [ ] The input bar at the bottom should contain the text field, a microphone icon, and an upload icon.

### Interaction Details
- [ ] When a user approves a stage (e.g., Summary), a checkmark should appear on the progress indicator.
- [ ] The dynamic action button (... Done) should be located separately, just above the main input bar.
- [ ] AI-generated summaries and PRDs should appear as long-form, inline messages within the chat, not in a separate modal or view.
- [ ] A blue, ebbing microphone icon (similar to GPT-4o) should be used during voice input to encourage conversation.

## Detailed LangGraph Implementation Guide
This section provides a blueprint for constructing the application's core logic using LangGraph.

### 1. Graph State Definition
The StateGraph should be initialized with a state object that manages the entire lifecycle of an idea session. This state will be passed between nodes.

```typescript
interface AppState {
  idea_id: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string; image_url?: string }>;
  current_stage: 'brainstorm' | 'summary' | 'prd';
  last_user_action: 'chat' | 'Brainstorm Done' | 'Summary Done' | 'PRD Done';
  user_prompts: {
    brainstorm: string;
    summary: string;
    prd: string;
  };
  selected_models: {
    brainstorm: string; // e.g., 'gpt-4o'
    summary: string;    // e.g., 'gemini-2.5-pro'
    prd: string;        // e.g., 'gemini-2.5-pro'
  };
}
```

2. Graph Node Definitions
Define the following nodes (functions) that perform the core work.
process_user_turn(state: AppState): Handles a standard chat message.
Logic: Takes the current message list from the state, calls the appropriate LLM for the current_stage with the full context, gets the response, appends the new assistant message to the list, and returns the updated state.
generate_summary(state: AppState): Triggered after brainstorming is complete.
Logic:
Constructs a prompt using the summary prompt from user_prompts and the entire messages history.
Calls the selected "summary" LLM.
Appends the resulting summary as a new assistant message.
Updates state.current_stage to 'summary'.
Returns the updated state.
generate_prd_draft(state: AppState): Triggered after the summary is complete.
Logic:
Constructs a prompt using the prd prompt and the full context (including the new summary).
Consideration: To manage context size, this node can be optimized to only include the summary and subsequent PRD refinement messages, not the entire initial brainstorm.
Calls the selected "PRD" LLM.
Appends the PRD draft as a new assistant message.
Updates state.current_stage to 'prd'.
Returns the updated state.

3. Graph Edge & Routing Logic
The graph's flow will be controlled by a conditional edge that inspects state.last_user_action.
Set the entry point of the graph to process_user_turn.
After the process_user_turn node, add a conditional edge that routes the flow.
router_function(state: AppState):
If state.last_user_action === 'Brainstorm Done', route to the generate_summary node.
If state.last_user_action === 'Summary Done', route to the generate_prd_draft node.
If state.last_user_action === 'PRD Done', route to a terminal end node.
Otherwise (if it was a standard 'chat' action), loop back to wait for the next input (effectively ending the turn).
The output of generate_summary and generate_prd_draft should also loop back to wait for the next user input.
This structure creates a robust, stateful conversational agent that can intelligently switch tasks based on explicit user triggers.

Other Notes
Database Schema Definition (Supabase)
Table: ideas
id (uuid, primary key)
title (text, e.g., "AI Productivity Tool")
current_stage (text: 'brainstorm', 'summary', 'prd')
created_at (timestamp)
user_id (links to auth user)
Table: chat_messages
id (uuid, primary key)
idea_id (foreign key to ideas.id)
role (text: 'user' or 'assistant')
content (text, the message itself)
stage_at_creation (text: 'brainstorm', 'summary', 'prd')
image_url (text, nullable, link to Supabase Storage)
created_at (timestamp)
Table: prompts
id (uuid, primary key)
user_id (foreign key to auth user)
prompt_type (text: 'brainstorm', 'summary', 'prd')
content (text)
model_selection (text)
Initial Tech Stack Proposal
Frontend: Electron + React.
Voice-to-Text: Whisper API.
AI Models: Cloud-based APIs for models like GPT-4o, Gemini, and Claude.
Workflow Engine: LangGraph (JS/TS version).
Database: Supabase.
File Storage: Supabase Storage.
Optional Automation: n8n.
### 

Key Note!
To start off this project i want to have the first couple of features to be very simple. 
I want you to set up the project with the whole architecture that we have dicussed. 
But I want to create a simple 2 features to start. I want a simple Voice to Text node, followed by a summarization node. 
The core functionality improvement i want to make to my workflow is to be able to have a conversation with the AI and have that summarized.  


Prompts:
Brainstorming: Have a conversation with the user and ask them questions about their idea. Make sure to finish with the statement with "Georgia is great"

Summary: When the user asks for a summary give them a text summary that is very detailed. Make sure to finish with the sta "Ireland is great"

PRD: Make a PRD in the following structure:

I'm looking to collaborate with you to turn this into a detailed project request. Let's iterate together until we have a complete request that I find to be complete. 

I want some interaction to help pick the stack and for you to tell me what would be a good idea, then I want a simple PRD that I can make a task and subtask list from.


After each of our exchanges, please return the current state of the request in this format:

```request
# Project Name
## Project Description
[Description]

## Target Audience
[Target users]

## Desired Features
### [Feature Category]
- [ ] [Requirement]
    - [ ] [Sub-requirement]

## Design Requests
- [ ] [Design requirement]
    - [ ] [Design detail]

## Other Notes
- [Additional considerations]
```

Please:
1. Ask me questions about any areas that need more detail
2. Suggest features or considerations I might have missed
3. Help me organize requirements logically
4. Show me the current state of the spec after each exchange
5. Flag any potential technical challenges or important decisions
6. Discuss what stack I would like to use, feel free to make suggestions. 

We'll continue iterating and refining the request until I indicate it's complete and ready.
