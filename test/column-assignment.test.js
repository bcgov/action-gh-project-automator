import test from 'node:test';
import assert from 'node:assert';
import { loadBoardRules } from '../src/config/board-rules.js';
import {
  determineLinkedIssueColumn,
  determineTargetColumn,
} from '../src/utils/column-assignment.js';

const { board_columns: shipped } = loadBoardRules();

test('column moves require board_columns: there are no built-in defaults', () => {
  assert.throws(() => determineTargetColumn('Issue', false, null, {}), /board_columns/);
  assert.throws(() => determineLinkedIssueColumn({}, null, undefined), /board_columns/);
});

for (const policy of [shipped]) {
  const label = 'rules.yml';
  const pr = (current, state = {}) =>
    determineTargetColumn('PullRequest', Boolean(state.isClosed), current, { ...state, policy });
  const linked = (current, state = {}, options = {}) =>
    determineLinkedIssueColumn(
      { isClosed: false, merged: false, draft: false, ...state },
      current,
      policy,
      options
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

  test(`[${label}] merged PR and its issue are left to GitHub's built-in Done workflow`, () => {
    assert.strictEqual(pr('Active', { isClosed: true, merged: true }), 'Active');
    assert.strictEqual(linked('Active', { isClosed: true, merged: true }), 'Active');
    assert.strictEqual(linked('Done', { isClosed: true, merged: true }), 'Done');
  });

  test(`[${label}] PR closed without merging is not moved, its open issue goes back to Next`, () => {
    assert.strictEqual(pr('Active', { isClosed: true }), 'Active');
    assert.strictEqual(linked('Active', { isClosed: true }), 'Next');
    assert.strictEqual(linked('Done', { isClosed: true }), 'Next');
  });

  test(`[${label}] closed linked issue is not moved`, () => {
    for (const col of ['New', 'Backlog', 'Next', 'Active', 'Done']) {
      for (const prState of [
        { isClosed: true, merged: false },
        { isClosed: false, merged: false, draft: false },
        { isClosed: true, merged: true },
        { draft: true },
      ]) {
        assert.strictEqual(
          linked(col, prState, { isClosed: true }),
          col,
          `${col} ${JSON.stringify(prState)}`
        );
      }
    }
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

  test(`[${label}] issues: no Status goes to New, closed issues are not moved`, () => {
    assert.strictEqual(determineTargetColumn('Issue', false, null, { policy }), 'New');
    assert.strictEqual(determineTargetColumn('Issue', false, 'Next', { policy }), 'Next');
    assert.strictEqual(determineTargetColumn('Issue', true, 'Active', { policy }), 'Active');
  });
}

test('board_columns values in rules.yml drive the moves', () => {
  const policy = structuredClone(shipped);
  policy.linked_issue.closed = 'Backlog';
  policy.locked = ['Parked'];
  assert.strictEqual(
    determineLinkedIssueColumn({ isClosed: true, merged: false, draft: false }, 'Active', policy),
    'Backlog'
  );
  assert.strictEqual(determineTargetColumn('PullRequest', false, 'Waiting', { policy }), 'Active');
});
