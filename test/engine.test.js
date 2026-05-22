import test from 'node:test';
import assert from 'node:assert';
import { loadBoardRules } from '../src/config/board-rules.js';
import { getProjectId } from '../src/github/api.js';

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
