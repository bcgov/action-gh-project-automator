import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import * as api from '../src/github/api.js';
import {
  buildSearchQueries,
  chunkQualifiers,
  MAX_QUERY_LENGTH,
  resolveSince,
} from '../src/github/queries.js';
import { boardState } from '../src/utils/board-state.js';
import { countCalls, formatApiUsage } from '../src/utils/api-usage.js';
import { loadBoardRules } from '../src/config/board-rules.js';

const P16 = 'PVT_project16';
const now = new Date('2026-10-11T12:00:00Z');
const since = '2026-10-11T10:00:00.000Z';
const repos = loadBoardRules().project.repositories;

// 1. Board membership, column and sprint come from the search result
test('boardState reads membership, column and sprint from projectItems', () => {
  const item = {
    projectItems: {
      nodes: [
        { id: 'PVTI_other', project: { id: 'PVT_other' }, status: { name: 'Done' } },
        {
          id: 'PVTI_16',
          project: { id: P16 },
          status: { name: 'Next' },
          sprint: { iterationId: 'it1', title: 'Sprint 1' },
        },
      ],
    },
  };
  assert.deepStrictEqual(boardState(item, P16), {
    projectItemId: 'PVTI_16',
    column: 'Next',
    sprint: { id: 'it1', title: 'Sprint 1' },
  });
});

test('boardState: on the board with no Status or Sprint, and not on the board', () => {
  const noFields = { projectItems: { nodes: [{ id: 'PVTI_16', project: { id: P16 } }] } };
  assert.deepStrictEqual(boardState(noFields, P16), {
    projectItemId: 'PVTI_16',
    column: null,
    sprint: null,
  });
  assert.strictEqual(
    boardState({ projectItems: { nodes: [{ id: 'x', project: { id: 'PVT_other' } }] } }, P16),
    null
  );
  assert.strictEqual(boardState({}, P16), null);
});

test('per-item board lookups are gone', () => {
  for (const name of ['isItemInProject', 'getItemColumn', 'getItemSprint']) {
    assert.strictEqual(api[name], undefined, `${name} is still exported`);
  }
  const index = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.ok(!/isItemInProject|getItemColumn|getItemSprint/.test(index));
});

// 2. Combined repo searches
test('repo searches combine all monitored repos into as few queries as fit', () => {
  const { repoQueries } = buildSearchQueries({
    org: 'bcgov',
    repos,
    monitoredUsers: ['me'],
    since,
  });
  // One open query and one closed-unmerged PR query cover every repo
  assert.strictEqual(repoQueries.length, 2);
  for (const q of repoQueries) {
    assert.ok(q.length <= MAX_QUERY_LENGTH, `${q.length} chars`);
    for (const repo of repos) assert.ok(q.includes(`repo:${repo} `), `${repo} missing`);
  }
});

test('chunkQualifiers splits long lists without exceeding the limit or dropping repos', () => {
  const quals = Array.from({ length: 40 }, (_, i) => `repo:bcgov/some-long-repository-name-${i}`);
  const chunks = chunkQualifiers(quals, 60, 300);
  assert.ok(chunks.length > 1);
  assert.deepStrictEqual(chunks.flat(), quals);
  for (const c of chunks) assert.ok(60 + c.join(' ').length + 1 <= 300);
  const { repoQueries } = buildSearchQueries({
    org: 'bcgov',
    repos: quals.map((q) => q.slice(5)),
    monitoredUsers: ['me'],
    since,
    maxLength: 300,
  });
  for (const q of repoQueries) assert.ok(q.length <= 300, `${q.length} chars`);
  assert.ok(repoQueries.length > 2);
  for (const q of quals) {
    assert.strictEqual(repoQueries.filter((rq) => rq.includes(`${q} `)).length, 2, q);
  }
});

test('unqualified repos get the default org', () => {
  const { repoQueries } = buildSearchQueries({
    org: 'bcgov',
    repos: ['actions'],
    monitoredUsers: ['me'],
    since,
  });
  assert.ok(repoQueries[0].startsWith('repo:bcgov/actions '));
});

// 3 and 6. No unwindowed "is:open" queries; open items plus PRs closed without merging only
test('every query is windowed and limited to open items or PRs closed without merging', () => {
  const { repoQueries, userQueries } = buildSearchQueries({
    org: 'bcgov',
    repos,
    monitoredUsers: ['me'],
    since,
  });
  for (const q of [...repoQueries, ...userQueries]) {
    assert.ok(q.includes(`updated:>=${since}`), `unwindowed: ${q}`);
    const open = q.includes('is:open');
    const closedUnmerged = q.includes('is:pr is:closed is:unmerged');
    assert.ok(open !== closedUnmerged, `scope: ${q}`);
    assert.ok(!q.includes('is:merged'), q);
  }
  assert.deepStrictEqual(userQueries, [
    `author:me is:pr is:open archived:false updated:>=${since} sort:updated-desc`,
    `author:me is:pr is:closed is:unmerged archived:false updated:>=${since} sort:updated-desc`,
    `assignee:me is:open archived:false updated:>=${since} sort:updated-desc`,
    `assignee:me is:pr is:closed is:unmerged archived:false updated:>=${since} sort:updated-desc`,
    `review-requested:me is:pr is:open archived:false updated:>=${since} sort:updated-desc`,
  ]);
});

// 4. Watermark-based since
test('resolveSince uses the watermark with a 10-minute overlap', () => {
  assert.strictEqual(resolveSince('2026-10-11T09:00:00Z', 2, now), '2026-10-11T08:50:00.000Z');
});

test('resolveSince falls back to the window without a usable watermark', () => {
  const fallback = '2026-10-11T10:00:00.000Z';
  assert.strictEqual(resolveSince(null, 2, now), fallback);
  assert.strictEqual(resolveSince('', 2, now), fallback);
  assert.strictEqual(resolveSince('not a date', 2, now), fallback);
  assert.strictEqual(resolveSince('2026-10-12T00:00:00Z', 2, now), fallback); // future
  assert.strictEqual(resolveSince(null, 6, now), '2026-10-11T06:00:00.000Z');
});

// 5. API usage in the job summary
test('countCalls counts each call and passes results through', async () => {
  const stats = { graphql: 0 };
  const fn = async (q) => `ok:${q}`;
  fn.endpoint = 'kept';
  const wrapped = countCalls(fn, stats, 'graphql');
  assert.strictEqual(await wrapped('a'), 'ok:a');
  await wrapped('b');
  assert.strictEqual(stats.graphql, 2);
  assert.strictEqual(wrapped.endpoint, 'kept');
});

test('formatApiUsage reports call counts and rate limits', () => {
  const out = formatApiUsage(
    { graphql: 7, rest: 3 },
    {
      graphql: { remaining: 4900, limit: 5000, reset: 1791892800 },
      core: { remaining: 4990, limit: 5000 },
    }
  );
  assert.ok(out.includes('**API calls:** 10 (GraphQL 7, REST 3)'));
  assert.ok(out.includes('**Rate limit (graphql):** 4900/5000 remaining (resets '));
  assert.ok(out.includes('**Rate limit (core):** 4990/5000 remaining'));
  assert.ok(formatApiUsage({ graphql: 1, rest: 0 }, null).includes('Rate limit:** unavailable'));
});
