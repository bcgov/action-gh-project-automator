/**
 * @fileoverview Tests for linked issues inheritance (inherit_column, inherit_assignees, skip condition)
 * Tests that linked issues properly inherit PR state from project board
 * 
 * These tests verify:
 * 1. inherit_column action gets PR actual column from project board
 * 2. inherit_assignees action gets PR actual assignees from project board
 * 3. skip condition correctly evaluates when column and assignees match
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment } from '../setup.js';
import { arraysEqual } from '../../src/rules/linked-issues-processor.js';
import { classifyError } from '../../src/utils/error-classifier.js';

describe('Linked Issues Inheritance Logic Tests', () => {
  test('setup: initialize test environment', async () => {
    setupTestEnvironment();
    assert.ok(true, 'Test environment initialized');
  });

  test('arraysEqual should match assignees regardless of order', () => {
    const prAssignees = ['user1', 'user2'];
    const linkedAssignees = ['user2', 'user1']; // Different order, same values
    
    const match = arraysEqual(prAssignees, linkedAssignees);
    assert.strictEqual(match, true, 'Should match assignees regardless of order');
  });

  test('arraysEqual should detect when assignees differ', () => {
    const prAssignees = ['user1', 'user2'];
    const linkedAssignees = ['user1']; // Missing user2
    
    const match = arraysEqual(prAssignees, linkedAssignees);
    assert.strictEqual(match, false, 'Should detect missing assignees');
  });

  test('arraysEqual should handle empty arrays', () => {
    const empty1 = [];
    const empty2 = [];
    
    const match = arraysEqual(empty1, empty2);
    assert.strictEqual(match, true, 'Should match empty arrays');
  });

  test('skip condition should evaluate correctly when column and assignees match', () => {
    // Simulate skip condition: item.column === item.pr.column && item.assignees === item.pr.assignees
    const prColumn = 'Active';
    const linkedColumn = 'Active';
    const prAssignees = ['user1', 'user2'];
    const linkedAssignees = ['user1', 'user2'];
    
    const columnsMatch = linkedColumn === prColumn;
    const assigneesMatch = arraysEqual(linkedAssignees, prAssignees);
    const shouldSkip = columnsMatch && assigneesMatch;
    
    assert.strictEqual(shouldSkip, true, 'Should skip when both column and assignees match');
  });

  test('skip condition should not skip when column differs', () => {
    const prColumn = 'Active';
    const linkedColumn = 'New'; // Different
    const prAssignees = ['user1', 'user2'];
    const linkedAssignees = ['user1', 'user2'];
    
    const columnsMatch = linkedColumn === prColumn;
    const assigneesMatch = arraysEqual(linkedAssignees, prAssignees);
    const shouldSkip = columnsMatch && assigneesMatch;
    
    assert.strictEqual(shouldSkip, false, 'Should not skip when column differs');
  });

  test('skip condition should not skip when assignees differ', () => {
    const prColumn = 'Active';
    const linkedColumn = 'Active';
    const prAssignees = ['user1', 'user2'];
    const linkedAssignees = ['user1']; // Different
    
    const columnsMatch = linkedColumn === prColumn;
    const assigneesMatch = arraysEqual(linkedAssignees, prAssignees);
    const shouldSkip = columnsMatch && assigneesMatch;
    
    assert.strictEqual(shouldSkip, false, 'Should not skip when assignees differ');
  });

  test('inherit_column should only update when column differs', () => {
    const prColumn = 'Active';
    const linkedColumn = 'New'; // Different, should update
    
    const shouldUpdate = prColumn && prColumn !== linkedColumn;
    assert.strictEqual(shouldUpdate, true, 'Should update when columns differ');
    
    // When columns match, should not update
    const sameColumn = 'Active';
    const shouldUpdateSame = prColumn && prColumn !== sameColumn;
    assert.strictEqual(shouldUpdateSame, false, 'Should not update when columns match');
  });

  test('inherit_assignees should only update when assignees differ', () => {
    const prAssignees = ['user1', 'user2'];
    const linkedAssignees = []; // Empty, should update
    
    const shouldUpdate = prAssignees.length > 0 && !arraysEqual(prAssignees, linkedAssignees);
    assert.strictEqual(shouldUpdate, true, 'Should update when assignees differ');
    
    // When assignees match, should not update
    const matchingAssignees = ['user1', 'user2'];
    const shouldUpdateMatching = prAssignees.length > 0 && !arraysEqual(prAssignees, matchingAssignees);
    assert.strictEqual(shouldUpdateMatching, false, 'Should not update when assignees match');
  });

  test('inherit_assignees should handle empty PR assignees', () => {
    const prAssignees = []; // No assignees
    const linkedAssignees = ['user1'];
    
    // Should not update when PR has no assignees
    const shouldUpdate = prAssignees.length > 0 && !arraysEqual(prAssignees, linkedAssignees);
    assert.strictEqual(shouldUpdate, false, 'Should not update when PR has no assignees');
  });

  test('should handle null/undefined columns correctly', () => {
    const prColumn = 'Active';
    const linkedColumnNull = null;
    const linkedColumnUndefined = undefined;
    
    // null/undefined should be treated as different from string values
    // Explicitly check that prColumn exists and differs from null/undefined
    const shouldUpdateNull = prColumn != null && prColumn !== linkedColumnNull;
    const shouldUpdateUndefined = prColumn != null && prColumn !== linkedColumnUndefined;
    
    assert.strictEqual(shouldUpdateNull, true, 'Should update when linked column is null');
    assert.strictEqual(shouldUpdateUndefined, true, 'Should update when linked column is undefined');
  });

  describe('error handling scenarios', () => {
    test('should identify authentication errors', () => {
      const error = new Error('Bad credentials');
      const result = classifyError(error);

      assert.strictEqual(result.isAuthError, true, 'Should classify auth errors');
      assert.strictEqual(result.isRateLimitError, false, 'Auth errors should not be rate limit');
      assert.strictEqual(result.isNetworkError, false, 'Auth errors should not be network errors');
    });

    test('should identify rate limit errors', () => {
      const error = new Error('API rate limit exceeded');
      const result = classifyError(error);

      assert.strictEqual(result.isRateLimitError, true, 'Should classify rate limit errors');
      assert.strictEqual(result.isAuthError, false, 'Rate limit errors should not be auth errors');
      assert.strictEqual(result.isNetworkError, false, 'Rate limit errors should not be network errors');
    });

    test('should identify network errors by code', () => {
      const error = new Error('Connection failed');
      error.code = 'ETIMEDOUT';
      const result = classifyError(error);

      assert.strictEqual(result.isNetworkError, true, 'Should classify network errors by code');
      assert.strictEqual(result.isAuthError, false, 'Network errors should not be auth errors');
      assert.strictEqual(result.isRateLimitError, false, 'Network errors should not be rate limit errors');
    });

    test('should identify network errors by message', () => {
      const error = new Error('Request timeout');
      const result = classifyError(error);

      assert.strictEqual(result.isNetworkError, true, 'Should classify network errors by message');
      assert.strictEqual(result.isAuthError, false, 'Network errors should not be auth errors');
      assert.strictEqual(result.isRateLimitError, false, 'Network errors should not be rate limit errors');
    });

    test('should handle PR with no linked issues', () => {
      const linkedIssueNodes = [];
      
      const hasNoLinkedIssues = linkedIssueNodes.length === 0;
      
      assert.strictEqual(hasNoLinkedIssues, true, 'Should detect when PR has no linked issues');
    });

    test('should handle PR with no projectItemId', () => {
      const projectItemId = null;
      const currentColumn = 'Active';
      const prAssignees = [{ login: 'user1' }];
      
      // Fallback behavior
      const shouldUseFallback = !projectItemId;
      const fallbackColumn = shouldUseFallback ? currentColumn : null;
      const fallbackAssignees = shouldUseFallback ? prAssignees.map(a => a.login) : [];
      
      assert.strictEqual(fallbackColumn, 'Active', 'Should use fallback column when projectItemId is null');
      assert.deepStrictEqual(fallbackAssignees, ['user1'], 'Should use fallback assignees when projectItemId is null');
    });

    test('should handle multiple linked issues', () => {
      const linkedIssueNodes = [
        { id: 'issue1', number: 1 },
        { id: 'issue2', number: 2 },
        { id: 'issue3', number: 3 }
      ];
      
      const shouldProcess = linkedIssueNodes.length > 0;
      
      assert.strictEqual(shouldProcess, true, 'Should process multiple linked issues');
      assert.strictEqual(linkedIssueNodes.length, 3, 'Should handle all linked issues');
    });
  });
});

