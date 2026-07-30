const ammoVsArmor = require("./ammo-vs-armor");
const itemValue = require("./item-value");
const questInfo = require("./quest-info");
const mapInfo = require("./map-info");
const getHideoutReqs = require("./get-hideout-reqs");
const userMemory = require("./user-memory");

const toolRegistry = {
  ammo_vs_armor: ammoVsArmor,
  item_value: itemValue,
  quest_info: questInfo,
  map_info: mapInfo,
  get_hideout_requirements: getHideoutReqs,
  remember_fact: userMemory.remember,
  recall_fact: userMemory.recall,
};

function getSchemas() {
  return Object.values(toolRegistry).map((t) => t.schema);
}

function getHandler(name) {
  return toolRegistry[name]?.handler || null;
}

module.exports = { getSchemas, getHandler };
