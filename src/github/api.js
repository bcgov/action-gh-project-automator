import { Octokit } from '@octokit/rest';
import { graphql as graphqlClient } from '@octokit/graphql';
import * as core from '@actions/core';
import { apiUsage, countCalls } from '../utils/api-usage.js';
import { boardState, PROJECT_ITEMS_FRAGMENT } from '../utils/board-state.js';
import { buildSearchQueries } from './queries.js';

let _octokit = null;
let _graphql = null;

/**
 * Lazy-initialize the REST and GraphQL clients
 */
function getClients() {
  if (!_octokit || !_graphql) {
    const token = process.env.GITHUB_TOKEN || process.env.INPUT_GITHUB_TOKEN;
    if (!token) {
      throw new Error('GITHUB_TOKEN environment variable is not configured.');
    }
    _octokit = new Octokit({ auth: token });
    // Count every call for the job summary
    _octokit.hook.wrap('request', (request, options) => {
      apiUsage.rest++;
      return request(options);
    });
    _graphql = countCalls(
      graphqlClient.defaults({
        headers: {
          authorization: `bearer ${token}`,
        },
      }),
      apiUsage,
      'graphql'
    );
  }
  return { octokit: _octokit, graphql: _graphql };
}

/**
 * Exponential backoff wrapper for API operations
 */
async function withRetry(fn, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      core.warning(
        `GitHub API call failed (attempt ${i + 1}/${retries}). Retrying in ${delay}ms... Error: ${err.message}`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

/**
 * Resolves the Project ID from a standard project URL
 */
async function getProjectId(projectUrl) {
  const { graphql } = getClients();
  const match = projectUrl.match(/github\.com\/(orgs|users)\/([^/]+)\/projects\/(\d+)/);
  if (!match) {
    throw new Error(`Invalid GITHUB_PROJECT_URL format: ${projectUrl}`);
  }
  const [, type, owner, numberStr] = match;
  const number = parseInt(numberStr, 10);

  if (type === 'orgs') {
    const result = await withRetry(() =>
      graphql(
        `
          query ($org: String!, $number: Int!) {
            organization(login: $org) {
              projectV2(number: $number) {
                id
              }
            }
          }
        `,
        { org: owner, number }
      )
    );
    return result.organization?.projectV2?.id;
  } else {
    const result = await withRetry(() =>
      graphql(
        `
          query ($user: String!, $number: Int!) {
            user(login: $user) {
              projectV2(number: $number) {
                id
              }
            }
          }
        `,
        { user: owner, number }
      )
    );
    return result.user?.projectV2?.id;
  }
}

/**
 * Get open items, and PRs closed without merging, updated since `since`.
 * Each result carries its project items (with Status and Sprint), so no per-item board lookups are needed.
 * @param {string} org - Default organization for unqualified repos
 * @param {Array<string>} repos - Monitored repositories
 * @param {string} monitoredUser
 * @param {string|null} since - ISO cutoff (watermark, fallback window or backfill), null for none
 * @param {object} [options]
 * @param {Array<string>} [options.allowedOrgs]
 * @param {boolean} [options.openOnly] - Open items only (backfill runs)
 */
async function getRecentItems(org, repos, monitoredUser, since, options = {}) {
  const { graphql } = getClients();
  const allowedOrgs = options.allowedOrgs || [];
  const { repoQueries, userQueries } = buildSearchQueries({
    org,
    repos,
    monitoredUser,
    since,
    openOnly: options.openOnly === true,
  });

  const ITEM_FRAGMENT = `
    __typename
    ... on Issue {
      id number title
      repository { nameWithOwner }
      author { login }
      assignees(first: 5) { nodes { login } }
      state updatedAt
      ${PROJECT_ITEMS_FRAGMENT}
    }
    ... on PullRequest {
      id number title
      repository { nameWithOwner }
      author { login }
      assignees(first: 5) { nodes { login } }
      state updatedAt isDraft
      reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } }
      ${PROJECT_ITEMS_FRAGMENT}
    }
  `;

  // Paginate helper
  async function paginatedSearch(searchQuery) {
    const nodes = [];
    let cursor = null;
    try {
      for (let page = 0; page < 5; page++) {
        const query = `
          query($searchQuery: String!, $cursor: String) {
            search(query: $searchQuery, type: ISSUE, first: 100, after: $cursor) {
              nodes { ${ITEM_FRAGMENT} }
              pageInfo { hasNextPage endCursor }
            }
          }
        `;
        const vars = { searchQuery };
        if (cursor) vars.cursor = cursor;

        const result = await withRetry(() => graphql(query, vars));
        const pageNodes = result.search?.nodes || [];
        nodes.push(...pageNodes);
        if (!result.search?.pageInfo?.hasNextPage) break;
        cursor = result.search.pageInfo.endCursor;
      }
    } catch (err) {
      core.warning(`Search query failed for "${searchQuery}": ${err.message}`);
    }
    return nodes;
  }

  // Allowed organization filter
  const filterByAllowedOrgs = (nodes) => {
    if (!allowedOrgs || allowedOrgs.length === 0) return nodes;
    return nodes.filter((item) => {
      if (!item.repository?.nameWithOwner) return false;
      const [itemOrg] = item.repository.nameWithOwner.split('/');
      return allowedOrgs.includes(itemOrg);
    });
  };

  const results = [];

  // 1. Repository-scoped items (several repos per query)
  for (const q of repoQueries) {
    results.push(...(await paginatedSearch(q)));
  }

  // 2. User-scoped items: authored, assigned and review-requested, inside the window
  for (const q of userQueries) {
    results.push(...filterByAllowedOrgs(await paginatedSearch(q)));
  }

  // De-duplicate items by node ID
  const seen = new Set();
  return results.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

// Local cache for metadata and fields
const projectMetadataCache = new Map();

/**
 * Fetch and cache Project V2 metadata in a single call
 */
async function getProjectMetadata(projectId) {
  if (projectMetadataCache.has(projectId)) {
    return projectMetadataCache.get(projectId);
  }
  const { graphql } = getClients();
  const query = `
    query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          fields(first: 100) {
            nodes {
              ... on ProjectV2Field {
                id
                name
                __typename
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                __typename
                options { id name }
              }
              ... on ProjectV2IterationField {
                id
                name
                __typename
                configuration {
                  iterations { id title startDate duration }
                  completedIterations { id title startDate duration }
                }
              }
            }
          }
        }
      }
    }
  `;
  const result = await withRetry(() => graphql(query, { projectId }));
  const fields = result.node?.fields?.nodes || [];

  const statusField = fields.find(
    (f) => f.name === 'Status' && f.__typename === 'ProjectV2SingleSelectField'
  );
  const sprintField = fields.find(
    (f) => f.name === 'Sprint' && f.__typename === 'ProjectV2IterationField'
  );

  let currentSprintId = null;
  let currentSprintTitle = null;

  if (sprintField?.configuration) {
    const allIterations = [
      ...(sprintField.configuration.iterations || []),
      ...(sprintField.configuration.completedIterations || []),
    ];
    const now = new Date();
    for (const iter of allIterations) {
      const start = new Date(iter.startDate);
      const end = new Date(start.getTime() + iter.duration * 24 * 60 * 60 * 1000);
      if (now >= start && now <= end) {
        currentSprintId = iter.id;
        currentSprintTitle = iter.title;
        break;
      }
    }
  }

  const metadata = {
    statusFieldId: statusField?.id || null,
    statusOptions: statusField?.options || [],
    sprintFieldId: sprintField?.id || null,
    currentSprintId,
    currentSprintTitle,
  };

  projectMetadataCache.set(projectId, metadata);
  return metadata;
}

/**
 * Add an item to the project board
 */
async function addItemToProject(nodeId, projectId) {
  if (process.env.DRY_RUN === 'true') {
    core.info(`[DRY RUN] Would add item ${nodeId} to project ${projectId}`);
    return 'mock-project-item-id';
  }
  const { graphql } = getClients();
  const mutation = `
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
        item { id }
      }
    }
  `;
  const result = await withRetry(() => graphql(mutation, { projectId, contentId: nodeId }));
  return result.addProjectV2ItemById?.item?.id;
}

/**
 * Update an item's status column
 */
async function updateItemColumn(projectId, projectItemId, columnName) {
  if (process.env.DRY_RUN === 'true') {
    core.info(`[DRY RUN] Would update item ${projectItemId} Status to "${columnName}"`);
    return;
  }
  const { graphql } = getClients();
  const meta = await getProjectMetadata(projectId);
  if (!meta.statusFieldId) {
    throw new Error('Status field was not found on the project board.');
  }
  const option = meta.statusOptions.find((opt) => opt.name === columnName);
  if (!option) {
    throw new Error(`Column "${columnName}" not found on the project board.`);
  }

  const mutation = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId,
        itemId: $itemId,
        fieldId: $fieldId,
        value: { singleSelectOptionId: $optionId }
      }) {
        projectV2Item { id }
      }
    }
  `;
  await withRetry(() =>
    graphql(mutation, {
      projectId,
      itemId: projectItemId,
      fieldId: meta.statusFieldId,
      optionId: option.id,
    })
  );
}

/**
 * Update an item's iteration (Sprint) field
 */
async function updateItemSprint(projectId, projectItemId, sprintId) {
  if (process.env.DRY_RUN === 'true') {
    core.info(
      `[DRY RUN] Would update item ${projectItemId} Sprint to ${sprintId ? `"${sprintId}"` : 'null (clear)'}`
    );
    return;
  }
  const { graphql } = getClients();
  const meta = await getProjectMetadata(projectId);
  if (!meta.sprintFieldId) {
    throw new Error('Sprint field was not found on the project board.');
  }

  if (!sprintId) {
    const mutation = `
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!) {
        clearProjectV2ItemFieldValue(input: {
          projectId: $projectId,
          itemId: $itemId,
          fieldId: $fieldId
        }) {
          projectV2Item { id }
        }
      }
    `;
    await withRetry(() =>
      graphql(mutation, {
        projectId,
        itemId: projectItemId,
        fieldId: meta.sprintFieldId,
      })
    );
  } else {
    const mutation = `
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $iterationId: String!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId,
          itemId: $itemId,
          fieldId: $fieldId,
          value: { iterationId: $iterationId }
        }) {
          projectV2Item { id }
        }
      }
    `;
    await withRetry(() =>
      graphql(mutation, {
        projectId,
        itemId: projectItemId,
        fieldId: meta.sprintFieldId,
        iterationId: sprintId,
      })
    );
  }
}

/**
 * Fetch linked issues for a PR that reside within this project
 */
async function fetchLinkedIssuesForPullRequest(pullRequestId, projectId) {
  const { graphql } = getClients();
  const query = `
    query($pullRequestId: ID!) {
      node(id: $pullRequestId) {
        ... on PullRequest {
          closingIssuesReferences(first: 50) {
            nodes {
              id
              number
              repository { nameWithOwner }
              ${PROJECT_ITEMS_FRAGMENT}
            }
          }
        }
      }
    }
  `;
  const result = await withRetry(() => graphql(query, { pullRequestId }));
  const nodes = result?.node?.closingIssuesReferences?.nodes || [];
  return nodes.map((node) => {
    const board = boardState(node, projectId);
    return {
      id: node.id,
      number: node.number,
      repository: node.repository,
      projectItemId: board?.projectItemId || null,
      column: board?.column || null,
      sprint: board?.sprint || null,
    };
  });
}

/**
 * GitHub requires admin on the target repository to add assignees.
 * Repositories outside our control return this 403; it is not a sync failure.
 */
function isRepositoryAdminDenied(err) {
  const status = err?.status ?? err?.response?.status;
  return status === 403 && (err?.message || '').includes('Must have admin rights to Repository');
}

/**
 * Assign a user to an issue or PR.
 * @returns {'assigned'|'skipped'|'dry-run'}
 */
async function assignUserToItem(nameWithOwner, number, login) {
  if (process.env.DRY_RUN === 'true') {
    core.info(`[DRY RUN] Would assign user ${login} to item ${nameWithOwner}#${number}`);
    return 'dry-run';
  }
  const { octokit } = getClients();
  const [owner, repo] = nameWithOwner.split('/');
  let skipped = false;
  await withRetry(async () => {
    try {
      await octokit.rest.issues.addAssignees({
        owner,
        repo,
        issue_number: number,
        assignees: [login],
      });
    } catch (err) {
      if (isRepositoryAdminDenied(err)) {
        skipped = true;
        return;
      }
      throw err;
    }
  });
  if (skipped) {
    core.warning(
      `Skipping assignee update for ${nameWithOwner}#${number}: token lacks admin rights on this repository.`
    );
    return 'skipped';
  }
  return 'assigned';
}

/**
 * Current rate limits from GET /rate_limit (this call doesn't count against them).
 * @returns {Promise<object|null>}
 */
async function getRateLimit() {
  try {
    const { octokit } = getClients();
    const { data } = await octokit.rest.rateLimit.get();
    return { graphql: data.resources?.graphql, core: data.resources?.core };
  } catch (err) {
    core.warning(`Could not read rate limit: ${err.message}`);
    return null;
  }
}

export {
  getClients,
  getProjectId,
  getRecentItems,
  getProjectMetadata,
  addItemToProject,
  updateItemColumn,
  updateItemSprint,
  fetchLinkedIssuesForPullRequest,
  assignUserToItem,
  getRateLimit,
};
