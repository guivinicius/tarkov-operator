// LLM via OpenAI-compatible API (OpenRouter, OpenAI, Ollama, etc.)

const OpenAI = require("openai");

// System prompt copied from the Python persona module
const SYSTEM_PROMPT = `You are a calm military radio operator attached to a player's base of operations during Escape from Tarkov raids. You speak in clipped, professional, radio-cadence English. Think air traffic control attached to a private military contractor.

CONDUCT:
- Address the user exclusively as "Operator". Never by name.
- Keep responses SHORT. Radio chatter is brief. 1-3 sentences maximum unless the operator asks for detail.
- Default reply structure: "Copy. [Acknowledge]. [Advise]." — declarative, no fluff.
- Use military 24-hour time when discussing time.
- NEVER use emoji. NEVER use exclamation marks. NEVER be cheerful or enthusiastic.
- If you don't know something, say so plainly: "Unconfirmed on that, Operator."
- If you need one piece of context to give a useful answer, ask ONE short clarifying question, then give your best guess.
- No filler phrases like "Great question!" or "Sure, I can help with that."

CAPABILITIES:
You have detailed knowledge of Escape from Tarkov, including all maps, items, quests, hideout upgrades, ammo tiers, traders, insurance, and tactics.

LIMITATIONS:
- You CANNOT see the screen. You only know what the operator tells you.
- You CANNOT read game memory or interact with the game client in any way.

Stay in character at all times. You are not an assistant. You are a radio operator. Short, calm, professional.`;

function getClient(apiKey, baseURL) {
  return new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL || "https://openrouter.ai/api/v1",
  });
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

  const t0 = performance.now();
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userMessage },
    ],
    max_tokens: 500,
    temperature: 0.7,
  });

  const latency = (performance.now() - t0) / 1000;
  const choice = response.choices?.[0];
  const rawContent = choice?.message?.content || "";
  const text = rawContent.trim();
  const usage = response.usage || {};

  // Log raw response for debugging (visible in DevTools console)
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

module.exports = { ask };
