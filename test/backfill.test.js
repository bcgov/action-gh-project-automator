import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import {
  backfillSince,
  parseBackfill,
  planBackfillItem,
  shouldSaveWatermark,
} from '../src/utils/backfill.js';
import { buildSearchQueries, resolveSince } from '../src/github/queries.js';
import { loadBoardRules } from '../src/config/board-rules.js';
import { isTitleExcluded } from '../src/utils/exclusions.js';

const ISSUE = { itemType: 'Issue', draft: false, authored: false };

const config = loadBoardRules();
const repos = config.project.repositories;
const now = new Date('2026-10-11T12:00:00Z');

test('parseBackfill: empty means a normal run', () => {
  for (const v of ['', '  ', undefined, null]) assert.strictEqual(parseBackfill(v), null);
});

test('parseBackfill: day windows and all', () => {
  assert.deepStrictEqual(parseBackfill('30d'), { days: 30 });
  assert.deepStrictEqual(parseBackfill(' 7D '), { days: 7 });
  assert.deepStrictEqual(parseBackfill('all'), { all: true });
  assert.deepStrictEqual(parseBackfill('ALL'), { all: true });
});

test('parseBackfill: rejects invalid values', () => {
  for (const bad of ['0d', '30', 'd', '-5d', '2w', '1.5d', 'bcgov/actions', 'everything']) {
    assert.throws(() => parseBackfill(bad), /Invalid backfill/, bad);
  }
});

test('backfill window ignores the watermark and reaches the search', () => {
  assert.strictEqual(backfillSince({ days: 30 }, now), '2026-09-11T12:00:00.000Z');
  assert.strictEqual(backfillSince({ all: true }, now), null);

  const days = buildSearchQueries({
    org: 'bcgov',
    repos,
    monitoredUsers: ['me'],
    since: backfillSince({ days: 30 }, now),
    openOnly: true,
  });
  for (const q of [...days.repoQueries, ...days.userQueries]) {
    assert.ok(q.includes('updated:>=2026-09-11T12:00:00.000Z'), q);
  }

  const all = buildSearchQueries({
    org: 'bcgov',
    repos,
    monitoredUsers: ['me'],
    since: backfillSince({ all: true }, now),
    openOnly: true,
  });
  for (const q of [...all.repoQueries, ...all.userQueries]) {
    assert.ok(!q.includes('updated:'), q);
  }
});

test('backfill searches open items only; normal runs keep closed-unmerged PRs', () => {
  const backfill = buildSearchQueries({
    org: 'bcgov',
    repos,
    monitoredUsers: ['me'],
    since: null,
    openOnly: true,
  });
  assert.strictEqual(backfill.repoQueries.length, 1);
  for (const q of [...backfill.repoQueries, ...backfill.userQueries]) {
    assert.ok(q.includes('is:open') && !q.includes('is:closed'), q);
  }
  assert.strictEqual(backfill.userQueries.length, 3);

  const normal = buildSearchQueries({
    org: 'bcgov',
    repos,
    monitoredUsers: ['me'],
    since: resolveSince(null, 2, now),
  });
  assert.ok(normal.repoQueries.some((q) => q.includes('is:pr is:closed is:unmerged')));
  assert.strictEqual(normal.userQueries.length, 5);
});

test('backfill adds missing items to New and leaves existing items alone', () => {
  assert.deepStrictEqual(planBackfillItem(null, config.board_columns, ISSUE), {
    action: 'add',
    column: 'New',
  });
  const existing = { projectItemId: 'PVTI_1', column: 'Waiting', sprint: null };
  assert.deepStrictEqual(planBackfillItem(existing, config.board_columns, ISSUE), {
    action: 'skip',
    projectItemId: 'PVTI_1',
  });
});

test('backfill adds a missing PR authored by a monitored user to Active, never New', () => {
  for (const draft of [false, true]) {
    assert.deepStrictEqual(
      planBackfillItem(null, config.board_columns, {
        itemType: 'PullRequest',
        draft,
        authored: true,
      }),
      { action: 'add', column: 'Active' },
      `draft ${draft}`
    );
  }
});

test("backfill adds someone else's missing PR to New, never Active", () => {
  for (const draft of [false, true]) {
    assert.deepStrictEqual(
      planBackfillItem(null, config.board_columns, {
        itemType: 'PullRequest',
        draft,
        authored: false,
      }),
      { action: 'add', column: 'New' },
      `draft ${draft}`
    );
  }
});

test('backfill uses the same exclusions as the sync, before any board change', () => {
  for (const title of ['Dependency Dashboard', 'ZAP: backendPy', 'ZAP Security Report']) {
    assert.strictEqual(isTitleExcluded(title, config.exclusions), true, title);
  }
  const index = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.ok(index.indexOf('isTitleExcluded(title') < index.indexOf('planBackfillItem('));
  const labelGuard = index.indexOf('findExcludedLabel(labelNames(item.labels)');
  assert.ok(labelGuard !== -1, 'the label exclusion runs in the item loop');
  assert.ok(labelGuard < index.indexOf('planBackfillItem('));
});

test('a backfill run never saves the watermark', () => {
  assert.strictEqual(shouldSaveWatermark({ backfill: null, hasFailure: false }), true);
  assert.strictEqual(shouldSaveWatermark({ backfill: null, hasFailure: true }), false);
  assert.strictEqual(shouldSaveWatermark({ backfill: { all: true }, hasFailure: false }), false);
  assert.strictEqual(shouldSaveWatermark({ backfill: { days: 30 }, hasFailure: false }), false);
});
