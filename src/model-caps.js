// Model capability detection for retrieval routing.
// Determines whether a given model supports tool calling.
//
// Returns a tri-state:
//   true  — OpenRouter confirmed: model declares "tools" in supported_parameters
//   false — OpenRouter confirmed: model does NOT declare "tools"
//   null  — unknown (non-OpenRouter provider, network failure, model not found)
//
// A null result should be treated OPTIMISTICALLY by the caller (default to tools-on).
// 301 of 367 OpenRouter models support tools — optimistic is correct.
//
// Never throws. Caches per model (process lifetime) and per URL (1 hour).

const https = require("https");
const http = require("http");

// Per-model cache: "<baseURL>:<modelId>" → true | false
const _modelCache = new Map();

// Per-URL list cache: baseURL → { models: Array, fetchedAt: number }
const _listCache = new Map();

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Pure helper — exported for tests.
 *
 * Searches a pre-fetched models array for modelId and returns:
 *   true  — found, "tools" in supported_parameters
 *   false — found, "tools" NOT in supported_parameters
 *   null  — not found in the list
 *
 * @param {Array}  modelsArray  Array of model objects from /models response
 * @param {string} modelId      Model id to look up (e.g. "openai/gpt-4o")
 */
function supportsToolsFromList(modelsArray, modelId) {
  if (!Array.isArray(modelsArray)) return null;
  const entry = modelsArray.find((m) => m.id === modelId);
  if (!entry) return null;
  const params = Array.isArray(entry.supported_parameters)
    ? entry.supported_parameters
    : [];
  return params.includes("tools");
}

/**
 * Fetch the /models list from baseURL.
 * Returns the data array on success, or null on any failure.
 * Does NOT throw.
 *
 * Note: GET /api/v1/models/{id} returns 404 on OpenRouter — only the full
 * list endpoint works (verified empirically during design).
 *
 * @param {string} baseURL  e.g. "https://openrouter.ai/api/v1"
 */
function fetchModelsList(baseURL) {
  return new Promise((resolve) => {
    const url = `${baseURL}/models`;
    const transport = url.startsWith("https") ? https : http;
    try {
      const req = transport.get(url, (res) => {
        let raw = "";
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          try {
            const obj = JSON.parse(raw);
            resolve(Array.isArray(obj.data) ? obj.data : null);
          } catch {
            resolve(null);
          }
        });
        res.on("error", () => resolve(null));
      });
      // Use setTimeout for connection timeout (not socket inactivity)
      req.setTimeout(10000, () => { req.destroy(); resolve(null); });
      req.on("error", () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

/**
 * Determine whether a model supports tool calling.
 *
 * @param {object} opts
 * @param {string} [opts.provider]  e.g. "openrouter", "openai", "anthropic"
 * @param {string} [opts.apiKey]
 * @param {string} [opts.baseURL]   e.g. "https://openrouter.ai/api/v1"
 * @param {string} [opts.model]     e.g. "openai/gpt-4o"
 * @returns {Promise<true|false|null>}
 */
async function supportsTools({ provider, apiKey, baseURL, model } = {}) {
  // Only OpenRouter exposes supported_parameters reliably
  const isOpenRouter =
    provider === "openrouter" ||
    (typeof baseURL === "string" && baseURL.includes("openrouter.ai"));
  if (!isOpenRouter) return null;

  // Per-model in-process cache (true or false only — never cache null/unknown)
  const cacheKey = `${baseURL}:${model}`;
  if (_modelCache.has(cacheKey)) return _modelCache.get(cacheKey);

  // Use cached list if fresh
  let models;
  const cached = _listCache.get(baseURL);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    models = cached.models;
  } else {
    models = await fetchModelsList(baseURL);
    if (models !== null) {
      _listCache.set(baseURL, { models, fetchedAt: Date.now() });
    }
  }

  if (models === null) {
    // Network failure — return null, do NOT cache as false
    return null;
  }

  const result = supportsToolsFromList(models, model);
  // Only cache definitive answers (true / false); null = model not found → not cached
  if (result !== null) {
    _modelCache.set(cacheKey, result);
  }
  return result;
}

module.exports = { supportsTools, supportsToolsFromList };
