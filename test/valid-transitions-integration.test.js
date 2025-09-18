/**
 * Integration tests for Valid Transitions Enforcement
 * Tests the complete flow from rules.yml to column validation
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { StateVerifier } = require('../src/utils/state-verifier');
const { loadBoardRules } = require('../src/config/board-rules');

describe('Valid Transitions Integration Tests', () => {
  test('should load and initialize transition rules from rules.yml', async () => {
    // Load the real rules configuration
    const boardConfig = loadBoardRules({ monitoredUser: 'test-user' });

    // Initialize StateVerifier first (this marks TRANSITION_VALIDATOR_CONFIGURED as complete)
    StateVerifier.getTransitionValidator();

    // Initialize transition rules
    StateVerifier.initializeTransitionRules(boardConfig);

    // Get the transition validator
    const validator = StateVerifier.getTransitionValidator();

    // Verify that rules were loaded
    assert.ok(validator, 'Transition validator should be initialized');

    // Test that we can validate transitions
    const result = validator.validateColumnTransition('New', 'Active', {});
    assert.ok(result, 'Should be able to validate transitions');
  });

  test('should allow valid transitions defined in rules.yml', async () => {
    // Load and initialize rules
    const boardConfig = loadBoardRules({ monitoredUser: 'test-user' });
    StateVerifier.getTransitionValidator(); // Initialize first
    StateVerifier.initializeTransitionRules(boardConfig);
    const validator = StateVerifier.getTransitionValidator();

    // Test valid transitions from rules.yml
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
    // Load and initialize rules
    const boardConfig = loadBoardRules({ monitoredUser: 'test-user' });
    StateVerifier.getTransitionValidator(); // Initialize first
    StateVerifier.initializeTransitionRules(boardConfig);
    const validator = StateVerifier.getTransitionValidator();

    // Test invalid transitions
    const invalidTransitions = [
      { from: 'Active', to: 'New' },  // Reverse of allowed transition
      { from: 'Done', to: 'Active' }, // Not defined in rules
      { from: 'New', to: 'Done' }     // Not defined in rules
    ];

    for (const transition of invalidTransitions) {
      const result = validator.validateColumnTransition(transition.from, transition.to, {});
      assert.strictEqual(result.valid, false,
        `Transition from "${transition.from}" to "${transition.to}" should be blocked`);
      assert.ok(result.reason, 'Should provide a reason for blocking');
    }
  });

  test('should maintain backward compatibility for rules without validTransitions', async () => {
    // Create a mock config without validTransitions
    const mockConfig = {
      columns: [
        {
          name: 'test_rule',
          description: 'Test rule without validTransitions',
          trigger: { type: 'PullRequest' },
          action: 'set_column',
          value: 'Active'
          // No validTransitions property
        }
      ]
    };

    // Initialize with mock config
    StateVerifier.getTransitionValidator(); // Initialize first
    StateVerifier.initializeTransitionRules(mockConfig);
    const validator = StateVerifier.getTransitionValidator();

    // Should not crash and should allow transitions (backward compatibility)
    const result = validator.validateColumnTransition('New', 'Active', {});
    assert.ok(result, 'Should handle rules without validTransitions gracefully');
  });

  test('should handle transition conditions correctly', async () => {
    // Load and initialize rules
    const boardConfig = loadBoardRules({ monitoredUser: 'test-user' });
    StateVerifier.getTransitionValidator(); // Initialize first
    StateVerifier.initializeTransitionRules(boardConfig);
    const validator = StateVerifier.getTransitionValidator();

    // Test with item context
    const item = {
      hasReviewers: true,
      hasAssignees: false,
      isMerged: false,
      isApproved: true
    };

    // Valid transition should work
    const result = validator.validateColumnTransition('New', 'Active', { item });
    assert.strictEqual(result.valid, true, 'Should allow valid transition with conditions');
  });

  test('should provide clear error messages for blocked transitions', async () => {
    // Load and initialize rules
    const boardConfig = loadBoardRules({ monitoredUser: 'test-user' });
    StateVerifier.getTransitionValidator(); // Initialize first
    StateVerifier.initializeTransitionRules(boardConfig);
    const validator = StateVerifier.getTransitionValidator();

    // Test blocked transition
    const result = validator.validateColumnTransition('Active', 'New', {});

    assert.strictEqual(result.valid, false, 'Should block invalid transition');
    assert.ok(result.reason, 'Should provide a reason');
    assert.ok(result.reason.includes('not allowed') || result.reason.includes('blocked') || result.reason.includes('No transitions defined'),
      'Reason should indicate the transition is not allowed');
  });

  test('should handle performance requirements', async () => {
    // Load and initialize rules
    const boardConfig = loadBoardRules({ monitoredUser: 'test-user' });
    StateVerifier.getTransitionValidator(); // Initialize first
    StateVerifier.initializeTransitionRules(boardConfig);
    const validator = StateVerifier.getTransitionValidator();

    // Test performance with multiple validations
    const startTime = Date.now();
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      validator.validateColumnTransition('New', 'Active', {});
    }

    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / iterations;

    // Should be fast (less than 10ms per validation as per requirements)
    assert.ok(avgTime < 10,
      `Average validation time should be less than 10ms, got ${avgTime}ms`);

    console.log(`Performance test: ${iterations} validations in ${totalTime}ms (avg: ${avgTime.toFixed(2)}ms)`);
  });

  test('should handle edge cases gracefully', async () => {
    // Load and initialize rules
    const boardConfig = loadBoardRules({ monitoredUser: 'test-user' });
    StateVerifier.getTransitionValidator(); // Initialize first
    StateVerifier.initializeTransitionRules(boardConfig);
    const validator = StateVerifier.getTransitionValidator();

    // Test edge cases
    const edgeCases = [
      { from: null, to: 'Active' },      // null from
      { from: undefined, to: 'Active' }, // undefined from
      { from: '', to: 'Active' },        // empty string from
      { from: 'New', to: null },         // null to
      { from: 'New', to: undefined },    // undefined to
      { from: 'New', to: '' },           // empty string to
      { from: 'New', to: 'New' }         // same column
    ];

    for (const edgeCase of edgeCases) {
      const result = validator.validateColumnTransition(edgeCase.from, edgeCase.to, {});
      assert.ok(result, `Should handle edge case: ${JSON.stringify(edgeCase)}`);
      // Most edge cases should be allowed (initial column setting, no change, etc.)
    }
  });
});
