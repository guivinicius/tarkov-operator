const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  onPlay: (callback) => {
    ipcRenderer.removeAllListeners("play-audio");
    ipcRenderer.on("play-audio", (_event, opts) => callback(opts));
  },
  sendDone: (id) => ipcRenderer.send("play-done", id),
  sendError: (id, msg) => ipcRenderer.send("play-error", id, msg),
});
