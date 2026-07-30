const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function freshStore() {
  const key = Object.keys(require.cache).find((k) => k.endsWith("data-store.js"));
  if (key) delete require.cache[key];
  return require("../src/data-store");
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tarkov-snapshot-test-"));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// -------------------------------------------------------------------
// Fixtures
// -------------------------------------------------------------------

// Fixture A — 2 items (ammo + barter), 1 map, 1 quest, 1 trader, 1 hideout module
const fixtureA = {
  schemaVersion: 2,
  fetchedAt: "FIXTURE",
  items: [
    {
      id: "5c0d5e4486f77478390952fe",
      name: "5.56x45mm M995",
      shortName: "M995",
      description: "5.56x45mm M995 AP armor-piercing round.",
      category: "Ammo",
      types: "[\"ammo\"]",
      basePrice: 1500,
      weight: 0.01,
      avg24hPrice: 7500,
      lastLowPrice: 7200,
      sellFor: "[{\"vendor\":\"Mechanic\",\"priceRUB\":900}]",
      caliber: "Caliber556x45NATO",
      penetrationPower: 53,
      damage: 45,
      armorDamage: 72,
      fragmentationChance: 0.2,
      ammoType: "bullet",
      projectileCount: 1,
      initialSpeed: 927,
    },
    {
      id: "5c0d688c86f77413ae3407b2",
      name: "LEDX Skin Transilluminator",
      shortName: "LEDX",
      description: "A rare and valuable medical item.",
      category: "Medical",
      types: "[\"barter\"]",
      basePrice: 18069,
      weight: 0.1,
      avg24hPrice: 950000,
      lastLowPrice: 920000,
      sellFor: "[{\"vendor\":\"Therapist\",\"priceRUB\":700000}]",
      caliber: null,
      penetrationPower: null,
      damage: null,
      armorDamage: null,
      fragmentationChance: null,
      ammoType: null,
      projectileCount: null,
      initialSpeed: null,
    },
  ],
  maps: [
    {
      id: "5714dbc024597771384a510d",
      name: "Reserve",
      description: "A large military base with underground bunkers and helicopter pad.",
      enemies: "Scavs, Raiders, Rogue Bosses",
      raidDuration: 35,
      players: "3-9",
      minPlayerLevel: 0,
      extracts: "[{\"name\":\"D-2\",\"faction\":\"pmc\"},{\"name\":\"Scav Lands\",\"faction\":\"scav\"}]",
    },
  ],
  quests: [
    {
      id: "5c51aac186f77432ea65c552",
      name: "Survivalist Path - Unprotected But Dangerous",
      trader: "Jaeger",
      objectives: "Survive 2 raids on Reserve; Kill 5 Scavs on Reserve",
      map: "Reserve",
      minPlayerLevel: 10,
      kappaRequired: 0,
      wikiLink: "https://escapefromtarkov.fandom.com/wiki/Survivalist_Path_-_Unprotected_But_Dangerous",
      objectivesJson: "[{\"type\":\"experience\",\"description\":\"Survive 2 raids on Reserve\",\"optional\":false}]",
      requirements: "",
    },
  ],
  traders: [
    { id: "5a7c2eca46aef81a7ca2145d", name: "Jaeger", description: "Hunter trader", currency: "RUB" },
  ],
  hideout: [
    { id: "5d484fdf654e7600691aadf8", name: "Nutrition Unit level 1", requirements: "[{\"type\":\"item\",\"count\":3,\"name\":\"Purified water\"}]" },
  ],
};

// Fixture B — 1 item (different count from A's 2), 2 maps, 0 quests
const fixtureB = {
  schemaVersion: 2,
  fetchedAt: "FIXTURE",
  items: [
    {
      id: "aaa0000000000000000000ff",
      name: "7.62x39mm BP",
      shortName: "7.62 BP",
      description: "7.62x39mm BP ammo.",
      category: "Ammo",
      types: "[\"ammo\"]",
      basePrice: 2000,
      weight: 0.012,
      avg24hPrice: 5000,
      lastLowPrice: 4800,
      sellFor: "[{\"vendor\":\"Prapor\",\"priceRUB\":1200}]",
      caliber: "Caliber762x39",
      penetrationPower: 45,
      damage: 55,
      armorDamage: 65,
      fragmentationChance: 0.1,
      ammoType: "bullet",
      projectileCount: 1,
      initialSpeed: 740,
    },
  ],
  maps: [
    {
      id: "5704e4dad2720bb55b8b4567",
      name: "Customs",
      description: "Industrial area with warehouses.",
      enemies: "Scavs",
      raidDuration: 35,
      players: "8-12",
      minPlayerLevel: 0,
      extracts: "[{\"name\":\"RUAF Roadblock\",\"faction\":\"pmc\"}]",
    },
    {
      id: "5704e5fad2720bc05b8b4567",
      name: "Woods",
      description: "Forest map.",
      enemies: "Scavs, Shturman",
      raidDuration: 30,
      players: "6-10",
      minPlayerLevel: 0,
      extracts: "[{\"name\":\"UN Roadblock\",\"faction\":\"pmc\"}]",
    },
  ],
  quests: [],
  traders: [],
  hideout: [],
};

// -------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------

test("seedFromSnapshot populates all tables and stamps meta", () => {
  const dir = makeTempDir();
  try {
    const store = freshStore();
    store.init(dir);

    const result = store.seedFromSnapshot(fixtureA);

    // Must not be skipped
    assert.strictEqual(result.skipped, false, "should not skip for a fresh DB");

    // Every table got the right row count
    const status = store.getStatus();
    assert.strictEqual(status.items, fixtureA.items.length,
      `items: expected ${fixtureA.items.length}, got ${status.items}`);
    assert.strictEqual(status.maps, fixtureA.maps.length,
      `maps: expected ${fixtureA.maps.length}, got ${status.maps}`);
    assert.strictEqual(status.quests, fixtureA.quests.length,
      `quests: expected ${fixtureA.quests.length}, got ${status.quests}`);
    assert.strictEqual(status.traders, fixtureA.traders.length,
      `traders: expected ${fixtureA.traders.length}, got ${status.traders}`);
    assert.strictEqual(status.hideout, fixtureA.hideout.length,
      `hideout: expected ${fixtureA.hideout.length}, got ${status.hideout}`);

    // Return value carries per-table counts
    assert.strictEqual(result.items, fixtureA.items.length);
    assert.strictEqual(result.maps, fixtureA.maps.length);
    assert.strictEqual(result.quests, fixtureA.quests.length);
    assert.strictEqual(result.traders, fixtureA.traders.length);
    assert.strictEqual(result.hideout, fixtureA.hideout.length);

    // Meta stamps
    assert.strictEqual(store.getMeta("data_source"), "snapshot");
    assert.strictEqual(store.getMeta("last_fetch"), fixtureA.fetchedAt);

    store.close();
  } finally {
    cleanup(dir);
  }
});

test("seedFromSnapshot skips a populated database", () => {
  const dir = makeTempDir();
  try {
    const store = freshStore();
    store.init(dir);

    // Seed with fixture A (2 items)
    store.seedFromSnapshot(fixtureA);
    assert.strictEqual(store.getStatus().items, fixtureA.items.length);

    // Now try to seed with fixture B (1 item — different count proves replacement didn't happen)
    const result = store.seedFromSnapshot(fixtureB);

    // Must report skipped
    assert.strictEqual(result.skipped, true, "should skip when DB is already populated");

    // Item count must remain at fixtureA's count, not fixtureB's
    const status = store.getStatus();
    assert.strictEqual(
      status.items,
      fixtureA.items.length,
      `items must remain ${fixtureA.items.length} (fixture B NOT applied); got ${status.items}`
    );

    store.close();
  } finally {
    cleanup(dir);
  }
});

test("force:true replaces existing data", () => {
  const dir = makeTempDir();
  try {
    const store = freshStore();
    store.init(dir);

    // Seed with fixture A (2 items)
    store.seedFromSnapshot(fixtureA);
    assert.strictEqual(store.getStatus().items, fixtureA.items.length);

    // Force-replace with fixture B (1 item)
    const result = store.seedFromSnapshot(fixtureB, { force: true });

    // Must not be skipped
    assert.strictEqual(result.skipped, false, "force:true must not skip");

    // Item count must now equal fixtureB's item count
    const status = store.getStatus();
    assert.strictEqual(
      status.items,
      fixtureB.items.length,
      `items must equal fixtureB (${fixtureB.items.length}) after force replace; got ${status.items}`
    );

    store.close();
  } finally {
    cleanup(dir);
  }
});
