/**
 * Counts API calls made through wrapped clients.
 */
export const apiUsage = { graphql: 0, rest: 0 };

/**
 * Wrap an async function so every call is counted under `key`.
 * @param {Function} fn
 * @param {object} stats - Counter object
 * @param {string} key
 * @returns {Function}
 */
export function countCalls(fn, stats, key) {
  const wrapped = (...args) => {
    stats[key] = (stats[key] || 0) + 1;
    return fn(...args);
  };
  return Object.assign(wrapped, fn);
}

/**
 * Markdown lines for the job summary.
 * @param {object} stats - { graphql, rest }
 * @param {object|null} rateLimit - { graphql: {remaining, limit, reset}, core: {...} } from GET /rate_limit
 * @returns {string}
 */
export function formatApiUsage(stats, rateLimit) {
  const total = (stats.graphql || 0) + (stats.rest || 0);
  let out = `\n**API calls:** ${total} (GraphQL ${stats.graphql || 0}, REST ${stats.rest || 0})\n`;
  if (rateLimit) {
    for (const [name, r] of Object.entries(rateLimit)) {
      if (!r) continue;
      const reset = r.reset ? ` (resets ${new Date(r.reset * 1000).toISOString()})` : '';
      out += `\n**Rate limit (${name}):** ${r.remaining}/${r.limit} remaining${reset}\n`;
    }
  } else {
    out += '\n**Rate limit:** unavailable\n';
  }
  return out;
}
