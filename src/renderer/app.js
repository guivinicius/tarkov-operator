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
  const ttsModel = $("input-TTS_MODEL");
  const ttsVoice = $("input-TTS_VOICE");
  const autoFetchData = $("input-AUTO_FETCH_DATA");
  const homeStatusText = $("home-status-text");

  const refreshLlm = $("refresh-llm-models");
  const refreshTts = $("refresh-tts-voices");
  const refreshTtsModels = $("refresh-tts-models");
  const newSessionBtn = $("new-session-btn");
  const sessionInfo = $("session-info");
  const fetchDataBtn = $("fetch-data-btn");
  const clearDataBtn = $("clear-data-btn");

  const llmStatus = $("llm-models-status");
  const ttsStatus = $("tts-voices-status");
  const ttsModelsStatus = $("tts-models-status");
  const testTtsBtn = $("test-tts-btn");
  const testTtsStatus = $("tts-test-status");
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
    if (tabId === "data") refreshDataStatus();
    if (tabId === "memory") refreshMemory();
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
      if (depIs) {
        const accepted = depIs.split(",").map(v => v.trim());
        if (!accepted.includes(actual)) show = false;
      }
      if (depNot) {
        const rejected = depNot.split(",").map(v => v.trim());
        if (rejected.includes(actual)) show = false;
      }
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
    if (category === "tts" && provider === "openrouter") {
      apiKey = settings.OPENROUTER_API_KEY;
    }

    statusEl.textContent = "Loading...";
    const result = await window.operator.fetchModels(category, provider, apiKey, baseURL);

    if (result.error) {
      statusEl.textContent = `Error: ${result.error}`;
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
    let apiKey = "";
    let model = "";
    if (provider === "openrouter") {
      apiKey = settings.OPENROUTER_API_KEY;
      model = ttsModel.value;
    }

    statusEl.textContent = "Loading...";
    const result = await window.operator.fetchVoices(provider, apiKey, model);

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
    if (el.type === "checkbox") {
      data[key] = el.checked;
    } else if (el.tagName === "SELECT" || el.type !== "password") {
      data[key] = el.value;
    } else {
        const orig = el.dataset.originalValue || "";
        if (el.value !== orig) data[key] = el.value;
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

  async function refreshMemory() {
    const data = await window.operator.getMemory();
    const tbody = document.getElementById("memory-body");
    const empty = document.getElementById("memory-empty");
    const actions = document.getElementById("memory-actions");
    tbody.innerHTML = "";
    if (data.error || !data.length) {
      empty.style.display = "";
      actions.style.display = "none";
      return;
    }
    empty.style.display = "none";
    actions.style.display = "";
    for (const row of data) {
      const tr = document.createElement("tr");
      const keyTd = document.createElement("td");
      keyTd.textContent = row.key;
      const valTd = document.createElement("td");
      const valInput = document.createElement("input");
      valInput.type = "text";
      valInput.value = row.value;
      valInput.className = "memory-edit-input";
      valInput.dataset.key = row.key;
      valInput.dataset.originalValue = row.value;
      valInput.addEventListener("change", async () => {
        if (valInput.value !== valInput.dataset.originalValue) {
          await window.operator.setMemory(row.key, valInput.value);
          valInput.dataset.originalValue = valInput.value;
        }
      });
      valTd.appendChild(valInput);
      const timeTd = document.createElement("td");
      timeTd.className = "memory-time";
      timeTd.textContent = row.updated_at ? new Date(row.updated_at + "Z").toLocaleString() : "";
      const delTd = document.createElement("td");
      const delBtn = document.createElement("button");
      delBtn.className = "btn-sm";
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", async () => {
        await window.operator.deleteMemory(row.key);
        refreshMemory();
      });
      delTd.appendChild(delBtn);
      tr.appendChild(keyTd);
      tr.appendChild(valTd);
      tr.appendChild(timeTd);
      tr.appendChild(delTd);
      tbody.appendChild(tr);
    }
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
    if (el.type === "password") {
      el.dataset.originalValue = value || "";
      if (value) {
        el.placeholder = "••••••••••••••••";
      }
    } else if (el.type === "checkbox") {
      el.checked = value !== false;
    } else {
      el.value = value;
    }
  }

  // --- Init ---

  updateFieldVisibility();
  fetchAndPopulateModels("llm", llmProvider, llmModel, llmStatus);
  fetchAndPopulateModels("stt", sttProvider, sttModel, ttsStatus);
  fetchAndPopulateModels("tts", ttsProvider, ttsModel, ttsModelsStatus);
  fetchAndPopulateVoices(ttsProvider, ttsVoice, ttsStatus);
  checkSox();
  refreshDataStatus();
  refreshHomeStatus();

  const status = await window.operator.getStatus();
  updateUI(status.enabled);

  const logs = await window.operator.getLogs();
  for (const entry of logs) appendLog(entry);

  // --- Provider changes ---

  llmProvider.addEventListener("change", async () => {
    updateFieldVisibility();
    const v = llmProvider.value;
    $("input-LLM_BASE_URL").value =
      v === "ollama" ? "http://localhost:11434/v1" :
      v === "openrouter" ? "https://openrouter.ai/api/v1" :
      v === "openai" ? "https://api.openai.com/v1" :
      v === "anthropic" ? "https://api.anthropic.com/v1" : "";
    await saveSettings(["LLM_PROVIDER", "LLM_BASE_URL"]);
    refreshHomeStatus();
  });

  function updateLocalSttCommand() {
    const el = document.getElementById("local-stt-cmd");
    if (!el) return;
    const p = navigator.platform;
    if (p.startsWith("Mac")) el.textContent = "pip3 install openai-whisper";
    else if (p.startsWith("Win")) el.textContent = "pip install openai-whisper";
    else el.textContent = "pip3 install openai-whisper";
  }

  sttProvider.addEventListener("change", async () => {
    updateFieldVisibility();
    await fetchAndPopulateModels("stt", sttProvider, sttModel, {});
    updateLocalSttCommand();
    await saveSettings(["STT_PROVIDER", "STT_MODEL"]);
    refreshHomeStatus();
  });

  sttModel.addEventListener("change", async () => {
    await saveSettings(["STT_MODEL"]);
  });

  ttsProvider.addEventListener("change", async () => {
    updateFieldVisibility();
    await fetchAndPopulateModels("tts", ttsProvider, ttsModel, ttsModelsStatus);
    await fetchAndPopulateVoices(ttsProvider, ttsVoice, ttsStatus);
    await saveSettings(["TTS_PROVIDER", "TTS_VOICE", "TTS_MODEL"]);
    refreshHomeStatus();
  });

  ttsModel.addEventListener("change", async () => {
    await fetchAndPopulateVoices(ttsProvider, ttsVoice, ttsStatus);
    await saveSettings(["TTS_MODEL"]);
  });

  ttsVoice.addEventListener("change", async () => {
    await saveSettings(["TTS_VOICE"]);
  });

  testTtsBtn.addEventListener("click", async () => {
    testTtsBtn.disabled = true;
    testTtsStatus.textContent = "Playing...";
    const settings = await window.operator.getSettings();
    await window.operator.testTTS({
      provider: settings.TTS_PROVIDER,
      apiKey:
        settings.TTS_PROVIDER === "openrouter" ? settings.OPENROUTER_API_KEY :
        settings.TTS_PROVIDER === "elevenlabs" ? settings.ELEVENLABS_API_KEY : "",
      voice: settings.TTS_VOICE,
      model: settings.TTS_MODEL,
    });
    testTtsStatus.textContent = "Done";
    testTtsBtn.disabled = false;
    setTimeout(() => { testTtsStatus.textContent = ""; }, 3000);
  });

  $("input-LLM_BASE_URL").addEventListener("change", async () => {
    await saveSettings(["LLM_BASE_URL"]);
  });

  llmModel.addEventListener("change", async () => {
    await saveSettings(["LLM_MODEL"]);
  });

  // Auto-save password fields on blur (only if user actually typed)
  for (const key of ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "ELEVENLABS_API_KEY", "WHISPER_API_KEY"]) {
    const el = $(`input-${key}`);
    if (el) {
      el.addEventListener("input", () => { el.dataset.modified = "true"; });
      el.addEventListener("blur", async () => {
        if (el.dataset.modified) {
          await saveSettings([key]);
          refreshHomeStatus();
          delete el.dataset.modified;
        }
      });
    }
  }

  // --- Refresh buttons ---

  refreshLlm.addEventListener("click", () => fetchAndPopulateModels("llm", llmProvider, llmModel, llmStatus));
  refreshTts.addEventListener("click", () => fetchAndPopulateVoices(ttsProvider, ttsVoice, ttsStatus));
  refreshTtsModels.addEventListener("click", () => fetchAndPopulateModels("tts", ttsProvider, ttsModel, ttsModelsStatus));

  newSessionBtn.addEventListener("click", async () => {
    await window.operator.newSession();
    exchangeCount = 0;
    sessionInfo.textContent = "New session started";
    setTimeout(() => { sessionInfo.textContent = "0 exchanges"; }, 2000);
  });

  let exchangeCount = 0;
  window.operator.onLog((entry) => {
    if (entry.message.startsWith("[op]")) {
      exchangeCount++;
      sessionInfo.textContent = `${exchangeCount} exchange${exchangeCount !== 1 ? "s" : ""}`;
    }
  });

  // --- Data actions ---

  fetchDataBtn.addEventListener("click", fetchGameData);

  clearDataBtn.addEventListener("click", async () => {
    await window.operator.clearGameData();
    refreshDataStatus();
  });

  autoFetchData.addEventListener("change", async () => {
    await saveSettings(["AUTO_FETCH_DATA"]);
  });

  document.getElementById("clear-memory-btn").addEventListener("click", async () => {
    await window.operator.clearMemory();
    refreshMemory();
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
