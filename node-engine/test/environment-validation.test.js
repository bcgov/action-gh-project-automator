import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EnvironmentValidator } from '../src/utils/environment-validator.js';

describe('Environment validation', () => {
    test('Identifies missing required variables', async () => {
        const originalToken = process.env.GITHUB_TOKEN;
        const originalAuthor = process.env.GITHUB_AUTHOR;
        
        // Remove required variables
        delete process.env.GITHUB_TOKEN;
        delete process.env.GITHUB_AUTHOR;
        
        try {
            await EnvironmentValidator.validateAll();
            assert.fail('Should have thrown an error for missing variables');
        } catch (error) {
            assert.ok(error.message.includes('Missing required environment variables'));
            assert.ok(error.message.includes('GITHUB_TOKEN'));
            assert.ok(error.message.includes('GITHUB_AUTHOR'));
        } finally {
            // Restore variables
            process.env.GITHUB_TOKEN = originalToken;
            process.env.GITHUB_AUTHOR = originalAuthor;
        }
    });

    test('Validates required variables existence', () => {
        try {
            EnvironmentValidator.validateRequired();
            assert.ok(true, 'Required variables validation passed');
        } catch (error) {
            assert.ok(error.message.includes('Missing'), 'Error should be about missing variables');
        }
    });

    test('Validates optional variables and defaults', async () => {
        // Provide a dummy project ID to avoid validation failure
        const originalProjectId = process.env.PROJECT_ID;
        process.env.PROJECT_ID = 'test-project-id';
        
        try {
            const config = await EnvironmentValidator.validateOptional();
            assert.strictEqual(config.projectId, 'test-project-id', 'Should return project ID');
            assert.strictEqual(typeof config.verbose, 'boolean', 'Should return verbose flag');
            assert.strictEqual(typeof config.strictMode, 'boolean', 'Should return strict mode flag');
        } finally {
            if (originalProjectId) {
                process.env.PROJECT_ID = originalProjectId;
            } else {
                delete process.env.PROJECT_ID;
            }
        }
    });
});
