const { octokit, graphql } = require('../github/api');
const { log } = require('../utils/log');
const { processAssigneeRules } = require('./processors/unified-rule-processor');

/**
 * Get details about a project item including its linked content
 * @param {string} itemId - The project item ID
 * @returns {Promise<Object>} Item details including repository info
 */
async function getItemDetails(itemId) {
  try {
    const result = await octokit.graphql(`
      query($itemId: ID!) {
        node(id: $itemId) {
          ... on ProjectV2Item {
            id
            type
            content {
              ... on Issue {
                id
                number
                repository {
                  nameWithOwner
                }
              }
              ... on PullRequest {
                id
                number
                repository {
                  nameWithOwner
                }
              }
            }
          }
        }
      }
    `, {
      itemId
    });
    
    return result.node;
  } catch (error) {
    log.error(`Failed to get item details: ${error.message}`);
    return null;
  }
}

/**
 * Compare two arrays for equality
 * @param {Array} a - First array
 * @param {Array} b - Second array
 * @returns {boolean}
 */
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

/**
 * Get assignees for a project item
 * @param {string} projectId - The project board ID
 * @param {string} itemId - The project item ID
 * @returns {Promise<string[]>} Array of assignee logins
 */
async function getItemAssignees(projectId, itemId) {
  const result = await octokit.graphql(`
    query($projectId: ID!, $itemId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          field(name: "Assignees") {
            ... on ProjectV2Field {
              id
            }
          }
        }
      }
      item: node(id: $itemId) {
        ... on ProjectV2Item {
          fieldValues(first: 10) {
            nodes {
              ... on ProjectV2ItemFieldUserValue {
                field {
                  ... on ProjectV2Field {
                    name
                  }
                }
                users(first: 10) {
                  nodes {
                    login
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
  });

  const fieldValues = result.item?.fieldValues.nodes || [];
  const assigneeValue = fieldValues.find(v => v.field?.name === 'Assignees');
  
  if (!assigneeValue) {
    return [];
  }

  return assigneeValue.users?.nodes?.map(u => u.login) || [];
}

/**
 * Set assignees for a project item
 * @param {string} projectId - The project board ID
 * @param {string} itemId - The project item ID
 * @param {string[]} assigneeLogins - Array of assignee logins
 * @returns {Promise<void>}
 */
async function setItemAssignees(projectId, itemId, assigneeLogins) {
  try {
    // Get item details to get repository and number
    const itemDetails = await getItemDetails(itemId);
    if (!itemDetails || !itemDetails.content) {
      throw new Error(`Could not get details for item ${itemId}`);
    }

    const { repository, number, id: assignableId } = itemDetails.content;
    const [owner, repo] = repository.nameWithOwner.split('/');
    const isPullRequest = itemDetails.type === 'PullRequest';

    // Current repo-level assignees to support no-op guard and delta
    const issueOrPrData = isPullRequest
      ? await octokit.rest.pulls.get({ owner, repo, pull_number: number })
      : await octokit.rest.issues.get({ owner, repo, issue_number: number });
    const current = (issueOrPrData.data.assignees || []).map(a => a.login);

    // No-op guard
    if (arraysEqual(current, assigneeLogins)) {
      log.info('Assignees already up to date; skipping');
      return;
    }

    // Compute delta to minimize calls
    const toAdd = assigneeLogins.filter(a => !current.includes(a));
    if (toAdd.length === 0) {
      log.info('No new assignees to add; skipping');
      return;
    }

    // Resolve user IDs in one batched GraphQL call
    const { ids, missing } = await getUserIdsBatched(toAdd);
    if (missing.length > 0) {
      log.warning(`Some assignee logins not found: ${missing.join(', ')}`);
    }
    if (ids.length === 0) {
      log.info('No valid assignee IDs to add; skipping');
      return;
    }

    // Use GraphQL addAssigneesToAssignable to add assignees in one call
    const mutation = `mutation($assignableId: ID!, $assigneeIds: [ID!]!) {
      addAssigneesToAssignable(input: { assignableId: $assignableId, assigneeIds: $assigneeIds }) {
        assignable { __typename }
      }
    }`;
    await graphql(mutation, { assignableId, assigneeIds: ids });
    log.info(`Successfully added assignees: ${toAdd.join(', ')}`);
  } catch (error) {
    log.error(`Failed to update assignees: ${error.message}`, true);
    throw new Error(`Failed to update assignees: ${error.message}`);
  }
}

// Cache user login -> id during run
const userIdCache = new Map();

async function getUserIdsBatched(logins) {
  const unique = [...new Set(logins.filter(Boolean))];
  const ids = [];
  const missing = [];

  // Prepare vars for uncached logins
  const uncached = unique.filter(l => !userIdCache.has(l));
  if (uncached.length > 0) {
    const varDecls = uncached.map((_, i) => `$l${i}: String!`).join(', ');
    const fields = uncached.map((_, i) => `u${i}: user(login: $l${i}) { id login }`).join(' ');
    const query = `query(${varDecls}) { ${fields} }`;
    const variables = {};
    uncached.forEach((l, i) => { variables[`l${i}`] = l; });
    const res = await graphql(query, variables);
    uncached.forEach((l, i) => {
      const node = res[`u${i}`];
      if (node?.id) userIdCache.set(l, node.id); else missing.push(l);
    });
  }

  unique.forEach(l => {
    const id = userIdCache.get(l);
    if (id) ids.push(id); else if (!missing.includes(l)) missing.push(l);
  });

  return { ids, missing };
}

/**
 * Implementation of Rule Set 5: Assignee Rules
 * 
 * Uses YAML configuration to determine assignee actions
 * 
 * @param {Object} item - The PR or Issue
 * @param {string} projectId - The project board ID
 * @param {string} itemId - The project item ID
 * @returns {Promise<{changed: boolean, assignees: string[], reason: string}>}
 */
async function processAssignees(item, projectId, itemId) {
  log.info(`\nProcessing assignees for ${item.__typename || item.type} #${item.number}:`, true);

  // Get current assignees from both project and Issue/PR
  const currentAssignees = await getItemAssignees(projectId, itemId);
  log.info(`  • Current assignees in project: ${currentAssignees.join(', ') || 'none'}`, true);

  const itemDetails = await getItemDetails(itemId);
  if (!itemDetails || !itemDetails.content) {
    throw new Error(`Could not get details for item ${itemId}`);
  }

  const { repository, number } = itemDetails.content;
  
  // Validate repository format before splitting
  if (!repository || 
      typeof repository.nameWithOwner !== 'string' || 
      !repository.nameWithOwner.includes('/')) {
    throw new Error(`Invalid repository.nameWithOwner format for item ${itemId}: ${repository?.nameWithOwner}`);
  }
  
  const [owner, repo] = repository.nameWithOwner.split('/');
  const isPullRequest = itemDetails.type === 'PullRequest';
  
  // Get current Issue/PR assignees
  const issueOrPrData = isPullRequest
    ? await octokit.rest.pulls.get({ owner, repo, pull_number: number })
    : await octokit.rest.issues.get({ owner, repo, issue_number: number });

  const repoAssignees = issueOrPrData.data.assignees.map(a => a.login);
  log.info(`  • Current assignees in Issue/PR: ${repoAssignees.join(', ') || 'none'}`, true);

  // Process assignee rules from YAML config
  const assigneeActions = await processAssigneeRules(item);
  
  if (assigneeActions.length === 0) {
    return {
      changed: false,
      assignees: currentAssignees,
      reason: 'No assignee rules triggered'
    };
  }

  // Apply the first assignee action (assuming one assignee rule per item)
  const action = assigneeActions[0];
  
  // Debug logging
  log.info(`  • Action object: ${JSON.stringify(action)}`, true);
  
  let assigneeToAdd = action.params.assignee;
  
  // Unified template variable substitution
  if (typeof assigneeToAdd === 'string') {
    // Support both ${item.author} and item.author formats
    if (assigneeToAdd.includes('${item.author}')) {
      assigneeToAdd = assigneeToAdd.replace('${item.author}', item.author?.login || '');
    } else if (assigneeToAdd === 'item.author') {
      assigneeToAdd = item.author?.login;
    }
  }
  
  if (!assigneeToAdd) {
    return {
      changed: false,
      assignees: currentAssignees,
      reason: 'No valid assignee found'
    };
  }

  // Check if assignee is already set
  if (currentAssignees.includes(assigneeToAdd)) {
    return {
      changed: false,
      assignees: currentAssignees,
      reason: `Assignee ${assigneeToAdd} already assigned`
    };
  }

  // Add the assignee
  const targetAssignees = [...new Set([...currentAssignees, assigneeToAdd])];
  log.info(`  • Setting assignees: ${targetAssignees.join(', ')}`, true);

  // Set assignees both in project and in the actual PR/Issue
  await setItemAssignees(projectId, itemId, targetAssignees);

  return {
    changed: true,
    assignees: targetAssignees,
    reason: `Added ${assigneeToAdd} as assignee`
  };
}

const moduleExports = {
  processAssignees,
  getItemAssignees,
  setItemAssignees,
  getItemDetails
};
module.exports = moduleExports;
