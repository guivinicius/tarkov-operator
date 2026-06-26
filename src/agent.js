const llm = require("./llm");
const tools = require("./tools/index");
const rag = require("./rag");
const dataStore = require("./data-store");

const MAX_ITERATIONS = 5;

const REMOTE_TOOLS = new Set(["lookup_item", "search_quests", "get_map_info", "get_hideout_requirements"]);
const MEMORY_TOOLS = new Set(["remember_fact", "recall_fact"]);

async function process(userText, opts = {}) {
  let ragContext = "";
  try {
    ragContext = await rag.search(userText);
  } catch {}

  let memoryProfile = "";
  try {
    const allMemory = dataStore.getAllMemory();
    if (allMemory.length > 0) {
      memoryProfile = "\n[USER PROFILE]\n" +
        allMemory.map((m) => `${m.key}: ${m.value}`).join("\n") +
        "\n[/USER PROFILE]\n";
    }
  } catch {}

  const isLocal = !opts.apiKey && (!opts.baseURL || opts.baseURL.includes("localhost"));
  const allSchemas = tools.getSchemas();
  const activeSchemas = isLocal ? allSchemas.filter((t) => MEMORY_TOOLS.has(t.name)) : allSchemas;

  let systemPromptAppend = ragContext;
  if (memoryProfile) systemPromptAppend += memoryProfile;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const llmOpts = {
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
      model: opts.model,
      systemPrompt: opts.systemPrompt,
      systemPromptAppend,
    };

    if (activeSchemas.length > 0) llmOpts.tools = activeSchemas;

    const result = await llm.ask(userText, llmOpts);

    if (result.finishReason === "tool_calls" && result.toolCalls) {
      for (const tc of result.toolCalls) {
        console.log(`[agent] tool_call: ${tc.function.name}(${tc.function.arguments})`);
        const handler = tools.getHandler(tc.function.name);
        if (handler) {
          try {
            const args = JSON.parse(tc.function.arguments);
            const output = await handler(args);
            llm.pushToolResult(tc.id, output);
            console.log(`[agent] tool_result: ${output.slice(0, 200)}`);
          } catch (err) {
            const msg = `Error executing ${tc.function.name}: ${err.message}`;
            llm.pushToolResult(tc.id, msg);
            console.log(`[agent] tool_error: ${msg}`);
          }
        } else {
          const msg = `Unknown tool: ${tc.function.name}`;
          llm.pushToolResult(tc.id, msg);
          console.log(`[agent] tool_error: ${msg}`);
        }
      }
      continue;
    }

    return {
      text: result.text,
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    };
  }

  return {
    text: "Unable to complete request. Too many steps.",
    model: "unknown",
    promptTokens: 0,
    completionTokens: 0,
  };
}

module.exports = { process };
