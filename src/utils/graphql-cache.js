const crypto = require('crypto');

function stableKey(query, variables) {
  const hash = crypto.createHash('sha256');
  hash.update(query || '');
  // Stable stringify
  const json = JSON.stringify(variables || {}, Object.keys(variables || {}).sort());
  hash.update(json);
  return hash.digest('hex');
}

/**
 * Memoize a GraphQL function for the duration of a run.
 * Caches results by (query + variables) with an optional TTL and max size.
 *
 * @param {(q: string, vars?: object) => Promise<any>} graphqlFn
 * @param {{ ttlMs?: number, maxEntries?: number }} opts
 * @returns {(q: string, vars?: object) => Promise<any>}
 */
function memoizeGraphql(graphqlFn, opts = {}) {
  const ttlMs = Number.isFinite(opts.ttlMs) ? opts.ttlMs : 60_000;
  const maxEntries = Number.isFinite(opts.maxEntries) ? opts.maxEntries : 200;
  const cache = new Map(); // key -> { value, expiresAt }

  function pruneIfNeeded() {
    if (cache.size <= maxEntries) return;
    // Drop oldest entries (Map iteration order is insertion order)
    const dropCount = Math.ceil(maxEntries * 0.1);
    let i = 0;
    for (const k of cache.keys()) {
      cache.delete(k);
      i += 1;
      if (i >= dropCount) break;
    }
  }

  return async (query, variables) => {
    const key = stableKey(query, variables);
    const now = Date.now();
    const entry = cache.get(key);
    if (entry && entry.expiresAt > now) {
      return entry.value;
    }
    const value = await graphqlFn(query, variables);
    cache.set(key, { value, expiresAt: now + ttlMs });
    pruneIfNeeded();
    return value;
  };
}

module.exports = { memoizeGraphql };
