const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

const OUTPUT_DIR = path.resolve(__dirname, "..", "docs", "assets", "screenshots");
const TABS = ["home", "providers", "llm", "vision", "voice", "data", "logs", "memory"];

const MOCK_SETTINGS = {
  OPENROUTER_API_KEY: "sk-or-v1-98a7234bf1c8934d7120e8316278ba92",
  OPENAI_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  ELEVENLABS_API_KEY: "",
  LLM_PROVIDER: "openrouter",
  LLM_MODEL: "google/gemini-2.5-flash",
  LLM_BASE_URL: "",
  PLAYER_NAME: "Operator",
  PTT_KEY: { keycode: 59, name: "F1" },
  PTT_MODE: "silence",
  SCREENSHOT_ENABLED: true,
  SCREENSHOT_DISPLAY: "",
  AUDIO_INPUT_DEVICE: "",
  AUDIO_OUTPUT_DEVICE: "",
  RADIO_FILTER: false,
  STT_LANGUAGE: "en",
  STT_PROVIDER: "openrouter",
  STT_MODEL: "openai/whisper-large-v3",
  TTS_LANGUAGE: "en",
  TTS_PROVIDER: "local",
  TTS_MODEL: "",
  TTS_VOICE: "",
  AUTO_FETCH_DATA: true,
};

const MOCK_LOGS = [
  { type: "info", text: "[18:30:00] [SYSTEM] Audio capture initialized. PTT active (F1)." },
  { type: "info", text: "[18:31:14] [STT] Recording started (silence detection mode)." },
  { type: "info", text: "[18:31:16] [STT] Transcribed (310ms): 'What ammo penetrates class 5 armor?'" },
  { type: "info", text: "[18:31:16] [TOOL] ammo_vs_armor executed: class=5 -> M61, SNB, SSA AP" },
  { type: "info", text: "[18:31:17] [LLM] Response generated in 380ms (google/gemini-2.5-flash)" },
  { type: "info", text: "[18:31:17] [TTS] Audio spoken via System Voice (210ms)" },
  { type: "info", text: "[18:35:40] [STT] Recording started (silence detection mode)." },
  { type: "info", text: "[18:35:42] [STT] Transcribed (280ms): 'Where is the pocket watch on Customs?'" },
  { type: "info", text: "[18:35:42] [TOOL] quest_info executed: 'Checking' -> Construction tanker, Key 205" },
  { type: "info", text: "[18:35:43] [LLM] Response generated in 410ms (google/gemini-2.5-flash)" },
];

const MOCK_MEMORY = [
  { key: "favorite_ammo", value: "7.62x51mm M61", updated_at: "Today, 18:31" },
  { key: "preferred_extract", value: "ZB-013 (Customs)", updated_at: "Today, 18:32" },
  { key: "quest_focus", value: "Delivery from the Past", updated_at: "Today, 18:35" }
];

const MOCK_DATA_STATUS = {
  items: 2410,
  maps: 12,
  quests: 264,
  traders: 9,
  hideout: 18,
  lastFetch: new Date().toISOString()
};

// Setup mock IPC handlers
function setupMockIpc() {
  ipcMain.handle("get-status", () => ({ enabled: true }));
  ipcMain.handle("get-settings", () => MOCK_SETTINGS);
  ipcMain.handle("update-settings", (_e, s) => Object.assign(MOCK_SETTINGS, s));
  ipcMain.handle("get-logs", () => MOCK_LOGS);
  ipcMain.handle("get-displays", () => [{ id: 1, name: "Display 1 (2560x1440 - Primary)" }]);
  ipcMain.handle("get-data-status", () => MOCK_DATA_STATUS);
  ipcMain.handle("get-memory", () => MOCK_MEMORY);
  ipcMain.handle("get-last-screenshot", () => null);
  ipcMain.handle("fetch-models", () => ["google/gemini-2.5-flash", "anthropic/claude-3.5-haiku", "openai/gpt-4o-mini"]);
  ipcMain.handle("fetch-voices", () => ["Samantha", "Alex", "Victoria", "Daniel"]);
  ipcMain.handle("validate-key", () => ({ ok: true }));
  ipcMain.handle("toggle", () => ({ enabled: true }));
  ipcMain.handle("new-session", () => ({ ok: true }));
  ipcMain.handle("record-ptt-key", () => ({ keycode: 59, name: "F1" }));
  ipcMain.handle("cancel-record-ptt-key", () => ({}));
  ipcMain.handle("fetch-game-data", () => ({ ok: true }));
  ipcMain.handle("clear-game-data", () => ({ ok: true }));
  ipcMain.handle("set-memory", () => ({ ok: true }));
  ipcMain.handle("delete-memory", () => ({ ok: true }));
  ipcMain.handle("clear-memory", () => ({ ok: true }));
  ipcMain.handle("test-tts", () => ({ ok: true }));
  ipcMain.handle("check-for-updates", () => ({ updateAvailable: false }));
  ipcMain.handle("download-update", () => ({ ok: true }));
  ipcMain.handle("install-update", () => ({ ok: true }));
}

async function captureAllTabs() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  setupMockIpc();

  const win = new BrowserWindow({
    width: 640,
    height: 620,
    show: false,
    frame: false,
    backgroundColor: "#111424",
    webPreferences: {
      preload: path.resolve(__dirname, "..", "src", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await win.loadFile(path.resolve(__dirname, "..", "src", "renderer", "index.html"));

  // Wait for initial render and data binding
  await new Promise((r) => setTimeout(r, 600));

  console.log("📸 Generating tab screenshots...");

  for (const tab of TABS) {
    // Switch tab in renderer
    await win.webContents.executeJavaScript(`
      (() => {
        const btn = document.querySelector('.tab[data-tab="${tab}"]');
        if (btn) btn.click();
      })()
    `);

    // Give DOM time to update transitions
    await new Promise((r) => setTimeout(r, 200));

    const image = await win.webContents.capturePage();
    const filePath = path.join(OUTPUT_DIR, `${tab}.png`);
    fs.writeFileSync(filePath, image.toPNG());
    console.log(`  ✓ Saved: ${tab}.png`);
  }

  console.log(`🎉 All ${TABS.length} screenshots generated in: ${OUTPUT_DIR}`);
  app.quit();
}

app.whenReady().then(captureAllTabs).catch((err) => {
  console.error("Failed to generate screenshots:", err);
  process.exit(1);
});
