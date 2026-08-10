// JSON REST client for tarkov.dev API.
// Fetches items, maps, quests, traders, and hideout data
// from json.tarkov.dev with English translations.

const https = require("https");

const BASE_URL = "https://json.tarkov.dev";
const GAME_MODE = "regular";
const LANG = "en";

// ---------------------------------------------------------------------------
// HTTP + translation helpers
// ---------------------------------------------------------------------------

function fetchJson(path) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    const req = https.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode} for ${path}`));
      }
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
  });
}

/**
 * Resolve a translation key against a translations dictionary.
 * Returns the translated string, or the key itself as fallback.
 */
function tr(key, translations) {
  if (!key) return null;
  return translations[key] || key;
}

/**
 * Fetch data and English translations for an endpoint.
 * Returns { data, translations }.
 */
async function fetchEndpoint(endpoint) {
  const [dataResp, langResp] = await Promise.all([
    fetchJson(`/${GAME_MODE}/${endpoint}`),
    fetchJson(`/${GAME_MODE}/${endpoint}_${LANG}`),
  ]);
  return {
    data: dataResp.data || dataResp,
    translations: langResp.data || langResp,
  };
}

/**
 * Fetch only the English translations for an endpoint.
 */
async function fetchTranslations(endpoint) {
  const resp = await fetchJson(`/${GAME_MODE}/${endpoint}_${LANG}`);
  return resp.data || resp;
}

// ---------------------------------------------------------------------------
// Pure mapping functions — transform JSON API nodes into DB row shapes.
// Consumed by insertItems/insertMaps/insertQuests in data-store.js.
// ---------------------------------------------------------------------------

/**
 * mapItem(node, translations, categoryLookup, traderTranslations) → ItemRow
 * Ammo fields are null for non-ammo items.
 *
 * @param {object} item           – raw item node from /regular/items
 * @param {object} translations   – English translations from /regular/items_en
 * @param {object} categoryLookup – itemCategories dict from /regular/items
 * @param {object} traderTr       – English translations from /regular/traders_en
 */
function mapItem(item, translations, categoryLookup, traderTr) {
  translations = translations || {};
  categoryLookup = categoryLookup || {};
  traderTr = traderTr || {};

  const ammo =
    item.properties && item.properties.propertiesType === "ItemPropertiesAmmo"
      ? item.properties
      : null;

  const categoryNames = (item.categories || []).map((catId) => {
    const cat = categoryLookup[catId];
    return cat ? tr(cat.name, translations) : catId;
  });

  const sellFor = (item.sellToTrader || []).map((s) => ({
    vendor: s.trader ? tr(s.trader + " Nickname", traderTr) : null,
    priceRUB: s.priceRUB != null ? s.priceRUB : null,
  }));

  const desc = tr(item.description, translations);

  return {
    id: item.id,
    name: tr(item.name, translations),
    shortName: tr(item.shortName, translations) || null,
    description: desc ? desc.replace(/<[^>]*>/g, "") : null,
    category: categoryNames.join(", "),
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
 * mapMap(node, translations) → MapRow
 * extracts is a JSON string of [{name, faction}].
 *
 * @param {object} m            – raw map node from /regular/maps
 * @param {object} translations – English translations from /regular/maps_en
 */
function mapMap(m, translations) {
  translations = translations || {};

  const extracts = (m.extracts || []).map((e) => ({
    name: tr(e.name, translations),
    faction: e.faction || null,
  }));

  const desc = tr(m.description, translations);

  return {
    id: m.id,
    name: tr(m.name, translations),
    description: desc ? desc.replace(/<[^>]*>/g, "") : null,
    enemies: (m.enemies || []).map((e) => tr(e, translations)).join(", "),
    raidDuration: m.raidDuration || 0,
    players: m.players || null,
    minPlayerLevel: m.minPlayerLevel != null ? m.minPlayerLevel : null,
    extracts: JSON.stringify(extracts),
  };
}

/**
 * mapQuest(node, translations, traderTranslations, mapsTranslations) → QuestRow
 * objectives is plain text for FTS; objectivesJson is structured JSON.
 * requirements is comma-joined prerequisite task names.
 *
 * @param {object} q        – raw task node from /regular/tasks
 * @param {object} tasksTr  – English translations from /regular/tasks_en
 * @param {object} traderTr – English translations from /regular/traders_en
 * @param {object} mapsTr   – English translations from /regular/maps_en
 */
function mapQuest(q, tasksTr, traderTr, mapsTr) {
  tasksTr = tasksTr || {};
  traderTr = traderTr || {};
  mapsTr = mapsTr || {};

  const objectives = q.objectives || [];

  // Flatten objectives to plain text for FTS indexing
  const objectivesText = objectives
    .map((o) => tr(o.description, tasksTr) || "")
    .filter(Boolean)
    .join("; ");

  // Structured JSON for tool use
  const objectivesJson = objectives.map((o) => {
    // Extract unique map names from zones
    const mapIds = [
      ...new Set((o.zones || []).map((z) => z.map).filter(Boolean)),
    ];
    const mapNames = mapIds.map((id) => tr(id + " Name", mapsTr));

    return {
      type: o.type || null,
      description: tr(o.description, tasksTr) || null,
      maps: mapNames,
      optional: o.optional === true,
    };
  });

  // Prerequisite task names, comma-joined
  const requirements = (q.taskRequirements || [])
    .map((r) => {
      const taskId = typeof r === "string" ? r : r.task || null;
      return taskId ? tr(taskId + " name", tasksTr) : null;
    })
    .filter(Boolean)
    .join(", ");

  return {
    id: q.id,
    name: tr(q.name, tasksTr),
    trader: q.trader ? tr(q.trader + " Nickname", traderTr) : null,
    map: q.map ? tr(q.map + " Name", mapsTr) : null,
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
  const { data, translations } = await fetchEndpoint("items");
  const traderTr = await fetchTranslations("traders");

  const items = data.items || {};
  const categories = data.itemCategories || {};

  return Object.values(items).map((item) =>
    mapItem(item, translations, categories, traderTr)
  );
}

async function fetchMaps() {
  const { data, translations } = await fetchEndpoint("maps");
  const maps = data.maps || {};

  return Object.values(maps).map((m) => mapMap(m, translations));
}

async function fetchQuests() {
  const { data, translations } = await fetchEndpoint("tasks");
  const traderTr = await fetchTranslations("traders");
  const mapsTr = await fetchTranslations("maps");

  const tasks = data.tasks || {};

  return Object.values(tasks).map((q) =>
    mapQuest(q, translations, traderTr, mapsTr)
  );
}

async function fetchTraders() {
  const { data, translations } = await fetchEndpoint("traders");

  return Object.values(data)
    .filter((t) => t && t.id)
    .map((t) => ({
      id: t.id,
      name: tr(t.id + " Nickname", translations),
      description: (tr(t.id + " Description", translations) || "").replace(
        /<[^>]*>/g,
        ""
      ),
      currency: t.currency || "RUB",
    }));
}

async function fetchHideout() {
  const { data, translations } = await fetchEndpoint("hideout");
  const itemsTr = await fetchTranslations("items");

  return Object.values(data)
    .filter((mod) => mod && mod.id)
    .flatMap((mod) =>
      (mod.levels || []).map((lvl) => ({
        id: lvl.id || `${mod.id}-lvl${lvl.level}`,
        name: `${tr(mod.name, translations)} Lv.${lvl.level}`,
        requirements: (lvl.itemRequirements || [])
          .map(
            (r) =>
              `${r.count}x ${tr(r.item + " Name", itemsTr) || "Unknown"}`
          )
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
