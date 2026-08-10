const dataStore = require("../data-store");
const logger = require("../logger");

const schema = {
  name: "item_value",
  description:
    "Look up the flea market and trader sell price for an item in Tarkov. Returns spoken-style price info.",
  parameters: {
    type: "object",
    properties: {
      item_name: {
        type: "string",
        description: "Item name or short name, e.g. LEDX, GPU, Red Keycard",
      },
    },
    required: ["item_name"],
  },
};

async function handler(args) {
  if (!args.item_name || typeof args.item_name !== "string" || !args.item_name.trim()) {
    return "Please provide an item name.";
  }
  logger.debug(`[tool:item_value] item_name="${args.item_name}"`);

  const row = dataStore.getItemValue(args.item_name);
  logger.debug(`[tool:item_value] found=${!!row}`);

  if (!row) return `No item found matching "${args.item_name}".`;

  const name = row.name || row.short_name;

  const flea = row.avg_24h_price;
  const fleaPart = flea
    ? `flea about ${flea.toLocaleString("en-US")} roubles`
    : "not sold on flea";

  let traderPart = null;
  if (row.sell_for) {
    let sellFor;
    try { sellFor = JSON.parse(row.sell_for); } catch { sellFor = null; }
    if (Array.isArray(sellFor) && sellFor.length > 0) {
      const best = sellFor.reduce((a, b) =>
        (b.priceRUB || 0) > (a.priceRUB || 0) ? b : a
      );
      if (best.priceRUB) {
        traderPart = `sells to ${best.vendor} for ${best.priceRUB.toLocaleString("en-US")} roubles`;
      }
    }
  }

  if (traderPart) {
    return `${name}: ${fleaPart}, ${traderPart}.`;
  }
  return `${name}: ${fleaPart}.`;
}

module.exports = { schema, handler };
