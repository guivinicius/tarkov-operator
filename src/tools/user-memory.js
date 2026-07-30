const dataStore = require("../data-store");
const logger = require("../logger");

const rememberSchema = {
  name: "remember_fact",
  description: "Save a persistent fact about the Operator. Use for quest status, map preferences, playstyle, raid notes.",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "Fact name, e.g. current_quest, preferred_map, playstyle" },
      value: { type: "string", description: "Fact value" },
    },
    required: ["key", "value"],
  },
};

const recallSchema = {
  name: "recall_fact",
  description: "Retrieve a previously saved fact about the Operator.",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "Fact name to look up" },
    },
    required: ["key"],
  },
};

async function rememberHandler(args) {
  logger.debug(`[tool:remember_fact] key="${args.key}" value="${args.value}"`);
  dataStore.setMemory(args.key, args.value);
  return `Saved: ${args.key} = ${args.value}`;
}

async function recallHandler(args) {
  logger.debug(`[tool:recall_fact] key="${args.key}"`);
  const result = dataStore.getMemory(args.key);
  logger.debug(`[tool:recall_fact] found=${!!result}`);
  if (!result) return `No saved fact for "${args.key}".`;
  return `${args.key}: ${result.value} (saved ${result.updated_at})`;
}

module.exports = {
  remember: { schema: rememberSchema, handler: rememberHandler },
  recall: { schema: recallSchema, handler: recallHandler },
};
