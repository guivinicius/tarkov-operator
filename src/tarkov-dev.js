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
      }
    }
  `);
  return (data.items || []).map((item) => ({
    id: item.id,
    name: item.name,
    shortName: item.shortName,
    description: (item.description || "").replace(/<[^>]*>/g, ""),
    category: (item.categories || []).map((c) => c.name).join(", "),
    types: (item.types || []).join(", "),
    basePrice: item.basePrice || 0,
    weight: item.weight || 0,
  }));
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
      }
    }
  `);
  return (data.maps || []).map((m) => ({
    id: m.id,
    name: m.name,
    description: (m.description || "").replace(/<[^>]*>/g, ""),
    enemies: (m.enemies || []).join(", "),
    raidDuration: m.raidDuration || 0,
  }));
}

async function fetchQuests() {
  const data = await graphql(`
    {
      tasks {
        id
        name
        trader {
          name
        }
        objectives {
          description
        }
      }
    }
  `);
  return (data.tasks || []).map((q) => ({
    id: q.id,
    name: q.name,
    trader: q.trader?.name || "Unknown",
    objectives: (q.objectives || []).map((o) => o.description).join("; "),
  }));
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

module.exports = { fetchItems, fetchMaps, fetchQuests, fetchTraders, fetchHideout, fetchAll };
