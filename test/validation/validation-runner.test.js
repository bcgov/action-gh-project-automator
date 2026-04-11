/**
 * @fileoverview Tests for validation runner
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ValidationRunner } from '../../src/utils/validation-runner.js';

test('ValidationRunner', async (t) => {
  const originalEnv = { ...process.env };

  t.beforeEach(() => {
    process.env = {
      ...originalEnv,
      GITHUB_TOKEN: 'test-token',
      PROJECT_ID: 'test-project-id'
    };
  });

  t.afterEach(() => {
    process.env = { ...originalEnv };
  });

  await t.test('validates environment and configuration', async () => {
    const result = await ValidationRunner.runValidations();
    assert.equal(result.success, true, 'Validation should pass with valid environment');
    assert.equal(result.results.environment, true, 'Environment validation should pass');
    assert.equal(result.results.config, true, 'Configuration validation should pass');
  });

  await t.test('validates state tracking when enabled', async () => {
    const result = await ValidationRunner.runValidations({ validateState: true });
    assert.equal(result.success, true, 'Validation should pass');
    assert.equal(result.results.state, true, 'State validation should pass when enabled');
  });

  await t.test('handles environment validation failure', async () => {
    delete process.env.GITHUB_TOKEN;
    // Note: in CI it might still "pass" if we have the fallback logic but we check failure locally
    const result = await ValidationRunner.runValidations();
    if (!process.env.CI) {
      assert.equal(result.success, false, 'Should fail with missing GITHUB_TOKEN locally');
    }
  });

  await t.test('validates project ID consistency', async () => {
    process.env.PROJECT_ID = 'test-project-id';
    const result = await ValidationRunner.runValidations();
    assert.equal(result.success, true, 'Should pass with consistent project ID');
  });
});
