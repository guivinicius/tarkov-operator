// LLM via OpenAI-compatible API (OpenRouter, OpenAI, Ollama, etc.)

const OpenAI = require("openai");

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

function getClient(apiKey, baseURL) {
  return new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL || "https://openrouter.ai/api/v1",
  });
}

function newSession() {
  conversationHistory.length = 0;
}

async function ask(userMessage, opts = {}) {
  const apiKey = opts.apiKey || process.env.OPENROUTER_API_KEY || "ollama";
  const isLocal = !opts.apiKey && (!opts.baseURL || opts.baseURL.includes("localhost"));

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

  const t0 = performance.now();
  const response = await client.chat.completions.create({
    model,
    messages,
    max_tokens: 500,
    temperature: 0.7,
  });

  const latency = (performance.now() - t0) / 1000;
  const choice = response.choices?.[0];
  const rawContent = choice?.message?.content || "";
  const text = rawContent.trim();
  const usage = response.usage || {};

  conversationHistory.push(
    { role: "user", content: userMessage },
    { role: "assistant", content: text },
  );

  // Keep last 15 exchanges to stay within context window
  if (conversationHistory.length > 30) {
    conversationHistory.splice(0, conversationHistory.length - 30);
  }

  console.log(`[llm-raw] finish=${choice?.finish_reason} pt=${usage.prompt_tokens} ct=${usage.completion_tokens}`);
  console.log(`[llm-raw] content="${rawContent.replace(/\n/g, "\\n").slice(0, 500)}"`);

  return {
    text,
    raw: rawContent,
    latency,
    finishReason: choice?.finish_reason || "unknown",
    model: response.model || model,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
  };
}

module.exports = { ask, newSession };
