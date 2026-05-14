import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { 
    processBoardItemRules,
    processColumnRules,
    processSprintRules
} from '../../src/rules/processors/unified-rule-processor.js';
import { setupTestEnvironment } from '../setup.js';

describe('real scenarios', () => {
    test('PR 98: authored by DerekRoberts, no column or assignee', async () => {
        setupTestEnvironment();
        
        const pr = {
            __typename: 'PullRequest',
            number: 98,
            author: { login: 'DerekRoberts' },
            repository: { nameWithOwner: 'bcgov/nr-nerds' },
            column: null,
            sprint: null,
            projectItems: { nodes: [] }, // Not in project yet
            assignees: { nodes: [] } // No assignees
        };

        // Process through board-items rules
        const boardActions = await processBoardItemRules(pr);
        // Note: With modern deduplication, this should likely be 1. 
        // But let's check what the current system returns. 
        // If it returns 1, the test should be updated.
        // Given that unified-rule-processor.js has deduplicateActions, it SHOULD be 1.
        assert.equal(boardActions.length, 1, 'should add PR to board (matches author and repo rules, then deduplicated)');
        assert.equal(boardActions[0].action, 'add_to_board', 'should add to board');

        // Process through column rules
        const columnActions = await processColumnRules(pr);
        assert.equal(columnActions.length, 1, 'should set column');
        assert.equal(columnActions[0].action, 'set_column: Active', 'should set to Active');

        // Once in Active column, should get sprint assignment
        const prWithColumn = {
            ...pr,
            column: 'Active'
        };
        const sprintActions = await processSprintRules(prWithColumn);
        assert.equal(sprintActions.length, 1, 'should set sprint');
        assert.equal(sprintActions[0].action, 'set_sprint: current', 'should set current sprint');
    });
});
