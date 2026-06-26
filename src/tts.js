// Text-to-speech via ElevenLabs API.
// Fallback: platform-native TTS (say on macOS, SAPI on Windows).

const { spawn, execSync } = require("child_process");
const { platform } = require("os");
const path = require("path");
const fs = require("fs");
const os = require("os");
const https = require("https");

async function synthesizeElevenLabs(text, opts = {}) {
  const apiKey = opts.apiKey || process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ElevenLabs API key required");

  const voiceId = opts.voice || opts.voiceId || "pNInz6obpgDQGcFmaJgB";
  const modelId = opts.modelId || "eleven_turbo_v2_5";

  return new Promise((resolve, reject) => {
    const reqBody = JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0.15 },
    });

    const req = https.request(
      {
        hostname: "api.elevenlabs.io",
        path: `/v1/text-to-speech/${voiceId}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
          "Content-Length": Buffer.byteLength(reqBody),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          if (res.statusCode === 200) resolve(buffer);
          else reject(new Error(`ElevenLabs API error ${res.statusCode}`));
        });
      }
    );

    req.on("error", reject);
    req.write(reqBody);
    req.end();
  });
}

async function synthesizeLocal(text, opts = {}) {
  const voiceId = opts.voice || "";
  let tmpFile, format;

  if (platform() === "darwin") {
    tmpFile = path.join(os.tmpdir(), `tarkov-tts-${Date.now()}.aiff`);
    format = "aiff";
    const voiceArg = voiceId ? `-v ${voiceId} ` : "-v Daniel ";
    execSync(`say ${voiceArg}-o "${tmpFile}" "${text.replace(/"/g, '\\"')}"`, {
      timeout: 15000,
    });
  } else if (platform() === "win32") {
    tmpFile = path.join(os.tmpdir(), `tarkov-tts-${Date.now()}.wav`);
    format = "wav";
    const voiceSelect = voiceId
      ? `$synth.SelectVoice('${voiceId.replace(/'/g, "''")}');`
      : `try{$synth.SelectVoice('Microsoft David Desktop')}catch{};`;
    const psScript = `
      Add-Type -AssemblyName System.Speech;
      $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;
      ${voiceSelect}
      $synth.SetOutputToWaveFile('${tmpFile.replace(/'/g, "''")}');
      $synth.Speak('${text.replace(/'/g, "''")}');
      $synth.Dispose();
    `;
    execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`, {
      timeout: 15000,
    });
  } else {
    tmpFile = path.join(os.tmpdir(), `tarkov-tts-${Date.now()}.wav`);
    format = "wav";
    execSync(`espeak "${text.replace(/"/g, '\\"')}" -w "${tmpFile}"`, {
      timeout: 15000,
    });
  }

  const audioBuffer = fs.readFileSync(tmpFile);
  try { fs.unlinkSync(tmpFile); } catch {}
  return { audio: audioBuffer, format };
}

async function synthesize(text, opts = {}) {
  // Try ElevenLabs, fall back to local
  const apiKey = opts.apiKey || process.env.ELEVENLABS_API_KEY;
  if (apiKey && apiKey !== "***" && apiKey.trim()) {
    try {
      const t0 = performance.now();
      const audio = await synthesizeElevenLabs(text, opts);
      const latency = (performance.now() - t0) / 1000;
      return { audio, format: "mp3", latency };
    } catch (err) {
      console.log(`[TTS] ElevenLabs failed: ${err.message}, using local fallback`);
    }
  }

  const t0 = performance.now();
  const localResult = await synthesizeLocal(text, opts);
  const latency = (performance.now() - t0) / 1000;
  return { audio: localResult.audio, format: localResult.format, latency };
}

module.exports = { synthesize, synthesizeElevenLabs, synthesizeLocal };
