# Tarkov Operator

Desktop companion for Escape from Tarkov. System tray app with PTT (push-to-talk):
capture mic → STT (Whisper API) → LLM (user's choice) → TTS (ElevenLabs/local) → speak.

## Stack

- **Runtime:** Electron (Node.js)
- **UI:** Vanilla HTML/CSS/JS (no framework)
- **STT:** OpenAI Whisper API (user provides key via OpenRouter)
- **LLM:** OpenAI-compatible API (OpenRouter, OpenAI, Ollama — user's choice)
- **TTS:** ElevenLabs API (optional, user key) → fallback to macOS `say` / Windows SAPI

## Project Structure

```
src/
├── main.js               # Electron main process: tray, PTT loop, IPC handlers
├── preload.js            # contextBridge IPC API for renderer
├── settings-store.js     # JSON persistence in app.getPath("userData")
├── llm.js                # LLM: OpenAI-compatible chat completions
├── stt.js                # STT: OpenAI Whisper API
├── tts.js                # TTS: ElevenLabs API → local fallback
├── audio-capture.js      # Mic capture via SoX `rec` (cross-platform)
├── audio-playback.js     # Audio playback via platform player
└── renderer/
    ├── index.html         # Settings window UI
    ├── styles.css
    └── app.js
```

## Commands

```bash
npm start       # Launch in production mode
npm run dev     # Launch with DevTools open
npm run build   # Package for distribution (macOS + Windows)
```

## Architecture

### PTT Loop (all in main process)
1. `globalShortcut` detects F1 press → starts `rec` (SoX) subprocess
2. 200ms silence timeout detects key release → kills `rec`, gets WAV buffer
3. Buffer goes through: `stt.transcribe()` → `llm.ask()` → `tts.synthesize()`
4. Output audio played via `audioPlayback.playBuffer()`

### Settings Persistence
Settings stored as JSON in `app.getPath("userData")/settings.json`.
Loaded on startup, saved via IPC from renderer.

### IPC API (exposed via `window.operator`)
| Method | Returns | Description |
|---|---|---|
| `getStatus()` | `{ enabled }` | Is PTT active? |
| `toggle()` | `{ enabled }` | Enable/disable PTT |
| `getLogs()` | `LogEntry[]` | Recent log history |
| `getSettings()` | `Settings` | Current settings |
| `updateSettings(s)` | `{ ok }` | Save new settings |
| `onLog(cb)` | unsubscribe fn | Live log stream |
| `onStatusChange(cb)` | unsubscribe fn | Status change events |

### Settings
```json
{
  "OPENROUTER_API_KEY": "",
  "ELEVENLABS_API_KEY": "",
  "MODEL": "anthropic/claude-sonnet-4.6",
  "OPENAI_BASE_URL": "https://openrouter.ai/api/v1",
  "PTT_KEY": "F1"
}
```

## Gotchas

- **SoX required** for mic capture. `brew install sox` (macOS), `choco install sox.portable` (Windows).
- **globalShortcut** uses a 200ms silence timeout to detect key release (Electron has no keyup event).
- **No Python in this project.** Everything is Node.js.
- ElevenLabs API key is optional. Without it, TTS falls back to macOS `say` / Windows SAPI.
