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

export const RatePriority = {
  CRITICAL: 200,    // "Add to Board" - items must appear
  STANDARD: 500,    // General sync (Columns, Sprints)
  MAINTENANCE: 1000 // Verification and deep cleanup
};

const PriorityLabels = {
  200: 'CRITICAL',
  500: 'STANDARD',
  1000: 'MAINTENANCE'
};

async function shouldProceed(priority = RatePriority.STANDARD) {
  const rl = await getRateLimit();
  if (!rl) {
    // If we can't check the budget, default to defensive (don't proceed)
    log.warning('[THROTTLED] Unable to verify rate limit budget; skipping task for safety.');
    return {
      proceed: false,
      remaining: null,
      limit: null,
      resetAt: null,
      cost: null,
      health: 'UNKNOWN'
    };
  }


  // Determine health level
  let health = 'GREEN';
  if (rl.remaining < RatePriority.CRITICAL) health = 'BLACK';
  else if (rl.remaining < RatePriority.STANDARD) health = 'RED';
  else if (rl.remaining < RatePriority.MAINTENANCE) health = 'YELLOW';

  const proceed = rl.remaining >= priority;
  if (!proceed) {
    const label = Object.keys(RatePriority).find(k => RatePriority[k] === priority) || priority;
    log.info(`[THROTTLED/RESERVE] Skipping ${label} task (Priority: ${priority}): remaining=${rl.remaining}/${rl.limit}, health=${health}`);

  }

  return {
    proceed,
    remaining: rl.remaining,
    limit: rl.limit,
    resetAt: rl.resetAt,
    cost: rl.cost ?? null,
    health
  };
}

function formatRateLimitInfo(rateStatus) {
  if (!rateStatus || typeof rateStatus !== 'object') {
    return '';
  }
  const { remaining, limit, resetAt } = rateStatus;
  if (typeof remaining === 'number' && typeof limit === 'number') {
    const resetSuffix = resetAt ? `, resets ${resetAt}` : '';
    return ` (remaining ${remaining}/${limit}${resetSuffix})`;
  }
  return '';
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

export { getRateLimit, shouldProceed, withBackoff, formatRateLimitInfo };
