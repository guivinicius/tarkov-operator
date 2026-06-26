# Tarkov Operator

A desktop AI companion for Escape from Tarkov. System tray app with push-to-talk:
capture mic → STT → LLM → TTS → speak.

## Features

- **Push-to-talk** — hold a key, ask a question, get a spoken response
- **Conversation history** — LLM remembers context across PTT interactions
- **Multiple providers** — choose your stack (OpenRouter, OpenAI, Anthropic, Ollama for LLM; Whisper API, OpenRouter, ElevenLabs for STT; ElevenLabs, OpenRouter, or system TTS)
- **Tactical brevity** — responses are short, military-radio style
- **Game-aware RAG** — fetches items, maps, quests, traders, and hideout data from [tarkov.dev](https://tarkov.dev) and injects relevant context into LLM prompts
- **System tray** — runs in the background, enable/disable with one click
- **Cross-platform** — macOS (primary) and Windows

## Prerequisites

- [SoX](http://sox.sourceforge.net/) for microphone capture
  - macOS: `brew install sox`
  - Windows: `choco install sox.portable`
- Node.js 18+
- API keys for your chosen providers (OpenRouter, OpenAI, Anthropic, ElevenLabs)

## Quick Start

```bash
git clone https://github.com/YOUR_USER/tarkov-operator.git
cd tarkov-operator
npm install
npm start
```

The settings window opens on launch. Configure your API keys in the **Providers** tab, select models in **LLM** and **Voice** tabs, then click **Enable Operator**.

Press the PTT key (default: F1) to talk. Release to process.

## Usage

1. Open the app — settings window appears
2. Go to **Providers** tab and enter at least one API key
3. Go to **LLM** tab — select provider and model
4. Go to **Voice** tab — select STT and TTS providers
5. Click **Enable Operator** in the status bar
6. Hold F1 (or your chosen key) to speak, release to hear the response

### Session Tracking

The LLM maintains conversation history. Start a fresh context by clicking **New Session** in the LLM tab.

### Game Data

The **Data** tab shows cached game info from tarkov.dev. Data is auto-fetched on startup if stale (>24h). You can also manually Fetch All or Clear Cache.

## Architecture

```
src/
├── main.js               # Electron main process: tray, PTT loop, IPC handlers
├── preload.js            # contextBridge IPC API for renderer
├── settings-store.js     # JSON settings persistence
├── llm.js                # LLM: OpenAI-compatible chat with conversation history
├── stt.js                # STT: Whisper API, OpenRouter, ElevenLabs, local Whisper
├── tts.js                # TTS: ElevenLabs, OpenRouter, system TTS (say/SAPI/espeak)
├── audio-capture.js      # Mic capture via SoX
├── audio-playback.js     # Audio playback via platform player
├── data-store.js         # SQLite+FTS5 cache for game data
├── tarkov-dev.js         # GraphQL client for tarkov.dev
├── rag.js                # RAG context builder from cached game data
└── renderer/
    ├── index.html         # Settings window UI (7 tabs)
    ├── styles.css
    └── app.js
```

## Commands

| Command | Description |
|---|---|
| `npm start` | Launch production mode |
| `npm run dev` | Launch with DevTools open |
| `npm run build:mac` | Package for macOS (.dmg) |
| `npm run build:win` | Package for Windows (.exe) |
| `npm run build` | Package for both platforms |

## Configuration

All settings are managed through the UI — no manual config files needed. API keys are stored securely in the app's user data directory.

### Supported Providers

| Category | Providers |
|---|---|
| LLM | OpenRouter, OpenAI, Anthropic, Ollama (local) |
| STT | Whisper API, OpenRouter, ElevenLabs, Local Whisper |
| TTS | ElevenLabs, OpenRouter, Local (system TTS) |

## License

MIT
