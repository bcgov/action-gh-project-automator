import { log } from './log.js';

async function getRateLimit() {
  try {
    // Late import to avoid circular dependency during module load
    const { graphql } = await import('../github/api.js');
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
  if (!rl) {
    return {
      proceed: true,
      remaining: null,
      limit: null,
      resetAt: null,
      cost: null
    };
  }

  const proceed = rl.remaining >= minRemaining;
  if (!proceed) {
    log.info(`Rate limit low: remaining=${rl.remaining}/${rl.limit}, resetAt=${rl.resetAt}`);
  }

  return {
    proceed,
    remaining: rl.remaining,
    limit: rl.limit,
    resetAt: rl.resetAt,
    cost: rl.cost ?? null
  };
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
      // Prefer structured detection; fallback to message check; include abuse detection
      const message = ((e && e.message) || '').toLowerCase();
      const isRate = (
        (e && (e.code === 'RATE_LIMITED' || e.name === 'RateLimitError' || e.status === 403)) ||
        (e && e.response && e.response.headers && (e.response.headers['x-ratelimit-remaining'] === '0' || e.response.headers['retry-after'])) ||
        message.includes('rate limit') || message.includes('abuse')
      );
      if (!isRate || attempt === retries) break;
      const jitter = Math.floor(Math.random() * 250);
      const delay = backoffDelay(attempt) + jitter;
      log.info(`Rate limited; backing off ${delay}ms (attempt ${attempt + 1}/${retries})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export { getRateLimit, shouldProceed, withBackoff };
