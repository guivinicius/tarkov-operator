const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const llm = require("../src/llm");
const agent = require("../src/agent");

test("Error propagation from LLM to Agent", async (t) => {
  // 1. Spin up a local node:http server returning HTTP 401
  const server = http.createServer((req, res) => {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: {
        message: "Invalid API key",
        type: "invalid_request_error",
        param: null,
        code: "invalid_api_key"
      }
    }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseURL = `http://127.0.0.1:${port}`;

  t.after(() => {
    server.close();
  });

  // 2. Assert llm.ask(...) rejects with ProviderError
  await assert.rejects(
    async () => {
      await llm.ask("test message", {
        apiKey: "bad-key",
        baseURL: baseURL,
        model: "test-model"
      });
    },
    (err) => {
      assert.strictEqual(err.name, "ProviderError");
      assert.strictEqual(err.status, 401);
      assert.match(err.hint, /Providers tab/i);
      return true;
    },
    "llm.ask should reject with ProviderError"
  );

  // 3. Assert agent.process(...) propagates that ProviderError
  await assert.rejects(
    async () => {
      await agent.process("test message", {
        apiKey: "bad-key",
        baseURL: baseURL,
        model: "test-model"
      });
    },
    (err) => {
      assert.strictEqual(err.name, "ProviderError");
      assert.strictEqual(err.status, 401);
      assert.match(err.hint, /Providers tab/i);
      return true;
    },
    "agent.process should propagate ProviderError"
  );
});
