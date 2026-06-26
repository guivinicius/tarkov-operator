# Tarkov Operator

Desktop AI companion for Escape from Tarkov. System tray with PTT:
capture mic → STT → LLM → TTS → speak.

## Stack

- **Runtime:** Electron (Node.js)
- **UI:** Vanilla HTML/CSS/JS (no framework)
- **LLM:** OpenAI-compatible (OpenRouter, OpenAI, Anthropic, Ollama)
- **STT:** Whisper API, OpenRouter, ElevenLabs, local Whisper
- **TTS:** ElevenLabs, OpenRouter, system TTS (say/SAPI/espeak)
- **Data:** SQLite + FTS5 from tarkov.dev + RAG context injection

## Project Structure

```
src/
├── main.js               # Electron main: tray, PTT loop, IPC handlers, provider API
├── preload.js            # contextBridge IPC API
├── settings-store.js     # JSON settings persistence
├── llm.js                # LLM client + conversation history
├── stt.js                # STT (Whisper API, OpenRouter, ElevenLabs, local)
├── tts.js                # TTS (ElevenLabs, OpenRouter, system)
├── audio-capture.js      # Mic via SoX rec
├── audio-playback.js     # Playback via platform player
├── data-store.js         # SQLite + FTS5 game data cache
├── tarkov-dev.js         # GraphQL client for tarkov.dev
├── rag.js                # RAG context from cached data
└── renderer/
    ├── index.html         # Settings UI (7 tabs)
    ├── styles.css
    └── app.js
.github/workflows/
└── release.yml           # Build macOS + Windows on tag push
```

## Commands

| Command | Description |
|---|---|
| `npm start` | Launch production |
| `npm run dev` | Launch + DevTools |
| `npm run build:mac` | Package macOS .dmg |
| `npm run build:win` | Package Windows .exe |

## Git Workflow

- `main` branch — ready for PR/merge at all times
- Tag push (`git tag v*.*.* && git push --tags`) triggers GitHub Actions release

## Architecture

### PTT Pipeline
1. `globalShortcut` detects PTT key → SoX rec subprocess
2. Release (silence/retap) → stop rec, get WAV buffer
3. Buffer → `stt.transcribe()` → `llm.ask()` → `tts.synthesize()`
4. Output → `audioPlayback.playBuffer()`

### Conversation History (`llm.js`)
- `llm.js` maintains an in-memory `conversationHistory` array
- Each `ask()` call injects past exchanges between system prompt and current user message
- Capped at 15 exchanges (30 messages)
- `newSession()` clears array (via IPC from renderer)

### Settings
- JSON file in `app.getPath("userData")/settings.json`
- Per-provider API keys only in **Providers** tab
- All fields auto-save on change/blur (password fields use dirty tracking)

### Key Derivation (main.js)
- `llmApiKey(s)` — maps LLM_PROVIDER → correct key name
- `sttApiKey(s)` — maps STT_PROVIDER → correct key name

### IPC API
| Method | Returns | Description |
|---|---|---|
| `getStatus()` | `{ enabled }` | PTT active? |
| `toggle()` | `{ enabled }` | Enable/disable |
| `getLogs()` | `LogEntry[]` | Recent logs |
| `getSettings()` | `Settings` | Current settings |
| `updateSettings(s)` | `{ ok }` | Save settings |
| `newSession()` | `{ ok }` | Clear LLM history |
| `fetchModels(c, p, k, u)` | `Model[]` | Fetch provider models |
| `fetchVoices(p, k)` | `Voice[]` | Fetch TTS voices |
| `getDataStatus()` | `Status` | SQLite cache stats |
| `fetchGameData(p)` | `{ ok }` | Fetch from tarkov.dev |
| `clearGameData()` | `{ ok }` | Clear SQLite cache |
| `checkDependency(n)` | `Status` | Check SoX install |
| `onLog(cb)` | unsubscribe | Live log stream |
| `onStatusChange(cb)` | unsubscribe | Status events |
| `onDataUpdated(cb)` | unsubscribe | Data refresh events |

## Gotchas

- **SoX required** for mic: `brew install sox` / `choco install sox.portable`
- **better-sqlite3** compiled for Electron's Node.js — won't load in system Node.js
- **tarkov.dev GraphQL:** Task has no description; hideoutStations not hideoutModules; Trader has no items
- **OpenRouter free models** may be blocked by privacy guardrails: configure at openrouter.ai/settings/privacy
- **ElevenLabs voices** fetched without auth (public endpoint — 21 premade voices)
- **Password dirty tracking:** blur only saves if user actually typed (avoids accidental key clearing)
- **No Python.** Everything is Node.js.
