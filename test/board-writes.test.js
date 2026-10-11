import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { requireAddedItemId, requireUpdatedItem } from '../src/github/api.js';
import { formatResultCounts } from '../src/utils/summary.js';

test('a confirmed add returns the project item id', () => {
  const result = { addProjectV2ItemById: { item: { id: 'PVTI_1' } } };
  assert.strictEqual(requireAddedItemId(result, 'bcgov-c/nr-mof-db#743'), 'PVTI_1');
});

test('an add with no item fails and names the item', () => {
  for (const result of [
    { addProjectV2ItemById: { item: null } },
    { addProjectV2ItemById: null },
    {},
    null,
    undefined,
  ]) {
    assert.throws(
      () => requireAddedItemId(result, 'bcgov-c/nr-mof-db#743'),
      /Adding bcgov-c\/nr-mof-db#743 to the project returned no project item/
    );
  }
});

test('a field update with no item fails', () => {
  const ok = { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_1' } } };
  assert.doesNotThrow(() => requireUpdatedItem(ok, 'updateProjectV2ItemFieldValue', 'Status'));
  for (const result of [{ updateProjectV2ItemFieldValue: { projectV2Item: null } }, {}, null]) {
    assert.throws(
      () => requireUpdatedItem(result, 'updateProjectV2ItemFieldValue', 'Setting PVTI_1 Status'),
      /Setting PVTI_1 Status returned no project item from updateProjectV2ItemFieldValue/
    );
  }
});

test('the summary counts failures', () => {
  const report = [{ status: 'Success' }, { status: 'Failed' }, { status: 'Success' }];
  assert.match(formatResultCounts(report), /2 succeeded, 1 failed/);
  assert.match(formatResultCounts([]), /0 succeeded, 0 failed/);
});

test('a failed item is logged by name, the rest keep going, and the run fails', () => {
  const index = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  // Each item runs in its own try/catch, so one failure doesn't stop the loop
  const loop = index.indexOf('for (const item of recentItems)');
  const itemTry = index.indexOf('try {', loop);
  const itemCatch = index.indexOf('catch (itemErr)', loop);
  assert.ok(loop > 0 && itemTry > loop && itemCatch > itemTry);
  assert.match(
    index,
    /core\.error\(\s*`Failed to process \$\{item\.__typename\} \$\{item\.repository/
  );
  assert.match(index, /status: 'Failed'/);
  // Failures are counted in the summary and fail the run after the loop
  assert.match(index, /formatResultCounts\(summaryReport\)/);
  assert.match(index, /if \(hasFailure\) \{[\s\S]*throw new Error/);
  // The add passes a readable label for errors
  assert.match(
    index,
    /addItemToProject\(\s*item\.id,\s*projectId,\s*`\$\{repoName\}#\$\{number\}`/
  );
});
