const fs = require("fs");
const path = require("path");

let userDataPath = null;

function getFilePath() {
  return path.join(userDataPath, "settings.json");
}

function init(appPath) {
  userDataPath = appPath;
  const filePath = getFilePath();
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(getDefaults(), null, 2));
  }
}

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

function load() {
  try {
    const filePath = getFilePath();
    if (!fs.existsSync(filePath)) return getDefaults();
    return { ...getDefaults(), ...JSON.parse(fs.readFileSync(filePath, "utf-8")) };
  } catch {
    return getDefaults();
  }
}

function save(partial) {
  const current = load();
  const updated = { ...current, ...partial };
  fs.writeFileSync(getFilePath(), JSON.stringify(updated, null, 2));
  return updated;
}

module.exports = { init, load, save };
