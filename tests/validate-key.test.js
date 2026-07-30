const { test, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");

const keyValidator = require("../src/key-validator");

let server = null;
let port = 0;
let nextResponse = { status: 200, body: '{"data":{}}' };

before(async () => {
  server = http.createServer((req, res) => {
    res.writeHead(nextResponse.status, { "Content-Type": "application/json" });
    res.end(nextResponse.body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("validate returns ok:false with status 401 on rejected key", async () => {
  nextResponse = { status: 401, body: '{"error":{"message":"No auth credentials found"}}' };
  const result = await keyValidator.validate(
    "openrouter",
    "bad",
    `http://127.0.0.1:${port}`
  );
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, 401);
  assert.ok(
    typeof result.message === "string" && result.message.length > 0,
    "a human-readable message is always present"
  );
});

test("validate returns ok:true on 200", async () => {
  nextResponse = { status: 200, body: '{"data":{"label":"test key","usage":0}}' };
  const result = await keyValidator.validate(
    "openrouter",
    "good",
    `http://127.0.0.1:${port}`
  );
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.status, 200);
  assert.ok(typeof result.message === "string" && result.message.length > 0);
});

test("network failure yields ok:false with human message, never throws", async () => {
  // Port 1 on loopback has no listener: connection is refused immediately.
  const result = await keyValidator.validate("openrouter", "any", "http://127.0.0.1:1");
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, null);
  assert.match(result.message, /\S/);
  assert.ok(
    !/^\[object/.test(result.message),
    "message must be a readable string, not a stringified object"
  );
});

test("empty key is rejected without any network call", async () => {
  const result = await keyValidator.validate("openrouter", "   ", "http://127.0.0.1:1");
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, null);
  assert.match(result.message, /empty|missing|no key/i);
});

test("unknown provider is reported, never thrown", async () => {
  const result = await keyValidator.validate("not-a-provider", "abc");
  assert.strictEqual(result.ok, false);
  assert.match(result.message, /provider/i);
});

test("every supported provider has an endpoint and auth header", () => {
  for (const provider of ["openrouter", "openai", "anthropic", "elevenlabs"]) {
    const req = keyValidator.describeRequest(provider, "TESTKEY");
    assert.ok(req, `${provider} must be described`);
    assert.match(req.url, /^https:\/\//, `${provider} must use https`);
    const headerValues = Object.values(req.headers).join(" ");
    assert.ok(
      headerValues.includes("TESTKEY"),
      `${provider} must send the key in a header`
    );
  }
});

test("anthropic sends x-api-key and anthropic-version, not Bearer", () => {
  const req = keyValidator.describeRequest("anthropic", "TESTKEY");
  assert.strictEqual(req.headers["x-api-key"], "TESTKEY");
  assert.ok(req.headers["anthropic-version"], "anthropic-version is required");
  assert.strictEqual(req.headers.Authorization, undefined);
});

test("elevenlabs sends xi-api-key", () => {
  const req = keyValidator.describeRequest("elevenlabs", "TESTKEY");
  assert.strictEqual(req.headers["xi-api-key"], "TESTKEY");
});

test("a 403 is treated as an invalid key, not a transport error", async () => {
  nextResponse = { status: 403, body: '{"error":"forbidden"}' };
  const result = await keyValidator.validate("openai", "bad", `http://127.0.0.1:${port}`);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, 403);
});
