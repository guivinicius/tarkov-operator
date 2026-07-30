// tests/retrieval-routing.test.js
// Task 8: Retrieval routing — tools XOR RAG + upfront capability detection.
// All routing decisions are pure functions, testable without mocking the full agent.

const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");

const modelsFixture = require("./fixtures/openrouter-models.json");

// ---------------------------------------------------------------------------
// supportsToolsFromList — pure, no I/O
// ---------------------------------------------------------------------------

test("supportsToolsFromList: model with tools in supported_parameters → true", () => {
  const { supportsToolsFromList } = require("../src/model-caps");
  const result = supportsToolsFromList(modelsFixture.data, "openai/gpt-4o-tools");
  assert.strictEqual(result, true);
});

test("supportsToolsFromList: model without tools in supported_parameters → false", () => {
  const { supportsToolsFromList } = require("../src/model-caps");
  const result = supportsToolsFromList(modelsFixture.data, "meta/llama-no-tools");
  assert.strictEqual(result, false);
});

test("supportsToolsFromList: model absent from list → null", () => {
  const { supportsToolsFromList } = require("../src/model-caps");
  const result = supportsToolsFromList(modelsFixture.data, "unknown/model-not-in-list");
  assert.strictEqual(result, null);
});

// ---------------------------------------------------------------------------
// chooseRetrieval — pure, no I/O
// ---------------------------------------------------------------------------

test("chooseRetrieval: caps=true (confirmed tool-capable) → tools-on / RAG-off", () => {
  const { chooseRetrieval } = require("../src/agent");
  assert.strictEqual(chooseRetrieval(true), "tools");
});

test("chooseRetrieval: caps=false (confirmed no-tools) → tools-off / RAG-on", () => {
  const { chooseRetrieval } = require("../src/agent");
  assert.strictEqual(chooseRetrieval(false), "rag");
});

test("chooseRetrieval: caps=null (unknown capability) → tools-on / RAG-off (optimistic)", () => {
  const { chooseRetrieval } = require("../src/agent");
  // 301/367 OpenRouter models support tools — optimistic is correct default
  assert.strictEqual(chooseRetrieval(null), "tools");
});

// ---------------------------------------------------------------------------
// Network failure handling
// ---------------------------------------------------------------------------

test("network failure during supportsTools lookup → null, does not throw", async () => {
  const { supportsTools } = require("../src/model-caps");

  // Spin up a server then immediately close it → guaranteed ECONNREFUSED
  const tmpServer = http.createServer();
  await new Promise((resolve) => tmpServer.listen(0, "127.0.0.1", resolve));
  const deadPort = tmpServer.address().port;
  await new Promise((resolve) => tmpServer.close(resolve));

  const result = await supportsTools({
    provider: "openrouter",
    baseURL: `http://127.0.0.1:${deadPort}`,
    model: "some/model-unique-netfail-t8",
  });
  assert.strictEqual(result, null, "network failure must resolve null, not throw");
});

test("null capability (from network failure) routes tools-on / RAG-off (optimistic)", () => {
  const { chooseRetrieval } = require("../src/agent");
  assert.strictEqual(chooseRetrieval(null), "tools");
});

// ---------------------------------------------------------------------------
// Local / Ollama config detection
// ---------------------------------------------------------------------------

test("isLocalConfig: no apiKey → local (memory-tools + RAG)", () => {
  const { isLocalConfig } = require("../src/agent");
  assert.ok(isLocalConfig({}), "empty opts must be local");
  assert.ok(
    isLocalConfig({ baseURL: "http://localhost:11434/v1" }),
    "localhost URL with no key must be local"
  );
});

test("isLocalConfig: apiKey present → not local (remote provider)", () => {
  const { isLocalConfig } = require("../src/agent");
  assert.ok(
    !isLocalConfig({ apiKey: "sk-or-xxx", baseURL: "https://openrouter.ai/api/v1" }),
    "remote key + remote URL must not be local"
  );
  assert.ok(
    !isLocalConfig({ apiKey: "sk-xxx" }),
    "any apiKey means remote"
  );
});

// ---------------------------------------------------------------------------
// Invariant: RAG and tools are never both active
// ---------------------------------------------------------------------------

test("RAG and tools are never both enabled across all routing branches", () => {
  const { chooseRetrieval } = require("../src/agent");

  // All caps values the capability check can return
  const capsValues = [true, false, null];
  const routes = capsValues.map((c) => chooseRetrieval(c));

  // Each outcome must be exactly one path — never "both"
  for (const route of routes) {
    assert.ok(
      route === "tools" || route === "rag",
      `chooseRetrieval returned unexpected value: ${route}`
    );
  }

  // Exact spec mapping: true→tools, false→rag, null→tools
  assert.deepStrictEqual(routes, ["tools", "rag", "tools"]);
});
