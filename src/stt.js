// Speech-to-text via OpenAI Whisper API, ElevenLabs, OpenRouter, or local whisper.cpp subprocess.

const https = require("https");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, execSync } = require("child_process");

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

  const tmpFile = path.join(os.tmpdir(), `tarkov-stt-${Date.now()}.wav`);
  fs.writeFileSync(tmpFile, audioBuffer);

  try {
    const t0 = performance.now();
    const response = await client.audio.transcriptions.create({
      model,
      file: fs.createReadStream(tmpFile),
      language: "en",
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

  const t0 = performance.now();
  return new Promise((resolve, reject) => {
    const reqBody = JSON.stringify({
      model,
      input_audio: { data: base64, format: "wav" },
      language: "en",
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

  try {
    // Try whisper.cpp CLI first
    let stdout;
    try {
      const modelOpt = opts.model ? `--model ${opts.model}` : "--model tiny";
      stdout = execSync(`whisper ${modelOpt} --language en --output-txt --file "${tmpFile}" 2>/dev/null`, {
        timeout: 60000,
        encoding: "utf-8",
        maxBuffer: 1024 * 1024,
      });
    } catch {
      // Try Python whisper as fallback
      try {
        stdout = execSync(`python3 -c "import whisper; m=whisper.load_model('${opts.model || "tiny"}'); r=m.transcribe('${tmpFile}'); print(r['text'])" 2>/dev/null`, {
          timeout: 120000,
          encoding: "utf-8",
          maxBuffer: 1024 * 1024,
        });
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
  const provider = opts.provider || "whisper-api";

  if (provider === "openrouter") {
    return transcribeOpenRouter(audioBuffer, opts);
  }

  if (provider === "elevenlabs") {
    return transcribeElevenLabs(audioBuffer, opts);
  }

  if (provider === "local") {
    return transcribeLocal(audioBuffer, opts);
  }

  // Default: OpenAI Whisper API
  const apiKey = opts.apiKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("API key required for STT (set provider to 'local', 'elevenlabs', or 'openrouter')");
  return transcribeWhisperAPI(audioBuffer, opts);
}

module.exports = { transcribe };
