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

## What it's good at

The operator is trained on live game data. Try asking these:

- **Ammo vs Armor:** "What ammo penetrates class 5 armor?" or "Is M855A1 good against class 4?"
- **Item Value:** "What is a LEDX worth?" or "Should I keep this GPU or sell it?"
- **Quest Objectives:** "What do I need for Delivery from the Past?" or "Where is the pocket watch on Customs?"
- **Map Extracts:** "Where are the extracts on Reserve?" or "Is ZB-013 open?"

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
