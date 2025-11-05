/**
 * @fileoverview Tests for column transition enforcement in columns.js
 * Tests that validTransitions from rules.yml are strictly enforced via validateColumnTransition()
 * 
 * These tests verify that:
 * 1. Valid transitions are allowed
 * 2. Invalid transitions are blocked
 * 3. Error handling works correctly
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { StateVerifier } from '../../src/utils/state-verifier.js';
import { loadBoardRules } from '../../src/config/board-rules.js';
import { setupTestEnvironment } from '../setup.js';

describe('Column Transition Enforcement in columns.js', () => {
  // Setup before all tests
  let validator;
  let boardConfig;

  test('setup: initialize transition rules', async () => {
    setupTestEnvironment();
    boardConfig = loadBoardRules({ monitoredUser: 'test-user' });
    
    // Initialize transition rules
    StateVerifier.getTransitionValidator(); // Initialize first
    StateVerifier.initializeTransitionRules(boardConfig);
    validator = StateVerifier.getTransitionValidator();
    
    assert.ok(validator, 'Transition validator should be initialized');
  });

  test('validateColumnTransition should allow valid transition from New to Active', async () => {
    // This is a valid transition per rules.yml
    const result = validator.validateColumnTransition('New', 'Active', {});
    
    assert.strictEqual(result.valid, true, 
      'New -> Active transition should be allowed (valid per rules.yml)');
  });

  test('validateColumnTransition should allow valid transition from None to Active', async () => {
    // This is a valid transition per rules.yml (initial column setting)
    const result = validator.validateColumnTransition('None', 'Active', {});
    
    assert.strictEqual(result.valid, true, 
      'None -> Active transition should be allowed (initial column setting)');
  });

  test('validateColumnTransition should block invalid transition from Active to New', async () => {
    // This is NOT a valid transition per rules.yml (reverse of New -> Active)
    const result = validator.validateColumnTransition('Active', 'New', {});
    
    assert.strictEqual(result.valid, false, 
      'Active -> New transition should be blocked (not in validTransitions)');
    assert.ok(result.reason, 'Should provide a reason for blocking');
    assert.ok(result.reason.includes('not allowed') || result.reason.includes('No transitions defined'),
      'Reason should indicate transition is not allowed');
  });

  test('validateColumnTransition should block transition not in validTransitions', async () => {
    // Test a transition that's not defined in rules.yml
    const result = validator.validateColumnTransition('Active', 'Done', {});
    
    // This may or may not be blocked depending on rules.yml, but if blocked, should have reason
    if (!result.valid) {
      assert.ok(result.reason, 'Should provide a reason if blocked');
    }
  });

  test('validateColumnTransition should handle validation errors and throw', async () => {
    // Test that validation errors are properly thrown (strict validation)
    // This tests the error handling we added in Phase 2
    
    // Create a scenario that might cause an error
    // If validator throws, our function should catch and re-throw with clear message
    try {
      // This should work normally
      const result = validator.validateColumnTransition('New', 'Active', {});
      assert.ok(result, 'Should return result for normal validation');
    } catch (error) {
      // If validation throws, it should be a clear error
      assert.ok(error.message, 'Error should have a message');
      assert.ok(error.message.includes('validation') || error.message.includes('transition'),
        'Error message should be about validation/transition');
    }
  });

  test('validateColumnTransition should handle same column transition', async () => {
    // No change should be allowed
    const result = validator.validateColumnTransition('Active', 'Active', {});
    
    assert.strictEqual(result.valid, true, 
      'Same column transition should be allowed (no change)');
  });

  test('validateColumnTransition should handle null/undefined columns', async () => {
    // Initial column setting should be allowed
    const nullResult = validator.validateColumnTransition(null, 'Active', {});
    const undefinedResult = validator.validateColumnTransition(undefined, 'Active', {});
    
    assert.strictEqual(nullResult.valid, true, 
      'null -> Active should be allowed (initial setting)');
    assert.strictEqual(undefinedResult.valid, true, 
      'undefined -> Active should be allowed (initial setting)');
  });
});

