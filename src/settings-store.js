const fs = require("fs");
const path = require("path");
const dataStore = require("./data-store");

let userDataPath = null;

function getDefaults() {
  return {
    LLM_PROVIDER: "openrouter",
    OPENROUTER_API_KEY: "",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    ELEVENLABS_API_KEY: "",

    LLM_BASE_URL: "https://openrouter.ai/api/v1",
    LLM_MODEL: "anthropic/claude-sonnet-4.6",
    STT_PROVIDER: "openrouter",
    STT_MODEL: "openai/whisper-1",
    TTS_PROVIDER: "local",
    TTS_VOICE: "",
    TTS_MODEL: "",
    STT_LANGUAGE: "en",
    TTS_LANGUAGE: "en",
    RADIO_FILTER: false,
    PTT_KEY: { keycode: 59, name: "F1" }, // uiohook-napi keycode for F1
    PTT_MODE: "silence", // "hold", "toggle", "silence"
    SCREENSHOT_ENABLED: false,
    SCREENSHOT_DISPLAY: "",
    PLAYER_NAME: "",
  };
}

function migrateFromJson(jsonPath) {
  try {
    if (fs.existsSync(jsonPath)) {
      const raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      for (const [key, value] of Object.entries(raw)) {
        dataStore.setSetting(key, value);
      }
      fs.renameSync(jsonPath, jsonPath + ".bak");
    }
  } catch {}
}

function init(appPath) {
  userDataPath = appPath;
  migrateFromJson(path.join(appPath, "settings.json"));
}

const LEGACY_KEY_MAP = {
  F1: 59, F2: 60, F3: 61, F4: 62, F5: 63, F6: 64,
  F7: 65, F8: 66, F9: 67, F10: 68, F11: 87, F12: 88,
  F13: 91, F14: 92, F15: 93, F16: 99, F17: 100, F18: 101,
  F19: 102, F20: 103, F21: 104, F22: 105, F23: 106, F24: 107,
  Space: 57, Tab: 15, CapsLock: 58, Escape: 1, Backspace: 14, Enter: 28,
  Ctrl: 29, Alt: 56, Shift: 42, Backquote: 41,
  A: 30, B: 48, C: 46, D: 32, E: 18, F: 33, G: 34, H: 35,
  I: 23, J: 36, K: 37, L: 38, M: 50, N: 49, O: 24, P: 25,
  Q: 16, R: 19, S: 31, T: 20, U: 22, V: 47, W: 17, X: 45,
  Y: 21, Z: 44,
  "0": 11, "1": 2, "2": 3, "3": 4, "4": 5,
  "5": 6, "6": 7, "7": 8, "8": 9, "9": 10
};

function normalizePttKey(val) {
  if (!val) return { keycode: 59, name: "F1" };
  if (typeof val === "object") {
    if (val.mouseButton !== undefined) {
      return { mouseButton: Number(val.mouseButton), name: val.name || `Mouse ${val.mouseButton}` };
    }
    if (val.keycode !== undefined) {
      return { keycode: Number(val.keycode), name: val.name || `Key${val.keycode}` };
    }
  }
  if (typeof val === "string") {
    const mouseMatch = val.match(/^Mouse\s*(\d)/i);
    if (mouseMatch) {
      const btn = Number(mouseMatch[1]);
      return { mouseButton: btn, name: val };
    }
    const keycode = LEGACY_KEY_MAP[val] || 59;
    return { keycode, name: val };
  }
  return { keycode: 59, name: "F1" };
}

function load() {
  const defaults = getDefaults();
  const settings = dataStore.getAllSettings();
  const merged = { ...defaults, ...settings };

  // Migrate old VOICE_LANGUAGE to split STT/TTS languages
  if (settings.VOICE_LANGUAGE && !settings.STT_LANGUAGE && !settings.TTS_LANGUAGE) {
    merged.STT_LANGUAGE = settings.VOICE_LANGUAGE;
    merged.TTS_LANGUAGE = settings.VOICE_LANGUAGE;
    dataStore.setSetting("STT_LANGUAGE", merged.STT_LANGUAGE);
    dataStore.setSetting("TTS_LANGUAGE", merged.TTS_LANGUAGE);
    dataStore.deleteSetting("VOICE_LANGUAGE");
  }

  merged.PTT_KEY = normalizePttKey(merged.PTT_KEY);

  return merged;
}

function save(partial) {
  const toSave = { ...partial };
  if (toSave.PTT_KEY !== undefined) {
    toSave.PTT_KEY = normalizePttKey(toSave.PTT_KEY);
  }
  for (const [key, value] of Object.entries(toSave)) {
    dataStore.setSetting(key, value);
  }
  return load();
}

module.exports = { init, load, save, normalizePttKey };
