// Hidden-window microphone capture.
//
// Produces a 16 kHz mono 16-bit WAV (44-byte header) and hands it to the main
// process. Stops itself on trailing silence so the user taps once and talks,
// rather than holding a key while both hands are on WASD and the mouse.

const SAMPLE_RATE = 16000;
const FRAME_SIZE = 4096;

const SILENCE_RMS = 0.01;   // below this counts as silence
const SILENCE_MS = 1500;    // trailing silence, after speech, that ends a take
const NO_SPEECH_MS = 5000;  // nothing detected at all -> treat as empty
const MAX_MS = 30000;       // hard cap

// --- Pure helpers (no audio/DOM state; kept separable for unit testing) ----

function rms(frame) {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

function floatToInt16(frame) {
  const out = new Int16Array(frame.length);
  for (let i = 0; i < frame.length; i++) {
    const s = Math.max(-1, Math.min(1, frame[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

// Decides whether a take is over. Returns null to keep going, otherwise a
// reason string. `speechDetected` gates SILENCE_MS so leading silence while
// the user gathers their thought does not end the take instantly.
function stopReason({ elapsedMs, speechDetected, silenceMs }) {
  if (elapsedMs >= MAX_MS) return "max-duration";
  if (!speechDetected && elapsedMs >= NO_SPEECH_MS) return "no-speech";
  if (speechDetected && silenceMs >= SILENCE_MS) return "silence";
  return null;
}

function encodeWav(samples, sampleRate) {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);          // PCM chunk size
  view.setUint16(20, 1, true);           // PCM format
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true);              // block align
  view.setUint16(34, 16, true);          // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(offset, samples[i], true);
    offset += bytesPerSample;
  }
  return new Uint8Array(buffer);
}

// --- Capture session ------------------------------------------------------

let session = null;

async function start() {
  if (session) return;

  const state = {
    stream: null,
    ctx: null,
    source: null,
    processor: null,
    sink: null,
    chunks: [],
    total: 0,
    startedAt: Date.now(),
    speechDetected: false,
    lastVoiceAt: 0,
    finished: false,
  };
  session = state;

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: SAMPLE_RATE,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (err) {
    session = null;
    window.captureBridge.error(`Microphone unavailable: ${err.message}`);
    return;
  }

  state.stream = stream;
  state.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  state.source = state.ctx.createMediaStreamSource(stream);
  state.processor = state.ctx.createScriptProcessor(FRAME_SIZE, 1, 1);

  // A ScriptProcessorNode only runs while connected to the destination, but
  // routing mic audio to the speakers would echo the user back at themselves.
  // A zero-gain sink keeps the graph pulling without any audible output.
  state.sink = state.ctx.createGain();
  state.sink.gain.value = 0;

  state.processor.onaudioprocess = (event) => {
    if (state.finished) return;
    const frame = event.inputBuffer.getChannelData(0);

    state.chunks.push(floatToInt16(frame));
    state.total += frame.length;

    const now = Date.now();
    if (rms(frame) >= SILENCE_RMS) {
      state.speechDetected = true;
      state.lastVoiceAt = now;
    }

    const reason = stopReason({
      elapsedMs: now - state.startedAt,
      speechDetected: state.speechDetected,
      silenceMs: state.lastVoiceAt ? now - state.lastVoiceAt : 0,
    });
    if (reason) finish(reason === "no-speech" ? "empty" : "deliver");
  };

  state.source.connect(state.processor);
  state.processor.connect(state.sink);
  state.sink.connect(state.ctx.destination);

  window.captureBridge.started();
}

function teardown(state) {
  try { if (state.processor) state.processor.onaudioprocess = null; } catch (_) {}
  try { if (state.source) state.source.disconnect(); } catch (_) {}
  try { if (state.processor) state.processor.disconnect(); } catch (_) {}
  try { if (state.sink) state.sink.disconnect(); } catch (_) {}
  try { if (state.ctx) state.ctx.close(); } catch (_) {}
  try {
    if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
  } catch (_) {}
}

// mode: "deliver" | "empty" | "discard"
function finish(mode) {
  const state = session;
  if (!state || state.finished) return;
  state.finished = true;
  session = null;

  teardown(state);

  if (mode === "discard") return;

  if (mode === "empty" || !state.speechDetected || state.total === 0) {
    window.captureBridge.empty();
    return;
  }

  const merged = new Int16Array(state.total);
  let offset = 0;
  for (const chunk of state.chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  window.captureBridge.data(encodeWav(merged, SAMPLE_RATE));
}

if (typeof window !== "undefined" && window.captureBridge) {
  window.captureBridge.onStart(() => {
    start().catch((err) => window.captureBridge.error(err.message));
  });
  window.captureBridge.onStop(() => finish("deliver"));
  window.captureBridge.onCancel(() => finish("discard"));
}

// Also loadable under Node so the WAV/silence logic can be regression-tested;
// the STT pipeline derives duration from this exact header layout.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    rms, floatToInt16, stopReason, encodeWav,
    SAMPLE_RATE, SILENCE_RMS, SILENCE_MS, NO_SPEECH_MS, MAX_MS,
  };
}
