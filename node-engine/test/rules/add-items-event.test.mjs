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

test('processAddItems always searches via API regardless of seedItems', async () => {
  const calls = [];
  const { addedItems, skippedItems } = await processAddItems(
    {
      org: 'org',
      repos: [ 'repo' ],
      monitoredUser: 'octocat',
      projectId: 'proj',
      windowHours: 1,
      seedItems: [ seedPullRequest ]
    },
    {
      getRecentItemsFn: async () => {
        calls.push('getRecentItems');
        return [ seedPullRequest ];
      },
      processBoardItemRulesFn: async () => [ { action: 'add_to_board', params: {} } ],
      isItemInProjectFn: async () => ({ isInProject: false }),
      addItemToProjectFn: async () => 'PROJECT_ITEM_ID',
      delayFn: async () => { }
    }
  );

  assert.equal(calls.length, 1, 'getRecentItems should always be called');
  assert.equal(addedItems.length, 1);
  assert.equal(skippedItems.length, 0);
  assert.equal(addedItems[ 0 ].number, 101);
});

test('processAddItems always searches for items via API', async () => {
  let getRecentItemsCalled = false;
  const logger = new Logger();
  logger.info = () => { };
  logger.warning = () => { };

  const { addedItems, skippedItems } = await processAddItems(
    {
      org: 'org',
      repos: [ 'repo' ],
      monitoredUser: 'octocat',
      projectId: 'proj',
      windowHours: 1,
      seedItems: []
    },
    {
      getRecentItemsFn: async () => {
        getRecentItemsCalled = true;
        return [];
      },
      logger
    }
  );

  assert.equal(getRecentItemsCalled, true, 'getRecentItems should always be called');
  assert.equal(addedItems.length, 0);
  assert.equal(skippedItems.length, 0);
});

