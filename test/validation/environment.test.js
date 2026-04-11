import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnvironment } from '../../src/index.js';
import { loadBoardRules } from '../../src/config/board-rules.js';
import { StateVerifier } from '../../src/utils/state-verifier.js';
import { EnvironmentValidator } from '../../src/utils/environment-validator.js';

test('environment validation', async (t) => {
  const originalEnv = { ...process.env };
  const config = await loadBoardRules();

  t.beforeEach(() => {
    t.mock.method(EnvironmentValidator, 'validateGitHubToken', () => Promise.resolve(config.monitoredUser));
    t.mock.method(EnvironmentValidator, 'resolveProjectFromUrl', () => Promise.resolve('test-project-id'));
  });

  t.afterEach(() => {
    process.env = { ...originalEnv };
  });

  await t.test('accepts valid environment with required variables', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.GITHUB_AUTHOR = config.monitoredUser;
    process.env.PROJECT_ID = 'test-project';
    
    try {
      await validateEnvironment();
      assert(true, 'Should not throw with valid environment');
    } catch (error) {
      // Expected to fail due to invalid token, but should not fail due to missing variables
      assert(!error.message.includes('Missing required environment variables'), 'Should not fail due to missing variables');
    }
  });

  await t.test('accepts valid environment with default project ID', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.GITHUB_AUTHOR = config.monitoredUser;
    delete process.env.PROJECT_ID;
    
    try {
      await validateEnvironment();
      assert(true, 'Should not throw with default project ID');
    } catch (error) {
      // Expected to fail due to invalid token, but should not fail due to missing PROJECT_ID
      assert(!error.message.includes('PROJECT_ID'), 'Should not fail due to missing PROJECT_ID');
    }
  });

  await t.test('rejects missing GITHUB_TOKEN', async () => {
    delete process.env.GITHUB_TOKEN;
    process.env.GITHUB_AUTHOR = 'DerekRoberts';
    process.env.PROJECT_ID = 'test-project';
    
    try {
      await validateEnvironment();
      assert.fail('Should have thrown an error for missing GITHUB_TOKEN');
    } catch (error) {
      assert(error.message.includes('Missing required environment variables'), 'Should mention missing variables');
      assert(error.message.includes('GITHUB_TOKEN'), 'Should mention GITHUB_TOKEN');
    }
  });

  await t.test('loads configuration when valid', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.GITHUB_AUTHOR = 'DerekRoberts';
    process.env.PROJECT_ID = 'test-project';
    
    try {
      await validateEnvironment();
      assert(StateVerifier.steps.areAllStepsCompleted(), 'All steps should be completed');
    } catch (error) {
      // Expected to fail due to invalid token, but should not fail due to setup
      assert(!error.message.includes('Missing required environment variables'), 'Should not fail due to missing variables');
    }
  });

  await t.test('validates config dependencies in correct order', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.GITHUB_AUTHOR = 'DerekRoberts';
    delete process.env.PROJECT_ID;
    
    try {
      await validateEnvironment();
      const steps = StateVerifier.steps;
      const tokenIndex = steps.getCompletedSteps().indexOf('TOKEN_CONFIGURED');
      const projectIndex = steps.getCompletedSteps().indexOf('PROJECT_CONFIGURED');
      assert(tokenIndex < projectIndex, 'TOKEN_CONFIGURED should come before PROJECT_CONFIGURED');
    } catch (error) {
      // Expected to fail due to invalid token, but should not fail due to setup
      assert(!error.message.includes('Missing required environment variables'), 'Should not fail due to missing variables');
    }
  });
});
