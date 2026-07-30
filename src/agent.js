const llm = require("./llm");
const tools = require("./tools/index");
const rag = require("./rag");
const dataStore = require("./data-store");
const logger = require("./logger");
const modelCaps = require("./model-caps");

const MAX_ITERATIONS = 5;

const MEMORY_TOOLS = new Set(["remember_fact", "recall_fact"]);

/**
 * Pure helper — exported for tests.
 *
 * Returns true when the opts represent a local / Ollama configuration:
 *   no apiKey AND (no baseURL OR baseURL is localhost).
 * Local configs use memory-tools only and blanket RAG injection.
 *
 * @param {object} opts
 */
function isLocalConfig(opts = {}) {
  if (opts.apiKey) return false;
  if (opts.baseURL && !opts.baseURL.includes("localhost")) return false;
  return true;
}

/**
 * Pure routing function — exported for tests.
 *
 * Accepts the tri-state from model-caps and returns the retrieval path:
 *   caps === true  → "tools"   (confirmed tool-capable; blanket RAG off)
 *   caps === false → "rag"     (confirmed no tool support; tools off, RAG on)
 *   caps === null  → "tools"   (unknown; 301/367 OR models support tools — optimistic)
 *
 * @param {true|false|null} caps
 * @returns {"tools"|"rag"}
 */
function chooseRetrieval(caps) {
  return caps === false ? "rag" : "tools";
}

async function process(userText, opts = {}) {
  // 1. Memory profile — injected in ALL cases (not part of the RAG/tools tradeoff — D7)
  let memoryProfile = "";
  try {
    const allMemory = dataStore.getAllMemory();
    logger.debug(`[agent] memory_entries=${allMemory.length}`);
    if (allMemory.length > 0) {
      memoryProfile = "\n[USER PROFILE]\n" +
        allMemory.map((m) => `${m.key}: ${m.value}`).join("\n") +
        "\n[/USER PROFILE]\n";
    }
  } catch (e) { logger.debug(`[agent] memory_error=${e.message}`); }

  // 2. Routing: determine the retrieval path and the active tool set.
  //    Invariant: RAG injection and full tool set NEVER run in the same request.
  let retrieval;
  let activeSchemas;

  if (isLocalConfig(opts)) {
    // Local / Ollama: memory tools only; blanket RAG injection on (existing behaviour)
    retrieval = "rag";
    activeSchemas = tools.getSchemas().filter((t) => MEMORY_TOOLS.has(t.name));
    logger.debug(`[agent] routing=local tools=${activeSchemas.length}`);
  } else {
    // Remote model: upfront capability detection via OpenRouter /models endpoint
    const caps = await modelCaps.supportsTools({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
      model: opts.model,
    });
    logger.debug(`[agent] model_caps=${caps}`);
    retrieval = chooseRetrieval(caps);
    activeSchemas = retrieval === "tools"
      ? tools.getSchemas()
      : tools.getSchemas().filter((t) => MEMORY_TOOLS.has(t.name));
    logger.debug(`[agent] routing=${retrieval} tools=${activeSchemas.length}`);
  }

  // 3. RAG context — only when retrieval === "rag" (never together with full toolset)
  let ragContext = "";
  if (retrieval === "rag") {
    try {
      logger.debug(`[agent] phase=rag query="${userText}"`);
      ragContext = await rag.search(userText);
    } catch (e) { logger.debug(`[agent] rag_error=${e.message}`); }
  }

  // 4. Build system prompt append: memory profile in all cases; RAG only when routed
  let systemPromptAppend = "";
  if (ragContext) {
    systemPromptAppend += ragContext;
    logger.debug(`[agent] rag_injected=${ragContext.length}chars`);
  }
  if (memoryProfile) {
    systemPromptAppend += memoryProfile;
    logger.debug(`[agent] memory_injected=${memoryProfile.length}chars`);
  }

  // 5. Agent loop
  // activeSchemas already encodes the routing decision: the full set when tools
  // are the retrieval path, memory-only otherwise. Gating on retrieval here too
  // would discard the memory tools a local model is meant to keep.
  const toolsEnabled = activeSchemas.length > 0;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    logger.debug(`[agent] iteration=${i + 1}/${MAX_ITERATIONS} tools=${toolsEnabled}`);
    const llmOpts = {
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
      model: opts.model,
      systemPrompt: opts.systemPrompt,
      systemPromptAppend,
    };

    if (toolsEnabled) llmOpts.tools = activeSchemas;

    const result = await llm.ask(userText, llmOpts);

    if (result.finishReason === "tool_calls" && result.toolCalls) {
      logger.debug(`[agent] tool_calls=${result.toolCalls.length}`);
      for (const tc of result.toolCalls) {
        logger.debug(`[agent] tool_call: ${tc.function.name}(${tc.function.arguments})`);
        const handler = tools.getHandler(tc.function.name);
        if (handler) {
          try {
            const args = JSON.parse(tc.function.arguments);
            const output = await handler(args);
            llm.pushToolResult(tc.id, output);
            logger.debug(`[agent] tool_result: ${output.slice(0, 200)}`);
          } catch (err) {
            const msg = `Error executing ${tc.function.name}: ${err.message}`;
            llm.pushToolResult(tc.id, msg);
            logger.debug(`[agent] tool_error: ${msg}`);
          }
        } else {
          const msg = `Unknown tool: ${tc.function.name}`;
          llm.pushToolResult(tc.id, msg);
          logger.debug(`[agent] tool_error: ${msg}`);
        }
      }
      continue;
    }

    logger.debug(`[agent] done iters=${i + 1} text="${result.text.slice(0, 100)}"`);
    return {
      text: result.text,
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    };
  }

  logger.debug(`[agent] max_iterations_reached`);
  return {
    text: "Unable to complete request. Too many steps.",
    model: "unknown",
    promptTokens: 0,
    completionTokens: 0,
  };
}

module.exports = { process, chooseRetrieval, isLocalConfig };
