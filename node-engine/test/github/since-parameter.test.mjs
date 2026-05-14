import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRecentItems } from '../../src/github/api.js';

test('getRecentItems - Gapless Sync Search Query Construction', async (t) => {
  const calls = [];
  const overrides = {
    shouldProceedFn: async () => ({ proceed: true }),
    withBackoffFn: async operation => operation(),
    graphqlClient: async (_query, variables) => {
      calls.push(variables.searchQuery);
      return { search: { nodes: [] } };
    }
  };

  await t.test('uses absolute since parameter when provided (Watermark Pattern)', async () => {
    calls.length = 0;
    const since = '2025-06-12T10:00:00Z';
    await getRecentItems('org', ['repo1'], 'user', undefined, { overrides, since });

    assert.ok(calls.length > 0, 'Search calls should be made');
    for (const query of calls) {
      assert.ok(query.includes(`updated:>=${since}`), `Query should include updated:>=${since}`);
    }
  });

  await t.test('falls back to 24h window if no since provided', async () => {
    calls.length = 0;
    const now = Date.now();
    await getRecentItems('org', ['repo1'], 'user', 24, { overrides });

    assert.ok(calls.length > 0, 'Search calls should be made');
    for (const query of calls) {
      assert.ok(query.includes('updated:>='), `Query should include updated condition: ${query}`);
      // Find timestamp in string and verify it's close to 24 hours ago
      const timestampMatch = query.match(/updated:>=([^ ]+)/);
      if (timestampMatch) {
         const tDate = new Date(timestampMatch[1]);
         const diff = now - tDate.getTime();
         // Close enough to 24 hours (86.4M ms)
         assert.ok(Math.abs(diff - 24 * 60 * 60 * 1000) < 60000, `Expected ~24h diff, got ${diff}`);
      }
    }
  });
  
  await t.test('is prioritized appropriately if since is present', async () => {
    const watermarkSince = '2025-01-01T00:00:00Z';
    // Repos and org-level searches should all use the watermark
    await getRecentItems('bcgov', ['some-repo'], 'derek', 1, { overrides, since: watermarkSince });
    
    const repoCall = calls.find(c => c.includes('repo:bcgov/some-repo'));
    const authorCall = calls.find(c => c.includes('author:derek'));
    
    assert.ok(repoCall.includes(`updated:>=${watermarkSince}`), 'Repo search should use watermark');
    assert.ok(authorCall.includes(`updated:>=${watermarkSince}`), 'Author search should use watermark');
  });
});
