import test from 'node:test';
import assert from 'node:assert';
import { loadBoardRules } from '../src/config/board-rules.js';
import { lastActivity, staleLabelAction } from '../src/stale-drafts/rules.js';

const { stale_drafts: settings } = loadBoardRules({ monitoredUser: 'DerekRoberts' });
const projectId = 'PVT_project16';
const now = new Date('2026-10-20T12:00:00Z');
const daysAgo = (d) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

const pr = (extra = {}) => ({
  state: 'OPEN',
  isDraft: true,
  author: 'DerekRoberts',
  labels: [],
  projectIds: [projectId],
  createdAt: daysAgo(30),
  lastCommitAt: daysAgo(10),
  ...extra,
});
const action = (p) => staleLabelAction(p, { settings, projectId, now });

test('stale_drafts is configured in rules.yml', () => {
  assert.strictEqual(settings.label, 'stale-draft');
  assert.strictEqual(settings.days, 7);
  assert.deepStrictEqual(settings.authors, ['DerekRoberts']);
});

test('lastActivity takes the latest real activity', () => {
  const p = pr({ lastCommentAt: daysAgo(2), lastReviewAt: daysAgo(5), lastEventAt: daysAgo(9) });
  assert.strictEqual(lastActivity(p).toISOString(), daysAgo(2));
  assert.strictEqual(lastActivity({ createdAt: daysAgo(3) }).toISOString(), daysAgo(3));
});

test('labels draft PRs on the board with 7+ days without activity', () => {
  assert.strictEqual(action(pr()), 'add');
  assert.strictEqual(action(pr({ lastCommitAt: daysAgo(7) })), 'add');
  assert.strictEqual(action(pr({ labels: ['stale-draft'] })), null);
});

test('does not label recent, non-draft, off-board or other-author PRs', () => {
  assert.strictEqual(action(pr({ lastCommitAt: daysAgo(6) })), null);
  assert.strictEqual(action(pr({ lastCommitAt: daysAgo(30), lastCommentAt: daysAgo(1) })), null);
  assert.strictEqual(action(pr({ isDraft: false })), null);
  assert.strictEqual(action(pr({ projectIds: ['PVT_other'] })), null);
  assert.strictEqual(action(pr({ author: 'someone-else' })), null);
});

test('removes the label when the PR is updated or no longer a draft', () => {
  const labelled = { labels: ['stale-draft'] };
  assert.strictEqual(action(pr({ ...labelled, lastCommitAt: daysAgo(1) })), 'remove');
  assert.strictEqual(action(pr({ ...labelled, lastReviewAt: daysAgo(0) })), 'remove');
  assert.strictEqual(action(pr({ ...labelled, isDraft: false })), 'remove');
  assert.strictEqual(action(pr({ ...labelled, state: 'CLOSED' })), 'remove');
});
