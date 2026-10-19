import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { loadBoardRules } from '../src/config/board-rules.js';
import {
  columnAfterAdd,
  createBoardLookup,
  formatBoardFetch,
  projectOwnerFromUrl,
  repoOwner,
} from '../src/utils/board-lookup.js';
import { planBackfillItem } from '../src/utils/backfill.js';
import { determineTargetColumn } from '../src/utils/column-assignment.js';
import { sprintAction } from '../src/utils/sprint.js';

const { board_columns: policy, sprints, project } = loadBoardRules();
const P16 = 'PVT_project16';
const CURRENT = 'sprint-90';

// A bcgov-c issue only lists bcgov-c projects in projectItems, never Project 16
const crossOrgIssue = {
  id: 'I_mofdb_743',
  repository: { nameWithOwner: 'bcgov-c/nr-mof-db' },
  projectItems: { nodes: [{ id: 'PVTI_mof', project: { id: 'PVT_mof_db_work' } }] },
};
const sameOrgIssue = {
  id: 'I_actions_1',
  repository: { nameWithOwner: 'bcgov/actions' },
  projectItems: {
    nodes: [{ id: 'PVTI_a1', project: { id: P16 }, status: { name: 'Next' } }],
  },
};

function fakeBoard(entries) {
  const calls = { fetches: 0 };
  const fetchBoardItems = async () => {
    calls.fetches++;
    return { items: new Map(entries), calls: 7 };
  };
  const lookup = createBoardLookup({ projectId: P16, projectOwner: 'bcgov', fetchBoardItems });
  return { lookup, calls };
}

test('owners are read from the repo and the project URL', () => {
  assert.strictEqual(repoOwner('bcgov-c/nr-mof-db'), 'bcgov-c');
  assert.strictEqual(repoOwner('BCGov/actions'), 'bcgov');
  assert.strictEqual(projectOwnerFromUrl(project.url), 'bcgov');
  assert.throws(() => projectOwnerFromUrl('https://example.com/x'), /project owner/);
});

test('a cross-org item already on the board is not reset', async () => {
  for (const [column, sprint] of [
    ['Waiting', { id: 'sprint-88', title: 'Sprint 88' }],
    ['Next', { id: CURRENT, title: 'Sprint 90' }],
    ['Backlog', null],
    ['Active', { id: CURRENT, title: 'Sprint 90' }],
  ]) {
    const { lookup } = fakeBoard([
      [crossOrgIssue.id, { projectItemId: 'PVTI_p16_743', column, sprint }],
    ]);
    const state = await lookup.stateFor(crossOrgIssue, crossOrgIssue.repository.nameWithOwner);
    assert.deepStrictEqual(state, { projectItemId: 'PVTI_p16_743', column, sprint });

    // Normal run: Status and Sprint stay as they are
    assert.strictEqual(determineTargetColumn('Issue', false, state.column, { policy }), column);
    assert.strictEqual(sprintAction(column, state.sprint, CURRENT, sprints), null, column);

    // Backfill: left alone, not re-added
    assert.deepStrictEqual(planBackfillItem(state, policy, []), {
      action: 'skip',
      projectItemId: 'PVTI_p16_743',
    });
  }
});

test('a cross-org item not on the board is added to New', async () => {
  const { lookup } = fakeBoard([]);
  const state = await lookup.stateFor(crossOrgIssue, crossOrgIssue.repository.nameWithOwner);
  assert.strictEqual(state, null);
  assert.deepStrictEqual(planBackfillItem(state, policy, []), { action: 'add', column: 'New' });
  // Just added, with no Status yet
  assert.strictEqual(columnAfterAdd({ projectItemId: 'PVTI_new', column: null }, 'New'), 'New');
  assert.strictEqual(determineTargetColumn('Issue', false, null, { policy }), 'New');
});

test('the add path never sets New on an item that already has a Status', () => {
  for (const column of ['New', 'Backlog', 'Next', 'Active', 'Waiting', 'Parked', 'Done']) {
    assert.strictEqual(columnAfterAdd({ projectItemId: 'PVTI_1', column }, 'New'), null, column);
  }
  assert.strictEqual(columnAfterAdd(null, 'New'), 'New');

  // Both add paths read the item's real state right after adding it
  const index = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const adds = [...index.matchAll(/api\.addItemToProject\(/g)].map((m) => m.index);
  assert.strictEqual(adds.length, 2);
  for (const at of adds) {
    const after = index.slice(at, at + 600);
    assert.match(after, /api\.getProjectItemState\(/);
  }
  assert.match(index, /columnAfterAdd\(existing, plan\.column\)/);
  assert.match(index, /currentColumn = existing\.column;/);
  assert.match(index, /currentSprint = existing\.sprint;/);
});

test('the board list is fetched at most once, and only when cross-org items exist', async () => {
  // Same-org items only: no fetch, state comes from the search result
  const sameOnly = fakeBoard([]);
  const state = await sameOnly.lookup.stateFor(sameOrgIssue, 'bcgov/actions');
  assert.strictEqual(state.column, 'Next');
  await sameOnly.lookup.stateFor(sameOrgIssue, 'bcgov/actions');
  assert.strictEqual(sameOnly.calls.fetches, 0);
  assert.strictEqual(sameOnly.lookup.stats.fetches, 0);
  assert.match(formatBoardFetch(sameOnly.lookup.stats), /not fetched/);

  // Several cross-org items, including concurrent lookups: one fetch
  const mixed = fakeBoard([
    [crossOrgIssue.id, { projectItemId: 'P', column: 'New', sprint: null }],
  ]);
  await Promise.all([
    mixed.lookup.stateFor(crossOrgIssue, 'bcgov-c/nr-mof-db'),
    mixed.lookup.stateFor({ id: 'I_other' }, 'bcgov-c/other'),
  ]);
  await mixed.lookup.stateFor(sameOrgIssue, 'bcgov/actions');
  await mixed.lookup.stateFor({ id: 'I_third' }, 'bcgov-c/nr-mof-db');
  assert.strictEqual(mixed.calls.fetches, 1);
  assert.deepStrictEqual(mixed.lookup.stats, { fetches: 1, calls: 7, items: 1 });
  assert.match(formatBoardFetch(mixed.lookup.stats), /7 calls, 1 items/);
});

test('cross-org linked issues use the board list too', () => {
  const index = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(index, /board\.isCrossOrg\(linked\.repository\?\.nameWithOwner\)/);
  assert.match(index, /formatBoardFetch\(board\.stats\)/);
});
