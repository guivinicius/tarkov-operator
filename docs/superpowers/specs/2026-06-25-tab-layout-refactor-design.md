# Settings Window Tab Layout Refactor

## Goals

1. Separate API key management from model/provider selection
2. Add a Home tab with welcome + static best-quality recommendation
3. Use per-provider API key names (`OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY`, etc.)
4. Cleaner UX: LLM/Voice tabs have no key fields

## Tab Layout

| # | Tab | Content |
|---|-----|---------|
| 1 | **Home** | Welcome text, static hint "For best quality: Whisper API STT + Claude LLM + ElevenLabs TTS", quick status summary |
| 2 | **Providers** | All API keys and base URLs, one field per provider |
| 3 | **LLM** | Provider + model selector. Base URL auto-populates, visually de-emphasized but editable |
| 4 | **Voice** | STT provider + model. TTS provider + voice. |
| 5 | **Data** | Unchanged |
| 6 | **System** | Unchanged |
| 7 | **Logs** | Unchanged |

## Settings Schema (settings.json)

### New keys

```json
{
  "OPENROUTER_API_KEY": "",
  "OPENAI_API_KEY": "",
  "ANTHROPIC_API_KEY": "",
  "ELEVENLABS_API_KEY": "",
  "WHISPER_API_KEY": ""
}
```

### Removed keys

- `LLM_API_KEY` → replaced by per-provider keys
- `STT_API_KEY` → replaced by `WHISPER_API_KEY`
- `TTS_API_KEY` → replaced by `ELEVENLABS_API_KEY`

### Kept keys

- `LLM_PROVIDER` — selects which key to use
- `LLM_MODEL`
- `STT_PROVIDER`
- `STT_MODEL`
- `TTS_PROVIDER`
- `TTS_VOICE`
- `PTT_KEY`
- `AUTO_FETCH_DATA`

### Derived at runtime

`LLM_BASE_URL` is still in settings (auto-set on provider change, editable for custom). API key lookup:

```
LLM_PROVIDER  →  which key to use
openrouter    →  OPENROUTER_API_KEY
openai        →  OPENAI_API_KEY
anthropic     →  ANTHROPIC_API_KEY
ollama        →  (no key needed)
```

When STT needs an API key:

```
STT_PROVIDER  →  which key
whisper-api   →  WHISPER_API_KEY || OPENAI_API_KEY || OPENROUTER_API_KEY
local         →  (no key needed)
```

When TTS needs a key:

```
TTS_PROVIDER  →  which key
elevenlabs    →  ELEVENLABS_API_KEY
local         →  (no key needed)
```

## Tab Details

### Home Tab

Static content, no inputs:

```
┌─ Tarkov Operator ──────────────────────────┐
│ Welcome to Tarkov Operator.                 │
│                                             │
│ Configure your API keys in the Providers    │
│ tab, then select models in LLM and Voice.   │
│                                             │
│ For best quality, set up:                   │
│ • Whisper API STT (OpenAI key)              │
│ • Claude LLM (OpenRouter/Anthropic key)     │
│ • ElevenLabs TTS (ElevenLabs key)           │
│                                             │
│ Status: Active / Idle                       │
│ Keys: 3 configured, 0 missing               │
└─────────────────────────────────────────────┘
```

### Providers Tab

```
┌─ API Keys ─────────────────────────────────┐
│ OpenRouter          [••••••••••••••••]      │
│ OpenAI              [••••••••••••••••]      │
│ Anthropic           [                      ] │
│ ElevenLabs          [••••••••••••••••]      │
│ Whisper API         [••••••••••••••••]      │
│                                             │
│ [Save Providers]        Saved!              │
└─────────────────────────────────────────────┘
```

- Password fields with placeholder dots when filled
- Empty Anthropic = OK (user might not use it)
- Save button saves all keys to settings.json

### LLM Tab (stripped)

```
┌─ LLM ──────────────────────────────────────┐
│ Provider  [OpenRouter ▾]                    │
│ Base URL  [https://openrouter.ai/api/v1]    │ ← de-emphasized, auto-set
│ Model     [anthropic/claude-sonnet-4.6 ▾]   │
│            ⟳  142 models                    │
│                                             │
│ [Save LLM]        Saved!                    │
└─────────────────────────────────────────────┘
```

- Provider change auto-sets Base URL (same logic as now)
- Base URL visually subdued (lighter color, maybe `font-style: italic` + smaller)
- Still editable if user needs custom endpoint
- Model fetch uses the appropriate key from Providers tab

### Voice Tab (stripped)

```
┌─ Speech-to-Text ───────────────────────────┐
│ Provider  [Whisper API ▾]                   │
│ Model     [whisper-1 ▾]                     │
└─────────────────────────────────────────────┘
┌─ Text-to-Speech ───────────────────────────┐
│ Provider  [Local ▾]                         │
│ Voice     [Daniel ▾]  ⟳  42 voices         │
│                                             │
│ [Save Voice]        Saved!                  │
└─────────────────────────────────────────────┘
```

- No API key fields
- Model/voice fetch uses keys from Providers tab

## Backend Changes

### settings-store.js

- Replace `LLM_API_KEY`, `STT_API_KEY`, `TTS_API_KEY` with `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `WHISPER_API_KEY`
- `LLM_BASE_URL` stays in settings (auto-set on provider change, editable)
- Old settings.json migrates on first load (unknown keys ignored, defaults fill in)

### main.js (processPipeline)

- Replace `s.LLM_API_KEY` with derived key lookup based on `s.LLM_PROVIDER`
- Replace `s.LLM_BASE_URL` with derived from provider (or `s.OLLAMA_BASE_URL`)
- Replace `s.STT_API_KEY` with derived (use `WHISPER_API_KEY || OPENAI_API_KEY || OPENROUTER_API_KEY`)
- Replace `s.TTS_API_KEY` with `s.ELEVENLABS_API_KEY`
- `enablePTT()` check: instead of `!s.LLM_API_KEY`, check if the selected provider's key is set (skip for ollama)

### main.js (fetch-models)

- `fetchLLMModels` uses the correct key per provider: `OPENAI_API_KEY` for OpenAI, `ANTHROPIC_API_KEY` for Anthropic, etc.
- Anthropic model fetch URL is hardcoded (`https://api.anthropic.com/v1/models`) — no base URL needed

## Error Handling

- Home tab shows count of configured vs missing keys
- If user selects a provider with no key configured, `enablePTT()` shows a clear message: "OpenRouter API key not set. Add it in the Providers tab."
- Empty values for unused providers are fine (e.g., no Anthropic key when using OpenAI)

## Files Changed

- `src/settings-store.js` — new key names, updated defaults
- `src/main.js` — derived key/URL logic, updated IPC handlers
- `src/preload.js` — unchanged (IPC API stays the same)
- `src/renderer/index.html` — new Home/Providers tabs, stripped LLM/Voice
- `src/renderer/app.js` — new tab logic, key lookup, Home status
- `src/renderer/styles.css` — de-emphasized Base URL style, Home tab styles
