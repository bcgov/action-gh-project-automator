import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RuleValidation } from '../../src/rules/processors/validation.js';

describe('RuleValidation - Ludicrous Coverage', () => {
    let validator;

    beforeEach(async () => {
        validator = new RuleValidation();
        // Populate the validator manually to ensure skip/condition checks work
        validator.ensureConfig = async () => {
            validator.monitoredUsers = new Set(['test-user', 'another-user']);
            validator.monitoredRepos = new Set(['bcgov/some-repo', 'other-org/other-repo']);
        };
        await validator.ensureConfig();
    });

    describe('Type Validation', () => {
        const testCases = [
            { type: 'PullRequest', item: { __typename: 'PullRequest' }, expected: true },
            { type: 'Issue', item: { __typename: 'Issue' }, expected: true },
            { type: ['PullRequest', 'Issue'], item: { __typename: 'PullRequest' }, expected: true },
            { type: ['PullRequest', 'Issue'], item: { __typename: 'Issue' }, expected: true },
            { type: 'PullRequest', item: { __typename: 'Issue' }, expected: false },
            { type: ['PullRequest'], item: { __typename: 'Issue' }, expected: false },
        ];

        testCases.forEach(({ type, item, expected }) => {
            test(`should return ${expected} for type ${JSON.stringify(type)} on ${item.__typename}`, async () => {
                const result = await validator.validateItemCondition(item, { type });
                assert.equal(result, expected);
            });
        });
    });

    describe('Condition Whitelist', () => {
        const item = {
            __typename: 'PullRequest',
            author: { login: 'test-user' },
            repository: { nameWithOwner: 'bcgov/some-repo' },
            column: 'New',
            assignees: { nodes: [{ login: 'test-user' }] },
            sprint: 'current',
            pr: { closed: false, merged: true, column: 'New', assignees: { nodes: [{ login: 'test-user' }] } }
        };

        const conditions = [
            { cond: "monitored.users.includes(item.author)", expected: true },
            { cond: "monitored.users.includes(item.author)", item: { author: { login: 'other' } }, expected: false },
            { cond: "monitored.repos.includes(item.repository)", expected: true },
            { cond: "monitored.repos.includes(item.repository)", item: { repository: { nameWithOwner: 'other/repo' } }, expected: false },
            { cond: "!item.column", item: { column: null }, expected: true },
            { cond: "!item.column", item: { column: 'None' }, expected: true },
            { cond: "!item.column", item: { column: 'Active' }, expected: false },
            { cond: "item.column === 'New'", expected: true },
            { cond: "item.column === \"New\"", expected: true },
            { cond: "item.column === 'Next' || item.column === 'Active'", item: { column: 'Next' }, expected: true },
            { cond: "item.column === 'Next' || item.column === 'Active'", item: { column: 'Active' }, expected: true },
            { cond: "item.column === 'Done'", item: { column: 'Done' }, expected: true },
            { cond: "item.column === 'Waiting'", item: { column: 'Waiting' }, expected: true },
            { cond: "item.column === 'New' || item.column === 'Parked' || item.column === 'Backlog'", item: { column: 'Parked' }, expected: true },
            { cond: "item.sprint === 'current'", expected: true },
            { cond: "!item.pr.closed || item.pr.merged", expected: true },
            { cond: "item.column === item.pr.column && item.assignees === item.pr.assignees", expected: true },
            { cond: "item.assignees.includes(item.author)", expected: true },
            { cond: "unknown condition", expected: false }
        ];

        conditions.forEach(({ cond, item: overrideItem, expected }) => {
            test(`condition "${cond}" should return ${expected}`, async () => {
                const result = await validator.validateItemCondition(overrideItem || item, { condition: cond });
                assert.equal(result, expected);
            });
        });
    });

    describe('Skip Rules Whitelist', () => {
        const item = {
            column: 'New',
            projectItems: { nodes: [{ id: '1' }] },
            sprint: 'current',
            author: { login: 'test-user' },
            assignees: { nodes: [{ login: 'test-user' }] }
        };

        const skipRules = [
            { rule: "item.inProject", expected: true },
            { rule: "item.inProject", item: { projectItems: { nodes: [] } }, expected: false },
            { rule: "item.column !== 'New'", expected: false },
            { rule: "item.column !== 'New'", item: { column: 'Active' }, expected: true },
            { rule: "item.column", expected: true },
            { rule: "item.column", item: { column: 'None' }, expected: false },
            { rule: "item.sprint === 'current'", expected: true },
            { rule: "item.sprint === \"current\"", expected: true },
            { rule: "item.sprint != null", expected: true },
            { rule: "item.sprint != null", item: { sprint: null }, expected: false },
            { rule: "item.sprint == null", expected: false },
            { rule: "item.sprint == null", item: { sprint: null }, expected: true },
            { rule: "item.assignees.includes(item.author)", expected: true },
            { rule: "unknown skip", expected: false }
        ];

        skipRules.forEach(({ rule, item: overrideItem, expected }) => {
            test(`skip rule "${rule}" should return ${expected}`, async () => {
                const result = await validator.validateSkipRule(overrideItem || item, rule);
                assert.equal(result, expected);
            });
        });
    });

    describe('Error Handling', () => {
        test('should handle null items gracefully in validateItemCondition', async () => {
            const result = await validator.validateItemCondition(null, { condition: 'any' });
            assert.equal(result, false);
        });

        test('should handle null items gracefully in validateSkipRule', async () => {
            const result = await validator.validateSkipRule(null, 'any');
            assert.equal(result, false);
        });
    });
});
