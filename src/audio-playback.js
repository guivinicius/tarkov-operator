// Audio playback via platform-native players.
// macOS: afplay, Windows: PowerShell MediaPlayer, Linux: aplay/paplay

const { spawn } = require("child_process");
const { platform } = require("os");
const path = require("path");
const fs = require("fs");
const os = require("os");

function getTempFile(ext) {
  return path.join(os.tmpdir(), `tarkov-op-${Date.now()}.${ext}`);
}

function playBuffer(audioBuffer, ext = "mp3") {
  return new Promise((resolve, reject) => {
    const tmpFile = getTempFile(ext);
    fs.writeFileSync(tmpFile, audioBuffer);

    let player;

    if (platform() === "darwin") {
      player = spawn("afplay", [tmpFile], { stdio: "ignore" });
    } else if (platform() === "win32") {
      // Windows: use PowerShell to play via MediaPlayer
      const psScript = `
        $player = New-Object System.Media.SoundPlayer;
        $player.SoundLocation = '${tmpFile.replace(/'/g, "''")}';
        $player.PlaySync();
      `;
      player = spawn("powershell", ["-NoProfile", "-Command", psScript], { stdio: "ignore" });
    } else {
      // Linux: try paplay, then aplay
      try {
        player = spawn("paplay", [tmpFile], { stdio: "ignore" });
      } catch {
        player = spawn("aplay", [tmpFile], { stdio: "ignore" });
      }
    }

    player.on("error", (err) => {
      fs.unlinkSync(tmpFile);
      reject(err);
    });

    player.on("close", (code) => {
      try { fs.unlinkSync(tmpFile); } catch {}
      if (code === 0) resolve();
      else reject(new Error(`Player exited with code ${code}`));
    });
  });
}

module.exports = { playBuffer };
