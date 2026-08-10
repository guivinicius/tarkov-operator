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

## Code Style

- 2-space indentation (JS, JSON, HTML, CSS, YAML)
- Double quotes for strings (JS)
- No semicolons (JS)
- CommonJS (`require`/`module.exports`) — no ESM
- Vanilla HTML/CSS/JS in renderer — no frameworks, no build step
- Descriptive variable names, no abbreviations

## Commands

| Command | Description |
|---|---|
| `npm start` | Launch production |
| `npm run dev` | Launch + DevTools |
| `npm test` | Run test suite (requires Electron ABI) |
| `npm run lint` | Run ESLint |
| `npm run build:mac` | Package macOS .dmg |
| `npm run build:win` | Package Windows .exe |

## Architecture

### PTT Pipeline
1. `globalShortcut` detects PTT key tap → `audioCapture.startCapture()`
2. Hidden renderer captures via `getUserMedia` → silence auto-stop or second tap cancel
3. Buffer → `stt.transcribe()` → `agent.process()` → `tts.synthesize()`
4. Output → `audioPlayback.playBuffer()`

### Key Modules
- `main.js` — Electron main: tray, PTT loop, IPC handlers
- `preload.js` — contextBridge IPC API
- `agent.js` — Retrieval routing and tool orchestration
- `data-store.js` — SQLite + FTS5 game data cache
- `tools/` — Speech-shaped tools (ammo, items, quests, maps)

### Retrieval Strategy
- **Tools:** Primary path for models supporting `tools` in `supported_parameters`.
- **RAG:** Fallback for models without tool support (local/Ollama).

### Data Layer
- **SQLite:** Stores game data, settings, and user memory.
- **Versioning:** `SCHEMA_VERSION` mismatch drops game-data tables only. Settings and memory always survive.
- **Seeding:** Ships with a bundled `data/snapshot.json` for offline-first startup.

## Gotchas

- **No SoX required.** Microphone capture is handled in-process via Chromium.
- **npm test** must run under Electron's Node ABI because `better-sqlite3` is compiled against it.
- **tarkov.dev API:** Uses json.tarkov.dev (REST), not the GraphQL endpoint. Task has no description field — use objectives and requirements instead.
- **OpenRouter free models** may be blocked by privacy guardrails.
- **Unsigned builds:** Windows SmartScreen and macOS Gatekeeper will block the app by default.
- **No Python.** Everything is Node.js.
- **No execSync with string interpolation.** Use `spawnSync` with array arguments to prevent command injection.
- **CSS uses custom properties.** All theme colors are defined as `var(--*)` in `:root` in `styles.css`. Use those variables, don't hardcode hex colors.
- **Settings are in SQLite**, not JSON files. Don't reference `settings.json`.
- **Tool handlers must validate inputs** before querying the database.
