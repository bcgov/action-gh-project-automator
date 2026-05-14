import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { 
    processRuleType,
    processColumnRules,
    processBoardItemRules,
    processSprintRules,
    processAssigneeRules,
    processLinkedIssueRules
} from '../../src/rules/processors/unified-rule-processor.js';

// Mock the dependencies
const mockConfig = {
    rules: {
        board_items: [{
            name: "Test Board Rule",
            trigger: {
                type: "PullRequest",
                condition: "monitored.users.includes(item.author)"
            },
            action: "add_to_board",
            skip_if: "item.inProject"
        }],
        columns: [{
            name: "Test Column Rule",
            trigger: {
                type: "PullRequest",
                condition: "!item.column"
            },
            action: "set_column",
            value: "Active",
            skip_if: "item.column"
        }],
        sprints: [{
            name: "Test Sprint Rule",
            trigger: {
                type: "PullRequest",
                condition: "item.column === 'Active'"
            },
            action: "set_sprint",
            value: "current",
            skip_if: "item.sprint === 'current'"
        }],
        assignees: [{
            name: "Test Assignee Rule",
            trigger: {
                type: "PullRequest",
                condition: "monitored.users.includes(item.author)"
            },
            action: "add_assignee",
            value: "item.author",
            skip_if: "item.assignees.includes(item.author)"
        }],
        linked_issues: [{
            name: "Test Linked Issue Rule",
            trigger: {
                type: "LinkedIssue",
                condition: "!item.pr.closed || item.pr.merged"
            },
            action: ["inherit_column", "inherit_assignees"],
            skip_if: "item.column === item.pr.column && item.assignees === item.pr.assignees"
        }]
    },
    monitoredUsers: ['test-user']
};

const mockValidator = {
    validateItemCondition: async (item, trigger) => {
        // Check type first
        const allowedTypes = trigger.type?.split('|') || [];
        if (allowedTypes.length > 0 && !allowedTypes.includes(item.__typename)) {
            return false;
        }
        
        // Then check condition
        if (trigger.condition === "monitored.users.includes(item.author)") {
            return item.author?.login === 'test-user';
        }
        if (trigger.condition === "!item.column") {
            return !item.column;
        }
        if (trigger.condition === "item.column === 'Active'") {
            return item.column === 'Active';
        }
        if (trigger.condition === "!item.pr.closed || item.pr.merged") {
            return !item.pr?.closed || item.pr?.merged;
        }
        return false;
    },
    validateSkipRule: async (item, skipIf) => {
        if (skipIf === "item.inProject") {
            return item.projectItems?.nodes?.length > 0;
        }
        if (skipIf === "item.column") {
            return !!item.column;
        }
        if (skipIf === "item.sprint === 'current'") {
            return item.sprint === 'current';
        }
        if (skipIf === "item.assignees.includes(item.author)") {
            return item.assignees?.nodes?.some(a => a.login === item.author?.login);
        }
        if (skipIf === "item.column === item.pr.column && item.assignees === item.pr.assignees") {
            // Only evaluate if both properties exist
            if (!item.column || !item.assignees || !item.pr?.column || !item.pr?.assignees) {
                return false;
            }
            const columnMatch = item.column === item.pr?.column;
            // Simple array comparison for tests
            const assigneesMatch = JSON.stringify(item.assignees) === JSON.stringify(item.pr?.assignees);
            return columnMatch && assigneesMatch;
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

describe('Unified Rule Processor - All Rule Types', () => {
    test('processRuleType processes column rules correctly', async () => {
        const item = {
            __typename: 'PullRequest',
            number: 123,
            column: null,
            projectItems: { nodes: [] }
        };

        const actions = await processRuleType(item, 'columns', overrides);
        
        assert.equal(actions.length, 1, 'Should process one column rule');
        assert.equal(actions[0].action, 'set_column: Active', 'Should have correct action');
        assert.equal(actions[0].params.item, item, 'Should include item in params');
    });

    test('processRuleType processes board_items rules correctly', async () => {
        const item = {
            __typename: 'PullRequest',
            number: 123,
            author: { login: 'test-user' },
            projectItems: { nodes: [] }
        };

        const actions = await processRuleType(item, 'board_items', overrides);
        
        assert.equal(actions.length, 1, 'Should process one board_items rule');
        assert.equal(actions[0].action, 'add_to_board', 'Should have correct action');
        assert.equal(actions[0].params.item, item, 'Should include item in params');
    });

    test('processRuleType processes sprint rules correctly', async () => {
        const item = {
            __typename: 'PullRequest',
            number: 123,
            column: 'Active',
            projectItems: { nodes: [] }
        };

        const actions = await processRuleType(item, 'sprints', overrides);
        
        assert.equal(actions.length, 1, 'Should process one sprint rule');
        assert.equal(actions[0].action, 'set_sprint: current', 'Should have correct action');
        assert.equal(actions[0].params.item, item, 'Should include item in params');
    });

    test('processRuleType processes assignee rules correctly', async () => {
        const item = {
            __typename: 'PullRequest',
            number: 123,
            author: { login: 'test-user' },
            assignees: { nodes: [] },
            projectItems: { nodes: [] }
        };

        const actions = await processRuleType(item, 'assignees', overrides);
        
        assert.equal(actions.length, 1, 'Should process one assignee rule');
        assert.equal(actions[0].action, 'add_assignee: item.author', 'Should have correct action');
        assert.equal(actions[0].params.item, item, 'Should include item in params');
        assert.equal(actions[0].params.assignee, 'item.author', 'Should include assignee in params');
    });

    test('processRuleType processes linked_issues rules correctly', async () => {
        const item = {
            __typename: 'LinkedIssue',
            number: 123,
            pr: { closed: false, merged: true },
            projectItems: { nodes: [] }
        };

        const actions = await processRuleType(item, 'linked_issues', overrides);
        
        assert.equal(actions.length, 2, 'Should process two linked issue actions');
        assert.equal(actions[0].action, 'inherit_column', 'Should have first action');
        assert.equal(actions[1].action, 'inherit_assignees', 'Should have second action');
        assert.equal(actions[0].params.item, item, 'Should include item in params');
        assert.equal(actions[0].params.rule, 'Test Linked Issue Rule', 'Should include rule name');
        assert.deepEqual(actions[0].params.actions, ['inherit_column', 'inherit_assignees'], 'Should include all actions');
    });

    test('processColumnRules works as backward compatibility', async () => {
        const item = {
            __typename: 'PullRequest',
            number: 123,
            column: null,
            projectItems: { nodes: [] }
        };

        const actions = await processColumnRules(item, overrides);
        
        assert.equal(actions.length, 1, 'Should process one column rule');
        assert.equal(actions[0].action, 'set_column: Active', 'Should have correct action');
    });

    test('processBoardItemRules works as backward compatibility', async () => {
        const item = {
            __typename: 'PullRequest',
            number: 123,
            author: { login: 'test-user' },
            projectItems: { nodes: [] }
        };

        const actions = await processBoardItemRules(item, overrides);
        
        assert.equal(actions.length, 1, 'Should process one board_items rule');
        assert.equal(actions[0].action, 'add_to_board', 'Should have correct action');
    });

    test('processSprintRules works as backward compatibility', async () => {
        const item = {
            __typename: 'PullRequest',
            number: 123,
            column: 'Active',
            projectItems: { nodes: [] }
        };

        const actions = await processSprintRules(item, overrides);
        
        assert.equal(actions.length, 1, 'Should process one sprint rule');
        assert.equal(actions[0].action, 'set_sprint: current', 'Should have correct action');
    });

    test('processAssigneeRules works as backward compatibility', async () => {
        const item = {
            __typename: 'PullRequest',
            number: 123,
            author: { login: 'test-user' },
            assignees: { nodes: [] },
            projectItems: { nodes: [] }
        };

        const actions = await processAssigneeRules(item, overrides);
        
        assert.equal(actions.length, 1, 'Should process one assignee rule');
        assert.equal(actions[0].action, 'add_assignee: item.author', 'Should have correct action');
    });

    test('processLinkedIssueRules works as backward compatibility', async () => {
        const item = {
            __typename: 'LinkedIssue',
            number: 123,
            pr: { closed: false, merged: true },
            projectItems: { nodes: [] }
        };

        const actions = await processLinkedIssueRules(item, overrides);
        
        assert.equal(actions.length, 2, 'Should process two linked issue actions');
        assert.equal(actions[0].action, 'inherit_column', 'Should have first action');
        assert.equal(actions[1].action, 'inherit_assignees', 'Should have second action');
    });

    test('skips board_items rules when already in project', async () => {
        const item = {
            __typename: 'PullRequest',
            number: 123,
            author: { login: 'test-user' },
            projectItems: { nodes: [{ id: 'some-id' }] } // Already in project
        };

        const actions = await processRuleType(item, 'board_items', overrides);
        
        assert.equal(actions.length, 0, 'Should skip when already in project');
    });

    test('skips rules when skip condition is met', async () => {
        const item = {
            __typename: 'PullRequest',
            number: 123,
            column: 'Active', // Already has column
            projectItems: { nodes: [] }
        };

        const actions = await processRuleType(item, 'columns', overrides);
        
        assert.equal(actions.length, 0, 'Should skip when column already set');
    });

    test('skips sprint rules when sprint already set', async () => {
        const item = {
            __typename: 'PullRequest',
            number: 123,
            column: 'Active',
            sprint: 'current', // Already has sprint
            projectItems: { nodes: [] }
        };

        const actions = await processRuleType(item, 'sprints', overrides);
        
        assert.equal(actions.length, 0, 'Should skip when sprint already set');
    });

    test('skips assignee rules when assignee already set', async () => {
        const item = {
            __typename: 'PullRequest',
            number: 123,
            author: { login: 'test-user' },
            assignees: { nodes: [{ login: 'test-user' }] }, // Already has assignee
            projectItems: { nodes: [] }
        };

        const actions = await processRuleType(item, 'assignees', overrides);
        
        assert.equal(actions.length, 0, 'Should skip when assignee already set');
    });

    test('skips linked_issues rules when conditions match', async () => {
        const item = {
            __typename: 'LinkedIssue',
            number: 123,
            column: 'Active',
            assignees: ['user1'],
            pr: { column: 'Active', assignees: ['user1'] }, // Same column and assignees
            projectItems: { nodes: [] }
        };

        const actions = await processRuleType(item, 'linked_issues', overrides);
        
        assert.equal(actions.length, 0, 'Should skip when conditions match');
    });

    test('handles empty rule types gracefully', async () => {
        const item = {
            __typename: 'PullRequest',
            number: 123,
            column: null,
            projectItems: { nodes: [] }
        };

        const actions = await processRuleType(item, 'nonexistent_rule_type', overrides);
        
        assert.equal(actions.length, 0, 'Should handle empty rule types');
    });
});
