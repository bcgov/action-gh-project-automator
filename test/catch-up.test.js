import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import * as yaml from 'js-yaml';
import { parseBackfill } from '../src/utils/backfill.js';

const workflow = yaml.load(
  fs.readFileSync(new URL('../.github/workflows/sync.yml', import.meta.url), 'utf8')
);

test('Sync has a single boolean Catch up input on manual runs', () => {
  const inputs = workflow.on.workflow_dispatch.inputs;
  assert.deepStrictEqual(Object.keys(inputs), ['catch_up']);
  assert.strictEqual(inputs.catch_up.type, 'boolean');
  assert.strictEqual(inputs.catch_up.default, false);
});

test('Catch up runs the existing backfill path with all', () => {
  const step = workflow.jobs.sync.steps.find((s) => s.uses === './.github/actions/sync-engine');
  assert.strictEqual(step.with.backfill, "${{ inputs.catch_up && 'all' || '' }}");
  assert.strictEqual(step.with.window_hours, undefined);
  // The two values that expression can produce
  assert.deepStrictEqual(parseBackfill('all'), { all: true });
  assert.strictEqual(parseBackfill(''), null);
});
