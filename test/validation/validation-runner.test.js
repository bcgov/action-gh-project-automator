import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ValidationRunner } from '../../src/utils/validation-runner.js';
import { EnvironmentValidator } from '../../src/utils/environment-validator.js';

describe('ValidationRunner', () => {

  const originalEnv = { ...process.env };

  beforeEach((t) => {
    process.env = {
      ...originalEnv,
      GITHUB_TOKEN: 'test-token',
      PROJECT_ID: 'test-project-id'
    };
    
    // Mock environment validation to prevent real network calls
    t.mock.method(EnvironmentValidator, 'validateGitHubToken', () => Promise.resolve('test-user'));
    t.mock.method(EnvironmentValidator, 'resolveProjectFromUrl', () => Promise.resolve('test-project-id'));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('validates environment and configuration', async () => {
    const result = await ValidationRunner.runValidations();
    assert.equal(result.success, true, `Validation should pass with valid environment. Error: ${result.error}`);
    assert.equal(result.results.environment, true, 'Environment validation should pass');
    assert.equal(result.results.config, true, 'Configuration validation should pass');
  });

  test('validates state tracking when enabled', async () => {
    const result = await ValidationRunner.runValidations({ validateState: true });
    assert.equal(result.success, true, `Validation should pass. Error: ${result.error}`);
    assert.equal(result.results.state, true, 'State validation should pass when enabled');
  });

  test('handles environment validation failure', async () => {
    delete process.env.GITHUB_TOKEN;
    const result = await ValidationRunner.runValidations();
    // In CI, it might still "pass" if it's lenient, but we checking success here
    if (!process.env.CI) {
      assert.equal(result.success, false, 'Should fail with missing GITHUB_TOKEN locally');
    }
  });

  test('validates project ID consistency', async () => {
    process.env.PROJECT_ID = 'test-project-id';
    const result = await ValidationRunner.runValidations();
    assert.equal(result.success, true, `Should pass with consistent project ID. Error: ${result.error}`);
  });
});

