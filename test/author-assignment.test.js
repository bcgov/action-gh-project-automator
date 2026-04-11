import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadBoardRules } from '../src/config/board-rules.js';

describe('PRs authored by monitored user in any repository', () => {
    test('Processing logic for monitored author', async () => {
        const config = await loadBoardRules();
        const monitoredUsers = config.monitoredUsers || [config.monitoredUser];
        const primaryUser = monitoredUsers[0];
        
        // Test 1: PR authored by monitored user
        const pr = {
            id: 'PVTI_test123',
            __typename: 'PullRequest',
            number: 123,
            author: { login: primaryUser },
            repository: { 
                nameWithOwner: 'any-org/any-repo'
            }
        };
        
        // Simulating the core rule: monitored.users.includes(item.author)
        const isMonitoredAuthor = monitoredUsers.includes(pr.author.login);
        assert.ok(isMonitoredAuthor, `Should identify PR authored by ${primaryUser}`);
        
        // Test 2: PR from different author
        const otherPr = {
            author: { login: 'other-user' }
        };
        const isOtherMonitored = monitoredUsers.includes(otherPr.author.login);
        assert.strictEqual(isOtherMonitored, false, 'Should not identify PR from other author');
    });
});
