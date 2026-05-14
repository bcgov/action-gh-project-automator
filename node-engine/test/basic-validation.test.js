import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { RuleValidation } from '../src/rules/processors/validation.js';

// Set up test environment
process.env.GITHUB_AUTHOR = 'DerekRoberts';

describe('Basic condition validation works', () => {
    test('RuleValidation correctly evaluates conditions', async () => {
        const validator = new RuleValidation();
        
        // Mock the config loading to avoid filesystem dependency
        mock.method(validator, 'ensureConfig', async () => {
            validator.monitoredUsers = new Set(['DerekRoberts']);
            validator.monitoredRepos = new Set(['bcgov/nr-nerds']);
            return {};
        });

        // Test 1: Author condition
        const prWithAuthor = {
            __typename: 'PullRequest',
            number: 123,
            author: { login: 'DerekRoberts' }
        };
        
        const result1 = await validator.validateItemCondition(prWithAuthor, {
            type: 'PullRequest',
            condition: 'monitored.users.includes(item.author)'
        });
        assert.equal(result1, true, 'Author condition should pass');
        
        // Test 2: Repository condition
        const prInRepo = {
            __typename: 'PullRequest',
            number: 124,
            repository: { nameWithOwner: 'bcgov/nr-nerds' }
        };
        
        const result2 = await validator.validateItemCondition(prInRepo, {
            type: 'PullRequest',
            condition: 'monitored.repos.includes(item.repository)'
        });
        assert.equal(result2, true, 'Repository condition should pass');
        
        // Test 3: Column condition
        const prNoColumn = {
            __typename: 'PullRequest',
            number: 125,
            column: null
        };
        
        const result3 = await validator.validateItemCondition(prNoColumn, {
            type: 'PullRequest',
            condition: '!item.column'
        });
        assert.equal(result3, true, 'No column condition should pass');
    });
});
