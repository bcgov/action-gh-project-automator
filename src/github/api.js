import { Octokit } from '@octokit/rest';
import { graphql as graphqlClient } from '@octokit/graphql';
import * as core from '@actions/core';

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
    _graphql = graphqlClient.defaults({
      headers: {
        authorization: `bearer ${token}`,
      },
    });
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
 * Get recent items (PRs and Issues) updated in the lookback window
 */
async function getRecentItems(org, repos, monitoredUser, windowHours = 2, options = {}) {
  const { graphql } = getClients();
  const allowedOrgs = options.allowedOrgs || [];

  // Determine time window
  const hours = windowHours || 2;
  const sinceDateStr = options.since || new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const sinceClause = ` updated:>=${sinceDateStr}`;

  // Build repository-scoped search queries
  const reposToSearch = repos || [];
  const repoQueries = reposToSearch.map((repo) => {
    const qualified = repo.includes('/') ? repo : `${org}/${repo}`;
    return `repo:${qualified}${sinceClause} sort:updated-desc`;
  });

  // Build global user-scoped search queries
  const authorQuery = `author:${monitoredUser}${sinceClause} sort:updated-desc`;
  const assigneeQuery = `assignee:${monitoredUser}${sinceClause} sort:updated-desc`;
  const reviewerQuery = `review-requested:${monitoredUser}${sinceClause} sort:updated-desc`;

  const ITEM_FRAGMENT = `
    __typename
    ... on Issue {
      id number title
      repository { nameWithOwner }
      author { login }
      assignees(first: 5) { nodes { login } }
      state updatedAt
    }
    ... on PullRequest {
      id number title
      repository { nameWithOwner }
      author { login }
      assignees(first: 5) { nodes { login } }
      state updatedAt
      reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } }
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

  // 1. Fetch Repository-scoped items
  for (const q of repoQueries) {
    const repoNodes = await paginatedSearch(q);
    results.push(...repoNodes);
  }

  // 2. Fetch User-scoped PRs
  const authorNodes = await paginatedSearch(authorQuery);
  results.push(...filterByAllowedOrgs(authorNodes));

  // 3. Fetch User-scoped Assigned Issues/PRs
  const assigneeNodes = await paginatedSearch(assigneeQuery);
  results.push(...filterByAllowedOrgs(assigneeNodes));

  // 4. Fetch User-scoped Review Requested PRs
  const reviewerNodes = await paginatedSearch(reviewerQuery);
  results.push(...filterByAllowedOrgs(reviewerNodes));

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
              id
              name
              __typename
              ... on ProjectV2SingleSelectField {
                options { id name }
              }
              ... on ProjectV2IterationField {
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
 * Check if item is already in the project
 */
async function isItemInProject(nodeId, projectId) {
  const { graphql } = getClients();
  const query = `
    query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          items(first: 100) {
            nodes {
              id
              content {
                ... on Issue { id }
                ... on PullRequest { id }
              }
            }
          }
        }
      }
    }
  `;
  const result = await withRetry(() => graphql(query, { projectId }));
  const items = result.node?.items?.nodes || [];
  const found = items.find((item) => item.content?.id === nodeId);
  if (found) {
    return { isInProject: true, projectItemId: found.id };
  }
  return { isInProject: false };
}

/**
 * Add an item to the project board
 */
async function addItemToProject(nodeId, projectId) {
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
 * Get current column Status of project item
 */
async function getItemColumn(projectId, projectItemId) {
  const { graphql } = getClients();
  const query = `
    query($projectId: ID!, $itemId: ID!) {
      node(id: $itemId) {
        ... on ProjectV2Item {
          fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
        }
      }
    }
  `;
  const result = await withRetry(() => graphql(query, { projectId, itemId: projectItemId }));
  return result.node?.fieldValueByName?.name || null;
}

/**
 * Get current Sprint of project item
 */
async function getItemSprint(projectId, projectItemId) {
  const { graphql } = getClients();
  const query = `
    query($projectId: ID!, $itemId: ID!) {
      node(id: $itemId) {
        ... on ProjectV2Item {
          fieldValueByName(name: "Sprint") {
            ... on ProjectV2ItemFieldIterationValue {
              iterationId
              title
            }
          }
        }
      }
    }
  `;
  const result = await withRetry(() => graphql(query, { projectId, itemId: projectItemId }));
  const val = result.node?.fieldValueByName;
  if (val && val.iterationId) {
    return { id: val.iterationId, title: val.title };
  }
  return null;
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
              projectItems(first: 20) {
                nodes {
                  id
                  project { id }
                }
              }
            }
          }
        }
      }
    }
  `;
  const result = await withRetry(() => graphql(query, { pullRequestId }));
  const nodes = result?.node?.closingIssuesReferences?.nodes || [];
  return nodes.map((node) => {
    const projItem = node.projectItems?.nodes?.find((item) => item.project?.id === projectId);
    return {
      id: node.id,
      number: node.number,
      repository: node.repository,
      projectItemId: projItem?.id || null,
    };
  });
}

/**
 * Assign a user to an issue or PR
 */
async function assignUserToItem(nameWithOwner, number, login) {
  const { octokit } = getClients();
  const [owner, repo] = nameWithOwner.split('/');
  await withRetry(() =>
    octokit.rest.issues.addAssignees({
      owner,
      repo,
      issue_number: number,
      assignees: [login],
    })
  );
}

export {
  getClients,
  getProjectId,
  getRecentItems,
  getProjectMetadata,
  isItemInProject,
  addItemToProject,
  updateItemColumn,
  updateItemSprint,
  getItemColumn,
  getItemSprint,
  fetchLinkedIssuesForPullRequest,
  assignUserToItem,
};
