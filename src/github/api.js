import { Octokit } from '@octokit/rest';
import { graphql as graphqlClient } from '@octokit/graphql';
import * as core from '@actions/core';
import { apiUsage, countCalls } from '../utils/api-usage.js';
import { boardState, projectItemsFragment } from '../utils/board-state.js';
import { LABELS_FRAGMENT, labelNames } from '../utils/exclusions.js';

// Project field names from rules.yml `project.fields`; set once by the engine before any board call
let projectFields = null;

/**
 * @param {{ status: string, sprint: string }} fields - `project.fields` from rules.yml
 */
function setProjectFields(fields) {
  projectItemsFragment(fields); // validates
  projectFields = fields;
}

function getProjectFields() {
  if (!projectFields) {
    throw new Error(
      'Project field names are not set; call setProjectFields(config.project.fields)'
    );
  }
  return projectFields;
}
import { buildSearchQueries } from './queries.js';

let _octokit = null;
let _graphql = null;

// Token permissions the engine needs, named in access errors
export const TOKEN_HELP =
  'The token needs Projects read and write on the board and read access to each monitored repository. Use a GitHub App installation token, or a PAT (required for user-owned boards); see the README token section.';

export const NO_TOKEN_MESSAGE =
  'No token: set the github_token action input (or GITHUB_TOKEN when running from the command line). An empty value usually means the secret name is wrong or the secret is not available to this workflow.';

/**
 * Lazy-initialize the REST and GraphQL clients
 */
function getClients() {
  if (!_octokit || !_graphql) {
    const token =
      process.env.GITHUB_TOKEN || process.env.INPUT_GITHUB_TOKEN || core.getInput('github_token');
    if (!token) {
      throw new Error(NO_TOKEN_MESSAGE);
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

function isItemArchivedError(err) {
  return (err?.message || '').includes('The item is archived and cannot be updated');
}

/**
 * Exponential backoff wrapper for API operations
 */
async function withRetry(fn, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (isItemArchivedError(err) || i === retries - 1) throw err;
      core.warning(
        `GitHub API call failed (attempt ${i + 1}/${retries}). Retrying in ${delay}ms... Error: ${err.message}`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

/**
 * Resolves the Project ID from a standard project URL.
 * Throws with the token permissions to check when the project can't be read.
 */
async function getProjectId(projectUrl) {
  const { graphql } = getClients();
  const match = projectUrl.match(/github\.com\/(orgs|users)\/([^/]+)\/projects\/(\d+)/);
  if (!match) {
    throw new Error(`Invalid project.url format: ${projectUrl}`);
  }
  const [, type, owner, numberStr] = match;
  const number = parseInt(numberStr, 10);
  const [ownerField, ownerVar] = type === 'orgs' ? ['organization', 'org'] : ['user', 'user'];

  let result;
  try {
    result = await withRetry(() =>
      graphql(
        `
          query ($${ownerVar}: String!, $number: Int!) {
            ${ownerField}(login: $${ownerVar}) {
              projectV2(number: $number) {
                id
              }
            }
          }
        `,
        { [ownerVar]: owner, number }
      )
    );
  } catch (err) {
    throw new Error(`Cannot read project ${projectUrl}: ${err.message}. ${TOKEN_HELP}`, {
      cause: err,
    });
  }
  const id = result?.[ownerField]?.projectV2?.id;
  if (!id) {
    throw new Error(
      `Cannot read project ${projectUrl}: it does not exist or the token cannot see it. ${TOKEN_HELP}`
    );
  }
  return id;
}

/**
 * Get open items, and PRs closed without merging, updated since `since`.
 * Each result carries its project items (with Status and Sprint), so no per-item board lookups are needed.
 * @param {string} org - Default organization for unqualified repos
 * @param {Array<string>} repos - Monitored repositories
 * @param {Array<string>} monitoredUsers
 * @param {string|null} since - ISO cutoff (watermark, fallback window or backfill), null for none
 * @param {object} [options]
 * @param {Array<string>} [options.allowedOrgs]
 * @param {boolean} [options.openOnly] - Open items only (backfill runs)
 */
async function getRecentItems(org, repos, monitoredUsers, since, options = {}) {
  const { graphql } = getClients();
  const allowedOrgs = options.allowedOrgs || [];
  const PROJECT_ITEMS_FRAGMENT = projectItemsFragment(getProjectFields());
  const { repoQueries, userQueries } = buildSearchQueries({
    org,
    repos,
    monitoredUsers,
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
      ${LABELS_FRAGMENT}
      state updatedAt
      ${PROJECT_ITEMS_FRAGMENT}
    }
    ... on PullRequest {
      id number title
      repository { nameWithOwner }
      author { login }
      assignees(first: 5) { nodes { login } }
      ${LABELS_FRAGMENT}
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
      // A failed search would skip its items and still move the watermark past them
      throw new Error(`Search failed for "${searchQuery}": ${err.message}`, { cause: err });
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

/**
 * Monitored repositories the token cannot read. GitHub search drops a `repo:` qualifier it
 * cannot resolve without an error, so unreadable repos are checked here, in one call.
 * @param {string} org - Default organization for unqualified repos
 * @param {Array<string>} repos - Monitored repositories
 * @returns {Promise<Array<string>>} owner/name of each unreadable repository
 */
async function getUnreadableRepositories(org, repos) {
  const names = (repos || []).map((repo) => (repo.includes('/') ? repo : `${org}/${repo}`));
  if (names.length === 0) return [];
  const { graphql } = getClients();
  const fields = names.map((name, i) => {
    const [owner, repo] = name.split('/');
    return `r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(repo)}) { id }`;
  });
  let data;
  try {
    data = await withRetry(() => graphql(`query { ${fields.join('\n')} }`));
  } catch (err) {
    // Unreadable repositories come back as null with NOT_FOUND or FORBIDDEN errors
    if (!err?.data) throw err;
    data = err.data;
  }
  return names.filter((_, i) => !data?.[`r${i}`]?.id);
}

/**
 * Throw when the token cannot read any monitored repository.
 * @param {string} org - Default organization for unqualified repos
 * @param {Array<string>} repos - Monitored repositories
 */
async function requireReadableRepositories(org, repos) {
  const unreadable = await getUnreadableRepositories(org, repos);
  if (unreadable.length > 0) {
    throw new Error(
      `The token cannot read ${unreadable.length} monitored repository(s): ${unreadable.join(', ')}. Grant the token access to them or remove them from automation.repository_scope.repositories. ${TOKEN_HELP}`
    );
  }
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
  const names = getProjectFields();

  const statusField = fields.find(
    (f) => f.name === names.status && f.__typename === 'ProjectV2SingleSelectField'
  );
  const sprintField = names.sprint
    ? fields.find((f) => f.name === names.sprint && f.__typename === 'ProjectV2IterationField')
    : null;

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
/**
 * The project item id from an addProjectV2ItemById response. A missing item is a failed add,
 * so it throws instead of letting the caller treat it as success.
 * @param {object} result - GraphQL response data
 * @param {string} label - Item named in the error, e.g. bcgov/repo#12
 * @returns {string}
 */
function requireAddedItemId(result, label) {
  const id = result?.addProjectV2ItemById?.item?.id;
  if (!id) {
    throw new Error(`Adding ${label} to the project returned no project item`);
  }
  return id;
}

/**
 * Confirm a field-value mutation returned the project item it changed.
 * @param {object} result - GraphQL response data
 * @param {string} mutationName - e.g. updateProjectV2ItemFieldValue
 * @param {string} label - What was being set, named in the error
 */
function requireUpdatedItem(result, mutationName, label) {
  if (!result?.[mutationName]?.projectV2Item?.id) {
    throw new Error(`${label} returned no project item from ${mutationName}`);
  }
}

/**
 * Add an issue or PR to the project. Throws when the add fails or returns no item.
 * @param {string} nodeId - Issue or PR node id
 * @param {string} projectId
 * @param {string} [label] - Item named in errors, e.g. bcgov/repo#12
 * @returns {Promise<string>} Project item id
 */
async function addItemToProject(nodeId, projectId, label = nodeId) {
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
  return requireAddedItemId(result, label);
}

/**
 * Update an item's status column
 */
async function updateItemColumn(projectId, projectItemId, columnName) {
  const meta = await getProjectMetadata(projectId);
  if (!meta.statusFieldId) {
    throw new Error('Status field was not found on the project board.');
  }
  const option = meta.statusOptions.find((opt) => opt.name === columnName);
  if (!option) {
    throw new Error(`Column "${columnName}" not found on the project board.`);
  }
  if (process.env.DRY_RUN === 'true') {
    core.info(`[DRY RUN] Would update item ${projectItemId} Status to "${columnName}"`);
    return;
  }
  const { graphql } = getClients();

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
  try {
    const result = await withRetry(() =>
      graphql(mutation, {
        projectId,
        itemId: projectItemId,
        fieldId: meta.statusFieldId,
        optionId: option.id,
      })
    );
    requireUpdatedItem(
      result,
      'updateProjectV2ItemFieldValue',
      `Setting ${projectItemId} Status to "${columnName}"`
    );
  } catch (err) {
    if (isItemArchivedError(err)) {
      core.warning(
        `Skipping ${projectItemId}: item is archived on the project board and cannot be updated.`
      );
      return;
    }
    throw err;
  }
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

  try {
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
      const result = await withRetry(() =>
        graphql(mutation, {
          projectId,
          itemId: projectItemId,
          fieldId: meta.sprintFieldId,
        })
      );
      requireUpdatedItem(
        result,
        'clearProjectV2ItemFieldValue',
        `Clearing ${projectItemId} Sprint`
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
      const result = await withRetry(() =>
        graphql(mutation, {
          projectId,
          itemId: projectItemId,
          fieldId: meta.sprintFieldId,
          iterationId: sprintId,
        })
      );
      requireUpdatedItem(
        result,
        'updateProjectV2ItemFieldValue',
        `Setting ${projectItemId} Sprint to ${sprintId}`
      );
    }
  } catch (err) {
    if (isItemArchivedError(err)) {
      core.warning(
        `Skipping ${projectItemId}: item is archived on the project board and cannot be updated.`
      );
      return;
    }
    throw err;
  }
}

/**
 * Fetch linked issues for a PR that reside within this project
 */
function readItemState(node) {
  const sprint = node?.sprint?.iterationId
    ? { id: node.sprint.iterationId, title: node.sprint.title }
    : null;
  return {
    projectItemId: node.id,
    column: node?.status?.name || null,
    sprint,
    isArchived: Boolean(node?.isArchived),
  };
}

function itemStateFields() {
  const names = getProjectFields();
  const sprintSelection = names.sprint
    ? `sprint: fieldValueByName(name: ${JSON.stringify(names.sprint)}) {
        ... on ProjectV2ItemFieldIterationValue { iterationId title }
      }`
    : '';
  return `
    status: fieldValueByName(name: ${JSON.stringify(names.status)}) {
      ... on ProjectV2ItemFieldSingleSelectValue { name }
    }
    ${sprintSelection}
  `;
}

/**
 * Every item on the board, read from the project side (paginated, 100 per call).
 * @param {string} projectId
 * @returns {Promise<{ items: Map<string, {projectItemId: string, column: string|null, sprint: object|null, isArchived: boolean}>, calls: number }>}
 *   Keyed by the issue or PR node id
 */
async function getProjectBoardItems(projectId) {
  const { graphql } = getClients();
  const query = `
    query($projectId: ID!, $cursor: String) {
      node(id: $projectId) {
        ... on ProjectV2 {
          items(first: 100, after: $cursor) {
            nodes {
              id
              isArchived
              content { ... on Issue { id } ... on PullRequest { id } }
              ${itemStateFields()}
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    }
  `;
  const items = new Map();
  let cursor = null;
  let calls = 0;
  do {
    const result = await withRetry(() => graphql(query, { projectId, cursor }));
    calls++;
    const page = result?.node?.items;
    if (!page) throw new Error(`Could not read the item list of project ${projectId}`);
    for (const node of page.nodes || []) {
      if (node?.content?.id) items.set(node.content.id, readItemState(node));
    }
    cursor = page.pageInfo?.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return { items, calls };
}

/**
 * Status and Sprint of one project item.
 * @param {string} projectItemId
 * @returns {Promise<{projectItemId: string, column: string|null, sprint: object|null, isArchived: boolean}>}
 */
async function getProjectItemState(projectItemId) {
  if (process.env.DRY_RUN === 'true') {
    return { projectItemId, column: null, sprint: null, isArchived: false };
  }
  const { graphql } = getClients();
  const query = `
    query($itemId: ID!) {
      node(id: $itemId) {
        ... on ProjectV2Item { id isArchived ${itemStateFields()} }
      }
    }
  `;
  const result = await withRetry(() => graphql(query, { itemId: projectItemId }));
  if (!result?.node?.id) throw new Error(`Could not read project item ${projectItemId}`);
  return readItemState(result.node);
}

async function fetchLinkedIssuesForPullRequest(pullRequestId, projectId) {
  const { graphql } = getClients();
  const PROJECT_ITEMS_FRAGMENT = projectItemsFragment(getProjectFields());
  const query = `
    query($pullRequestId: ID!) {
      node(id: $pullRequestId) {
        ... on PullRequest {
          closingIssuesReferences(first: 50) {
            nodes {
              id
              number
              state
              repository { nameWithOwner }
              ${LABELS_FRAGMENT}
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
      state: node.state,
      isClosed: node.state === 'CLOSED',
      isArchived: Boolean(board?.isArchived),
      repository: node.repository,
      labels: labelNames(node.labels),
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

/**
 * Fetch a file from the repository via GitHub API (for workflows running without checkout)
 * @param {string} filePath - Path to file in repository
 * @param {object} [options]
 * @param {string} [options.repository] - Owner/repo (defaults to process.env.GITHUB_REPOSITORY)
 * @param {string} [options.ref] - Commit SHA or ref (defaults to process.env.GITHUB_SHA or GITHUB_REF)
 * @returns {Promise<string>} File contents as UTF-8 string
 */
async function fetchRepoFile(filePath, options = {}) {
  const repository = options.repository || process.env.GITHUB_REPOSITORY;
  if (!repository) {
    throw new Error('GITHUB_REPOSITORY environment variable is not configured.');
  }
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid repository identifier: ${repository}`);
  }

  const ref = options.ref || process.env.GITHUB_SHA || process.env.GITHUB_REF;
  const { octokit } = getClients();
  const params = { owner, repo, path: filePath };
  if (ref) params.ref = ref;

  const response = await octokit.rest.repos.getContent(params);
  if (!response.data || !response.data.content) {
    throw new Error(`File '${filePath}' in ${repository} is empty or not a file.`);
  }

  return Buffer.from(response.data.content, 'base64').toString('utf8');
}

export {
  getProjectBoardItems,
  getProjectItemState,
  requireAddedItemId,
  requireUpdatedItem,
  setProjectFields,
  getClients,
  getProjectId,
  getRecentItems,
  getUnreadableRepositories,
  requireReadableRepositories,
  getProjectMetadata,
  addItemToProject,
  updateItemColumn,
  updateItemSprint,
  fetchLinkedIssuesForPullRequest,
  assignUserToItem,
  getRateLimit,
  fetchRepoFile,
};
