import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeBoardItemReason } from '../../src/rules/helpers/board-items-evaluator.js';

test('describeBoardItemReason prioritizes issue assigned to user over monitored repo', () => {
  const item = {
    __typename: 'Issue',
    number: 522,
    repository: { nameWithOwner: 'bcgov/nr-results-exam' },
    assignees: {
      nodes: [{ login: 'DerekRoberts' }]
    }
  };

  const monitoredUser = 'DerekRoberts';
  const monitoredRepos = new Set(['bcgov/nr-nerds']); // Issue repo NOT in monitored list

  const result = describeBoardItemReason({ item, monitoredUser, monitoredRepos });

  assert.strictEqual(result.reason, 'Issue is assigned to monitored user');
  assert.strictEqual(result.isAssignedToUser, true);
  assert.strictEqual(result.isMonitoredRepo, false);
});

test('describeBoardItemReason prioritizes issue assigned to user even when in monitored repo', () => {
  const item = {
    __typename: 'Issue',
    number: 100,
    repository: { nameWithOwner: 'bcgov/nr-nerds' },
    assignees: {
      nodes: [{ login: 'DerekRoberts' }]
    }
  };

  const monitoredUser = 'DerekRoberts';
  const monitoredRepos = new Set(['bcgov/nr-nerds']);

  const result = describeBoardItemReason({ item, monitoredUser, monitoredRepos });

  assert.strictEqual(result.reason, 'Issue is assigned to monitored user');
  assert.strictEqual(result.isAssignedToUser, true);
  assert.strictEqual(result.isMonitoredRepo, true);
});

test('describeBoardItemReason falls back to monitored repo when issue not assigned', () => {
  const item = {
    __typename: 'Issue',
    number: 100,
    repository: { nameWithOwner: 'bcgov/nr-nerds' },
    assignees: {
      nodes: [{ login: 'other-user' }]
    }
  };

  const monitoredUser = 'DerekRoberts';
  const monitoredRepos = new Set(['bcgov/nr-nerds']);

  const result = describeBoardItemReason({ item, monitoredUser, monitoredRepos });

  assert.strictEqual(result.reason, 'Issue is in a monitored repository');
  assert.strictEqual(result.isAssignedToUser, false);
  assert.strictEqual(result.isMonitoredRepo, true);
});

test('describeBoardItemReason returns no match when issue has no criteria', () => {
  const item = {
    __typename: 'Issue',
    number: 100,
    repository: { nameWithOwner: 'bcgov/other-repo' },
    assignees: {
      nodes: [{ login: 'other-user' }]
    }
  };

  const monitoredUser = 'DerekRoberts';
  const monitoredRepos = new Set(['bcgov/nr-nerds']);

  const result = describeBoardItemReason({ item, monitoredUser, monitoredRepos });

  assert.strictEqual(result.reason, 'Issue does not meet any criteria');
  assert.strictEqual(result.isAssignedToUser, false);
  assert.strictEqual(result.isMonitoredRepo, false);
});

test('describeBoardItemReason handles issue with multiple assignees', () => {
  const item = {
    __typename: 'Issue',
    number: 200,
    repository: { nameWithOwner: 'bcgov/other-repo' },
    assignees: {
      nodes: [
        { login: 'user1' },
        { login: 'DerekRoberts' },
        { login: 'user2' }
      ]
    }
  };

  const monitoredUser = 'DerekRoberts';
  const monitoredRepos = new Set(['bcgov/nr-nerds']);

  const result = describeBoardItemReason({ item, monitoredUser, monitoredRepos });

  assert.strictEqual(result.reason, 'Issue is assigned to monitored user');
  assert.strictEqual(result.isAssignedToUser, true);
});

test('describeBoardItemReason handles issue with no assignees', () => {
  const item = {
    __typename: 'Issue',
    number: 300,
    repository: { nameWithOwner: 'bcgov/nr-nerds' },
    assignees: {
      nodes: []
    }
  };

  const monitoredUser = 'DerekRoberts';
  const monitoredRepos = new Set(['bcgov/nr-nerds']);

  const result = describeBoardItemReason({ item, monitoredUser, monitoredRepos });

  assert.strictEqual(result.reason, 'Issue is in a monitored repository');
  assert.strictEqual(result.isAssignedToUser, false);
  assert.strictEqual(result.isMonitoredRepo, true);
});

test('describeBoardItemReason handles PR priority correctly (author > assignee > repo)', () => {
  const item = {
    __typename: 'PullRequest',
    number: 400,
    author: { login: 'DerekRoberts' },
    repository: { nameWithOwner: 'bcgov/other-repo' },
    assignees: {
      nodes: [{ login: 'DerekRoberts' }]
    }
  };

  const monitoredUser = 'DerekRoberts';
  const monitoredRepos = new Set(['bcgov/nr-nerds']);

  const result = describeBoardItemReason({ item, monitoredUser, monitoredRepos });

  // PR priority: author > assignee > repo
  assert.strictEqual(result.reason, 'PR is authored by monitored user');
  assert.strictEqual(result.isAuthoredByUser, true);
  assert.strictEqual(result.isAssignedToUser, true);
  assert.strictEqual(result.isMonitoredRepo, false);
});

test('describeBoardItemReason handles PR assigned but not authored', () => {
  const item = {
    __typename: 'PullRequest',
    number: 500,
    author: { login: 'other-user' },
    repository: { nameWithOwner: 'bcgov/other-repo' },
    assignees: {
      nodes: [{ login: 'DerekRoberts' }]
    }
  };

  const monitoredUser = 'DerekRoberts';
  const monitoredRepos = new Set(['bcgov/nr-nerds']);

  const result = describeBoardItemReason({ item, monitoredUser, monitoredRepos });

  assert.strictEqual(result.reason, 'PR is assigned to monitored user');
  assert.strictEqual(result.isAuthoredByUser, false);
  assert.strictEqual(result.isAssignedToUser, true);
});


