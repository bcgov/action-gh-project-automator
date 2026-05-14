import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { loadEventItems } from '../../src/utils/event-items.js';

test('loadEventItems returns empty array when event has no transformer', async () => {
  const items = await loadEventItems('workflow_dispatch', '/tmp/does-not-exist');
  assert.deepEqual(items, []);
});

test('loadEventItems maps pull_request payload to GraphQL-like node', async () => {
  const payload = {
    pull_request: {
      node_id: 'PR_node',
      id: 123,
      number: 42,
      user: { login: 'octocat' },
      assignees: [{ login: 'hubot' }],
      state: 'open',
      updated_at: '2024-01-01T00:00:00Z',
      html_url: 'https://github.com/org/repo/pull/42'
    },
    repository: {
      full_name: 'org/repo'
    }
  };

  const tempFile = path.join(process.cwd(), '.tmp-event-pr.json');
  await fs.writeFile(tempFile, JSON.stringify(payload), 'utf8');
  try {
    const items = await loadEventItems('pull_request', tempFile);
    assert.equal(items.length, 1);
    const item = items[0];
    assert.equal(item.__typename, 'PullRequest');
    assert.equal(item.id, 'PR_node');
    assert.equal(item.repository.nameWithOwner, 'org/repo');
    assert.equal(item.author.login, 'octocat');
    assert.deepEqual(item.assignees.nodes.map(a => a.login), ['hubot']);
  } finally {
    await fs.unlink(tempFile);
  }
});

test('loadEventItems maps issues payload to GraphQL-like node', async () => {
  const payload = {
    issue: {
      node_id: 'ISSUE_node',
      id: 456,
      number: 17,
      user: { login: 'octocat' },
      assignees: [{ login: 'hubot' }],
      state: 'open',
      updated_at: '2024-01-02T00:00:00Z',
      html_url: 'https://github.com/org/repo/issues/17'
    },
    repository: {
      full_name: 'org/repo'
    }
  };

  const tempFile = path.join(process.cwd(), '.tmp-event-issue.json');
  await fs.writeFile(tempFile, JSON.stringify(payload), 'utf8');
  try {
    const items = await loadEventItems('issues', tempFile);
    assert.equal(items.length, 1);
    const item = items[0];
    assert.equal(item.__typename, 'Issue');
    assert.equal(item.id, 'ISSUE_node');
    assert.equal(item.repository.nameWithOwner, 'org/repo');
    assert.equal(item.author.login, 'octocat');
    assert.deepEqual(item.assignees.nodes.map(a => a.login), ['hubot']);
  } finally {
    await fs.unlink(tempFile);
  }
});

