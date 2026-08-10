// Speech-to-text via OpenAI Whisper API, ElevenLabs, OpenRouter, or local whisper.cpp subprocess.

const https = require("https");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

function getClient(apiKey, baseURL) {
  return new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL || undefined,
  });
}

async function transcribeWhisperAPI(audioBuffer, opts) {
  const baseURL = opts.baseURL || "https://api.openai.com/v1";
  const model = opts.model || "whisper-1";
  const client = getClient(opts.apiKey, baseURL);
  const lang = opts.language === "pt-br" ? "pt" : "en";

  const tmpFile = path.join(os.tmpdir(), `tarkov-stt-${Date.now()}.wav`);
  fs.writeFileSync(tmpFile, audioBuffer);

  try {
    const t0 = performance.now();
    const response = await client.audio.transcriptions.create({
      model,
      file: fs.createReadStream(tmpFile),
      language: lang,
    });
    const latency = (performance.now() - t0) / 1000;
    return { text: (response.text || "").trim(), latency };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

async function transcribeOpenRouter(audioBuffer, opts) {
  const apiKey = opts.apiKey;
  if (!apiKey) throw new Error("OpenRouter API key required for STT");

  const model = opts.model || "openai/whisper-1";
  const base64 = audioBuffer.toString("base64");
  const lang = opts.language === "pt-br" ? "pt" : "en";

  const t0 = performance.now();
  return new Promise((resolve, reject) => {
    const reqBody = JSON.stringify({
      model,
      input_audio: { data: base64, format: "wav" },
      language: lang,
    });

    const req = https.request(
      {
        hostname: "openrouter.ai",
        path: "/api/v1/audio/transcriptions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Content-Length": Buffer.byteLength(reqBody),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => {
          try {
            if (res.statusCode >= 400) {
              reject(new Error(`OpenRouter STT error ${res.statusCode}: ${data.slice(0, 200)}`));
            } else {
              const parsed = JSON.parse(data);
              const latency = (performance.now() - t0) / 1000;
              resolve({ text: (parsed.text || "").trim(), latency });
            }
          } catch (e) {
            reject(new Error(`OpenRouter STT bad response: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(reqBody);
    req.end();
  });
}

async function transcribeElevenLabs(audioBuffer, opts) {
  const apiKey = opts.apiKey;
  if (!apiKey) throw new Error("ElevenLabs API key required for STT");

  const model = opts.model || "scribe_v2";
  const boundary = `----FormBoundary${Date.now()}`;
  const tmpFile = path.join(os.tmpdir(), `tarkov-stt-${Date.now()}.wav`);
  fs.writeFileSync(tmpFile, audioBuffer);

  try {
    const CRLF = "\r\n";
    let body = "";
    body += `--${boundary}${CRLF}`;
    body += `Content-Disposition: form-data; name="model_id"${CRLF}${CRLF}`;
    body += `${model}${CRLF}`;
    body += `--${boundary}${CRLF}`;
    body += `Content-Disposition: form-data; name="file"; filename="audio.wav"${CRLF}`;
    body += `Content-Type: audio/wav${CRLF}${CRLF}`;

    const bodyStart = Buffer.from(body, "utf-8");
    const fileData = fs.readFileSync(tmpFile);
    const bodyEnd = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, "utf-8");

    const fullBody = Buffer.concat([bodyStart, fileData, bodyEnd]);

    const t0 = performance.now();
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: "api.elevenlabs.io",
          path: "/v1/speech-to-text",
          method: "POST",
          headers: {
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "xi-api-key": apiKey,
            "Content-Length": String(fullBody.length),
          },
        },
        (res) => {
          let data = "";
          res.on("data", (c) => { data += c; });
          res.on("end", () => {
            try {
              if (res.statusCode >= 400) {
                reject(new Error(`ElevenLabs STT error ${res.statusCode}: ${data.slice(0, 200)}`));
              } else {
                const parsed = JSON.parse(data);
                const latency = (performance.now() - t0) / 1000;
                resolve({ text: (parsed.text || "").trim(), latency });
              }
            } catch (e) {
              reject(new Error(`ElevenLabs STT bad response: ${data.slice(0, 200)}`));
            }
          });
        }
      );
      req.on("error", reject);
      req.write(fullBody);
      req.end();
    });
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

async function transcribeLocal(audioBuffer, opts) {
  const tmpFile = path.join(os.tmpdir(), `tarkov-stt-${Date.now()}.wav`);
  fs.writeFileSync(tmpFile, audioBuffer);
  const lang = opts.language === "pt-br" ? "pt" : "en";

  try {
    // Try whisper.cpp CLI first
    let stdout;
    try {
      const result = spawnSync("whisper", ["--model", opts.model || "tiny", "--language", lang, "--output-txt", "--file", tmpFile], { timeout: 60000, encoding: "utf-8", maxBuffer: 1024 * 1024 });
      if (result.status !== 0) throw new Error("whisper.cpp failed");
      stdout = result.stdout;
    } catch {
      // Try Python whisper as fallback
      try {
        const result = spawnSync("python3", ["-c", 'import sys; import whisper; m=whisper.load_model(sys.argv[1]); r=m.transcribe(sys.argv[2], language=sys.argv[3]); print(r["text"])', opts.model || "tiny", tmpFile, lang], { timeout: 120000, encoding: "utf-8", maxBuffer: 1024 * 1024 });
        if (result.status !== 0) throw new Error("Python whisper failed");
        stdout = result.stdout;
      } catch {
        throw new Error(
          "Local STT requires whisper.cpp or Python whisper.\n" +
          "Install whisper.cpp: https://github.com/ggerganov/whisper.cpp\n" +
          "Or install Python: pip install openai-whisper"
        );
      }
    }

    const text = stdout.trim();
    return { text, latency: 0 };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

async function transcribe(audioBuffer, opts = {}) {
  const provider = opts.provider || "openai";

  if (provider === "openrouter") {
    return transcribeOpenRouter(audioBuffer, opts);
  }

  if (provider === "elevenlabs") {
    return transcribeElevenLabs(audioBuffer, opts);
  }

  if (provider === "local") {
    return transcribeLocal(audioBuffer, opts);
  }

  if (provider === "openai" || !provider) {
    const apiKey = opts.apiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("API key required for STT");
    return transcribeWhisperAPI(audioBuffer, opts);
  }

  // Fallback
  const apiKey = opts.apiKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("API key required for STT (set provider to 'local', 'elevenlabs', or 'openrouter')");
  return transcribeWhisperAPI(audioBuffer, opts);
}

module.exports = { transcribe };
