# Tab Layout Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure settings window tabs: add Home + Providers, strip API keys from LLM/Voice, use per-provider key names.

**Architecture:** Settings window renderer gets new HTML sections, JS logic updated for key management separation. Main process adds key-derivation helpers. Settings schema changes (old keys migrate via defaults merge).

**Tech Stack:** Vanilla HTML/CSS/JS, Electron IPC

## Global Constraints

- `settings-store.js` `getDefaults()` guards unknown old keys — old `settings.json` won't break
- All `input-*` element ID convention stays (e.g., `input-OPENROUTER_API_KEY`)
- IPC API unchanged (`preload.js` not modified)
- LLM/Voice tabs keep their save buttons (save only relevant keys)

---

### Task 1: settings-store.js — per-provider key defaults

**Files:**
- Modify: `src/settings-store.js:18-31`

- [ ] **Step 1: Replace key defaults**

Replace `LLM_API_KEY`, `STT_API_KEY`, `TTS_API_KEY` with per-provider keys:

```javascript
function getDefaults() {
  return {
    LLM_PROVIDER: "openrouter",
    OPENROUTER_API_KEY: "",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    ELEVENLABS_API_KEY: "",
    WHISPER_API_KEY: "",
    LLM_BASE_URL: "https://openrouter.ai/api/v1",
    LLM_MODEL: "anthropic/claude-sonnet-4.6",
    STT_PROVIDER: "whisper-api",
    STT_MODEL: "whisper-1",
    TTS_PROVIDER: "local",
    TTS_VOICE: "",
    PTT_KEY: "F1",
  };
}
```

- [ ] **Step 2: Verify**

Check `settings.json` in `app.getPath("userData")` — old keys like `LLM_API_KEY` persist in the file but are ignored by the `getDefaults()` merge. The app starts without error.

---

### Task 2: main.js — key derivation helpers + enablePTT

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add key/URL derivation helpers before `processPipeline`**

Insert after state declarations (~line 27):

```javascript
function llmApiKey(s) {
  switch (s.LLM_PROVIDER) {
    case "openrouter": return s.OPENROUTER_API_KEY;
    case "openai":     return s.OPENAI_API_KEY;
    case "anthropic":  return s.ANTHROPIC_API_KEY;
    case "ollama":     return "";
    default:           return "";
  }
}

function sttApiKey(s) {
  return s.WHISPER_API_KEY || s.OPENAI_API_KEY || s.OPENROUTER_API_KEY;
}
```

- [ ] **Step 2: Update `enablePTT()` key check (~line 118)**

Replace `!s.LLM_API_KEY` with a check against the selected provider's key:

```javascript
  if (s.LLM_PROVIDER !== "ollama" && !llmApiKey(s)) {
    const keyName = `${s.LLM_PROVIDER.toUpperCase()}_API_KEY`;
    log("error", `${keyName} not set. Add it in the Providers tab.`);
    return;
  }
```

- [ ] **Step 3: Update `processPipeline` STT apiKey (~line 51)**

Replace `s.STT_API_KEY || s.LLM_API_KEY` with `sttApiKey(s)`:

```javascript
    const sttResult = await stt.transcribe(audioBuffer, {
      apiKey: sttApiKey(s),
      model: s.STT_MODEL,
      provider: s.STT_PROVIDER,
    });
```

- [ ] **Step 4: Update `processPipeline` LLM apiKey (~line 77)**

Replace `s.LLM_API_KEY` with `llmApiKey(s)`:

```javascript
    const llmResult = await llm.ask(sttResult.text, {
      apiKey: llmApiKey(s),
      baseURL: s.LLM_BASE_URL,
      model: s.LLM_MODEL,
      systemPromptAppend: ragContext,
    });
```

- [ ] **Step 5: Update `processPipeline` TTS apiKey (~line 98)**

Replace `s.TTS_API_KEY` with `s.ELEVENLABS_API_KEY`:

```javascript
      apiKey: s.ELEVENLABS_API_KEY,
```

- [ ] **Step 6: Update `fetchLLMModels` to use per-provider keys**

The `fetch-models` IPC handler (~line 406) passes `apiKey` from the renderer. The renderer now sends the correct key (see Task 4). No change needed in main.js here — the renderer looks up the key.

- [ ] **Step 7: Verify**

`npm start` → enable operator → PTT with no key set → logs show `"OPENROUTER_API_KEY not set"`.

---

### Task 3: index.html — new tab layout

**Files:**
- Modify: `src/renderer/index.html`

Replace the tab bar and all tab panels. Keep Data, System, Logs tabs unchanged.

- [ ] **Step 1: Replace tab bar (lines 38-44)**

```
      <button class="tab active" data-tab="home">Home</button>
      <button class="tab" data-tab="providers">Providers</button>
      <button class="tab" data-tab="llm">LLM</button>
      <button class="tab" data-tab="voice">Voice</button>
      <button class="tab" data-tab="data">Data</button>
      <button class="tab" data-tab="system">System</button>
      <button class="tab" data-tab="logs">Logs</button>
```

- [ ] **Step 2: Replace LLM tab content (lines 47-81)**

Remove API key field and ollama hint. Keep Base URL (de-emphasized via CSS class). Keep Provider, Model, Save button.

```html
    <!-- Tab: Home -->
    <div id="tab-home" class="tab-panel active">
      <div class="card home-card">
        <h2>Welcome to Tarkov Operator</h2>
        <p class="home-desc">
          Configure your API keys in the <strong>Providers</strong> tab, then select models in <strong>LLM</strong> and <strong>Voice</strong>.
        </p>
        <div class="home-recommendation">
          <h3>For best quality</h3>
          <ul>
            <li><strong>STT:</strong> Whisper API (set OpenAI or OpenRouter key)</li>
            <li><strong>LLM:</strong> Claude via OpenRouter (set OpenRouter key)</li>
            <li><strong>TTS:</strong> ElevenLabs (set ElevenLabs key)</li>
          </ul>
        </div>
        <div class="home-status">
          <span id="home-status-text">Checking...</span>
        </div>
      </div>
    </div>

    <!-- Tab: Providers -->
    <div id="tab-providers" class="tab-panel">
      <div class="card">
        <h2>API Keys</h2>
        <div class="field">
          <label>OpenRouter</label>
          <input type="password" id="input-OPENROUTER_API_KEY" placeholder="sk-or-...">
        </div>
        <div class="field">
          <label>OpenAI</label>
          <input type="password" id="input-OPENAI_API_KEY" placeholder="sk-...">
        </div>
        <div class="field">
          <label>Anthropic</label>
          <input type="password" id="input-ANTHROPIC_API_KEY" placeholder="sk-ant-...">
        </div>
        <div class="field">
          <label>ElevenLabs</label>
          <input type="password" id="input-ELEVENLABS_API_KEY" placeholder="Optional — for TTS">
        </div>
        <div class="field">
          <label>Whisper API</label>
          <input type="password" id="input-WHISPER_API_KEY" placeholder="Leave blank to use OpenAI/OpenRouter key">
        </div>
        <button id="save-providers-btn" class="btn-primary">Save Providers</button>
        <span id="save-providers-feedback" class="hidden save-feedback">Saved!</span>
      </div>
    </div>

    <!-- Tab: LLM -->
    <div id="tab-llm" class="tab-panel">
      <div class="card">
        <div class="field">
          <label>Provider</label>
          <select id="input-LLM_PROVIDER">
            <option value="openrouter">OpenRouter</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="ollama">Ollama (local)</option>
          </select>
        </div>
        <div class="field">
          <label>Base URL</label>
          <input type="text" id="input-LLM_BASE_URL" class="deemphasized-input">
        </div>
        <div class="field">
          <label>Model</label>
          <div class="field-row">
            <select id="input-LLM_MODEL"></select>
            <button class="btn-sm" id="refresh-llm-models" title="Fetch models">⟳</button>
            <span id="llm-models-status" class="status-msg"></span>
          </div>
        </div>
        <button id="save-llm-btn" class="btn-primary">Save LLM</button>
        <span id="save-llm-feedback" class="hidden save-feedback">Saved!</span>
      </div>
    </div>
```

- [ ] **Step 3: Replace Voice tab content (lines 83-144)**

Remove API key fields. Keep STT provider + model, TTS provider + voice + local install instructions.

```html
    <!-- Tab: Voice -->
    <div id="tab-voice" class="tab-panel">
      <div class="card">
        <h2>Speech-to-Text</h2>
        <div class="field">
          <label>Provider</label>
          <select id="input-STT_PROVIDER">
            <option value="whisper-api">Whisper API</option>
            <option value="local">Local Whisper</option>
          </select>
        </div>
        <div class="field">
          <label>Model</label>
          <select id="input-STT_MODEL"></select>
        </div>
        <div class="field install-instructions" data-depends-on="STT_PROVIDER" data-dep-is="local">
          <label></label>
          <div>
            <p class="hint" style="margin-bottom:4px;font-style:normal;color:#aaa">
              Local Whisper requires <code>openai-whisper</code> (Python):
            </p>
            <code class="install-cmd" id="local-stt-cmd">pip install openai-whisper</code>
            <p class="hint" style="margin-top:4px;font-style:normal;color:#666">
              Or build <a href="https://github.com/ggerganov/whisper.cpp" target="_blank" style="color:#4caf50">whisper.cpp</a>
              and ensure the <code>whisper</code> binary is on your PATH.
            </p>
          </div>
        </div>
      </div>
      <div class="card">
        <h2>Text-to-Speech</h2>
        <div class="field">
          <label>Provider</label>
          <select id="input-TTS_PROVIDER">
            <option value="local">Local (system TTS)</option>
            <option value="elevenlabs">ElevenLabs</option>
          </select>
        </div>
        <div class="field" data-depends-on="TTS_PROVIDER" data-dep-is="elevenlabs">
          <label>Voice</label>
          <div class="field-row">
            <select id="input-TTS_VOICE"></select>
            <button class="btn-sm" id="refresh-tts-voices" title="Fetch voices">⟳</button>
            <span id="tts-voices-status" class="status-msg"></span>
          </div>
        </div>
        <div class="field" data-depends-on="TTS_PROVIDER" data-dep-not="elevenlabs">
          <label></label>
          <span class="hint">Using system default voice</span>
        </div>
        <button id="save-voice-btn" class="btn-primary">Save Voice</button>
        <span id="save-voice-feedback" class="hidden save-feedback">Saved!</span>
      </div>
    </div>
```

- [ ] **Step 4: Keep Data, System, Logs tabs unchanged**

- [ ] **Step 5: Verify**

`npm start` → see 7 tabs: Home, Providers, LLM, Voice, Data, System, Logs. Home tab is active by default.

---

### Task 4: app.js — new tab logic

**Files:**
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Add Home tab refs**

Add after the existing refs (~line 21):

```javascript
  const homeStatusText = $("home-status-text");
```

- [ ] **Step 2: Update `switchTab` (line 49)**

Add home and providers cases, update LLM model fetch to use per-provider key:

```javascript
    if (tabId === "home") refreshHomeStatus();
    if (tabId === "llm") fetchAndPopulateModels("llm", llmProvider, llmModel, llmStatus);
    if (tabId === "voice") {
      fetchAndPopulateModels("stt", sttProvider, sttModel, {});
      if (ttsProvider.value === "elevenlabs") fetchAndPopulateVoices(ttsProvider, ttsVoice, ttsStatus);
    }
    if (tabId === "data") refreshDataStatus();
```

- [ ] **Step 3: Add `refreshHomeStatus` function**

After `refreshDataStatus` (~line 172):

```javascript
  async function refreshHomeStatus() {
    const settings = await window.operator.getSettings();
    const configured = [];
    const missing = [];
    const providers = [
      { key: "OPENROUTER_API_KEY", label: "OpenRouter" },
      { key: "OPENAI_API_KEY", label: "OpenAI" },
      { key: "ANTHROPIC_API_KEY", label: "Anthropic" },
      { key: "ELEVENLABS_API_KEY", label: "ElevenLabs" },
      { key: "WHISPER_API_KEY", label: "Whisper API" },
    ];
    for (const p of providers) {
      if (settings[p.key]) configured.push(p.label);
      else missing.push(p.label);
    }
    const status = await window.operator.getStatus();
    homeStatusText.textContent = `Operator: ${status.enabled ? "Active" : "Idle"} · Keys: ${configured.length} configured, ${missing.length} missing`;
  }
```

- [ ] **Step 4: Update `fetchAndPopulateModels` for Providers-tab keys**

Replace the apiKey derivation (line 93). The renderer now reads per-provider keys from settings (accessed via the input fields):

```javascript
  async function fetchAndPopulateModels(category, providerSelect, modelSelect, statusEl) {
    const provider = providerSelect.value;
    const settings = await window.operator.getSettings();
    let apiKey = "";
    const baseURL = $("input-LLM_BASE_URL").value;
    if (category === "llm") {
      apiKey = settings[`${provider.toUpperCase()}_API_KEY`] || "";
    }

    statusEl.textContent = "Loading...";
    const result = await window.operator.fetchModels(category, provider, apiKey, baseURL);

    if (result.error) {
      statusEl.textContent = `Error: ${result.error}`;
      setSelect(modelSelect, []);
      return;
    }

    const current = modelSelect.value;
    setSelect(modelSelect, result, current);
    statusEl.textContent = `${result.length} models`;
    setTimeout(() => { statusEl.textContent = ""; }, 3000);
  }
```

- [ ] **Step 5: Update `fetchAndPopulateVoices`**

Replace line 113 — read ElevenLabs key from settings instead of the removed `TTS_API_KEY` field:

```javascript
  async function fetchAndPopulateVoices(providerSelect, voiceSelect, statusEl) {
    const provider = providerSelect.value;
    const settings = await window.operator.getSettings();
    const apiKey = settings.ELEVENLABS_API_KEY;

    statusEl.textContent = "Loading...";
    const result = await window.operator.fetchVoices(provider, apiKey);

    if (result.error) {
      statusEl.textContent = `Error: ${result.error}`;
      setSelect(voiceSelect, []);
      return;
    }

    const current = voiceSelect.value;
    setSelect(voiceSelect, result, current);
    statusEl.textContent = `${result.length} voices`;
    setTimeout(() => { statusEl.textContent = ""; }, 3000);
  }
```

- [ ] **Step 6: Fix settings loading for new key names**

In the settings-loading loop (~line 218), the password-trick using placeholder already works for any `input-${key}` element. No change needed — the new keys like `OPENROUTER_API_KEY` will match `input-OPENROUTER_API_KEY`.

- [ ] **Step 7: Add Providers save button handler**

After the save-voice-btn handler (~line 307):

```javascript
  $("save-providers-btn").addEventListener("click", async () => {
    await saveSettings([
      "OPENROUTER_API_KEY",
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "ELEVENLABS_API_KEY",
      "WHISPER_API_KEY",
    ]);
    const fb = $("save-providers-feedback");
    fb.classList.remove("hidden");
    setTimeout(() => fb.classList.add("hidden"), 2000);
  });
```

- [ ] **Step 8: Update LLM save button handler (line 295)**

Remove `LLM_API_KEY` from saved keys:

```javascript
  $("save-llm-btn").addEventListener("click", async () => {
    await saveSettings(["LLM_PROVIDER", "LLM_BASE_URL", "LLM_MODEL"]);
    ...
  });
```

- [ ] **Step 9: Update Voice save button handler (line 302)**

Remove `STT_API_KEY`, `TTS_API_KEY` from saved keys:

```javascript
  $("save-voice-btn").addEventListener("click", async () => {
    await saveSettings(["STT_PROVIDER", "STT_MODEL", "TTS_PROVIDER", "TTS_VOICE"]);
    ...
  });
```

- [ ] **Step 10: Update init — add `refreshHomeStatus` call**

After `refreshDataStatus()` (~line 235):

```javascript
  refreshHomeStatus();
```

---

### Task 5: styles.css — new tab styles

**Files:**
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Add de-emphasized input style**

```css
.deemphasized-input {
  color: #666 !important;
  font-style: italic;
  font-size: 11px !important;
}
```

- [ ] **Step 2: Add Home tab styles**

```css
.home-card { text-align: center; padding: 24px 16px; }
.home-card h2 { font-size: 18px; color: #e0e0e0; text-transform: none; letter-spacing: 0; margin-bottom: 12px; }
.home-desc { font-size: 13px; color: #aaa; margin-bottom: 16px; line-height: 1.5; }
.home-recommendation {
  background: #0d0d1a;
  border: 1px solid #0f3460;
  border-radius: 6px;
  padding: 14px;
  margin-bottom: 16px;
  text-align: left;
}
.home-recommendation h3 {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #4caf50;
  margin-bottom: 8px;
}
.home-recommendation ul { list-style: none; padding: 0; }
.home-recommendation li {
  font-size: 13px;
  color: #ccc;
  padding: 3px 0;
}
.home-recommendation li::before { content: "› "; color: #4caf50; }
.home-status { font-size: 12px; color: #888; }
```

---

### Task 6: manual verification

- [ ] **Step 1: Restart app**

`npm start`

- [ ] **Step 2: Check Home tab**

Shows welcome text, best-quality recommendation, status line with key counts.

- [ ] **Step 3: Check Providers tab**

Five password fields. Fill in OpenRouter key, click Save, see "Saved!" feedback.

- [ ] **Step 4: Check LLM tab**

No API key field. Base URL de-emphasized. Provider change auto-updates URL. Refresh models fetches via OpenRouter key from Providers.

- [ ] **Step 5: Check Voice tab**

No API key fields. STT model fetches. TTS voice fetches (if ElevenLabs key set).

- [ ] **Step 6: Enable Operator**

PTT works — pipeline uses keys from Providers tab.

- [ ] **Step 7: Verify old settings.json**

Check `settings.json` in userData — old keys (`LLM_API_KEY`) still present but ignored. New keys populated.
