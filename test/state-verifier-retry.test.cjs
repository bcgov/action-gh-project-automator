const test = require('node:test');
const assert = require('node:assert/strict');
const { StateVerifier } = require('../src/utils/state-verifier.js');

test('retryWithTracking retries column mismatch errors', async () => {
  const item = { type: 'PullRequest', number: 200 };
  let attemptCount = 0;

  const result = await StateVerifier.retryWithTracking(
    item,
    'Column Verification',
    async () => {
      attemptCount += 1;
      if (attemptCount === 1) {
        throw new Error('Column mismatch for PullRequest #200: Expected: "Active"\nCurrent: "New"');
      }
      return { column: 'Active' };
    },
    'column verification for PullRequest #200'
  );

  assert.equal(attemptCount, 2);
  assert.deepEqual(result, { column: 'Active' });
});

test('retryWithTracking does not retry non-retryable errors', async () => {
  const item = { type: 'Issue', number: 201 };
  let attemptCount = 0;

  await assert.rejects(async () => {
    await StateVerifier.retryWithTracking(
      item,
      'Column Verification',
      async () => {
        attemptCount += 1;
        throw new Error('Permanent failure');
      },
      'column verification for Issue #201'
    );
  }, /Permanent failure/);

  assert.equal(attemptCount, 1);
});

