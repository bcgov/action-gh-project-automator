import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { processBoardItemRules } from '../src/rules/processors/unified-rule-processor.js';

describe('Rule processing integration', () => {
    test('Rule processing works with basic conditions', async () => {
        const testItem = {
            __typename: 'PullRequest',
            number: 123,
            repository: { nameWithOwner: 'bcgov/nr-nerds' },
            author: { login: 'other-user' },
            assignees: { nodes: [] }
        };
        
        // Mocking the config and validator via overrides
        const mockConfig = {
            rules: {
                board_items: [{
                    name: "repository_pull_requests",
                    trigger: {
                        type: "PullRequest",
                        condition: "monitored.repos.includes(item.repository)"
                    },
                    action: "add_to_board"
                }]
            }
        };

        const mockValidator = {
            validateItemCondition: async (item, trigger) => {
                return trigger.condition === "monitored.repos.includes(item.repository)";
            },
            validateSkipRule: async () => false,
            steps: { markStepComplete: () => {} }
        };

        const overrides = {
            loadBoardRulesFn: async () => mockConfig,
            ruleValidator: mockValidator
        };

        const actions = await processBoardItemRules(testItem, overrides);
        
        assert.ok(actions.length > 0, 'Should find at least one matching rule');
        assert.strictEqual(actions[0].action, 'add_to_board', 'Action should be add_to_board');
    });
});
