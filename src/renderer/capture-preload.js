const { contextBridge, ipcRenderer } = require("electron");

// Narrow bridge for the hidden capture window. Deliberately exposes only the
// capture channels, never a generic send().
contextBridge.exposeInMainWorld("captureBridge", {
  onStart: (cb) => {
    ipcRenderer.removeAllListeners("capture:start");
    ipcRenderer.on("capture:start", () => cb());
  },
  onStop: (cb) => {
    ipcRenderer.removeAllListeners("capture:stop");
    ipcRenderer.on("capture:stop", () => cb());
  },
  onCancel: (cb) => {
    ipcRenderer.removeAllListeners("capture:cancel");
    ipcRenderer.on("capture:cancel", () => cb());
  },

  started: () => ipcRenderer.send("capture:started"),
  data: (bytes) => ipcRenderer.send("capture:data", bytes),
  empty: () => ipcRenderer.send("capture:empty"),
  error: (message) => ipcRenderer.send("capture:error", message),
});
