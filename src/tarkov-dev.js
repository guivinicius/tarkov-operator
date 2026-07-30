// GraphQL client for tarkov.dev API.
// Fetches items, maps, quests, traders, and hideout data.

const https = require("https");
const http = require("http");

const API_URL = "https://api.tarkov.dev/graphql";

function graphql(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const url = new URL(API_URL);
    const mod = url.protocol === "https:" ? https : http;

    const req = mod.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          try {
            const json = JSON.parse(data);
            if (json.errors) reject(new Error(json.errors[0].message));
            else resolve(json.data);
          } catch (e) {
            reject(new Error(`Bad response: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Pure mapping functions — transform raw GraphQL nodes into DB row shapes.
// Consumed by insertItems/insertMaps/insertQuests in data-store.js (T4/T7).
// ---------------------------------------------------------------------------

/**
 * mapItem(node) → ItemRow
 * Ammo fields are null for non-ammo items.
 */
function mapItem(item) {
  const ammo =
    item.properties && item.properties.__typename === "ItemPropertiesAmmo"
      ? item.properties
      : null;

  const sellFor = (item.sellFor || []).map((s) => ({
    vendor: s.vendor ? s.vendor.name : null,
    priceRUB: s.priceRUB != null ? s.priceRUB : null,
  }));

  return {
    id: item.id,
    name: item.name,
    shortName: item.shortName || null,
    description: item.description ? item.description.replace(/<[^>]*>/g, "") : null,
    category: (item.categories || []).map((c) => c.name).join(", "),
    types: (item.types || []).join(", "),
    basePrice: item.basePrice || 0,
    weight: item.weight || 0,
    avg24hPrice: item.avg24hPrice != null ? item.avg24hPrice : null,
    lastLowPrice: item.lastLowPrice != null ? item.lastLowPrice : null,
    sellFor: JSON.stringify(sellFor),
    // ammo-specific fields — null for non-ammo
    caliber: ammo ? ammo.caliber : null,
    penetrationPower: ammo ? ammo.penetrationPower : null,
    damage: ammo ? ammo.damage : null,
    armorDamage: ammo ? ammo.armorDamage : null,
    fragmentationChance: ammo ? ammo.fragmentationChance : null,
    ammoType: ammo ? ammo.ammoType : null,
    projectileCount: ammo ? ammo.projectileCount : null,
    initialSpeed: ammo ? ammo.initialSpeed : null,
  };
}

/**
 * mapMap(node) → MapRow
 * extracts is a JSON string of [{name, faction}].
 */
function mapMap(m) {
  const extracts = (m.extracts || []).map((e) => ({
    name: e.name,
    faction: e.faction || null,
  }));

  return {
    id: m.id,
    name: m.name,
    description: m.description ? m.description.replace(/<[^>]*>/g, "") : null,
    enemies: (m.enemies || []).join(", "),
    raidDuration: m.raidDuration || 0,
    players: m.players || null,
    minPlayerLevel: m.minPlayerLevel != null ? m.minPlayerLevel : null,
    extracts: JSON.stringify(extracts),
  };
}

/**
 * mapQuest(node) → QuestRow
 * objectives is plain text for FTS; objectivesJson is structured JSON.
 * requirements is comma-joined prerequisite task names.
 */
function mapQuest(q) {
  const objectives = (q.objectives || []);

  // Flatten objectives to plain text for FTS indexing
  const objectivesText = objectives
    .map((o) => o.description || "")
    .filter(Boolean)
    .join("; ");

  // Structured JSON for tool use
  const objectivesJson = objectives.map((o) => ({
    type: o.type || null,
    description: o.description || null,
    maps: (o.maps || []).map((mm) => mm.name),
    optional: o.optional === true,
  }));

  // Prerequisite task names, comma-joined
  const requirements = (q.taskRequirements || [])
    .map((r) => (r.task ? r.task.name : null))
    .filter(Boolean)
    .join(", ");

  return {
    id: q.id,
    name: q.name,
    trader: q.trader ? q.trader.name : null,
    map: q.map ? q.map.name : null,
    minPlayerLevel: q.minPlayerLevel != null ? q.minPlayerLevel : null,
    kappaRequired: q.kappaRequired ? 1 : 0,
    wikiLink: q.wikiLink || null,
    objectives: objectivesText,
    objectivesJson: JSON.stringify(objectivesJson),
    requirements: requirements || null,
  };
}

// ---------------------------------------------------------------------------
// Fetch functions — call the API and return mapped rows.
// ---------------------------------------------------------------------------

async function fetchItems() {
  const data = await graphql(`
    {
      items {
        id
        name
        shortName
        description
        basePrice
        weight
        categories {
          name
        }
        types
        avg24hPrice
        lastLowPrice
        sellFor {
          vendor { name }
          priceRUB
        }
        properties {
          ... on ItemPropertiesAmmo {
            caliber
            damage
            armorDamage
            penetrationPower
            penetrationChance
            fragmentationChance
            ricochetChance
            ammoType
            projectileCount
            initialSpeed
          }
        }
      }
    }
  `);
  return (data.items || []).map(mapItem);
}

async function fetchMaps() {
  const data = await graphql(`
    {
      maps {
        id
        name
        description
        enemies
        raidDuration
        players
        minPlayerLevel
        extracts {
          id
          name
          faction
        }
      }
    }
  `);
  return (data.maps || []).map(mapMap);
}

async function fetchQuests() {
  const data = await graphql(`
    {
      tasks {
        id
        name
        trader { name }
        map { name }
        minPlayerLevel
        kappaRequired
        wikiLink
        objectives {
          id
          type
          description
          optional
          maps { name }
        }
        taskRequirements {
          task { name }
        }
      }
    }
  `);
  return (data.tasks || []).map(mapQuest);
}

async function fetchTraders() {
  const data = await graphql(`
    {
      traders {
        id
        name
        description
        currency {
          name
        }
      }
    }
  `);
  return (data.traders || []).map((t) => ({
    id: t.id,
    name: t.name,
    description: (t.description || "").replace(/<[^>]*>/g, ""),
    currency: t.currency?.name || "RUB",
  }));
}

async function fetchHideout() {
  const data = await graphql(`
    {
      hideoutStations {
        id
        name
        levels {
          id
          level
          itemRequirements {
            item {
              name
            }
            quantity
          }
        }
      }
    }
  `);
  return (data.hideoutStations || []).flatMap((mod) =>
    (mod.levels || []).map((lvl) => ({
      id: lvl.id || `${mod.id}-lvl${lvl.level}`,
      name: `${mod.name} Lv.${lvl.level}`,
      requirements: (lvl.itemRequirements || [])
        .map((r) => `${r.quantity}x ${r.item?.name || "Unknown"}`)
        .join(", "),
    }))
  );
}

async function fetchAll(onProgress) {
  const results = {};

  onProgress?.("items");
  results.items = await fetchItems();

  onProgress?.("maps");
  results.maps = await fetchMaps();

  onProgress?.("quests");
  results.quests = await fetchQuests();

  onProgress?.("traders");
  results.traders = await fetchTraders();

  onProgress?.("hideout");
  results.hideout = await fetchHideout();

  return results;
}

module.exports = {
  fetchItems,
  fetchMaps,
  fetchQuests,
  fetchTraders,
  fetchHideout,
  fetchAll,
  mapItem,
  mapMap,
  mapQuest,
};
