document.addEventListener("DOMContentLoaded", async () => {
  const $ = (id) => document.getElementById(id);

  // --- Refs ---
  const statusIndicator = $("status-indicator");
  const statusText = $("status-text");
  const toggleBtn = $("toggle-btn");
  const logContainer = $("log-container");
  const clearBtn = $("clear-logs-btn");

  const llmProvider = $("input-LLM_PROVIDER");
  const sttProvider = $("input-STT_PROVIDER");
  const ttsProvider = $("input-TTS_PROVIDER");

  const llmModel = $("input-LLM_MODEL");
  const sttModel = $("input-STT_MODEL");
  const ttsModel = $("input-TTS_MODEL");
  const ttsVoice = $("input-TTS_VOICE");
  const radioFilter = $("input-RADIO_FILTER");
  const autoFetchData = $("input-AUTO_FETCH_DATA");
  const firstRun = $("first-run");
  const firstRunPtt = $("first-run-ptt");
  const homeDesc = $("home-desc");
  const homeDescPtt = $("home-desc-ptt");
  const sttSummary = $("stt-summary");
  const pttKeyBtn = $("btn-record-ptt");
  const pttModeSelect = $("input-PTT_MODE");

  let operatorEnabled = false;
  const refreshLlm = $("refresh-llm-models");
  const refreshTts = $("refresh-tts-voices");
  const refreshTtsModels = $("refresh-tts-models");
  const newSessionBtn = $("new-session-btn");
  const sessionInfo = $("session-info");
  const fetchDataBtn = $("fetch-data-btn");
  const clearDataBtn = $("clear-data-btn");

  const llmStatus = $("llm-models-status");
  const ttsStatus = $("tts-voices-status");
  const sttStatus = $("stt-models-status");
  const refreshSttModels = $("refresh-stt-models");
  const ttsModelsStatus = $("tts-models-status");
  const testTtsBtn = $("test-tts-btn");
  const testTtsStatus = $("tts-test-status");
  const dataProgress = $("data-progress");
  const dataProgressText = $("data-progress-text");
  const dataProgressCurrent = $("data-progress-current");

  const btnCheckUpdate = $("btn-check-update");
  const btnDownloadUpdate = $("btn-download-update");
  const btnInstallUpdate = $("btn-install-update");
  const updateStatusText = $("update-status-text");

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
      const depEl = $(`input-${depends}`);
      // For checkboxes, compare against "true"/"false" strings
      const actual = depEl.type === "checkbox" ? String(depEl.checked) : depEl.value;
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
      const opt = document.createElement("option");
      opt.value = selectedId || "";
      opt.textContent = selectedId || "(none)";
      el.appendChild(opt);
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

  const NEEDS_KEY_MESSAGE = "Add a key in Providers first";

  const LLM_PROVIDER_LABELS = {
    openrouter: "OpenRouter",
    openai: "OpenAI",
    anthropic: "Anthropic",
  };

  const STT_SUMMARIES = {
    openrouter: "Your voice is transcribed with the OpenRouter key you already added.",

    openai: "Your voice is transcribed by OpenAI.",
    elevenlabs: "Your voice is transcribed by ElevenLabs.",
    local: "Your voice is transcribed on this machine by local Whisper.",
  };

  // Read from the live input rather than saved settings so gating reacts to
  // typing. Saved password fields keep their value in dataset, not in .value.
  function keyValue(keyName) {
    const el = $(`input-${keyName}`);
    if (!el) return "";
    return (el.value || el.dataset.originalValue || "").trim();
  }

  function requiredCredential() {
    const provider = llmProvider.value || "openrouter";
    const label = LLM_PROVIDER_LABELS[provider] || provider;
    return { provider, label, satisfied: Boolean(keyValue(`${provider.toUpperCase()}_API_KEY`)) };
  }

  function refreshOperatorGate() {
    const credential = requiredCredential();
    // An already-running operator must always be switchable off.
    const blocked = !operatorEnabled && !credential.satisfied;
    toggleBtn.disabled = blocked;
    if (blocked) toggleBtn.title = `Add your ${credential.label} key in Providers first`;
    else toggleBtn.removeAttribute("title");
  }

  function setPttLabels(key) {
    firstRunPtt.textContent = key;
    homeDescPtt.textContent = key;
    pttKeyBtn.textContent = key;
  }

  function updateSttSummary() {
    sttSummary.textContent = STT_SUMMARIES[sttProvider.value] || STT_SUMMARIES.openrouter;
  }

  // needsKey reflects whether the provider is usable, not whether its
  // listing endpoint is public — OpenRouter and ElevenLabs list without auth.
  function keyFor(category, provider, settings) {
    if (category === "llm") {
      const apiKey = settings[`${provider.toUpperCase()}_API_KEY`] || "";
      return { apiKey, needsKey: true };
    }
    if (category === "stt") {
      if (provider === "local") return { apiKey: "", needsKey: false };
      if (provider === "elevenlabs") {
        return { apiKey: settings.ELEVENLABS_API_KEY || "", needsKey: true };
      }
      if (provider === "openrouter") {
        return { apiKey: settings.OPENROUTER_API_KEY || "", needsKey: true };
      }
      if (provider === "openai") {
        return { apiKey: settings.OPENAI_API_KEY || "", needsKey: true };
      }
      return {
        apiKey: settings.OPENAI_API_KEY || settings.OPENROUTER_API_KEY || "",
        needsKey: true,
      };
    }
    if (provider === "openrouter") {
      return { apiKey: settings.OPENROUTER_API_KEY || "", needsKey: true };
    }
    if (provider === "elevenlabs") {
      return { apiKey: settings.ELEVENLABS_API_KEY || "", needsKey: true };
    }
    if (provider === "openai") {
      return { apiKey: settings.OPENAI_API_KEY || "", needsKey: true };
    }
    return { apiKey: "", needsKey: false };
  }

  function setStatus(statusEl, text) {
    if (statusEl) statusEl.textContent = text;
  }

  function savedValueFor(selectEl, settings) {
    return settings[selectEl.id.replace("input-", "")] || selectEl.value || "";
  }

  async function fetchAndPopulateModels(category, providerSelect, modelSelect, statusEl) {
    const provider = providerSelect.value;
    const settings = await window.operator.getSettings();
    const baseURL = $("input-LLM_BASE_URL").value;
    const { apiKey, needsKey } = keyFor(category, provider, settings);
    const saved = savedValueFor(modelSelect, settings);

    if (needsKey && !apiKey) {
      setSelect(modelSelect, [], "");
      setStatus(statusEl, NEEDS_KEY_MESSAGE);
      return;
    }

    setStatus(statusEl, "Loading...");
    const result = await window.operator.fetchModels(category, provider, apiKey, baseURL);

    if (result.error) {
      setStatus(statusEl, `Error: ${result.error}`);
      return;
    }

    setSelect(modelSelect, result, saved);
    setStatus(statusEl, `${result.length} models`);
    setTimeout(() => setStatus(statusEl, ""), 3000);
  }

  async function fetchAndPopulateVoices(providerSelect, voiceSelect, statusEl) {
    const provider = providerSelect.value;
    const settings = await window.operator.getSettings();
    const { apiKey, needsKey } = keyFor("tts", provider, settings);
    const saved = savedValueFor(voiceSelect, settings);

    if (needsKey && !apiKey) {
      setSelect(voiceSelect, [], "");
      setStatus(statusEl, NEEDS_KEY_MESSAGE);
      return;
    }

    setStatus(statusEl, "Loading...");
    const result = await window.operator.fetchVoices(provider, apiKey);

    if (result.error) {
      setStatus(statusEl, `Error: ${result.error}`);
      setSelect(voiceSelect, [], "");
      return;
    }

    setSelect(voiceSelect, result, saved);
    setStatus(statusEl, `${result.length} voices`);
    setTimeout(() => setStatus(statusEl, ""), 3000);
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
    const credential = requiredCredential();

    // First run is "cannot run yet", not "hasn't filled every field".
    firstRun.classList.toggle("hidden", credential.satisfied);
    homeDesc.classList.toggle("hidden", !credential.satisfied);
    setPttLabels(settings.PTT_KEY?.name || "F1");

    refreshOperatorGate();
  }

  async function fetchGameData() {
    if (fetchDataBtn.disabled) return;
    try {
      fetchDataBtn.disabled = true;
      fetchDataBtn.textContent = "Fetching...";
      dataProgress.classList.remove("hidden");
      dataProgressText.textContent = "Fetching from tarkov.dev...";
      dataProgressCurrent.textContent = "";

      const res = await window.operator.fetchGameData((stage) => {
        dataProgressCurrent.textContent = stage;
      });
      
      if (res && res.error) throw new Error(res.error);
      
      dataProgressText.textContent = "Done!";
    } catch (err) {
      dataProgressText.textContent = `Error: ${err.message}`;
    } finally {
      dataProgressCurrent.textContent = "";
      fetchDataBtn.disabled = false;
      fetchDataBtn.textContent = "Fetch All";
      setTimeout(() => dataProgress.classList.add("hidden"), 3000);
      refreshDataStatus();
    }
  }

  async function updateProviderDropdowns() {
    const settings = await window.operator.getSettings();

    async function updateSelect(id, allOptions, alwaysInclude = []) {
      const el = $(id);
      if (!el) return;
      
      const currentVal = el.value || settings[id.replace("input-", "")];
      
      const validOptions = allOptions.filter(o => 
        alwaysInclude.includes(o.value) || 
        (o.value === "openrouter" && settings.OPENROUTER_API_KEY) ||
        (o.value === "openai" && settings.OPENAI_API_KEY) ||
        (o.value === "anthropic" && settings.ANTHROPIC_API_KEY) ||
        (o.value === "elevenlabs" && settings.ELEVENLABS_API_KEY)
      );

      el.innerHTML = "";
      if (validOptions.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "No keys configured";
        el.appendChild(opt);
      } else {
        validOptions.forEach(o => {
          const opt = document.createElement("option");
          opt.value = o.value;
          opt.textContent = o.text;
          el.appendChild(opt);
        });
      }

      const validValues = validOptions.map(o => o.value);
      if (validValues.includes(currentVal)) {
        el.value = currentVal;
      } else {
        el.value = validOptions.length ? validOptions[0].value : "";
        if (el.value !== currentVal) {
          await saveSettings([id.replace("input-", "")]);
        }
      }
    }

    await updateSelect("input-LLM_PROVIDER", [
      { value: "openrouter", text: "OpenRouter" },
      { value: "openai", text: "OpenAI" },
      { value: "anthropic", text: "Anthropic" }
    ]);
    
    await updateSelect("input-STT_PROVIDER", [
      { value: "local", text: "Local (Whisper)" },
      { value: "openrouter", text: "OpenRouter" },
      { value: "openai", text: "OpenAI" },
      { value: "elevenlabs", text: "ElevenLabs" }
    ], ["local"]);

    await updateSelect("input-TTS_PROVIDER", [
      { value: "local", text: "Local (system TTS)" },
      { value: "openrouter", text: "OpenRouter" },
      { value: "openai", text: "OpenAI" },
      { value: "elevenlabs", text: "ElevenLabs" }
    ], ["local"]);

    updateFieldVisibility();
    updateSttSummary();
    updateLocalSttCommand();
  }

  async function refreshAllProviderLists() {
    await updateProviderDropdowns();
    await Promise.all([
      fetchAndPopulateModels("llm", llmProvider, llmModel, llmStatus),
      fetchAndPopulateModels("stt", sttProvider, sttModel, sttStatus),
      fetchAndPopulateModels("tts", ttsProvider, ttsModel, ttsModelsStatus),
      fetchAndPopulateVoices(ttsProvider, ttsVoice, ttsStatus),
    ]);
  }

  function updateUI(enabled) {
    operatorEnabled = enabled;
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
    refreshOperatorGate();
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
      if (el.type === "text") {
        el.dataset.originalValue = value || "";
      }
    }
  }

  // --- Init ---

  updateFieldVisibility();
  updateSttSummary();
  await refreshAllProviderLists();
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
      v === "openrouter" ? "https://openrouter.ai/api/v1" :
      v === "openai" ? "https://api.openai.com/v1" :
      v === "anthropic" ? "https://api.anthropic.com/v1" : "";
    await saveSettings(["LLM_PROVIDER", "LLM_BASE_URL"]);
    refreshHomeStatus();
  });

  function updateLocalSttCommand() {
    const el = document.getElementById("local-stt-instructions");
    if (!el) return;
    const p = navigator.platform;
    if (p.startsWith("Win")) {
      el.innerHTML = `
        <p class="hint" style="margin-bottom:6px;font-style:normal;color:#aaa">
          The easiest way on Windows is to download a pre-built <a href="https://github.com/ggml-org/whisper.cpp/releases" target="_blank" style="color:#4caf50">whisper.cpp release</a>, extract it, and add the folder containing <code>whisper.exe</code> to your system PATH.
        </p>
        <p class="hint" style="margin-top:6px;font-style:normal;color:#666">
          Alternatively, use Python: <code class="install-cmd">pip install openai-whisper</code>
        </p>
      `;
    } else {
      el.innerHTML = `
        <p class="hint" style="margin-bottom:4px;font-style:normal;color:#aaa">
          Local Whisper requires <code>openai-whisper</code> (Python):
        </p>
        <code class="install-cmd">pip3 install openai-whisper</code>
        <p class="hint" style="margin-top:4px;font-style:normal;color:#666">
          Or build <a href="https://github.com/ggml-org/whisper.cpp" target="_blank" style="color:#4caf50">whisper.cpp</a> and ensure the <code>whisper</code> binary is on your PATH.
        </p>
      `;
    }
  }

  sttProvider.addEventListener("change", async () => {
    updateFieldVisibility();
    updateSttSummary();
    await fetchAndPopulateModels("stt", sttProvider, sttModel, sttStatus);
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

  const sttLanguage = $("input-STT_LANGUAGE");
  if (sttLanguage) {
    sttLanguage.addEventListener("change", async () => {
      await saveSettings(["STT_LANGUAGE"]);
    });
  }

  const ttsLanguage = $("input-TTS_LANGUAGE");
  if (ttsLanguage) {
    ttsLanguage.addEventListener("change", async () => {
      await saveSettings(["TTS_LANGUAGE"]);
    });
  }

  testTtsBtn.addEventListener("click", async () => {
    testTtsBtn.disabled = true;
    testTtsStatus.textContent = "Playing...";
    const settings = await window.operator.getSettings();
    const result = await window.operator.testTTS({
      provider: settings.TTS_PROVIDER,
      apiKey:
        settings.TTS_PROVIDER === "openrouter" ? settings.OPENROUTER_API_KEY :
        settings.TTS_PROVIDER === "elevenlabs" ? settings.ELEVENLABS_API_KEY :
        settings.TTS_PROVIDER === "openai" ? settings.OPENAI_API_KEY : "",
      voice: settings.TTS_VOICE,
      model: settings.TTS_MODEL,
      language: settings.TTS_LANGUAGE,
    });
    testTtsStatus.textContent = result && result.error ? `Error: ${result.error}` : "Done";
    testTtsBtn.disabled = false;
    setTimeout(() => { testTtsStatus.textContent = ""; }, result && result.error ? 8000 : 3000);
  });

  $("input-LLM_BASE_URL").addEventListener("change", async () => {
    await saveSettings(["LLM_BASE_URL"]);
  });

  const playerNameInput = $("input-PLAYER_NAME");
  if (playerNameInput) {
    playerNameInput.addEventListener("change", async () => {
      await saveSettings(["PLAYER_NAME"]);
    });
  }

  llmModel.addEventListener("change", async () => {
    await saveSettings(["LLM_MODEL"]);
  });

  // Auto-save password fields on blur (only if user actually typed)
  for (const key of ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "ELEVENLABS_API_KEY"]) {
    const el = $(`input-${key}`);
    if (el) {
      el.addEventListener("input", () => {
        el.dataset.modified = "true";
        clearValidateStatus(key);
        refreshOperatorGate();
      });
      el.addEventListener("blur", async () => {
        if (el.dataset.modified) {
          await saveSettings([key]);
          el.dataset.originalValue = el.value;
          delete el.dataset.modified;
          refreshHomeStatus();
          await refreshAllProviderLists();
        }
      });
    }
  }

  // --- Key validation ---

  function clearValidateStatus(key) {
    const statusEl = $(`validate-${key}`);
    if (!statusEl) return;
    statusEl.textContent = "";
    statusEl.className = "validate-status hidden";
  }

  function renderValidateStatus(key, state, message) {
    const statusEl = $(`validate-${key}`);
    if (!statusEl) return;
    const mark = state === "ok" ? "✓ " : state === "fail" ? "✕ " : "";
    statusEl.textContent = `${mark}${message}`;
    statusEl.className = `validate-status${state === "ok" ? " validate-ok" : state === "fail" ? " validate-fail" : ""}`;
  }

  async function persistTypedKeyBeforeValidating(key, input) {
    if (!input || !input.dataset.modified) return;
    await saveSettings([key]);
    input.dataset.originalValue = input.value;
    delete input.dataset.modified;
    refreshHomeStatus();
  }

  for (const btn of document.querySelectorAll(".validate-btn")) {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.key;
      const provider = btn.dataset.provider;
      const input = $(`input-${key}`);

      await persistTypedKeyBeforeValidating(key, input);

      const apiKey = (input && input.value) || (input && input.dataset.originalValue) || "";
      btn.disabled = true;
      renderValidateStatus(key, "pending", "Checking...");
      const result = await window.operator.validateKey(provider, apiKey);
      renderValidateStatus(key, result.ok ? "ok" : "fail", result.message);
      btn.disabled = false;
      if (result.ok) await refreshAllProviderLists();
    });
  }

  // --- Refresh buttons ---

  refreshLlm.addEventListener("click", () => fetchAndPopulateModels("llm", llmProvider, llmModel, llmStatus));
  refreshSttModels.addEventListener("click", () => fetchAndPopulateModels("stt", sttProvider, sttModel, sttStatus));
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

  radioFilter.addEventListener("change", async () => {
    await saveSettings(["RADIO_FILTER"]);
  });

  autoFetchData.addEventListener("change", async () => {
    await saveSettings(["AUTO_FETCH_DATA"]);
  });

  // --- Vision / Screenshot settings ---

  const screenshotEnabled = $("input-SCREENSHOT_ENABLED");
  const screenshotDisplay = $("input-SCREENSHOT_DISPLAY");
  const refreshDisplays = $("refresh-displays");

  async function fetchAndPopulateDisplays() {
    const displays = await window.operator.getDisplays();
    if (!displays || displays.error) return;
    const saved = screenshotDisplay.value;
    // Keep the default option, then add detected displays
    screenshotDisplay.innerHTML = '<option value="">Primary (default)</option>';
    for (const d of displays) {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.name;
      if (d.id === saved) opt.selected = true;
      screenshotDisplay.appendChild(opt);
    }
  }

  screenshotEnabled.addEventListener("change", async () => {
    await saveSettings(["SCREENSHOT_ENABLED"]);
    updateFieldVisibility();
    if (screenshotEnabled.checked) fetchAndPopulateDisplays();
  });

  screenshotDisplay.addEventListener("change", async () => {
    await saveSettings(["SCREENSHOT_DISPLAY"]);
  });

  refreshDisplays.addEventListener("click", () => fetchAndPopulateDisplays());

  // Populate displays on init if screenshot is enabled
  if (screenshotEnabled.checked) fetchAndPopulateDisplays();

  document.getElementById("clear-memory-btn").addEventListener("click", async () => {
    await window.operator.clearMemory();
    refreshMemory();
  });

  pttKeyBtn.addEventListener("click", async () => {
    pttKeyBtn.textContent = "Listening...";
    pttKeyBtn.disabled = true;
    const newKey = await window.operator.recordPttKey();
    pttKeyBtn.disabled = false;
    if (newKey) {
      await window.operator.updateSettings({ PTT_KEY: newKey });
      setPttLabels(newKey.name);
    } else {
      const settings = await window.operator.getSettings();
      setPttLabels(settings.PTT_KEY?.name || "F1");
    }
    
    if (toggleBtn.textContent === "Disable Operator") {
      await window.operator.toggle();
      await window.operator.toggle();
    }
  });

  pttModeSelect.addEventListener("change", async () => {
    await saveSettings(["PTT_MODE"]);
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

  // --- Auto Updates ---
  
  if (btnCheckUpdate) {
    btnCheckUpdate.addEventListener("click", async () => {
      btnCheckUpdate.disabled = true;
      updateStatusText.textContent = "Checking for updates...";
      await window.operator.checkForUpdates();
    });

    btnDownloadUpdate.addEventListener("click", async () => {
      btnCheckUpdate.classList.add("hidden");
      btnDownloadUpdate.classList.add("hidden");
      updateStatusText.textContent = "Downloading...";
      await window.operator.downloadUpdate();
    });

    btnInstallUpdate.addEventListener("click", async () => {
      await window.operator.installUpdate();
    });

    window.operator.onUpdateStatus((data) => {
      switch (data.event) {
        case "update-available":
          updateStatusText.textContent = `Update available: v${data.info.version}`;
          btnCheckUpdate.classList.add("hidden");
          btnDownloadUpdate.classList.remove("hidden");
          btnInstallUpdate.classList.add("hidden");
          break;
        case "update-not-available":
          updateStatusText.textContent = "App is up to date";
          btnCheckUpdate.disabled = false;
          btnCheckUpdate.classList.remove("hidden");
          btnDownloadUpdate.classList.add("hidden");
          btnInstallUpdate.classList.add("hidden");
          break;
        case "download-progress":
          updateStatusText.textContent = `Downloading... ${Math.round(data.progressObj.percent)}%`;
          break;
        case "update-downloaded":
          updateStatusText.textContent = "Update ready to install";
          btnCheckUpdate.classList.add("hidden");
          btnDownloadUpdate.classList.add("hidden");
          btnInstallUpdate.classList.remove("hidden");
          break;
        case "error":
          updateStatusText.textContent = `Error: ${data.message}`;
          btnCheckUpdate.disabled = false;
          btnCheckUpdate.classList.remove("hidden");
          btnDownloadUpdate.classList.add("hidden");
          btnInstallUpdate.classList.add("hidden");
          break;
      }
    });
  }

  // --- Pipeline Error ---
  const homeError = $("home-error");
  window.operator.onPipelineError((err) => {
    homeError.textContent = err.hint || err.message;
    homeError.classList.remove("hidden");
    switchTab("home");
  });

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
});
