const path = require("path");
const { BrowserWindow, ipcMain } = require("electron");

let playerWindow = null;
let readyPromise = null;
let playIdCounter = 0;
const pendingPlays = new Map();

function registerIpc() {
  ipcMain.on("play-done", (_event, id) => {
    if (pendingPlays.has(id)) {
      pendingPlays.get(id).resolve();
      pendingPlays.delete(id);
    }
  });

  ipcMain.on("play-error", (_event, id, msg) => {
    if (pendingPlays.has(id)) {
      pendingPlays.get(id).reject(new Error(msg));
      pendingPlays.delete(id);
    }
  });
}

registerIpc();

function ensureWindow() {
  if (playerWindow && !playerWindow.isDestroyed()) return readyPromise;

  playerWindow = new BrowserWindow({
    show: false,
    width: 320,
    height: 200,
    skipTaskbar: true,
    webPreferences: {
      preload: path.resolve(__dirname, "renderer", "player-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  readyPromise = new Promise((resolve) => {
    playerWindow.webContents.once("did-finish-load", () => resolve());
  });

  playerWindow.on("closed", () => {
    playerWindow = null;
    readyPromise = null;
    // Reject any pending plays
    for (const [id, pending] of pendingPlays.entries()) {
      pending.reject(new Error("Player window closed"));
    }
    pendingPlays.clear();
  });

  playerWindow.loadFile(path.resolve(__dirname, "renderer", "player.html"));
  return readyPromise;
}

function playBuffer(audioBuffer, format, options = {}) {
  return ensureWindow().then(() => {
    return new Promise((resolve, reject) => {
      const id = ++playIdCounter;
      pendingPlays.set(id, { resolve, reject });

      // Send the buffer directly; IPC handles Uint8Array automatically.
      playerWindow.webContents.send("play-audio", {
        id,
        buffer: audioBuffer,
        applyRadioFilter: options.radioFilter || false,
        deviceId: options.deviceId || undefined,
      });
    });
  });
}

function destroy() {
  if (playerWindow && !playerWindow.isDestroyed()) playerWindow.destroy();
  playerWindow = null;
  readyPromise = null;
}

module.exports = { playBuffer, destroy };
