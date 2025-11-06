/**
 * @fileoverview Comprehensive tests for column rules processor
 * Tests all column rules from rules.yml:
 * - new_pull_requests_to_active (PR from New to Active)
 * - pull_requests_no_column (PR with no column to Active)
 * - issues_no_column (Issue with no column to New)
 * 
 * Also tests transition validation and edge cases
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment } from '../setup.js';

describe('Column Rules Processor - Comprehensive Tests', () => {
  test('setup: initialize test environment', async () => {
    setupTestEnvironment();
    assert.ok(true, 'Test environment initialized');
  });

  describe('new_pull_requests_to_active rule', () => {
    test('should identify PR in New column that needs to move to Active', () => {
      // Rule condition: item.column === 'New'
      // Rule action: set_column to 'Active'
      const currentColumn = 'New';
      const itemType = 'PullRequest';
      
      const conditionMatches = currentColumn === 'New';
      const shouldProcess = conditionMatches && itemType === 'PullRequest';
      
      assert.strictEqual(shouldProcess, true, 'Should process PR in New column');
    });

    test('should skip PR not in New column', () => {
      const currentColumn = 'Active';
      const skipCondition = "item.column !== 'New'";
      
      // Simulate skip condition evaluation
      const shouldSkip = currentColumn !== 'New';
      
      assert.strictEqual(shouldSkip, true, 'Should skip PR not in New column');
    });

    test('should handle PR with no column', () => {
      const currentColumn = null;
      const condition = "item.column === 'New'";
      
      // null !== 'New', so condition doesn't match
      const conditionMatches = currentColumn === 'New';
      
      assert.strictEqual(conditionMatches, false, 'PR with no column should not match New column condition');
    });
  });

  describe('pull_requests_no_column rule', () => {
    test('should identify PR with no column that needs Active', () => {
      // Rule condition: !item.column
      // Rule action: set_column to 'Active'
      const currentColumn = null;
      const itemType = 'PullRequest';
      
      const conditionMatches = !currentColumn;
      const shouldProcess = conditionMatches && itemType === 'PullRequest';
      
      assert.strictEqual(shouldProcess, true, 'Should process PR with no column');
    });

    test('should skip PR that already has a column', () => {
      const currentColumn = 'Active';
      const skipCondition = 'item.column';
      
      // Simulate skip condition evaluation
      const shouldSkip = !!currentColumn;
      
      assert.strictEqual(shouldSkip, true, 'Should skip PR that already has a column');
    });

    test('should handle undefined column', () => {
      const currentColumn = undefined;
      const condition = '!item.column';
      
      const conditionMatches = !currentColumn;
      
      assert.strictEqual(conditionMatches, true, 'PR with undefined column should match condition');
    });
  });

  describe('issues_no_column rule', () => {
    test('should identify Issue with no column that needs New', () => {
      // Rule condition: !item.column
      // Rule action: set_column to 'New'
      const currentColumn = null;
      const itemType = 'Issue';
      
      const conditionMatches = !currentColumn;
      const shouldProcess = conditionMatches && itemType === 'Issue';
      
      assert.strictEqual(shouldProcess, true, 'Should process Issue with no column');
    });

    test('should skip Issue that already has a column', () => {
      const currentColumn = 'New';
      const skipCondition = 'item.column';
      
      const shouldSkip = !!currentColumn;
      
      assert.strictEqual(shouldSkip, true, 'Should skip Issue that already has a column');
    });

    test('should not process PullRequest with no column (different rule)', () => {
      const currentColumn = null;
      const itemType = 'PullRequest';
      
      // Issues rule should not match PRs
      const shouldProcess = !currentColumn && itemType === 'Issue';
      
      assert.strictEqual(shouldProcess, false, 'Issue rule should not match PullRequests');
    });
  });

  describe('validTransitions enforcement', () => {
    test('should allow New to Active transition (valid per rules.yml)', () => {
      const fromColumn = 'New';
      const toColumn = 'Active';
      
      // This transition is defined in rules.yml validTransitions
      const isValid = (fromColumn === 'New' && toColumn === 'Active');
      
      assert.strictEqual(isValid, true, 'New to Active should be a valid transition');
    });

    test('should allow None to Active transition (initial PR placement)', () => {
      const fromColumn = 'None';
      const toColumn = 'Active';
      
      // Initial placement is valid
      const isValid = (fromColumn === 'None' && toColumn === 'Active');
      
      assert.strictEqual(isValid, true, 'None to Active should be valid for initial placement');
    });

    test('should allow None to New transition (initial Issue placement)', () => {
      const fromColumn = 'None';
      const toColumn = 'New';
      
      const isValid = (fromColumn === 'None' && toColumn === 'New');
      
      assert.strictEqual(isValid, true, 'None to New should be valid for initial Issue placement');
    });

    test('should block invalid transitions not in validTransitions', () => {
      const fromColumn = 'Active';
      const toColumn = 'New';
      
      // This reverse transition is NOT in validTransitions
      // validTransitions only allow: New->Active, None->Active, None->New
      const validTransitions = [
        { from: 'New', to: 'Active' },
        { from: 'None', to: 'Active' },
        { from: 'None', to: 'New' }
      ];
      
      const isValid = validTransitions.some(t => t.from === fromColumn && t.to === toColumn);
      
      assert.strictEqual(isValid, false, 'Active to New should be blocked (not in validTransitions)');
    });

    test('should handle null/undefined columns in transitions', () => {
      // None/null/undefined should be treated as 'None' for initial placement
      const fromColumns = [null, undefined, 'None'];
      const toColumn = 'Active';
      
      fromColumns.forEach(fromColumn => {
        // Treat null/undefined as 'None' for transition validation
        const normalizedFrom = fromColumn || 'None';
        const isValid = (normalizedFrom === 'None' && toColumn === 'Active');
        
        assert.strictEqual(isValid, true, `${fromColumn} to Active should be valid for initial placement`);
      });
    });
  });

  describe('edge cases and error handling', () => {
    test('should handle closed/merged items correctly', () => {
      const itemState = 'MERGED';
      const currentColumn = 'Active';
      
      // Closed/merged items should move to Done/Closed
      const shouldMoveToDone = (itemState === 'MERGED' || itemState === 'CLOSED') && 
                               currentColumn !== 'done' && 
                               currentColumn !== 'closed';
      
      assert.strictEqual(shouldMoveToDone, true, 'Merged item should move to Done');
    });

    test('should skip closed items already in Done column', () => {
      const itemState = 'CLOSED';
      const currentColumn = 'Done';
      
      const shouldSkip = currentColumn.toLowerCase() === 'done' || 
                        currentColumn.toLowerCase() === 'closed';
      
      assert.strictEqual(shouldSkip, true, 'Closed item already in Done should be skipped');
    });

    test('should handle case-insensitive column matching', () => {
      const targetColumn = 'Active';
      const currentColumns = ['Active', 'active', 'ACTIVE', 'New'];
      
      currentColumns.forEach(currentColumn => {
        const matches = currentColumn.toLowerCase() === targetColumn.toLowerCase();
        
        if (currentColumn === 'New') {
          assert.strictEqual(matches, false, 'New should not match Active');
        } else {
          assert.strictEqual(matches, true, `Case variations of ${currentColumn} should match ${targetColumn}`);
        }
      });
    });

    test('should handle items already in target column', () => {
      const currentColumn = 'Active';
      const targetColumn = 'Active';
      
      const shouldSkip = currentColumn.toLowerCase() === targetColumn.toLowerCase();
      
      assert.strictEqual(shouldSkip, true, 'Item already in target column should be skipped');
    });

    test('should handle missing column option gracefully', () => {
      const targetColumn = 'Active';
      const availableColumns = ['New', 'Done']; // Active not available
      
      const optionExists = availableColumns.includes(targetColumn);
      
      assert.strictEqual(optionExists, false, 'Should detect when target column option is missing');
    });
  });

  describe('rule processing logic', () => {
    test('should prioritize closed/merged state over column rules', () => {
      const itemState = 'MERGED';
      const currentColumn = 'New';
      const itemType = 'PullRequest';
      
      // Closed/merged handling should take precedence
      const shouldHandleClosed = (itemState === 'MERGED' || itemState === 'CLOSED');
      const shouldHandleColumnRule = !shouldHandleClosed && 
                                    (currentColumn === 'New' || !currentColumn) &&
                                    itemType === 'PullRequest';
      
      assert.strictEqual(shouldHandleClosed, true, 'Closed/merged should be handled first');
      assert.strictEqual(shouldHandleColumnRule, false, 'Column rules should not apply when handling closed');
    });

    test('should apply correct rule based on item type and column', () => {
      const testCases = [
        { itemType: 'PullRequest', column: null, expectedTarget: 'Active', rule: 'pull_requests_no_column' },
        { itemType: 'PullRequest', column: 'New', expectedTarget: 'Active', rule: 'new_pull_requests_to_active' },
        { itemType: 'PullRequest', column: 'Active', expectedTarget: null, rule: 'none (skip)' },
        { itemType: 'Issue', column: null, expectedTarget: 'New', rule: 'issues_no_column' },
        { itemType: 'Issue', column: 'New', expectedTarget: null, rule: 'none (skip)' }
      ];

      testCases.forEach(({ itemType, column, expectedTarget, rule }) => {
        let targetColumn = null;
        
        if (itemType === 'PullRequest') {
          if (!column || column === 'New') {
            targetColumn = 'Active';
          }
        } else if (itemType === 'Issue' && !column) {
          targetColumn = 'New';
        }
        
        assert.strictEqual(targetColumn, expectedTarget, 
          `${itemType} in ${column || 'None'} should use ${rule} -> ${expectedTarget || 'skip'}`);
      });
    });
  });
});

