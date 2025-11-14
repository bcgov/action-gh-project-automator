import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getProjectItems, __resetProjectCaches } from '../../src/github/api.js';
import { Logger } from '../../src/utils/log.js';

function buildOverrides({ responses = [], shouldProceedResult = { proceed: true } } = {}) {
  const graphqlCalls = [];
  const queue = Array.isArray(responses) ? [...responses] : [];

  return {
    overrides: {
      shouldProceedFn: async () => shouldProceedResult,
      withBackoffFn: async operation => await operation(),
      graphqlClient: async (query, variables) => {
        graphqlCalls.push({ query, variables });
        if (queue.length === 0) {
          return {
            node: {
              items: {
                nodes: [],
                pageInfo: { hasNextPage: false, endCursor: null }
              }
            }
          };
        }
        return queue.shift();
      }
    },
    graphqlCalls
  };
}

test('getProjectItems paginates results and caches responses', async () => {
  __resetProjectCaches();
  const { overrides, graphqlCalls } = buildOverrides({
    responses: [
      {
        node: {
          items: {
            nodes: [
              { id: 'pi-1', content: { id: 'content-1' } }
            ],
            pageInfo: { hasNextPage: true, endCursor: 'cursor-1' }
          }
        }
      },
      {
        node: {
          items: {
            nodes: [
              { id: 'pi-2', content: { id: 'content-2' } },
              { id: 'pi-3', content: { id: 'content-3' } }
            ],
            pageInfo: { hasNextPage: false, endCursor: null }
          }
        }
      }
    ]
  });

  const first = await getProjectItems('proj-123', { overrides });
  assert.equal(first.size, 3);
  assert.equal(first.get('content-1'), 'pi-1');
  assert.equal(first.get('content-3'), 'pi-3');
  assert.equal(graphqlCalls.length, 2, 'GraphQL should be invoked for each page');

  const cached = await getProjectItems('proj-123', { overrides });
  assert.strictEqual(cached, first, 'Cache should be reused without forceRefresh');
  assert.equal(graphqlCalls.length, 2, 'Cache hit should not trigger additional GraphQL calls');

  const refreshed = await getProjectItems('proj-123', { overrides, forceRefresh: true });
  assert.ok(refreshed instanceof Map);
  assert.equal(graphqlCalls.length, 3, 'forceRefresh should trigger another GraphQL call');
});

test('getProjectItems skips when rate limit guard fails', async () => {
  __resetProjectCaches();
  const logger = new Logger();
  const infos = [];
  logger.info = message => infos.push(message);

  const { overrides, graphqlCalls } = buildOverrides({
    shouldProceedResult: { proceed: false, remaining: 10, limit: 500, resetAt: 'soon' }
  });

  const items = await getProjectItems('proj-rate-limited', { overrides, logger });
  assert.equal(items.size, 0);
  assert.equal(graphqlCalls.length, 0, 'GraphQL should not be invoked when guard fails');
  assert.ok(
    infos.some(message => message.includes('Skipping full project item preload due to low rate limit')),
    'Logger should record rate limit skip'
  );
});
