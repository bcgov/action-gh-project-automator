import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { StateVerifier } from '../src/utils/state-verifier.js';

describe('StateVerifier management', () => {
    test('StateVerifier maintains state between operations', async () => {
        const item = {
            type: 'PullRequest',
            number: 99,
            id: 'PR_123',
            projectItemId: 'test-id'
        };

        // Test state initialization
        const initialState = StateVerifier.getState(item);
        assert.equal(initialState.column, 'None', 'Initial column should be None');
        assert.deepEqual(initialState.assignees, [], 'Initial assignees should be empty');

        // Test state updates
        const updatedState = StateVerifier.updateState(item, { 
            column: 'Active',
            assignees: ['user1']
        });
        
        assert.equal(updatedState.column, 'Active', 'Column should be updated');
        assert.deepEqual(updatedState.assignees, ['user1'], 'Assignees should be updated');

        // Verify state persists
        const persistedState = StateVerifier.getState(item);
        assert.equal(persistedState.column, 'Active', 'State should persist between calls');
        assert.deepEqual(persistedState.assignees, ['user1'], 'Assignee state should persist');
    });
});
