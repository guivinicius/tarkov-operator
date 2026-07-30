const { test } = require("node:test");
const assert = require("node:assert");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dataStore = require("../src/data-store");
const agent = require("../src/agent");
const llm = require("../src/llm");
const fixture = require("./fixtures/seed-rows.json");

const MODEL = "test/tool-capable";

// Stands in for an OpenAI-compatible provider so the full agent loop can be
// exercised without a cloud key: /models drives capability detection, and
// /chat/completions replies with a tool call first and prose second.
function startMockProvider({ toolName, toolArgs, finalText, supportsTools = true }) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url.endsWith("/models")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          data: [{
            id: MODEL,
            supported_parameters: supportsTools ? ["tools", "temperature"] : ["temperature"],
          }],
        }));
        return;
      }

      const parsed = JSON.parse(body || "{}");
      calls.push(parsed);
      res.writeHead(200, { "Content-Type": "application/json" });

      const alreadyRanTool = parsed.messages.some((m) => m.role === "tool");
      if (!alreadyRanTool && toolName) {
        res.end(JSON.stringify({
          model: MODEL,
          choices: [{
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: "",
              tool_calls: [{
                id: "call_1",
                type: "function",
                function: { name: toolName, arguments: JSON.stringify(toolArgs) },
              }],
            },
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }));
        return;
      }

      res.end(JSON.stringify({
        model: MODEL,
        choices: [{ finish_reason: "stop", message: { role: "assistant", content: finalText } }],
        usage: { prompt_tokens: 20, completion_tokens: 8 },
      }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, calls, baseURL: `http://127.0.0.1:${server.address().port}/v1` });
    });
  });
}

function seedTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tarkov-e2e-"));
  dataStore.init(dir);
  dataStore.insertItems(fixture.items);
  dataStore.insertMaps(fixture.maps);
  dataStore.insertQuests(fixture.quests);
  return dir;
}

test("agent answers an ammo question by calling ammo_vs_armor against real cached data", async () => {
  seedTempDb();
  llm.newSession();

  const mock = await startMockProvider({
    toolName: "ammo_vs_armor",
    toolArgs: { armor_class: 5 },
    finalText: "M995, penetration 53. Best you've got for class five.",
  });

  try {
    const result = await agent.process("what ammo penetrates class five armor", {
      apiKey: "test-key",
      baseURL: mock.baseURL,
      model: MODEL,
    });

    assert.match(result.text, /M995/, "final spoken answer should reach the caller");

    // The second request must carry the tool result, proving the handler ran
    // and its output was fed back to the model.
    assert.strictEqual(mock.calls.length, 2, "expected a tool round trip then a completion");
    const toolMsg = mock.calls[1].messages.find((m) => m.role === "tool");
    assert.ok(toolMsg, "second request must include a tool-role message");
    assert.match(toolMsg.content, /penetration 53/, "tool output must come from the seeded DB");
    assert.match(toolMsg.content, /M995/);
  } finally {
    mock.server.close();
    dataStore.close();
  }
});

test("agent answers an item-value question with flea pricing, never base price", async () => {
  seedTempDb();
  llm.newSession();

  const mock = await startMockProvider({
    toolName: "item_value",
    toolArgs: { item_name: "LEDX" },
    finalText: "LEDX runs about 950 thousand on the flea.",
  });

  try {
    await agent.process("what's a LEDX worth", {
      apiKey: "test-key",
      baseURL: mock.baseURL,
      model: MODEL,
    });

    const toolMsg = mock.calls[1].messages.find((m) => m.role === "tool");
    assert.match(toolMsg.content, /950000|950,000/, "must report flea avg-24h price");
    assert.doesNotMatch(toolMsg.content, /18069/, "must never speak the internal base price");
  } finally {
    mock.server.close();
    dataStore.close();
  }
});

test("agent answers a map question with real extract names and factions", async () => {
  seedTempDb();
  llm.newSession();

  const mock = await startMockProvider({
    toolName: "map_info",
    toolArgs: { map_name: "Reserve" },
    finalText: "Reserve has D-2 for PMCs and Scav Lands for scavs.",
  });

  try {
    await agent.process("which extracts are on reserve", {
      apiKey: "test-key",
      baseURL: mock.baseURL,
      model: MODEL,
    });

    const toolMsg = mock.calls[1].messages.find((m) => m.role === "tool");
    assert.match(toolMsg.content, /D-2/, "extract name must come from cached map data");
  } finally {
    mock.server.close();
    dataStore.close();
  }
});

test("a provider auth failure surfaces as ProviderError instead of silence", async () => {
  seedTempDb();
  llm.newSession();

  const server = http.createServer((req, res) => {
    if (req.url.endsWith("/models")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: MODEL, supported_parameters: ["tools"] }] }));
      return;
    }
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Invalid API key" } }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const baseURL = `http://127.0.0.1:${server.address().port}/v1`;

  try {
    await assert.rejects(
      agent.process("what ammo penetrates class five armor", {
        apiKey: "bad-key",
        baseURL,
        model: MODEL,
      }),
      (err) => err.name === "ProviderError" && err.status === 401 && /Providers tab/i.test(err.hint),
      "a rejected key must reach the user as a typed error, not an empty response"
    );
  } finally {
    server.close();
    dataStore.close();
  }
});

// model-caps deliberately short-circuits to null for any non-OpenRouter host,
// and null routes optimistically to tools-on. The caps===false -> RAG branch is
// covered against the pure helpers in retrieval-routing.test.js.
test("an unknown provider is treated optimistically and still gets tools", async () => {
  seedTempDb();
  llm.newSession();

  const mock = await startMockProvider({
    toolName: "ammo_vs_armor",
    toolArgs: { armor_class: 4 },
    finalText: "BP gzh, penetration 47.",
    supportsTools: false,
  });

  try {
    const result = await agent.process("what ammo penetrates class four armor", {
      apiKey: "test-key",
      baseURL: mock.baseURL,
      model: MODEL,
    });

    assert.match(result.text, /BP gzh/);
    assert.ok(
      Array.isArray(mock.calls[0].tools) && mock.calls[0].tools.length > 0,
      "unknown capability must still send tools rather than silently degrading"
    );
  } finally {
    mock.server.close();
    dataStore.close();
  }
});

test("a local Ollama-style config gets memory tools only, with RAG injected", async () => {
  seedTempDb();
  llm.newSession();

  const mock = await startMockProvider({
    toolName: null,
    toolArgs: null,
    finalText: "M995 penetrates class five.",
  });

  // isLocalConfig requires no apiKey and a localhost base URL.
  const localBase = mock.baseURL.replace("127.0.0.1", "localhost");

  try {
    const result = await agent.process("what ammo penetrates class five armor", {
      baseURL: localBase,
      model: MODEL,
    });

    assert.match(result.text, /M995/);

    const sent = mock.calls[0].tools || [];
    const names = sent.map((t) => t.function.name).sort();
    assert.deepStrictEqual(
      names,
      ["recall_fact", "remember_fact"],
      "a local model must receive only the memory tools"
    );

    const sys = mock.calls[0].messages.find((m) => m.role === "system");
    assert.match(sys.content, /ITEMS|MAPS|QUESTS|Price|penetration/i,
      "RAG context must be injected when tools are not the retrieval path");
  } finally {
    mock.server.close();
    dataStore.close();
  }
});
