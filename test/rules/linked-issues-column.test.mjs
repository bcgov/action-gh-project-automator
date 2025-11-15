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

test('processLinkedIssues inherits column and assignees when state differs', async () => {
  const setColumnCalls = [];
  const setAssigneeCalls = [];

  const overrides = {
    getItemColumnFn: mock.fn(async (_, itemId) => (itemId === 'pr-item' ? 'Active' : 'Backlog')),
    getItemAssigneesFn: mock.fn(async (_, itemId) => (itemId === 'pr-item' ? ['alice'] : ['bob'])),
    setItemColumnFn: mock.fn(async (_, itemId, optionId) => {
      setColumnCalls.push({ itemId, optionId });
    }),
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
        number: 101,
        repository: { nameWithOwner: 'org/repo' },
        projectItemId: 'issue-item'
      }
    ]),
    ruleActionsOverride: [
      { action: 'inherit_column' },
      { action: 'inherit_assignees' }
    ],
    logger: createLogger(),
    validateColumnTransitionFn: mock.fn(async () => ({ valid: true }))
  };

  const result = await processLinkedIssues(
    {
      id: 'pr-content',
      number: 10,
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
  assert.equal(setColumnCalls.length, 1);
  assert.deepEqual(setColumnCalls[0], { itemId: 'issue-item', optionId: 'status-active' });
  assert.equal(setAssigneeCalls.length, 1);
  assert.deepEqual(setAssigneeCalls[0], { itemId: 'issue-item', assignees: ['alice'] });

  const logger = overrides.logger;
  assert.equal(logger.getCounter('linked.items.total'), 1);
  assert.equal(logger.getCounter('linked.actions.column.assigned'), 1);
  assert.equal(logger.getCounter('linked.actions.assignees.assigned'), 1);
  assert.equal(logger.getCounter('linked.actions.skipped'), 0);
  assert.equal(logger.getCounter('linked.actions.failed'), 0);
});

test('processLinkedIssues skips updates when column and assignees already match', async () => {
  const overrides = {
    getItemColumnFn: mock.fn(async () => 'Active'),
    getItemAssigneesFn: mock.fn(async () => ['alice']),
    setItemColumnFn: mock.fn(async () => {}),
    setItemAssigneesFn: mock.fn(async () => {}),
    getColumnOptionIdFn: mock.fn(async () => 'status-active'),
    isItemInProjectFn: mock.fn(async () => ({ isInProject: true, projectItemId: 'issue-item' })),
    fetchLinkedIssuesFn: mock.fn(async () => [
      {
        id: 'issue-content',
        number: 202,
        repository: { nameWithOwner: 'org/repo' },
        projectItemId: 'issue-item'
      }
    ]),
    ruleActionsOverride: [
      { action: 'inherit_column' },
      { action: 'inherit_assignees' }
    ],
    logger: createLogger(),
    validateColumnTransitionFn: mock.fn(async () => ({ valid: true }))
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
    'Active',
    null,
    overrides
  );

  assert.equal(result.changed, false);
  assert.equal(result.linkedIssues.length, 1);
  assert.equal(result.linkedIssues[0].skipped, true);
  assert.equal(overrides.setItemColumnFn.mock.callCount(), 0);
  assert.equal(overrides.setItemAssigneesFn.mock.callCount(), 0);

  const logger = overrides.logger;
  assert.equal(logger.getCounter('linked.items.total'), 1);
  assert.equal(logger.getCounter('linked.actions.skipped'), 1);
  assert.equal(logger.getCounter('linked.actions.column.assigned'), 0);
  assert.equal(logger.getCounter('linked.actions.assignees.assigned'), 0);
  assert.equal(logger.getCounter('linked.actions.failed'), 0);
});

test('processLinkedIssues blocks column inheritance when transition invalid but still updates assignees', async () => {
  const overrides = {
    getItemColumnFn: mock.fn(async (_, itemId) => (itemId === 'pr-item' ? 'Active' : 'Backlog')),
    getItemAssigneesFn: mock.fn(async (_, itemId) => (itemId === 'pr-item' ? ['alice'] : [])),
    setItemColumnFn: mock.fn(async () => {
      throw new Error('Should not be called when transition invalid');
    }),
    setItemAssigneesFn: mock.fn(async () => {}),
    getColumnOptionIdFn: mock.fn(async () => 'status-active'),
    isItemInProjectFn: mock.fn(async (nodeId) => ({
      isInProject: true,
      projectItemId: nodeId === 'issue-content' ? 'issue-item' : 'pr-item'
    })),
    fetchLinkedIssuesFn: mock.fn(async () => [
      {
        id: 'issue-content',
        number: 303,
        repository: { nameWithOwner: 'org/repo' },
        projectItemId: 'issue-item'
      }
    ]),
    ruleActionsOverride: [
      { action: 'inherit_column' },
      { action: 'inherit_assignees' }
    ],
    validateColumnTransitionFn: mock.fn(async () => ({ valid: false, reason: 'No transitions defined' })),
    logger: createLogger()
  };

  const result = await processLinkedIssues(
    {
      id: 'pr-content',
      number: 77,
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

  assert.equal(result.changed, true, 'Assignee inheritance should still mark changes');
  assert.equal(overrides.setItemColumnFn.mock.callCount(), 0, 'Column update must be skipped');
  assert.equal(overrides.setItemAssigneesFn.mock.callCount(), 1, 'Assignee update should still happen');
  const logger = overrides.logger;
  assert.equal(logger.getCounter('linked.actions.column.blocked'), 1);
  assert.equal(logger.getCounter('linked.actions.column.assigned'), 0);
  assert.equal(logger.getCounter('linked.actions.assignees.assigned'), 1);
});

