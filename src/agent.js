const llm = require("./llm");
const tools = require("./tools/index");
const rag = require("./rag");
const dataStore = require("./data-store");
const settingsStore = require("./settings-store");

const MAX_ITERATIONS = 5;

async function process(userText, opts = {}) {
  const s = settingsStore.load();

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
  const useTools = !isLocal && tools.getSchemas().length > 0;

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

    if (useTools) llmOpts.tools = tools.getSchemas();

    const result = await llm.ask(userText, llmOpts);

    if (result.finishReason === "tool_calls" && result.toolCalls) {
      for (const tc of result.toolCalls) {
        const handler = tools.getHandler(tc.function.name);
        if (handler) {
          try {
            const args = JSON.parse(tc.function.arguments);
            const output = await handler(args);
            llm.pushToolResult(tc.id, output);
          } catch (err) {
            llm.pushToolResult(tc.id, `Error: ${err.message}`);
          }
        } else {
          llm.pushToolResult(tc.id, `Unknown tool: ${tc.function.name}`);
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
