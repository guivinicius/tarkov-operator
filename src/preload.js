const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("operator", {
  getStatus: () => ipcRenderer.invoke("get-status"),
  toggle: () => ipcRenderer.invoke("toggle"),
  getLogs: () => ipcRenderer.invoke("get-logs"),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  updateSettings: (s) => ipcRenderer.invoke("update-settings", s),
  getDisplays: () => ipcRenderer.invoke("get-displays"),
  captureTestScreenshot: () => ipcRenderer.invoke("capture-test-screenshot"),
  getLastScreenshot: () => ipcRenderer.invoke("get-last-screenshot"),
  openScreenshotsFolder: () => ipcRenderer.invoke("open-screenshots-folder"),
  onScreenshotCaptured: (cb) => {
    const h = (_e, data) => cb(data);
    ipcRenderer.on("screenshot-captured", h);
    return () => ipcRenderer.removeListener("screenshot-captured", h);
  },
  recordPttKey: () => ipcRenderer.invoke("record-ptt-key"),
  cancelRecordPttKey: () => ipcRenderer.invoke("cancel-record-ptt-key"),

  fetchModels: (category, provider, apiKey, baseURL) =>
    ipcRenderer.invoke("fetch-models", category, provider, apiKey, baseURL),

  fetchVoices: (provider, apiKey) =>
    ipcRenderer.invoke("fetch-voices", provider, apiKey),

  validateKey: (provider, apiKey) =>
    ipcRenderer.invoke("validate-key", provider, apiKey),

  onLog: (cb) => {
    const h = (_e, entry) => cb(entry);
    ipcRenderer.on("log", h);
    return () => ipcRenderer.removeListener("log", h);
  },

  onStatusChange: (cb) => {
    const h = (_e, s) => cb(s);
    ipcRenderer.on("status-changed", h);
    return () => ipcRenderer.removeListener("status-changed", h);
  },

  onPipelineError: (cb) => {
    const h = (_e, err) => cb(err);
    ipcRenderer.on("pipeline-error", h);
    return () => ipcRenderer.removeListener("pipeline-error", h);
  },

  newSession: () => ipcRenderer.invoke("new-session"),

  getDataStatus: () => ipcRenderer.invoke("get-data-status"),
  fetchGameData: (onProgress) => {
    const h = (_e, stage) => onProgress(stage);
    ipcRenderer.on("data-progress", h);
    return ipcRenderer.invoke("fetch-game-data").finally(() => {
      ipcRenderer.removeListener("data-progress", h);
    });
  },
  clearGameData: () => ipcRenderer.invoke("clear-game-data"),
  onDataUpdated: (cb) => {
    const h = () => cb();
    ipcRenderer.on("data-updated", h);
    return () => ipcRenderer.removeListener("data-updated", h);
  },

  getMemory: () => ipcRenderer.invoke("get-memory"),
  setMemory: (key, value) => ipcRenderer.invoke("set-memory", key, value),
  deleteMemory: (key) => ipcRenderer.invoke("delete-memory", key),
  clearMemory: () => ipcRenderer.invoke("clear-memory"),

  testTTS: (opts) => ipcRenderer.invoke("test-tts", opts),

  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  onUpdateStatus: (cb) => {
    const h = (_e, data) => cb(data);
    ipcRenderer.on("update-status", h);
    return () => ipcRenderer.removeListener("update-status", h);
  },
});
