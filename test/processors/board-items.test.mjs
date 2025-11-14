import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processAddItems } from '../../src/rules/add-items.js';
import { analyzeBoardItem } from '../../src/rules/helpers/board-items-evaluator.js';
import { Logger } from '../../src/utils/log.js';

function createLogger() {
  const logger = new Logger();
  logger.info = () => {};
  logger.warning = () => {};
  logger.error = () => {};
  logger.debug = () => {};
  return logger;
}

function buildSeedPullRequest(overrides = {}) {
  return {
    __typename: 'PullRequest',
    id: 'PR_node',
    number: 123,
    author: { login: 'octocat' },
    repository: { nameWithOwner: 'org/repo' },
    assignees: { nodes: [] },
    ...overrides
  };
}

test('processAddItems adds monitored PR to board and increments counters', async () => {
  const logger = createLogger();

  const seedItems = [
    buildSeedPullRequest()
  ];

  const overrides = {
    getRecentItemsFn: async () => [],
    isItemInProjectFn: async () => ({ isInProject: false, projectItemId: null }),
    addItemToProjectFn: async () => 'PROJECT_ITEM_1',
    processBoardItemRulesFn: async () => [
      { action: 'add_to_board', params: {} }
    ],
    analyzeBoardItemFn: analyzeBoardItem,
    logger,
    delayFn: async () => {}
  };

  const result = await processAddItems({
    org: 'org',
    repos: ['repo'],
    monitoredUser: 'octocat',
    projectId: 'PROJECT_ID',
    windowHours: 1,
    seedItems
  }, overrides);

  assert.equal(result.addedItems.length, 1);
  assert.equal(result.addedItems[0].projectItemId, 'PROJECT_ITEM_1');
  assert.equal(result.skippedItems.length, 0);

  assert.equal(logger.getCounter('board.items.total'), 1);
  assert.equal(logger.getCounter('board.actions.added'), 1);
  assert.equal(logger.getCounter('board.actions.skipped'), 0);
  assert.equal(logger.getCounter('board.actions.failed'), 0);
});

test('processAddItems skips items when board rules do not match', async () => {
  const logger = createLogger();
  const seedItems = [
    buildSeedPullRequest({ author: { login: 'someone_else' } })
  ];

  const overrides = {
    getRecentItemsFn: async () => [],
    processBoardItemRulesFn: async () => [],
    analyzeBoardItemFn: analyzeBoardItem,
    logger,
    delayFn: async () => {}
  };

  const result = await processAddItems({
    org: 'org',
    repos: ['repo'],
    monitoredUser: 'octocat',
    projectId: 'PROJECT_ID',
    windowHours: 1,
    seedItems
  }, overrides);

  assert.equal(result.addedItems.length, 0);
  assert.equal(result.skippedItems.length, 1);
  assert.equal(result.skippedItems[0].reason, 'PR is in a monitored repository');

  assert.equal(logger.getCounter('board.items.total'), 1);
  assert.equal(logger.getCounter('board.actions.added'), 0);
  assert.equal(logger.getCounter('board.actions.skipped'), 1);
  assert.equal(logger.getCounter('board.actions.failed'), 0);
});

