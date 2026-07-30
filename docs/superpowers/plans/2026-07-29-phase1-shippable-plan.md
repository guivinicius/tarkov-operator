# Tarkov Operator — Phase 1 Shippable Implementation Plan

> **Save to:** `/Users/guivinicius/projects/tarkov-operator/docs/superpowers/plans/2026-07-29-phase1-shippable-plan.md`
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a phase-1 Tarkov voice companion a non-developer can download, double-click, paste one OpenRouter key into, and use — implementing the approved design `docs/superpowers/specs/2026-07-29-phase1-shippable-design.md` (decisions D1–D8, scenarios S1–S11).

**Architecture:** Electron tray app, vanilla JS. Mic capture moves from SoX to a hidden `BrowserWindow` (`getUserMedia` + Web Audio → 16 kHz mono 16-bit WAV over IPC). Errors become typed and audible (tray notification + Home banner). The data layer gains schema versioning, real prices/ammo/extracts/quest fields, a bundled offline snapshot, and four speech-shaped tools. CI publishes unsigned artifacts to GitHub Releases.

**Tech Stack:** Electron 35.7.5 (Node 22), better-sqlite3 (FTS5), OpenAI SDK, `node:test` via `ELECTRON_RUN_AS_NODE`, electron-builder 25, GitHub Actions.

## Global Constraints

- **Zero new runtime dependencies.** Test runner is `node:test` built into Node. No native keyboard hooks (D8). No Python.
- **Vanilla JS only** — no TypeScript, no framework, CommonJS `require` throughout `src/`.
- **$0 signing** (D3): unsigned builds on both platforms; install instructions must say so honestly.
- **Windows is the shipping audience; macOS is the dev loop** (D5). All dev verification commands below are macOS; Windows is exercised by CI + QA.
- **Verified GraphQL field names — use VERBATIM, do not guess:** `Item.properties → ... on ItemPropertiesAmmo { caliber damage armorDamage penetrationPower penetrationChance fragmentationChance ricochetChance ammoType projectileCount initialSpeed }`; `Item.avg24hPrice`, `Item.lastLowPrice`, `Item.sellFor: [ItemPrice!]` with `ItemPrice { vendor { name } price currency priceRUB }`; `Task` has **NO** `description`; `TaskObjective` is an interface `{ id type description maps { name } optional }` (interface fields only — no inline fragments needed for our scope); `Task.taskRequirements { task { name } }`, `Task.map { name }`, `minPlayerLevel`, `kappaRequired`, `wikiLink`; `Map.extracts: [MapExtract]` with `MapExtract { id name faction }`; `Map.players`, `Map.minPlayerLevel`.
- **tarkov.dev may be down (503 observed).** No task except Task 14 requires the live API; Task 14 has an explicit fallback and blocks only the release tag, not other work.
- **Tool outputs are speech-shaped:** plain sentences, no tables, no raw IDs, 1–2 sentences preferred.
- **Never `git checkout`/revert the 271 uncommitted lines.** They are triaged and committed in Task 1; later tasks then *edit* committed code.
- **Test command (macOS/Linux):** `npm test` → `ELECTRON_RUN_AS_NODE=1 npx electron --test tests/` (better-sqlite3 is compiled for Electron's ABI and will NOT load in system Node; running Electron as Node solves this with zero new deps). Fallback if `--test` misbehaves under `ELECTRON_RUN_AS_NODE` (verify in Task 1): `ELECTRON_RUN_AS_NODE=1 npx electron node_modules/.bin/../.bin/… ` is NOT needed — instead use `ELECTRON_RUN_AS_NODE=1 npx electron --test tests/*.test.js` explicit file list; if that also fails, run `npx @electron/rebuild -f -w better-sqlite3 --node-version $(node -v)` before tests and rebuild back after (documented, last resort).

---

## Wave Dependency Graph

```
Wave 0: T1 (baseline commits + test harness)
   │  unblocks: clean tree, npm test, parallel work
   ▼
Wave 1: T2 (packaging probe/S8) ─ T3 (error surfacing) ─ T4 (data-store schema/FTS) ─ T5 (tarkov.dev queries + snapshot script)
   │  unblocks: proven packaged launch, visible errors (QA-ability), versioned schema with new columns, mapped row shapes
   ▼
Wave 2: T6 (audio capture + PTT) ─ T7 (four tools) ─ T8 (retrieval routing)
   │  unblocks: SoX-free capture, S1–S3 answer path, single retrieval path
   ▼
Wave 3: T9 (bundled snapshot + lifecycle) ─ T10 (app icon asset) ─ T11 (README/AGENTS.md)
   │  unblocks: offline-first startup (S6), launch-ready branding & docs
   ▼
Wave 4: T12 (onboarding + key validation UI) ─ T13 (CI publish + icon wiring)
   │  unblocks: S4/S5 UX, S11 release pipeline
   ▼
Wave 5: T14 (real snapshot generation) → T15 (manual QA S1–S11)   [sequential within wave]
   │  unblocks: release gate
   ▼
Wave 6: T16 (cleanup, version bump, tag push → S11 verification)
```

## Task Dependency Graph

| Task | Depends On | Reason |
|------|------------|--------|
| T1 Baseline commits + test harness | None | Clean tree and `npm test` are prerequisites for everything |
| T2 Packaging probe (S8) | T1 | Needs committed tree; edits `package.json` build config |
| T3 Error surfacing | T1 | Edits llm/agent/main committed by T1; needs `npm test` |
| T4 Data-store schema versioning + FTS | T1 | Edits data-store.js committed by T1; needs `npm test` |
| T5 tarkov.dev queries + snapshot script | T1 | Row-shape interface co-designed with T4 (defined in this plan, so parallel to T4 is safe) |
| T6 Audio capture + PTT redesign | T3 | Both edit `src/main.js`; T3's logger/error path must exist for capture errors to surface |
| T7 Four speech-shaped tools | T4, T5 | Consumes new columns (T4) and mapped fields (T5); edits data-store.js after T4 |
| T8 Retrieval routing + model caps | T3 | Both edit `src/agent.js`; error semantics from T3 must be settled first |
| T9 Bundled snapshot + lifecycle close | T4, T5, T6 | Seeds via T4 insert paths using T5 snapshot format; edits `src/main.js` after T6 |
| T10 App icon asset | T1 | Independent visual asset |
| T11 README + AGENTS.md rewrite | T6 (conceptually) | Documents SoX removal and new install story; text-only |
| T12 Onboarding + key validation | T3, T6, T9 | Edits main.js/renderer after all main.js waves; surfaces errors defined in T3 |
| T13 CI publish + icon wiring | T2, T10 | Wires publish onto proven build config; points at T10's icon |
| T14 Real snapshot generation | T5, T9 | Runs T5's script into T9's loading path; needs live tarkov.dev |
| T15 Manual QA S1–S11 | ALL of T1–T14 | Full-system walkthrough on the packaged app |
| T16 Cleanup + release tag | T15 | Only after QA passes; proves S11 end-to-end |

## Parallel Execution Graph

```
Wave 0 (serial):                     T1
Wave 1 (4 parallel, no file overlap): T2 [package.json] | T3 [errors.js,logger.js,llm.js,agent.js,main.js,preload.js,renderer/*] | T4 [data-store.js,fts-query.js] | T5 [tarkov-dev.js,scripts/,fixtures]
Wave 2 (3 parallel):                  T6 [audio-capture.js,renderer/capture*,main.js,package.json(mac.extendInfo)] | T7 [tools/*,data-store.js] | T8 [model-caps.js,agent.js,rag.js]
Wave 3 (3 parallel):                  T9 [main.js,data-store.js,package.json(files),data/] | T10 [scripts/generate-icon.js,build/icon.png] | T11 [README.md,AGENTS.md]
Wave 4 (2 parallel):                  T12 [renderer/*,main.js,preload.js,settings-store.js,key-validator.js] | T13 [release.yml,package.json(publish+icon)]
Wave 5 (sequential):                  T14 → T15
Wave 6 (serial):                      T16

Critical path: T1 → T3 → T6 → T9 → T12 → T15 → T16
Estimated parallel speedup: ~45% vs sequential (11 of 16 tasks run in parallel waves)
```

Within-wave file-conflict audit: `package.json` is touched by exactly one task per wave (T2→W1, T6→W2, T9→W3, T13→W4). `src/main.js` is touched by exactly one task per wave (T3→W1, T6→W2, T9→W3, T12→W4). `src/agent.js`: T3→W1, T8→W2. `src/data-store.js`: T4→W1, T7→W2, T9→W3. `src/renderer/{index.html,app.js,styles.css}`: T3→W1, T12→W4 (T6's capture files are new, separate files). No two tasks in the same wave share a file.

---

## Tasks

### Task 1: Baseline triage — commit the 271 uncommitted lines + install the test harness

**Description**: Turn the dirty tree into atomic commits (preserving all interrupted-session work), add `.omo/` to `.gitignore`, and add the `node:test` harness with a smoke test proving better-sqlite3 loads under `ELECTRON_RUN_AS_NODE`.

**Files:**
- Modify: `/Users/guivinicius/projects/tarkov-operator/package.json` (add `"test"` script ONLY — no build config here; that's T2)
- Modify: `/Users/guivinicius/projects/tarkov-operator/.gitignore` (add `.omo/`, `dist/`, `qa-artifacts/`)
- Create: `/Users/guivinicius/projects/tarkov-operator/tests/smoke.test.js`
- Commit (no edits): all 15 modified `src/` files currently uncommitted

**Scenarios advanced**: enabling (unblocks everything; the harness enables spec §6 targets)

**Delegation Recommendation:**
- Category: `unspecified-high` — careful `git add -p` hunk triage across 15 files; not creative, but error-prone
- Skills: [`git-master`] — atomic-commit discipline and hunk-level staging is its core domain

**Skills Evaluation:**
- ✅ INCLUDED `git-master`: the task is 90% git surgery
- ❌ OMITTED `test-driven-development`: the harness itself is the artifact; no feature logic
- ❌ OMITTED `debugging`, `frontend`, `playwright`, all others: no overlap with git triage/harness setup

**Overlapping uncommitted changes**: This task **consumes the entire uncommitted diff**. Commit grouping (use `git add -p` where a file spans groups, i.e. `src/main.js`):
1. `fix(llm): wrap tool schemas in {type:"function"}, cache OpenAI client` — all of `src/llm.js` (interim `console.log` lines included; converted in T3)
2. `feat(settings): migrate settings.json to SQLite settings table` — `src/settings-store.js`, `src/data-store.js`, and ONLY the `main.js` hunk reordering `dataStore.init` before `settingsStore.init`
3. `fix(tts): request PCM from OpenRouter TTS and wrap into WAV` — all of `src/tts.js`
4. `feat(ui): Test Voice button with test-tts IPC` — `src/renderer/index.html`, the `test-tts` handler hunk in `src/main.js`, the `testTTS` line in `src/preload.js`, the Test-Voice + init-eager-fetch hunks in `src/renderer/app.js`
5. `chore(debug): interim debug logging, no-tools retry, per-model voice fetch (to be reworked)` — `src/agent.js`, `src/rag.js`, `src/tools/*.js`, remaining `src/main.js` hunks (console.log monkey-patch, `fetchTTSVoices` model param), remaining `preload.js`/`app.js` hunks

Nothing is reverted. Commits 1–4 are keepers verbatim; commit 5 is explicitly marked interim and is reworked by T3 (monkey-patch, agent heuristic, logging) and T12 (dead voice fetch).

**Interfaces produced**: clean tree at HEAD; `npm test` runs `node:test` under Electron's Node ABI. Consumed by: every subsequent task.

- [ ] **Step 1: Run the failing verification first** — `npm test` → expected: `npm error Missing script: "test"`. That is the RED state.
- [ ] **Step 2: Create the five atomic commits above** with `git add -p` for `src/main.js`/`preload.js`/`app.js`; verify `git status` clean after (except untracked `docs/`, `.omo/`)
- [ ] **Step 3: Add `.omo/`, `dist/`, `qa-artifacts/` to `.gitignore`**; commit `docs/superpowers/` plan+spec: `docs: phase-1 design spec and implementation plan`
- [ ] **Step 4: Add test harness** — `package.json` scripts: `"test": "ELECTRON_RUN_AS_NODE=1 npx electron --test tests/"`. Create `tests/smoke.test.js`:
  ```js
  const { test } = require("node:test");
  const assert = require("node:assert");
  test("better-sqlite3 loads under the Electron ABI", () => {
    const Database = require("better-sqlite3");
    const db = new Database(":memory:");
    assert.strictEqual(db.prepare("SELECT 1 AS one").get().one, 1);
    db.close();
  });
  ```
- [ ] **Step 5: Verify GREEN** — run `npm test`; expected: `pass 1`, exit code 0. If `--test tests/` fails to glob, switch script to `--test tests/*.test.js` (record which form worked).
- [ ] **Step 6: Commit** — `chore(test): add node:test harness running under Electron ABI`

**Failing test written first**: `tests/smoke.test.js` / `"better-sqlite3 loads under the Electron ABI"` — fails before Step 4 because the script doesn't exist (`Missing script: "test"` is the honest RED for harness bootstrap).
**Verification command**: `npm test` → observable: `# pass 1`, exit 0. `git status --porcelain` → observable: empty output.

---

### Task 2: Packaged-build launch probe + core packaging config (S8 — scheduled FIRST per design)

**Description**: Prove a packaged app launches and better-sqlite3 loads inside asar — the make-or-break unknown. Add `asarUnpack` for better-sqlite3 and the `repository` field.

**Files:**
- Modify: `/Users/guivinicius/projects/tarkov-operator/package.json` — add `"repository": "github:guivinicius/tarkov-operator"`; under `"build"` add `"asarUnpack": ["node_modules/better-sqlite3/**"]`

**Scenarios advanced**: S8

**Delegation Recommendation:**
- Category: `unspecified-high` — empirical build/launch verification with interpretation of native-module load failures
- Skills: [] — none apply

**Skills Evaluation:**
- ❌ OMITTED `debugging`: only load if the probe fails; the happy path is config + launch
- ❌ OMITTED `test-driven-development`: exempt task (below)
- ❌ OMITTED all others: no domain overlap (no UI, no git complexity, no docs)

**Overlapping uncommitted changes**: none — `package.json` had no uncommitted changes.

**Interfaces produced**: a proven `build` config other tasks extend (T6 adds `mac.extendInfo`, T9 adds `files` entry, T13 adds `publish`/icons). Consumed by: T9, T13, T15.

**Failing test**: EXEMPT — packaging cannot be unit-tested (spec §6: Electron-runtime concerns are validated by scenario S8). The RED→GREEN artifact is the launch probe itself: run the probe BEFORE adding `asarUnpack` and record the outcome (pass or fail) in the commit message; then with `asarUnpack` confirm pass.

- [ ] **Step 1: Probe current state (RED or accidental green — record it)** — `npx electron-builder --mac dir` then `"dist/mac-arm64/Tarkov Operator.app/Contents/MacOS/Tarkov Operator" & sleep 10 && pgrep -f "Tarkov Operator"`; record whether the process survives and whether the settings window opens (better-sqlite3 is required at startup by `dataStore.init`, so survival == sqlite loaded)
- [ ] **Step 2: Add `asarUnpack` + `repository` to package.json**
- [ ] **Step 3: Rebuild and relaunch** — same commands; expected: PID printed after 10 s, settings window visible, no crash dialog
- [ ] **Step 4: Kill probe** — `pkill -f "Tarkov Operator"`; delete nothing (dist/ is gitignored)
- [ ] **Step 5: Commit** — `build: asarUnpack better-sqlite3, repository field; packaged launch verified (S8 probe)`

**Verification command**: `npx electron-builder --mac dir && "dist/mac-arm64/Tarkov Operator.app/Contents/MacOS/Tarkov Operator" & sleep 10 && pgrep -f "Tarkov Operator"` → observable: a PID is printed (process alive at t+10 s) AND the settings window is on screen.

---

### Task 3: Error surfacing — typed failures, logger module, tray notification, Home banner (§5.2)

**Description**: Kill the silent-failure chain. `llm.ask` throws a typed `ProviderError` instead of returning empty text; `agent.process` loses the empty-text heuristic; `main.js` pipeline catch shows a tray `Notification` and a Home-tab banner; the `console.log` monkey-patch is **converted** into a real `src/logger.js` used by all modules.

**Files:**
- Create: `/Users/guivinicius/projects/tarkov-operator/src/errors.js`
- Create: `/Users/guivinicius/projects/tarkov-operator/src/logger.js`
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/llm.js` (throw `ProviderError`; `console.log` → `logger.debug`)
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/agent.js` (delete the `toolsEnabled=false; i--` empty-text heuristic at src/agent.js:64-70 — let errors propagate; `console.log` → `logger.debug`; graceful tool fallback returns in T8)
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/main.js` (delete monkey-patch at :59-64; wire `logger.setSink`; `app.setAppUserModelId("com.tarkov-operator.desktop")`; pipeline `.catch` → `logger.error` + `new Notification({title:"Tarkov Operator", body: err.hint || err.message}).show()` + `settingsWindow.webContents.send("pipeline-error", {...})`; `enablePTT` missing-key guard at :137-141 also fires the notification + pipeline-error event with hint `"Add your API key in the Providers tab."` — S4)
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/preload.js` (add `onPipelineError(cb)` subscription)
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/renderer/index.html` (add `<div id="home-error" class="home-error hidden"></div>` inside `#tab-home`)
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/renderer/app.js` (listen `onPipelineError`, fill + unhide banner, switch styling)
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/renderer/styles.css` (`.home-error` red banner style matching dark theme)
- Create: `/Users/guivinicius/projects/tarkov-operator/tests/error-propagation.test.js`

**Scenarios advanced**: S4, S5 (spec §6 target 3)

**Delegation Recommendation:**
- Category: `ultrabrain` — cross-module error architecture with a subtle contract change (throw vs. sentinel) rippling through agent loop and pipeline; the highest-severity defect
- Skills: [`test-driven-development`] — spec §6 mandates a locked regression test for error propagation

**Skills Evaluation:**
- ✅ INCLUDED `test-driven-development`: required target #3
- ❌ OMITTED `frontend`/`visual-qa`: the banner is a trivial div; not design work
- ❌ OMITTED `debugging`: we are removing a defect already root-caused by the spec
- ❌ OMITTED all others: no overlap

**Overlapping uncommitted changes** (now committed by T1): the `[llm] api_error` catch block returning `finishReason:"error"` → **replaced** by `throw new ProviderError(...)`; the `console.log` monkey-patch at main.js → **deleted**, its function (piping module logs to the IPC Logs tab) is **converted** into `logger.setSink`; all `console.log(\`[llm]...\`)`/`[agent]` debug lines → **converted** to `logger.debug(...)` (same messages); the agent no-tools retry heuristic → **deleted** (interim behavior: a model without tool support now surfaces a visible provider error instead of silently degrading — T8 restores graceful fallback via capability detection; acceptable between waves per §5.2 "never silence").

**Interfaces produced** (consumed by T6, T7, T8, T9, T12):
- `src/errors.js`: `class ProviderError extends Error { constructor(message, { provider, status, hint }) }` — `err.name === "ProviderError"`, `err.status` (number|null), `err.hint` (user-facing remediation string, always naming the Providers tab for auth failures)
- `src/logger.js`: `setSink(fn)` where sink receives `{ level, message, time }`; `debug(msg)`, `info(msg)`, `warn(msg)`, `error(msg)`; `debug` reaches the Logs tab only when `process.env.NODE_ENV === "development"` or setting `DEBUG_LOGS` is truthy
- IPC event `"pipeline-error"` payload: `{ message, hint, time }`; preload: `onPipelineError(cb) → unsubscribe`

- [ ] **Step 1: Write the failing test** — `tests/error-propagation.test.js`:
  ```js
  test("llm.ask rejects with ProviderError carrying status and Providers-tab hint on HTTP 401", async () => {
    // node:http server responding 401 {"error":{"message":"Invalid key"}}
    await assert.rejects(
      llm.ask("radio check", { apiKey: "bad", baseURL: `http://127.0.0.1:${port}/v1`, model: "test-model" }),
      (err) => err.name === "ProviderError" && err.status === 401 && /Providers tab/i.test(err.hint)
    );
  });
  test("agent.process propagates ProviderError instead of returning empty text", async () => {
    await assert.rejects(
      agent.process("radio check", { apiKey: "bad", baseURL: `http://127.0.0.1:${port}/v1`, model: "test-model" }),
      (err) => err.name === "ProviderError"
    );
  });
  ```
- [ ] **Step 2: Run to verify RED** — `npm test` → both tests FAIL: `llm.ask` currently *resolves* `{text:"", finishReason:"error"}` (the assert.rejects itself rejects — the right reason)
- [ ] **Step 3: Implement** `src/errors.js`, `src/logger.js`; rework `llm.js` catch to map OpenAI SDK errors (`err.status`) into `ProviderError` with auth-specific hint (`status 401/403 → "Your <PROVIDER> API key was rejected. Check it in the Providers tab."`); delete agent heuristic; wire main.js sink, Notification, `pipeline-error`, missing-key guard; add renderer banner
- [ ] **Step 4: Run to verify GREEN** — `npm test` → all pass
- [ ] **Step 5: Manual spot check** — `npm start` with no key set, click Enable Operator, tap F1 → observable: macOS notification appears AND Home tab shows red banner naming the Providers tab
- [ ] **Step 6: Commit** — `fix(errors): typed ProviderError propagation, logger module, tray+Home error surfacing (S4/S5)`

**Verification command**: `npm test` → observable: `tests/error-propagation.test.js` green; plus Step 5's visible notification.

---

### Task 4: Data layer — schema versioning, extended columns, FTS5 stopword/AND query (§5.3)

**Description**: Add `SCHEMA_VERSION` drop-and-refetch versioning (preserving `settings` and `user_memory`), the new game-data columns, and a pure FTS query builder that strips stopwords and AND-joins content terms with an OR fallback.

**Files:**
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/data-store.js`
- Create: `/Users/guivinicius/projects/tarkov-operator/src/fts-query.js`
- Create: `/Users/guivinicius/projects/tarkov-operator/tests/fts-query.test.js`
- Create: `/Users/guivinicius/projects/tarkov-operator/tests/schema-version.test.js`

**Scenarios advanced**: S9 (schema survival), enabling S1–S3 (spec §6 targets 1 and 2)

**Delegation Recommendation:**
- Category: `unspecified-high` — well-specified schema/SQL work; design decisions are already locked here
- Skills: [`test-driven-development`] — spec §6 targets 1 and 2 live in this task

**Skills Evaluation:**
- ✅ INCLUDED `test-driven-development`: two mandated regression targets
- ❌ OMITTED `ast-grep`/`refactor`: single-file, hand-guided changes
- ❌ OMITTED all others: no UI, no git complexity, no browser

**Overlapping uncommitted changes**: the `settings` table + `setSetting/getSetting/getAllSettings` (committed by T1) are **preserved untouched** — the schema-reset path must drop ONLY `items/maps/quests/traders/hideout_modules` and their FTS tables, never `settings`, `user_memory`, or `meta`'s non-data keys (simplest: drop game tables, keep `meta` but delete only `last_fetch`).

**Interfaces produced** (consumed by T5, T7, T9):
- `SCHEMA_VERSION = 2` stored in `meta` under key `schema_version`; `init()` checks before `createTables()`; mismatch → drop game tables → recreate → set version
- **ItemRow** (insert + snapshot shape, camelCase in JS, snake_case columns): `{ id, name, shortName, description, category, types, basePrice, weight, avg24hPrice, lastLowPrice, sellFor /* JSON string: [{vendor, priceRUB}] */, caliber, penetrationPower, damage, armorDamage, fragmentationChance, ammoType, projectileCount, initialSpeed }` → columns `avg_24h_price INTEGER, last_low_price INTEGER, sell_for TEXT, caliber TEXT, penetration_power INTEGER, damage INTEGER, armor_damage INTEGER, fragmentation_chance REAL, ammo_type TEXT, projectile_count INTEGER, initial_speed REAL` (nullable; null for non-ammo)
- **MapRow**: `{ id, name, description, enemies, raidDuration, players, minPlayerLevel, extracts /* JSON string: [{name, faction}] */ }` → columns `players TEXT, min_player_level INTEGER, extracts TEXT`
- **QuestRow**: `{ id, name, trader, map, minPlayerLevel, kappaRequired, wikiLink, objectives /* flattened text (FTS) */, objectivesJson /* JSON string: [{type, description, maps, optional}] */, requirements /* "prereq task names, comma-joined" */ }` → columns `map TEXT, min_player_level INTEGER, kappa_required INTEGER, wiki_link TEXT, objectives_json TEXT, requirements TEXT`
- FTS tables keep current column lists (relevance columns unchanged; structured fields are queried directly, not via FTS)
- `src/fts-query.js`: `buildFtsQuery(raw) → { primary: string|null, fallback: string|null }` (primary = AND-joined quoted prefix terms after stopword strip; fallback = OR-joined same terms; null when no content terms) and exported `STOPWORDS` Set (`what is the a an are how much many for on in of to i my with does do it worth`); `fullTextSearch` tries `primary`, and if zero rows, retries with `fallback`

- [ ] **Step 1: Write failing tests** —
  `tests/fts-query.test.js`: `test("strips stopwords and AND-joins content terms")` → `buildFtsQuery("what ammo pens class 5 armor")` asserts `primary === '"ammo"* AND "pens"* AND "class"* AND "5"* AND "armor"*'` and `!primary.includes('"what"')`; `test("all-stopword query yields nulls")` → `buildFtsQuery("what is the")` → `{primary: null, fallback: null}`.
  `tests/schema-version.test.js` (temp dir via `fs.mkdtempSync`): `test("version mismatch drops and recreates game tables with new columns")` — init, insert one legacy-shaped item, close; bump simulated old version by writing `meta.schema_version = '1'`; re-init; assert `getStatus().items === 0` and `SELECT caliber FROM items` doesn't throw. `test("matching version preserves rows")`. `test("reset preserves settings and user_memory")` — set a setting + memory before mismatch, assert both survive.
- [ ] **Step 2: Run RED** — `npm test` → fts tests fail (`Cannot find module '../src/fts-query'`); schema tests fail (no `schema_version` handling, no `caliber` column)
- [ ] **Step 3: Implement** `fts-query.js`, schema constant + reset logic, new columns in `CREATE TABLE` + `insertItems/insertMaps/insertQuests`, two-pass `fullTextSearch`
- [ ] **Step 4: Run GREEN** — `npm test` all pass
- [ ] **Step 5: Commit** — `feat(data): schema versioning with drop-and-refetch, ammo/price/extract/quest columns, stopword+AND FTS queries`

**Verification command**: `npm test` → observable: `fts-query.test.js` and `schema-version.test.js` green.

---

### Task 5: tarkov.dev query extension + snapshot generation script

**Description**: Extend the GraphQL queries to the verified fields, export pure mapping functions, and add `scripts/generate-snapshot.js` that writes `data/snapshot.json`. **Must not require the live API**: mappers are tested against a committed fixture.

**Files:**
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/tarkov-dev.js`
- Create: `/Users/guivinicius/projects/tarkov-operator/scripts/generate-snapshot.js`
- Create: `/Users/guivinicius/projects/tarkov-operator/tests/tarkov-mapping.test.js`
- Create: `/Users/guivinicius/projects/tarkov-operator/tests/fixtures/graphql-nodes.json` (hand-written fixture: 1 ammo item with `properties.__typename ItemPropertiesAmmo`, 1 barter item with prices, 1 map with 2 extracts, 1 task with 2 objectives + taskRequirements)

**Scenarios advanced**: enabling S1, S2, S3, S6

**Delegation Recommendation:**
- Category: `unspecified-high` — mechanical once field names are fixed (they are, verbatim, in Global Constraints)
- Skills: [`test-driven-development`] — mapper tests lock the field contract

**Skills Evaluation:**
- ✅ INCLUDED `test-driven-development`: the mapping contract is exactly what must not drift
- ❌ OMITTED `ulw-research`/`ultimate-browsing`: schema facts are already verified; do NOT re-research
- ❌ OMITTED all others: no overlap

**Overlapping uncommitted changes**: none — `src/tarkov-dev.js` was untouched by the interrupted session.

**Interfaces produced** (consumed by T7, T9, T14): `mapItem(node) → ItemRow`, `mapMap(node) → MapRow`, `mapQuest(node) → QuestRow` (shapes from T4) exported alongside existing fetchers; `fetchAll()` unchanged signature, now returning extended rows. Snapshot file format: `{ schemaVersion: 2, fetchedAt: ISOstring, items: ItemRow[], maps: MapRow[], quests: QuestRow[], traders: [...existing shape], hideout: [...existing shape] }`. GraphQL additions verbatim: items gain `avg24hPrice lastLowPrice sellFor { vendor { name } priceRUB } properties { ... on ItemPropertiesAmmo { caliber damage armorDamage penetrationPower penetrationChance fragmentationChance ricochetChance ammoType projectileCount initialSpeed } }`; maps gain `players minPlayerLevel extracts { id name faction }`; tasks become `{ id name trader { name } map { name } minPlayerLevel kappaRequired wikiLink objectives { id type description optional maps { name } } taskRequirements { task { name } } }` (interface fields only — NO inline fragments needed; `Task` has NO `description`).

- [ ] **Step 1: Write failing test** — `tests/tarkov-mapping.test.js`: `test("mapItem extracts ammo properties and real prices")` → on the fixture ammo node assert `row.penetrationPower === 37`, `row.caliber === "Caliber556x45NATO"`, `row.avg24hPrice === 1200`, `JSON.parse(row.sellFor)[0].vendor === "Prapor"`; `test("mapMap serializes extracts with faction")`; `test("mapQuest flattens objectives and joins requirements")`
- [ ] **Step 2: Run RED** — `npm test` → fails: `mapItem is not a function`
- [ ] **Step 3: Implement** mappers + extended query strings + `generate-snapshot.js` (calls `fetchAll()`, writes `data/snapshot.json` with `schemaVersion`/`fetchedAt`, exits non-zero with a clear message on API failure — the 503 case)
- [ ] **Step 4: Run GREEN** — `npm test`
- [ ] **Step 5: Attempt one live probe (non-blocking)** — `node scripts/generate-snapshot.js`; if 503, record and move on (T14 owns the retry)
- [ ] **Step 6: Commit** — `feat(tarkov-dev): fetch ammo properties, real prices, extracts, quest linkage; snapshot generator`

**Verification command**: `npm test` → observable: `tarkov-mapping.test.js` green. Live fetch NOT required (fallback: fixture-driven tests; live snapshot deferred to T14).

---

### Task 6: Audio capture replacement + PTT redesign (§5.1, §4 — removes SoX; D2, D8)

**Description**: Replace SoX/ffmpeg with a hidden `BrowserWindow` capturing 16 kHz mono 16-bit WAV via `getUserMedia` + Web Audio, with in-renderer silence auto-stop. PTT becomes deterministic tap-to-talk: tap starts, silence (1.5 s below RMS threshold after speech) or 30 s max stops-and-processes, second tap cancels. Delete the auto-repeat inference outright.

**Files:**
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/audio-capture.js` (full rewrite; same module path)
- Create: `/Users/guivinicius/projects/tarkov-operator/src/renderer/capture.html`
- Create: `/Users/guivinicius/projects/tarkov-operator/src/renderer/capture.js`
- Create: `/Users/guivinicius/projects/tarkov-operator/src/renderer/capture-preload.js`
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/main.js` (PTT handler at :154-188 rewritten; `session.setPermissionRequestHandler` approving `permission === "media"`; `systemPreferences.askForMediaAccess("microphone")` on darwin before first capture; `check-dependency` "sox" branch → returns `{ installed: true, command: "" }` stub until T12 removes the UI)
- Modify: `/Users/guivinicius/projects/tarkov-operator/package.json` (`build.mac.extendInfo.NSMicrophoneUsageDescription: "Tarkov Operator uses the microphone for push-to-talk questions."`)

**Scenarios advanced**: S7; enabling S1–S3 (no answer without capture); D2 zero-terminal

**Delegation Recommendation:**
- Category: `ultrabrain` — the hairiest task: hidden-renderer lifecycle, Web Audio worklet, IPC audio transport, PTT state machine, per-OS permissions
- Skills: [] — no listed skill covers Electron audio; keep the agent focused on the goal

**Skills Evaluation:**
- ❌ OMITTED `test-driven-development`: task is exempt (below)
- ❌ OMITTED `frontend`: capture.html is invisible plumbing, not UI
- ❌ OMITTED `debugging`: load reactively only if the capture path misbehaves
- ❌ OMITTED all others: no overlap

**Overlapping uncommitted changes**: none in `audio-capture.js` (untouched by the interrupted session). In `main.js`, T3 has already landed; this task only rewrites the PTT block and adds permission wiring — the Test-Voice handler, init order, and logger sink from earlier commits are preserved.

**Failing test**: EXEMPT — capture requires the Electron runtime (spec §6 exempts it; S7 is the scenario artifact). Mitigation: keep `capture.js` logic in small pure functions (RMS window, silence decision, Float32→Int16 WAV encode) so a future test can target them; the RED→GREEN artifact is the S7 manual probe below, executed once before implementation (fails: SoX error on a SoX-less machine) and once after (green).

**Interfaces produced** (consumed by T12, T15): `audio-capture.js` exports `startCapture() → Promise<void>` (resolves when renderer confirms recording), `stopCapture() → void` (request stop+flush), `cancelCapture() → void` (discard), `onCaptureComplete(cb)` (cb receives WAV `Buffer`, 16 kHz/mono/16-bit — pipeline contract at main.js:69 unchanged), `onCaptureEmpty(cb)` (no speech detected — S7 path, no pipeline call). IPC channels: main→capture `"capture:start"`, `"capture:stop"`, `"capture:cancel"`; capture→main `"capture:started"`, `"capture:data"` (ArrayBuffer), `"capture:empty"`, `"capture:error"` (message). `isSoxInstalled` is deleted from exports. Constants in `capture.js`: `SILENCE_RMS = 0.01`, `SILENCE_MS = 1500`, `NO_SPEECH_MS = 5000`, `MAX_MS = 30000`.

- [ ] **Step 1: RED probe** — on the current build, note S7 behavior baseline (tap F1, silence → today it records 30 s max via timers, and on a SoX-less box hard-fails); record one line in the task log
- [ ] **Step 2: Implement capture window** — hidden `BrowserWindow` (`show:false`, dedicated preload, no nodeIntegration) created lazily on first `startCapture`, kept alive; `getUserMedia({audio:{channelCount:1, sampleRate:16000}})` + `AudioContext({sampleRate:16000})` + ScriptProcessor/AudioWorklet accumulating Int16; silence auto-stop per constants; WAV assembly in renderer; transfer via `ipcRenderer.send("capture:data", buf)`
- [ ] **Step 3: Rewrite PTT in main.js** — tap 1: `startCapture()`; renderer auto-stop delivers data → `onCaptureComplete` → pipeline; tap 2 while recording: `cancelCapture()` + log `[ptt] Cancelled`; `capture:empty` → log `[ptt] No speech detected, ignoring` and do NOT call the pipeline (S7); delete `pttTimer`/`lastPttPress`/auto-repeat logic and the 400 ms/500 ms heuristics entirely; keep the `buffer.length > 4800` guard
- [ ] **Step 4: Permissions** — `setPermissionRequestHandler` in `app.whenReady`; darwin `askForMediaAccess` before first capture; `extendInfo` in package.json
- [ ] **Step 5: Verify** — `npm start`; Enable Operator; tap F1, say "radio check", stop talking → Logs show `[capture]` with ~2 s duration and pipeline runs; tap F1 and say nothing → Logs show the no-speech line and NO `[stt]` line; tap F1 then tap again mid-speech → `[ptt] Cancelled`, no pipeline
- [ ] **Step 6: Run `npm test`** (no regressions) and **commit** — `feat(capture): SoX-free mic capture via hidden renderer, deterministic tap-to-talk with silence auto-stop (S7, D2, D8)`

**Verification command**: `npm start` + the three manual taps in Step 5 → observables: (a) spoken question reaches `[stt]` log; (b) silent tap logs no-speech and no LLM call; (c) `grep -rn "sox\|ffmpeg" src/audio-capture.js` returns nothing.

---

### Task 7: Four speech-shaped tools + data-store query helpers (§5.4, D6)

**Description**: Implement `ammo_vs_armor`, `item_value`, `quest_info`, `map_info` returning short spoken-style text with correct fields; delete `lookup-item.js`, `search-quests.js`, `get-map-info.js`. Keep `get_hideout_requirements`, `remember_fact`, `recall_fact` unchanged (D7).

**Files:**
- Create: `/Users/guivinicius/projects/tarkov-operator/src/tools/ammo-vs-armor.js`, `/Users/guivinicius/projects/tarkov-operator/src/tools/item-value.js`, `/Users/guivinicius/projects/tarkov-operator/src/tools/quest-info.js`, `/Users/guivinicius/projects/tarkov-operator/src/tools/map-info.js`
- Delete: `/Users/guivinicius/projects/tarkov-operator/src/tools/lookup-item.js`, `/Users/guivinicius/projects/tarkov-operator/src/tools/search-quests.js`, `/Users/guivinicius/projects/tarkov-operator/src/tools/get-map-info.js`
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/tools/index.js` (registry: `ammo_vs_armor`, `item_value`, `quest_info`, `map_info`, `get_hideout_requirements`, `remember_fact`, `recall_fact`)
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/data-store.js` (add query helpers; T4 landed in Wave 1)
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/tools/get-hideout-reqs.js`, `/Users/guivinicius/projects/tarkov-operator/src/tools/user-memory.js` (ONLY convert `console.log` → `logger.debug`; behavior unchanged per D7)
- Create: `/Users/guivinicius/projects/tarkov-operator/tests/tools.test.js`, `/Users/guivinicius/projects/tarkov-operator/tests/item-value.test.js`, `/Users/guivinicius/projects/tarkov-operator/tests/fixtures/seed-rows.json` (synthetic ItemRow/MapRow/QuestRow rows: M995-like ammo pen 53, LEDX-like item basePrice 18069 / avg24hPrice 950000 / sellFor Therapist 700000, Reserve-like map with extracts `[{name:"D-2",faction:"pmc"},{name:"Scav Lands",faction:"scav"}]`, one quest)

**Scenarios advanced**: S1, S2, S3, S10 (spec §6 targets 4 and 5)

**Delegation Recommendation:**
- Category: `unspecified-high` — clear contracts, moderate SQL + text shaping
- Skills: [`test-driven-development`] — two mandated regression targets

**Skills Evaluation:**
- ✅ INCLUDED `test-driven-development`: targets 4 (tool shaping) and 5 (price correctness)
- ❌ OMITTED `writing`: tool phrasing is code-adjacent, covered by tests
- ❌ OMITTED all others: no overlap

**Overlapping uncommitted changes**: the per-tool `console.log` lines (committed by T1) in the three deleted files disappear with the files; in retained tools they become `logger.debug`. Tool schema objects keep the current bare `{name, description, parameters}` shape — llm.js's committed `{type:"function", function: t.function || t}` wrapper (T1 commit 1) already handles it; do NOT change the wrapper.

**Interfaces produced** (consumed by T8 routing, T15 QA):
- data-store helpers: `getAmmoForClass(armorClass /*1-6*/, caliber /*string|null*/) → rows ordered by penetration_power DESC limit 5` (rule: `penetration_power >= armorClass*10` marks "reliable"; if none qualify return top 3 with caveat flag); `getItemValue(nameQuery) → best FTS name-match item row with prices`; `getMapWithExtracts(nameQuery) → map row with parsed extracts[]`; `getQuestInfo(nameQuery) → quest row(s) limit 2`
- Tool schemas (params): `ammo_vs_armor {armor_class: integer, caliber?: string}`; `item_value {item_name: string}`; `quest_info {quest_name: string}`; `map_info {map_name: string}`
- Output contracts (locked by tests): `item_value` NEVER emits `base_price`; states flea avg-24h and best trader sell in ₽. `ammo_vs_armor` names ammo with numeric pen values. `map_info` lists extract names with faction. All outputs: sentences, no tables, no IDs, no markdown.

- [ ] **Step 1: Write failing tests** — `tests/item-value.test.js`: seed temp DB from `seed-rows.json`; `test("item_value reports flea and trader price, never basePrice")` → output matches `/950[, ]?000/` and `/700[, ]?000/` and does NOT match `/18[, ]?069/`. `tests/tools.test.js`: `test("ammo_vs_armor names ammo with pen values for class 5")` → matches `/pen(etration)? 53/i` and the ammo name; `test("map_info lists extracts with faction")` → matches `/D-2/` and `/scav/i`; `test("quest_info includes objectives and map")`; `test("registry exposes exactly the seven phase-1 tools")`.
- [ ] **Step 2: Run RED** — `npm test` → module-not-found / registry mismatch failures
- [ ] **Step 3: Implement** helpers + four tools + registry + logger conversion in retained tools
- [ ] **Step 4: Run GREEN** — `npm test`
- [ ] **Step 5: Commit** — `feat(tools): ammo_vs_armor, item_value, quest_info, map_info speech-shaped tools; retire base_price answers (S1-S3)`

**Verification command**: `npm test` → observable: `tools.test.js` + `item-value.test.js` green; `ls src/tools/` shows the new files and not the deleted ones.

---

### Task 8: Retrieval routing — tools XOR RAG + upfront capability detection (§5.3, §5.2)

**Description**: When the selected model supports tools (OpenRouter `supported_parameters` contains `"tools"`), tools are the ONLY retrieval path and blanket RAG injection is disabled; RAG remains solely the fallback for models without tool support (local/Ollama or caps=false). Restores graceful no-tools degradation deleted in T3 — now capability-driven, not failure-inferred.

**Files:**
- Create: `/Users/guivinicius/projects/tarkov-operator/src/model-caps.js`
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/agent.js`
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/rag.js` (`console.log` → `logger.debug`; no behavior change)
- Create: `/Users/guivinicius/projects/tarkov-operator/tests/retrieval-routing.test.js`
- Create: `/Users/guivinicius/projects/tarkov-operator/tests/fixtures/openrouter-models.json` (trimmed /models list: one entry with `"tools"` in `supported_parameters`, one without)

**Scenarios advanced**: enabling S1–S3 (single retrieval source), S5 (auth failures no longer masked as "no tool support")

**Delegation Recommendation:**
- Category: `unspecified-high` — clear decision table, small surface
- Skills: [`test-driven-development`] — routing decisions are pure-function testable

**Skills Evaluation:**
- ✅ INCLUDED `test-driven-development`: pure routing/caps functions are ideal units
- ❌ OMITTED all others: no UI, no git, no docs overlap

**Overlapping uncommitted changes**: the committed interim agent shape (T1 commit 5, already reworked by T3) is edited again here — `[agent] rag_injected` debug lines survive as `logger.debug`; the memory-profile injection is preserved verbatim (D7).

**Interfaces produced** (consumed by T15):
- `src/model-caps.js`: `async supportsTools({ provider, apiKey, baseURL, model }) → true | false | null` (null = unknown → optimistically use tools); OpenRouter: fetch `${baseURL}/models` once, cache in-module for 1 h, look up `model` id's `supported_parameters`; non-OpenRouter providers → null; fetch failure → null (never throws). Also export pure `supportsToolsFromList(modelsArray, modelId)` for tests.
- agent decision (pure, exported for tests): `chooseRetrieval(caps) → "tools" | "rag"` — `false → "rag"`, `true/null → "tools"`. When `"tools"`: `systemPromptAppend` contains memory profile ONLY (no `[GAME DATA CONTEXT]`), `llmOpts.tools` set. When `"rag"`: RAG context + memory profile injected, tools limited to `MEMORY_TOOLS` (existing local branch behavior preserved).

- [ ] **Step 1: Write failing tests** — `tests/retrieval-routing.test.js`: `test("supportsToolsFromList reads supported_parameters")` (true/false cases from fixture); `test("chooseRetrieval: tools-capable model gets tools and no RAG")` → `chooseRetrieval(true) === "tools"`; `test("chooseRetrieval: incapable model falls back to RAG")`; `test("unknown capability defaults to tools")` → `chooseRetrieval(null) === "tools"`
- [ ] **Step 2: Run RED** — module not found
- [ ] **Step 3: Implement** model-caps + agent wiring + rag logger conversion
- [ ] **Step 4: Run GREEN** — `npm test` (error-propagation tests from T3 must still pass — auth errors still throw)
- [ ] **Step 5: Commit** — `feat(agent): capability-driven tool routing; RAG only as no-tools fallback (never both)`

**Verification command**: `npm test` → observable: `retrieval-routing.test.js` green AND `error-propagation.test.js` still green.

---

### Task 9: Bundled snapshot loading + app lifecycle close (§5.3, S6)

**Description**: Ship `data/snapshot.json` in the package; on startup with an empty (or freshly version-reset) DB, seed from the bundled snapshot before any network call; live fetch becomes a background upgrade. Call `dataStore.close()` on quit.

**Files:**
- Create: `/Users/guivinicius/projects/tarkov-operator/data/snapshot.json` (INTERIM: generated from `tests/fixtures/seed-rows.json` shapes via a one-off local run of the seeding path — clearly marked `"fetchedAt": "FIXTURE"`; replaced with real data in T14)
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/data-store.js` (add `seedFromSnapshot(parsedSnapshot, opts = { force: false })` — **the populated-DB guard lives HERE, not in main.js**: if `getStatus().items > 0 && !opts.force` return `{ skipped: true }` immediately; otherwise reuse the T4 insert functions, set `meta.last_fetch = snapshot.fetchedAt` and `meta.data_source = "snapshot"`, and return `{ skipped: false, items, maps, quests, traders, hideout }` counts)
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/main.js` (in `app.whenReady`: after `dataStore.init`, read `path.join(__dirname, "..", "data", "snapshot.json")` (fs reads work inside asar) and call `seedFromSnapshot(snapshot)` **unconditionally** — it self-guards and returns `{skipped:true}` on a populated DB; log which branch ran; keep the existing stale-refresh background fetch unchanged; add `dataStore.close()` in `before-quit`)
- Modify: `/Users/guivinicius/projects/tarkov-operator/package.json` (`build.files` gains `"data/**/*"`)
- Create: `/Users/guivinicius/projects/tarkov-operator/tests/snapshot-seed.test.js`

**Scenarios advanced**: S6, S9 (clean close), S8 (asar file access re-verified)

**Delegation Recommendation:**
- Category: `unspecified-high` — startup-order logic with asar path subtlety
- Skills: [`test-driven-development`] — seeding is unit-testable

**Skills Evaluation:**
- ✅ INCLUDED `test-driven-development`: seed path test locks S6's foundation
- ❌ OMITTED all others: no overlap

**Overlapping uncommitted changes**: none remaining — main.js hunks were settled in T1/T3/T6; this task only adds the seeding block and `before-quit` close (fixing defect D5 from the intel dossier).

**Interfaces produced** (consumed by T14, T15): `seedFromSnapshot(snapshot)`; snapshot format from T5. **Snapshot independence guarantee**: the loading path and its test consume only the committed file/fixture — no network.

- [ ] **Step 1: Write failing test** — `tests/snapshot-seed.test.js`, three tests with non-overlapping contracts:
  1. `test("seedFromSnapshot populates all tables and stamps meta")` — init temp DB, seed fixture A, assert `getStatus().items === fixtureA.items.length` and `getMeta("data_source") === "snapshot"`, and returned `{skipped:false}`
  2. `test("seedFromSnapshot skips a populated database")` — seed fixture A, then call with fixture B (different item count); assert return `{skipped:true}` AND `getStatus().items === fixtureA.items.length` (B was NOT applied)
  3. `test("force:true replaces existing data")` — after fixture A, call with fixture B and `{force:true}`; assert `getStatus().items === fixtureB.items.length` (replacement semantics, explicitly opted into)
- [ ] **Step 2: Run RED** — `seedFromSnapshot is not a function`
- [ ] **Step 3: Implement** seed function + main.js wiring + `before-quit` close + `files` entry + interim `data/snapshot.json`
- [ ] **Step 4: Run GREEN** — `npm test`; then packaged re-probe: `npx electron-builder --mac dir`, delete `~/Library/Application Support/Tarkov Operator/tarkov-data.db*`, launch the packaged binary with Wi-Fi OFF → Data tab shows non-zero item count
- [ ] **Step 5: Commit** — `feat(data): bundled snapshot seeds fresh installs offline; close DB on quit (S6)`

**Verification command**: `npm test` green, PLUS: turn network off → launch packaged app with fresh userData → observable: Data tab item count > 0 and Logs show a snapshot-seed line, zero fetch errors blocking startup.

---

### Task 10: App icon asset

**Description**: Generate a 1024×1024 `build/icon.png` (dark navy `#1a1a2e` field, green `#3fae6a`-family radar/crosshair motif matching the app's theme) via a dependency-free Node script (pure `zlib` PNG writer). electron-builder auto-derives icns/ico from `build/icon.png`; explicit config wiring happens in T13.

**Files:**
- Create: `/Users/guivinicius/projects/tarkov-operator/scripts/generate-icon.js`
- Create: `/Users/guivinicius/projects/tarkov-operator/build/icon.png` (committed artifact)

**Scenarios advanced**: enabling S8/S11 (public-launch presentability — intel A2)

**Delegation Recommendation:**
- Category: `visual-engineering` — this is a visual/brand asset; domain-honest routing
- Skills: [`visual-qa`] — the deliverable is judged by looking at it

**Skills Evaluation:**
- ✅ INCLUDED `visual-qa`: verify the rendered icon at 16px–1024px sizes
- ❌ OMITTED `frontend`: no DOM/CSS work
- ❌ OMITTED `test-driven-development`: visual asset, exempt

**Overlapping uncommitted changes**: none.

**Failing test**: EXEMPT — visual asset; binary check is file validity: `node -e "const b=require('fs').readFileSync('build/icon.png'); if(b.readUInt32BE(16)!==1024) process.exit(1)"` (width field of IHDR = 1024).

**Interfaces produced**: `build/icon.png` at the electron-builder default discovery path. Consumed by T13.

- [ ] **Step 1: RED check** — `test -f build/icon.png; echo $?` → `1`
- [ ] **Step 2: Implement** `scripts/generate-icon.js` (pure Node: RGBA pixel buffer, simple geometric motif — circle ring + crosshair + center dot, anti-aliased by supersampling; zlib deflate into valid PNG chunks) and run it
- [ ] **Step 3: Verify** — the IHDR width check above exits 0; `open build/icon.png` and visually confirm it reads at 16 px (tray-scale) and 512 px
- [ ] **Step 4: Commit** — `feat(brand): app icon + dependency-free generator`

**Verification command**: `node scripts/generate-icon.js && node -e "const b=require('fs').readFileSync('build/icon.png'); process.exit(b.readUInt32BE(16)===1024?0:1)"` → observable: exit 0.

---

### Task 11: README + AGENTS.md rewrite for public launch

**Description**: Rewrite install/usage docs for the zero-terminal, SoX-free reality: download from Releases, Windows SmartScreen "More info → Run anyway", macOS right-click → Open (unsigned per D3), one OpenRouter key, tap-to-talk model, correct 8-tab description, `npm test` documented. Fix AGENTS.md drift (settings now SQLite, no SoX, test command, tools list).

**Files:**
- Modify: `/Users/guivinicius/projects/tarkov-operator/README.md`
- Modify: `/Users/guivinicius/projects/tarkov-operator/AGENTS.md`

**Scenarios advanced**: enabling (D4 — the repo is the trust signal)

**Delegation Recommendation:**
- Category: `writing` — prose/documentation
- Skills: [] — content sources are this plan + spec; no research needed

**Skills Evaluation:**
- ❌ OMITTED `test-driven-development`: prose, exempt
- ❌ OMITTED `find-skills`, `ulw-research`: all facts are in-repo
- ❌ OMITTED all others: no overlap

**Overlapping uncommitted changes**: none (docs untouched by the session).

**Failing test**: EXEMPT — prose. Binary check: `grep -i "sox" README.md AGENTS.md` must return only a historical/uninstall note or nothing.

- [ ] **Step 1: Rewrite README** — sections: What it is (30-second pitch), Download (Releases link + unsigned-app walkthrough per platform with exact click labels), Setup (paste OpenRouter key → validate → pick PTT key), Talk (tap, speak, silence stops; tap again cancels), the four question classes with example phrasings, Build from source, Testing, License
- [ ] **Step 2: Update AGENTS.md** — remove SoX gotcha; settings = SQLite `settings` table (JSON auto-migrated); add `npm test` row; update tool list (`ammo_vs_armor`, `item_value`, `quest_info`, `map_info`, hideout, memory); note snapshot seeding; 8 tabs
- [ ] **Step 3: Verify** — `grep -ci "sox" README.md` → 0 (or only in a "no longer required" line); every command in README copy-paste runs
- [ ] **Step 4: Commit** — `docs: public-launch README and AGENTS.md refresh (no SoX, tap-to-talk, snapshot)`

**Verification command**: `grep -i "brew install sox\|choco install sox" README.md AGENTS.md` → observable: no output.

---

### Task 12: Onboarding — first-run guidance, key validation, dead-control removal (§5.5, §5.7)

**Description**: First-run Home state walks key entry; per-provider "Validate" buttons hit a real endpoint with visible pass/fail; PTT key picker is already present (keep). Remove dead controls: the per-model OpenRouter voice fetch (404 endpoint), the `supported_voices` path, and the SoX System-tab block. Default provider stack per §5.7: LLM=OpenRouter, STT=OpenRouter, TTS=local (audio works with zero keys). Fix Test-Voice showing "Done" regardless of `{error}`.

**Files:**
- Create: `/Users/guivinicius/projects/tarkov-operator/src/key-validator.js`
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/main.js` (add `ipcMain.handle("validate-key", ...)` delegating to key-validator; in `fetchTTSVoices` delete the `/api/v1/models/{id}` call and the `model` param — return the hardcoded 9-voice list for openrouter; delete the `check-dependency` sox stub handler left by T6)
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/preload.js` (add `validateKey(provider, apiKey)`; revert `fetchVoices` to 2-arg)
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/renderer/index.html` (Validate button + status span beside each key input; first-run checklist block on Home; remove the SoX/System dependency block; update the "For best quality" copy to the §5.7 stack)
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/renderer/app.js` (validate-click handlers rendering pass/fail; remove `checkSox()` and its init call; drop the `model` arg from `fetchAndPopulateVoices`; Test-Voice renders `Error: <msg>` from `{error}` instead of unconditional "Done")
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/renderer/styles.css` (`.validate-ok` green / `.validate-fail` red, first-run checklist styles on the existing dark theme)
- Modify: `/Users/guivinicius/projects/tarkov-operator/src/settings-store.js` (defaults: `STT_PROVIDER: "openrouter"`, `STT_MODEL: "openai/whisper-1"`; `TTS_PROVIDER` stays `"local"`)
- Create: `/Users/guivinicius/projects/tarkov-operator/tests/validate-key.test.js`

**Scenarios advanced**: S4, S5; §5.5, §5.7

**Delegation Recommendation:**
- Category: `visual-engineering` — predominantly renderer UI/UX with small main-process plumbing
- Skills: [`test-driven-development`, `visual-qa`]

**Skills Evaluation:**
- INCLUDED `test-driven-development`: the validator is a unit-testable HTTP contract
- INCLUDED `visual-qa`: pass/fail states and first-run checklist must be visually verified against the dark theme
- OMITTED `frontend` (full skill): scope is additive controls on an existing cohesive theme, not a redesign
- OMITTED all others: no git/docs/browser overlap

**Overlapping uncommitted changes** (committed by T1 commit 5, now reworked): the per-model voice fetch (`fetchTTSVoices` model param, 3-arg preload `fetchVoices`, app.js passing `ttsModel.value`) is **removed** — it calls a verified-dead endpoint (`GET /models/{id}` → 404) and `supported_voices` is empty for all 367 models; the hardcoded voice list is **kept**. The Test-Voice button (T1 commit 4) is **preserved**, with its error handling fixed. The eager model/voice fetch on `DOMContentLoaded` (T1 commit 4) is **kept** but gated: with no key stored, dropdowns show `"Add a key in Providers first"` instead of a silent "(none)".

**Interfaces produced** (consumed by T15):
- `src/key-validator.js`: `async validate(provider, apiKey, baseURLOverride?) → { ok: boolean, status: number|null, message: string }`. Endpoints: openrouter `GET https://openrouter.ai/api/v1/key` with `Authorization: Bearer` (verify empirically with a bogus key expecting 401 — if it 404s, fall back to `POST /api/v1/chat/completions` with `max_tokens: 1`, treating 401/403 as invalid); openai `GET https://api.openai.com/v1/models`; anthropic `GET https://api.anthropic.com/v1/models` with `x-api-key` + `anthropic-version`; elevenlabs `GET https://api.elevenlabs.io/v1/user` with `xi-api-key`. `baseURLOverride` exists solely so tests can point at a local server.
- IPC: `validate-key(provider, apiKey) → {ok, status, message}`; preload `validateKey(...)`.

- [ ] **Step 1: Write failing test** — `tests/validate-key.test.js`: local `node:http` server; `test("validate returns ok:false with status 401 on rejected key")` → `validate("openrouter", "bad", localBase)` → `{ok:false, status:401}`; `test("validate returns ok:true on 200")`; `test("network failure yields ok:false with human message, never throws")`
- [ ] **Step 2: Run RED** — `npm test` → `Cannot find module '../src/key-validator'`
- [ ] **Step 3: Implement** key-validator + IPC + preload; empirically confirm the OpenRouter endpoint with `curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer bogus" https://openrouter.ai/api/v1/key` (expect 401; record result)
- [ ] **Step 4: Build the UI** — Validate buttons, pass/fail rendering, first-run Home checklist (shown when `OPENROUTER_API_KEY` is empty: "1. Paste your OpenRouter key in Providers → 2. Validate → 3. Enable Operator → 4. Tap F1 and ask"), remove SoX block + `checkSox`, revert voice-fetch plumbing, fix Test-Voice error path, update settings defaults
- [ ] **Step 5: Run GREEN + visual check** — `npm test` all green; `npm run dev` → observable: fresh userData shows the checklist; a bogus key shows a red x with message; deleting the key restores the checklist
- [ ] **Step 6: Commit** — `feat(onboarding): first-run checklist, real key validation, remove dead voice fetch and SoX UI (S4/S5, §5.5, §5.7)`

**Failing test written first**: `tests/validate-key.test.js` / `"validate returns ok:false with status 401 on rejected key"` — fails with module-not-found, the right reason.
**Verification command**: `npm test` green, PLUS `npm run dev` with empty settings → observable: Home shows the 4-step checklist and Providers Validate renders a red x for a bogus key.

---

### Task 13: CI publish + icon wiring (§5.6, S11)

**Description**: Make a tag push actually produce downloadable artifacts: add `--publish always`, `build.publish` GitHub config, explicit icon wiring to T10's asset, and a CI test step so regressions cannot ship.

**Files:**
- Modify: `/Users/guivinicius/projects/tarkov-operator/.github/workflows/release.yml` (add `Run tests` step `ELECTRON_RUN_AS_NODE=1 npx electron --test tests/` with `shell: bash` on both matrix OSes, after `@electron/rebuild`; change build steps to `npm run build:mac -- --publish always` / `npm run build:win -- --publish always`; keep `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`)
- Modify: `/Users/guivinicius/projects/tarkov-operator/package.json` (`build.publish: [{ "provider": "github", "owner": "guivinicius", "repo": "tarkov-operator" }]`; `build.mac.icon: "build/icon.png"`; `build.win.icon: "build/icon.png"`)

**Scenarios advanced**: S11

**Delegation Recommendation:**
- Category: `quick` — two small, fully-specified config edits
- Skills: []

**Skills Evaluation:**
- OMITTED `test-driven-development`: CI YAML is exempt; the CI test step it adds *runs* the suite
- OMITTED `git-master`: plain single commit
- OMITTED all others: no overlap

**Overlapping uncommitted changes**: none — neither file had uncommitted changes.

**Interfaces produced** (consumed by T15/T16): a tag push `v*.*.*` runs tests, builds both platforms, uploads `.dmg` + `.exe` to a GitHub Release. Consumes T2's `build` config and T10's `build/icon.png`.

**Failing test**: EXEMPT — CI configuration cannot be unit-tested locally; the RED→GREEN artifact is S11 itself (pre-change: tag pushes produce zero artifacts, a verified fact; post-change: T16's tag produces a Release with files).

- [ ] **Step 1: Edit release.yml** — test step + `--publish always`
- [ ] **Step 2: Edit package.json** — publish block + icon paths
- [ ] **Step 3: Local sanity** — `npx electron-builder --mac dir` → observable: no config-schema errors, builder log references `build/icon.png`; packaged `.app` shows the custom icon in Finder
- [ ] **Step 4: Optional pre-release rehearsal** — `gh workflow run release.yml` → observable: both matrix jobs green
- [ ] **Step 5: Commit** — `ci: publish artifacts to GitHub Releases on tag push; run tests in CI; wire app icon (S11)`

**Verification command**: `npx electron-builder --mac dir 2>&1 | grep -i icon` → observable: a line naming `build/icon.png`; final S11 proof deferred to T16.

---

### Task 14: Real snapshot generation (S6 data gate)

**Description**: Run T5's `scripts/generate-snapshot.js` against the live tarkov.dev API (503 during design) and commit the real `data/snapshot.json`, replacing the fixture-derived interim. The ONLY task requiring the live API; it gates the release tag, nothing else.

**Files:**
- Modify (regenerate): `/Users/guivinicius/projects/tarkov-operator/data/snapshot.json`

**Scenarios advanced**: S6, S1–S3 (real data quality)

**Delegation Recommendation:**
- Category: `quick` — run one script, sanity-check output, commit
- Skills: []

**Skills Evaluation:**
- OMITTED `test-driven-development`: the loading path is already test-locked (T9); this is data refresh
- OMITTED `ultimate-browsing`: a plain GraphQL POST; no bypass exists for a 503 origin
- OMITTED all others: no overlap

**Overlapping uncommitted changes**: none.

**Interfaces produced**: production `data/snapshot.json` (T5 format, `fetchedAt` = real ISO timestamp). Consumed by T15 (S6) and the shipped package.

**Failing test**: EXEMPT — network-dependent data generation; pipeline correctness is locked by `tarkov-mapping.test.js` (T5) and `snapshot-seed.test.js` (T9).

- [ ] **Step 1: Probe API** — `curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{"query":"{ maps { id } }"}' https://api.tarkov.dev/graphql` → need `200`
- [ ] **Step 2: If 503** — retry at the start of each subsequent work session (max 1 probe/hour). Fallback policy: ALL other tasks including T15 proceed (S6 QA'd against the committed snapshot, marked provisional); **T16's tag push is BLOCKED** until a real snapshot lands — a public launch answering from fixture data is not shippable
- [ ] **Step 3: Generate** — `node scripts/generate-snapshot.js`
- [ ] **Step 4: Sanity gate** — `node -e "const s=require('./data/snapshot.json'); const ammo=s.items.filter(i=>i.penetrationPower!=null); const priced=s.items.filter(i=>i.avg24hPrice>0); const ext=s.maps.filter(m=>JSON.parse(m.extracts||'[]').length>0); console.log(s.items.length, ammo.length, priced.length, ext.length, s.quests.length); process.exit(s.items.length>2000 && ammo.length>100 && priced.length>500 && ext.length>8 && s.quests.length>200 ? 0 : 1)"` → exit 0
- [ ] **Step 5: Re-run suite** — `npm test`
- [ ] **Step 6: Commit** — `data: real tarkov.dev snapshot <fetchedAt date> (S6)`

**Verification command**: the Step 4 one-liner → observable: exit 0 with counts (items>2000, ammo>100, priced>500, extract-maps>8, quests>200).

---

### Task 15: Manual QA — full S1–S11 walkthrough on the packaged app

**Description**: Execute every spec §7 scenario against the **packaged binary** (not `npm start`), capturing an artifact per scenario into `qa-artifacts/` (gitignored since T1). Any failure loops back to the owning task's continuation session before re-running.

**Files:**
- Create (transient, gitignored): `/Users/guivinicius/projects/tarkov-operator/qa-artifacts/S1.png … S11.txt`

**Scenarios advanced**: S1–S11 (all)

**Delegation Recommendation:**
- Category: `unspecified-high` — disciplined manual execution with evidence capture; requires human-in-the-loop for spoken input and a real OpenRouter key
- Skills: [`verification-before-completion`]

**Skills Evaluation:**
- INCLUDED `verification-before-completion`: the entire task is evidence-before-claims
- OMITTED `playwright`/`visual-qa`: desktop tray app QA, not browser; screenshots are evidence, not pixel-diff work
- OMITTED `debugging`: load only in the failure loop-back, inside the owning task's session
- OMITTED all others: no overlap

**Overlapping uncommitted changes**: none — clean tree is a precondition (`git status --porcelain` empty).

**Preconditions**: `npm test` fully green; `npx electron-builder --mac dir`; `APP="dist/mac-arm64/Tarkov Operator.app/Contents/MacOS/Tarkov Operator"`; `USERDATA="$HOME/Library/Application Support/Tarkov Operator"`. A real OpenRouter key is required for S1–S3/S5/S10, supplied live by the user and never written into the repo.

**Failing test**: EXEMPT — this IS the scenario-contract validation layer spec §6 designates for Electron-runtime behavior.

- [ ] **S4 (run FIRST — needs the no-key state)**: `rm -rf "$USERDATA"` → launch `"$APP"` → click tray → Settings opens → click **Enable Operator** → press **F1** once. PASS = macOS notification appears AND Home shows a red banner containing "Providers tab". Capture `screencapture -x qa-artifacts/S4.png`. FAIL = silence → loop back to T3.
- [ ] **Onboarding interlude**: confirm the first-run checklist is visible on Home; paste the real OpenRouter key into **Providers → OpenRouter**, click **Validate**. PASS = green check. → `qa-artifacts/S4-validate.png`
- [ ] **S5**: replace the key with `sk-or-v1-invalid0000`, Enable Operator, tap **F1**, speak: **"What's a LEDX worth?"**. PASS = notification + Home banner naming an auth failure (401), NOT silence; Logs show a `ProviderError` line. → `qa-artifacts/S5.txt`. Restore the real key and re-Validate.
- [ ] **S8**: `pkill -f "Tarkov Operator"; "$APP" & sleep 10; pgrep -f "Tarkov Operator"`. PASS = PID printed, settings window opened, `ls "$USERDATA/tarkov-data.db"` exists. → `qa-artifacts/S8.txt`
- [ ] **S6**: quit; `rm -rf "$USERDATA"`. Block ONLY tarkov.dev, keeping OpenRouter reachable — STT and LLM are both cloud, so a full network shutdown would make this scenario impossible to pass:
  `sudo sh -c 'printf "\n127.0.0.1 api.tarkov.dev\n" >> /etc/hosts'` then `sudo dscacheutil -flushcache`
  Confirm the block: `curl -s -o /dev/null -w "%{http_code}" --max-time 5 -X POST https://api.tarkov.dev/graphql` → expect `000`/connection-refused, NOT 200.
  Confirm OpenRouter still reachable: `curl -s -o /dev/null -w "%{http_code}" https://openrouter.ai/api/v1/models` → expect `200`.
  Launch `"$APP"`, open **Data** tab. PASS = item count > 0 sourced from the bundled snapshot with tarkov.dev unreachable; then re-run the S1 spoken question and the answer must still be correct (proving answers come from the snapshot, not a live fetch).
  **Revert (mandatory):** `sudo sed -i '' '/api\.tarkov\.dev/d' /etc/hosts && sudo dscacheutil -flushcache`, then re-confirm `curl` to api.tarkov.dev no longer resolves to 127.0.0.1. → `qa-artifacts/S6.png` + `qa-artifacts/S6.txt` (both curl outputs). (If T14 was blocked, mark "provisional pass" — release stays blocked.)
- [ ] **S1**: Enable Operator, tap **F1**, speak: **"What ammo penetrates class five armor?"** PASS = spoken answer names at least one real ammo (M995 / M61 / BS) with a numeric penetration value AND Logs show `ammo_vs_armor` invoked. → `qa-artifacts/S1.txt`
- [ ] **S2**: tap **F1**, speak: **"What's a LEDX worth?"** PASS = spoken answer states a flea/trader rouble figure; logged `item_value` output contains the `avg24hPrice`-derived number and NOT basePrice phrasing. → `qa-artifacts/S2.txt`
- [ ] **S3**: tap **F1**, speak: **"Which extracts are on Reserve?"** PASS = spoken answer lists real extract names (e.g. D-2) with faction wording; Logs show `map_info`. → `qa-artifacts/S3.txt`
- [ ] **S7**: tap **F1**, say **nothing**, wait 6 s. PASS = Logs show the no-speech line, NO `[stt]` call, no crash, next tap still works. → `qa-artifacts/S7.txt`
- [ ] **S9**: change **PTT key** to `F2` and **TTS voice** to a non-default; Quit via tray; relaunch. PASS = both persist, Data counts unchanged, no schema-reset line in Logs. → `qa-artifacts/S9.png`
- [ ] **S10**: tap **F2**, speak: **"Remember that my PMC level is forty-two."** then **"What level is my PMC?"** then **"What do I need for Lavatory level two?"** PASS = Logs show `remember_fact`, `recall_fact`, `get_hideout_requirements` and answers reflect the stored fact. → `qa-artifacts/S10.txt`
- [ ] **S11 (dry run here)**: `gh workflow run release.yml && gh run watch`. PASS = both matrix jobs green including the test step. → `qa-artifacts/S11-dryrun.txt`
- [ ] **Failure protocol**: any FAIL → reopen the owning task via `task_id`, fix, re-run `npm test`, rebuild, re-run ONLY the failed scenario plus S8
- [ ] **Sign-off**: all artifacts exist; write a PASS/FAIL index to `qa-artifacts/INDEX.txt`

**Verification command**: `ls qa-artifacts/ | wc -l` → observable: >= 12 files, and INDEX.txt contains 11 `PASS` lines (S6 may read `PASS-provisional` only if T14 is blocked, which blocks T16).

---

### Task 16: Cleanup, teardown, version bump, release tag (S11 final proof)

**Description**: Tear down all QA residue, settle the debug-logging disposition, bump the version, push the tag, and confirm a downloadable artifact appears on the Release — completing S11.

**Files:**
- Delete: `/Users/guivinicius/projects/tarkov-operator/qa-artifacts/`, `/Users/guivinicius/projects/tarkov-operator/dist/`
- Modify: `/Users/guivinicius/projects/tarkov-operator/package.json` (`"version": "0.2.0"`)

**Scenarios advanced**: S11

**Delegation Recommendation:**
- Category: `quick` — mechanical teardown + one tag
- Skills: [`git-master`]

**Skills Evaluation:**
- INCLUDED `git-master`: tag hygiene and final history review
- OMITTED `test-driven-development`: ops task; the final `npm test` run is the gate
- OMITTED all others: no overlap

**Overlapping uncommitted changes**: none possible — precondition is a clean tree.

**Interfaces consumed**: T13's publish pipeline, T14's real snapshot (hard gate: if `fetchedAt` is `"FIXTURE"` or T15's INDEX has `PASS-provisional`, STOP — do not tag).

**Failing test**: EXEMPT — teardown/release ops; the S11 release-page check is the binary artifact.

- [ ] **Step 1: Process teardown** — `pkill -f "Tarkov Operator" || true`; verify `pgrep -f "Tarkov Operator"` prints nothing
- [ ] **Step 2: Artifact teardown** — `rm -rf qa-artifacts/ dist/`; `rm -f "$TMPDIR"/tarkov-tts-* "$TMPDIR"/tarkov-stt-* "$TMPDIR"/tarkov-op-*`; `rm -rf "$HOME/Library/Application Support/Tarkov Operator"`; `git grep -n "sk-or-v1-invalid" || true` → no output
- [ ] **Step 3: Debug-logging final disposition (verify, don't re-implement)** — `grep -n "console.log = function" src/main.js` → no output (monkey-patch gone); `grep -rn "console\.log(" src/ | grep -v renderer/capture` → no output in main-process modules; `logger.debug` lines remain permanently but surface only under `NODE_ENV=development` or the `DEBUG_LOGS` setting — this IS the shipped diagnostic layer, per the convert-don't-delete mandate
- [ ] **Step 4: Final gates** — `npm test` green; `git status --porcelain` empty; `node -e "process.exit(require('./data/snapshot.json').fetchedAt==='FIXTURE'?1:0)"` exits 0; `git log --oneline -20` reviewed
- [ ] **Step 5: Version bump** — `0.2.0`; commit `release: v0.2.0`
- [ ] **Step 6: Tag and push** — **the only remote in this repo is `y`, NOT `origin`** (verified: `git remote -v` → `y git@github.com:guivinicius/tarkov-operator.git`; upstream is `y/main`). Resolve it rather than hardcoding:
  `REMOTE=$(git remote | head -1)` and assert it is non-empty, then `git push "$REMOTE" main && git tag v0.2.0 && git push "$REMOTE" v0.2.0`
- [ ] **Step 7: S11 proof** — `gh run watch`, then `gh release view v0.2.0 --json assets -q '.assets[].name'` → PASS = lists at least one `.dmg` AND one `.exe`
- [ ] **Step 8: Post-release smoke** — download the mac `.dmg` from the Release page (not the local build), mount, right-click → Open → launches per the README unsigned flow

**Verification command**: `gh release view v0.2.0 --json assets -q '.assets[].name'` → observable: non-empty list containing one `.dmg` and one `.exe`.

---

## Success Criteria

- All 5 spec-§6 test targets locked by failing-first tests: FTS query construction (T4), schema migration (T4), error propagation (T3), tool output shaping (T7), price correctness (T7) — `npm test` green locally and in CI.
- All 11 scenarios S1–S11 pass with captured artifacts (T15), and the S11 Release exists with downloadable `.dmg` + `.exe` (T16).
- Zero references to SoX/ffmpeg in `src/`; zero `console.log` in main-process modules; no silent-failure path from a bad or missing API key.
- `git status --porcelain` empty at the end of every task; every task produces at least one atomic conventional commit.

## Assumptions

1. **Test execution ABI**: `ELECTRON_RUN_AS_NODE=1 npx electron --test tests/` is the `npm test` mechanism (better-sqlite3 is Electron-ABI-compiled). Verified in T1 Step 5, with a documented fallback.
2. **FTS strategy**: AND-join content terms with an OR-join fallback on zero rows; avoids the zero-result cliff on noisy spoken tokens.
3. **Ammo-vs-armor rule**: `penetrationPower >= armor_class × 10` marks reliable penetration (community heuristic); when nothing qualifies, return the best available with an explicit caveat.
4. **Quest scope**: interface-only `TaskObjective` fields + `taskRequirements.task.name`; no inline fragments. Per-objective item fragments deferred (unverified subfields).
5. **OpenRouter key validation**: `GET /api/v1/key` assumed to 401 on bad keys; verified with a bogus key during T12, with a chat-completions fallback.
6. **Default STT model id**: `openai/whisper-1` on OpenRouter — unverifiable without a key; T15 validates live and T12 may substitute the id the models endpoint actually lists.
7. **Schema reset scope**: wipes ONLY game-data tables; `settings` and `user_memory` always survive.
8. **Second-tap semantics**: cancels and discards the recording, per spec §4 "tap again to cancel early".
9. **Icon**: dependency-free generated geometric mark (dark navy + green crosshair); electron-builder derives icns/ico from `build/icon.png`.
10. **Version**: public launch ships as `v0.2.0`, not 1.0.
11. **Windows validation**: no Windows dev machine assumed; Windows behavior proven via the CI-built `.exe` (S11). First Windows-native full QA rides the first public download or a follow-up.
12. **Repository slug / remote name**: the GitHub slug is `guivinicius/tarkov-operator` (used by electron-builder `publish.owner`/`publish.repo` in T13 — correct as written). The git REMOTE, however, is named **`y`**, not `origin` — verified via `git remote -v`, upstream `y/main`. Any push/tag command must resolve the remote name dynamically; never hardcode `origin`.
