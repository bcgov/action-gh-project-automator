import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processExistingItemsSprintAssignments } from '../../src/index.js';
import { Logger } from '../../src/utils/log.js';

function createLogger() {
  const logger = new Logger();
  logger.info = () => { };
  logger.warning = () => { };
  logger.error = () => { };
  logger.debug = () => { };
  return logger;
}

test('existing items sweep is skipped when rate limit is low', async () => {
  const logger = createLogger();
  const futureDate = new Date(Date.now() + 3600000).toISOString();
  const rateLimitFn = async () => ({
    proceed: false,
    remaining: 42,
    limit: 5000,
    resetAt: futureDate,
    cost: 1
  });
  let getItemsCalled = 0;
  const getProjectItemsFn = async () => {
    getItemsCalled += 1;
    return new Map();
  };

  const result = await processExistingItemsSprintAssignments('project-id', {
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
  const futureDate = new Date(Date.now() + 3600000).toISOString();
  const rateLimitFn = async () => ({
    proceed: true,
    remaining: 500,
    limit: 5000,
    resetAt: futureDate,
    cost: 1
  });
  const getProjectItemsFn = async (projectId, options) => {
    assert.equal(projectId, 'project-id');
    assert.equal(options.minRemaining, 275);
    assert.equal(options.skipRateGuard, undefined);
    return new Map();
  };

  const result = await processExistingItemsSprintAssignments('project-id', {
    minRateLimitRemaining: 275,
    logger,
    rateLimitFn,
    getProjectItemsFn
  });

  assert.equal(result.skipped, false);
  assert.equal(result.processedCount, 0);
  assert.equal(logger.getCounter('existing.sweep.completed'), 1);
});
