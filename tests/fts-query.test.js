const { test } = require("node:test");
const assert = require("node:assert");

const { buildFtsQuery, STOPWORDS } = require("../src/fts-query");

test("strips stopwords and AND-joins content terms", () => {
  const result = buildFtsQuery("what ammo pens class 5 armor");
  assert.strictEqual(
    result.primary,
    '"ammo"* AND "pens"* AND "class"* AND "5"* AND "armor"*'
  );
  assert.ok(!result.primary.includes('"what"'), 'primary must not contain "what"');
});

test("fallback is OR-joined form of the same content terms", () => {
  const result = buildFtsQuery("what ammo pens class 5 armor");
  assert.strictEqual(
    result.fallback,
    '"ammo"* OR "pens"* OR "class"* OR "5"* OR "armor"*'
  );
});

test("all-stopword query yields nulls", () => {
  const result = buildFtsQuery("what is the");
  assert.deepStrictEqual(result, { primary: null, fallback: null });
});

test("empty string yields nulls", () => {
  const result = buildFtsQuery("");
  assert.deepStrictEqual(result, { primary: null, fallback: null });
});

test("STOPWORDS contains required words", () => {
  const required = ["what", "is", "the", "a", "an", "are", "how", "much", "many",
    "for", "on", "in", "of", "to", "i", "my", "with", "does", "do", "it", "worth"];
  for (const w of required) {
    assert.ok(STOPWORDS.has(w), `STOPWORDS must contain "${w}"`);
  }
});

test("single content term produces single-element AND and OR (identical)", () => {
  const result = buildFtsQuery("LEDX");
  assert.strictEqual(result.primary, '"ledx"*');
  assert.strictEqual(result.fallback, '"ledx"*');
});
