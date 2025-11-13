import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setItemAssignees } from '../../src/rules/assignees.js';

test('setItemAssignees applies minimal add/remove deltas', async (t) => {
  const removeCalls = [];
  const addCalls = [];

  await setItemAssignees('project', 'item', ['alice', 'carol'], {
    getItemDetailsFn: async () => ({
      type: 'PullRequest',
      content: {
        repository: { nameWithOwner: 'org/repo' },
        number: 42,
        id: 'assignableId'
      }
    }),
    fetchRepoAssigneesFn: async () => ['alice', 'bob'],
    getUserIdsFn: async (logins) => ({
      ids: logins.map(login => `user-${login}`),
      missing: []
    }),
    graphqlClient: async (query, variables) => {
    if (query.includes('removeAssigneesFromAssignable')) {
      removeCalls.push(variables.assigneeIds);
      return {
        removeAssigneesFromAssignable: {
          assignable: { __typename: 'PullRequest' }
        }
      };
    }

    if (query.includes('addAssigneesToAssignable')) {
      addCalls.push(variables.assigneeIds);
      return {
        addAssigneesToAssignable: {
          assignable: { __typename: 'PullRequest' }
        }
      };
    }

      return {};
    }
  });

  assert.equal(removeCalls.length, 1);
  assert.deepEqual(removeCalls[0], ['user-bob']);

  assert.equal(addCalls.length, 1);
  assert.deepEqual(addCalls[0], ['user-carol']);
});

