const OpenAI = require("openai");
const { ProviderError } = require("./errors");
const logger = require("./logger");

const conversationHistory = [];

const SYSTEM_PROMPT = `You are an operations center operator supporting a field operative in Escape from Tarkov.
Your primary mission is to help the operative survive, extract alive, profit, and complete raid objectives.

RULES:
- Short, precise, tactical. One sentence. Two max (three only for critical tactical warnings). Single word when enough.
- Comms brevity: "Copy." / "Roger." / "Negative." / "Stand by." / "Wilco." / "Affirm." / "Unable."
- Facts only. No fluff, no commentary, no markdown formatting (no asterisks, bullet points, or tables).
- 24-hour time.
- No emoji. No exclamation marks. No enthusiasm.
- Unknown or unverified? "Unconfirmed."

TACTICAL AWARENESS & SURVIVAL:
- Prioritize operative survival. When providing navigation, routes, or extractions, ALWAYS highlight tactical dangers: sniper sightlines, hot zones, open crossings, and chokepoints. Suggest safer approaches or warn to stay in cover.

STRICT FACTUALITY:
- NEVER invent, assume, or guess information. If data is unconfirmed, say "Unconfirmed."

VISION & SCREENSHOTS:
- Operative messages may include an attached screenshot of their game screen when visual context is captured. If no screenshot is attached, rely on what the operative reports verbally.
- When a screenshot IS attached: Use it to inspect their immediate situation, location, inventory, or gear.
- ANTI-HALLUCINATION: NEVER guess, assume, or invent items, weapons, ammo, or equipment. Only report items, numbers, or UI elements clearly and unambiguously visible. If a slot, item icon, or text is blurry, small, obscured, or ambiguous, say "Unclear" or "Unconfirmed" instead of guessing.

LIMITATIONS:
- Can't read game memory or interact directly with the game.

You know Tarkov — maps, extracts, items, quests, hideout, ammo, armor, traders.

You are not an assistant. You are tactical ops. Short. Professional.`;

const MAX_HISTORY_MESSAGES = 20; // ~10 dialogue turns
const DEFAULT_IDLE_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

let lastInteractionTime = Date.now();
let cachedClient = null;
let cachedApiKey = "";
let cachedBaseURL = "";

function getClient(apiKey, baseURL) {
  if (cachedClient && apiKey === cachedApiKey && baseURL === cachedBaseURL) {
    return cachedClient;
  }
  cachedApiKey = apiKey;
  cachedBaseURL = baseURL;
  cachedClient = new OpenAI({ apiKey, baseURL });
  return cachedClient;
}

function newSession(reason = "manual") {
  const prevCount = conversationHistory.length;
  conversationHistory.length = 0;
  lastInteractionTime = Date.now();
  logger.debug(`[llm:session] Reset session (reason=${reason}, cleared=${prevCount}msgs)`);
}

function pruneHistory() {
  if (conversationHistory.length <= MAX_HISTORY_MESSAGES) return;

  while (conversationHistory.length > MAX_HISTORY_MESSAGES) {
    // Drop the oldest message and continue dropping until the remaining history starts with a user turn.
    conversationHistory.shift();
    while (conversationHistory.length > 0 && conversationHistory[0].role !== "user") {
      conversationHistory.shift();
    }
  }
}

function getSessionStats() {
  return {
    messageCount: conversationHistory.length,
    lastInteractionTime,
    idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS,
  };
}

async function ask(userMessage, opts = {}) {
  const now = Date.now();
  const idleTimeout = opts.idleTimeoutMs !== undefined ? opts.idleTimeoutMs : DEFAULT_IDLE_TIMEOUT_MS;
  if (lastInteractionTime && (now - lastInteractionTime > idleTimeout) && conversationHistory.length > 0) {
    newSession("idle_timeout");
  }
  lastInteractionTime = Date.now();

  const provider = opts.provider || "openrouter";
  const apiKey = opts.apiKey || process.env.OPENROUTER_API_KEY || "";
  let baseURL = opts.baseURL;
  if (!baseURL) {
    if (provider === "openai") baseURL = "https://api.openai.com/v1";
    else if (provider === "anthropic") baseURL = "https://api.anthropic.com/v1";
    else baseURL = "https://openrouter.ai/api/v1";
  }
  
  const model = opts.model || "anthropic/claude-sonnet-4.6";
  const client = getClient(apiKey, baseURL);

  let systemContent = opts.systemPrompt || SYSTEM_PROMPT;

  if (opts.systemPromptAppend) {
    systemContent += "\n\n" + opts.systemPromptAppend;
  }

  // Build user content: plain string when text-only, array of parts when image attached.
  let userContent;
  if (opts.imageBase64) {
    userContent = [
      { type: "text", text: userMessage },
      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${opts.imageBase64}`, detail: "high" } },
    ];
  } else {
    userContent = userMessage;
  }

  const messages = [
    { role: "system", content: systemContent },
    ...conversationHistory,
    { role: "user", content: userContent },
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
    // Store only the text in history — strip images to prevent token accumulation.
    conversationHistory.push(
      { role: "user", content: userMessage },
      { role: "assistant", content: text },
    );
  }

  pruneHistory();

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

module.exports = {
  ask,
  newSession,
  pushToolResult,
  getSessionStats,
  MAX_HISTORY_MESSAGES,
  DEFAULT_IDLE_TIMEOUT_MS
};
