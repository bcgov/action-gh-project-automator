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

// Token permissions the engine needs, named in access errors
export const TOKEN_HELP =
  'The token needs Projects read and write on the board and read access to each monitored repository. Use a fine-grained PAT (a classic PAT for user-owned boards or several owners), or a GitHub App installation token; see the README token section.';

export const NO_TOKEN_MESSAGE =
  'No token: set the github_token action input (or GITHUB_TOKEN when running from the command line; an Actions run ignores GITHUB_TOKEN). An empty value usually means the secret name is wrong or the secret is not available to this workflow.';

/**
 * The token to use. The github_token input always wins. GITHUB_TOKEN is only a
 * command-line fallback: in an Actions run it's ignored, so a workflow-level
 * GITHUB_TOKEN can't replace the input with a token that can't reach Projects.
 * @param {object} [env] - Defaults to process.env
 * @returns {string} The token, or '' when there's none
 */
export function resolveToken(env = process.env) {
  const input = (env.INPUT_GITHUB_TOKEN || '').trim();
  if (input) return input;
  if (env.GITHUB_ACTIONS === 'true') return '';
  return (env.GITHUB_TOKEN || '').trim();
}

// Per-owner override tokens from rules.yml `tokens:` (owner, lower case -> { variable, token })
let _ownerTokens = new Map();
// The project board's owner; board reads and writes use its token
let _projectOwner = null;
// One client pair per distinct token
const _clientsByToken = new Map();

/**
 * Resolve rules.yml `tokens:` (owner -> environment variable) to tokens.
 * There's no fallback: a mapped owner whose variable is unset or empty is an error.
 * @param {object} [tokens] - `tokens:` from rules.yml
 * @param {object} [env] - Defaults to process.env
 * @returns {Map<string, {variable: string, token: string}>} Keyed by lower-case owner
 */
export function resolveOwnerTokens(tokens = {}, env = process.env) {
  const resolved = new Map();
  const missing = [];
  for (const [owner, variable] of Object.entries(tokens || {})) {
    const token = (env[variable] || '').trim();
    if (!token)
      missing.push(`owner "${owner}" (environment variable ${variable} is unset or empty)`);
    else resolved.set(owner.toLowerCase(), { variable, token });
  }
  if (missing.length > 0) {
    throw new Error(
      `No token for ${missing.join(', ')}. Set each mapped variable from a secret, or remove the owner from rules.yml tokens.`
    );
  }
  return resolved;
}

/**
 * Use these per-owner tokens for later calls. An empty map means the default token for everything.
 * @param {Map<string, {variable: string, token: string}>} ownerTokens - From resolveOwnerTokens
 * @param {string|null} [projectOwner] - Owner of the project board
 */
export function setOwnerTokens(ownerTokens, projectOwner = null) {
  _ownerTokens = ownerTokens || new Map();
  _projectOwner = projectOwner;
}

/**
 * Name of the token used for an owner: its `tokens:` variable, or github_token.
 * @param {string|null} owner
 * @returns {string}
 */
export function tokenNameFor(owner) {
  return (owner && _ownerTokens.get(owner.toLowerCase())?.variable) || 'github_token';
}

function hasOwnerToken(owner) {
  return Boolean(owner && _ownerTokens.has(owner.toLowerCase()));
}

/**
 * REST and GraphQL clients for an owner: its override token, otherwise the default token.
 * @param {string|null} [owner] - Organization or user the call is about
 */
function getClients(owner = null) {
  const token = hasOwnerToken(owner) ? _ownerTokens.get(owner.toLowerCase()).token : resolveToken();
  if (!token) {
    throw new Error(NO_TOKEN_MESSAGE);
  }
  if (!_clientsByToken.has(token)) {
    const octokit = new Octokit({ auth: token });
    // Count every call for the job summary
    octokit.hook.wrap('request', (request, options) => {
      apiUsage.rest++;
      return request(options);
    });
    const graphql = countCalls(
      graphqlClient.defaults({
        headers: {
          authorization: `bearer ${token}`,
        },
      }),
      apiUsage,
      'graphql'
    );
    _clientsByToken.set(token, { octokit, graphql });
  }
  return _clientsByToken.get(token);
}

/** Clients for project board reads and writes */
function projectClients() {
  return getClients(_projectOwner);
}

function ownerOf(nameWithOwner) {
  return (nameWithOwner || '').split('/')[0] || null;
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
  const match = projectUrl.match(/github\.com\/(orgs|users)\/([^/]+)\/projects\/(\d+)/);
  if (!match) {
    throw new Error(`Invalid project.url format: ${projectUrl}`);
  }
  const [, type, owner, numberStr] = match;
  const { graphql } = getClients(owner);
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
 * Group repositories by the token that reaches them: an owner with its own token, or null for the default.
 * With no `tokens:` map this is one group with every repository, in order.
 * @param {string} org - Default organization for unqualified repos
 * @param {Array<string>} repos
 * @returns {Map<string|null, Array<string>>} owner/name lists
 */
function groupByToken(org, repos) {
  const groups = new Map();
  for (const repo of repos || []) {
    const name = repo.includes('/') ? repo : `${org}/${repo}`;
    const owner = ownerOf(name);
    const key = hasOwnerToken(owner) ? owner.toLowerCase() : null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(name);
  }
  return groups;
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
  const allowedOrgs = options.allowedOrgs || [];
  const PROJECT_ITEMS_FRAGMENT = projectItemsFragment(getProjectFields());
  const openOnly = options.openOnly === true;
  // Each repository is searched with its owner's token
  const repoGroups = groupByToken(org, repos);
  const { userQueries } = buildSearchQueries({ org, repos: [], monitoredUsers, since, openOnly });

  const ITEM_FRAGMENT = `
    __typename
    ... on Issue {
      id number title
      repository { nameWithOwner }
      author { __typename login }
      assignees(first: 5) { nodes { login } }
      ${LABELS_FRAGMENT}
      state updatedAt
      ${PROJECT_ITEMS_FRAGMENT}
    }
    ... on PullRequest {
      id number title
      repository { nameWithOwner }
      author { __typename login }
      assignees(first: 5) { nodes { login } }
      ${LABELS_FRAGMENT}
      state updatedAt isDraft
      reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } }
      commits(last: 50) { nodes { commit { authors(first: 3) { nodes { user { login } } } } } }
      ${PROJECT_ITEMS_FRAGMENT}
    }
  `;

  // Paginate helper
  async function paginatedSearch(searchQuery, graphql) {
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

  // Allowed organization filter; owners with their own token are searched separately below
  const filterByAllowedOrgs = (nodes) =>
    nodes.filter((item) => {
      const itemOrg = ownerOf(item.repository?.nameWithOwner);
      if (hasOwnerToken(itemOrg)) return false;
      if (allowedOrgs.length === 0) return true;
      return Boolean(itemOrg) && allowedOrgs.includes(itemOrg);
    });

  const results = [];

  // 1. Repository-scoped items (several repos per query)
  for (const [owner, groupRepos] of repoGroups) {
    const { graphql } = getClients(owner);
    const { repoQueries } = buildSearchQueries({
      org,
      repos: groupRepos,
      monitoredUsers: [],
      since,
      openOnly,
    });
    for (const q of repoQueries) {
      results.push(...(await paginatedSearch(q, graphql)));
    }
  }

  // 2. User-scoped items: authored, assigned and review-requested, inside the window
  const defaultClients = getClients();
  for (const q of userQueries) {
    results.push(...filterByAllowedOrgs(await paginatedSearch(q, defaultClients.graphql)));
  }
  // Allowed organizations with their own token: the same searches, limited to that organization
  for (const owner of allowedOrgs.filter(hasOwnerToken)) {
    const { graphql } = getClients(owner);
    for (const q of userQueries) {
      const nodes = await paginatedSearch(`${q} org:${owner}`, graphql);
      results.push(
        ...nodes.filter(
          (item) => ownerOf(item.repository?.nameWithOwner)?.toLowerCase() === owner.toLowerCase()
        )
      );
    }
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
  const unreadable = [];
  // Each repository is checked with its owner's token
  for (const [owner, names] of groupByToken(org, repos)) {
    unreadable.push(...(await unreadableWith(getClients(owner).graphql, names)));
  }
  return unreadable;
}

async function unreadableWith(graphql, names) {
  if (names.length === 0) return [];
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

const REPO_PERMISSIONS = 'Metadata, Issues and Pull requests read';

/**
 * Start-up access check, run before any write (dry runs too). Reports one line per project,
 * organization and repository, naming the token used (never its value), and collects every
 * failure instead of stopping at the first.
 * @param {object} options
 * @param {string} options.projectUrl
 * @param {string} options.org - Default organization for unqualified repos
 * @param {Array<string>} options.repos - Monitored repositories
 * @param {Array<string>} [options.allowedOrgs] - Organizations searched for user-scope items
 * @returns {Promise<{projectId: string|null, lines: Array<string>, failures: Array<string>}>}
 */
async function checkAccess({ projectUrl, org, repos, allowedOrgs = [] }) {
  const lines = [];
  const failures = [];
  const report = (subject, token, problem) => {
    const line = `${subject} via ${token}: ${problem || 'OK'}`;
    lines.push(line);
    if (problem) failures.push(line);
  };

  const projectOwner =
    (projectUrl.match(/github\.com\/(?:orgs|users)\/([^/]+)\//) || [])[1] || null;
  const projectName = projectOwner ? `${projectOwner}/${projectUrl.split('/').pop()}` : projectUrl;
  let projectId = null;
  try {
    projectId = await getProjectId(projectUrl);
    if (!(await projectWritable(projectId, projectOwner))) {
      report(
        `project ${projectName}`,
        tokenNameFor(projectOwner),
        'read only; needs Projects read and write'
      );
    } else {
      report(`project ${projectName}`, tokenNameFor(projectOwner));
    }
  } catch (err) {
    report(
      `project ${projectName}`,
      tokenNameFor(projectOwner),
      `cannot read; needs Projects read and write (${err.message.split('. ')[0]})`
    );
  }

  const groups = groupByToken(org, repos);
  const unreadable = new Set();
  for (const [owner, names] of groups) {
    try {
      for (const name of await unreadableWith(getClients(owner).graphql, names))
        unreadable.add(name);
    } catch (err) {
      // An invalid or revoked token: report it, count its repositories as unreadable, keep checking
      report(`token ${tokenNameFor(owner)}`, tokenNameFor(owner), `unusable (${err.message})`);
      for (const name of names) unreadable.add(name);
    }
  }

  // One line per owner, then one per repository
  const repoNames = [...groups.values()].flat();
  const owners = [];
  for (const owner of [projectOwner, ...repoNames.map(ownerOf), ...allowedOrgs]) {
    if (owner && !owners.some((o) => o.toLowerCase() === owner.toLowerCase())) owners.push(owner);
  }
  for (const owner of owners) {
    const ownRepos = repoNames.filter(
      (name) => ownerOf(name).toLowerCase() === owner.toLowerCase()
    );
    const missing = ownRepos.filter((name) => unreadable.has(name)).length;
    report(
      `org ${owner}`,
      tokenNameFor(owner),
      missing ? `cannot read ${missing} of ${ownRepos.length} repositories` : null
    );
  }
  for (const name of repoNames) {
    report(
      `repo ${name}`,
      tokenNameFor(ownerOf(name)),
      unreadable.has(name) ? `cannot read; needs ${REPO_PERMISSIONS}` : null
    );
  }
  return { projectId, lines, failures };
}

/**
 * Throw when checkAccess found problems, listing all of them.
 * @param {{failures: Array<string>}} result - From checkAccess
 */
function requireAccess(result) {
  if (result.failures.length > 0) {
    throw new Error(
      `Access check failed (${result.failures.length}):\n- ${result.failures.join('\n- ')}\n${TOKEN_HELP}`
    );
  }
}

async function projectWritable(projectId, owner) {
  const { graphql } = getClients(owner);
  const result = await withRetry(() =>
    graphql(
      `
        query ($id: ID!) {
          node(id: $id) {
            ... on ProjectV2 {
              viewerCanUpdate
            }
          }
        }
      `,
      { id: projectId }
    )
  );
  return result?.node?.viewerCanUpdate === true;
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
  const { graphql } = projectClients();
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
  const { graphql } = projectClients();
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
  const { graphql } = projectClients();

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
  const { graphql } = projectClients();
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
  const { graphql } = projectClients();
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
  const { graphql } = projectClients();
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

/**
 * @param {string} pullRequestId
 * @param {string} projectId
 * @param {string} [nameWithOwner] - The PR's repository; its owner picks the token
 */
async function fetchLinkedIssuesForPullRequest(pullRequestId, projectId, nameWithOwner) {
  // The PR owner's token comes first and its errors stop the run. Each other configured token
  // is also asked, so a linked issue the PR owner's token can't see (a private issue in another
  // owner) is still found when another token can read both. Those extra reads are best effort.
  const primary = getClients(ownerOf(nameWithOwner));
  const others = [];
  for (const owner of [null, ..._ownerTokens.keys()]) {
    let clients;
    try {
      clients = getClients(owner);
    } catch {
      continue; // no default token
    }
    if (clients !== primary && !others.includes(clients)) others.push(clients);
  }
  const byId = new Map();
  for (const issue of await linkedIssuesWith(primary.graphql, pullRequestId, projectId)) {
    byId.set(issue.id, issue);
  }
  for (const { graphql } of others) {
    let issues;
    try {
      issues = await linkedIssuesWith(graphql, pullRequestId, projectId);
    } catch {
      continue;
    }
    for (const issue of issues) if (!byId.has(issue.id)) byId.set(issue.id, issue);
  }
  return [...byId.values()];
}

async function linkedIssuesWith(graphql, pullRequestId, projectId) {
  const PROJECT_ITEMS_FRAGMENT = projectItemsFragment(getProjectFields());
  const query = `
    query($pullRequestId: ID!) {
      node(id: $pullRequestId) {
        ... on PullRequest {
          closingIssuesReferences(first: 50) {
            nodes {
              id
              number
              title
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
      title: node.title,
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
  const [owner, repo] = nameWithOwner.split('/');
  const { octokit } = getClients(owner);
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
  checkAccess,
  requireAccess,
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
