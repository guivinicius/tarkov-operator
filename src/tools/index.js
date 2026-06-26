const lookupItem = require("./lookup-item");
const searchQuests = require("./search-quests");
const getMapInfo = require("./get-map-info");
const getHideoutReqs = require("./get-hideout-reqs");
const userMemory = require("./user-memory");

const toolRegistry = {
  lookup_item: lookupItem,
  search_quests: searchQuests,
  get_map_info: getMapInfo,
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
