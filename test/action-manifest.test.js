import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { resolveConfigPath } from '../src/config/board-rules.js';
import { fetchRepoFile } from '../src/github/api.js';

const manifestPath = new URL('../action.yml', import.meta.url);
const manifest = yaml.load(fs.readFileSync(manifestPath, 'utf8'));

test('action.yml defines a standalone root node24 action pointing to dist/index.js', () => {
  assert.strictEqual(manifest.name, 'GitHub Project Automator');
  assert.strictEqual(manifest.runs.using, 'node24');
  assert.strictEqual(manifest.runs.main, 'dist/index.js');
});

test('action.yml defines required and optional inputs with standard defaults', () => {
  const { inputs } = manifest;

  assert.strictEqual(inputs.github_token.required, false);
  assert.strictEqual(inputs.github_token.default, '${{ github.token }}');

  assert.strictEqual(inputs.config_path.required, false);
  assert.strictEqual(inputs.config_path.default, 'rules.yml');

  assert.strictEqual(inputs.dry_run.required, false);
  assert.strictEqual(inputs.dry_run.default, 'false');
});

test('resolveConfigPath respects custom path and INPUT_CONFIG_PATH', () => {
  const shippedConfig = path.resolve(process.cwd(), 'rules.yml');
  assert.strictEqual(resolveConfigPath(), shippedConfig);

  // Explicit path
  assert.strictEqual(resolveConfigPath('rules.yml'), shippedConfig);

  // INPUT_CONFIG_PATH env var
  const originalInput = process.env.INPUT_CONFIG_PATH;
  try {
    process.env.INPUT_CONFIG_PATH = 'rules.yml';
    assert.strictEqual(resolveConfigPath(), shippedConfig);
  } finally {
    if (originalInput !== undefined) {
      process.env.INPUT_CONFIG_PATH = originalInput;
    } else {
      delete process.env.INPUT_CONFIG_PATH;
    }
  }

  // Non-existent path throws
  assert.throws(
    () => resolveConfigPath('non-existent-rules.yml'),
    /Configuration file not found: non-existent-rules\.yml/
  );
});

test('fetchRepoFile retrieves and decodes base64 file content without checkout', async () => {
  process.env.INPUT_GITHUB_TOKEN = 'test-token';
  const originalRepo = process.env.GITHUB_REPOSITORY;
  const originalFetch = globalThis.fetch;

  process.env.GITHUB_REPOSITORY = 'bcgov/test-repo';

  const mockYaml = 'project:\n  url: "https://github.com/orgs/bcgov/projects/16"\n';
  const base64Content = Buffer.from(mockYaml, 'utf8').toString('base64');

  globalThis.fetch = async (url) => {
    assert.match(url.toString(), /repos\/bcgov\/test-repo\/contents\/rules\.yml/);
    return new Response(
      JSON.stringify({
        content: base64Content,
        encoding: 'base64',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  try {
    const fetched = await fetchRepoFile('rules.yml');
    assert.strictEqual(fetched, mockYaml);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalRepo !== undefined) {
      process.env.GITHUB_REPOSITORY = originalRepo;
    } else {
      delete process.env.GITHUB_REPOSITORY;
    }
  }
});
