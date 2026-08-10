# Tarkov Operator

Desktop AI companion for Escape from Tarkov. System tray with PTT:
capture mic → STT → LLM → TTS → speak.

## Stack

- **Runtime:** Electron (Node.js)
- **UI:** Vanilla HTML/CSS/JS (no framework)
- **LLM:** OpenAI-compatible (OpenRouter, OpenAI, Anthropic, Ollama)
- **STT:** Whisper API, OpenRouter, ElevenLabs
- **TTS:** ElevenLabs, OpenRouter, system TTS (say/SAPI)
- **Data:** SQLite + FTS5 from tarkov.dev + RAG context injection

## Project Structure

```
src/
├── main.js               # Electron main: tray, PTT loop, IPC handlers
├── preload.js            # contextBridge IPC API
├── settings-store.js     # SQLite settings persistence
├── agent.js              # Retrieval routing and tool orchestration
├── llm.js                # LLM client + conversation history
├── stt.js                # STT (Whisper API, OpenRouter, ElevenLabs)
├── tts.js                # TTS (ElevenLabs, OpenRouter, system)
├── audio-capture.js      # Mic capture host (hidden renderer)
├── audio-playback.js     # Playback via platform player
├── data-store.js         # SQLite + FTS5 game data cache
├── tarkov-dev.js         # GraphQL client for tarkov.dev
├── rag.js                # RAG context from cached data
├── errors.js             # Typed ProviderError definitions
├── logger.js             # Centralized logging sink
├── model-caps.js         # Model capability detection (tools vs RAG)
├── fts-query.js          # FTS5 query builder (stopword stripping)
├── tools/                # Speech-shaped tools (ammo, items, quests, maps)
└── renderer/
    ├── index.html         # Settings UI (8 tabs)
    ├── styles.css
    ├── app.js             # UI logic
    └── capture.*          # Hidden capture renderer files
.github/workflows/
└── release.yml           # Build macOS + Windows on tag push
```

## Commands

| Command | Description |
|---|---|
| `npm start` | Launch production |
| `npm run dev` | Launch + DevTools |
| `npm test` | Run test suite (requires Electron ABI) |
| `npm run lint` | Run ESLint |
| `npm run build:mac` | Package macOS .dmg |
| `npm run build:win` | Package Windows .exe |

## Git Workflow

- `main` branch — ready for PR/merge at all times
- Tag push (`git tag v*.*.* && git push --tags`) triggers GitHub Actions release

## Architecture

### PTT Pipeline
1. `globalShortcut` detects PTT key tap → `audioCapture.startCapture()`
2. Hidden renderer captures via `getUserMedia` → silence auto-stop or second tap cancel
3. Buffer → `stt.transcribe()` → `agent.process()` → `tts.synthesize()`
4. Output → `audioPlayback.playBuffer()`

### Retrieval Strategy
- **Tools:** Primary path for models supporting `tools` in `supported_parameters`.
- **RAG:** Fallback for models without tool support (local/Ollama).
- **Tools List:** `ammo_vs_armor`, `item_value`, `quest_info`, `map_info`, `get_hideout_requirements`, `remember_fact`, `recall_fact`.

### Data Layer
- **SQLite:** Stores game data, settings, and user memory.
- **Versioning:** `SCHEMA_VERSION` mismatch drops game-data tables only. Settings and memory always survive.
- **Seeding:** Ships with a bundled `data/snapshot.json` for offline-first startup.

### Settings
- Stored in the `settings` table in the app's SQLite database.
- Old `settings.json` is auto-migrated to `.bak` on first run.
- All fields auto-save on change or blur.

### Error Handling
- Failures surface as typed `ProviderError`.
- Errors trigger a tray notification and a red banner on the Home tab.
- No silent failures in the pipeline.

## Gotchas

- **No SoX required.** Microphone capture is handled in-process via Chromium.
- **npm test** must run under Electron's Node ABI because `better-sqlite3` is compiled against it.
- **tarkov.dev GraphQL:** Task has no description. Use objectives and requirements instead.
- **OpenRouter free models** may be blocked by privacy guardrails.
- **Unsigned builds:** Windows SmartScreen and macOS Gatekeeper will block the app by default.
- **No Python.** Everything is Node.js.
- **No `execSync` with string interpolation.** Use `spawnSync` with array arguments to prevent command injection.
- **CSS uses custom properties.** All theme colors are defined as `var(--*)` in `:root` in `styles.css`. Use those variables, don't hardcode hex colors.
- **Settings are in SQLite**, not JSON files. Don't reference `settings.json`.
- **Tool handlers must validate inputs** before querying the database.
