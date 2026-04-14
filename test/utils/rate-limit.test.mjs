import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { taskQueue, shouldProceed } from '../../src/utils/rate-limit.js';
import { RatePriority, PriorityLabels } from '../../src/utils/rate-priority.js';

// Warm up dynamic imports to avoid dangling promises in tests
await import('../../src/github/api.js');

describe('RateLimit Utility', () => {
  afterEach(async () => {
    await taskQueue.idle();
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

  // Future improvement: Add more robust mocking for success scenarios
});
