// Validates a provider API key against a real endpoint.
// Contract: validate() NEVER throws. Every failure — bad key, DNS failure,
// refused connection, timeout — resolves as { ok:false, status, message }
// with a message a non-developer can act on.

const https = require("node:https");
const http = require("node:http");

const REQUEST_TIMEOUT_MS = 10000;

// Endpoint choices are empirically verified, not guessed:
//   openrouter  GET /api/v1/key      -> 401 with a bogus Bearer token (confirmed)
//   openai      GET /v1/models       -> 401 with a bogus Bearer token
//   anthropic   GET /v1/models       -> requires x-api-key + anthropic-version
//   elevenlabs  GET /v1/user         -> requires xi-api-key
const PROVIDERS = {
  openrouter: {
    label: "OpenRouter",
    baseURL: "https://openrouter.ai",
    path: "/api/v1/key",
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
  },
  openai: {
    label: "OpenAI",
    baseURL: "https://api.openai.com",
    path: "/v1/models",
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
  },
  anthropic: {
    label: "Anthropic",
    baseURL: "https://api.anthropic.com",
    path: "/v1/models",
    headers: (apiKey) => ({
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    }),
  },
  elevenlabs: {
    label: "ElevenLabs",
    baseURL: "https://api.elevenlabs.io",
    path: "/v1/user",
    headers: (apiKey) => ({ "xi-api-key": apiKey }),
  },
};



const NETWORK_HINTS = {
  ECONNREFUSED: "connection refused",
  ENOTFOUND: "host not found — check your internet connection",
  ETIMEDOUT: "the request timed out",
  ECONNRESET: "the connection was reset",
  EAI_AGAIN: "DNS lookup failed — check your internet connection",
  CERT_HAS_EXPIRED: "the server's TLS certificate has expired",
};

function describeRequest(provider, apiKey, baseURLOverride) {
  const config = PROVIDERS[provider];
  if (!config) return null;
  const base = String(baseURLOverride || config.baseURL).replace(/\/+$/, "");
  return {
    url: `${base}${config.path}`,
    headers: { Accept: "application/json", ...config.headers(apiKey) },
    label: config.label,
  };
}

const MAX_DETAIL_CHARS = 160;
const MIN_CHARS_BEFORE_WORD_BREAK = 40;

function truncateAtWordBoundary(text) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (clean.length <= MAX_DETAIL_CHARS) return clean;
  const cut = clean.slice(0, MAX_DETAIL_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  const kept = lastSpace > MIN_CHARS_BEFORE_WORD_BREAK ? cut.slice(0, lastSpace) : cut;
  return `${kept.trimEnd()}…`;
}

function extractServerMessage(body) {
  if (!body) return "";
  try {
    const parsed = JSON.parse(body);
    const candidate =
      parsed?.error?.message ??
      parsed?.error ??
      parsed?.detail?.message ??
      parsed?.detail ??
      parsed?.message;
    if (typeof candidate === "string" && candidate.trim()) {
      return truncateAtWordBoundary(candidate);
    }
  } catch {}
  return body ? truncateAtWordBoundary(body) : "";
}

function describeStatus(label, status, body) {
  const detail = extractServerMessage(body);
  const suffix = detail ? ` — ${detail}` : "";

  if (status >= 200 && status < 300) {
    return { ok: true, message: `${label} accepted this key.` };
  }
  if (status === 401 || status === 403) {
    return {
      ok: false,
      message: `${label} rejected this key (HTTP ${status})${suffix}`,
    };
  }
  if (status === 404) {
    return {
      ok: false,
      message: `${label} endpoint not found (HTTP 404). The app may need an update.`,
    };
  }
  if (status === 429) {
    return {
      ok: false,
      message: `${label} is rate-limiting this check (HTTP 429). Try again in a moment.`,
    };
  }
  if (status >= 500) {
    return {
      ok: false,
      message: `${label} is having trouble (HTTP ${status}). Try again shortly.`,
    };
  }
  return {
    ok: false,
    message: `${label} returned HTTP ${status}${suffix}`,
  };
}

function requestOnce(url, headers) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let req;
    try {
      const mod = url.startsWith("https:") ? https : http;
      req = mod.get(url, { headers, timeout: REQUEST_TIMEOUT_MS }, (res) => {
        let body = "";
        res.setEncoding("utf-8");
        res.on("data", (chunk) => {
          if (body.length < 4096) body += chunk;
        });
        res.on("end", () => finish({ status: res.statusCode, body }));
        res.on("error", (err) => finish({ status: null, error: err }));
      });
    } catch (err) {
      finish({ status: null, error: err });
      return;
    }

    req.on("timeout", () => {
      req.destroy(Object.assign(new Error("Request timed out"), { code: "ETIMEDOUT" }));
    });
    req.on("error", (err) => finish({ status: null, error: err }));
  });
}

function describeTransportError(label, err) {
  const code = err && err.code;
  const hint = (code && NETWORK_HINTS[code]) || (err && err.message) || "unknown error";
  return {
    ok: false,
    status: null,
    message: `Could not reach ${label}: ${String(hint).slice(0, 120)}`,
  };
}

async function validate(provider, apiKey, baseURLOverride) {
  const config = PROVIDERS[provider];
  if (!config) {
    return {
      ok: false,
      status: null,
      message: `Unknown provider "${provider}" — nothing to validate.`,
    };
  }

  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!key) {
    return {
      ok: false,
      status: null,
      message: `No key to check — paste your ${config.label} key first.`,
    };
  }

  const request = describeRequest(provider, key, baseURLOverride);
  const result = await requestOnce(request.url, request.headers);

  if (result.status === null) {
    return describeTransportError(config.label, result.error);
  }

  const verdict = describeStatus(config.label, result.status, result.body);
  return { ok: verdict.ok, status: result.status, message: verdict.message };
}

module.exports = { validate, describeRequest, PROVIDERS };
