// Tests for all four speech-shaped tools + registry (spec §6 targets 4 and 5)
// Seed a temp SQLite DB from seed-rows.json, call tool handlers, assert output.

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

let tmpDir;
let dataStore;
let ammoVsArmor;
let mapInfo;
let questInfo;
let toolRegistry;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tarkov-tools-"));
  dataStore = require("../src/data-store");
  dataStore.init(tmpDir);

  const fixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures", "seed-rows.json"), "utf8")
  );
  dataStore.insertItems(fixture.items);
  dataStore.insertMaps(fixture.maps);
  dataStore.insertQuests(fixture.quests);

  ammoVsArmor = require("../src/tools/ammo-vs-armor");
  mapInfo = require("../src/tools/map-info");
  questInfo = require("../src/tools/quest-info");
  toolRegistry = require("../src/tools/index");
});

after(() => {
  dataStore.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("ammo_vs_armor names ammo with pen values for class 5", async () => {
  const output = await ammoVsArmor.handler({ armor_class: 5 });

  // Must mention the ammo name
  assert.match(output, /M995/i, `Expected ammo name M995 in output, got: ${output}`);

  // Must include a numeric penetration value (53 for M995)
  assert.match(output, /pen(etration)?[^\d]*53/i,
    `Expected penetration value 53 in output, got: ${output}`);
});

test("ammo_vs_armor output contains no markdown", async () => {
  const output = await ammoVsArmor.handler({ armor_class: 5 });

  assert.doesNotMatch(output, /\|/, `Output must not contain markdown table pipes: ${output}`);
  assert.doesNotMatch(output, /^\s*[-*]\s/m, `Output must not contain bullet lists: ${output}`);
});

test("map_info lists extracts with faction", async () => {
  const output = await mapInfo.handler({ map_name: "Reserve" });

  // Must list the D-2 extract
  assert.match(output, /D-2/, `Expected D-2 extract in output, got: ${output}`);

  // Must convey faction info (scav)
  assert.match(output, /scav/i, `Expected scav faction info in output, got: ${output}`);
});

test("map_info output contains no markdown", async () => {
  const output = await mapInfo.handler({ map_name: "Reserve" });

  assert.doesNotMatch(output, /\|/, `Output must not contain markdown table pipes: ${output}`);
  assert.doesNotMatch(output, /^\s*[-*]\s/m, `Output must not contain bullet lists: ${output}`);
});

test("quest_info includes objectives and map", async () => {
  const output = await questInfo.handler({ quest_name: "Survivalist" });

  // Must contain some objective detail
  assert.ok(
    /kill|survive|Reserve/i.test(output),
    `Expected objectives or map in output, got: ${output}`
  );
});

test("quest_info output contains no markdown", async () => {
  const output = await questInfo.handler({ quest_name: "Survivalist" });

  assert.doesNotMatch(output, /\|/, `Output must not contain markdown table pipes: ${output}`);
  assert.doesNotMatch(output, /^\s*[-*]\s/m, `Output must not contain bullet lists: ${output}`);
});

test("registry exposes exactly the seven phase-1 tools", () => {
  const schemas = toolRegistry.getSchemas();
  const names = schemas.map((s) => s.name).sort();

  const expected = [
    "ammo_vs_armor",
    "get_hideout_requirements",
    "item_value",
    "map_info",
    "quest_info",
    "recall_fact",
    "remember_fact",
  ].sort();

  assert.deepStrictEqual(names, expected,
    `Registry has wrong tools. Got: ${names.join(", ")}`);
});
