import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { processLinkedIssues } from '../../src/rules/linked-issues-processor.js';
import { Logger } from '../../src/utils/log.js';

const noop = () => {};

function createLogger() {
  const logger = new Logger();
  logger.info = noop;
  logger.warn = noop;
  logger.error = noop;
  logger.debug = noop;
  logger.printStateSummary = noop;
  return logger;
}

test('processLinkedIssues inherits assignees when project state differs', async () => {
  const setAssigneeCalls = [];

  const overrides = {
    getItemColumnFn: mock.fn(async () => 'Active'),
    getItemAssigneesFn: mock.fn(async (_, itemId) => (itemId === 'pr-item' ? ['alice', 'bob'] : ['bob'])),
    setItemColumnFn: mock.fn(async () => {}),
    setItemAssigneesFn: mock.fn(async (_, itemId, assignees) => {
      setAssigneeCalls.push({ itemId, assignees });
    }),
    getColumnOptionIdFn: mock.fn(async () => 'status-active'),
    isItemInProjectFn: mock.fn(async (nodeId) => ({
      isInProject: true,
      projectItemId: nodeId === 'issue-content' ? 'issue-item' : 'pr-item'
    })),
    fetchLinkedIssuesFn: mock.fn(async () => [
      {
        id: 'issue-content',
        number: 210,
        repository: { nameWithOwner: 'org/repo' },
        projectItemId: 'issue-item'
      }
    ]),
    ruleActionsOverride: [
      { action: 'inherit_assignees' }
    ],
    logger: createLogger()
  };

  const result = await processLinkedIssues(
    {
      id: 'pr-content',
      number: 42,
      repository: { nameWithOwner: 'org/repo' },
      projectItemId: 'pr-item',
      assignees: { nodes: [] },
      linkedIssues: { nodes: [] }
    },
    'project-1',
    'Backlog',
    null,
    overrides
  );

  assert.equal(result.changed, true);
  assert.equal(result.linkedIssues.length, 1);
  assert.equal(result.linkedIssues[0].skipped, false);
  assert.equal(setAssigneeCalls.length, 1);
  assert.deepEqual(setAssigneeCalls[0], { itemId: 'issue-item', assignees: ['alice', 'bob'] });

  const logger = overrides.logger;
  assert.equal(logger.getCounter('linked.items.total'), 1);
  assert.equal(logger.getCounter('linked.actions.assignees.assigned'), 1);
  assert.equal(logger.getCounter('linked.actions.skipped'), 0);
  assert.equal(logger.getCounter('linked.actions.failed'), 0);
});

test('processLinkedIssues skips assignee inheritance when sets already match', async () => {
  const overrides = {
    getItemColumnFn: mock.fn(async () => 'Active'),
    getItemAssigneesFn: mock.fn(async () => ['alice', 'bob']),
    setItemColumnFn: mock.fn(async () => {}),
    setItemAssigneesFn: mock.fn(async () => {}),
    getColumnOptionIdFn: mock.fn(async () => 'status-active'),
    isItemInProjectFn: mock.fn(async () => ({ isInProject: true, projectItemId: 'issue-item' })),
    fetchLinkedIssuesFn: mock.fn(async () => [
      {
        id: 'issue-content',
        number: 211,
        repository: { nameWithOwner: 'org/repo' },
        projectItemId: 'issue-item'
      }
    ]),
    ruleActionsOverride: [
      { action: 'inherit_assignees' }
    ],
    logger: createLogger()
  };

  const result = await processLinkedIssues(
    {
      id: 'pr-content',
      number: 43,
      repository: { nameWithOwner: 'org/repo' },
      projectItemId: 'pr-item',
      assignees: { nodes: [] },
      linkedIssues: { nodes: [] }
    },
    'project-1',
    'Active',
    null,
    overrides
  );

  assert.equal(result.changed, false);
  assert.equal(result.linkedIssues.length, 1);
  assert.equal(result.linkedIssues[0].skipped, true);
  assert.equal(overrides.setItemAssigneesFn.mock.callCount(), 0);

  const logger = overrides.logger;
  assert.equal(logger.getCounter('linked.items.total'), 1);
  assert.equal(logger.getCounter('linked.actions.skipped'), 1);
  assert.equal(logger.getCounter('linked.actions.assignees.assigned'), 0);
  assert.equal(logger.getCounter('linked.actions.failed'), 0);
});

test('processLinkedIssues falls back to payload assignees when project lookup fails', async () => {
  const setAssigneeCalls = [];

  const overrides = {
    getItemColumnFn: mock.fn(async () => 'Active'),
    getItemAssigneesFn: mock.fn(async (_, itemId) => (itemId === 'issue-item' ? ['bob'] : [])),
    setItemColumnFn: mock.fn(async () => {}),
    setItemAssigneesFn: mock.fn(async (_, itemId, assignees) => {
      setAssigneeCalls.push({ itemId, assignees });
    }),
    getColumnOptionIdFn: mock.fn(async () => 'status-active'),
    isItemInProjectFn: mock.fn(async () => ({ isInProject: false })),
    fetchLinkedIssuesFn: mock.fn(async () => [
      {
        id: 'issue-content',
        number: 212,
        repository: { nameWithOwner: 'org/repo' },
        projectItemId: 'issue-item'
      }
    ]),
    ruleActionsOverride: [
      { action: 'inherit_assignees' }
    ],
    logger: createLogger()
  };

  const result = await processLinkedIssues(
    {
      id: 'pr-content',
      number: 44,
      repository: { nameWithOwner: 'org/repo' },
      projectItemId: null,
      assignees: { nodes: [{ login: 'carol' }] },
      linkedIssues: { nodes: [] }
    },
    'project-1',
    'Active',
    null,
    overrides
  );

  assert.equal(result.changed, true);
  assert.equal(setAssigneeCalls.length, 1);
  assert.deepEqual(setAssigneeCalls[0], { itemId: 'issue-item', assignees: ['carol'] });

  const logger = overrides.logger;
  assert.equal(logger.getCounter('linked.items.total'), 1);
  assert.equal(logger.getCounter('linked.actions.assignees.assigned'), 1);
  assert.equal(logger.getCounter('linked.actions.skipped'), 0);
  assert.equal(logger.getCounter('linked.actions.failed'), 0);
});

