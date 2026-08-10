const dataStore = require("../data-store");
const logger = require("../logger");

const schema = {
  name: "quest_info",
  description:
    "Get objectives and map info for a Tarkov quest. Returns spoken-style quest summary.",
  parameters: {
    type: "object",
    properties: {
      quest_name: {
        type: "string",
        description: "Quest name, e.g. Debut, The Punisher, Hunting Trip",
      },
    },
    required: ["quest_name"],
  },
};

async function handler(args) {
  if (!args.quest_name || typeof args.quest_name !== "string" || !args.quest_name.trim()) {
    return "Please provide a quest name.";
  }
  logger.debug(`[tool:quest_info] quest_name="${args.quest_name}"`);

  const rows = dataStore.getQuestInfo(args.quest_name);
  logger.debug(`[tool:quest_info] found=${rows.length}`);

  if (rows.length === 0) return `No quest found matching "${args.quest_name}".`;

  const q = rows[0];
  const parts = [];

  parts.push(`${q.name} from ${q.trader}`);

  if (q.map) parts.push(`on ${q.map}`);
  if (q.min_player_level) parts.push(`requires level ${q.min_player_level}`);
  if (q.kappa_required) parts.push("required for Kappa");

  const objectiveSummary = q.objectives
    ? q.objectives.slice(0, 150).replace(/\n/g, "; ")
    : null;
  if (objectiveSummary) parts.push(`objectives: ${objectiveSummary}`);

  return parts.join(", ") + ".";
}

module.exports = { schema, handler };
