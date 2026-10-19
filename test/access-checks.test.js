import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import * as api from '../src/github/api.js';

const json = (payload) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

async function withFetch(handler, fn) {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.INPUT_GITHUB_TOKEN;
  process.env.INPUT_GITHUB_TOKEN = 'mock-token';
  globalThis.fetch = async (url, options) => handler(options?.body ? JSON.parse(options.body) : {});
  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken !== undefined) process.env.INPUT_GITHUB_TOKEN = originalToken;
    else delete process.env.INPUT_GITHUB_TOKEN;
  }
}

test('unreadable monitored repositories are listed, qualified with the default org', async () => {
  await withFetch(
    (body) => {
      assert.match(body.query, /r0: repository\(owner: "acme", name: "app"\)/);
      assert.match(body.query, /r1: repository\(owner: "other", name: "private"\)/);
      return json({
        data: { r0: { id: 'R_1' }, r1: null },
        errors: [
          {
            type: 'NOT_FOUND',
            message: "Could not resolve to a Repository with the name 'other/private'.",
          },
        ],
      });
    },
    async () => {
      assert.deepStrictEqual(
        await api.getUnreadableRepositories('acme', ['app', 'other/private']),
        ['other/private']
      );
    }
  );
});

test('requireReadableRepositories fails with the repos and the token permissions to check', async () => {
  await withFetch(
    () =>
      json({
        data: { r0: null },
        errors: [
          { type: 'FORBIDDEN', message: 'Resource not accessible by personal access token' },
        ],
      }),
    async () => {
      await assert.rejects(
        () => api.requireReadableRepositories('acme', ['acme/secret']),
        (err) =>
          /cannot read 1 monitored repository\(s\): acme\/secret/.test(err.message) &&
          /needs Projects read and write on the board and read access to each monitored repository\. Use a fine-grained PAT .*, or a GitHub App installation token/.test(
            err.message
          )
      );
    }
  );
});

test('requireReadableRepositories passes when every repo is readable', async () => {
  await withFetch(
    () => json({ data: { r0: { id: 'R_1' }, r1: { id: 'R_2' } } }),
    async () => {
      await assert.doesNotReject(() => api.requireReadableRepositories('acme', ['a', 'b']));
    }
  );
});

test('a project the token cannot see fails with the token permissions to check', async () => {
  await withFetch(
    () => json({ data: { organization: { projectV2: null } } }),
    async () => {
      await assert.rejects(
        () => api.getProjectId('https://github.com/orgs/acme/projects/7'),
        /Cannot read project https:\/\/github\.com\/orgs\/acme\/projects\/7: it does not exist or the token cannot see it\. The token needs Projects read and write/
      );
    }
  );
});

test('a failed search fails the run instead of logging a warning', async () => {
  api.setProjectFields({ status: 'Status', sprint: 'Sprint' });
  await withFetch(
    () => json({ errors: [{ message: 'Search exploded' }] }),
    async () => {
      await assert.rejects(
        () => api.getRecentItems('acme', ['acme/app'], [], '2026-10-01T00:00:00Z'),
        /Search failed for "repo:acme\/app [^"]*": [\s\S]*Search exploded/
      );
    }
  );
});

test('the engine checks repository access before discovering items', () => {
  const index = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const check = index.indexOf('api.requireReadableRepositories(');
  assert.ok(check > 0, 'repository access check is missing');
  assert.ok(check < index.indexOf('api.getRecentItems('), 'access check must run before search');
  // An action run with no token fails instead of passing offline
  assert.match(
    index,
    /process\.env\.GITHUB_ACTIONS === 'true'[^\n]*\n\s*throw new Error\(api\.NO_TOKEN_MESSAGE\)/
  );
});

test('the github_token input wins over GITHUB_TOKEN', () => {
  assert.strictEqual(
    api.resolveToken({ INPUT_GITHUB_TOKEN: 'input', GITHUB_TOKEN: 'env', GITHUB_ACTIONS: 'true' }),
    'input'
  );
  assert.strictEqual(
    api.resolveToken({ INPUT_GITHUB_TOKEN: 'input', GITHUB_TOKEN: 'env' }),
    'input'
  );
});

test('an Actions run never falls back to GITHUB_TOKEN', () => {
  assert.strictEqual(api.resolveToken({ GITHUB_TOKEN: 'env', GITHUB_ACTIONS: 'true' }), '');
  assert.strictEqual(
    api.resolveToken({ INPUT_GITHUB_TOKEN: '  ', GITHUB_TOKEN: 'env', GITHUB_ACTIONS: 'true' }),
    ''
  );
});

test('the command line falls back to GITHUB_TOKEN when there is no input', () => {
  assert.strictEqual(api.resolveToken({ GITHUB_TOKEN: 'env' }), 'env');
  assert.strictEqual(api.resolveToken({ INPUT_GITHUB_TOKEN: '', GITHUB_TOKEN: 'env' }), 'env');
  assert.strictEqual(api.resolveToken({}), '');
});

test('no source reads GITHUB_TOKEN ahead of the input', () => {
  for (const file of ['../src/index.js', '../src/validate.js', '../src/github/api.js']) {
    const src = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /process\.env\.GITHUB_TOKEN \|\|/, file);
  }
});
