const { test } = require("node:test");
const assert = require("node:assert");
const settingsStore = require("../src/settings-store");

test("normalizePttKey preserves keycode and mouseButton objects", () => {
  assert.deepStrictEqual(settingsStore.normalizePttKey({ keycode: 60, name: "F2" }), { keycode: 60, name: "F2" });
  assert.deepStrictEqual(settingsStore.normalizePttKey({ mouseButton: 4, name: "Mouse 4" }), { mouseButton: 4, name: "Mouse 4" });
  assert.deepStrictEqual(settingsStore.normalizePttKey("F2"), { keycode: 60, name: "F2" });
  assert.deepStrictEqual(settingsStore.normalizePttKey("Mouse 5"), { mouseButton: 5, name: "Mouse 5" });
});
