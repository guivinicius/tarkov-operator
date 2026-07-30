const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// data-store uses a module-level `db` variable, so we need a fresh require per
// test. Wrap in a helper that purges the module from cache after each test.
function freshStore() {
  // Clear any cached version
  const key = Object.keys(require.cache).find((k) => k.endsWith("data-store.js"));
  if (key) delete require.cache[key];
  return require("../src/data-store");
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tarkov-test-"));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

test("version mismatch drops and recreates game tables with new columns", () => {
  const dir = makeTempDir();
  try {
    // Step 1: init fresh DB
    const store1 = freshStore();
    store1.init(dir);
    // Insert one legacy-shaped item (no caliber)
    store1.insertItems([{
      id: "legacy-item-1", name: "Old Item", shortName: "OI",
      description: "legacy", category: "Ammo", types: "ammo",
      basePrice: 100, weight: 0.1
    }]);
    assert.strictEqual(store1.getStatus().items, 1);

    // Step 2: simulate an old schema by writing version '1' into meta
    // We need to do this via SQL directly using the module's internal db
    // Instead, manipulate meta via setMeta
    store1.setMeta("schema_version", "1");
    store1.close();

    // Step 3: re-init — should detect version mismatch, drop and recreate
    const store2 = freshStore();
    store2.init(dir);
    // Game table should be empty now (dropped and recreated)
    assert.strictEqual(store2.getStatus().items, 0, "items table should be empty after version reset");
    // New column `caliber` must be queryable (would throw if column missing)
    assert.doesNotThrow(() => {
      store2.insertItems([{
        id: "new-item-1", name: "M995", shortName: "M995",
        description: "ammo", category: "Ammo", types: "ammo",
        basePrice: 200, weight: 0.01,
        avg24hPrice: 1200, lastLowPrice: 900,
        sellFor: JSON.stringify([{ vendor: "Prapor", priceRUB: 800 }]),
        caliber: "Caliber556x45NATO", penetrationPower: 53,
        damage: 40, armorDamage: 73, fragmentationChance: 0.50,
        ammoType: "bullet", projectileCount: 1, initialSpeed: 910
      }]);
    }, "inserting item with new columns must not throw");
    const status = store2.getStatus();
    assert.strictEqual(status.items, 1);
    store2.close();
  } finally {
    cleanup(dir);
  }
});

test("matching version preserves existing rows", () => {
  const dir = makeTempDir();
  try {
    const store1 = freshStore();
    store1.init(dir);
    store1.insertItems([{
      id: "stable-1", name: "Stable", shortName: "S",
      description: "test", category: "Ammo", types: "ammo",
      basePrice: 50, weight: 0.05
    }]);
    assert.strictEqual(store1.getStatus().items, 1);
    store1.close();

    // Re-init with same version — rows must survive
    const store2 = freshStore();
    store2.init(dir);
    assert.strictEqual(store2.getStatus().items, 1, "rows should survive when version matches");
    store2.close();
  } finally {
    cleanup(dir);
  }
});

test("reset preserves settings and user_memory despite version mismatch", () => {
  const dir = makeTempDir();
  try {
    const store1 = freshStore();
    store1.init(dir);

    // Store a setting and a memory entry
    store1.setSetting("LLM_PROVIDER", "openrouter");
    store1.setMemory("operator_name", "Viper");

    // Force version mismatch
    store1.setMeta("schema_version", "1");
    store1.close();

    // Re-init — should drop game tables but keep settings + memory
    const store2 = freshStore();
    store2.init(dir);
    assert.strictEqual(store2.getSetting("LLM_PROVIDER"), "openrouter",
      "settings must survive a version reset");
    const mem = store2.getMemory("operator_name");
    assert.ok(mem, "user_memory row must survive a version reset");
    assert.strictEqual(mem.value, "Viper");
    store2.close();
  } finally {
    cleanup(dir);
  }
});
