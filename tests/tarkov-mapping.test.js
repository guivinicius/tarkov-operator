// Tests for tarkov-dev.js mapping functions.
// These are pure-function tests against a hand-written fixture — no network required.

const { test } = require("node:test");
const assert = require("node:assert");
const path = require("path");

const { mapItem, mapMap, mapQuest } = require("../src/tarkov-dev");
const fixtures = require("./fixtures/graphql-nodes.json");

test("mapItem extracts ammo properties and real prices", () => {
  const row = mapItem(fixtures.ammoItem);

  // ammo-specific fields
  assert.strictEqual(row.penetrationPower, 37);
  assert.strictEqual(row.caliber, "Caliber556x45NATO");
  assert.strictEqual(row.damage, 40);
  assert.strictEqual(row.armorDamage, 62);
  assert.strictEqual(row.fragmentationChance, 0.5);
  assert.strictEqual(row.ammoType, "bullet");
  assert.strictEqual(row.projectileCount, 1);
  assert.strictEqual(row.initialSpeed, 910);

  // real price fields
  assert.strictEqual(row.avg24hPrice, 1200);
  assert.strictEqual(row.lastLowPrice, 1050);

  // sellFor is JSON string parseable to array with vendor name
  const sellFor = JSON.parse(row.sellFor);
  assert.ok(Array.isArray(sellFor), "sellFor must parse to an array");
  assert.strictEqual(sellFor[0].vendor, "Prapor");
  assert.strictEqual(sellFor[0].priceRUB, 900);

  // base fields
  assert.strictEqual(row.id, "ammo-5.56x45-m995");
  assert.strictEqual(row.name, "5.56x45mm M995");
});

test("mapItem yields null ammo fields for non-ammo item", () => {
  const row = mapItem(fixtures.nonAmmoItem);

  assert.strictEqual(row.caliber, null);
  assert.strictEqual(row.penetrationPower, null);
  assert.strictEqual(row.damage, null);
  assert.strictEqual(row.armorDamage, null);
  assert.strictEqual(row.fragmentationChance, null);
  assert.strictEqual(row.ammoType, null);
  assert.strictEqual(row.projectileCount, null);
  assert.strictEqual(row.initialSpeed, null);

  // price fields still present
  assert.strictEqual(row.avg24hPrice, 950000);
  assert.strictEqual(row.lastLowPrice, 920000);

  const sellFor = JSON.parse(row.sellFor);
  assert.strictEqual(sellFor[0].vendor, "Therapist");
});

test("mapMap serializes both extracts with faction", () => {
  const row = mapMap(fixtures.mapNode);

  assert.strictEqual(row.id, "map-reserve");
  assert.strictEqual(row.name, "Reserve");
  assert.strictEqual(row.players, "3-9");
  assert.strictEqual(row.minPlayerLevel, 0);

  const extracts = JSON.parse(row.extracts);
  assert.ok(Array.isArray(extracts), "extracts must parse to an array");
  assert.strictEqual(extracts.length, 2);

  const d2 = extracts.find((e) => e.name === "D-2");
  assert.ok(d2, "D-2 extract must be present");
  assert.strictEqual(d2.faction, "pmc");

  const scav = extracts.find((e) => e.name === "Scav Lands");
  assert.ok(scav, "Scav Lands extract must be present");
  assert.strictEqual(scav.faction, "scav");
});

test("mapQuest flattens objectives to text and comma-joins requirements", () => {
  const row = mapQuest(fixtures.taskNode);

  assert.strictEqual(row.id, "task-collector");
  assert.strictEqual(row.name, "Collector");
  assert.strictEqual(row.trader, "Fence");
  assert.strictEqual(row.map, "Any");
  assert.strictEqual(row.minPlayerLevel, 71);
  assert.strictEqual(row.kappaRequired, 1);
  assert.strictEqual(row.wikiLink, "https://escapefromtarkov.fandom.com/wiki/Collector");

  // objectives flattened to plain text for FTS
  assert.ok(
    row.objectives.includes("Hand over Golden 1GPhone smartphone"),
    "objectives text must include first objective description"
  );
  assert.ok(
    row.objectives.includes("Hand over Alyonka chocolate bar"),
    "objectives text must include second objective description"
  );

  // objectivesJson is a parseable JSON array
  const objs = JSON.parse(row.objectivesJson);
  assert.ok(Array.isArray(objs), "objectivesJson must parse to an array");
  assert.strictEqual(objs.length, 2);
  assert.strictEqual(objs[0].type, "gatherItem");
  assert.strictEqual(objs[0].description, "Hand over Golden 1GPhone smartphone");
  assert.strictEqual(objs[0].optional, false);

  // requirements is comma-joined prerequisite task names
  assert.strictEqual(row.requirements, "Regulated Materials");
});
