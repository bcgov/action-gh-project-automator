import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processAddItems } from '../../src/rules/add-items.js';
import { Logger } from '../../src/utils/log.js';

const seedPullRequest = {
  __typename: 'PullRequest',
  id: 'PR_node',
  number: 101,
  repository: { nameWithOwner: 'org/repo' },
  author: { login: 'octocat' },
  assignees: { nodes: [] }
};

test('processAddItems uses seed items when provided', async () => {
  const calls = [];
  const { addedItems, skippedItems } = await processAddItems(
    {
      org: 'org',
      repos: ['repo'],
      monitoredUser: 'octocat',
      projectId: 'proj',
      windowHours: 1,
      seedItems: [seedPullRequest]
    },
    {
      getRecentItemsFn: async () => {
        calls.push('getRecentItems');
        return [];
      },
      processBoardItemRulesFn: async () => [{ action: 'add_to_board', params: {} }],
      isItemInProjectFn: async () => ({ isInProject: false }),
      addItemToProjectFn: async () => 'PROJECT_ITEM_ID',
      delayFn: async () => {}
    }
  );

  assert.equal(calls.length, 0, 'getRecentItems should not be called when seedItems provided');
  assert.equal(addedItems.length, 1);
  assert.equal(skippedItems.length, 0);
  assert.equal(addedItems[0].number, 101);
});

test('processAddItems skips repository search when seed-only mode enabled without payload items', async () => {
  let getRecentItemsCalled = false;
  const logger = new Logger();
  logger.info = () => {};
  logger.warning = () => {};

  const { addedItems, skippedItems } = await processAddItems(
    {
      org: 'org',
      repos: ['repo'],
      monitoredUser: 'octocat',
      projectId: 'proj',
      windowHours: 1,
      seedItems: [],
      seedOnlyMode: true
    },
    {
      getRecentItemsFn: async () => {
        getRecentItemsCalled = true;
        return [];
      },
      logger
    }
  );

  assert.equal(getRecentItemsCalled, false, 'getRecentItems should not be called in seed-only mode');
  assert.equal(addedItems.length, 0);
  assert.equal(skippedItems.length, 0);
  assert.equal(logger.getCounter('board.seed.skipped'), 1);
});

