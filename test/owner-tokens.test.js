import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as yaml from 'js-yaml';
import * as api from '../src/github/api.js';
import { buildSearchQueries } from '../src/github/queries.js';
import { loadBoardRules } from '../src/config/board-rules.js';
import { captureOutput } from './helpers/capture-output.js';

const json = (payload) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const shipped = yaml.load(fs.readFileSync(new URL('../rules.yml', import.meta.url), 'utf8'));
function writeRules(mutate) {
  const config = structuredClone(shipped);
  mutate(config);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rules-')), 'rules.yml');
  fs.writeFileSync(file, yaml.dump(config));
  return file;
}

// Record each GraphQL call with the token it was sent with
async function recordCalls(ownerTokens, projectOwner, fn, respond = () => ({ data: {} })) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.INPUT_GITHUB_TOKEN;
  process.env.INPUT_GITHUB_TOKEN = 'default-token';
  api.setProjectFields({ status: 'Status' });
  api.setOwnerTokens(ownerTokens, projectOwner);
  globalThis.fetch = async (url, options) => {
    const headers = new Headers(options?.headers);
    const body = options?.body ? JSON.parse(options.body) : {};
    const call = { token: headers.get('authorization')?.replace(/^(bearer|token) /i, ''), body };
    calls.push(call);
    const reply = respond(call);
    return reply instanceof Response ? reply : json(reply);
  };
  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
    api.setOwnerTokens(new Map(), null);
    if (originalToken !== undefined) process.env.INPUT_GITHUB_TOKEN = originalToken;
    else delete process.env.INPUT_GITHUB_TOKEN;
  }
  return calls;
}

const badCredentials = () =>
  new Response(JSON.stringify({ message: 'test: simulated Bad credentials' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });

const emptySearch = (call) =>
  call.body.query.includes('search(')
    ? { data: { search: { nodes: [], pageInfo: { hasNextPage: false } } } }
    : { data: {} };

test('resolveOwnerTokens maps each owner to its variable', () => {
  const tokens = api.resolveOwnerTokens(
    { bcgov: 'BCGOV_TOKEN', 'BCGov-C': 'BCGOV_C_TOKEN' },
    { BCGOV_TOKEN: 'a', BCGOV_C_TOKEN: ' b ' }
  );
  assert.deepStrictEqual(tokens.get('bcgov'), { variable: 'BCGOV_TOKEN', token: 'a' });
  assert.deepStrictEqual(tokens.get('bcgov-c'), { variable: 'BCGOV_C_TOKEN', token: 'b' });
  assert.strictEqual(api.resolveOwnerTokens({}, {}).size, 0);
  assert.strictEqual(api.resolveOwnerTokens(undefined, {}).size, 0);
});

test('a mapped owner with an unset or empty variable is an error naming owner and variable', () => {
  assert.throws(
    () =>
      api.resolveOwnerTokens(
        { bcgov: 'BCGOV_TOKEN', other: 'OTHER_TOKEN', fine: 'FINE_TOKEN' },
        { BCGOV_TOKEN: '  ', FINE_TOKEN: 'secret-value' }
      ),
    (err) =>
      /owner "bcgov" \(environment variable BCGOV_TOKEN is unset or empty\)/.test(err.message) &&
      /owner "other" \(environment variable OTHER_TOKEN is unset or empty\)/.test(err.message) &&
      !err.message.includes('secret-value')
  );
});

test('tokens is optional in rules.yml and means none', () => {
  const config = loadBoardRules(writeRules(() => {}));
  assert.deepStrictEqual(config.tokens, {});
});

test('tokens maps owners to environment variable names', () => {
  const config = loadBoardRules(
    writeRules((c) => {
      c.tokens = { 'bcgov-c': 'BCGOV_C_TOKEN' };
    })
  );
  assert.deepStrictEqual(config.tokens, { 'bcgov-c': 'BCGOV_C_TOKEN' });
  assert.throws(
    () =>
      loadBoardRules(
        writeRules((c) => {
          c.tokens = { bcgov: 'not a variable' };
        })
      ),
    /tokens/
  );
});

test('without tokens every search uses the default token and the same queries as before', async () => {
  const repos = ['bcgov/a', 'bcgov-c/b', 'DerekRoberts/c'];
  const since = '2026-10-01T00:00:00Z';
  const calls = await recordCalls(
    new Map(),
    'bcgov',
    () =>
      api.getRecentItems('bcgov', repos, ['someone'], since, { allowedOrgs: ['bcgov', 'bcgov-c'] }),
    emptySearch
  );
  const expected = buildSearchQueries({ org: 'bcgov', repos, monitoredUsers: ['someone'], since });
  assert.deepStrictEqual(
    calls.map((c) => c.body.variables.searchQuery),
    [...expected.repoQueries, ...expected.userQueries]
  );
  assert.ok(calls.every((c) => c.token === 'default-token'));
});

test('a mapped owner is searched with its own token; others use the default', async () => {
  const tokens = new Map([['bcgov-c', { variable: 'BCGOV_C_TOKEN', token: 'c-token' }]]);
  const calls = await recordCalls(
    tokens,
    'bcgov',
    () =>
      api.getRecentItems('bcgov', ['bcgov/a', 'bcgov-c/b'], ['someone'], null, {
        allowedOrgs: ['bcgov', 'bcgov-c'],
      }),
    emptySearch
  );
  const byToken = (token) =>
    calls.filter((c) => c.token === token).map((c) => c.body.variables.searchQuery);
  assert.ok(byToken('c-token').some((q) => q.includes('repo:bcgov-c/b')));
  assert.ok(byToken('c-token').every((q) => !q.includes('repo:bcgov/a')));
  assert.ok(byToken('default-token').some((q) => q.includes('repo:bcgov/a')));
  assert.ok(byToken('default-token').every((q) => !q.includes('repo:bcgov-c/b')));
  // User searches for the mapped organization run with its token, limited to it
  assert.ok(byToken('c-token').some((q) => /^author:someone .* org:bcgov-c$/.test(q)));
  assert.ok(byToken('default-token').every((q) => !q.includes('org:')));
});

test('default-token user results drop items owned by a mapped owner', async () => {
  const tokens = new Map([['bcgov-c', { variable: 'BCGOV_C_TOKEN', token: 'c-token' }]]);
  const node = (id, repo) => ({ __typename: 'Issue', id, repository: { nameWithOwner: repo } });
  let items;
  await recordCalls(
    tokens,
    'bcgov',
    async () => {
      items = await api.getRecentItems('bcgov', [], ['someone'], null, {
        allowedOrgs: ['bcgov', 'bcgov-c'],
      });
    },
    (call) => {
      const q = call.body.variables.searchQuery;
      const nodes =
        call.token === 'default-token'
          ? [node('1', 'bcgov/a'), node('2', 'bcgov-c/b')]
          : q.includes('org:bcgov-c')
            ? [node('3', 'bcgov-c/b')]
            : [];
      return { data: { search: { nodes, pageInfo: { hasNextPage: false } } } };
    }
  );
  assert.deepStrictEqual(items.map((i) => i.id).sort(), ['1', '3']);
});

test('repository access is checked with each owner token', async () => {
  const tokens = new Map([['bcgov-c', { variable: 'BCGOV_C_TOKEN', token: 'c-token' }]]);
  const calls = await recordCalls(
    tokens,
    'bcgov',
    () => api.requireReadableRepositories('bcgov', ['bcgov/a', 'bcgov-c/b']),
    (call) => ({
      data: Object.fromEntries(
        [...call.body.query.matchAll(/(r\d+): repository/g)].map(([, k]) => [k, { id: k }])
      ),
    })
  );
  assert.strictEqual(calls.length, 2);
  assert.match(calls.find((c) => c.token === 'c-token').body.query, /owner: "bcgov-c"/);
  assert.doesNotMatch(calls.find((c) => c.token === 'default-token').body.query, /bcgov-c/);
});

test('board calls use the project owner token', async () => {
  const tokens = new Map([['bcgov', { variable: 'BCGOV_TOKEN', token: 'b-token' }]]);
  const calls = await recordCalls(
    tokens,
    'bcgov',
    () => api.getProjectId('https://github.com/orgs/bcgov/projects/16'),
    () => ({ data: { organization: { projectV2: { id: 'P_1' } } } })
  );
  assert.deepStrictEqual(
    calls.map((c) => c.token),
    ['b-token']
  );
  assert.strictEqual(api.tokenNameFor('bcgov'), 'github_token'); // reset after the call
});

test('an unusable token is reported and the access check continues', async () => {
  const tokens = new Map([['bcgov-c', { variable: 'BCGOV_C_TOKEN', token: 'c-token' }]]);
  let result;
  const output = await captureOutput(() =>
    recordCalls(
      tokens,
      'bcgov',
      async () => {
        result = await api.checkAccess({
          projectUrl: 'https://github.com/orgs/bcgov/projects/16',
          org: 'bcgov',
          repos: ['bcgov/a', 'bcgov-c/b'],
        });
      },
      (call) => {
        if (call.token === 'c-token') return badCredentials();
        if (call.body.query.includes('projectV2(number'))
          return { data: { organization: { projectV2: { id: 'P_1' } } } };
        if (call.body.query.includes('viewerCanUpdate'))
          return { data: { node: { viewerCanUpdate: true } } };
        return {
          data: Object.fromEntries(
            [...call.body.query.matchAll(/(r\d+): repository/g)].map(([, k]) => [k, { id: k }])
          ),
        };
      }
    )
  );
  assert.match(output, /test: simulated Bad credentials/);
  assert.strictEqual(result.projectId, 'P_1');
  assert.ok(
    result.failures.some((l) => /^token BCGOV_C_TOKEN via BCGOV_C_TOKEN: unusable/.test(l))
  );
  assert.ok(result.failures.some((l) => /^repo bcgov-c\/b via BCGOV_C_TOKEN: cannot read/.test(l)));
  assert.ok(result.lines.includes('repo bcgov/a via github_token: OK'));
});

test('linked issues another token can see are combined with the PR owner token results', async () => {
  const tokens = new Map([['bcgov-c', { variable: 'BCGOV_C_TOKEN', token: 'c-token' }]]);
  const issue = (id, repo) => ({
    id,
    number: 1,
    title: id,
    state: 'OPEN',
    repository: { nameWithOwner: repo },
    labels: { nodes: [] },
    projectItems: { nodes: [] },
  });
  let issues;
  const calls = await recordCalls(
    tokens,
    'bcgov',
    async () => {
      issues = await api.fetchLinkedIssuesForPullRequest('PR_1', 'P_1', 'bcgov/a');
    },
    (call) =>
      call.token === 'default-token'
        ? { data: { node: { closingIssuesReferences: { nodes: [issue('I_a', 'bcgov/a')] } } } }
        : {
            data: {
              node: {
                closingIssuesReferences: {
                  nodes: [issue('I_a', 'bcgov/a'), issue('I_c', 'bcgov-c/b')],
                },
              },
            },
          }
  );
  assert.deepStrictEqual(
    calls.map((c) => c.token),
    ['default-token', 'c-token']
  );
  assert.deepStrictEqual(
    issues.map((i) => i.id),
    ['I_a', 'I_c']
  );
});

test('a failing extra token does not hide the PR owner token linked issues', async () => {
  const tokens = new Map([['bcgov-c', { variable: 'BCGOV_C_TOKEN', token: 'c-token' }]]);
  let issues;
  const output = await captureOutput(() =>
    recordCalls(
      tokens,
      'bcgov',
      async () => {
        issues = await api.fetchLinkedIssuesForPullRequest('PR_1', 'P_1', 'bcgov/a');
      },
      (call) =>
        call.token === 'c-token'
          ? badCredentials()
          : { data: { node: { closingIssuesReferences: { nodes: [] } } } }
    )
  );
  assert.match(output, /test: simulated Bad credentials/);
  assert.deepStrictEqual(issues, []);
});
