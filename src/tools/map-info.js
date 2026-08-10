const dataStore = require("../data-store");
const logger = require("../logger");

const schema = {
  name: "map_info",
  description:
    "Get extract points for a Tarkov map, with faction info. Returns spoken-style extract list.",
  parameters: {
    type: "object",
    properties: {
      map_name: {
        type: "string",
        description: "Map name, e.g. Reserve, Customs, Woods, Interchange",
      },
    },
    required: ["map_name"],
  },
};

async function handler(args) {
  if (!args.map_name || typeof args.map_name !== "string" || !args.map_name.trim()) {
    return "Please provide a map name.";
  }
  logger.debug(`[tool:map_info] map_name="${args.map_name}"`);

  const row = dataStore.getMapWithExtracts(args.map_name);
  logger.debug(`[tool:map_info] found=${!!row}`);

  if (!row) return `No map found matching "${args.map_name}".`;

  const extracts = row.extracts;
  if (!extracts || extracts.length === 0) {
    return `${row.name}: no extract data available.`;
  }

  const extractParts = extracts.map((e) => {
    const faction = e.faction ? ` (${e.faction})` : "";
    return `${e.name}${faction}`;
  });

  if (extractParts.length === 1) {
    return `${row.name} has one extract: ${extractParts[0]}.`;
  }

  const last = extractParts.pop();
  return `${row.name} extracts: ${extractParts.join(", ")}, and ${last}.`;
}

module.exports = { schema, handler };
