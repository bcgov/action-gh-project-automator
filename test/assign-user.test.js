import test from 'node:test';
import assert from 'node:assert';
import { assignUserToItem } from '../src/github/api.js';
import { captureOutput } from './helpers/capture-output.js';

test('assignUserToItem skips a repository-admin 403 without retrying', async () => {
  process.env.INPUT_GITHUB_TOKEN = 'test-token';
  delete process.env.DRY_RUN;

  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        message: 'test: simulated Must have admin rights to Repository.',
        documentation_url:
          'https://docs.github.com/rest/issues/assignees#add-assignees-to-an-issue',
      }),
      { status: 403, headers: { 'content-type': 'application/json' } }
    );
  };

  try {
    let outcome;
    const output = await captureOutput(async () => {
      outcome = await assignUserToItem('bcgov/devhub-templates', 28, 'DerekRoberts');
    });
    assert.strictEqual(outcome, 'skipped');
    assert.match(
      output,
      /Skipping assignee update for bcgov\/devhub-templates#28: assignment refused \(HTTP 403\)/
    );
    assert.strictEqual(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

for (const status of [403, 404, 422]) {
  test(`assignUserToItem skips a ${status} on assign with a warning instead of failing`, async () => {
    process.env.INPUT_GITHUB_TOKEN = 'test-token';
    delete process.env.DRY_RUN;

    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ message: 'test: simulated Not Found' }), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    };

    try {
      let outcome;
      const output = await captureOutput(async () => {
        outcome = await assignUserToItem('bcgov-c/nr-explore-by-location', 176, 'DerekRoberts');
      });
      assert.strictEqual(outcome, 'skipped');
      assert.match(output, new RegExp(`assignment refused \\(HTTP ${status}\\)`));
      assert.strictEqual(calls, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

test('assignUserToItem still fails on a non-permission error', async () => {
  process.env.INPUT_GITHUB_TOKEN = 'test-token';
  delete process.env.DRY_RUN;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: 'test: simulated Bad Request' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });

  try {
    await captureOutput(() =>
      assert.rejects(
        assignUserToItem('bcgov/quickstart-openshift', 1, 'DerekRoberts'),
        /test: simulated Bad Request/
      )
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('assignUserToItem does not skip a rate-limited 403', async () => {
  process.env.INPUT_GITHUB_TOKEN = 'test-token';
  delete process.env.DRY_RUN;

  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ message: 'test: simulated API rate limit exceeded' }), {
      status: 403,
      headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '0' },
    });
  };

  try {
    await captureOutput(() =>
      assert.rejects(
        assignUserToItem('bcgov/quickstart-openshift', 1, 'DerekRoberts'),
        /test: simulated API rate limit exceeded/
      )
    );
    assert.ok(calls > 1, 'rate-limited assignment is retried');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
