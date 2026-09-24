import test from 'node:test';
import assert from 'node:assert';
import { assignUserToItem } from '../src/github/api.js';

test('assignUserToItem skips a repository-admin 403 without retrying', async () => {
  process.env.GITHUB_TOKEN = 'test-token';
  delete process.env.DRY_RUN;

  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        message: 'Must have admin rights to Repository.',
        documentation_url:
          'https://docs.github.com/rest/issues/assignees#add-assignees-to-an-issue',
      }),
      { status: 403, headers: { 'content-type': 'application/json' } }
    );
  };

  try {
    const outcome = await assignUserToItem('bcgov/devhub-templates', 28, 'DerekRoberts');
    assert.strictEqual(outcome, 'skipped');
    assert.strictEqual(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
