import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deduplicateActions } from '../../src/rules/processors/unified-rule-processor.js';

describe('Unified Rule Processor - Deduplication Logic', () => {
    test('should prevent duplicate column assignments', () => {
        const actions = [
            { action: 'set_column: Active', params: { rule: 'Rule 1' } },
            { action: 'set_column: Active', params: { rule: 'Rule 2' } },
            { action: 'set_column: Done', params: { rule: 'Rule 3' } }
        ];

        const result = deduplicateActions(actions);
        
        // Should keep Rule 1 and Rule 3 (first unique action/value pair wins)
        assert.equal(result.length, 2);
        assert.equal(result[0].params.rule, 'Rule 1');
        assert.equal(result[1].params.rule, 'Rule 3');
    });

    test('should allow multiple different actions', () => {
        const actions = [
            { action: 'set_column: Active', params: { rule: 'Rule 1' } },
            { action: 'set_sprint: current', params: { rule: 'Rule 2' } },
            { action: 'add_assignee: user1', params: { rule: 'Rule 3' } }
        ];

        const result = deduplicateActions(actions);
        assert.equal(result.length, 3);
    });

    test('should deduplicate add_to_board actions', () => {
        const actions = [
            { action: 'add_to_board', params: { rule: 'Rule 1' } },
            { action: 'add_to_board', params: { rule: 'Rule 2' } }
        ];

        const result = deduplicateActions(actions);
        assert.equal(result.length, 1);
        assert.equal(result[0].params.rule, 'Rule 1');
    });

    test('should handle empty action list', () => {
        const result = deduplicateActions([]);
        assert.equal(result.length, 0);
    });

    test('should treat same action with different params as unique if action string differs', () => {
        const actions = [
            { action: 'add_assignee: user1', params: {} },
            { action: 'add_assignee: user2', params: {} }
        ];

        const result = deduplicateActions(actions);
        assert.equal(result.length, 2);
    });
});
