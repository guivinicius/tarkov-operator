// FTS5 query builder — strips stopwords, AND-joins content terms with OR fallback.
// Pure module: no SQLite dependency, safe to require anywhere.

const STOPWORDS = new Set([
  "what", "is", "the", "a", "an", "are", "how", "much", "many",
  "for", "on", "in", "of", "to", "i", "my", "with", "does", "do", "it", "worth"
]);

/**
 * Build a pair of FTS5 query strings from raw spoken/typed input.
 *
 * @param {string} raw  Raw user query
 * @returns {{ primary: string|null, fallback: string|null }}
 *   primary  — AND-joined quoted prefix terms after stopword removal ("ammo"* AND "pens"*)
 *   fallback — OR-joined form of the same terms ("ammo"* OR "pens"*)
 *   Both null when no content terms survive (all-stopword or empty input).
 */
function buildFtsQuery(raw) {
  if (!raw || typeof raw !== "string") return { primary: null, fallback: null };

  const tokens = raw
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t));

  if (tokens.length === 0) return { primary: null, fallback: null };

  const quoted = tokens.map((t) => `"${t}"*`);
  return {
    primary: quoted.join(" AND "),
    fallback: quoted.join(" OR "),
  };
}

module.exports = { buildFtsQuery, STOPWORDS };
