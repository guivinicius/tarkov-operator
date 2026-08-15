const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function freshStores() {
  const dataKey = Object.keys(require.cache).find((k) => k.endsWith("data-store.js"));
  if (dataKey) delete require.cache[dataKey];
  const settingsKey = Object.keys(require.cache).find((k) => k.endsWith("settings-store.js"));
  if (settingsKey) delete require.cache[settingsKey];

  const dataStore = require("../src/data-store");
  const settingsStore = require("../src/settings-store");
  return { dataStore, settingsStore };
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tarkov-settings-test-"));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

test("normalizePttKey preserves valid keycode objects", () => {
  const { settingsStore } = freshStores();
  const res = settingsStore.normalizePttKey({ keycode: 59, name: "F1" });
  assert.strictEqual(res.keycode, 59);
  assert.strictEqual(res.name, "F1");
});

test("normalizePttKey converts legacy string F1..F12 to valid keycode objects", () => {
  const { settingsStore } = freshStores();
  const resF1 = settingsStore.normalizePttKey("F1");
  assert.strictEqual(resF1.keycode, 59);
  assert.strictEqual(resF1.name, "F1");

  const resF5 = settingsStore.normalizePttKey("F5");
  assert.strictEqual(resF5.keycode, 63);
  assert.strictEqual(resF5.name, "F5");

  const resSpace = settingsStore.normalizePttKey("Space");
  assert.strictEqual(resSpace.keycode, 57);
  assert.strictEqual(resSpace.name, "Space");
});

test("normalizePttKey converts mouse button strings and objects", () => {
  const { settingsStore } = freshStores();
  const resM4Str = settingsStore.normalizePttKey("Mouse 4");
  assert.strictEqual(resM4Str.mouseButton, 4);
  assert.strictEqual(resM4Str.name, "Mouse 4");

  const resM5Obj = settingsStore.normalizePttKey({ mouseButton: 5, name: "Mouse 5" });
  assert.strictEqual(resM5Obj.mouseButton, 5);
  assert.strictEqual(resM5Obj.name, "Mouse 5");
});

test("settingsStore.load normalizes legacy string PTT_KEY in database", () => {
  const dir = makeTempDir();
  try {
    const { dataStore, settingsStore } = freshStores();
    dataStore.init(dir);
    settingsStore.init(dir);

    // Simulate old version setting string PTT_KEY
    dataStore.setSetting("PTT_KEY", "F1");

    const loaded = settingsStore.load();
    assert.deepStrictEqual(loaded.PTT_KEY, { keycode: 59, name: "F1" });
    assert.strictEqual(typeof loaded.PTT_KEY.keycode, "number");

    dataStore.close();
  } finally {
    cleanup(dir);
  }
});

test("settingsStore.save normalizes and persists PTT_KEY correctly", () => {
  const dir = makeTempDir();
  try {
    const { dataStore, settingsStore } = freshStores();
    dataStore.init(dir);
    settingsStore.init(dir);

    settingsStore.save({ PTT_KEY: "Mouse 4" });
    const loaded = settingsStore.load();
    assert.deepStrictEqual(loaded.PTT_KEY, { mouseButton: 4, name: "Mouse 4" });

    settingsStore.save({ PTT_KEY: { keycode: 60, name: "F2" } });
    const loaded2 = settingsStore.load();
    assert.deepStrictEqual(loaded2.PTT_KEY, { keycode: 60, name: "F2" });

    dataStore.close();
  } finally {
    cleanup(dir);
  }
});
