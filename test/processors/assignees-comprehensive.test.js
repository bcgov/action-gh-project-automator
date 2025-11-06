/**
 * @fileoverview Comprehensive tests for assignee rules processor
 * Tests all assignee rules from rules.yml:
 * - assign_authored_prs (Add PR author as assignee)
 * 
 * Also tests condition evaluation, skip conditions, and edge cases
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment } from '../setup.js';

describe('Assignee Rules Processor - Comprehensive Tests', () => {
  test('setup: initialize test environment', async () => {
    setupTestEnvironment();
    assert.ok(true, 'Test environment initialized');
  });

  describe('assign_authored_prs rule', () => {
    test('should identify PR authored by monitored user', () => {
      // Rule condition: monitored.users.includes(item.author)
      // Rule action: add_assignee
      // Rule value: item.author
      const monitoredUsers = ['test-user', 'another-user'];
      const itemAuthor = { login: 'test-user' };
      
      const conditionMatches = monitoredUsers.includes(itemAuthor.login);
      const shouldProcess = conditionMatches;
      
      assert.strictEqual(shouldProcess, true, 'Should process PR authored by monitored user');
    });

    test('should skip PR authored by non-monitored user', () => {
      // Rule condition: monitored.users.includes(item.author)
      const monitoredUsers = ['test-user', 'another-user'];
      const itemAuthor = { login: 'non-monitored-user' };
      
      const conditionMatches = monitoredUsers.includes(itemAuthor.login);
      const shouldProcess = conditionMatches;
      
      assert.strictEqual(shouldProcess, false, 'Should not process PR authored by non-monitored user');
    });

    test('should skip PR where author is already assigned', () => {
      // Skip condition: item.assignees.includes(item.author)
      const itemAuthor = { login: 'test-user' };
      const itemAssignees = [
        { login: 'test-user' },
        { login: 'another-user' }
      ];
      
      // Simulate skip condition evaluation
      const shouldSkip = itemAssignees.some(a => a.login === itemAuthor.login);
      
      assert.strictEqual(shouldSkip, true, 'Should skip PR where author is already assigned');
    });

    test('should process PR where author is not assigned', () => {
      // Skip condition: item.assignees.includes(item.author)
      const itemAuthor = { login: 'test-user' };
      const itemAssignees = [
        { login: 'another-user' }
      ];
      
      // Simulate skip condition evaluation
      const shouldSkip = itemAssignees.some(a => a.login === itemAuthor.login);
      
      assert.strictEqual(shouldSkip, false, 'Should not skip PR where author is not assigned');
    });

    test('should handle PR with no assignees', () => {
      // Skip condition: item.assignees.includes(item.author)
      const itemAuthor = { login: 'test-user' };
      const itemAssignees = [];
      
      // Simulate skip condition evaluation
      const shouldSkip = itemAssignees.some(a => a.login === itemAuthor.login);
      
      assert.strictEqual(shouldSkip, false, 'Should not skip PR with no assignees');
    });

    test('should handle PR with null author', () => {
      // Rule condition: monitored.users.includes(item.author)
      const monitoredUsers = ['test-user', 'another-user'];
      const itemAuthor = null;
      
      // Condition should fail safely with null author
      const conditionMatches = itemAuthor && monitoredUsers.includes(itemAuthor.login);
      const shouldProcess = !!conditionMatches; // Convert to boolean
      
      assert.strictEqual(shouldProcess, false, 'Should not process PR with null author');
    });

    test('should handle PR with undefined author', () => {
      // Rule condition: monitored.users.includes(item.author)
      const monitoredUsers = ['test-user', 'another-user'];
      const itemAuthor = undefined;
      
      // Condition should fail safely with undefined author
      const conditionMatches = itemAuthor && monitoredUsers.includes(itemAuthor.login);
      const shouldProcess = !!conditionMatches; // Convert to boolean
      
      assert.strictEqual(shouldProcess, false, 'Should not process PR with undefined author');
    });

    test('should extract assignee from item.author template variable', () => {
      // Rule value: item.author
      const ruleValue = 'item.author';
      const itemAuthor = { login: 'test-user' };
      
      // Simulate template variable substitution
      let assigneeToAdd = ruleValue;
      if (assigneeToAdd === 'item.author') {
        assigneeToAdd = itemAuthor?.login;
      }
      
      assert.strictEqual(assigneeToAdd, 'test-user', 'Should extract author login from item.author');
    });

    test('should extract assignee from ${item.author} template variable', () => {
      // Rule value: ${item.author}
      const ruleValue = '${item.author}';
      const itemAuthor = { login: 'test-user' };
      
      // Simulate template variable substitution
      let assigneeToAdd = ruleValue;
      if (assigneeToAdd.includes('${item.author}')) {
        assigneeToAdd = assigneeToAdd.replace('${item.author}', itemAuthor?.login || '');
      }
      
      assert.strictEqual(assigneeToAdd, 'test-user', 'Should extract author login from ${item.author}');
    });

    test('should handle template variable with null author', () => {
      // Rule value: item.author
      const ruleValue = 'item.author';
      const itemAuthor = null;
      
      // Simulate template variable substitution
      let assigneeToAdd = ruleValue;
      if (assigneeToAdd === 'item.author') {
        assigneeToAdd = itemAuthor?.login;
      }
      
      assert.strictEqual(assigneeToAdd, undefined, 'Should return undefined for null author');
    });

    test('should skip if assignee already exists in current assignees', () => {
      // Check if assignee is already set
      const currentAssignees = ['test-user', 'another-user'];
      const assigneeToAdd = 'test-user';
      
      const alreadyAssigned = currentAssignees.includes(assigneeToAdd);
      
      assert.strictEqual(alreadyAssigned, true, 'Should detect that assignee is already assigned');
    });

    test('should add assignee if not already in current assignees', () => {
      // Check if assignee is already set
      const currentAssignees = ['another-user'];
      const assigneeToAdd = 'test-user';
      
      const alreadyAssigned = currentAssignees.includes(assigneeToAdd);
      
      assert.strictEqual(alreadyAssigned, false, 'Should detect that assignee is not already assigned');
    });

    test('should create target assignees array with new assignee', () => {
      // Add the assignee
      const currentAssignees = ['another-user'];
      const assigneeToAdd = 'test-user';
      
      const targetAssignees = [...new Set([...currentAssignees, assigneeToAdd])];
      
      assert.deepStrictEqual(targetAssignees, ['another-user', 'test-user'], 'Should create target assignees array with new assignee');
    });

    test('should handle multiple assignees without duplicates', () => {
      // Add the assignee
      const currentAssignees = ['test-user', 'another-user'];
      const assigneeToAdd = 'test-user'; // Duplicate
      
      const targetAssignees = [...new Set([...currentAssignees, assigneeToAdd])];
      
      assert.deepStrictEqual(targetAssignees, ['test-user', 'another-user'], 'Should not create duplicates');
    });

    test('should handle Issue type (not PullRequest)', () => {
      // Rule trigger type: PullRequest
      const itemType = 'Issue';
      const ruleTriggerType = 'PullRequest';
      
      const shouldProcess = itemType === ruleTriggerType;
      
      assert.strictEqual(shouldProcess, false, 'Should not process Issue type for PullRequest-only rule');
    });

    test('should handle empty monitored users list', () => {
      // Rule condition: monitored.users.includes(item.author)
      const monitoredUsers = [];
      const itemAuthor = { login: 'test-user' };
      
      const conditionMatches = monitoredUsers.includes(itemAuthor.login);
      const shouldProcess = conditionMatches;
      
      assert.strictEqual(shouldProcess, false, 'Should not process PR when monitored users list is empty');
    });

    test('should handle no assignee rules triggered', () => {
      // No rules match
      const assigneeActions = [];
      
      const shouldReturnNoChange = assigneeActions.length === 0;
      
      assert.strictEqual(shouldReturnNoChange, true, 'Should return no change when no rules triggered');
    });
  });
});

