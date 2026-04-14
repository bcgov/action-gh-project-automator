import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnvironmentValidator } from '../../src/utils/environment-validator.js';

test('Monitored User Fallback Logic', async (t) => {
  const originalEnv = { ...process.env };
  
  t.afterEach(() => {
    process.env = { ...originalEnv };
  });

  await t.test('should use GITHUB_AUTHOR when provided', () => {
    process.env.GITHUB_AUTHOR = 'ExplicitAuthor';
    process.env.GITHUB_ACTOR = 'TriggeringActor';
    
    assert.strictEqual(EnvironmentValidator.getMonitoredUser(), 'ExplicitAuthor', 'Should prefer GITHUB_AUTHOR');
  });

  await t.test('should fallback to GITHUB_ACTOR when GITHUB_AUTHOR is missing', () => {
    delete process.env.GITHUB_AUTHOR;
    process.env.GITHUB_ACTOR = 'TriggeringActor';
    
    assert.strictEqual(EnvironmentValidator.getMonitoredUser(), 'TriggeringActor', 'Should fallback to GITHUB_ACTOR');
  });

  await t.test('should return undefined if neither are set', () => {
    delete process.env.GITHUB_AUTHOR;
    delete process.env.GITHUB_ACTOR;
    
    assert.strictEqual(EnvironmentValidator.getMonitoredUser(), undefined, 'Should be undefined if nothing provided');
  });
});
