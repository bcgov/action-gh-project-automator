import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as sprints from '../../src/rules/sprints.js';

test('determineSprintAction assigns active sprint when different', async () => {
  const decision = await sprints.determineSprintAction({
    projectId: 'proj',
    projectItemId: 'item-1',
    currentColumn: 'Active'
  }, {
    getItemSprint: async () => ({ sprintId: 'old', sprintTitle: 'Old Sprint' }),
    getCurrentSprint: async () => ({ sprintId: 'new', title: 'New Sprint' })
  });

  assert.equal(decision.action, 'assign');
  assert.equal(decision.targetIterationId, 'new');
  assert.equal(decision.targetSprintTitle, 'New Sprint');
  assert.equal(decision.currentSprintId, 'old');
  assert.equal(decision.reason, 'Assigned to current sprint (New Sprint)');
});

test('determineSprintAction skips when already in active sprint', async () => {
  const decision = await sprints.determineSprintAction({
    projectId: 'proj',
    projectItemId: 'item-2',
    currentColumn: 'Active'
  }, {
    getItemSprint: async () => ({ sprintId: 'new', sprintTitle: 'New Sprint' }),
    getCurrentSprint: async () => ({ sprintId: 'new', title: 'New Sprint' })
  });

  assert.equal(decision.action, 'skip');
  assert.equal(decision.reason, 'Already in active sprint');
});

test('determineSprintAction requests removal for inactive column with sprint', async () => {
  const decision = await sprints.determineSprintAction({
    projectId: 'proj',
    projectItemId: 'item-3',
    currentColumn: 'Backlog'
  }, {
    getItemSprint: async () => ({ sprintId: 'old', sprintTitle: 'Old Sprint' })
  });

  assert.equal(decision.action, 'remove');
  assert.equal(decision.reason, 'Removed sprint from inactive column (Backlog)');
});

test('determineSprintAction assigns historical sprint for Done items using completion date', async () => {
  const decision = await sprints.determineSprintAction({
    projectId: 'proj',
    projectItemId: 'item-4',
    currentColumn: 'Done'
  }, {
    getItemSprint: async () => ({ sprintId: null, sprintTitle: null }),
    getItemCompletionDate: async () => '2024-01-10T12:00:00Z',
    findSprintForDate: async () => ({ id: 'iter-historical', title: 'Sprint 5' })
  });

  assert.equal(decision.action, 'assign');
  assert.equal(decision.targetIterationId, 'iter-historical');
  assert.equal(decision.targetSprintTitle, 'Sprint 5');
  assert.equal(decision.reason, 'Assigned to historical sprint (Sprint 5)');
});

test('setItemSprintsBatch batches GraphQL calls', async () => {
  const graphqlCalls = [];
  const success = await sprints.setItemSprintsBatch(
    'proj',
    [
      { projectItemId: 'item-1', iterationId: 'iter-1' },
      { projectItemId: 'item-2', iterationId: 'iter-2' }
    ],
    1,
    {
      getSprintFieldId: async () => 'field-1',
      graphqlClient: async (mutation, variables) => {
        graphqlCalls.push({ mutation, variables });
        return {
          m0: { projectV2Item: { id: variables.input0.itemId } }
        };
      }
    }
  );

  assert.equal(success, 2);
  assert.equal(graphqlCalls.length, 2);
  assert.match(graphqlCalls[0].mutation, /UpdateProjectV2ItemFieldValueInput/);
  assert.deepEqual(graphqlCalls[0].variables.input0, {
    projectId: 'proj',
    itemId: 'item-1',
    fieldId: 'field-1',
    value: { iterationId: 'iter-1' }
  });
});

test('clearItemSprintsBatch batches clear mutations', async () => {
  const graphqlCalls = [];
  const success = await sprints.clearItemSprintsBatch(
    'proj',
    [
      { projectItemId: 'item-1' },
      { projectItemId: 'item-2' }
    ],
    2,
    {
      getSprintFieldId: async () => 'field-2',
      graphqlClient: async (mutation, variables) => {
        graphqlCalls.push({ mutation, variables });
        return {
          m0: { projectV2Item: { id: variables.input0.itemId } },
          m1: { projectV2Item: { id: variables.input1.itemId } }
        };
      }
    }
  );

  assert.equal(success, 2);
  assert.equal(graphqlCalls.length, 1);
  assert.match(graphqlCalls[0].mutation, /ClearProjectV2ItemFieldValueInput/);
  assert.deepEqual(graphqlCalls[0].variables.input0, {
    projectId: 'proj',
    itemId: 'item-1',
    fieldId: 'field-2'
  });
});

