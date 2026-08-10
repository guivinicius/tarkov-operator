// Text-to-speech via ElevenLabs API, OpenRouter, or platform-native TTS.

const { spawnSync } = require("child_process");
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

function pcmToWav(pcmData) {
  const sampleRate = 24000;
  const bitsPerSample = 16;
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcmData]);
}

async function synthesizeOpenRouter(text, opts = {}) {
  const apiKey = opts.apiKey;
  if (!apiKey) throw new Error("OpenRouter API key required for TTS");

  const model = opts.model || "openai/gpt-4o-mini-tts-2025-12-15";
  const voice = opts.voice || "alloy";

  return new Promise((resolve, reject) => {
    const reqBody = JSON.stringify({
      model,
      input: text,
      voice,
      response_format: "pcm",
    });

    const req = https.request(
      {
        hostname: "openrouter.ai",
        path: "/api/v1/audio/speech",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Content-Length": Buffer.byteLength(reqBody),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          if (res.statusCode === 200) resolve(buffer);
          else reject(new Error(`OpenRouter TTS error ${res.statusCode}: ${buffer.toString("utf-8").slice(0, 200)}`));
        });
      }
    );
    req.on("error", reject);
    req.write(reqBody);
    req.end();
  });
}

async function synthesizeOpenAI(text, opts = {}) {
  const apiKey = opts.apiKey;
  if (!apiKey) throw new Error("OpenAI API key (or OAuth token) required for TTS");

  const model = opts.model || "tts-1";
  const voice = opts.voice || "alloy";

  return new Promise((resolve, reject) => {
    const reqBody = JSON.stringify({
      model,
      input: text,
      voice,
      response_format: "pcm",
    });

    const req = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/audio/speech",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Content-Length": Buffer.byteLength(reqBody),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          if (res.statusCode === 200) resolve(buffer);
          else reject(new Error(`OpenAI TTS error ${res.statusCode}: ${buffer.toString("utf-8").slice(0, 200)}`));
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
    const defaultVoice = opts.language === "pt-br" ? "Luciana" : "Daniel";
    const voiceArgs = ["-v", voiceId || defaultVoice, "-o", tmpFile, text];
    const result = spawnSync("say", voiceArgs, { timeout: 15000 });
    if (result.error) throw result.error;
  } else if (platform() === "win32") {
    tmpFile = path.join(os.tmpdir(), `tarkov-tts-${Date.now()}.wav`);
    format = "wav";
    const defaultVoice = opts.language === "pt-br" ? "Microsoft Maria Desktop" : "Microsoft David Desktop";
    const voiceSelect = voiceId
      ? `$synth.SelectVoice('${voiceId.replace(/'/g, "''")}');`
      : `try{$synth.SelectVoice('${defaultVoice}')}catch{};`;
    const psScript = `
      Add-Type -AssemblyName System.Speech;
      $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;
      ${voiceSelect}
      $synth.SetOutputToWaveFile('${tmpFile.replace(/'/g, "''")}');
      $synth.Speak('${text.replace(/'/g, "''")}');
      $synth.Dispose();
    `;
    const result = spawnSync("powershell", ["-NoProfile", "-Command", psScript], { timeout: 15000 });
    if (result.error) throw result.error;
  } else {
    tmpFile = path.join(os.tmpdir(), `tarkov-tts-${Date.now()}.wav`);
    format = "wav";
    const result = spawnSync("espeak", [text, "-w", tmpFile], { timeout: 15000 });
    if (result.error) throw result.error;
  }

  const audioBuffer = fs.readFileSync(tmpFile);
  try { fs.unlinkSync(tmpFile); } catch {}
  return { audio: audioBuffer, format };
}

async function synthesize(text, opts = {}) {
  const provider = opts.provider || "local";

  if (provider === "openrouter") {
    const t0 = performance.now();
    const pcm = await synthesizeOpenRouter(text, opts);
    const audio = pcmToWav(pcm);
    const latency = (performance.now() - t0) / 1000;
    return { audio, format: "wav", latency };
  }

  if (provider === "openai") {
    const t0 = performance.now();
    const pcm = await synthesizeOpenAI(text, opts);
    const audio = pcmToWav(pcm);
    const latency = (performance.now() - t0) / 1000;
    return { audio, format: "wav", latency };
  }

  if (provider === "elevenlabs") {
    const apiKey = opts.apiKey;
    if (!apiKey) throw new Error("ElevenLabs API key required for TTS");
    const t0 = performance.now();
    const audio = await synthesizeElevenLabs(text, opts);
    const latency = (performance.now() - t0) / 1000;
    return { audio, format: "mp3", latency };
  }

  // Local TTS (default + fallback)
  const t0 = performance.now();
  const localResult = await synthesizeLocal(text, opts);
  const latency = (performance.now() - t0) / 1000;
  return { audio: localResult.audio, format: localResult.format, latency };
}

module.exports = { synthesize, synthesizeElevenLabs, synthesizeLocal };
