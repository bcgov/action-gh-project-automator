import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scaffoldConsumer } from '../scripts/init-consumer.js';
import { loadBoardRules } from '../src/config/board-rules.js';

test('scaffoldConsumer creates valid single-org consumer repository structure', () => {
  const tmpDir = path.resolve('.tmp', `test-scaffold-${Date.now()}`);
  try {
    const result = scaffoldConsumer({
      boardUrl: 'https://github.com/orgs/my-org/projects/5',
      repos: ['my-org/repo-a', 'my-org/repo-b'],
      users: ['alice'],
      outDir: tmpDir,
    });

    assert.strictEqual(result.tokenType, 'fine_grained');
    assert.strictEqual(result.inferredOrg, 'my-org');

    const expectedFiles = [
      'rules.yml',
      '.github/workflows/sync.yml',
      '.github/workflows/validate.yml',
      'README.md',
      '.gitignore',
    ];

    for (const file of expectedFiles) {
      assert.ok(fs.existsSync(path.join(tmpDir, file)), `File ${file} should exist`);
    }

    // Verify rules.yml passes schema validation
    const loadedConfig = loadBoardRules(path.join(tmpDir, 'rules.yml'));
    assert.strictEqual(loadedConfig.project.url, 'https://github.com/orgs/my-org/projects/5');
    assert.strictEqual(loadedConfig.project.organization, 'my-org');
    assert.deepStrictEqual(loadedConfig.monitoredUsers, ['alice']);
    assert.deepStrictEqual(loadedConfig.project.repositories, ['my-org/repo-a', 'my-org/repo-b']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('scaffoldConsumer detects multi-org configuration and recommends Fine-Grained PAT', () => {
  const tmpDir = path.resolve('.tmp', `test-scaffold-multiorg-${Date.now()}`);
  try {
    const result = scaffoldConsumer({
      boardUrl: 'https://github.com/orgs/bcgov/projects/16',
      repos: ['bcgov/actions', 'bcgov-c/nr-mof-db'],
      users: ['DerekRoberts'],
      outDir: tmpDir,
    });

    assert.strictEqual(result.tokenType, 'fine_grained');
    assert.strictEqual(result.isMultiOrg, true);
    assert.strictEqual(result.tokenUrl, 'https://github.com/settings/personal-access-tokens/new');

    const loadedConfig = loadBoardRules(path.join(tmpDir, 'rules.yml'));
    assert.ok(loadedConfig.project.allowedOrgs.includes('bcgov'));
    assert.ok(loadedConfig.project.allowedOrgs.includes('bcgov-c'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('scaffoldConsumer recommends Classic PAT only for user-owned boards', () => {
  const tmpDir = path.resolve('.tmp', `test-scaffold-userboard-${Date.now()}`);
  try {
    const result = scaffoldConsumer({
      boardUrl: 'https://github.com/users/alice/projects/1',
      repos: ['alice/repo-a'],
      users: ['alice'],
      outDir: tmpDir,
    });

    assert.strictEqual(result.tokenType, 'classic');
    assert.strictEqual(result.isUserBoard, true);
    assert.ok(result.tokenUrl.includes('scopes=project,repo'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('scripts/setup-consumer.sh bootstraps a valid consumer repository', () => {
  const tmpDir = path.resolve('.tmp', `test-bash-scaffold-${Date.now()}`);
  const scriptPath = path.resolve('scripts/setup-consumer.sh');
  try {
    execFileSync(scriptPath, [
      '--board',
      'https://github.com/orgs/bcgov/projects/16',
      '--repos',
      'bcgov/actions,bcgov-c/nr-mof-db',
      '--users',
      'DerekRoberts',
      '--dir',
      tmpDir,
      '--non-interactive',
    ]);

    assert.ok(fs.existsSync(path.join(tmpDir, 'rules.yml')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.github/workflows/sync.yml')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.github/workflows/validate.yml')));

    const loaded = loadBoardRules(path.join(tmpDir, 'rules.yml'));
    assert.strictEqual(loaded.project.url, 'https://github.com/orgs/bcgov/projects/16');
    assert.ok(loaded.project.allowedOrgs.includes('bcgov'));
    assert.ok(loaded.project.allowedOrgs.includes('bcgov-c'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
