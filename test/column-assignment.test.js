import test from 'node:test';
import assert from 'node:assert';
import { loadBoardRules } from '../src/config/board-rules.js';
import {
  DEFAULT_COLUMN_POLICY,
  determineLinkedIssueColumn,
  determineTargetColumn,
} from '../src/utils/column-assignment.js';

const { board_columns: shipped } = loadBoardRules({ monitoredUser: 'DerekRoberts' });

test('shipped rules.yml board_columns matches the built-in defaults', () => {
  assert.deepStrictEqual(shipped, DEFAULT_COLUMN_POLICY);
});

for (const policy of [undefined, shipped]) {
  const label = policy ? 'rules.yml' : 'defaults';
  const pr = (current, state = {}) =>
    determineTargetColumn('PullRequest', Boolean(state.isClosed), current, { ...state, policy });
  const linked = (current, state = {}) =>
    determineLinkedIssueColumn(
      { isClosed: false, merged: false, draft: false, ...state },
      current,
      policy
    );

  test(`[${label}] ready-for-review PR and its issue go to Active`, () => {
    for (const col of [null, 'None', 'New', 'Backlog', 'Next']) {
      assert.strictEqual(pr(col), 'Active', String(col));
      assert.strictEqual(linked(col), 'Active', String(col));
    }
  });

  test(`[${label}] draft PR and its issue stay put`, () => {
    for (const col of ['New', 'Backlog', 'Next', 'Active']) {
      assert.strictEqual(pr(col, { draft: true }), col);
      assert.strictEqual(linked(col, { draft: true }), col);
    }
    assert.strictEqual(pr(null, { draft: true }), 'New');
    assert.strictEqual(linked(null, { draft: true }), null);
  });

  test(`[${label}] merged PR and its issue go to Done`, () => {
    assert.strictEqual(pr('Active', { isClosed: true, merged: true }), 'Done');
    assert.strictEqual(linked('Active', { isClosed: true, merged: true }), 'Done');
  });

  test(`[${label}] PR closed without merging goes to Done, its issue back to Next`, () => {
    assert.strictEqual(pr('Active', { isClosed: true }), 'Done');
    assert.strictEqual(linked('Active', { isClosed: true }), 'Next');
    assert.strictEqual(linked('Done', { isClosed: true }), 'Next');
  });

  test(`[${label}] nothing moves out of Waiting or Parked`, () => {
    const states = [
      {},
      { draft: true },
      { isClosed: true, merged: true },
      { isClosed: true, merged: false },
    ];
    for (const col of ['Waiting', 'Parked']) {
      for (const state of states) {
        assert.strictEqual(pr(col, state), col, `${col} ${JSON.stringify(state)}`);
        assert.strictEqual(linked(col, state), col, `${col} ${JSON.stringify(state)}`);
      }
      assert.strictEqual(determineTargetColumn('Issue', true, col, { policy }), col);
      assert.strictEqual(determineTargetColumn('Issue', false, col, { policy }), col);
    }
  });

  test(`[${label}] issues: no Status goes to New, closed goes to Done`, () => {
    assert.strictEqual(determineTargetColumn('Issue', false, null, { policy }), 'New');
    assert.strictEqual(determineTargetColumn('Issue', false, 'Next', { policy }), 'Next');
    assert.strictEqual(determineTargetColumn('Issue', true, 'Active', { policy }), 'Done');
  });
}

test('partial board_columns overrides keep the remaining defaults', () => {
  const policy = { linked_issue: { closed: 'Backlog' } };
  assert.strictEqual(
    determineLinkedIssueColumn({ isClosed: true, merged: false, draft: false }, 'Active', policy),
    'Backlog'
  );
  assert.strictEqual(determineTargetColumn('PullRequest', false, 'Next', { policy }), 'Active');
  assert.strictEqual(determineTargetColumn('PullRequest', false, 'Waiting', { policy }), 'Waiting');
});
