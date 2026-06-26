// Simple RAG context builder.
// Queries SQLite FTS5 with the user's question and formats results as LLM context.

const dataStore = require("./data-store");

function formatResults(results) {
  const items = results.filter((r) => r.type === "item").slice(0, 5);
  const maps = results.filter((r) => r.type === "map").slice(0, 3);
  const quests = results.filter((r) => r.type === "quest").slice(0, 3);

  const parts = [];

  if (items.length) {
    parts.push("### Items");
    for (const item of items) {
      parts.push(
        `- ${item.name} (${item.short_name}): ${item.description.slice(0, 150)} | ` +
        `Price: ${item.base_price}₽ | Category: ${item.category} | Types: ${item.types}`
      );
    }
  }

  if (maps.length) {
    parts.push("### Maps");
    for (const m of maps) {
      parts.push(`- ${m.name}: ${m.description.slice(0, 150)} | Enemies: ${m.enemies}`);
    }
  }

  if (quests.length) {
    parts.push("### Quests");
    for (const q of quests) {
      parts.push(`- ${q.name} (${q.trader}): ${q.objectives.slice(0, 200)}`);
    }
  }

  if (!parts.length) return "";

  return `\n[GAME DATA CONTEXT]\n${parts.join("\n")}\n[/GAME DATA CONTEXT]\n`;
}

async function search(userText) {
  const results = dataStore.fullTextSearch(userText, 11);
  return formatResults(results);
}

module.exports = { search, formatResults };
