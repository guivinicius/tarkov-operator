const {
  app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, globalShortcut,
} = require("electron");
const path = require("path");
const https = require("https");
const http = require("http");
const { execSync } = require("child_process");
const { platform } = require("os");

const audioCapture = require("./audio-capture");
const audioPlayback = require("./audio-playback");
const stt = require("./stt");
const tts = require("./tts");
const llm = require("./llm");
const settingsStore = require("./settings-store");
const dataStore = require("./data-store");
const tarkovDev = require("./tarkov-dev");
const rag = require("./rag");

// --- State ----------------------------------------------------------------
let tray = null;
let settingsWindow = null;
let isEnabled = false;
const logs = [];
  let pttTimer = null;
let maxRecordTimer = null;
let isRecording = false;
let lastPttPress = 0;

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
  if (s.STT_PROVIDER === "elevenlabs") return s.ELEVENLABS_API_KEY;
  if (s.STT_PROVIDER === "openrouter") return s.OPENROUTER_API_KEY;
  return s.WHISPER_API_KEY || s.OPENAI_API_KEY || s.OPENROUTER_API_KEY;
}

function log(level, message) {
  const entry = { level, message, time: Date.now() };
  logs.push(entry);
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send("log", entry);
  }
}

// --- PTT Loop -------------------------------------------------------------

function processPipeline(audioBuffer) {
  const duration = (audioBuffer.length - 44) / (16000 * 2); // rough: 16-bit mono WAV
  log("info", `[capture] ${duration.toFixed(1)}s / ${(audioBuffer.length / 1024).toFixed(0)}KB`);

  const s = settingsStore.load();

  Promise.resolve().then(async () => {
    // 1. STT
    log("info", `[stt] model=${s.STT_MODEL}, provider=${s.STT_PROVIDER || "whisper-api"}`);
    const tStt = Date.now();
    const sttResult = await stt.transcribe(audioBuffer, {
      apiKey: sttApiKey(s),
      model: s.STT_MODEL,
      provider: s.STT_PROVIDER,
    });
    if (!sttResult.text) {
      log("info", "[stt] No speech detected (empty/filtered)");
      return;
    }
    log("info", `[stt] ${(Date.now() - tStt) / 1000}s`);
    log("info", `[you] ${sttResult.text}`);

    // 2. LLM
    // 2. RAG: search game data for relevant context
    let ragContext = "";
    try {
      ragContext = await rag.search(sttResult.text);
      if (ragContext) log("info", `[rag] Found context (${ragContext.length}B)`);
    } catch (err) {
      log("info", `[rag] ${err.message}`);
    }

    log("info", `[llm] model=${s.LLM_MODEL}, provider=${s.LLM_PROVIDER}, base=${s.LLM_BASE_URL}`);
    log("info", `[llm] user="${sttResult.text}"`);
    log("info", `[llm] rag_context=${ragContext ? ragContext.length + "B" : "none"}`);
    const tLlm = Date.now();
    const llmResult = await llm.ask(sttResult.text, {
      apiKey: llmApiKey(s),
      baseURL: s.LLM_BASE_URL,
      model: s.LLM_MODEL,
      systemPromptAppend: ragContext,
    });
    const wordCount = llmResult.text ? llmResult.text.split(/\s+/).length : 0;
    log("info", `[llm] ${(Date.now() - tLlm) / 1000}s, ${wordCount} words, finish=${llmResult.finishReason}, model=${llmResult.model}, pt=${llmResult.promptTokens} ct=${llmResult.completionTokens}`);
    if (llmResult.raw && llmResult.raw.trim() !== llmResult.raw) {
      log("info", `[llm] raw="${llmResult.raw.replace(/\n/g, "\\n").slice(0, 300)}"`);
    }
    log("info", `[op] ${llmResult.text}`);

    // 3. TTS (skip if empty response)
    if (!llmResult.text) {
      log("info", "[tts] Empty response, skipping TTS");
      return;
    }

    log("info", `[tts] provider=${s.TTS_PROVIDER || "local"}, voice=${s.TTS_VOICE || "default"}, model=${s.TTS_MODEL || "default"}`);
    const tTts = Date.now();
    let ttsApiKey = "";
    if (s.TTS_PROVIDER === "openrouter") ttsApiKey = s.OPENROUTER_API_KEY;
    else if (s.TTS_PROVIDER === "elevenlabs") ttsApiKey = s.ELEVENLABS_API_KEY;
    const ttsResult = await tts.synthesize(llmResult.text, {
      provider: s.TTS_PROVIDER || "local",
      apiKey: ttsApiKey,
      voice: s.TTS_VOICE || undefined,
      model: s.TTS_MODEL || undefined,
    });
    log("info", `[tts] ${(Date.now() - tTts) / 1000}s, format=${ttsResult.format}`);

    // 4. Play (pass format as file extension)
    log("info", `[play] ${(ttsResult.audio.length / 1024).toFixed(0)}KB`);
    await audioPlayback.playBuffer(ttsResult.audio, ttsResult.format);
    log("info", "[play] Done");
  }).catch((err) => {
    log("error", `[error] ${err.message}`);
  });
}

function enablePTT() {
  if (isEnabled) return;

  const s = settingsStore.load();
  const pttKey = s.PTT_KEY || "F1";

  if (s.LLM_PROVIDER !== "ollama" && !llmApiKey(s)) {
    const keyName = `${s.LLM_PROVIDER.toUpperCase()}_API_KEY`;
    log("error", `${keyName} not set. Add it in the Providers tab.`);
    return;
  }

  function stopCaptureAndProcess(reason) {
    if (!isRecording) return;
    isRecording = false;
    clearTimeout(maxRecordTimer);
    clearTimeout(pttTimer);
    maxRecordTimer = null;
    pttTimer = null;
    log("info", reason ? `[ptt] ${reason}` : "[ptt] Processing...");
    audioCapture.stopCapture();
  }

  const registered = globalShortcut.register(pttKey, () => {
    const now = Date.now();
    const elapsed = now - lastPttPress;
    lastPttPress = now;

    if (isRecording) {
      if (elapsed < 500) {
        // Fast repeat (<500ms) → user still holding → set silence timer
        clearTimeout(pttTimer);
        pttTimer = setTimeout(() => stopCaptureAndProcess("Release detected"), 400);
      } else {
        // New press (≥500ms gap) → tap again to stop (useful for function keys)
        stopCaptureAndProcess("Key pressed again");
      }
      return;
    }

    // First keydown → start capture
    isRecording = true;
    audioCapture.onCaptureComplete((buffer) => {
      if (buffer && buffer.length > 4800) {
        processPipeline(buffer);
      } else {
        log("info", `[ptt] Buffer too short (${buffer?.length || 0}B), ignoring`);
      }
    });
    audioCapture.startCapture().catch((err) => {
      log("error", `[capture] ${err.message}`);
      isRecording = false;
    });
    log("info", "[ptt] Recording...");

    // Safety max (30s) — for keys that don't auto-repeat
    maxRecordTimer = setTimeout(() => stopCaptureAndProcess("Max duration (30s)"), 30000);
  });

  if (!registered) {
    log("error", `Failed to register global hotkey ${pttKey}. It may be in use.`);
    return;
  }

  isEnabled = true;
  log("info", `Operator enabled. Hold ${pttKey} to talk.`);
  updateTrayMenu();
  sendStatus();
}

function disablePTT() {
  if (!isEnabled) return;
  globalShortcut.unregisterAll();
  if (isRecording) {
    isRecording = false;
    audioCapture.stopCapture();
  }
  clearTimeout(pttTimer);
  clearTimeout(maxRecordTimer);
  maxRecordTimer = null;
  isEnabled = false;
  log("info", "Operator disabled.");
  updateTrayMenu();
  sendStatus();
}

function toggleEnabled() {
  if (isEnabled) disablePTT();
  else enablePTT();
}

// --- Provider API: fetch models / voices ----------------------------------

function fetchJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    mod.get(url, { headers }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        try {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          } else {
            resolve(JSON.parse(data));
          }
        } catch (e) {
          reject(new Error(`Bad JSON: ${data.slice(0, 200)}`));
        }
      });
    }).on("error", reject);
  });
}

async function fetchOpenRouterModels(outputModality, apiKey) {
  try {
    const data = await fetchJSON(
      `https://openrouter.ai/api/v1/models?output_modalities=${outputModality}`,
      apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
    );
    const models = data.data || [];
    return models.map((m) => ({ id: m.id, name: m.name || m.id }));
  } catch {
    return [];
  }
}

async function fetchTTSModels(provider, apiKey) {
  if (provider === "openrouter") {
    return fetchOpenRouterModels("speech", apiKey);
  }
  return [];
}

async function fetchLLMModels(provider, apiKey, baseURL) {
  switch (provider) {
    case "openrouter": {
      const data = await fetchJSON(`${baseURL}/models`, {
        Authorization: `Bearer ${apiKey}`,
      });
      return (data.data || []).map((m) => ({ id: m.id, name: m.name || m.id }));
    }
    case "openai": {
      const data = await fetchJSON("https://api.openai.com/v1/models", {
        Authorization: `Bearer ${apiKey}`,
      });
      const supported = data.data || [];
      return supported
        .filter((m) => m.id.startsWith("gpt-") || m.id.startsWith("o"))
        .map((m) => ({ id: m.id, name: m.id }));
    }
    case "anthropic": {
      const data = await fetchJSON("https://api.anthropic.com/v1/models", {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      });
      return (data.data || []).map((m) => ({ id: m.id, name: m.name || m.id }));
    }
    case "ollama": {
      try {
        const data = await fetchJSON("http://localhost:11434/api/tags");
        return (data.models || []).map((m) => ({ id: m.name, name: m.name }));
      } catch {
        return [{ id: "qwen3:14b", name: "qwen3:14b (default)" }];
      }
    }
    default:
      return [];
  }
}

async function fetchSTTModels(provider, apiKey) {
  if (provider === "openrouter") {
    return fetchOpenRouterModels("transcription", apiKey);
  }
  if (provider === "whisper-api") {
    return [{ id: "whisper-1", name: "whisper-1 (OpenAI)" }];
  }
  if (provider === "local") {
    return [
      { id: "tiny", name: "Tiny (~39MB, fastest)" },
      { id: "base", name: "Base (~74MB, balanced)" },
      { id: "small", name: "Small (~244MB, accurate)" },
      { id: "medium", name: "Medium (~769MB, very accurate)" },
      { id: "large", name: "Large (~1.5GB, most accurate)" },
    ];
  }
  if (provider === "elevenlabs") {
    return [
      { id: "scribe_v2", name: "Scribe v2 (latest)" },
      { id: "scribe_v1", name: "Scribe v1" },
    ];
  }
  return [];
}

async function fetchTTSVoices(provider, apiKey) {
  if (provider === "elevenlabs") {
    try {
      const data = await fetchJSON("https://api.elevenlabs.io/v1/voices", {});
      return (data.voices || []).map((v) => ({
        id: v.voice_id,
        name: v.name,
      }));
    } catch {
      return [];
    }
  }
  if (provider === "openrouter") {
    return [
      { id: "alloy", name: "Alloy (balanced, neutral)" },
      { id: "echo", name: "Echo (deep, resonant)" },
      { id: "fable", name: "Fable (British, warm)" },
      { id: "nova", name: "Nova (female, clear)" },
      { id: "shimmer", name: "Shimmer (warm, bright)" },
      { id: "coral", name: "Coral (bright, energetic)" },
      { id: "sage", name: "Sage (calm, gentle)" },
      { id: "ash", name: "Ash (masculine, deep)" },
      { id: "ballad", name: "Ballad (soft, melodic)" },
    ];
  }
  return [];
}

async function fetchLocalTTSVoices() {
  if (platform() === "darwin") {
    try {
      const out = execSync("say -v '?'", { encoding: "utf-8" });
      return out.trim().split("\n").map((line) => {
        const match = line.match(/^(\S+)\s+/);
        return { id: match ? match[1] : line, name: line };
      });
    } catch {
      return [{ id: "Daniel", name: "Daniel (default)" }];
    }
  }
  if (platform() === "win32") {
    try {
      const ps = `Add-Type -AssemblyName System.Speech; $synth=New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }`;
      const out = execSync(`powershell -NoProfile -Command "${ps}"`, { encoding: "utf-8" });
      return out.trim().split("\n").filter(Boolean).map((n) => ({ id: n, name: n }));
    } catch {
      return [{ id: "Microsoft David Desktop", name: "Microsoft David" }];
    }
  }
  return [{ id: "default", name: "Default" }];
}

// --- System tray ----------------------------------------------------------

function createTrayIcon() {
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  const color = isEnabled ? [0, 200, 0, 255] : [180, 180, 180, 255];
  const cx = size / 2, cy = size / 2, r = size / 2 - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;
      if (dist <= r) {
        canvas[idx] = color[0];
        canvas[idx + 1] = color[1];
        canvas[idx + 2] = color[2];
        canvas[idx + 3] = color[3];
      } else {
        canvas[idx + 3] = 0;
      }
    }
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setImage(createTrayIcon());
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isEnabled ? "Disable Operator" : "Enable Operator",
      click: toggleEnabled,
    },
    { type: "separator" },
    { label: "Settings...", click: openSettingsWindow },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);
  tray.setToolTip(`Tarkov Operator (${isEnabled ? "Active" : "Idle"})`);
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setPressedImage(createTrayIcon());
  updateTrayMenu();
  tray.on("click", () => {
    if (settingsWindow) { settingsWindow.show(); settingsWindow.focus(); }
    else openSettingsWindow();
  });
}

// --- Settings window ------------------------------------------------------

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 640,
    height: 620,
    resizable: false,
    skipTaskbar: true,
    show: false,
    title: "Tarkov Operator",
    webPreferences: {
      preload: path.resolve(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile(path.resolve(__dirname, "renderer", "index.html"));
  settingsWindow.once("ready-to-show", () => settingsWindow.show());
  settingsWindow.on("closed", () => { settingsWindow = null; });

  if (process.env.NODE_ENV === "development") {
    settingsWindow.webContents.openDevTools({ mode: "detach" });
  }
}

// --- IPC handlers ---------------------------------------------------------

function sendStatus() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send("status-changed", { enabled: isEnabled });
  }
}

ipcMain.handle("get-status", () => ({ enabled: isEnabled }));
ipcMain.handle("toggle", () => { toggleEnabled(); return { enabled: isEnabled }; });
ipcMain.handle("get-logs", () => logs.slice(-200));

ipcMain.handle("get-settings", () => settingsStore.load());

ipcMain.handle("update-settings", (_event, newSettings) => {
  settingsStore.save(newSettings);
  if (isEnabled) {
    disablePTT();
    enablePTT();
  }
  return { ok: true };
});

ipcMain.handle("fetch-models", async (_event, category, provider, apiKey, baseURL) => {
  try {
    if (category === "llm") return await fetchLLMModels(provider, apiKey, baseURL);
    if (category === "stt") return await fetchSTTModels(provider, apiKey);
    if (category === "tts") return await fetchTTSModels(provider, apiKey);
    return [];
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("fetch-voices", async (_event, provider, apiKey) => {
  try {
    if (provider === "local") return await fetchLocalTTSVoices();
    return await fetchTTSVoices(provider, apiKey);
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("new-session", () => {
  llm.newSession();
  log("info", "[session] Conversation history cleared");
  return { ok: true };
});

ipcMain.handle("get-data-status", () => {
  try {
    return dataStore.getStatus();
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("fetch-game-data", async (_event) => {
  try {
    const results = await tarkovDev.fetchAll((stage) => {
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send("data-progress", stage);
      }
    });

    dataStore.insertItems(results.items);
    dataStore.insertMaps(results.maps);
    dataStore.insertQuests(results.quests);
    dataStore.insertTraders(results.traders);
    dataStore.insertHideout(results.hideout);
    dataStore.setMeta("last_fetch", new Date().toISOString());
    log("info", `[data] Fetched: ${results.items.length} items, ${results.maps.length} maps, ${results.quests.length} quests, ${results.traders.length} traders, ${results.hideout.length} hideout`);
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send("data-updated");
    }
    return { ok: true };
  } catch (err) {
    log("error", `[data] Fetch failed: ${err.message}`);
    return { error: err.message };
  }
});

ipcMain.handle("clear-game-data", () => {
  try {
    dataStore.clearAll();
    log("info", "[data] Cache cleared");
    return { ok: true };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("check-dependency", async (_event, name) => {
  if (name === "sox") {
    const installed = audioCapture.isSoxInstalled();
    const commands = {
      darwin: "brew install sox",
      win32: "choco install sox.portable",
      linux: "apt install sox",
    };
    return {
      installed,
      command: commands[platform()] || "Install SoX from https://sox.sourceforge.net",
    };
  }
  return { installed: false, command: "" };
});

// --- App lifecycle --------------------------------------------------------

app.whenReady().then(() => {
  settingsStore.init(app.getPath("userData"));
  dataStore.init(app.getPath("userData"));
  createTray();
  openSettingsWindow();

  // Auto-fetch game data on startup
  function notifyDataUpdated() {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send("data-updated");
    }
  }

  const s = settingsStore.load();
  if (s.AUTO_FETCH_DATA !== false) {
    const status = dataStore.getStatus();
    const lastFetch = dataStore.getMeta("last_fetch");
    const stale = lastFetch && (Date.now() - new Date(lastFetch).getTime()) > 86400000; // 24h
    if (status.items === 0 || stale) {
      const reason = status.items === 0 ? "No cached data" : "Data > 24h old";
      log("info", `[data] ${reason}, fetching from tarkov.dev...`);
      tarkovDev.fetchAll().then((results) => {
        dataStore.insertItems(results.items);
        dataStore.insertMaps(results.maps);
        dataStore.insertQuests(results.quests);
        dataStore.insertTraders(results.traders);
        dataStore.insertHideout(results.hideout);
        dataStore.setMeta("last_fetch", new Date().toISOString());
        log("info", `[data] Auto-fetched ${results.items.length} items, ${results.maps.length} maps, ${results.quests.length} quests`);
        notifyDataUpdated();
      }).catch((err) => {
        log("error", `[data] Auto-fetch failed: ${err.message}`);
      });
    }
  }
});

app.on("window-all-closed", () => {});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  if (tray) { tray.destroy(); tray = null; }
});

app.on("activate", () => openSettingsWindow());
