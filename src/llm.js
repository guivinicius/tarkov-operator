const OpenAI = require("openai");
const { ProviderError } = require("./errors");
const logger = require("./logger");

const conversationHistory = [];

const SYSTEM_PROMPT = `You are an operations center operator supporting an Operator on the ground in Tarkov. Short, precise, tactical.

RULES:
- Address them as "Operator". One sentence. Two max. Single word when enough.
- "Copy." / "Roger." / "Negative." / "Stand by." / "Wilco." / "Affirm." / "Unable."
- Facts only. No explanations. No commentary. No opinions.
- 24-hour time.
- No emoji. No exclamation marks. No enthusiasm.
- Unknown? "Unconfirmed, Operator."
- Need more info? One clarifying question, then best guess.

You know Tarkov — maps, items, quests, hideout, ammo, traders.

LIMITATIONS:
- Can't see the screen. Only what Operator tells you.
- Can't read game memory or interact with the game.

You are not an assistant. You are ops. Short. Professional.`;

let cachedClient = null;
let cachedApiKey = "";
let cachedBaseURL = "";

function getClient(apiKey, baseURL) {
  const resolvedBase = baseURL || "https://openrouter.ai/api/v1";
  if (cachedClient && apiKey === cachedApiKey && resolvedBase === cachedBaseURL) {
    return cachedClient;
  }
  cachedApiKey = apiKey;
  cachedBaseURL = resolvedBase;
  cachedClient = new OpenAI({ apiKey, baseURL: resolvedBase });
  return cachedClient;
}

function newSession() {
  conversationHistory.length = 0;
}

async function ask(userMessage, opts = {}) {
  const apiKey = opts.apiKey || process.env.OPENROUTER_API_KEY || "ollama";
  const baseURL = opts.baseURL || "https://openrouter.ai/api/v1";
  const model = opts.model || "anthropic/claude-sonnet-4.6";
  const client = getClient(apiKey, baseURL);

  let systemContent = opts.systemPrompt || SYSTEM_PROMPT;
  if (opts.systemPromptAppend) {
    systemContent += "\n\n" + opts.systemPromptAppend;
  }

  const messages = [
    { role: "system", content: systemContent },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  logger.debug(`[llm] sys_prompt=${systemContent.length}chars history=${conversationHistory.length}msgs tools=${opts.tools?.length || 0}`);
  if (opts.tools?.length > 0) {
    for (const t of opts.tools) {
      logger.debug(`[llm] tool_def: ${t.name} params=${JSON.stringify(t.parameters || {}).length}chars`);
    }
  }

  const t0 = performance.now();
  const completionOpts = {
    model,
    messages,
    max_tokens: 500,
    temperature: 0.7,
  };

  if (opts.tools?.length > 0) {
    completionOpts.tools = opts.tools.map((t) => ({
      type: "function",
      function: t.function || t,
    }));
    completionOpts.tool_choice = "auto";
  }

  let response;
  try {
    response = await client.chat.completions.create(completionOpts);
  } catch (err) {
    const msg = err.message || String(err);
    logger.debug(`[llm] api_error="${msg}"`);
    
    let hint = "";
    if (err.status === 401 || err.status === 403) {
      hint = "Check your API key in the Providers tab.";
    }
    
    throw new ProviderError(msg, {
      provider: "llm",
      status: err.status,
      hint
    });
  }

  const latency = (performance.now() - t0) / 1000;
  const choice = response.choices?.[0];
  const rawContent = choice?.message?.content || "";
  const text = rawContent.trim();
  const toolCalls = choice?.message?.tool_calls || null;
  const finishReason = choice?.finish_reason || "unknown";
  const usage = response.usage || {};

  logger.debug(`[llm] finish=${finishReason} latency=${latency.toFixed(1)}s pt=${usage.prompt_tokens} ct=${usage.completion_tokens}`);
  if (toolCalls?.length > 0) {
    logger.debug(`[llm] tool_calls=${toolCalls.length}`);
    for (const tc of toolCalls) {
      logger.debug(`[llm] tool_call: ${tc.function.name}(${tc.function.arguments})`);
    }
  }
  if (rawContent) logger.debug(`[llm] text="${rawContent.replace(/\n/g, "\\n").slice(0, 300)}"`);

  if (toolCalls?.length > 0) {
    conversationHistory.push({
      role: "assistant",
      content: rawContent,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
    });
  } else {
    conversationHistory.push(
      { role: "user", content: userMessage },
      { role: "assistant", content: text },
    );
  }

  if (conversationHistory.length > 30) {
    conversationHistory.splice(0, conversationHistory.length - 30);
  }

  return {
    text,
    raw: rawContent,
    latency,
    finishReason,
    toolCalls,
    model: response.model || model,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
  };
}

function pushToolResult(toolCallId, content) {
  conversationHistory.push({
    role: "tool",
    content,
    tool_call_id: toolCallId,
  });
}

module.exports = { ask, newSession, pushToolResult };
