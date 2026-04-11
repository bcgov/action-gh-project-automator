import { describe, it } from 'node:test';
import assert from 'node:assert';
import { shouldProceed, RatePriority } from '../../src/utils/rate-limit.js';

describe('RateLimit Utility', () => {
  it('correctly exports priority levels', () => {
    assert.strictEqual(RatePriority.CRITICAL, 200);
    assert.strictEqual(RatePriority.STANDARD, 500);
    assert.strictEqual(RatePriority.MAINTENANCE, 1000);
  });

  it('fails defensively when rate limit info is unavailable', async () => {
    // Note: shouldProceed calls getRateLimit, which we haven't mocked here
    // But since it will fail (API down in tests), we expect it to return continue: false
    // based on our new defensive change.
    const result = await shouldProceed(RatePriority.CRITICAL);
    assert.strictEqual(result.proceed, false);
    assert.strictEqual(result.health, 'UNKNOWN');
  });

  // Future improvement: Add more robust mocking for success scenarios
});
