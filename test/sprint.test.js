import test from 'node:test';
import assert from 'node:assert';
import { loadBoardRules } from '../src/config/board-rules.js';
import { sprintAction } from '../src/utils/sprint.js';

const { sprints } = loadBoardRules();

test('a Done item synced after a rollover keeps its old sprint', () => {
  assert.strictEqual(sprintAction('Done', { id: 'sprint-90' }, 'sprint-91', sprints), null);
});

test('a Done item with no sprint gets the current one', () => {
  assert.strictEqual(sprintAction('Done', null, 'sprint-91', sprints), 'assign');
});

test('Active and Next still move to the current sprint after a rollover', () => {
  assert.strictEqual(sprintAction('Active', { id: 'sprint-90' }, 'sprint-91', sprints), 'assign');
  assert.strictEqual(sprintAction('Next', { id: 'sprint-90' }, 'sprint-91', sprints), 'assign');
});
