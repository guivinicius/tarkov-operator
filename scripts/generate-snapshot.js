#!/usr/bin/env node
// Generate data/snapshot.json from the live tarkov.dev API.
// Usage: node scripts/generate-snapshot.js
//
// On API failure (e.g. 503) exits with code 1 and a human-readable message.
// Never writes a partial or corrupt snapshot file.

const path = require("path");
const fs = require("fs");

const { fetchAll } = require("../src/tarkov-dev");

const SNAPSHOT_PATH = path.join(__dirname, "..", "data", "snapshot.json");
const SCHEMA_VERSION = 2;

async function main() {
  console.log("Fetching game data from tarkov.dev...");

  let results;
  try {
    results = await fetchAll((section) => {
      console.log(`  Fetching ${section}...`);
    });
  } catch (err) {
    console.error(
      `\nFailed to fetch game data from tarkov.dev: ${err.message}`
    );
    console.error(
      "The tarkov.dev API may be temporarily unavailable (HTTP 503)."
    );
    console.error(
      "This is expected — use the bundled snapshot for offline operation."
    );
    console.error(
      "Retry later or check https://status.tarkov.dev for API status."
    );
    process.exit(1);
  }

  const snapshot = {
    schemaVersion: SCHEMA_VERSION,
    fetchedAt: new Date().toISOString(),
    items: results.items,
    maps: results.maps,
    quests: results.quests,
    traders: results.traders,
    hideout: results.hideout,
  };

  // Ensure data/ directory exists
  const dataDir = path.dirname(SNAPSHOT_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Write atomically via a temp file to avoid corrupt snapshots on failure
  const tmpPath = SNAPSHOT_PATH + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2), "utf8");
  fs.renameSync(tmpPath, SNAPSHOT_PATH);

  console.log(`\nSnapshot written to ${SNAPSHOT_PATH}`);
  console.log(`  schemaVersion: ${snapshot.schemaVersion}`);
  console.log(`  fetchedAt:     ${snapshot.fetchedAt}`);
  console.log(`  items:         ${snapshot.items.length}`);
  console.log(`  maps:          ${snapshot.maps.length}`);
  console.log(`  quests:        ${snapshot.quests.length}`);
  console.log(`  traders:       ${snapshot.traders.length}`);
  console.log(`  hideout:       ${snapshot.hideout.length}`);
}

main();
