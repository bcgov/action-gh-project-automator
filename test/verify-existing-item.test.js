import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { shouldAddItemToProject } from '../src/rules/add-items.js';

describe('Existing item detection', () => {
    test('should verify detection criteria for issues and PRs', () => {
        const monitoredUser = 'test-user';
        const monitoredRepos = new Set(['org/monitored-repo']);

        // Case 1: Item in monitored repo
        const itemInRepo = {
            __typename: 'Issue',
            number: 1,
            repository: { nameWithOwner: 'org/monitored-repo' },
            assignees: { nodes: [] }
        };
        assert.strictEqual(shouldAddItemToProject(itemInRepo, monitoredUser, monitoredRepos), true, 'Should add items from monitored repos');

        // Case 2: PR authored by monitored user (not in monitored repo)
        const prByAuthor = {
            __typename: 'PullRequest',
            number: 2,
            repository: { nameWithOwner: 'other/repo' },
            author: { login: 'test-user' },
            assignees: { nodes: [] }
        };
        assert.strictEqual(shouldAddItemToProject(prByAuthor, monitoredUser, monitoredRepos), true, 'Should add PRs authored by monitored user');

        // Case 3: Issue assigned to monitored user (not in monitored repo)
        const assignedIssue = {
            __typename: 'Issue',
            number: 3,
            repository: { nameWithOwner: 'other/repo' },
            assignees: { nodes: [{ login: 'test-user' }] }
        };
        assert.strictEqual(shouldAddItemToProject(assignedIssue, monitoredUser, monitoredRepos), true, 'Should add issues assigned to monitored user');

        // Case 4: Item that doesn't match any criteria
        const otherItem = {
            __typename: 'Issue',
            number: 4,
            repository: { nameWithOwner: 'other/repo' },
            assignees: { nodes: [{ login: 'other-user' }] }
        };
        assert.strictEqual(shouldAddItemToProject(otherItem, monitoredUser, monitoredRepos), false, 'Should not add items that do not match criteria');
    });
});

