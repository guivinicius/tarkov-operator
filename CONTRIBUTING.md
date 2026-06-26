# Contributing

## Getting Started

1. Fork the repo
2. Clone your fork
3. `npm install`
4. `npm run dev` — launches with DevTools open

## Code Style

- No frameworks — vanilla HTML/CSS/JS for the renderer
- ES5-compatible patterns in renderer code (no `import`/`export` in renderer JS)
- Node.js `require`/`module.exports` in main process modules
- 2-space indentation (JS, JSON, HTML, CSS, YAML)
- Single quotes for strings (JS)
- No semicolons (JS)
- Descriptive variable names, no abbreviations

## Architecture

All modules live in `src/`. The renderer communicates with the main process via IPC through `window.operator` (exposed by `preload.js`).

### Key modules

| Module | Responsibility |
|---|---|
| `main.js` | Electron main process — tray, PTT loop, IPC handlers, provider API fetches |
| `preload.js` | contextBridge — exposes IPC calls to renderer |
| `settings-store.js` | JSON persistence in `app.getPath("userData")` |
| `llm.js` | OpenAI-compatible LLM client with conversation history |
| `stt.js` | Speech-to-text (Whisper API, OpenRouter, ElevenLabs, local Whisper) |
| `tts.js` | Text-to-speech (ElevenLabs, OpenRouter, system TTS) |
| `audio-capture.js` | Mic capture via SoX `rec` |
| `audio-playback.js` | Audio playback via platform player |
| `data-store.js` | SQLite + FTS5 cache for game data |
| `tarkov-dev.js` | GraphQL client for tarkov.dev |
| `rag.js` | RAG context builder from cached game data |
| `renderer/` | Settings window (index.html, styles.css, app.js) |

### IPC API

New features that need UI controls should add:
1. An IPC handler in `main.js`
2. A `window.operator` method in `preload.js`
3. DOM elements in `renderer/index.html`
4. Event listeners in `renderer/app.js`

## Testing

The app is manually tested by running `npm start` and verifying the full pipeline:
capture → STT → LLM → TTS → playback.

There is no test framework yet. Smoke tests are run by hand.

## Building

```bash
npm run build:mac   # macOS .dmg
npm run build:win   # Windows .exe
npm run build       # both
```

Native modules (`better-sqlite3`) are rebuilt with `@electron/rebuild` during build.

## Release Process

1. Update version in `package.json`
2. Tag the release: `git tag v0.1.0`
3. Push tags: `git push --tags`
4. GitHub Actions builds and drafts a release automatically

## Pull Requests

- Keep changes focused. One feature/fix per PR.
- Update README.md if adding or changing user-facing behavior.
- Verify the app starts and the PTT pipeline works before submitting.
