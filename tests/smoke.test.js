const { test } = require("node:test");
const assert = require("node:assert");

// better-sqlite3 is compiled against Electron's Node ABI, so it cannot load in
// system Node. This test exists to prove the harness runs under the Electron
// ABI (via ELECTRON_RUN_AS_NODE) before any other test depends on the DB.
test("better-sqlite3 loads under the Electron ABI", () => {
  const Database = require("better-sqlite3");
  const db = new Database(":memory:");
  try {
    assert.strictEqual(db.prepare("SELECT 1 AS one").get().one, 1);
  } finally {
    db.close();
  }
});

test("FTS5 is compiled into the bundled SQLite", () => {
  const Database = require("better-sqlite3");
  const db = new Database(":memory:");
  try {
    db.exec("CREATE VIRTUAL TABLE t USING fts5(body)");
    db.prepare("INSERT INTO t(body) VALUES (?)").run("penetration power");
    const row = db.prepare("SELECT body FROM t WHERE t MATCH ?").get('"penetration"*');
    assert.strictEqual(row.body, "penetration power");
  } finally {
    db.close();
  }
});
