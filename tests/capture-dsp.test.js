const { test } = require("node:test");
const assert = require("node:assert");

const capture = require("../src/renderer/capture.js");
const { rms, floatToInt16, stopReason, encodeWav, SAMPLE_RATE } = capture;

// main.js derives recording duration as (buffer.length - 44) / (16000 * 2),
// so a wrong header here silently corrupts every transcription.
test("encodeWav writes a 44-byte 16kHz mono 16-bit header the pipeline can parse", () => {
  const samples = new Int16Array(16000); // exactly 1 second
  const wav = Buffer.from(encodeWav(samples, SAMPLE_RATE));

  assert.strictEqual(wav.slice(0, 4).toString("ascii"), "RIFF");
  assert.strictEqual(wav.slice(8, 12).toString("ascii"), "WAVE");
  assert.strictEqual(wav.slice(36, 40).toString("ascii"), "data");
  assert.strictEqual(wav.readUInt16LE(20), 1, "PCM format");
  assert.strictEqual(wav.readUInt16LE(22), 1, "mono");
  assert.strictEqual(wav.readUInt32LE(24), 16000, "sample rate");
  assert.strictEqual(wav.readUInt16LE(34), 16, "bits per sample");
  assert.strictEqual(wav.length, 44 + 16000 * 2);

  const durationSeconds = (wav.length - 44) / (16000 * 2);
  assert.strictEqual(durationSeconds, 1);
});

test("rms distinguishes silence from speech", () => {
  const silent = new Float32Array(128);
  const loud = new Float32Array(128).fill(0.5);
  assert.strictEqual(rms(silent), 0);
  assert.ok(rms(loud) > 0.4);
});

test("floatToInt16 clamps out-of-range samples instead of wrapping", () => {
  const out = floatToInt16(new Float32Array([0, 1, -1, 2, -2]));
  assert.strictEqual(out[0], 0);
  assert.strictEqual(out[1], 32767);
  assert.strictEqual(out[2], -32768);
  assert.strictEqual(out[3], 32767, "above +1 must clamp, not overflow");
  assert.strictEqual(out[4], -32768, "below -1 must clamp, not overflow");
});

test("stopReason keeps recording while the user is still talking", () => {
  assert.strictEqual(
    stopReason({ elapsedMs: 2000, speechDetected: true, silenceMs: 200 }),
    null
  );
});

test("stopReason ignores leading silence before any speech", () => {
  // A user gathering their thought must not end the take instantly.
  assert.strictEqual(
    stopReason({ elapsedMs: 2000, speechDetected: false, silenceMs: 2000 }),
    null
  );
});

test("stopReason ends the take on trailing silence after speech", () => {
  assert.strictEqual(
    stopReason({ elapsedMs: 4000, speechDetected: true, silenceMs: 1500 }),
    "silence"
  );
});

test("stopReason reports no-speech when nothing is ever detected", () => {
  assert.strictEqual(
    stopReason({ elapsedMs: 5000, speechDetected: false, silenceMs: 5000 }),
    "no-speech"
  );
});

test("stopReason enforces the hard duration cap", () => {
  assert.strictEqual(
    stopReason({ elapsedMs: 30000, speechDetected: true, silenceMs: 0 }),
    "max-duration"
  );
});
