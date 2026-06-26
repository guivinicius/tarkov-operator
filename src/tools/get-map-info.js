const dataStore = require("../data-store");

const schema = {
  name: "get_map_info",
  description: "Get raid information for a Tarkov map: description, enemies, raid duration.",
  parameters: {
    type: "object",
    properties: {
      map_name: { type: "string", description: "Map name (e.g. Customs, Woods, Factory)" },
    },
    required: ["map_name"],
  },
};

async function handler(args) {
  const results = dataStore.fullTextSearch(args.map_name, 3);
  const map = results.find((r) => r.type === "map");
  if (!map) return "Map not found.";
  return `${map.name}: ${map.description.slice(0, 300)} | Enemies: ${map.enemies}`;
}

module.exports = { schema, handler };
