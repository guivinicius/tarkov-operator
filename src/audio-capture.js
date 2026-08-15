// Mic capture via a hidden renderer using getUserMedia + Web Audio.
//
// Replaces the previous SoX/ffmpeg subprocess approach, which hard-failed on
// Windows without a terminal install and needed an unbundled ffmpeg on macOS.
// Chromium already ships everything required, so capture now has zero external
// binaries and zero native modules.
//
// The renderer produces a 16 kHz mono 16-bit WAV with a 44-byte header, which
// is the format the STT pipeline in main.js assumes when computing duration.

const path = require("path");
const { BrowserWindow, ipcMain } = require("electron");

let captureWindow = null;
let readyPromise = null;
let onData = null;
let onEmpty = null;
let onError = null;
let startResolve = null;
let startReject = null;
let capturing = false;

function emitError(message) {
  capturing = false;
  if (startReject) {
    const reject = startReject;
    startResolve = null;
    startReject = null;
    reject(new Error(message));
    return;
  }
  if (onError) onError(new Error(message));
}

function registerIpc() {
  ipcMain.on("capture:started", () => {
    capturing = true;
    if (startResolve) {
      const resolve = startResolve;
      startResolve = null;
      startReject = null;
      resolve();
    }
  });

  ipcMain.on("capture:data", (_event, bytes) => {
    capturing = false;
    // Arrives as Uint8Array via structured clone; normalise to Buffer.
    const buffer = Buffer.from(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength || bytes.length);
    if (onData) onData(Buffer.from(buffer));
  });

  ipcMain.on("capture:empty", () => {
    capturing = false;
    if (onEmpty) onEmpty();
  });

  ipcMain.on("capture:error", (_event, message) => {
    emitError(message || "Unknown capture error");
  });
}

registerIpc();

// The window is created lazily so no microphone permission prompt appears
// until the user actually presses push-to-talk for the first time.
function ensureWindow() {
  if (captureWindow && !captureWindow.isDestroyed()) return readyPromise;

  captureWindow = new BrowserWindow({
    show: false,
    width: 320,
    height: 200,
    skipTaskbar: true,
    webPreferences: {
      preload: path.resolve(__dirname, "renderer", "capture-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Hidden windows are throttled by default, which would stall the audio
      // graph and silently truncate recordings.
      backgroundThrottling: false,
    },
  });

  readyPromise = new Promise((resolve) => {
    captureWindow.webContents.once("did-finish-load", () => resolve());
  });

  captureWindow.on("closed", () => {
    captureWindow = null;
    readyPromise = null;
    capturing = false;
  });

  captureWindow.loadFile(path.resolve(__dirname, "renderer", "capture.html"));
  return readyPromise;
}

function startCapture(options = {}) {
  if (capturing) return Promise.reject(new Error("Already capturing"));

  return ensureWindow().then(
    () =>
      new Promise((resolve, reject) => {
        startResolve = resolve;
        startReject = reject;
        captureWindow.webContents.send("capture:start", options);

        // If the renderer never confirms, fail loudly rather than hanging the
        // PTT state machine forever.
        setTimeout(() => {
          if (startReject) {
            const r = startReject;
            startResolve = null;
            startReject = null;
            r(new Error("Microphone did not start (permission denied or no input device)"));
          }
        }, 5000);
      })
  );
}

function stopCapture() {
  if (!captureWindow || captureWindow.isDestroyed()) return;
  captureWindow.webContents.send("capture:stop");
}

function cancelCapture() {
  capturing = false;
  if (!captureWindow || captureWindow.isDestroyed()) return;
  captureWindow.webContents.send("capture:cancel");
}

function onCaptureComplete(callback) {
  onData = callback;
}

function onCaptureEmpty(callback) {
  onEmpty = callback;
}

function onCaptureError(callback) {
  onError = callback;
}

function isCapturing() {
  return capturing;
}

function destroy() {
  if (captureWindow && !captureWindow.isDestroyed()) captureWindow.destroy();
  captureWindow = null;
  readyPromise = null;
  capturing = false;
}

module.exports = {
  startCapture,
  stopCapture,
  cancelCapture,
  onCaptureComplete,
  onCaptureEmpty,
  onCaptureError,
  isCapturing,
  destroy,
};
