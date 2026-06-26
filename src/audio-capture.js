// Mic capture via SoX rec (cross-platform: macOS, Windows, Linux)
// Falls back to platform-native methods if SoX is missing.

const { spawn } = require("child_process");
const { platform } = require("os");

let recProcess = null;
let onData = null;

function isSoxInstalled() {
  try {
    require("child_process").execSync("sox --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function startCapture(opts = {}) {
  return new Promise((resolve, reject) => {
    if (recProcess) {
      reject(new Error("Already capturing"));
      return;
    }

    const sampleRate = opts.sampleRate || 16000;

    if (isSoxInstalled()) {
      recProcess = spawn("rec", [
        "-q",
        "-t", "wav",
        "-r", String(sampleRate),
        "-c", "1",
        "-b", "16",
        "-e", "signed-integer",
        "-",
      ], { stdio: ["ignore", "pipe", "pipe"] });

      const chunks = [];
      recProcess.stdout.on("data", (chunk) => chunks.push(chunk));
      recProcess.stderr.on("data", () => {});

      recProcess.on("error", (err) => {
        recProcess = null;
        reject(err);
      });

      recProcess.on("close", () => {
        recProcess = null;
        const buffer = Buffer.concat(chunks);
        if (onData) onData(buffer);
      });

      resolve();
    } else if (platform() === "darwin") {
      // macOS fallback: use avfoundation via a short ffmpeg command
      recProcess = spawn("ffmpeg", [
        "-f", "avfoundation",
        "-i", ":0",
        "-ac", "1",
        "-ar", String(sampleRate),
        "-f", "wav",
        "-",
      ], { stdio: ["ignore", "pipe", "pipe"] });

      const chunks = [];
      recProcess.stdout.on("data", (chunk) => chunks.push(chunk));
      recProcess.stderr.on("data", () => {});

      recProcess.on("error", (err) => {
        recProcess = null;
        reject(err);
      });

      recProcess.on("close", (code) => {
        recProcess = null;
        const buffer = Buffer.concat(chunks);
        if (onData) onData(buffer);
      });

      resolve();
    } else {
      reject(new Error(
        "Audio capture requires SoX (rec) installed.\n" +
        "macOS: brew install sox\n" +
        "Windows: choco install sox.portable\n" +
        "Linux: apt install sox"
      ));
    }
  });
}

function stopCapture() {
  return new Promise((resolve) => {
    if (!recProcess) {
      resolve(null);
      return;
    }

    recProcess.on("close", () => {
      recProcess = null;
    });

    // Send SIGTERM (macOS) or Ctrl+C equivalent
    recProcess.kill(platform() === "win32" ? "SIGINT" : "SIGTERM");

    // Force kill after 2s if still alive
    setTimeout(() => {
      if (recProcess) {
        recProcess.kill("SIGKILL");
        recProcess = null;
      }
      resolve(null);
    }, 2000);
  });
}

function onCaptureComplete(callback) {
  onData = callback;
}

module.exports = { startCapture, stopCapture, onCaptureComplete, isSoxInstalled };
