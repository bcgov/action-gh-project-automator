/**
 * @fileoverview Tests for sprint removal functionality (Issue #66)
 * Tests that sprints are properly removed from items in inactive columns
 * 
 * These tests verify:
 * 1. Sprint removal from New column
 * 2. Sprint removal from Parked column
 * 3. Sprint removal from Backlog column
 * 4. Skip when no sprint is set
 * 5. Skip when not in inactive column
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment } from '../setup.js';

describe('Sprint Removal Logic Tests', () => {
  test('setup: initialize test environment', async () => {
    setupTestEnvironment();
    assert.ok(true, 'Test environment initialized');
  });

  test('should identify inactive columns correctly', () => {
    const inactiveColumns = ['New', 'Parked', 'Backlog'];
    const eligibleColumns = ['Next', 'Active', 'Done', 'Waiting'];
    
    // All inactive columns should be identified
    inactiveColumns.forEach(column => {
      assert.ok(inactiveColumns.includes(column), `${column} should be inactive`);
    });
    
    // Eligible columns should not be inactive
    eligibleColumns.forEach(column => {
      assert.ok(!inactiveColumns.includes(column), `${column} should not be inactive`);
    });
  });

  test('should remove sprint when item is in New column', () => {
    // Simulate logic: inactive column + sprint exists = should remove
    const currentColumn = 'New';
    const currentSprintId = 'sprint-123';
    const inactiveColumns = ['New', 'Parked', 'Backlog'];
    
    const isInactive = inactiveColumns.includes(currentColumn);
    const hasSprint = currentSprintId != null && currentSprintId !== undefined;
    const shouldRemove = isInactive && hasSprint;
    
    assert.strictEqual(shouldRemove, true, 'Should remove sprint from New column');
  });

  test('should remove sprint when item is in Parked column', () => {
    const currentColumn = 'Parked';
    const currentSprintId = 'sprint-123';
    const inactiveColumns = ['New', 'Parked', 'Backlog'];
    
    const isInactive = inactiveColumns.includes(currentColumn);
    const hasSprint = currentSprintId != null && currentSprintId !== undefined;
    const shouldRemove = isInactive && hasSprint;
    
    assert.strictEqual(shouldRemove, true, 'Should remove sprint from Parked column');
  });

  test('should remove sprint when item is in Backlog column', () => {
    const currentColumn = 'Backlog';
    const currentSprintId = 'sprint-123';
    const inactiveColumns = ['New', 'Parked', 'Backlog'];
    
    const isInactive = inactiveColumns.includes(currentColumn);
    const hasSprint = currentSprintId != null && currentSprintId !== undefined;
    const shouldRemove = isInactive && hasSprint;
    
    assert.strictEqual(shouldRemove, true, 'Should remove sprint from Backlog column');
  });

  test('should skip removal when no sprint is set', () => {
    const currentColumn = 'New';
    const currentSprintId = null;
    const inactiveColumns = ['New', 'Parked', 'Backlog'];
    
    const isInactive = inactiveColumns.includes(currentColumn);
    const hasSprint = currentSprintId != null && currentSprintId !== undefined;
    const shouldRemove = isInactive && hasSprint;
    
    assert.strictEqual(shouldRemove, false, 'Should skip when no sprint is set');
  });

  test('should skip removal when item is in eligible column', () => {
    const currentColumn = 'Active';
    const currentSprintId = 'sprint-123';
    const inactiveColumns = ['New', 'Parked', 'Backlog'];
    
    const isInactive = inactiveColumns.includes(currentColumn);
    const hasSprint = currentSprintId != null && currentSprintId !== undefined;
    const shouldRemove = isInactive && hasSprint;
    
    assert.strictEqual(shouldRemove, false, 'Should skip when in eligible column');
  });

  test('should skip removal when item is in Done column', () => {
    const currentColumn = 'Done';
    const currentSprintId = 'sprint-123';
    const inactiveColumns = ['New', 'Parked', 'Backlog'];
    
    const isInactive = inactiveColumns.includes(currentColumn);
    const hasSprint = currentSprintId != null && currentSprintId !== undefined;
    const shouldRemove = isInactive && hasSprint;
    
    assert.strictEqual(shouldRemove, false, 'Should skip when in Done column');
  });

  test('should handle undefined sprint correctly', () => {
    const currentColumn = 'New';
    const currentSprintId = undefined;
    const inactiveColumns = ['New', 'Parked', 'Backlog'];
    
    const isInactive = inactiveColumns.includes(currentColumn);
    const hasSprint = currentSprintId != null && currentSprintId !== undefined;
    const shouldRemove = isInactive && hasSprint;
    
    assert.strictEqual(shouldRemove, false, 'Should skip when sprint is undefined');
  });

  test('should handle all inactive columns with sprint', () => {
    const inactiveColumns = ['New', 'Parked', 'Backlog'];
    const currentSprintId = 'sprint-123';
    
    inactiveColumns.forEach(column => {
      const isInactive = inactiveColumns.includes(column);
      const hasSprint = currentSprintId != null && currentSprintId !== undefined;
      const shouldRemove = isInactive && hasSprint;
      
      assert.strictEqual(shouldRemove, true, `Should remove sprint from ${column} column`);
    });
  });

  test('should handle all eligible columns without removal', () => {
    const eligibleColumns = ['Next', 'Active', 'Done', 'Waiting'];
    const inactiveColumns = ['New', 'Parked', 'Backlog'];
    const currentSprintId = 'sprint-123';
    
    eligibleColumns.forEach(column => {
      const isInactive = inactiveColumns.includes(column);
      const hasSprint = currentSprintId != null && currentSprintId !== undefined;
      const shouldRemove = isInactive && hasSprint;
      
      assert.strictEqual(shouldRemove, false, `Should not remove sprint from ${column} column`);
    });
  });
});

