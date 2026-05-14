import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { TaskQueue, taskQueue, shouldProceed } from '../../src/utils/rate-limit.js';
import { RatePriority, PriorityLabels } from '../../src/utils/rate-priority.js';

// Warm up dynamic imports to avoid dangling promises in tests
await import('../../src/github/api.js');

describe('RateLimit Utility', () => {
  afterEach(() => {
    taskQueue.reset();
  });
  it('correctly exports priority levels', () => {
    assert.strictEqual(RatePriority.CRITICAL, 1000);
    assert.strictEqual(RatePriority.STANDARD, 500);
    assert.strictEqual(RatePriority.MAINTENANCE, 200);
  });

  it('fails defensively when rate limit info is unavailable', async () => {
    // Mock getRateLimit to return null to simulate API failure/unavailability
    const { taskQueue } = await import('../../src/utils/rate-limit.js');
    const originalGetRL = taskQueue.getRateLimit;
    taskQueue.getRateLimit = async () => null;

    try {
      const result = await shouldProceed(RatePriority.CRITICAL);
      assert.strictEqual(result.proceed, false);
      assert.strictEqual(result.health, 'UNKNOWN');
    } finally {
      taskQueue.getRateLimit = originalGetRL;
    }
  });

  it('allows CRITICAL tasks through when rate limit is unverifiable', async () => {
    // Use an isolated TaskQueue instance to avoid polluting the singleton
    const isolatedQueue = new TaskQueue();
    isolatedQueue.getRateLimit = async () => null;

    let executed = false;
    const result = await isolatedQueue.enqueue(() => {
      executed = true;
      return 'ok';
    }, RatePriority.CRITICAL);

    assert.strictEqual(result, 'ok');
    assert.strictEqual(executed, true);
  });

  it('throttles non-CRITICAL tasks when rate limit is unverifiable', async () => {
    // Use an isolated TaskQueue instance to avoid polluting the singleton
    const isolatedQueue = new TaskQueue();
    isolatedQueue.getRateLimit = async () => null;

    await assert.rejects(
      () => isolatedQueue.enqueue(() => 'ok', RatePriority.STANDARD),
      /Unable to verify rate limit budget/
    );
  });

  describe('Intelligent Budgeting (evaluateBudget)', () => {
    it('handles GREEN health (remaining >= 1500)', () => {
      const status = taskQueue.evaluateBudget({ remaining: 1500, limit: 5000 });
      assert.strictEqual(status.health, 'GREEN');
      assert.strictEqual(status.threshold, 0);
    });

    it('transitions to YELLOW (Maintenance Pause) at < 1500', () => {
      const status = taskQueue.evaluateBudget({ remaining: 1499, limit: 5000 });
      assert.strictEqual(status.health, 'YELLOW');
      assert.strictEqual(status.threshold, RatePriority.STANDARD);
    });

    it('transitions to RED (Reserve Mode) at < 750', () => {
      const status1 = taskQueue.evaluateBudget({ remaining: 750, limit: 5000 });
      assert.strictEqual(status1.health, 'YELLOW'); // 750 is still YELLOW

      const status2 = taskQueue.evaluateBudget({ remaining: 749, limit: 5000 });
      assert.strictEqual(status2.health, 'RED');
      assert.strictEqual(status2.threshold, RatePriority.CRITICAL);
    });

    it('transitions to BLACK (Emergency Stop) at < 250', () => {
      const status1 = taskQueue.evaluateBudget({ remaining: 250, limit: 5000 });
      assert.strictEqual(status1.health, 'RED'); // 250 is still RED

      const status2 = taskQueue.evaluateBudget({ remaining: 249, limit: 5000 });
      assert.strictEqual(status2.health, 'BLACK');
      assert.strictEqual(status2.allStop, true);
    });
  });

  describe('shouldProceed Consistency', () => {
    it('allows CRITICAL tasks in RED state (749)', async () => {
      const originalGetRL = taskQueue.getRateLimit;
      taskQueue.getRateLimit = async () => ({ remaining: 749, limit: 5000, cost: 1 });
      
      try {
        const result = await shouldProceed(RatePriority.CRITICAL);
        assert.strictEqual(result.proceed, true, 'CRITICAL should proceed in RED state');
        assert.strictEqual(result.health, 'RED');
      } finally {
        taskQueue.getRateLimit = originalGetRL;
      }
    });

    it('blocks STANDARD tasks in RED state (749)', async () => {
      const originalGetRL = taskQueue.getRateLimit;
      taskQueue.getRateLimit = async () => ({ remaining: 749, limit: 5000, cost: 1 });
      
      try {
        const result = await shouldProceed(RatePriority.STANDARD);
        assert.strictEqual(result.proceed, false, 'STANDARD should be blocked in RED state');
      } finally {
        taskQueue.getRateLimit = originalGetRL;
      }
    });

    it('blocks all tasks in BLACK state (249)', async () => {
      const originalGetRL = taskQueue.getRateLimit;
      taskQueue.getRateLimit = async () => ({ remaining: 249, limit: 5000, cost: 1 });
      
      try {
        const result = await shouldProceed(RatePriority.CRITICAL);
        assert.strictEqual(result.proceed, false, 'Even CRITICAL should be blocked in BLACK state');
      } finally {
        taskQueue.getRateLimit = originalGetRL;
      }
    });
  });
});
