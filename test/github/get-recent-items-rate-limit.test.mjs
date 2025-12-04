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

test('getRecentItems constructs assignee search query correctly', async () => {
  const { overrides, calls } = createOverrides({
    assigneeNodes: []
  });

  await getRecentItems('org', ['repo1'], 'testuser', 48, { overrides });

  const assigneeCall = calls.find(call => call.includes('assignee:'));
  assert.ok(assigneeCall, 'Assignee search should be called');
  assert.ok(assigneeCall.includes('assignee:testuser'), 'Query should include assignee username');
  assert.ok(assigneeCall.includes('created:>'), 'Query should include created timestamp filter');
  
  // Verify timestamp format (ISO 8601)
  const timestampMatch = assigneeCall.match(/created:>([^\s]+)/);
  assert.ok(timestampMatch, 'Query should include timestamp in ISO format');
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(timestampMatch[1]), 'Timestamp should be ISO 8601 format');
});

test('getRecentItems returns both Issues and PullRequests from assignee search', async () => {
  const assigneeIssue = {
    __typename: 'Issue',
    id: 'issue-assigned-1',
    number: 100,
    repository: { nameWithOwner: 'org/repo-a' },
    author: { login: 'someone' },
    assignees: { nodes: [{ login: 'octocat' }] },
    state: 'OPEN',
    updatedAt: '2024-01-01T00:00:00Z'
  };

  const assigneePR = {
    __typename: 'PullRequest',
    id: 'pr-assigned-1',
    number: 200,
    repository: { nameWithOwner: 'org/repo-b' },
    author: { login: 'someone' },
    assignees: { nodes: [{ login: 'octocat' }] },
    state: 'OPEN',
    updatedAt: '2024-01-01T00:00:00Z'
  };

  const { overrides } = createOverrides({
    repoNodes: [],
    authorNodes: [],
    assigneeNodes: [assigneeIssue, assigneePR]
  });

  const items = await getRecentItems('org', [], 'octocat', 1, { overrides });

  assert.equal(items.length, 2, 'Should return both Issue and PullRequest');
  assert.ok(items.some(item => item.__typename === 'Issue' && item.id === 'issue-assigned-1'), 'Should include assigned Issue');
  assert.ok(items.some(item => item.__typename === 'PullRequest' && item.id === 'pr-assigned-1'), 'Should include assigned PullRequest');
});

test('getRecentItems deduplicates items found in multiple searches', async () => {
  // Same item appears in both repo search and assignee search
  const duplicateItem = {
    __typename: 'Issue',
    id: 'duplicate-item-1',
    number: 500,
    repository: { nameWithOwner: 'org/repo1' },
    author: { login: 'someone' },
    assignees: { nodes: [{ login: 'octocat' }] },
    state: 'OPEN',
    updatedAt: '2024-01-01T00:00:00Z'
  };

  const { overrides, calls } = createOverrides({
    repoNodes: [duplicateItem],
    authorNodes: [],
    assigneeNodes: [duplicateItem]
  });

  const items = await getRecentItems('org', ['repo1'], 'octocat', 1, { overrides });

  // Should only appear once despite being in both searches
  assert.equal(items.length, 1, 'Should deduplicate items found in multiple searches');
  assert.equal(items[0].id, 'duplicate-item-1', 'Should include the deduplicated item');
  
  // Verify all three searches still executed
  assert.equal(calls.length, 3, 'All three searches should still execute even with duplicates');
});

test('getRecentItems deduplicates items across all search types', async () => {
  // Item that could match repo, author, and assignee searches
  const tripleMatchItem = {
    __typename: 'PullRequest',
    id: 'triple-match-1',
    number: 600,
    repository: { nameWithOwner: 'org/repo1' },
    author: { login: 'octocat' },
    assignees: { nodes: [{ login: 'octocat' }] },
    state: 'OPEN',
    updatedAt: '2024-01-01T00:00:00Z'
  };

  const { overrides } = createOverrides({
    repoNodes: [tripleMatchItem],
    authorNodes: [tripleMatchItem],
    assigneeNodes: [tripleMatchItem]
  });

  const items = await getRecentItems('org', ['repo1'], 'octocat', 1, { overrides });

  // Should only appear once despite matching all three searches
  assert.equal(items.length, 1, 'Should deduplicate items found in all searches');
  assert.equal(items[0].id, 'triple-match-1', 'Should include the deduplicated item');
});
