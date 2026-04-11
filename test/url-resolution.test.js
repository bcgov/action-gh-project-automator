import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EnvironmentValidator } from '../src/utils/environment-validator.js';

describe('URL resolution functionality', () => {
    test('Valid GitHub project URL format', () => {
        const validUrl = 'https://github.com/orgs/bcgov/projects/16';
        const urlMatch = validUrl.match(/^https:\/\/github\.com\/orgs\/([^\/]+)\/projects\/(\d+)$/);
        
        assert.ok(urlMatch, 'Should match valid GitHub project URL format');
        assert.strictEqual(urlMatch[1], 'bcgov', 'Should extract organization name');
        assert.strictEqual(urlMatch[2], '16', 'Should extract project number');
    });

    test('Invalid URL formats', () => {
        const invalidUrls = [
            'https://github.com/bcgov/projects/16', // Missing /orgs/
            'https://github.com/orgs/bcgov/projects/', // Missing project number
            'https://github.com/orgs/bcgov/projects/abc', // Non-numeric project number
            'https://github.com/orgs/bcgov/projects/16/extra', // Extra path segments
            'https://example.com/orgs/bcgov/projects/16', // Wrong domain
        ];
        
        for (const invalidUrl of invalidUrls) {
            const match = invalidUrl.match(/^https:\/\/github\.com\/orgs\/([^\/]+)\/projects\/(\d+)$/);
            assert.ok(!match, `Should not match invalid URL: ${invalidUrl}`);
        }
    });

    test('resolveProjectFromUrl method validation', async () => {
        assert.strictEqual(typeof EnvironmentValidator.resolveProjectFromUrl, 'function', 
            'resolveProjectFromUrl method should exist');
        
        // Test that it throws for invalid URLs
        await assert.rejects(
            async () => await EnvironmentValidator.resolveProjectFromUrl('invalid-url'),
            /Invalid project URL format/,
            'Should throw appropriate error for invalid URL'
        );
    });
});
