import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processAddItems } from '../../src/rules/add-items.js';

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

