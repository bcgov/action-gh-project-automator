import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRecentItems } from '../../src/github/api.js';
import { Logger } from '../../src/utils/log.js';

function createOverrides({ repoNodes = [], authorNodes = [], assigneeNodes = [], shouldProceedResult = { proceed: true } } = {}) {
  const calls = [];
  return {
    overrides: {
      shouldProceedFn: async () => shouldProceedResult,
      withBackoffFn: async operation => operation(),
      graphqlClient: async (_query, variables) => {
        calls.push(variables.searchQuery);
        let nodes = [];
        if (variables.searchQuery.startsWith('repo:')) {
          nodes = repoNodes;
        } else if (variables.searchQuery.includes('author:')) {
          nodes = authorNodes;
        } else if (variables.searchQuery.includes('assignee:')) {
          nodes = assigneeNodes;
        }
        return {
          search: {
            nodes
          }
        };
      }
    },
    calls
  };
}

test('getRecentItems performs guarded searches when rate limit allows', async () => {
  const repoNodes = [
    { __typename: 'Issue', id: 'repo-1', number: 1, repository: { nameWithOwner: 'org/repo1' }, author: { login: 'someone' }, assignees: { nodes: [] }, state: 'OPEN', updatedAt: '2024-01-01T00:00:00Z' }
  ];
  const authorNodes = [
    { __typename: 'PullRequest', id: 'user-1', number: 2, repository: { nameWithOwner: 'org/repo2' }, author: { login: 'octocat' }, assignees: { nodes: [] }, state: 'OPEN', updatedAt: '2024-01-01T00:10:00Z' }
  ];
  const assigneeNodes = [
    { __typename: 'Issue', id: 'assignee-1', number: 3, repository: { nameWithOwner: 'org/repo3' }, author: { login: 'someone' }, assignees: { nodes: [{ login: 'octocat' }] }, state: 'OPEN', updatedAt: '2024-01-01T00:20:00Z' }
  ];

  const { overrides, calls } = createOverrides({ repoNodes, authorNodes, assigneeNodes });
  const items = await getRecentItems('org', ['repo1'], 'octocat', 1, { overrides });

  assert.equal(items.length, 3);
  assert.equal(calls.length, 3, 'Expected repo, author, and assignee searches');
  assert.ok(calls[0].includes('repo:org/repo1'), 'First call should be repo search');
  assert.ok(calls[1].includes('author:octocat'), 'Second call should be author search');
  assert.ok(calls[2].includes('assignee:octocat'), 'Third call should be assignee search');
});

test('getRecentItems skips searches when rate limit guard fails', async () => {
  const logger = new Logger();
  const infoMessages = [];
  logger.info = message => infoMessages.push(message);

  const { overrides, calls } = createOverrides({
    shouldProceedResult: { proceed: false, remaining: 50, limit: 5000, resetAt: 'soon' }
  });

  const items = await getRecentItems('org', ['repo1'], 'octocat', 1, { overrides, logger });

  assert.equal(items.length, 0);
  assert.equal(calls.length, 0, 'GraphQL must not be called when guard fails');
  assert.ok(infoMessages.some(msg => msg.includes('Skipping recent-item search due to low rate limit')));
});
