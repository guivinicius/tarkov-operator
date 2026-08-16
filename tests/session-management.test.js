const { test } = require("node:test");
const assert = require("node:assert");
const http = require("http");
const llm = require("../src/llm");
const agent = require("../src/agent");

test("session-management: isResetCommand recognizes voice reset phrases", () => {
  assert.strictEqual(agent.isResetCommand("new raid"), true);
  assert.strictEqual(agent.isResetCommand("New Raid!"), true);
  assert.strictEqual(agent.isResetCommand("reset comms"), true);
  assert.strictEqual(agent.isResetCommand("clear radio"), true);
  assert.strictEqual(agent.isResetCommand("reset session"), true);
  assert.strictEqual(agent.isResetCommand("nova raid"), true);
  assert.strictEqual(agent.isResetCommand("limpar sessão"), true);

  // Normal queries must NOT trigger reset
  assert.strictEqual(agent.isResetCommand("Where is the extract?"), false);
  assert.strictEqual(agent.isResetCommand("What is this item worth?"), false);
  assert.strictEqual(agent.isResetCommand(""), false);
});

test("session-management: agent.process instantly handles reset command", async () => {
  llm.newSession();
  const res = await agent.process("New raid");
  assert.strictEqual(res.model, "system");
  assert.ok(res.text.includes("Comms reset") || res.text.includes("nova incursão"));
});

test("session-management: idle timeout clears conversation history on next ask", async () => {
  llm.newSession();

  // Create a minimal mock server
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      id: "chatcmpl-test",
      model: "test-model",
      choices: [{
        finish_reason: "stop",
        message: { role: "assistant", content: "Roger." },
      }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    }));
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseURL = `http://127.0.0.1:${port}/v1`;

  try {
    // 1st ask
    await llm.ask("Hello operator", {
      provider: "openrouter",
      apiKey: "test-key",
      baseURL,
      model: "test-model",
      idleTimeoutMs: 50, // 50ms timeout for test
    });

    const stats1 = llm.getSessionStats();
    assert.strictEqual(stats1.messageCount, 2); // 1 user + 1 assistant

    // Wait > 50ms to simulate idle gap
    await new Promise((resolve) => setTimeout(resolve, 80));

    // 2nd ask should trigger idle timeout and reset history before adding new turn
    await llm.ask("New message after idle", {
      provider: "openrouter",
      apiKey: "test-key",
      baseURL,
      model: "test-model",
      idleTimeoutMs: 50,
    });

    const stats2 = llm.getSessionStats();
    assert.strictEqual(stats2.messageCount, 2); // History was reset, now contains only the new turn
  } finally {
    server.close();
  }
});
