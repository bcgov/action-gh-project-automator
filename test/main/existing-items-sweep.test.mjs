import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processExistingItemsSprintAssignments } from '../../src/index.js';
import { Logger } from '../../src/utils/log.js';

function createLogger() {
  const logger = new Logger();
  logger.info = () => {};
  logger.warning = () => {};
  logger.error = () => {};
  logger.debug = () => {};
  return logger;
}

test('existing items sweep is skipped when disabled', async () => {
  const logger = createLogger();
  const result = await processExistingItemsSprintAssignments('project-id', {
    enabled: false,
    logger
  });

  assert.deepEqual(result, { skipped: true, reason: 'disabled' });
  assert.equal(logger.getCounter('existing.sweep.disabled'), 1);
});

test('existing items sweep is skipped when rate limit is low', async () => {
  const logger = createLogger();
  const rateLimitFn = async () => ({
    proceed: false,
    remaining: 42,
    limit: 5000,
    resetAt: '2024-01-01T00:00:00Z',
    cost: 1
  });
  let getItemsCalled = 0;
  const getProjectItemsFn = async () => {
    getItemsCalled += 1;
    return new Map();
  };

  const result = await processExistingItemsSprintAssignments('project-id', {
    enabled: true,
    logger,
    rateLimitFn,
    getProjectItemsFn
  });

  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'rate_limit');
  assert.equal(logger.getCounter('existing.sweep.rate_limited'), 1);
  assert.equal(getItemsCalled, 0);
});

test('existing items sweep passes rate guard settings to getProjectItems', async () => {
  const logger = createLogger();
  const rateLimitFn = async () => ({
    proceed: true,
    remaining: 500,
    limit: 5000,
    resetAt: '2024-01-01T00:00:00Z',
    cost: 1
  });
  const getProjectItemsFn = async (projectId, options) => {
    assert.equal(projectId, 'project-id');
    assert.equal(options.minRemaining, 275);
    assert.equal(options.skipRateGuard, undefined);
    return new Map();
  };

  const result = await processExistingItemsSprintAssignments('project-id', {
    enabled: true,
    minRateLimitRemaining: 275,
    logger,
    rateLimitFn,
    getProjectItemsFn
  });

  assert.equal(result.skipped, false);
  assert.equal(result.processedCount, 0);
});

