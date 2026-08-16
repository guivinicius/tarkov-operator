# Tarkov Operator

[![CI](https://github.com/guivinicius/tarkov-operator/actions/workflows/ci.yml/badge.svg)](https://github.com/guivinicius/tarkov-operator/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Voice companion for Escape from Tarkov. Tap a key, ask a question out loud, and hear an answer without alt-tabbing to a wiki.

## Download

Get the latest version from [GitHub Releases](https://github.com/guivinicius/tarkov-operator/releases).

### Installation (Unsigned App)
This app is currently unsigned because I don't have a paid developer certificate yet. You will see a warning from your operating system. The source code is public and can be audited by anyone.

**Windows**
1. Download the `.exe` installer.
2. If SmartScreen shows "Windows protected your PC", click **More info**.
3. Click **Run anyway**.

**macOS**
1. Download the `.dmg` and drag the app to your Applications folder.
2. If Gatekeeper blocks a double-click, **right-click the app** and select **Open**.
3. Click **Open** in the confirmation dialog.

## Setup

1. Open the app. The settings window appears.
2. Go to the **Providers** tab.
3. Paste your **OpenRouter** API key. One key covers both the language model and speech-to-text.
4. Click **Validate** (or just click away to auto-save).
5. Choose your push-to-talk key in the status bar (default is **F1**).
6. Click **Enable Operator**.

Text-to-speech defaults to your built-in system voice, so audio works with no extra keys.

## How to talk to it

1. **Tap** your chosen key (e.g., F1).
2. **Speak** your question.
3. **Stop talking.** The app detects silence and ends the take automatically.
4. If you want to cancel a recording, **tap the key again** while speaking.

There is a 30-second hard cap on recording length.

## Features

- **🎙️ Push-to-Talk Voice Pipeline**
  - Configurable hotkey (F1–F24, keyboard keys, or Mouse buttons 3/4/5).
  - Multiple PTT modes: **Silence Detection** (auto-stop), **Hold**, and **Toggle**.
  - Integrated audio capture with silence gating and tap-again cancel.
  - Optional tactical **Radio Audio Filter** for authentic military comms.

- **👁️ Vision & In-Game Screenshot Context**
  - Captures the active game screen on PTT for visual intelligence (inventory, loadout, extraction signs, landmarks).
  - High-resolution (`1920x1080`) capture with high detail passing to multimodal models (GPT-4o, Claude 3.5/3.7, Gemini 2.0).
  - **Screenshot Inspector**: UI preview with metadata, full-size lightbox viewer, test capture tool, and local screenshot history on disk.
  - Strict anti-hallucination guardrails to prevent inventing inventory items or loot.

- **🎯 Tactical AI Operator Persona**
  - Concise, professional radio operator persona (1–2 sentences, zero fluff, voice-optimized for TTS).
  - **Survival-First Navigation**: Proactively warns of tactical dangers, sniper sightlines, hot zones, open crossings, and chokepoints during route guidance.

- **⏱️ Hybrid Session Management**
  - **Inactivity Timeout**: Automatically clears raid context after 20 minutes of idle time to prevent map bleed between raids.
  - **Safe Sliding Window**: Retains recent turns (~10 turns) with atomic tool-call preservation.
  - **In-Game Voice Commands**: Say *"New raid"*, *"Reset comms"*, *"Clear radio"*, or *"Nova raid"* to instantly reset session context without alt-tabbing.

- **📦 Live Game Data & Speech-Shaped Tools**
  - Offline-first SQLite + FTS5 database populated from `tarkov.dev` (ships with pre-seeded snapshot).
  - **Ammo vs. Armor**: Ballistics and penetration effectiveness across Armor Classes 1–6.
  - **Item Valuation**: Flea market prices, trader buy prices, price-per-slot, and barter value.
  - **Map Intelligence**: Map extraction points, faction availability (PMC/Scav), and map info.
  - **Quest Tracker**: Objectives, required quest items, traders, and map requirements.
  - **Hideout Requirements**: Station modules, item requirements, and upgrade costs.

- **🧠 Persistent User Memory**
  - Remembers long-term facts across sessions (player name, faction, trader levels, custom preferences) via SQLite storage.

- **🌐 Multi-Provider & Multi-Language Support**
  - **LLM**: OpenRouter, OpenAI, Anthropic, Ollama / Local OpenAI-compatible endpoints.
  - **STT**: OpenRouter Whisper, OpenAI Whisper, ElevenLabs Scribe, Local Whisper.
  - **TTS**: System Native TTS (macOS `say` / Windows SAPI), ElevenLabs, OpenRouter, OpenAI.
  - **Languages**: English, Portuguese (pt-BR), Spanish (es), and Russian (ru).

- **🔄 Desktop System Tray & Auto-Updates**
  - Runs in system tray with status indicator and quick toggles.
  - Auto-update detection and one-click GitHub release installer.

## What it's good at

The operator is trained on live game data. Try asking these:

- **Ammo vs Armor:** "What ammo penetrates class 5 armor?" or "Is M855A1 good against class 4?"
- **Item Value:** "What is a LEDX worth?" or "Should I keep this GPU or sell it?"
- **Quest Objectives:** "What do I need for Delivery from the Past?" or "Where is the pocket watch on Customs?"
- **Map Extracts:** "Where are the extracts on Reserve?" or "Is ZB-013 open?"
- **Vision:** "What ammo is in this magazine?", "What should I drop from my rig to make room?"
- **Session Comms:** "New raid", "Reset comms"

## Build from source

If you prefer to run from source, you need Node.js installed.

```bash
git clone https://github.com/guivinicius/tarkov-operator.git
cd tarkov-operator
npm install
npm start
```

### Development Commands
- `npm run dev` — Launch with DevTools open.
- `npm run build:mac` — Package for macOS.
- `npm run build:win` — Package for Windows.

## Testing

Run the test suite with:
```bash
npm test
```
Tests run under the Electron binary rather than plain Node.js. This is required because the database driver is compiled specifically for Electron's environment.

## Architecture

```
src/
├── main.js               # Electron main: tray, PTT loop, IPC handlers
├── preload.js            # contextBridge IPC API
├── settings-store.js     # SQLite settings persistence
├── agent.js              # Retrieval routing and tool orchestration
├── llm.js                # LLM client and conversation history
├── stt.js                # Speech-to-text (Whisper)
├── tts.js                # Text-to-speech (System, ElevenLabs, OpenRouter)
├── audio-capture.js      # Hidden-renderer capture host
├── audio-playback.js     # Platform-native audio playback
├── data-store.js         # SQLite + FTS5 game data cache
├── tarkov-dev.js         # GraphQL client for tarkov.dev
├── rag.js                # RAG context injection
├── errors.js             # Typed provider errors
├── logger.js             # Centralized logging
├── model-caps.js         # Model capability detection
├── fts-query.js          # FTS5 query builder
├── tools/                # Speech-shaped game data tools
└── renderer/
    ├── index.html         # Settings UI (8 tabs)
    ├── styles.css
    ├── app.js             # Main UI logic
    └── capture.*          # Hidden capture renderer
```

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines and our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT
