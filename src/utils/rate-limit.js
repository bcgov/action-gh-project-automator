import { log } from './log.js';

export const RatePriority = {
  CRITICAL: 1000,   // Reserved for essential lookups
  STANDARD: 500,    // Batch sync and regular updates
  MAINTENANCE: 200  // Background prep and caching
};

const PriorityLabels = {
  200: 'MAINTENANCE',
  500: 'STANDARD',
  1000: 'CRITICAL'
};

/**
 * Priority-aware Task Queue for GitHub API calls.
 * Ensures that high-priority (CRITICAL) tasks consume the remaining rate limit budget
 * before low-priority (MAINTENANCE) tasks.
 */
class TaskQueue {
  constructor() {
    this.tasks = [];
    this.processing = false;
    this.rateLimit = null;
    this.lastChecked = 0;
    this.rateLimitProvider = null;
  }

  setRateLimitProvider(provider) {
    this.rateLimitProvider = provider;
  }

  /**
   * Wait for all current tasks to complete and the queue to become idle.
   * @param {number} timeoutMs - Maximum time to wait
   */
  async idle(timeoutMs = 5000) {
    const start = Date.now();
    while (this.processing || this.tasks.length > 0) {
      if (Date.now() - start > timeoutMs) {
        log.warning(`TaskQueue.idle() timed out after ${timeoutMs}ms. Processing: ${this.processing}, Tasks: ${this.tasks.length}`);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * Reset the queue state (for testing).
   */
  reset() {
    this.tasks = [];
    this.processing = false;
  }

  /**
   * Enqueue a task with a given priority.
   */
  async enqueue(fn, priority = RatePriority.STANDARD) {
    const p = new Promise((resolve, reject) => {
      this.tasks.push({ fn, priority, resolve, reject });
      // Sort priority descending: highest priority (1000) first
      this.tasks.sort((a, b) => b.priority - a.priority);
    });
    
    if (!this.processing) {
      await this.process();
    }
    return p;
  }

  async process() {
    if (this.processing || this.tasks.length === 0) return;
    this.processing = true;
    let throttleCount = 0;

    log.debug(`TaskQueue: Starting processing loop with ${this.tasks.length} tasks.`);
    try {
      while (this.tasks.length > 0) {
        const rl = await this.getRateLimit();
        const rateStatus = this.evaluateBudget(rl);
        
        if (!rl) {
          const error = new Error('Unable to verify rate limit budget');
          this.rejectAll(error);
          break;
        }

        // Find the highest priority task we can run
        const taskIndex = this.tasks.findIndex(t => t.priority >= rateStatus.threshold);
        
        if (taskIndex === -1) {
          // No tasks meet current threshold
          if (rateStatus.allStop) {
            log.warning(`TaskQueue: CRITICAL budget exhausted. Rejecting all tasks.`);
            this.rejectAll(new Error('Rate limit budget exhausted (CRITICAL)'));
            break;
          }
          
          throttleCount++;
          if (throttleCount > 10) {
            log.error(`TaskQueue: Persistent budget exhaustion after ${throttleCount} throttles. Rejecting all.`);
            this.rejectAll(new Error(`Throttled: budget ${rateStatus.score} too low for remaining tasks (State: ${rateStatus.health})`));
            break;
          }

          log.info(`TaskQueue: Budget low (${rateStatus.score}). Throttling lower priority tasks (Attempt ${throttleCount}).`);
          // Wait briefly for budget recovery if we have tasks left
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }

        throttleCount = 0; // Reset count on successful task execution
        const task = this.tasks.splice(taskIndex, 1)[0];
        try {
          const result = await task.fn();
          task.resolve(result);
        } catch (error) {
          task.reject(error);
        }
      }
    } finally {
      log.debug(`TaskQueue: Processing loop finished. Tasks remaining: ${this.tasks.length}`);
      this.processing = false;
    }
  }

  rejectAll(error) {
    while (this.tasks.length > 0) {
      this.tasks.shift().reject(error);
    }
  }

  async getRateLimit(force = false) {
    const now = Date.now();
    if (!force && this.rateLimit && (now - this.lastChecked < 5000)) {
      return this.rateLimit;
    }

    let rl = null;
    if (this.rateLimitProvider) {
      rl = await this.rateLimitProvider();
    } else {
      // Fallback to internal fetch if provider not set
      // We try to avoid dynamic import in the loop if possible
      try {
        const { graphqlRaw } = await import('../github/api.js');
        const res = await graphqlRaw(`query { rateLimit { remaining limit resetAt cost } }`);
        rl = res.rateLimit;
      } catch (e) {
        log.warning(`rateLimit fallback query failed: ${e.message}`);
        return null;
      }
    }
    
    if (rl) {
      this.rateLimit = rl;
      this.lastChecked = now;
    }
    return rl;
  }

  evaluateBudget(rl) {
    if (!rl) return { threshold: RatePriority.CRITICAL, health: 'UNKNOWN', score: 0, allStop: true };

    const remaining = rl.remaining;
    let health = 'GREEN';
    let threshold = 0; // Allow everything
    let allStop = false;

    if (remaining < RatePriority.MAINTENANCE) { // < 200
      health = 'BLACK';
      allStop = true;
    } else if (remaining < RatePriority.STANDARD) { // < 500
      health = 'RED';
      threshold = RatePriority.CRITICAL; // Only allow >= 1000
    } else if (remaining < RatePriority.CRITICAL) { // This logic was wrong, let's simplify
      // Wait, RatePriority.CRITICAL is 1000 now. 
      // Remaining < 1000 is YELLOW/RED.
    }

    // Correct Logic:
    if (remaining < 200) {
      health = 'BLACK';
      allStop = true;
    } else if (remaining < 500) {
      health = 'RED';
      threshold = RatePriority.CRITICAL; // Only 1000
    } else if (remaining < 1000) {
      health = 'YELLOW';
      threshold = RatePriority.STANDARD; // Only 500 or 1000
    } else {
      health = 'GREEN';
      threshold = 0; // Allow everything (200, 500, 1000)
    }

    return {
      threshold,
      health,
      score: remaining,
      allStop,
      rl
    };
  }
}

// Singleton instance
const taskQueue = new TaskQueue();

async function shouldProceed(priority = RatePriority.STANDARD) {
  const rl = await taskQueue.getRateLimit();
  const status = taskQueue.evaluateBudget(rl);

  if (!rl) {
    log.warning('[THROTTLED] Unable to verify rate limit budget; skipping task for safety.');
    return { proceed: false, remaining: null, health: 'UNKNOWN' };
  }

  const proceed = status.rl.remaining >= priority;
  if (!proceed) {
    const label = PriorityLabels[priority] || priority;
    log.info(`[THROTTLED/RESERVE] Skipping ${label} task (Priority: ${priority}): remaining=${status.rl.remaining}/${status.rl.limit}, health=${status.health}`);
  }

  return {
    proceed,
    remaining: status.rl.remaining,
    limit: status.rl.limit,
    resetAt: status.rl.resetAt,
    cost: status.rl.cost ?? null,
    health: status.health
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
  return Math.min(max, base * Math.pow(2, attempt));
}

async function withBackoff(fn, { retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
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

export { taskQueue, shouldProceed, withBackoff, formatRateLimitInfo };
