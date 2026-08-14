const {
  app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, globalShortcut, Notification,
  systemPreferences, session, shell
} = require("electron");
const { autoUpdater } = require("electron-updater");


// Ensure consistent userData path between dev and production builds.
// package.json name (dev) differs from electron-builder productName (prod).
app.setName("Tarkov Operator");
app.setAppUserModelId("com.tarkov-operator.desktop");

const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");
const { execSync } = require("child_process");
const { platform } = require("os");

const audioCapture = require("./audio-capture");
const audioPlayback = require("./audio-playback");
const screenCapture = require("./screen-capture");
const stt = require("./stt");
const tts = require("./tts");
const llm = require("./llm");
const settingsStore = require("./settings-store");
const dataStore = require("./data-store");
const tarkovDev = require("./tarkov-dev");
const agent = require("./agent");
const logger = require("./logger");
const keyValidator = require("./key-validator");

// --- State ----------------------------------------------------------------
let tray = null;
let settingsWindow = null;
let isEnabled = false;
const logs = [];
let isRecording = false;
let captureHandlersBound = false;
let micAccessRequested = false;
let pendingScreenshot = null;

function llmApiKey(s) {
  switch (s.LLM_PROVIDER) {
    case "openrouter": return s.OPENROUTER_API_KEY;
    case "openai":     return s.OPENAI_API_KEY;
    case "anthropic":  return s.ANTHROPIC_API_KEY;
    default:           return "";
  }
}

function getSaneBaseURL(s) {
  const p = s.LLM_PROVIDER;
  const b = s.LLM_BASE_URL;
  const isOther = (u) => [
    "https://openrouter.ai/api/v1",
    "https://api.openai.com/v1",
    "https://api.anthropic.com/v1"
  ].includes(u);

  if (!b || (isOther(b) && 
      ((p === "openai" && b !== "https://api.openai.com/v1") ||
       (p === "anthropic" && b !== "https://api.anthropic.com/v1") ||
       (p === "openrouter" && b !== "https://openrouter.ai/api/v1")))) {
    if (p === "openai") return "https://api.openai.com/v1";
    if (p === "anthropic") return "https://api.anthropic.com/v1";
    return "https://openrouter.ai/api/v1";
  }
  return b;
}

function sttApiKey(s) {
  if (s.STT_PROVIDER === "elevenlabs") return s.ELEVENLABS_API_KEY;
  if (s.STT_PROVIDER === "openrouter") return s.OPENROUTER_API_KEY;
  return s.OPENAI_API_KEY || s.OPENROUTER_API_KEY;
}

function log(level, message) {
  const entry = { level, message, time: Date.now() };
  if (logs.length >= 1000) logs.shift();
  logs.push(entry);
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send("log", entry);
  }
}

logger.setSink((entry) => {
  if (logs.length >= 1000) logs.shift();
  logs.push(entry);
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send("log", entry);
  }
});

// --- PTT Loop -------------------------------------------------------------

function processPipeline(audioBuffer, screenshotBase64) {
  const duration = (audioBuffer.length - 44) / (16000 * 2); // rough: 16-bit mono WAV
  log("info", `[capture] ${duration.toFixed(1)}s / ${(audioBuffer.length / 1024).toFixed(0)}KB`);

  const s = settingsStore.load();
  const useScreenshot = s.SCREENSHOT_ENABLED === true && screenshotBase64;
  if (useScreenshot) {
    log("info", `[screenshot] attached (${Math.round(screenshotBase64.length * 3 / 4 / 1024)}KB JPEG)`);
  }

  Promise.resolve().then(async () => {
    // 1. STT
    log("info", `[stt] model=${s.STT_MODEL}, provider=${s.STT_PROVIDER || "openai"}`);
    const tStt = Date.now();
    const sttResult = await stt.transcribe(audioBuffer, {
      apiKey: sttApiKey(s),
      model: s.STT_MODEL,
      provider: s.STT_PROVIDER,
      language: s.VOICE_LANGUAGE,
    });
    if (!sttResult.text) {
      log("info", "[stt] No speech detected (empty/filtered)");
      return;
    }
    log("info", `[stt] ${(Date.now() - tStt) / 1000}s`);
    log("info", `[you] ${sttResult.text}`);

    // 2. LLM
    const saneBaseURL = getSaneBaseURL(s);
    log("info", `[llm] model=${s.LLM_MODEL}, provider=${s.LLM_PROVIDER}, base=${saneBaseURL}`);
    log("info", `[llm] user="${sttResult.text}"`);
    const tLlm = Date.now();
    const agentResult = await agent.process(sttResult.text, {
      provider: s.LLM_PROVIDER,
      apiKey: llmApiKey(s),
      baseURL: saneBaseURL,
      model: s.LLM_MODEL,
      imageBase64: useScreenshot ? screenshotBase64 : undefined,
    });
    const wordCount = agentResult.text ? agentResult.text.split(/\s+/).length : 0;
    log("info", `[llm] ${(Date.now() - tLlm) / 1000}s, ${wordCount} words, model=${agentResult.model}, pt=${agentResult.promptTokens} ct=${agentResult.completionTokens}`);
    log("info", `[op] ${agentResult.text}`);

    // 3. TTS (skip if empty response)
    if (!agentResult.text) {
      log("info", "[tts] Empty response, skipping TTS");
      return;
    }

    log("info", `[tts] provider=${s.TTS_PROVIDER || "local"}, voice=${s.TTS_VOICE || "default"}, model=${s.TTS_MODEL || "default"}`);
    const tTts = Date.now();
    let ttsApiKey = "";
    if (s.TTS_PROVIDER === "openrouter") ttsApiKey = s.OPENROUTER_API_KEY;
    else if (s.TTS_PROVIDER === "elevenlabs") ttsApiKey = s.ELEVENLABS_API_KEY;
    else if (s.TTS_PROVIDER === "openai") ttsApiKey = s.OPENAI_API_KEY;
    const ttsResult = await tts.synthesize(agentResult.text, {
      provider: s.TTS_PROVIDER || "local",
      apiKey: ttsApiKey,
      voice: s.TTS_VOICE || undefined,
      model: s.TTS_MODEL || undefined,
      language: s.VOICE_LANGUAGE,
    });
    log("info", `[tts] ${(Date.now() - tTts) / 1000}s, format=${ttsResult.format}`);

    // 4. Play
    log("info", `[play] ${(ttsResult.audio.length / 1024).toFixed(0)}KB (radioFilter=${s.RADIO_FILTER === true})`);
    await audioPlayback.playBuffer(ttsResult.audio, ttsResult.format, {
      radioFilter: s.RADIO_FILTER === true,
    });
    log("info", "[play] Done");
  }).catch((err) => {
    logger.error(`[error] ${err.message}`);
    new Notification({ title: "Tarkov Operator", body: err.hint || err.message }).show();
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send("pipeline-error", {
        message: err.message,
        hint: err.hint,
        time: Date.now()
      });
    }
  });
}

function enablePTT() {
  if (isEnabled) return;

  const s = settingsStore.load();
  const pttKey = s.PTT_KEY || "F1";

  if (!llmApiKey(s)) {
    const keyName = `${s.LLM_PROVIDER.toUpperCase()}_API_KEY`;
    const msg = `${keyName} not set.`;
    const hint = "Add your API key in the Providers tab.";
    logger.error(msg);
    new Notification({ title: "Tarkov Operator", body: hint }).show();
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send("pipeline-error", {
        message: msg,
        hint: hint,
        time: Date.now()
      });
    }
    return;
  }

  if (!captureHandlersBound) {
    captureHandlersBound = true;

    audioCapture.onCaptureComplete((buffer) => {
      isRecording = false;
      // Resolve pending screenshot (if any) before processing.
      const screenshotPromise = pendingScreenshot || Promise.resolve(null);
      pendingScreenshot = null;
      updateTrayMenu();
      if (buffer && buffer.length > 4800) {
        screenshotPromise.then((screenshot) => {
          processPipeline(buffer, screenshot ? screenshot.base64 : null);
        });
      } else {
        log("info", `[ptt] Buffer too short (${buffer ? buffer.length : 0}B), ignoring`);
      }
    });

    audioCapture.onCaptureEmpty(() => {
      isRecording = false;
      updateTrayMenu();
      log("info", "[ptt] No speech detected, ignoring");
    });

    audioCapture.onCaptureError((err) => {
      isRecording = false;
      updateTrayMenu();
      const hint = platform() === "darwin"
        ? "Allow microphone access for Tarkov Operator in System Settings > Privacy & Security > Microphone."
        : "Check that a microphone is connected and not in use by another app.";
      logger.error(`[capture] ${err.message}`);
      new Notification({ title: "Tarkov Operator", body: hint }).show();
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send("pipeline-error", {
          message: err.message,
          hint,
          time: Date.now(),
        });
      }
    });
  }

  // Tap-to-talk, not hold-to-talk: globalShortcut has no key-release event, so
  // inferring release from OS key auto-repeat behaved differently per keyboard.
  const registered = globalShortcut.register(pttKey, async () => {
    if (isRecording) {
      isRecording = false;
      log("info", "[ptt] Cancelled");
      audioCapture.cancelCapture();
      updateTrayMenu();
      return;
    }

    if (platform() === "darwin" && !micAccessRequested) {
      micAccessRequested = true;
      try {
        await systemPreferences.askForMediaAccess("microphone");
      } catch (_) {
        // Denial is surfaced by onCaptureError with remediation guidance.
      }
    }

    isRecording = true;
    updateTrayMenu();
    log("info", "[ptt] Recording... (talk, then stop — it ends on silence)");

    // Capture screenshot immediately at tap-time (before user talks).
    const pttSettings = settingsStore.load();
    if (pttSettings.SCREENSHOT_ENABLED === true) {
      const tScreenshot = Date.now();
      pendingScreenshot = screenCapture.captureScreen(pttSettings.SCREENSHOT_DISPLAY || undefined)
        .then((result) => {
          if (result) {
            log("info", `[screenshot] captured ${result.width}x${result.height} in ${((Date.now() - tScreenshot) / 1000).toFixed(2)}s`);
          }
          return result;
        })
        .catch((err) => {
          log("error", `[screenshot] ${err.message}`);
          return null;
        });
    } else {
      pendingScreenshot = null;
    }

    try {
      await audioCapture.startCapture();
    } catch (err) {
      isRecording = false;
      updateTrayMenu();
      log("error", `[capture] ${err.message}`);
    }
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
    audioCapture.cancelCapture();
  }
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
  if (provider === "openai") {
    return [{ id: "tts-1", name: "tts-1" }, { id: "tts-1-hd", name: "tts-1-hd" }];
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
        .filter((m) => m.id.startsWith("gpt-") || m.id.startsWith("o") || m.id.includes("gpt"))
        .map((m) => ({ id: m.id, name: m.id }));
    }
    case "anthropic": {
      const data = await fetchJSON("https://api.anthropic.com/v1/models", {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      });
      return (data.data || []).map((m) => ({ id: m.id, name: m.name || m.id }));
    }
    default:
      return [];
  }
}

async function fetchSTTModels(provider, apiKey) {
  if (provider === "openrouter") {
    return fetchOpenRouterModels("transcription", apiKey);
  }
  if (provider === "openai") {
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

// Verified: GET /api/v1/models/{id} is a 404, and `supported_voices` on the
// /models list response is empty for all models. Do not refetch these.
const OPENROUTER_TTS_VOICES = [
  "alloy", "echo", "fable", "onyx", "nova", "shimmer", "coral", "sage", "ash", "ballad",
];

const OPENAI_TTS_VOICES = [
  "alloy", "echo", "fable", "onyx", "nova", "shimmer", "ash", "sage", "coral"
];

async function fetchTTSVoices(provider, apiKey) {
  if (provider === "elevenlabs") {
    try {
      const data = await fetchJSON("https://api.elevenlabs.io/v1/voices", {
        ...(apiKey ? { "xi-api-key": apiKey } : {}),
      });
      return (data.voices || []).map((v) => ({
        id: v.voice_id,
        name: v.name,
      }));
    } catch {
      return [];
    }
  }
  if (provider === "openai") {
    return OPENAI_TTS_VOICES.map((v) => ({ id: v, name: v }));
  }
  if (provider === "openrouter") {
    return OPENROUTER_TTS_VOICES.map((v) => ({ id: v, name: v }));
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

  settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

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

ipcMain.handle("get-displays", async () => {
  try {
    return await screenCapture.getDisplays();
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("validate-key", async (_event, provider, apiKey) => {
  const result = await keyValidator.validate(provider, apiKey);
  log(result.ok ? "info" : "error", `[validate] ${provider}: ${result.message}`);
  return result;
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

ipcMain.handle("get-memory", () => {
  try { return dataStore.getAllMemory(); }
  catch (err) { return { error: err.message }; }
});

ipcMain.handle("set-memory", (_event, key, value) => {
  try { dataStore.setMemory(key, value); return { ok: true }; }
  catch (err) { return { error: err.message }; }
});

ipcMain.handle("delete-memory", (_event, key) => {
  try { dataStore.deleteMemory(key); return { ok: true }; }
  catch (err) { return { error: err.message }; }
});

ipcMain.handle("clear-memory", () => {
  try { dataStore.clearMemory(); return { ok: true }; }
  catch (err) { return { error: err.message }; }
});

ipcMain.handle("test-tts", async (_event, opts) => {
  try {
    const testPhrase = opts.language === "pt-br" 
      ? "Operador, este é um teste de voz. Câmbio, na escuta?" 
      : "Operator, this is a voice test. Radio check, how copy?";
    const result = await tts.synthesize(testPhrase, {
      provider: opts.provider || "local",
      apiKey: opts.apiKey || "",
      voice: opts.voice || undefined,
      model: opts.model || undefined,
      language: opts.language,
    });
    const s = settingsStore.load();
    await audioPlayback.playBuffer(result.audio, result.format, {
      radioFilter: s.RADIO_FILTER === true
    });
    return { ok: true };
  } catch (err) {
    log("error", `[tts-test] ${err.message}`);
    return { error: err.message };
  }
});

// --- Auto Updater -----------------------------------------------------------

autoUpdater.autoDownload = false;

function sendUpdateStatus(event, data) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send("update-status", { event, ...data });
  }
}

autoUpdater.on("update-available", (info) => sendUpdateStatus("update-available", { info }));
autoUpdater.on("update-not-available", (info) => sendUpdateStatus("update-not-available", { info }));
autoUpdater.on("download-progress", (progressObj) => sendUpdateStatus("download-progress", { progressObj }));
autoUpdater.on("update-downloaded", (info) => sendUpdateStatus("update-downloaded", { info }));
autoUpdater.on("error", (err) => sendUpdateStatus("error", { message: err.message }));

ipcMain.handle("check-for-updates", async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, result };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("download-update", async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("install-update", () => {
  autoUpdater.quitAndInstall();
  return { ok: true };
});

// --- App lifecycle --------------------------------------------------------

app.whenReady().then(() => {
  dataStore.init(app.getPath("userData"));
  settingsStore.init(app.getPath("userData"));

  try {
    const snapshotPath = path.join(__dirname, "..", "data", "snapshot.json");
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    const seedResult = dataStore.seedFromSnapshot(snapshot);
    if (seedResult.skipped) {
      log("info", "[data] Snapshot seed skipped (DB already populated)");
    } else {
      log("info", `[data] Seeded from bundled snapshot: ${seedResult.items} items, ${seedResult.maps} maps, ${seedResult.quests} quests`);
    }
  } catch (err) {
    log("warn", `[data] Snapshot seed failed (app will continue): ${err.message}`);
  }

  // Without this, getUserMedia in the capture window is denied outright.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "media");
  });

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

  autoUpdater.checkForUpdates().catch(err => {
    log("error", `[updater] Startup check failed: ${err.message}`);
  });
});

app.on("window-all-closed", () => {});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  if (tray) { tray.destroy(); tray = null; }
  dataStore.close();
});

app.on("activate", () => openSettingsWindow());
