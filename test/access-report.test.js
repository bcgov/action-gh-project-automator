import test from 'node:test';
import assert from 'node:assert';
import * as api from '../src/github/api.js';

const json = (payload) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

// Answer project, write-permission and repository queries; record the tokens used
async function withBoard(
  { ownerTokens = new Map(), project = true, writable = true, unreadable = [] },
  fn
) {
  const tokens = [];
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.INPUT_GITHUB_TOKEN;
  process.env.INPUT_GITHUB_TOKEN = 'default-token-value';
  api.setOwnerTokens(ownerTokens, 'acme');
  globalThis.fetch = async (url, options) => {
    tokens.push(new Headers(options?.headers).get('authorization'));
    const { query } = JSON.parse(options.body);
    if (query.includes('projectV2(number')) {
      return json({ data: { organization: { projectV2: project ? { id: 'P_1' } : null } } });
    }
    if (query.includes('viewerCanUpdate')) {
      return json({ data: { node: { viewerCanUpdate: writable } } });
    }
    const data = {};
    for (const [, key, owner, name] of query.matchAll(
      /(r\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\)/g
    )) {
      data[key] = unreadable.includes(`${owner}/${name}`) ? null : { id: key };
    }
    return json({ data });
  };
  try {
    return await fn(tokens);
  } finally {
    globalThis.fetch = originalFetch;
    api.setOwnerTokens(new Map(), null);
    if (originalToken !== undefined) process.env.INPUT_GITHUB_TOKEN = originalToken;
    else delete process.env.INPUT_GITHUB_TOKEN;
  }
}

const options = {
  projectUrl: 'https://github.com/orgs/acme/projects/7',
  org: 'acme',
  repos: ['app', 'other/lib'],
  allowedOrgs: ['acme', 'partner'],
};

test('the access check reports one line per project, organization and repository', async () => {
  const result = await withBoard({}, () => api.checkAccess(options));
  assert.strictEqual(result.projectId, 'P_1');
  assert.deepStrictEqual(result.lines, [
    'project acme/7 via github_token: OK',
    'org acme via github_token: OK',
    'org other via github_token: OK',
    'org partner via github_token: OK',
    'repo acme/app via github_token: OK',
    'repo other/lib via github_token: OK',
  ]);
  assert.deepStrictEqual(result.failures, []);
  assert.doesNotThrow(() => api.requireAccess(result));
});

test('the access check names the token for each owner and never its value', async () => {
  const ownerTokens = new Map([['other', { variable: 'OTHER_TOKEN', token: 'other-token-value' }]]);
  const result = await withBoard({ ownerTokens, unreadable: ['other/lib'] }, () =>
    api.checkAccess(options)
  );
  assert.ok(result.lines.includes('org other via OTHER_TOKEN: cannot read 1 of 1 repositories'));
  assert.ok(
    result.lines.includes(
      'repo other/lib via OTHER_TOKEN: cannot read; needs Metadata, Issues and Pull requests read'
    )
  );
  assert.ok(result.lines.includes('repo acme/app via github_token: OK'));
  const text = result.lines.join('\n');
  assert.ok(!text.includes('token-value'));
});

test('every failure is listed, not just the first', async () => {
  const result = await withBoard({ project: false, unreadable: ['acme/app', 'other/lib'] }, () =>
    api.checkAccess(options)
  );
  assert.strictEqual(result.projectId, null);
  assert.strictEqual(result.failures.length, 5); // project, two orgs, two repos
  assert.throws(
    () => api.requireAccess(result),
    (err) =>
      /Access check failed \(5\)/.test(err.message) &&
      /project acme\/7 via github_token: cannot read; needs Projects read and write/.test(
        err.message
      ) &&
      /repo acme\/app/.test(err.message) &&
      /repo other\/lib/.test(err.message)
  );
});

test('a read-only project token fails the check', async () => {
  const result = await withBoard({ writable: false }, () => api.checkAccess(options));
  assert.deepStrictEqual(result.failures, [
    'project acme/7 via github_token: read only; needs Projects read and write',
  ]);
});
