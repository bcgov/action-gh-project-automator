import test from 'node:test';
import assert from 'node:assert';
import { loadBoardRules } from '../src/config/board-rules.js';
import { getProjectId } from '../src/github/api.js';
import { determineTargetColumn } from '../src/utils/column-assignment.js';

test('loadBoardRules resolves config and flattens scope', () => {
  const rules = loadBoardRules({ monitoredUser: 'DerekRoberts' });
  assert.ok(rules.project);
  assert.ok(rules.rules);
  assert.strictEqual(rules.monitoredUser, 'DerekRoberts');
  assert.deepStrictEqual(rules.project.allowedOrgs, ['bcgov', 'bcgov-c', 'bcgov-nr']);
});

test('getProjectId correctly rejects malformed project URLs', async () => {
  process.env.GITHUB_TOKEN = 'test-token';
  await assert.rejects(
    () => getProjectId('https://github.com/invalid/format'),
    /Invalid GITHUB_PROJECT_URL format/
  );
});

test('determineTargetColumn maps columns correctly', () => {
  // Closed items (PRs and Issues) go to Done
  assert.strictEqual(determineTargetColumn('PullRequest', true, 'Active'), 'Done');
  assert.strictEqual(determineTargetColumn('Issue', true, 'New'), 'Done');
  assert.strictEqual(determineTargetColumn('PullRequest', true, 'Waiting'), 'Done');

  // Pull Requests already in Waiting stay in Waiting
  assert.strictEqual(determineTargetColumn('PullRequest', false, 'Waiting'), 'Waiting');

  // Pull Requests not in Waiting go to Active
  assert.strictEqual(determineTargetColumn('PullRequest', false, 'New'), 'Active');
  assert.strictEqual(determineTargetColumn('PullRequest', false, 'Backlog'), 'Active');
  assert.strictEqual(determineTargetColumn('PullRequest', false, 'None'), 'Active');
  assert.strictEqual(determineTargetColumn('PullRequest', false, null), 'Active');

  // Issues without column go to New
  assert.strictEqual(determineTargetColumn('Issue', false, null), 'New');
  assert.strictEqual(determineTargetColumn('Issue', false, 'None'), 'New');

  // Issues already in a column stay unchanged
  assert.strictEqual(determineTargetColumn('Issue', false, 'Active'), 'Active');
  assert.strictEqual(determineTargetColumn('Issue', false, 'Backlog'), 'Backlog');
  assert.strictEqual(determineTargetColumn('Issue', false, 'Waiting'), 'Waiting');
});
