import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { processBoardItemRules } from '../../src/rules/processors/unified-rule-processor.js';
import { log } from '../../src/utils/log.js';

describe('PR/Issue from monitored repository rule', () => {
    const logMessages = [];
    
    // Mock logging
    mock.method(log, 'info', (msg) => logMessages.push(msg));
    mock.method(log, 'debug', (msg) => logMessages.push(msg));
    mock.method(log, 'error', (msg) => logMessages.push(msg));

    const mockConfig = {
        rules: {
            board_items: [{
                name: "Items from Repository",
                description: "Add items from monitored repository",
                trigger: {
                    type: "PullRequest|Issue",
                    condition: "item.repository === monitored.repository"
                },
                action: "add_to_board",
                skip_if: "item.inProject"
            }]
        }
    };

    const mockValidator = {
        validateItemCondition: async (item, trigger) => {
            if (trigger.condition === 'item.repository === monitored.repository') {
                return item.repository?.name === 'test-repo';
            }
            return false;
        },
        validateSkipRule: async (item, skipIf) => {
            if (skipIf === "item.inProject") {
                return item.projectItems?.nodes?.length > 0;
            }
            return false;
        },
        steps: {
            markStepComplete: () => {}
        }
    };

    const overrides = {
        loadBoardRulesFn: async () => mockConfig,
        ruleValidator: mockValidator
    };

    test('adds PR to board when from monitored repository', async () => {
        logMessages.length = 0;
        const pr = {
            __typename: 'PullRequest',
            number: 123,
            repository: { name: 'test-repo' },
            projectItems: { nodes: [] }  // Not in project
        };

        const actions = await processBoardItemRules(pr, overrides);
        
        assert.equal(actions.length, 1);
        assert.equal(actions[0].action, 'add_to_board');
        assert.deepEqual(actions[0].params, { item: pr });
        assert.ok(logMessages.some(msg => msg.includes('Rule Items from Repository triggered for PullRequest #123')));
    });

    test('adds Issue to board when from monitored repository', async () => {
        logMessages.length = 0;
        const issue = {
            __typename: 'Issue',
            number: 456,
            repository: { name: 'test-repo' },
            projectItems: { nodes: [] }  // Not in project
        };

        const actions = await processBoardItemRules(issue, overrides);
        
        assert.equal(actions.length, 1);
        assert.equal(actions[0].action, 'add_to_board');
        assert.deepEqual(actions[0].params, { item: issue });
        assert.ok(logMessages.some(msg => msg.includes('Rule Items from Repository triggered for Issue #456')));
    });

    test('skips item when already in project', async () => {
        logMessages.length = 0;
        const pr = {
            __typename: 'PullRequest',
            number: 123,
            repository: { name: 'test-repo' },
            projectItems: { nodes: [{ id: 'some-id' }] }  // Already in project
        };

        const actions = await processBoardItemRules(pr, overrides);
        
        assert.equal(actions.length, 0);
    });

    test('skips item when not from monitored repository', async () => {
        logMessages.length = 0;
        const pr = {
            __typename: 'PullRequest',
            number: 123,
            repository: { name: 'other-repo' },
            projectItems: { nodes: [] }
        };

        const actions = await processBoardItemRules(pr, overrides);
        
        assert.equal(actions.length, 0);
    });
});
