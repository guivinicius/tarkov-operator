const dataStore = require("../data-store");

const schema = {
  name: "lookup_item",
  description: "Search for items in Tarkov by name, short name, or category. Returns price, category, and description.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search term — item name, short name, or category" },
    },
    required: ["query"],
  },
};

async function handler(args) {
  console.log(`[tool:lookup_item] query="${args.query}"`);
  const results = dataStore.fullTextSearch(args.query, 5);
  const items = results.filter((r) => r.type === "item");
  console.log(`[tool:lookup_item] found=${items.length}`);
  if (items.length === 0) return "No items found.";
  return items.map((i) =>
    `${i.name} (${i.short_name}) — ${i.base_price}₽ — ${i.category}`
  ).join("\n");
}

module.exports = { schema, handler };
