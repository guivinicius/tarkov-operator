document.addEventListener("DOMContentLoaded", async () => {
  const $ = (id) => document.getElementById(id);

  // --- Refs ---
  const statusIndicator = $("status-indicator");
  const statusText = $("status-text");
  const toggleBtn = $("toggle-btn");
  const logContainer = $("log-container");
  const clearBtn = $("clear-logs-btn");
  const checkSoxBtn = $("check-sox-btn");
  const installSoxBtn = $("install-sox-btn");
  const soxStatus = $("sox-status");

  const llmProvider = $("input-LLM_PROVIDER");
  const sttProvider = $("input-STT_PROVIDER");
  const ttsProvider = $("input-TTS_PROVIDER");

  const llmModel = $("input-LLM_MODEL");
  const sttModel = $("input-STT_MODEL");
  const ttsVoice = $("input-TTS_VOICE");
  const autoFetchData = $("input-AUTO_FETCH_DATA");
  const homeStatusText = $("home-status-text");

  const refreshLlm = $("refresh-llm-models");
  const refreshTts = $("refresh-tts-voices");
  const fetchDataBtn = $("fetch-data-btn");
  const clearDataBtn = $("clear-data-btn");

  const llmStatus = $("llm-models-status");
  const ttsStatus = $("tts-voices-status");
  const dataProgress = $("data-progress");
  const dataProgressText = $("data-progress-text");
  const dataProgressCurrent = $("data-progress-current");

  // --- Data status elements ---
  const dataStats = {
    items: $("data-items"),
    maps: $("data-maps"),
    quests: $("data-quests"),
    traders: $("data-traders"),
    hideout: $("data-hideout"),
    lastFetch: $("data-last-fetch"),
  };

  // --- Tab switching ---
  function switchTab(tabId) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tabId));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tabId}`));

    if (tabId === "home") refreshHomeStatus();
    if (tabId === "llm") fetchAndPopulateModels("llm", llmProvider, llmModel, llmStatus);
    if (tabId === "voice") {
      fetchAndPopulateModels("stt", sttProvider, sttModel, {});
      fetchAndPopulateVoices(ttsProvider, ttsVoice, ttsStatus);
    }
    if (tabId === "data") refreshDataStatus();
  }

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  // --- Helpers ---

  function updateFieldVisibility() {
    document.querySelectorAll("[data-depends-on]").forEach((el) => {
      const depends = el.getAttribute("data-depends-on");
      const depIs = el.getAttribute("data-dep-is");
      const depNot = el.getAttribute("data-dep-not");
      const actual = $(`input-${depends}`).value;
      let show = true;
      if (depIs && actual !== depIs) show = false;
      if (depNot && actual === depNot) show = false;
      el.style.display = show ? "" : "none";
    });
  }

  function setSelect(el, items, selectedId) {
    el.innerHTML = "";
    if (!items || items.length === 0) {
      el.innerHTML = '<option value="">(none)</option>';
      return;
    }
    for (const item of items) {
      const opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = item.name;
      if (item.id === selectedId) opt.selected = true;
      el.appendChild(opt);
    }
  }

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

  async function checkSox() {
    soxStatus.textContent = "Checking...";
    const result = await window.operator.checkDependency("sox");
    if (result.installed) {
      soxStatus.textContent = "✅ Installed";
      installSoxBtn.style.display = "none";
    } else {
      soxStatus.textContent = "❌ Not installed";
      installSoxBtn.style.display = "";
      installSoxBtn.textContent = `Install (${result.command})`;
      installSoxBtn.onclick = () => { soxStatus.textContent = `Run: ${result.command}`; };
    }
  }

  async function saveSettings(keys) {
    const data = {};
    for (const key of keys) {
      const el = $(`input-${key}`);
      if (!el) continue;
      if (el.tagName === "SELECT" || el.type !== "password") {
        data[key] = el.value;
      } else if (el.value) {
        data[key] = el.value;
      }
    }
    await window.operator.updateSettings(data);
  }

  async function refreshDataStatus() {
    const status = await window.operator.getDataStatus();
    if (status.error) {
      for (const key of Object.keys(dataStats)) dataStats[key].textContent = "—";
      return;
    }
    dataStats.items.textContent = String(status.items);
    dataStats.maps.textContent = String(status.maps);
    dataStats.quests.textContent = String(status.quests);
    dataStats.traders.textContent = String(status.traders);
    dataStats.hideout.textContent = String(status.hideout);
    dataStats.lastFetch.textContent = status.lastFetch
      ? new Date(status.lastFetch).toLocaleString()
      : "never";
  }

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

  async function fetchGameData() {
    fetchDataBtn.disabled = true;
    fetchDataBtn.textContent = "Fetching...";
    dataProgress.classList.remove("hidden");

    dataProgressText.textContent = "Fetching from tarkov.dev...";
    await window.operator.fetchGameData((stage) => {
      dataProgressCurrent.textContent = stage;
    });

    dataProgressText.textContent = "Done!";
    dataProgressCurrent.textContent = "";
    fetchDataBtn.disabled = false;
    fetchDataBtn.textContent = "Fetch All";
    setTimeout(() => dataProgress.classList.add("hidden"), 3000);
    refreshDataStatus();
  }

  function updateUI(enabled) {
    if (enabled) {
      statusIndicator.className = "indicator active";
      statusText.textContent = "Active";
      toggleBtn.textContent = "Disable Operator";
      toggleBtn.classList.add("active");
    } else {
      statusIndicator.className = "indicator idle";
      statusText.textContent = "Idle";
      toggleBtn.textContent = "Enable Operator";
      toggleBtn.classList.remove("active");
    }
  }

  function appendLog(entry) {
    const div = document.createElement("div");
    div.className = `log-entry ${entry.level}`;
    const time = new Date(entry.time).toLocaleTimeString();
    div.textContent = `[${time}] ${entry.message}`;
    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  // --- Load settings ---

  const settings = await window.operator.getSettings();
  for (const [key, value] of Object.entries(settings)) {
    const el = $(`input-${key}`);
    if (!el) continue;
    if (el.type === "password" && value) {
      el.placeholder = "••••••••••••••••";
    } else if (el.type === "checkbox") {
      el.checked = value !== false;
    } else {
      el.value = value;
    }
  }

  // --- Init ---

  [llmProvider, sttProvider, ttsProvider].forEach(updateFieldVisibility);
  fetchAndPopulateModels("stt", sttProvider, sttModel, {});
  checkSox();
  refreshDataStatus();
  refreshHomeStatus();

  const status = await window.operator.getStatus();
  updateUI(status.enabled);

  const logs = await window.operator.getLogs();
  for (const entry of logs) appendLog(entry);

  // --- Provider changes ---

  llmProvider.addEventListener("change", () => {
    updateFieldVisibility();
    const v = llmProvider.value;
    $("input-LLM_BASE_URL").value =
      v === "ollama" ? "http://localhost:11434/v1" :
      v === "openrouter" ? "https://openrouter.ai/api/v1" :
      v === "openai" ? "https://api.openai.com/v1" :
      v === "anthropic" ? "https://api.anthropic.com/v1" : "";
  });

  function updateLocalSttCommand() {
    const el = document.getElementById("local-stt-cmd");
    if (!el) return;
    const p = navigator.platform;
    if (p.startsWith("Mac")) el.textContent = "pip3 install openai-whisper";
    else if (p.startsWith("Win")) el.textContent = "pip install openai-whisper";
    else el.textContent = "pip3 install openai-whisper";
  }

  sttProvider.addEventListener("change", () => {
    updateFieldVisibility();
    fetchAndPopulateModels("stt", sttProvider, sttModel, {});
    updateLocalSttCommand();
  });

  ttsProvider.addEventListener("change", () => {
    updateFieldVisibility();
    fetchAndPopulateVoices(ttsProvider, ttsVoice, ttsStatus);
  });

  // --- Refresh buttons ---

  refreshLlm.addEventListener("click", () => fetchAndPopulateModels("llm", llmProvider, llmModel, llmStatus));
  refreshTts.addEventListener("click", () => fetchAndPopulateVoices(ttsProvider, ttsVoice, ttsStatus));

  // --- Data actions ---

  fetchDataBtn.addEventListener("click", fetchGameData);

  clearDataBtn.addEventListener("click", async () => {
    await window.operator.clearGameData();
    refreshDataStatus();
  });

  autoFetchData.addEventListener("change", async () => {
    await saveSettings(["AUTO_FETCH_DATA"]);
  });

  // --- Save buttons ---

  $("save-llm-btn").addEventListener("click", async () => {
    await saveSettings(["LLM_PROVIDER", "LLM_BASE_URL", "LLM_MODEL"]);
    const fb = $("save-llm-feedback");
    fb.classList.remove("hidden");
    setTimeout(() => fb.classList.add("hidden"), 2000);
    refreshHomeStatus();
  });

  $("save-voice-btn").addEventListener("click", async () => {
    await saveSettings(["STT_PROVIDER", "STT_MODEL", "TTS_PROVIDER", "TTS_VOICE"]);
    const fb = $("save-voice-feedback");
    fb.classList.remove("hidden");
    setTimeout(() => fb.classList.add("hidden"), 2000);
    refreshHomeStatus();
  });

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
    refreshHomeStatus();
  });

  const pttKeySelect = $("input-PTT_KEY");
  pttKeySelect.addEventListener("change", async () => {
    await saveSettings(["PTT_KEY"]);
    if (toggleBtn.textContent === "Disable Operator") {
      await window.operator.toggle();
      await window.operator.toggle();
    }
  });

  // --- Toggle ---

  toggleBtn.addEventListener("click", async () => {
    const result = await window.operator.toggle();
    updateUI(result.enabled);
  });

  window.operator.onStatusChange((s) => updateUI(s.enabled));

  // --- Logs ---

  window.operator.onLog((entry) => appendLog(entry));
  clearBtn.addEventListener("click", () => { logContainer.innerHTML = ""; });

  window.operator.onDataUpdated(() => {
    refreshDataStatus();
    // If showing "Done!" from auto-fetch, update button
    if (fetchDataBtn.textContent === "Fetching...") {
      fetchDataBtn.disabled = false;
      fetchDataBtn.textContent = "Fetch All";
      dataProgressText.textContent = "Done!";
      dataProgressCurrent.textContent = "";
      setTimeout(() => dataProgress.classList.add("hidden"), 3000);
    }
  });

  // --- SoX ---

  checkSoxBtn.addEventListener("click", checkSox);
});
