import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { processAssigneeRules } from '../../src/rules/processors/unified-rule-processor.js';
import { log } from '../../src/utils/log.js';

describe('PR assigned to monitored user rule', () => {
    const logMessages = [];
    
    // Mock logging
    mock.method(log, 'info', (msg) => logMessages.push(msg));
    mock.method(log, 'debug', (msg) => logMessages.push(msg));
    mock.method(log, 'error', (msg) => logMessages.push(msg));

    const mockConfig = {
        rules: {
            assignees: [{
                name: "assign_authored_prs",
                description: "Add PR author as assignee",
                trigger: {
                    type: "PullRequest",
                    condition: "monitored.users.includes(item.author)"
                },
                action: "add_assignee",
                value: "item.author",
                skip_if: "item.assignees.includes(item.author)"
            }]
        },
        monitoredUsers: ['DerekRoberts']
    };

    const mockValidator = {
        validateItemCondition: async (item, trigger) => {
            if (trigger.condition === "monitored.users.includes(item.author)") {
                return item.author?.login === 'DerekRoberts';
            }
            return false;
        },
        validateSkipRule: async (item, skipIf) => {
            if (skipIf === "item.assignees.includes(item.author)") {
                return item.assignees?.nodes?.some(a => a.login === item.author?.login);
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

    test('adds author as assignee when not already assigned', async () => {
        logMessages.length = 0;
        const pr = {
            __typename: 'PullRequest',
            number: 123,
            author: { login: 'DerekRoberts' },
            assignees: { nodes: [] }
        };

        const actions = await processAssigneeRules(pr, overrides);

        assert.equal(actions.length, 1, 'should add assignee');
        assert.equal(actions[0].action, 'add_assignee: item.author', 'action should be add_assignee');
        assert.equal(actions[0].params.assignee, 'item.author', 'should include assignee in params');
    });

    test('skips when author is already assigned', async () => {
        logMessages.length = 0;
        const pr = {
            __typename: 'PullRequest',
            number: 123,
            author: { login: 'DerekRoberts' },
            assignees: { nodes: [{ login: 'DerekRoberts' }] }
        };

        const actions = await processAssigneeRules(pr, overrides);

        assert.equal(actions.length, 0, 'should skip already assigned author');
    });

    test('skips when author is not monitored user', async () => {
        logMessages.length = 0;
        const pr = {
            __typename: 'PullRequest',
            number: 123,
            author: { login: 'otherUser' },
            assignees: { nodes: [] }
        };

        const actions = await processAssigneeRules(pr, overrides);

        assert.equal(actions.length, 0, 'should skip non-monitored author');
    });
});
