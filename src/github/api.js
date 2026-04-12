import { Octokit } from '@octokit/rest';
import { graphql } from '@octokit/graphql';
import { log } from '../utils/log.js';
import { shouldProceed, withBackoff, formatRateLimitInfo, RatePriority, taskQueue } from '../utils/rate-limit.js';
import { memoizeGraphql } from '../utils/graphql-cache.js';

/**
 * GitHub API client setup
 */
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

// Create authenticated GraphQL client with debug logging
const graphqlWithAuthRaw = graphql.defaults({
  headers: {
    authorization: `bearer ${process.env.GITHUB_TOKEN}`,
  },
  request: {
    fetch: (url, options) => {
      log.debug('GraphQL Request:', JSON.stringify(options.body, null, 2));
      return fetch(url, options).then(response => {
        log.debug('GraphQL Response:', response.status);
        return response;
      });
    }
  }
});

// Create memoized version of the raw client
const memoizedGraphql = memoizeGraphql(graphqlWithAuthRaw);

// Default execution wrapped in TaskQueue; priority can be overridden
let graphqlExecutor = async (query, variables, priority = RatePriority.STANDARD) => 
  taskQueue.enqueue(() => memoizedGraphql(query, variables), priority);

const graphqlWithAuth = async (query, variables, priority) => graphqlExecutor(query, variables, priority);

// Create prioritized REST client wrapper
const restWithAuth = new Proxy(octokit.rest, {
  get(target, prop) {
    if (typeof target[prop] === 'function') {
      return (...args) => taskQueue.enqueue(() => target[prop](...args), RatePriority.STANDARD);
    }
    if (typeof target[prop] === 'object' && target[prop] !== null) {
      return new Proxy(target[prop], {
        get(t, p) {
          if (typeof t[p] === 'function') {
            return (...args) => taskQueue.enqueue(() => t[p](...args), RatePriority.STANDARD);
          }
          return t[p];
        }
      });
    }
    return target[prop];
  }
});

// Register rate limit provider to avoid circular dynamic imports
taskQueue.setRateLimitProvider(async () => {
  try {
    // MUST use raw client to avoid deadlock (rate limit check can't be queued)
    const res = await graphqlWithAuthRaw(`query { rateLimit { remaining limit resetAt cost } }`);
    return res.rateLimit;
  } catch (error) {
    log.warning(`Rate limit provider check failed: ${error.message}`);
    return null;
  }
});

function __setGraphqlExecutor(executor) {
  graphqlExecutor = executor;
}

function __resetGraphqlExecutor() {
  graphqlExecutor = async (query, variables) => withBackoff(() => memoizedGraphql(query, variables));
}

// Cache field IDs per project to reduce API calls
const fieldIdCache = new Map();

// Cache for column option IDs
const columnOptionIdCache = new Map();

// Cache project items during a single run
const projectItemsCache = new Map();

// Cache Status options per project (id -> name mapping)
const statusOptionsCache = new Map();

/**
 * Get and cache the Status field options for a project board.
 * Caches the array of { id, name } for the duration of the run.
 *
 * @param {string} projectId - The ProjectV2 node ID
 * @returns {Promise<Array<{id: string, name: string}>>} Status options list
 */
async function getStatusOptions(projectId) {
  if (statusOptionsCache.has(projectId)) {
    return statusOptionsCache.get(projectId);
  }
  const result = await graphqlWithAuth(`
    query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          field(name: "Status") {
            ... on ProjectV2SingleSelectField {
              options { id name }
            }
          }
        }
      }
    }
  `, { projectId }, RatePriority.STANDARD);
  if (!result.node || !result.node.field) {
    log.error(`Status field not found in project ${projectId}. Please check project configuration.`);
    statusOptionsCache.set(projectId, []);
    return [];
  }
  const list = result.node.field.options || [];
  statusOptionsCache.set(projectId, list);
  return list;
}

/**
 * Get the column option ID for a given column name
 * @param {string} projectId - The project board ID
 * @param {string} columnName - The name of the column (Status field option)
 * @returns {Promise<string|null>} The column option ID or null if not found
 */
async function getColumnOptionId(projectId, columnName) {
  const cacheKey = `${projectId}:${columnName}`;
  if (columnOptionIdCache.has(cacheKey)) {
    return columnOptionIdCache.get(cacheKey);
  }
  try {
    const options = await getStatusOptions(projectId);
    const option = options.find(opt => opt.name === columnName);
    if (option) {
      columnOptionIdCache.set(cacheKey, option.id);
      return option.id;
    }
    log.error(`Column option "${columnName}" not found in project ${projectId}`);
    return null;
  } catch (error) {
    log.error(`Failed to get column option ID for ${columnName}: ${error.message}`);
    return null;
  }
}

/**
 * Get all items from a project board with caching.
 * @param {string} projectId - Graphql node ID of the project
 * @param {Object} options - Options for retrieval
 * @param {boolean} [options.forceRefresh=false] - Force a cache refresh for the project.
 * @param {boolean} [options.skipRateGuard=false] - If true, bypass initial rate limit check
 * @param {Logger} [options.logger] - Logger instance to use for informational messages. Defaults to the global log instance.
 * @param {Function} [options.shouldProceedFn=shouldProceed] - Rate limit check function
 * @param {Object} [options.overrides] - Optional dependency overrides, primarily for tests.
 * @param {Function} [options.overrides.withBackoffFn] - Custom retry/backoff wrapper.
 * @param {Function} [options.overrides.graphqlClient] - Custom GraphQL executor.
 * @returns {Promise<Map<string, string>>} Map of content node IDs to project item IDs.
 */
async function getProjectItems(projectId, options = {}) {
  const {
    forceRefresh = false,
    skipRateGuard = false,
    logger = log,
    overrides = {}
  } = options;

  const {
    shouldProceedFn = shouldProceed,
    withBackoffFn = withBackoff,
    graphqlClient = graphqlWithAuth
  } = overrides;

  if (!forceRefresh && projectItemsCache.has(projectId)) {
    return projectItemsCache.get(projectId);
  }

  if (forceRefresh) {
    projectItemsCache.delete(projectId);
  }

  if (!skipRateGuard) {
    // Project item preloading is considered MAINTENANCE since we can fall back to direct lookups
    const rateStatus = await shouldProceedFn(RatePriority.MAINTENANCE);
    if (!rateStatus.proceed) {
      const remainingInfo = formatRateLimitInfo(rateStatus);
      logger.info(`Skipping full project item preload due to low rate limit${remainingInfo}`);
      return new Map();
    }
  }

  const items = new Map();
  let hasNextPage = true;
  let endCursor = null;
  let totalItems = 0;

  while (hasNextPage && totalItems < 300) { // Safety limit
    const variables = { id: projectId, cursor: endCursor };
    const operation = () => graphqlClient(`
      query($id: ID!, $cursor: String) {
        node(id: $id) {
          ... on ProjectV2 {
            items(first: 100, after: $cursor) {
              nodes {
                id
                content {
                  ... on Issue { id }
                  ... on PullRequest { id }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      }
    `, variables);

    const result = (overrides.graphqlClient || overrides.withBackoffFn)
      ? await withBackoffFn(operation)
      : await taskQueue.enqueue(operation, RatePriority.MAINTENANCE);

    const projectItems = result.node?.items?.nodes || [];
    totalItems += projectItems.length;

    for (const item of projectItems) {
      if (item.content?.id) {
        items.set(item.content.id, item.id);
      }
    }

    hasNextPage = result.node?.items?.pageInfo?.hasNextPage || false;
    endCursor = result.node?.items?.pageInfo?.endCursor;
  }

  projectItemsCache.set(projectId, items);
  return items;
}

/**
 * Check if an item is already in the project board
 * @param {string} nodeId - The node ID of the item (PR or Issue)
 * @param {string} projectId - The project board ID
 * @returns {Promise<{isInProject: boolean, projectItemId?: string}>} - Whether the item is in the project and its project item ID if found
 */
async function isItemInProject(nodeId, projectId) {
  try {
    // First check the cache. skipRateGuard avoids rate checks because this is a cache-only lookup.
    const projectItems = await getProjectItems(projectId, { skipRateGuard: true, forceRefresh: false });
    const projectItemId = projectItems.get(nodeId);

    // If found in cache, return immediately
    if (projectItemId) {
      return {
        isInProject: true,
        projectItemId
      };
    }

    // If not in cache, query the project items directly
    const result = await graphqlWithAuth(`
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            items(first: 100) {
              nodes {
                id
                content {
                  ... on PullRequest {
                    id
                  }
                  ... on Issue {
                    id
                  }
                }
              }
            }
          }
        }
      }
    `, {
      projectId
    }, RatePriority.CRITICAL);

    // Find the item that matches our nodeId
    const matchingItem = result.node?.items?.nodes?.find(item =>
      item.content?.id === nodeId
    );

    if (matchingItem) {
      // Update cache with the found item
      projectItems.set(nodeId, matchingItem.id);
      return {
        isInProject: true,
        projectItemId: matchingItem.id
      };
    }

    return { isInProject: false };

  } catch (error) {
    log.error(`Failed to check if item ${nodeId} is in project: ${error.message}`);
    throw error;
  }
}

/**
 * Add an item to the project board
 * @param {string} nodeId - The node ID of the item (PR or Issue)
 * @param {string} projectId - The project board ID
 * @returns {Promise<string>} - The project item ID
 */
async function addItemToProject(nodeId, projectId) {
  log.info(`[DEBUG] Starting addItemToProject for node ${nodeId} to project ${projectId}`);

  try {
    log.info(`[DEBUG] About to call withBackoff with GraphQL mutation`);
    const result = await graphqlWithAuth(`
      mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: {
          projectId: $projectId,
          contentId: $contentId
        }) {
          item {
            id
          }
        }
      }
    `, {
      projectId,
      contentId: nodeId
    }, RatePriority.CRITICAL);

    log.info(`[DEBUG] GraphQL mutation completed, result:`, result);

    if (!result.addProjectV2ItemById?.item?.id) {
      throw new Error('Failed to add item to project - missing item ID in response');
    }

    const projectItemId = result.addProjectV2ItemById.item.id;

    // Keep project cache in sync so subsequent checks see the new item immediately
    let projectItems = projectItemsCache.get(projectId);
    if (!projectItems) {
      projectItems = new Map();
      projectItemsCache.set(projectId, projectItems);
    }
    projectItems.set(nodeId, projectItemId);

    log.info(`[DEBUG] Successfully added item, returning ID: ${projectItemId}`);
    return projectItemId;
  } catch (error) {
    log.error(`[DEBUG] Error in addItemToProject: ${error.message}`);
    throw error;
  }
}

/**
 * Get recent items (PRs and Issues) from monitored repositories and user-scoped items.
 * Searches:
 * - Items in monitored repositories (limited to provided repos)
 * - PRs authored by monitored user (in allowed organizations only)
 * - Issues/PRs assigned to monitored user (in allowed organizations only)
 * @param {string} org - Organization name
 * @param {string[]} repos - List of repository names
 * @param {string} monitoredUser - GitHub username to filter for
 * @param {number} windowHours - Hours to look back for updates
 * @param {Object} options - Search options
 * @param {string[]} [options.allowedOrgs] - List of allowed organizations for author search
 * @param {Function} [options.shouldProceedFn=shouldProceed] - Override rate check logic
 * @param {Logger} [options.logger] - Logger instance
 * @param {Object} [options.overrides] - Dependency overrides
 * @returns {Promise<Array>} - List of items (PRs and Issues)
 */
async function getRecentItems(org, repos, monitoredUser, windowHours = undefined, options = {}) {
  const {
    logger = log,
    overrides = {},
    allowedOrgs = []
  } = options;

  const {
    shouldProceedFn = shouldProceed,
    withBackoffFn = withBackoff,
    graphqlClient = graphqlWithAuth
  } = overrides;

  // Determine search window (hours): env overrides param; default 24
  let hours = parseInt(process.env.UPDATE_WINDOW_HOURS || '', 10);
  if (!Number.isFinite(hours) || hours <= 0) {
    hours = Number.isFinite(windowHours) && windowHours > 0 ? windowHours : 24;
  }

  // Use explicit since date if provided, otherwise slide based on hours
  const sinceDateStr = options.since || new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  // Backfill mode: BACKFILL=<org>/<repo> searches only that repo without a date filter
  const backfillRepo = process.env.BACKFILL && process.env.BACKFILL.includes('/') ? process.env.BACKFILL : null;
  const sinceClause = backfillRepo ? '' : ` updated:>=${sinceDateStr}`;

  if (backfillRepo) {
    logger.info(`🔄 BACKFILL mode — searching only ${backfillRepo} without date filter`);
  }

  // Discovery is CRITICAL
  const rateStatus = await shouldProceedFn(RatePriority.CRITICAL);
  if (!rateStatus.proceed) {
    const info = formatRateLimitInfo(rateStatus);
    logger.info(`Skipping recent-item search due to low rate limit${info}`);
    return [];
  }

  // Search for items in monitored repositories
  // Repos may be fully qualified (org/repo) or partial (repo under default org)
  // Query each repo separately so each gets its own 1000-item GitHub API cap
  // In backfill mode, only search the specified repo
  const reposToSearch = backfillRepo ? [backfillRepo] : repos;
  const repoSearchQueries = reposToSearch.map(repo => {
    const qualifiedName = repo.includes('/') ? repo : `${org}/${repo}`;
    return `repo:${qualifiedName}${sinceClause}`;
  });

  // Search for PRs authored by monitored user in allowed organizations only
  // Author/assignee searches always use the date filter (only repo search is unlimited in backfill)
  const sinceFilter = ` updated:>=${sinceDateStr}`;
  const orgsFilter = allowedOrgs.length > 0
    ? `(${allowedOrgs.map(o => `org:${o}`).join(' OR ')})`
    : '';

  const authorSearchQuery = orgsFilter
    ? `${orgsFilter} author:${monitoredUser}${sinceFilter}`
    : `author:${monitoredUser}${sinceFilter}`;

  // Search for issues/PRs assigned to monitored user in allowed organizations only
  const assigneeSearchQuery = orgsFilter
    ? `${orgsFilter} assignee:${monitoredUser}${sinceFilter}`
    : `assignee:${monitoredUser}${sinceFilter}`;

  logger.info(`User-scoped search limited to orgs: ${allowedOrgs.join(', ') || 'all'}`);

  // In backfill mode, paginate through all pages (up to 10 pages = 1000 items).
  // In normal mode, only fetch the first page (100 items).
  const maxPages = backfillRepo ? 10 : 1;

  /**
   * Paginate through a GraphQL search query, collecting all nodes.
   */
  async function paginatedSearch(query, searchQuery, pages) {
    const nodes = [];
    let cursor = null;
    for (let page = 0; page < pages; page++) {
      const vars = { searchQuery };
      if (cursor) vars.cursor = cursor;
      const result = await withBackoffFn(() => graphqlClient(query, vars));
      nodes.push(...result.search.nodes);
      const pageInfo = result.search.pageInfo;
      if (!pageInfo || !pageInfo.hasNextPage) break;
      cursor = pageInfo.endCursor;
    }
    return nodes;
  }

  const ITEM_FRAGMENT = `
    __typename
    ... on Issue {
      id number
      repository { nameWithOwner }
      author { login }
      assignees(first: 5) { nodes { login } }
      state updatedAt
    }
    ... on PullRequest {
      id number
      repository { nameWithOwner }
      author { login }
      assignees(first: 5) { nodes { login } }
      state updatedAt
    }
  `;

  const results = [];

  // Get items from monitored repositories — one search per repo
  // so each repo gets its own 1000-item cap (GitHub limit per query)
  for (const repoQuery of repoSearchQueries) {
    const repoNodes = await paginatedSearch(`
      query($searchQuery: String!, $cursor: String) {
        search(query: $searchQuery, type: ISSUE, first: 100, after: $cursor) {
          nodes { ${ITEM_FRAGMENT} }
          pageInfo { hasNextPage endCursor }
        }
      }
    `, repoQuery, maxPages);
    results.push(...repoNodes);
  }
  logger.info(`Repo search returned ${results.length} items`);

  // Get PRs authored by monitored user in any repository
  // Always 1 page — these searches use the date filter
  const authorNodes = await paginatedSearch(`
    query($searchQuery: String!, $cursor: String) {
      search(query: $searchQuery, type: ISSUE, first: 100, after: $cursor) {
        nodes {
          __typename
          ... on PullRequest {
            id number
            repository { nameWithOwner }
            author { login }
            assignees(first: 5) { nodes { login } }
            state updatedAt
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `, authorSearchQuery, 1);
  results.push(...authorNodes);
  logger.info(`Author search returned ${authorNodes.length} items`);

  // Get issues and PRs assigned to monitored user in any repository
  // Always 1 page — these searches use the date filter
  const assigneeNodes = await paginatedSearch(`
    query($searchQuery: String!, $cursor: String) {
      search(query: $searchQuery, type: ISSUE, first: 100, after: $cursor) {
        nodes { ${ITEM_FRAGMENT} }
        pageInfo { hasNextPage endCursor }
      }
    }
  `, assigneeSearchQuery, 1);
  results.push(...assigneeNodes);
  logger.info(`Assignee search returned ${assigneeNodes.length} items`);

  // Remove duplicates based on item ID
  const seen = new Set();
  return results.filter(item => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

/**
 * Fetch issues linked to a pull request (closing references) and include project item IDs when present.
 * @param {string} pullRequestId - The GraphQL node ID of the pull request
 * @param {string} projectId - The project board ID
 * @returns {Promise<Array<{id: string, number: number, repository: {nameWithOwner: string}, projectItemId: string|null}>>}
 */
async function fetchLinkedIssuesForPullRequest(pullRequestId, projectId) {
  if (!pullRequestId) {
    return [];
  }

  const result = await graphqlWithAuth(`
    query($pullRequestId: ID!) {
      node(id: $pullRequestId) {
        ... on PullRequest {
          closingIssuesReferences(first: 50) {
            nodes {
              id
              number
              repository {
                nameWithOwner
              }
              projectItems(first: 20) {
                nodes {
                  id
                  project {
                    id
                  }
                }
              }
            }
          }
        }
      }
    }
  `, { pullRequestId }, RatePriority.STANDARD);

  const issues = result?.node?.closingIssuesReferences?.nodes || [];

  return issues.map(issue => {
    const projectItemId = issue.projectItems?.nodes?.find(node => node.project?.id === projectId)?.id || null;
    return {
      id: issue.id,
      number: issue.number,
      repository: issue.repository,
      projectItemId
    };
  });
}

/**
 * Get the current column (Status field) for a project item
 * @param {string} projectId - The project board ID
 * @param {string} itemId - The project item ID
 * @returns {Promise<string|null>} - The current column name or null
 */
async function getItemColumn(projectId, itemId) {
  const result = await graphqlWithAuth(`
    query($projectId: ID!, $itemId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          field(name: "Status") {
            ... on ProjectV2SingleSelectField {
              id
              options {
                id
                name
              }
            }
          }
        }
      }
      item: node(id: $itemId) {
        ... on ProjectV2Item {
          fieldValues(first: 10) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field {
                  ... on ProjectV2SingleSelectField {
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  `, {
    projectId,
    itemId
  }, RatePriority.STANDARD);

  const fieldValues = result.item?.fieldValues.nodes || [];
  const statusValue = fieldValues.find(value =>
    value.field && value.field.name === 'Status'
  );

  return statusValue ? statusValue.name : null;
}

/**
 * Set the column (Status field) for a project item
 * @param {string} projectId - The project board ID
 * @param {string} itemId - The project item ID
 * @param {string} optionId - The status option ID to set
 * @returns {Promise<void>}
 */
async function setItemColumn(projectId, projectItemId, optionId) {
  // Get Status field ID from cache
  const statusFieldId = await getFieldId(projectId, 'Status');

  // No-op guard: avoid write if already the same column (map optionId -> name once)
  try {
    const statusOptions = await getStatusOptions(projectId);
    const desired = statusOptions.find(o => o.id === optionId);
    if (desired && desired.name) {
      const current = await getItemColumn(projectId, projectItemId);
      if (current === desired.name) {
        log.info(`[API] setItemColumn: Skipping no-op update; item already in column '${current}'`);
        return { skipped: true };
      }
    }
  } catch (_) {
    // ignore guard failures; proceed to attempt write
  }

  const mutation = `
    mutation UpdateColumnValue($input: UpdateProjectV2ItemFieldValueInput!) {
      updateProjectV2ItemFieldValue(input: $input) {
        projectV2Item {
          id
          project {
            id
            number
          }
        }
      }
    }
  `;

  const input = {
    projectId: projectId,
    itemId: projectItemId,
    fieldId: statusFieldId,
    value: {
      singleSelectOptionId: optionId,
    },
  };

  try {
    const result = await graphqlWithAuth(mutation, { input }, RatePriority.STANDARD);
    if (!result.updateProjectV2ItemFieldValue || !result.updateProjectV2ItemFieldValue.projectV2Item) {
      log.error(`[API] setItemColumn: No projectV2Item returned for itemId=${projectItemId}, projectId=${projectId}, optionId=${optionId}`);
      log.error(`[API] setItemColumn: Full response: ${JSON.stringify(result)}`);
      throw new Error('setItemColumn: No projectV2Item in response');
    }
    log.info(`[API] setItemColumn: Successfully set column for itemId=${projectItemId} to optionId=${optionId}`);
    return result;
  } catch (error) {
    log.error(`[API] setItemColumn: Failed to set column for itemId=${projectItemId}, projectId=${projectId}, optionId=${optionId}`);
    log.error(`[API] setItemColumn: Error: ${error.stack || error}`);
    throw error;
  }
}

/**
 * Batch update Status (column) for multiple project items using GraphQL aliases.
 * Each update is an object: { projectItemId: string, optionId: string }
 * Returns an array of successful item IDs (best-effort).
 *
 * @param {string} projectId
 * @param {Array<{projectItemId: string, optionId: string}>} updates
 * @param {number} [batchSize=20]
 * @returns {Promise<Array<string>>}
 */
async function setItemColumnsBatch(projectId, updates, batchSize = 20) {
  if (!Array.isArray(updates) || updates.length === 0) return [];
  const statusFieldId = await getFieldId(projectId, 'Status');
  const successes = [];

  for (let i = 0; i < updates.length; i += batchSize) {
    const slice = updates.slice(i, i + batchSize);
    // Build aliased mutation using variables per entry to avoid interpolation
    const varDecls = [];
    const parts = [];
    const variables = {};
    slice.forEach((u, idx) => {
      const alias = `m${idx}`;
      const vName = `input${idx}`;
      varDecls.push(`$${vName}: UpdateProjectV2ItemFieldValueInput!`);
      parts.push(`${alias}: updateProjectV2ItemFieldValue(input: $${vName}) { projectV2Item { id } }`);
      variables[vName] = {
        projectId,
        itemId: u.projectItemId,
        fieldId: statusFieldId,
        value: { singleSelectOptionId: u.optionId }
      };
    });
    const mutation = `mutation(${varDecls.join(', ')}) { ${parts.join(' ')} }`;
    try {
      const result = await graphqlWithAuth(mutation, variables, RatePriority.STANDARD);
      // Collect success IDs from aliases
      for (const key of Object.keys(result || {})) {
        const item = result[key]?.projectV2Item;
        if (item?.id) successes.push(item.id);
      }
    } catch (error) {
      log.error(`[API] setItemColumnsBatch: batch failed: ${error.message}`);
      // Continue with next batch
    }
  }

  return successes;
}

/**
 * Get field ID with caching
 * @param {string} projectId - The project board ID
 * @param {string} fieldName - The name of the field
 * @returns {Promise<string>} The field ID
 */
async function getFieldId(projectId, fieldName) {
  // Use composite key for cache
  const cacheKey = `${projectId}:${fieldName}`;

  if (fieldIdCache.has(cacheKey)) {
    log.debug(`Using cached field ID for ${fieldName} in project ${projectId}`);
    return fieldIdCache.get(cacheKey);
  }

  log.debug(`Fetching field ID for ${fieldName} in project ${projectId}`);
  const result = await graphqlWithAuth(`
    query($projectId: ID!, $fieldName: String!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          field(name: $fieldName) {
            ... on ProjectV2Field {
              id
            }
            ... on ProjectV2SingleSelectField {
              id
            }
          }
        }
      }
    }
  `, { projectId, fieldName }, RatePriority.STANDARD);

  if (!result.node.field || !result.node.field.id) {
    throw new Error(`Field '${fieldName}' not found in project or doesn't have an ID`);
  }

  const fieldId = result.node.field.id;
  fieldIdCache.set(cacheKey, fieldId);
  return fieldId;
}

function __resetProjectCaches() {
  projectItemsCache.clear();
  statusOptionsCache.clear();
  fieldIdCache.clear();
  columnOptionIdCache.clear();
}

export {
  octokit,
  graphqlWithAuth as graphql,
  restWithAuth as rest,
  isItemInProject,
  addItemToProject,
  getRecentItems,
  getItemColumn,
  setItemColumn,
  getFieldId,
  getColumnOptionId,
  getProjectItems,
  setItemColumnsBatch,
  fetchLinkedIssuesForPullRequest,
  __setGraphqlExecutor,
  __resetGraphqlExecutor,
  __resetProjectCaches
};
