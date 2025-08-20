const { log } = require('./log');

async function getRateLimit() {
  try {
    // Late import to avoid circular dependency during module load
    const { graphql } = require('../github/api');
    const res = await graphql(`
      query {
        rateLimit {
          remaining
          limit
          resetAt
          cost
        }
      }
    `);
    return res.rateLimit;
  } catch (e) {
    log.warning(`rateLimit query failed: ${e.message}`);
    return null;
  }
}

async function shouldProceed(minRemaining = 200) {
  const rl = await getRateLimit();
  if (!rl) return true;
  if (rl.remaining < minRemaining) {
    log.info(`Rate limit low: remaining=${rl.remaining}/${rl.limit}, resetAt=${rl.resetAt}`);
    return false;
  }
  return true;
}

function backoffDelay(attempt) {
  const base = 500; // ms
  const max = 8000;
  const delay = Math.min(max, base * Math.pow(2, attempt));
  return delay;
}

async function withBackoff(fn, { retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      // Prefer structured detection; fallback to message check
      const isRate = (
        (e && (e.code === 'RATE_LIMITED' || e.name === 'RateLimitError' || e.status === 403)) ||
        (e && e.response && e.response.headers && e.response.headers['x-ratelimit-remaining'] === '0') ||
        ((e && e.message || '').toLowerCase().includes('rate limit'))
      );
      if (!isRate || attempt === retries) break;
      const delay = backoffDelay(attempt);
      log.info(`Rate limited; backing off ${delay}ms (attempt ${attempt + 1}/${retries})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

module.exports = { getRateLimit, shouldProceed, withBackoff };
