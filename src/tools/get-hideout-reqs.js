const dataStore = require("../data-store");

const schema = {
  name: "get_hideout_requirements",
  description: "Get material requirements for hideout module upgrades.",
  parameters: {
    type: "object",
    properties: {
      module_name: { type: "string", description: "Hideout module name (e.g. Workbench, Lavatory, Med Station)" },
    },
    required: ["module_name"],
  },
};

async function handler(args) {
  const rows = dataStore.searchHideout(args.module_name);
  if (rows.length === 0) return "No hideout modules found.";
  return rows.map((m) => `${m.name}: ${m.requirements}`).join("\n");
}

module.exports = { schema, handler };
