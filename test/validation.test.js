import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getConfiguredColumns, validateBoardColumns } from '../src/utils/column-assignment.js';
import { validate } from '../src/validate.js';
import { updateItemColumn } from '../src/github/api.js';

test('getConfiguredColumns extracts unique columns and ignores "keep"', () => {
  const config = {
    board_columns: {
      locked: ['Waiting', 'Parked'],
      pull_request: {
        ready: 'Active',
        draft: 'keep',
        draft_no_status: 'New',
      },
      linked_issue: {
        ready: 'Active',
        draft: 'keep',
        closed: 'Next',
      },
      issue: {
        no_status: 'New',
      },
    },
    sprints: {
      assign_current: ['Active', 'Next', 'Done'],
      assign_current_if_empty: ['Waiting'],
      clear: ['New', 'Parked', 'Backlog'],
    },
  };

  const columns = getConfiguredColumns(config);
  assert.ok(!columns.includes('keep'));
  const expected = ['Waiting', 'Parked', 'Active', 'New', 'Next', 'Done', 'Backlog'];
  for (const exp of expected) {
    assert.ok(columns.includes(exp), `Expected column "${exp}" to be present`);
  }
  assert.strictEqual(columns.length, expected.length);
});

test('getConfiguredColumns handles configuration without sprints', () => {
  const config = {
    board_columns: {
      locked: ['Waiting'],
      pull_request: {
        ready: 'Active',
        draft: 'keep',
        draft_no_status: 'New',
      },
      linked_issue: {
        ready: 'Active',
        draft: 'keep',
        closed: 'Next',
      },
      issue: {
        no_status: 'New',
      },
    },
  };

  const columns = getConfiguredColumns(config);
  assert.deepStrictEqual(columns.sort(), ['Active', 'New', 'Next', 'Waiting'].sort());
});

test('validateBoardColumns succeeds when all columns exist on board', () => {
  const statusOptions = [
    { id: '1', name: 'New' },
    { id: '2', name: 'Active' },
    { id: '3', name: 'Done' },
  ];
  assert.doesNotThrow(() => validateBoardColumns(['New', 'Active'], statusOptions));
});

test('validateBoardColumns throws when statusOptions is empty', () => {
  assert.throws(
    () => validateBoardColumns(['Active'], []),
    /Project board has no status columns configured/
  );
});

test('validateBoardColumns throws and names missing columns and available options', () => {
  const statusOptions = [
    { id: '1', name: 'New' },
    { id: '2', name: 'Active' },
    { id: '3', name: 'Done' },
  ];
  assert.throws(
    () => validateBoardColumns(['Active', 'NonExistent', 'TypoCol'], statusOptions),
    (err) =>
      err.message.includes(
        'Status columns in rules.yml not found on project board: "NonExistent", "TypoCol"'
      ) && err.message.includes('Available columns: "New", "Active", "Done"')
  );
});

test('validate() executes offline syntax and schema check when no GITHUB_TOKEN', async () => {
  const originalToken = process.env.INPUT_GITHUB_TOKEN;
  delete process.env.INPUT_GITHUB_TOKEN;
  try {
    const result = await validate();
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.offline, true);
    assert.ok(result.config);
  } finally {
    if (originalToken !== undefined) process.env.INPUT_GITHUB_TOKEN = originalToken;
  }
});

test('validate() fails fast on invalid schema', async () => {
  const originalToken = process.env.INPUT_GITHUB_TOKEN;
  delete process.env.INPUT_GITHUB_TOKEN;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'val-'));
  const tmpFile = path.join(tmpDir, 'invalid-rules.yml');
  fs.writeFileSync(tmpFile, 'invalid_yaml: [}', 'utf8');

  try {
    await assert.rejects(() => validate({ configPath: tmpFile }), /YAMLException|YAML/i);
  } finally {
    if (originalToken !== undefined) process.env.INPUT_GITHUB_TOKEN = originalToken;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validate() verifies remote board and columns when credentials present', async () => {
  const originalToken = process.env.INPUT_GITHUB_TOKEN;
  process.env.INPUT_GITHUB_TOKEN = 'mock-token';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const body = options?.body ? JSON.parse(options.body) : {};
    if (body.query?.includes('organization(login: $org)')) {
      return new Response(
        JSON.stringify({
          data: {
            organization: {
              projectV2: { id: 'PVT_ONLINE_TEST' },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    if (body.query?.includes('repository(owner:')) {
      // Every monitored repository is readable
      const aliases = [...body.query.matchAll(/(r\d+): repository\(/g)].map((m) => m[1]);
      return new Response(
        JSON.stringify({ data: Object.fromEntries(aliases.map((a) => [a, { id: `R_${a}` }])) }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    if (body.query?.includes('node(id: $projectId)')) {
      return new Response(
        JSON.stringify({
          data: {
            node: {
              fields: {
                nodes: [
                  {
                    __typename: 'ProjectV2SingleSelectField',
                    id: 'PVTF_STATUS',
                    name: 'Status',
                    options: [
                      { id: '1', name: 'New' },
                      { id: '2', name: 'Active' },
                      { id: '3', name: 'Waiting' },
                      { id: '4', name: 'Parked' },
                      { id: '5', name: 'Next' },
                      { id: '6', name: 'Done' },
                      { id: '7', name: 'Backlog' },
                    ],
                  },
                  {
                    __typename: 'ProjectV2IterationField',
                    id: 'PVTF_SPRINT',
                    name: 'Sprint',
                    configuration: { iterations: [], completedIterations: [] },
                  },
                ],
              },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    if (body.query?.includes('viewerCanUpdate')) {
      return new Response(JSON.stringify({ data: { node: { viewerCanUpdate: true } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (body.query?.includes('repository(owner:')) {
      const aliases = [...body.query.matchAll(/(r\d+): repository\(/g)].map((m) => m[1]);
      return new Response(
        JSON.stringify({ data: Object.fromEntries(aliases.map((a) => [a, { id: `R_${a}` }])) }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ data: {} }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const result = await validate({ dryRun: false });
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.offline, false);
    assert.strictEqual(result.projectId, 'PVT_ONLINE_TEST');
    assert.strictEqual(result.meta.statusFieldId, 'PVTF_STATUS');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken !== undefined) {
      process.env.INPUT_GITHUB_TOKEN = originalToken;
    } else {
      delete process.env.INPUT_GITHUB_TOKEN;
    }
  }
});

test('validate() rejects when board is missing required status columns', async () => {
  const originalToken = process.env.INPUT_GITHUB_TOKEN;
  process.env.INPUT_GITHUB_TOKEN = 'mock-token';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const body = options?.body ? JSON.parse(options.body) : {};
    if (body.query?.includes('organization(login: $org)')) {
      return new Response(
        JSON.stringify({
          data: {
            organization: {
              projectV2: { id: 'PVT_ONLINE_TEST_MISSING' },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    if (body.query?.includes('node(id: $projectId)')) {
      return new Response(
        JSON.stringify({
          data: {
            node: {
              fields: {
                nodes: [
                  {
                    __typename: 'ProjectV2SingleSelectField',
                    id: 'PVTF_STATUS',
                    name: 'Status',
                    options: [{ id: '1', name: 'OnlyNew' }],
                  },
                ],
              },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    if (body.query?.includes('viewerCanUpdate')) {
      return new Response(JSON.stringify({ data: { node: { viewerCanUpdate: true } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (body.query?.includes('repository(owner:')) {
      const aliases = [...body.query.matchAll(/(r\d+): repository\(/g)].map((m) => m[1]);
      return new Response(
        JSON.stringify({ data: Object.fromEntries(aliases.map((a) => [a, { id: `R_${a}` }])) }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ data: {} }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    await assert.rejects(
      () => validate({ dryRun: false }),
      /Status columns in rules\.yml not found on project board/
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken !== undefined) {
      process.env.INPUT_GITHUB_TOKEN = originalToken;
    } else {
      delete process.env.INPUT_GITHUB_TOKEN;
    }
  }
});

test('updateItemColumn in DRY_RUN mode validates column existence before logging', async () => {
  const originalDryRun = process.env.DRY_RUN;
  const originalToken = process.env.INPUT_GITHUB_TOKEN;
  process.env.DRY_RUN = 'true';
  process.env.INPUT_GITHUB_TOKEN = 'mock-token';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({
        data: {
          node: {
            fields: {
              nodes: [
                {
                  __typename: 'ProjectV2SingleSelectField',
                  id: 'PVTF_STATUS',
                  name: 'Status',
                  options: [{ id: '1', name: 'ValidCol' }],
                },
              ],
            },
          },
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  try {
    // Valid column succeeds in dry run
    await assert.doesNotReject(() => updateItemColumn('PVT_DRY', 'ITEM_1', 'ValidCol'));

    // Non-existent column rejects even in dry run
    await assert.rejects(
      () => updateItemColumn('PVT_DRY', 'ITEM_1', 'NoSuchCol'),
      /Column "NoSuchCol" not found on the project board/
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env.DRY_RUN = originalDryRun;
    if (originalToken !== undefined) {
      process.env.INPUT_GITHUB_TOKEN = originalToken;
    } else {
      delete process.env.INPUT_GITHUB_TOKEN;
    }
  }
});

test('getConfiguredColumns preserves exact column names without trimming', () => {
  const config = {
    board_columns: {
      locked: [' Waiting '],
      pull_request: {
        ready: ' Active ',
        draft: 'keep',
        draft_no_status: ' New ',
      },
      linked_issue: {
        ready: ' Active ',
        draft: 'keep',
        closed: ' Next ',
      },
      issue: {
        no_status: ' New ',
      },
    },
    sprints: {
      assign_current: [' Done '],
      assign_current_if_empty: [' Waiting '],
      clear: [' Backlog '],
    },
  };

  const columns = getConfiguredColumns(config);
  assert.ok(columns.includes(' Waiting '));
  assert.ok(columns.includes(' Active '));
  assert.ok(columns.includes(' New '));
  assert.ok(columns.includes(' Next '));
  assert.ok(columns.includes(' Done '));
  assert.ok(columns.includes(' Backlog '));
  assert.strictEqual(columns.includes('Active'), false);
});

test('validate() with dryRun propagates engine failures to caller', async () => {
  const originalToken = process.env.INPUT_GITHUB_TOKEN;
  process.env.INPUT_GITHUB_TOKEN = 'mock-token';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const body = options?.body ? JSON.parse(options.body) : {};
    if (body.query?.includes('organization(login: $org)')) {
      return new Response(
        JSON.stringify({
          data: {
            organization: { projectV2: { id: 'PVT_ERR_TEST' } },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    // Fail getProjectMetadata during dry-run execution
    return new Response(JSON.stringify({ errors: [{ message: 'GraphQL failure' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    await assert.rejects(() => validate({ dryRun: true }), /GraphQL failure/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken !== undefined) {
      process.env.INPUT_GITHUB_TOKEN = originalToken;
    } else {
      delete process.env.INPUT_GITHUB_TOKEN;
    }
  }
});
