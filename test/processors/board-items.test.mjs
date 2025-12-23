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

function buildSeedIssue(overrides = {}) {
  return {
    __typename: 'Issue',
    id: 'ISSUE_node',
    number: 456,
    author: { login: 'someone' },
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
  assert.equal(result.skippedItems[0].isAssignedToUser, false);
  assert.equal(result.skippedItems[0].isMonitoredRepo, true);

  assert.equal(logger.getCounter('board.items.total'), 1);
  assert.equal(logger.getCounter('board.actions.added'), 0);
  assert.equal(logger.getCounter('board.actions.skipped'), 1);
  assert.equal(logger.getCounter('board.actions.failed'), 0);
});

test('processAddItems adds issue assigned to monitored user to board', async () => {
  const logger = createLogger();

  const seedItems = [
    buildSeedIssue({
      assignees: { nodes: [{ login: 'octocat' }] },
      repository: { nameWithOwner: 'org/other-repo' } // Not in monitored repos
    })
  ];

  const overrides = {
    getRecentItemsFn: async () => [],
    isItemInProjectFn: async () => ({ isInProject: false, projectItemId: null }),
    addItemToProjectFn: async () => 'PROJECT_ITEM_2',
    processBoardItemRulesFn: async () => [
      { action: 'add_to_board', params: {} }
    ],
    analyzeBoardItemFn: analyzeBoardItem,
    logger,
    delayFn: async () => {}
  };

  const result = await processAddItems({
    org: 'org',
    repos: ['repo'], // Issue is in 'other-repo', not in monitored list
    monitoredUser: 'octocat',
    projectId: 'PROJECT_ID',
    windowHours: 1,
    seedItems
  }, overrides);

  assert.equal(result.addedItems.length, 1);
  assert.equal(result.addedItems[0].projectItemId, 'PROJECT_ITEM_2');
  assert.equal(result.skippedItems.length, 0);

  // Verify the reason indicates assignment takes precedence over repo monitoring
  assert.equal(result.addedItems[0].reason, 'Issue is assigned to monitored user');
  assert.equal(result.addedItems[0].isAssignedToUser, true);
  assert.equal(result.addedItems[0].isMonitoredRepo, false);

  assert.equal(logger.getCounter('board.items.total'), 1);
  assert.equal(logger.getCounter('board.actions.added'), 1);
  assert.equal(logger.getCounter('board.actions.skipped'), 0);
  assert.equal(logger.getCounter('board.actions.failed'), 0);
});

test('processAddItems prioritizes issue assignment over monitored repo', async () => {
  const logger = createLogger();

  const seedItems = [
    buildSeedIssue({
      assignees: { nodes: [{ login: 'octocat' }] },
      repository: { nameWithOwner: 'org/repo' } // Also in monitored repo
    })
  ];

  const overrides = {
    getRecentItemsFn: async () => [],
    isItemInProjectFn: async () => ({ isInProject: false, projectItemId: null }),
    addItemToProjectFn: async () => 'PROJECT_ITEM_3',
    processBoardItemRulesFn: async () => [
      { action: 'add_to_board', params: {} }
    ],
    analyzeBoardItemFn: analyzeBoardItem,
    logger,
    delayFn: async () => {}
  };

  const result = await processAddItems({
    org: 'org',
    repos: ['repo'], // Issue is in monitored repo AND assigned
    monitoredUser: 'octocat',
    projectId: 'PROJECT_ID',
    windowHours: 1,
    seedItems
  }, overrides);

  assert.equal(result.addedItems.length, 1);
  // Verify assignment reason takes precedence over repo monitoring
  assert.equal(result.addedItems[0].reason, 'Issue is assigned to monitored user');
  assert.equal(result.addedItems[0].isAssignedToUser, true);
  assert.equal(result.addedItems[0].isMonitoredRepo, true); // Still true, but assignment is the reason
});

test('processAddItems skips assigned issue when board rules do not match', async () => {
  const logger = createLogger();

  const seedItems = [
    buildSeedIssue({
      assignees: { nodes: [{ login: 'octocat' }] },
      repository: { nameWithOwner: 'org/other-repo' }
    })
  ];

  const overrides = {
    getRecentItemsFn: async () => [],
    processBoardItemRulesFn: async () => [], // No matching rules
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
  // Even though assigned, should still show assignment as the reason
  assert.equal(result.skippedItems[0].reason, 'Issue is assigned to monitored user');
  assert.equal(result.skippedItems[0].isAssignedToUser, true);

  assert.equal(logger.getCounter('board.items.total'), 1);
  assert.equal(logger.getCounter('board.actions.added'), 0);
  assert.equal(logger.getCounter('board.actions.skipped'), 1);
});

test('processAddItems skips adding assigned issue already in project', async () => {
  const logger = createLogger();

  const seedItems = [
    buildSeedIssue({
      assignees: { nodes: [{ login: 'octocat' }] },
      repository: { nameWithOwner: 'org/other-repo' }
    })
  ];

  const overrides = {
    getRecentItemsFn: async () => [],
    isItemInProjectFn: async () => ({ isInProject: true, projectItemId: 'EXISTING_ITEM_ID' }),
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

  // Item should be added to addedItems (with existing projectItemId) but add_to_board action should be skipped
  assert.equal(result.addedItems.length, 1);
  assert.equal(result.addedItems[0].projectItemId, 'EXISTING_ITEM_ID');
  assert.equal(result.addedItems[0].reason, 'Issue is assigned to monitored user');
  assert.equal(result.addedItems[0].isAssignedToUser, true);
  assert.equal(result.addedItems[0].isMonitoredRepo, false);
  assert.equal(result.skippedItems.length, 0);

  // add_to_board action should be skipped (not added)
  assert.equal(logger.getCounter('board.items.total'), 1);
  assert.equal(logger.getCounter('board.actions.added'), 0);
  assert.equal(logger.getCounter('board.actions.skipped'), 1);
});

test('processAddItems includes flags for PR assigned to monitored user', async () => {
  const logger = createLogger();

  const seedItems = [
    buildSeedPullRequest({
      author: { login: 'someone_else' },
      assignees: { nodes: [{ login: 'octocat' }] },
      repository: { nameWithOwner: 'org/other-repo' }
    })
  ];

  const overrides = {
    getRecentItemsFn: async () => [],
    isItemInProjectFn: async () => ({ isInProject: false, projectItemId: null }),
    addItemToProjectFn: async () => 'PROJECT_ITEM_4',
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
  assert.equal(result.addedItems[0].reason, 'PR is assigned to monitored user');
  assert.equal(result.addedItems[0].isAssignedToUser, true);
  assert.equal(result.addedItems[0].isMonitoredRepo, false);
});

test('processAddItems includes flags for issue in monitored repo when skipped', async () => {
  const logger = createLogger();

  const seedItems = [
    buildSeedIssue({
      assignees: { nodes: [] }, // Not assigned
      repository: { nameWithOwner: 'org/repo' } // In monitored repo
    })
  ];

  const overrides = {
    getRecentItemsFn: async () => [],
    processBoardItemRulesFn: async () => [], // No matching rules
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
  assert.equal(result.skippedItems[0].reason, 'Issue is in a monitored repository');
  assert.equal(result.skippedItems[0].isAssignedToUser, false);
  assert.equal(result.skippedItems[0].isMonitoredRepo, true);
});

test('processAddItems includes flags for added issue in monitored repo', async () => {
  const logger = createLogger();

  const seedItems = [
    buildSeedIssue({
      assignees: { nodes: [] }, // Not assigned
      repository: { nameWithOwner: 'org/repo' } // In monitored repo
    })
  ];

  const overrides = {
    getRecentItemsFn: async () => [],
    isItemInProjectFn: async () => ({ isInProject: false, projectItemId: null }),
    addItemToProjectFn: async () => 'PROJECT_ITEM_5',
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
  assert.equal(result.addedItems[0].reason, 'Issue is in a monitored repository');
  assert.equal(result.addedItems[0].isAssignedToUser, false);
  assert.equal(result.addedItems[0].isMonitoredRepo, true);
});

