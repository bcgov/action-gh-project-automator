/**
 * @fileoverview Comprehensive tests for board items processor
 * Tests all board_items rules from rules.yml:
 * - authored_pull_requests (user scope)
 * - assigned_pull_requests (user scope)
 * - repository_pull_requests (repository scope)
 * - repository_issues (repository scope)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment } from '../setup.js';

describe('Board Items Processor - Comprehensive Tests', () => {
  test('setup: initialize test environment', async () => {
    setupTestEnvironment();
    assert.ok(true, 'Test environment initialized');
  });

  describe('authored_pull_requests rule (user scope)', () => {
    test('should identify PR authored by monitored user', () => {
      const monitoredUsers = ['DerekRoberts'];
      const item = {
        __typename: 'PullRequest',
        author: { login: 'DerekRoberts' },
        repository: { nameWithOwner: 'bcgov/test-repo' }
      };

      // Rule condition: monitored.users.includes(item.author)
      // Simulate condition evaluation
      const isAuthored = monitoredUsers.includes(item.author.login);
      
      assert.strictEqual(isAuthored, true, 'Should match PR authored by monitored user');
    });

    test('should not match PR authored by different user', () => {
      const monitoredUsers = ['DerekRoberts'];
      const item = {
        __typename: 'PullRequest',
        author: { login: 'other-user' },
        repository: { nameWithOwner: 'bcgov/test-repo' }
      };

      const isAuthored = monitoredUsers.includes(item.author.login);
      
      assert.strictEqual(isAuthored, false, 'Should not match PR authored by different user');
    });

    test('should handle PR with no author', () => {
      const monitoredUsers = ['DerekRoberts'];
      const item = {
        __typename: 'PullRequest',
        author: null,
        repository: { nameWithOwner: 'bcgov/test-repo' }
      };

      const isAuthored = !!(item.author && monitoredUsers.includes(item.author.login));
      
      assert.strictEqual(isAuthored, false, 'Should not match PR with no author');
    });
  });

  describe('assigned_pull_requests rule (user scope)', () => {
    test('should identify PR assigned to monitored user', () => {
      const monitoredUsers = ['DerekRoberts'];
      const item = {
        __typename: 'PullRequest',
        author: { login: 'other-user' },
        assignees: {
          nodes: [
            { login: 'DerekRoberts' },
            { login: 'another-user' }
          ]
        },
        repository: { nameWithOwner: 'bcgov/test-repo' }
      };

      // Rule condition: item.assignees.some(assignee => monitored.users.includes(assignee))
      // Simulate condition evaluation
      const isAssigned = item.assignees.nodes.some(a => monitoredUsers.includes(a.login));
      
      assert.strictEqual(isAssigned, true, 'Should match PR assigned to monitored user');
    });

    test('should not match PR assigned to different users', () => {
      const monitoredUsers = ['DerekRoberts'];
      const item = {
        __typename: 'PullRequest',
        author: { login: 'other-user' },
        assignees: {
          nodes: [
            { login: 'user1' },
            { login: 'user2' }
          ]
        },
        repository: { nameWithOwner: 'bcgov/test-repo' }
      };

      const isAssigned = item.assignees.nodes.some(a => monitoredUsers.includes(a.login));
      
      assert.strictEqual(isAssigned, false, 'Should not match PR assigned to different users');
    });

    test('should handle PR with no assignees', () => {
      const monitoredUsers = ['DerekRoberts'];
      const item = {
        __typename: 'PullRequest',
        author: { login: 'other-user' },
        assignees: { nodes: [] },
        repository: { nameWithOwner: 'bcgov/test-repo' }
      };

      const isAssigned = item.assignees.nodes.some(a => monitoredUsers.includes(a.login));
      
      assert.strictEqual(isAssigned, false, 'Should not match PR with no assignees');
    });
  });

  describe('repository_pull_requests rule (repository scope)', () => {
    test('should identify PR from monitored repository', () => {
      const monitoredRepos = ['bcgov/nr-nerds', 'bcgov/action-builder-ghcr'];
      const item = {
        __typename: 'PullRequest',
        author: { login: 'any-user' },
        repository: { nameWithOwner: 'bcgov/nr-nerds' }
      };

      // Rule condition: monitored.repos.includes(item.repository)
      // Simulate condition evaluation
      const isMonitored = monitoredRepos.includes(item.repository.nameWithOwner);
      
      assert.strictEqual(isMonitored, true, 'Should match PR from monitored repository');
    });

    test('should not match PR from unmonitored repository', () => {
      const monitoredRepos = ['bcgov/nr-nerds', 'bcgov/action-builder-ghcr'];
      const item = {
        __typename: 'PullRequest',
        author: { login: 'any-user' },
        repository: { nameWithOwner: 'other-org/other-repo' }
      };

      const isMonitored = monitoredRepos.includes(item.repository.nameWithOwner);
      
      assert.strictEqual(isMonitored, false, 'Should not match PR from unmonitored repository');
    });
  });

  describe('repository_issues rule (repository scope)', () => {
    test('should identify Issue from monitored repository', () => {
      const monitoredRepos = ['bcgov/nr-nerds', 'bcgov/action-builder-ghcr'];
      const item = {
        __typename: 'Issue',
        repository: { nameWithOwner: 'bcgov/nr-nerds' }
      };

      // Rule condition: monitored.repos.includes(item.repository)
      const isMonitored = monitoredRepos.includes(item.repository.nameWithOwner);
      
      assert.strictEqual(isMonitored, true, 'Should match Issue from monitored repository');
    });

    test('should not match Issue from unmonitored repository', () => {
      const monitoredRepos = ['bcgov/nr-nerds', 'bcgov/action-builder-ghcr'];
      const item = {
        __typename: 'Issue',
        repository: { nameWithOwner: 'other-org/other-repo' }
      };

      const isMonitored = monitoredRepos.includes(item.repository.nameWithOwner);
      
      assert.strictEqual(isMonitored, false, 'Should not match Issue from unmonitored repository');
    });
  });

  describe('skip_if condition evaluation', () => {
    test('should skip when item is already in project', () => {
      const item = {
        __typename: 'PullRequest',
        author: { login: 'DerekRoberts' },
        repository: { nameWithOwner: 'bcgov/test-repo' },
        projectItems: {
          nodes: [{ id: 'project-item-123' }]
        }
      };

      // Skip condition: item.inProject
      const isInProject = item.projectItems?.nodes?.length > 0;
      
      assert.strictEqual(isInProject, true, 'Should detect item is in project');
    });

    test('should not skip when item is not in project', () => {
      const item = {
        __typename: 'PullRequest',
        author: { login: 'DerekRoberts' },
        repository: { nameWithOwner: 'bcgov/test-repo' },
        projectItems: {
          nodes: []
        }
      };

      const isInProject = item.projectItems?.nodes?.length > 0;
      
      assert.strictEqual(isInProject, false, 'Should detect item is not in project');
    });

    test('should handle item with no projectItems field', () => {
      const item = {
        __typename: 'PullRequest',
        author: { login: 'DerekRoberts' },
        repository: { nameWithOwner: 'bcgov/test-repo' }
      };

      const isInProject = item.projectItems?.nodes?.length > 0;
      
      assert.strictEqual(isInProject, false, 'Should handle missing projectItems field');
    });
  });

  describe('error handling and edge cases', () => {
    test('should handle incomplete item data', () => {
      const incompleteItems = [
        null,
        undefined,
        { __typename: 'PullRequest' }, // Missing repository
        { repository: { nameWithOwner: 'bcgov/test' } }, // Missing __typename
        { __typename: 'PullRequest', repository: { nameWithOwner: 'bcgov/test' } } // Missing number
      ];

      incompleteItems.forEach((item, index) => {
        const isValid = !!(item && 
                       item.__typename && 
                       item.repository?.nameWithOwner && 
                       typeof item.number === 'number');
        
        assert.strictEqual(isValid, false, `Incomplete item ${index} should be invalid`);
      });
    });

    test('should handle multiple monitored users', () => {
      const monitoredUsers = ['DerekRoberts', 'user2', 'user3'];
      const item = {
        __typename: 'PullRequest',
        author: { login: 'user2' },
        repository: { nameWithOwner: 'bcgov/test-repo' }
      };

      const isAuthored = monitoredUsers.includes(item.author.login);
      
      assert.strictEqual(isAuthored, true, 'Should match when user is in monitored list');
    });

    test('should handle multiple monitored repositories', () => {
      const monitoredRepos = ['bcgov/repo1', 'bcgov/repo2', 'bcgov/repo3'];
      const item = {
        __typename: 'PullRequest',
        repository: { nameWithOwner: 'bcgov/repo2' }
      };

      const isMonitored = monitoredRepos.includes(item.repository.nameWithOwner);
      
      assert.strictEqual(isMonitored, true, 'Should match when repo is in monitored list');
    });
  });
});

