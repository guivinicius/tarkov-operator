// SQLite data store for tarkov.dev game data.
// Uses better-sqlite3 with FTS5 for full-text search.

const path = require("path");
const Database = require("better-sqlite3");

let db = null;
let dbPath = "";

function init(userDataPath) {
  dbPath = path.join(userDataPath, "tarkov-data.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  createTables();
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
      fetched_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS maps (
      id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      enemies TEXT,
      raid_duration INTEGER,
      fetched_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quests (
      id TEXT PRIMARY KEY,
      name TEXT,
      trader TEXT,
      objectives TEXT,
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

  // FTS5 virtual tables
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
    const insert = db.prepare(
      "INSERT OR REPLACE INTO items (id, name, short_name, description, category, types, base_price, weight) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    for (const item of items) {
      insert.run(item.id, item.name, item.shortName, item.description, item.category, item.types, item.basePrice, item.weight);
    }
    // Rebuild FTS index
    db.exec("INSERT INTO items_fts(rowid, name, short_name, description, category) SELECT rowid, name, short_name, description, category FROM items");
  });
  tx();
  return items.length;
}

function insertMaps(maps) {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM maps").run();
    db.prepare("DELETE FROM maps_fts").run();
    const insert = db.prepare(
      "INSERT OR REPLACE INTO maps (id, name, description, enemies, raid_duration) VALUES (?, ?, ?, ?, ?)"
    );
    for (const m of maps) {
      insert.run(m.id, m.name, m.description, m.enemies, m.raidDuration);
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
    const insert = db.prepare(
      "INSERT OR REPLACE INTO quests (id, name, trader, objectives) VALUES (?, ?, ?, ?)"
    );
    for (const q of quests) {
      insert.run(q.id, q.name, q.trader, q.objectives);
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

function fullTextSearch(query, limit = 5) {
  const results = [];

  if (!query || query.length < 2) return results;

  // Sanitize for FTS5: escape special chars and build a prefix query
  const terms = query.replace(/[^a-zA-Z0-9\s]/g, "").trim().split(/\s+/).filter(Boolean);

  // Build OR query with prefix matching
  const ftsQuery = terms.map((t) => `"${t}"*`).join(" OR ");

  if (!ftsQuery) return results;

  try {
    const items = db.prepare(
      `SELECT i.name, i.short_name, i.description, i.category, i.base_price, i.types, rank
       FROM items_fts f JOIN items i ON i.rowid = f.rowid
       WHERE items_fts MATCH ? ORDER BY rank LIMIT ?`
    ).all(ftsQuery, limit);

    for (const item of items) {
      results.push({ type: "item", ...item });
    }
  } catch {}

  try {
    const maps = db.prepare(
      `SELECT m.name, m.description, m.enemies, rank
       FROM maps_fts f JOIN maps m ON m.rowid = f.rowid
       WHERE maps_fts MATCH ? ORDER BY rank LIMIT ?`
    ).all(ftsQuery, limit);

    for (const map of maps) {
      results.push({ type: "map", ...map });
    }
  } catch {}

  try {
    const quests = db.prepare(
      `SELECT q.name, q.objectives, rank
       FROM quests_fts f JOIN quests q ON q.rowid = f.rowid
       WHERE quests_fts MATCH ? ORDER BY rank LIMIT ?`
    ).all(ftsQuery, limit);

    for (const quest of quests) {
      results.push({ type: "quest", ...quest });
    }
  } catch {}

  return results;
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

module.exports = { init, insertItems, insertMaps, insertQuests, insertTraders, insertHideout, getStatus, fullTextSearch, searchHideout, clearAll, close, setMeta, getMeta, setMemory, getMemory, getAllMemory, deleteMemory, clearMemory, setSetting, getSetting, getAllSettings };
