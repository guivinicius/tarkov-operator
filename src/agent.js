const llm = require("./llm");
const tools = require("./tools/index");
const rag = require("./rag");
const dataStore = require("./data-store");

const MAX_ITERATIONS = 5;

const REMOTE_TOOLS = new Set(["lookup_item", "search_quests", "get_map_info", "get_hideout_requirements"]);
const MEMORY_TOOLS = new Set(["remember_fact", "recall_fact"]);

async function process(userText, opts = {}) {
  // 1. RAG context
  let ragContext = "";
  try {
    console.log(`[agent] phase=rag query="${userText}"`);
    ragContext = await rag.search(userText);
  } catch (e) { console.log(`[agent] rag_error=${e.message}`); }

  // 2. Memory profile
  let memoryProfile = "";
  try {
    const allMemory = dataStore.getAllMemory();
    console.log(`[agent] memory_entries=${allMemory.length}`);
    if (allMemory.length > 0) {
      memoryProfile = "\n[USER PROFILE]\n" +
        allMemory.map((m) => `${m.key}: ${m.value}`).join("\n") +
        "\n[/USER PROFILE]\n";
    }
  } catch (e) { console.log(`[agent] memory_error=${e.message}`); }

  // 3. Tool selection
  const isLocal = !opts.apiKey && (!opts.baseURL || opts.baseURL.includes("localhost"));
  const allSchemas = tools.getSchemas();
  const activeSchemas = isLocal ? allSchemas.filter((t) => MEMORY_TOOLS.has(t.name)) : allSchemas;
  console.log(`[agent] tools=${activeSchemas.length} is_local=${isLocal}`);

  // 4. Build system prompt append
  let systemPromptAppend = "";
  if (ragContext) {
    systemPromptAppend += ragContext;
    console.log(`[agent] rag_injected=${ragContext.length}chars`);
  }
  if (memoryProfile) {
    systemPromptAppend += memoryProfile;
    console.log(`[agent] memory_injected=${memoryProfile.length}chars`);
  }

  // 5. Agent loop
  let toolsEnabled = activeSchemas.length > 0;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    console.log(`[agent] iteration=${i + 1}/${MAX_ITERATIONS} tools=${toolsEnabled}`);
    const llmOpts = {
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
      model: opts.model,
      systemPrompt: opts.systemPrompt,
      systemPromptAppend,
    };

    if (toolsEnabled) llmOpts.tools = activeSchemas;

    const result = await llm.ask(userText, llmOpts);

    // Model didn't support tools — retry this iteration without them
    if (toolsEnabled && result.finishReason !== "tool_calls" && !result.text) {
      console.log(`[agent] model_doesnt_support_tools fallback=no_tools`);
      toolsEnabled = false;
      i--; // retry current iteration without tools
      continue;
    }

    if (result.finishReason === "tool_calls" && result.toolCalls) {
      console.log(`[agent] tool_calls=${result.toolCalls.length}`);
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

    console.log(`[agent] done iters=${i + 1} text="${result.text.slice(0, 100)}"`);
    return {
      text: result.text,
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    };
  }

  console.log(`[agent] max_iterations_reached`);
  return {
    text: "Unable to complete request. Too many steps.",
    model: "unknown",
    promptTokens: 0,
    completionTokens: 0,
  };
}

module.exports = { process };
