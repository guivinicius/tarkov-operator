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
    WHISPER_API_KEY: "",
    LLM_BASE_URL: "https://openrouter.ai/api/v1",
    LLM_MODEL: "anthropic/claude-sonnet-4.6",
    STT_PROVIDER: "whisper-api",
    STT_MODEL: "whisper-1",
    TTS_PROVIDER: "local",
    TTS_VOICE: "",
    TTS_MODEL: "",
    PTT_KEY: "F1",
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

function load() {
  return { ...getDefaults(), ...dataStore.getAllSettings() };
}

function save(partial) {
  for (const [key, value] of Object.entries(partial)) {
    dataStore.setSetting(key, value);
  }
  return load();
}

module.exports = { init, load, save };
