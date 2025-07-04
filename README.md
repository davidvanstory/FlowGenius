Overview

This desktop application streamlines the way you brainstorm, refine, and validate new AI‑powered coding projects. Instead of juggling multiple chat sessions and copy‑pasting between ChatGPT‑4o and Gemini 2.5, everything happens in one focused workflow powered by LangGraph agents.

Why it exists: Traditionally, I would:
Hold a long brainstorming conversation with ChatGPT‑4o.
Ask ChatGPT‑4o to summarise that chat.
Copy the summary into Gemini 2.5 to generate a Product‑Requirements Document (PRD).
Paste the PRD back into a markdown file.

This tool collapses those steps into a single voice‑driven experience so you can go from scattered thoughts to an actionable idea (plus competitive‑landscape research) in minutes.

Key Features
- Voice Capture – Speak your ideas aloud; OpenAI Whisper transcribes them in real‑time.
- Intelligent Analyzer – An LLM checks each transcript against ten predefined ideation criteria (user problem, target demographic, key features …​). It assigns confidence scores and asks focused follow‑up questions to fill the gaps.
- One‑Click Summary – Generate a concise, organised summary ready to drop into a PRD.
- Competitive Scan – A Tavily web‑search agent surfaces existing products, articles, and repos similar to your concept so you can gauge novelty.


Desktop Native – Built with Electron + Vite + React for an uncluttered, distraction‑free UI.

Planned: An email‑search node (via Composio MCP) to mine your inbox for relevant prior art or stakeholder conversations.

Architecture
The app is organised as a LangGraph graph where each node owns a distinct slice of the workflow.

Node
Responsibility
1. Transcription Node: Converts speech → text using OpenAI Whisper.

2. Analyzer Node: Evaluates each transcript against the 10‑point ideation rubric, computes confidence scores, and generates follow‑up questions.

3. Summary Node: Produces a summary and triggers a Tavily web search for competitive insights.

4. Email Search Node (Planned): send email of market research.

The nodes are orchestrated inside an Electron main process; React renders the UI in the renderer process. Communication between main ↔ renderer happens via IPC handlers.

TRANSCRIBER----ANALYZER----SUMMARIZER----MARKET RESEARCHER, EMAILER

Technology Stack

Electron + Vite + React – desktop shell & UI
LangGraph – agent orchestration
OpenAI Whisper – speech‑to‑text
OpenAI GPT‑4o – language reasoning (analysis, follow‑ups, summaries)
Tavily Search API – competitive research
Composio MCP – (WIP) Gmail integration
TypeScript




Usage
Press the microphone icon to start brainstorming aloud.
Watch the Analyzer panel update with confidence scores and follow‑up prompts.
When satisfied, click Generate Summary. A markdown PRD outline plus Tavily links will appear.
Copy or export the summary into your repo, Jira ticket, or docs platform.





