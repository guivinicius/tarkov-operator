const dataStore = require("../data-store");

const schema = {
  name: "search_quests",
  description: "Search for quests in Tarkov by name, trader, or objective keywords.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search term — quest name, trader, or objective" },
    },
    required: ["query"],
  },
};

async function handler(args) {
  console.log(`[tool:search_quests] query="${args.query}"`);
  const results = dataStore.fullTextSearch(args.query, 5);
  const quests = results.filter((r) => r.type === "quest");
  console.log(`[tool:search_quests] found=${quests.length}`);
  if (quests.length === 0) return "No quests found.";
  return quests.map((q) =>
    `${q.name} — ${q.objectives.slice(0, 200)}`
  ).join("\n");
}

module.exports = { schema, handler };
