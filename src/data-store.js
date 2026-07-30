// SQLite data store for tarkov.dev game data.
// Uses better-sqlite3 with FTS5 for full-text search.

const path = require("path");
const Database = require("better-sqlite3");
const { buildFtsQuery } = require("./fts-query");

// Increment this constant whenever the game-data schema changes.
// init() will drop-and-recreate game tables on mismatch.
// settings and user_memory are NEVER affected by a schema reset.
const SCHEMA_VERSION = 2;

let db = null;
let dbPath = "";

// --- Schema helpers ---

/**
 * Create the three permanent tables that must survive any game-data schema reset.
 * Safe to call multiple times (IF NOT EXISTS guards).
 */
function ensurePermanentTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS user_memory (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

/**
 * Drop only the game-data tables and their FTS shadows.
 * meta, settings, and user_memory are intentionally untouched.
 */
function dropGameTables() {
  db.exec(`
    DROP TABLE IF EXISTS items_fts;
    DROP TABLE IF EXISTS maps_fts;
    DROP TABLE IF EXISTS quests_fts;
    DROP TABLE IF EXISTS items;
    DROP TABLE IF EXISTS maps;
    DROP TABLE IF EXISTS quests;
    DROP TABLE IF EXISTS traders;
    DROP TABLE IF EXISTS hideout_modules;
  `);
}

function init(userDataPath) {
  dbPath = path.join(userDataPath, "tarkov-data.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  // Permanent tables must exist before getMeta() is called.
  ensurePermanentTables();

  // On a version mismatch, drop game tables so they are recreated with the new schema.
  // null means a brand-new install — no reset needed, just create tables below.
  const storedVersion = getMeta("schema_version");
  if (storedVersion !== null && storedVersion !== String(SCHEMA_VERSION)) {
    dropGameTables();
    // Remove stale last_fetch from meta — do NOT delete the whole row or the table.
    db.prepare("DELETE FROM meta WHERE key = 'last_fetch'").run();
  }

  createTables();
  setMeta("schema_version", String(SCHEMA_VERSION));
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT,
      short_name TEXT,
      description TEXT,
      category TEXT,
      types TEXT,
      base_price INTEGER,
      weight REAL,
      avg_24h_price INTEGER,
      last_low_price INTEGER,
      sell_for TEXT,
      caliber TEXT,
      penetration_power INTEGER,
      damage INTEGER,
      armor_damage INTEGER,
      fragmentation_chance REAL,
      ammo_type TEXT,
      projectile_count INTEGER,
      initial_speed REAL,
      fetched_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS maps (
      id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      enemies TEXT,
      raid_duration INTEGER,
      players TEXT,
      min_player_level INTEGER,
      extracts TEXT,
      fetched_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quests (
      id TEXT PRIMARY KEY,
      name TEXT,
      trader TEXT,
      objectives TEXT,
      map TEXT,
      min_player_level INTEGER,
      kappa_required INTEGER,
      wiki_link TEXT,
      objectives_json TEXT,
      requirements TEXT,
      fetched_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS traders (
      id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      currency TEXT,
      fetched_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hideout_modules (
      id TEXT PRIMARY KEY,
      name TEXT,
      requirements TEXT,
      fetched_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // FTS5 virtual tables — column lists unchanged; structured fields are queried directly.
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
        name, short_name, description, category,
        content='items', content_rowid='rowid'
      );
    `);
  } catch {}
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS maps_fts USING fts5(
        name, description, enemies,
        content='maps', content_rowid='rowid'
      );
    `);
  } catch {}
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS quests_fts USING fts5(
        name, trader, objectives,
        content='quests', content_rowid='rowid'
      );
    `);
  } catch {}
}

// --- Insert data ---

function insertItems(items) {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM items").run();
    db.prepare("DELETE FROM items_fts").run();
    const insert = db.prepare(`
      INSERT OR REPLACE INTO items (
        id, name, short_name, description, category, types, base_price, weight,
        avg_24h_price, last_low_price, sell_for, caliber,
        penetration_power, damage, armor_damage, fragmentation_chance,
        ammo_type, projectile_count, initial_speed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      insert.run(
        item.id, item.name, item.shortName, item.description,
        item.category, item.types, item.basePrice, item.weight,
        item.avg24hPrice ?? null, item.lastLowPrice ?? null,
        item.sellFor ?? null, item.caliber ?? null,
        item.penetrationPower ?? null, item.damage ?? null,
        item.armorDamage ?? null, item.fragmentationChance ?? null,
        item.ammoType ?? null, item.projectileCount ?? null,
        item.initialSpeed ?? null
      );
    }
    // Rebuild FTS index (column list unchanged)
    db.exec("INSERT INTO items_fts(rowid, name, short_name, description, category) SELECT rowid, name, short_name, description, category FROM items");
  });
  tx();
  return items.length;
}

function insertMaps(maps) {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM maps").run();
    db.prepare("DELETE FROM maps_fts").run();
    const insert = db.prepare(`
      INSERT OR REPLACE INTO maps (
        id, name, description, enemies, raid_duration,
        players, min_player_level, extracts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const m of maps) {
      insert.run(
        m.id, m.name, m.description, m.enemies, m.raidDuration,
        m.players ?? null, m.minPlayerLevel ?? null, m.extracts ?? null
      );
    }
    db.exec("INSERT INTO maps_fts(rowid, name, description, enemies) SELECT rowid, name, description, enemies FROM maps");
  });
  tx();
  return maps.length;
}

function insertQuests(quests) {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM quests").run();
    db.prepare("DELETE FROM quests_fts").run();
    const insert = db.prepare(`
      INSERT OR REPLACE INTO quests (
        id, name, trader, objectives,
        map, min_player_level, kappa_required, wiki_link, objectives_json, requirements
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const q of quests) {
      insert.run(
        q.id, q.name, q.trader, q.objectives,
        q.map ?? null, q.minPlayerLevel ?? null,
        q.kappaRequired ?? null, q.wikiLink ?? null,
        q.objectivesJson ?? null, q.requirements ?? null
      );
    }
    db.exec("INSERT INTO quests_fts(rowid, name, trader, objectives) SELECT rowid, name, trader, objectives FROM quests");
  });
  tx();
  return quests.length;
}

function insertTraders(traders) {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM traders").run();
    const insert = db.prepare(
      "INSERT OR REPLACE INTO traders (id, name, description, currency) VALUES (?, ?, ?, ?)"
    );
    for (const t of traders) {
      insert.run(t.id, t.name, t.description, t.currency);
    }
  });
  tx();
  return traders.length;
}

function insertHideout(modules) {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM hideout_modules").run();
    const insert = db.prepare(
      "INSERT OR REPLACE INTO hideout_modules (id, name, requirements) VALUES (?, ?, ?)"
    );
    for (const m of modules) {
      insert.run(m.id, m.name, m.requirements);
    }
  });
  tx();
  return modules.length;
}

function setMeta(key, value) {
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key, String(value));
}

function getMeta(key) {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return row ? row.value : null;
}

// --- User Memory ---

function setMemory(key, value) {
  db.prepare(
    "INSERT OR REPLACE INTO user_memory (key, value, updated_at) VALUES (?, ?, datetime('now'))"
  ).run(key, value);
}

function getMemory(key) {
  const row = db.prepare("SELECT value, updated_at FROM user_memory WHERE key = ?").get(key);
  return row || null;
}

function getAllMemory() {
  return db.prepare("SELECT key, value, updated_at FROM user_memory ORDER BY updated_at DESC").all();
}

function deleteMemory(key) {
  db.prepare("DELETE FROM user_memory WHERE key = ?").run(key);
}

function clearMemory() {
  db.prepare("DELETE FROM user_memory").run();
}

// --- Settings ---

function setSetting(key, value) {
  db.prepare(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"
  ).run(key, JSON.stringify(value));
}

function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  if (!row) return null;
  try { return JSON.parse(row.value); }
  catch { return row.value; }
}

function getAllSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const obj = {};
  for (const r of rows) {
    try { obj[r.key] = JSON.parse(r.value); }
    catch { obj[r.key] = r.value; } // plain string from old format
  }
  return obj;
}

function searchHideout(query) {
  const term = `%${query}%`;
  return db.prepare(
    "SELECT name, requirements FROM hideout_modules WHERE name LIKE ? LIMIT 5"
  ).all(term);
}

// --- Queries ---

function getStatus() {
  const counts = {
    items: db.prepare("SELECT COUNT(*) as c FROM items").get().c,
    maps: db.prepare("SELECT COUNT(*) as c FROM maps").get().c,
    quests: db.prepare("SELECT COUNT(*) as c FROM quests").get().c,
    traders: db.prepare("SELECT COUNT(*) as c FROM traders").get().c,
    hideout: db.prepare("SELECT COUNT(*) as c FROM hideout_modules").get().c,
  };
  const lastFetch = getMeta("last_fetch");
  return { ...counts, lastFetch };
}

/**
 * Full-text search across items, maps, and quests.
 * Tries an AND-joined query first (higher precision); falls back to OR (higher recall)
 * only when the AND query returns zero results.
 */
function fullTextSearch(query, limit = 5) {
  const { primary, fallback } = buildFtsQuery(query);
  if (!primary) return [];

  const run = (ftsQuery) => {
    const results = [];

    try {
      const items = db.prepare(
        `SELECT i.name, i.short_name, i.description, i.category, i.base_price, i.types, rank
         FROM items_fts f JOIN items i ON i.rowid = f.rowid
         WHERE items_fts MATCH ? ORDER BY rank LIMIT ?`
      ).all(ftsQuery, limit);
      for (const item of items) results.push({ type: "item", ...item });
    } catch {}

    try {
      const maps = db.prepare(
        `SELECT m.name, m.description, m.enemies, rank
         FROM maps_fts f JOIN maps m ON m.rowid = f.rowid
         WHERE maps_fts MATCH ? ORDER BY rank LIMIT ?`
      ).all(ftsQuery, limit);
      for (const map of maps) results.push({ type: "map", ...map });
    } catch {}

    try {
      const quests = db.prepare(
        `SELECT q.name, q.objectives, rank
         FROM quests_fts f JOIN quests q ON q.rowid = f.rowid
         WHERE quests_fts MATCH ? ORDER BY rank LIMIT ?`
      ).all(ftsQuery, limit);
      for (const quest of quests) results.push({ type: "quest", ...quest });
    } catch {}

    return results;
  };

  const primaryResults = run(primary);
  if (primaryResults.length > 0) return primaryResults;
  return run(fallback);
}

// --- Tool query helpers ---

/**
 * Get ammo rows for a given armor class, optionally filtered by caliber.
 * Rows ordered by penetration_power DESC, limit 5.
 * Includes a `reliable` flag: penetration_power >= armorClass * 10.
 * If none qualify as reliable, returns top 3 with caveat flag.
 *
 * @param {number} armorClass  1–6
 * @param {string|null} caliber  Optional caliber string filter
 * @returns {{ rows: object[], caveat: boolean }}
 */
function getAmmoForClass(armorClass, caliber) {
  const threshold = armorClass * 10;
  let rows;

  if (caliber) {
    rows = db.prepare(
      `SELECT name, short_name, caliber, penetration_power, damage, armor_damage,
              fragmentation_chance, ammo_type
       FROM items
       WHERE penetration_power IS NOT NULL AND caliber = ?
       ORDER BY penetration_power DESC LIMIT 5`
    ).all(caliber);
  } else {
    rows = db.prepare(
      `SELECT name, short_name, caliber, penetration_power, damage, armor_damage,
              fragmentation_chance, ammo_type
       FROM items
       WHERE penetration_power IS NOT NULL
       ORDER BY penetration_power DESC LIMIT 5`
    ).all();
  }

  const reliable = rows.filter((r) => r.penetration_power >= threshold);
  if (reliable.length > 0) {
    return { rows: reliable, caveat: false };
  }
  // Nothing qualifies — return top 3 with caveat
  return { rows: rows.slice(0, 3), caveat: true };
}

/**
 * Find an item by name using FTS, returning pricing columns.
 * Best single match.
 *
 * @param {string} nameQuery
 * @returns {object|null}
 */
function getItemValue(nameQuery) {
  const { primary, fallback } = buildFtsQuery(nameQuery);
  const ftsQuery = primary || fallback;
  if (!ftsQuery) return null;

  const tryQuery = (q) => {
    try {
      return db.prepare(
        `SELECT i.id, i.name, i.short_name, i.category,
                i.avg_24h_price, i.last_low_price, i.sell_for, i.base_price
         FROM items_fts f JOIN items i ON i.rowid = f.rowid
         WHERE items_fts MATCH ? ORDER BY rank LIMIT 1`
      ).get(q);
    } catch { return null; }
  };

  return tryQuery(primary) || tryQuery(fallback) || null;
}

/**
 * Get a map row with extracts parsed into an array.
 *
 * @param {string} nameQuery
 * @returns {object|null}
 */
function getMapWithExtracts(nameQuery) {
  const { primary, fallback } = buildFtsQuery(nameQuery);
  const tryQuery = (q) => {
    if (!q) return null;
    try {
      return db.prepare(
        `SELECT m.id, m.name, m.description, m.enemies, m.raid_duration,
                m.players, m.min_player_level, m.extracts
         FROM maps_fts f JOIN maps m ON m.rowid = f.rowid
         WHERE maps_fts MATCH ? ORDER BY rank LIMIT 1`
      ).get(q);
    } catch { return null; }
  };

  const row = tryQuery(primary) || tryQuery(fallback);
  if (!row) return null;

  try {
    row.extracts = row.extracts ? JSON.parse(row.extracts) : [];
  } catch {
    row.extracts = [];
  }
  return row;
}

/**
 * Get up to 2 quest rows matching the name query.
 *
 * @param {string} nameQuery
 * @returns {object[]}
 */
function getQuestInfo(nameQuery) {
  const { primary, fallback } = buildFtsQuery(nameQuery);
  const tryQuery = (q) => {
    if (!q) return [];
    try {
      return db.prepare(
        `SELECT q.id, q.name, q.trader, q.objectives, q.map,
                q.min_player_level, q.kappa_required, q.wiki_link, q.requirements
         FROM quests_fts f JOIN quests q ON q.rowid = f.rowid
         WHERE quests_fts MATCH ? ORDER BY rank LIMIT 2`
      ).all(q);
    } catch { return []; }
  };

  const results = tryQuery(primary);
  return results.length > 0 ? results : tryQuery(fallback);
}

function seedFromSnapshot(snapshot, opts = {}) {
  const force = opts.force === true;

  if (getStatus().items > 0 && !force) {
    return { skipped: true };
  }

  const items = insertItems(snapshot.items || []);
  const maps = insertMaps(snapshot.maps || []);
  const quests = insertQuests(snapshot.quests || []);
  const traders = insertTraders(snapshot.traders || []);
  const hideout = insertHideout(snapshot.hideout || []);

  setMeta("last_fetch", snapshot.fetchedAt);
  setMeta("data_source", "snapshot");

  return { skipped: false, items, maps, quests, traders, hideout };
}

function clearAll() {
  db.exec(`
    DELETE FROM items; DELETE FROM items_fts;
    DELETE FROM maps; DELETE FROM maps_fts;
    DELETE FROM quests; DELETE FROM quests_fts;
    DELETE FROM traders;
    DELETE FROM hideout_modules;
    DELETE FROM meta;
  `);
}

function close() {
  if (db) { db.close(); db = null; }
}

module.exports = {
  init,
  insertItems, insertMaps, insertQuests, insertTraders, insertHideout,
  getStatus, fullTextSearch, searchHideout, clearAll, close,
  setMeta, getMeta,
  setMemory, getMemory, getAllMemory, deleteMemory, clearMemory,
  setSetting, getSetting, getAllSettings,
  getAmmoForClass, getItemValue, getMapWithExtracts, getQuestInfo,
  seedFromSnapshot,
};
