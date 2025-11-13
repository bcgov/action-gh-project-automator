import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../../src/github/api.js';

test('getProjectItems aggregates across paginated responses', async (t) => {
  api.__resetProjectCaches();

  const graphqlResponses = [
    {
      rateLimit: {
        remaining: 500,
        limit: 5000,
        resetAt: '2024-01-01T00:00:00Z',
        cost: 1
      }
    },
    {
      node: {
        items: {
          nodes: [
            { id: 'projItem-1', content: { id: 'content-1' } },
            { id: 'projItem-2', content: { id: 'content-2' } }
          ],
          pageInfo: {
            hasNextPage: true,
            endCursor: 'cursor-1'
          }
        }
      }
    },
    {
      node: {
        items: {
          nodes: [
            { id: 'projItem-3', content: { id: 'content-3' } }
          ],
          pageInfo: {
            hasNextPage: false,
            endCursor: null
          }
        }
      }
    }
  ];

  let callIndex = 0;
  api.__setGraphqlExecutor(async () => graphqlResponses[callIndex++]);

  const items = await api.getProjectItems('proj-pagination');

  assert.equal(items.size, 3);
  assert.equal(items.get('content-1'), 'projItem-1');
  assert.equal(items.get('content-3'), 'projItem-3');
  assert.equal(callIndex, 3, 'expected rate limit check plus two GraphQL calls for pagination');

  api.__resetGraphqlExecutor();
  api.__resetProjectCaches();
});

