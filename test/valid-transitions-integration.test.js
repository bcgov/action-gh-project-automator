import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { StateVerifier } from '../src/utils/state-verifier.js';
import { loadBoardRules } from '../src/config/board-rules.js';

describe('Valid Transitions Integration Tests', () => {
    test('should load and initialize transition rules from rules.yml', async () => {
        // Load the real rules configuration
        const boardConfig = await loadBoardRules({ monitoredUser: 'test-user' });

        // Initialize StateVerifier first
        StateVerifier.getTransitionValidator();

        // Initialize transition rules
        StateVerifier.initializeTransitionRules(boardConfig);

        const validator = StateVerifier.getTransitionValidator();
        assert.ok(validator, 'Transition validator should be initialized');

        // Test that we can validate transitions
        const result = validator.validateColumnTransition('New', 'Active', {});
        assert.ok(result.valid, 'Should be able to validate transitions');
    });

    test('should allow valid transitions defined in rules.yml', async () => {
        const boardConfig = await loadBoardRules({ monitoredUser: 'test-user' });
        StateVerifier.getTransitionValidator();
        StateVerifier.initializeTransitionRules(boardConfig);
        const validator = StateVerifier.getTransitionValidator();

        const validTransitions = [
            { from: 'New', to: 'Active' },
            { from: 'None', to: 'Active' },
            { from: 'None', to: 'New' }
        ];

        for (const transition of validTransitions) {
            const result = validator.validateColumnTransition(transition.from, transition.to, {});
            assert.strictEqual(result.valid, true,
                `Transition from "${transition.from}" to "${transition.to}" should be valid`);
        }
    });

    test('should block invalid transitions not defined in rules.yml', async () => {
        const boardConfig = await loadBoardRules({ monitoredUser: 'test-user' });
        StateVerifier.getTransitionValidator();
        StateVerifier.initializeTransitionRules(boardConfig);
        const validator = StateVerifier.getTransitionValidator();

        const invalidTransitions = [
            { from: 'Active', to: 'New' },
            { from: 'Done', to: 'Active' },
            { from: 'New', to: 'Done' }
        ];

        for (const transition of invalidTransitions) {
            const result = validator.validateColumnTransition(transition.from, transition.to, {});
            assert.strictEqual(result.valid, false,
                `Transition from "${transition.from}" to "${transition.to}" should be blocked`);
            assert.ok(result.reason, 'Should provide a reason for blocking');
        }
    });

    test('should maintain backward compatibility for rules without validTransitions', async () => {
        const mockConfig = {
            rules: {
                columns: [
                    {
                        name: 'test_rule',
                        description: 'Test rule without validTransitions',
                        trigger: { type: 'PullRequest' },
                        action: 'set_column',
                        value: 'Active'
                    }
                ]
            }
        };

        StateVerifier.getTransitionValidator();
        StateVerifier.initializeTransitionRules(mockConfig);
        const validator = StateVerifier.getTransitionValidator();

        // Should return valid: true because no transition rules were defined for this column (permissive fallback)
        const result = validator.validateColumnTransition('New', 'Active', {});
        assert.ok(result.valid, 'Should handle rules without validTransitions gracefully');
    });

    test('should provide clear error messages for blocked transitions', async () => {
        const boardConfig = await loadBoardRules({ monitoredUser: 'test-user' });
        StateVerifier.getTransitionValidator();
        StateVerifier.initializeTransitionRules(boardConfig);
        const validator = StateVerifier.getTransitionValidator();

        const result = validator.validateColumnTransition('Active', 'New', {});

        assert.strictEqual(result.valid, false, 'Should block invalid transition');
        assert.ok(result.reason, 'Should provide a reason');
        assert.ok(result.reason.includes('not allowed'),
            'Reason should indicate the transition is not allowed');
    });

    test('should handle edge cases gracefully', async () => {
        const boardConfig = await loadBoardRules({ monitoredUser: 'test-user' });
        StateVerifier.getTransitionValidator();
        StateVerifier.initializeTransitionRules(boardConfig);
        const validator = StateVerifier.getTransitionValidator();

        const edgeCases = [
            { from: null, to: 'Active' },
            { from: undefined, to: 'Active' },
            { from: 'New', to: null },
            { from: 'New', to: undefined },
            { from: 'New', to: 'New' }
        ];

        for (const edgeCase of edgeCases) {
            const result = validator.validateColumnTransition(edgeCase.from, edgeCase.to, {});
            assert.ok(result, `Should handle edge case: ${JSON.stringify(edgeCase)}`);
        }
    });
});
