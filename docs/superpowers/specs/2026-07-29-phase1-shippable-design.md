# Tarkov Operator — Phase 1 Shippable Design

**Date:** 2026-07-29
**Status:** Approved for planning
**Goal:** A stranger downloads a build, double-clicks it, pastes one API key, taps a key, asks a Tarkov question out loud, and hears a correct spoken answer. No terminal. No wiki tab.

Phase 2 (screenshot/gameplay interpretation) is explicitly **out of scope**.

---

## 1. Locked decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Stay a desktop Electron app | Global PTT while a fullscreen game holds focus is impossible in a browser; phase-2 screen capture needs OS-level permission; BYO-key in a browser means CORS failures, exposed keys, or holding strangers' keys on a server |
| D2 | Zero-terminal install — the SoX requirement is removed | A gaming audience told to open Terminal is gone |
| D3 | No paid code-signing certificates at launch ($0) | Unproven demand; revisit if traction appears |
| D4 | Open source; the repo is the trust signal | Goal is noise, not money. Verified: no key material in any of 30 commits |
| D5 | Windows is the shipping audience; macOS is the dev loop | EFT does not run on macOS |
| D6 | Four must-nail question classes: ammo-vs-armor, item value, quest objectives, map extracts | User-selected as the difference between "useful" and "cute demo" |
| D7 | Hideout requirements and persistent memory stay as-is, no further investment | Already built, not download drivers |
| D8 | Tap-to-talk with silence auto-stop; no native keyboard hook | See §4 |

---

## 2. Verified external facts

Established empirically, not assumed. Three research agents timed out; these were confirmed by direct probing.

### tarkov.dev
- **The GraphQL API returned HTTP 503 on 4/4 attempts** during design. Host root is 200; `status.tarkov.dev` is 523. The sole data source is an unpaid community API with real downtime.
- Schema retrieved from source instead: `the-hideout/tarkov-api` → `schema-static.mjs`.
- All four target features are fully supported by fields the app **never requested**:

| Need | Confirmed schema path |
|---|---|
| Ammo | `Item.properties` → `ItemPropertiesAmmo { caliber, damage, armorDamage, penetrationPower, penetrationChance, fragmentationChance, ricochetChance, ammoType, projectileCount, initialSpeed }` |
| Prices | `Item.avg24hPrice`, `lastLowPrice`, `low24hPrice`, `high24hPrice`, `sellFor: [ItemPrice!]`, `buyFor: [ItemPrice!]`, `fleaMarketFee(...)`; `ItemPrice { vendor: Vendor!, price, currency, priceRUB }` |
| Quests | `Task { map: Map, objectives: [TaskObjective]!, taskRequirements, minPlayerLevel, kappaRequired, wikiLink, experience }`. **`Task.description` does not exist.** `TaskObjective` is an interface `{ id, type, description!, maps: [Map]!, optional }` with 15 implementors |
| Extracts | `Map.extracts: [MapExtract]`; `MapExtract { id, name, faction, switches, transferItem, position, outline }`. `Map` also exposes `accessKeys`, `bosses`, `players`, `switches`, `locks`, `spawns`, `transits`, `minPlayerLevel` |

### OpenRouter
- `POST /api/v1/audio/speech` **exists**. Required body: `{model, input, voice}`, all strings; `response_format: "pcm"` accepted. A complete body returns 401 (auth only). The current `tts.js` request shape is correct.
- `POST /api/v1/audio/transcriptions` **exists** (401, not 404).
- `GET /api/v1/models/{id}` returns **404** — the per-model voice lookup calls a dead endpoint and silently falls back on every call.
- `supported_voices` exists as a key on model objects in the `/models` **list** response but is **empty for all 367 models**. The feature cannot ever return data.
- **301 of 367 models declare `tools` in `supported_parameters`**; 14 are free and tool-capable. Tool capability is therefore detectable in advance.
- Only 4 models list audio in `output_modalities`; 33 accept audio input.

### Electron
- `systemPreferences.askForMediaAccess('microphone')` gates macOS consent and requires `NSMicrophoneUsageDescription` in `Info.plist` (via electron-builder `mac.extendInfo`).
- `session.setPermissionRequestHandler` must approve `permission === 'media'` or a renderer `getUserMedia` call is denied.
- Windows requires no microphone permission.

### Native keyboard hooks
- `uiohook-napi` v1.5.5 (published 2026-03-21) is actively maintained with prebuilt binaries via `node-gyp-build` — the only credible option for true key-release detection.
- `iohook` (0.9.3, 2021) is abandoned. `node-global-key-listener` requires `sudo-prompt`. `@nut-tree/nut-js` is gone from npm.

---

## 3. Defects this design must fix

### Silent failure chain — highest severity
`llm.js` catches every API error and returns `{text: "", finishReason: "error"}`. `agent.js` interprets empty text as "model doesn't support tools", disables tools and retries. `main.js` sees empty text and skips TTS. **Net effect: a wrong API key produces total silence** — no audio, no dialog, only a line in a Logs tab the user will not open.

### Wrong data
- `lookup_item` and `rag.js` report `base_price`, an internal game value, as "the price". The app confidently tells users a wrong-concept number.
- Items query omits ammo properties entirely; maps query omits extracts; quests omit required items and map linkage.

### Audio capture
- Windows without SoX hard-rejects; only macOS has a fallback, and that fallback shells out to `ffmpeg`, also unbundled.
- `isSoxInstalled()` runs `execSync("sox --version")` on every keypress.
- `stopCapture()` resolves only via its 2-second force-kill timer; the `close` handler never resolves it.

### PTT is undefined behavior
Hold detection relies on OS key auto-repeat re-firing `globalShortcut`, inferring release when repeats stop. On keys that do not auto-repeat it silently becomes tap-to-start/tap-to-stop with a 30s cap. The same binary behaves differently per machine.

### Data layer structure
- No schema migration mechanism: all `CREATE TABLE IF NOT EXISTS`, no version key. Adding columns leaves existing installs silently on the old schema.
- FTS5 builds `"term"* OR "term"*` across every token including stopwords, so "what ammo pens class 5 armor" matches anything containing "class" or "armor".
- RAG injects up to 11 FTS rows into the system prompt on every request **and** the model separately calls tools hitting the same table — duplicated, conflicting context.

### Packaging
- No `asarUnpack`, no icons, no `publish` config, no `repository` field.
- CI builds on tag push but never publishes; `GH_TOKEN` is set and unused. A tag currently produces nothing downloadable.
- `data-store.close()` is never called on quit.

### Not defects (verified healthy)
Renderer has zero IPC contract mismatches; every DOM id referenced by `app.js` exists; memory-table CSS is present; the dark theme is cohesive. README says 7 tabs, there are 8 — docs drift only.

---

## 4. Interaction model

**Tap to talk. Talk. It stops on silence.** Tap again to cancel early.

Rejected: `uiohook-napi` true hold-to-talk. A Windows low-level keyboard hook inside an **unsigned** binary is exactly what antivirus heuristics flag, which directly undermines D3 and D4. It also demands macOS Input Monitoring consent. Ergonomically, holding a key while both hands drive WASD and mouse is worse than one tap.

The auto-repeat inference is deleted outright, not tuned. Behavior becomes identical on every machine.

---

## 5. Architecture changes

### 5.1 Audio capture — replace SoX
A hidden `BrowserWindow` captures microphone audio via `getUserMedia` + `MediaRecorder`, streams the encoded blob to main over IPC. Main grants `media` permission through `setPermissionRequestHandler` and calls `askForMediaAccess` on macOS. `NSMicrophoneUsageDescription` ships via `mac.extendInfo`.

Removes: SoX, ffmpeg, the per-keypress `execSync`, and the 2-second stop delay. Adds no native modules. Silence detection runs on the captured stream to drive auto-stop.

### 5.2 Error surfacing — make failure audible and visible
`llm.js` stops swallowing errors; it propagates a typed failure. `agent.js` loses the empty-text heuristic entirely and instead checks `supported_parameters` for `tools`. Any pipeline failure reaches the user through a tray notification and the Home tab — never silence.

### 5.3 Data layer
- Extend the GraphQL queries to fetch ammo properties, real prices, extracts, and quest objectives with map linkage.
- Add a `schema_version` key. On mismatch, drop and refetch — correct and simple at zero installed base.
- **Ship a pre-fetched snapshot in the package** so a fresh install works before any network call and while tarkov.dev is down. Startup refresh becomes an upgrade, not a prerequisite.
- Strip stopwords and stop OR-joining every token so natural spoken questions rank sensibly.
- Resolve the RAG/tools overlap explicitly: **when the selected model supports tools, tools are the only retrieval path and blanket RAG injection is disabled.** RAG injection is retained solely as the fallback for models without tool support (local/Ollama), which mirrors the branch `agent.js` already has. The two never run together.

### 5.4 Tools
Four tools carry the committed features, returning speech-shaped text (short, no tables, no raw IDs):
`ammo_vs_armor`, `item_value`, `quest_info`, `map_info`. `hideout_requirements`, `remember_fact`, `recall_fact` are retained unchanged per D7.

### 5.5 Onboarding
First-run state guides key entry, validates the key against a real endpoint with visible pass/fail, and exposes a PTT key picker. Dead controls are removed: the per-model voice fetch (404 endpoint) and the `supported_voices` path.

### 5.6 Packaging
`asarUnpack` for `better-sqlite3` **verified by launching a packaged build**, not by reading config. Icons for both platforms. `repository` field. CI actually publishes artifacts to a GitHub Release on tag push. Unsigned per D3, with honest install instructions.

### 5.7 Default provider stack
One OpenRouter key covers LLM and STT. TTS defaults to the system voice so audio works with **zero** keys; OpenRouter and ElevenLabs are opt-in upgrades. Any TTS model id must be validated against the live endpoint during QA, since model ids cannot be verified without a key.

---

## 6. Testing

The project has no test framework today. Phase 1 uses **`node:test`, the runner built into Node** — zero new dependencies, consistent with a project that deliberately avoids adding tooling. Tests run via an added `npm test` script.

This is a regression floor that locks the defects fixed above, not a coverage mandate. Required targets:

1. FTS5 query construction — stopword stripping and token joining, given a natural spoken question
2. Schema migration — version mismatch triggers drop-and-refetch; matching version does not
3. Error propagation — an API failure surfaces as a typed error and never as empty text
4. Tool output shaping — each of the four tools returns speech-shaped text with correct fields
5. Price correctness — `item_value` reports flea/trader price and never `basePrice`

Modules requiring an Electron runtime (audio capture, packaging, IPC) are validated by the scenario contract in §7 rather than by unit tests.

---

## 7. Scenario contract

Binary pass conditions with the surface that proves each. Every scenario needs a RED→GREEN test artifact **and** a real-surface artifact.

| ID | Class | Scenario | Pass condition | Proving surface |
|---|---|---|---|---|
| S1 | Happy | Ask "what ammo pens class 5 armor" | Spoken answer names real ammo with actual `penetrationPower` values | Packaged app, audio heard, log shows `ammo_vs_armor` invoked |
| S2 | Happy | Ask "what's a LEDX worth" | Spoken answer gives flea/trader price from `avg24hPrice`/`sellFor`, **not** `basePrice` | Packaged app + tool output in log |
| S3 | Happy | Ask "which extracts are on Reserve" | Spoken answer lists real extract names with faction | Packaged app + tool output |
| S4 | Edge | Launch with **no** API key, tap PTT | User sees an explicit visible error naming the Providers tab. Never silence | Screenshot of surfaced error |
| S5 | Edge | Launch with an **invalid** API key, ask a question | User hears or sees an explicit auth failure. The old path produced total silence | Screenshot + log showing propagated error |
| S6 | Edge | Fresh install with tarkov.dev unreachable | Bundled snapshot answers S1–S3 correctly | Answers correct with network blocked |
| S7 | Edge | Tap PTT and say nothing | Graceful no-op, no crash, no empty LLM call | Log shows short-buffer path |
| S8 | Regression | Launch the **packaged** app | Window opens, `better-sqlite3` loads, no crash | Packaged binary launched, not `npm start` |
| S9 | Regression | Change settings, quit, relaunch | Settings persist; existing DB survives schema versioning | Restart with values intact |
| S10 | Regression | Memory and hideout tools still work | Behavior unchanged per D7 | Tool invocation logs |
| S11 | Regression | Tag push builds and publishes | A downloadable artifact appears on a GitHub Release | Release page URL |

---

## 8. Out of scope

Screenshot/gameplay interpretation; paid code signing and notarization; auto-update (blocked by unsigned builds on macOS); telemetry; hideout and memory feature expansion; macOS as a promoted platform.
