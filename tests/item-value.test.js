// Tests for item_value tool — price correctness regression (spec §6 target 5)
// Seed a temp SQLite DB from seed-rows.json, call the tool handler, assert output.

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Point data-store at a temp directory before loading any modules that use it
let tmpDir;
let dataStore;
let itemValueTool;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tarkov-item-value-"));
  dataStore = require("../src/data-store");
  dataStore.init(tmpDir);

  const fixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures", "seed-rows.json"), "utf8")
  );
  dataStore.insertItems(fixture.items);

  itemValueTool = require("../src/tools/item-value");
});

after(() => {
  dataStore.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("item_value reports flea and trader price, never basePrice", async () => {
  const output = await itemValueTool.handler({ item_name: "LEDX" });

  // Must contain flea avg-24h price (~950,000)
  assert.match(output, /950[,\s]?000/,
    `Expected flea price 950000 in output, got: ${output}`);

  // Must contain best trader sell price (~700,000)
  assert.match(output, /700[,\s]?000/,
    `Expected trader price 700000 in output, got: ${output}`);

  // Must NEVER emit the internal basePrice 18069
  assert.doesNotMatch(output, /18[,\s]?069/,
    `Output must not contain basePrice 18069, got: ${output}`);
});

test("item_value output contains no markdown (no pipes, no bullet lines)", async () => {
  const output = await itemValueTool.handler({ item_name: "LEDX" });

  assert.doesNotMatch(output, /\|/, `Output must not contain markdown table pipes: ${output}`);
  assert.doesNotMatch(output, /^\s*[-*]\s/m, `Output must not contain bullet lists: ${output}`);
});

test("item_value returns not-found message gracefully for unknown item", async () => {
  const output = await itemValueTool.handler({ item_name: "xyznonexistent12345" });
  assert.ok(typeof output === "string" && output.length > 0, "Must return a non-empty string");
});
