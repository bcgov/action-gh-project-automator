import { graphql } from '../github/api.js';
import { log } from '../utils/log.js';
// Cache Sprint field ID and iterations per project during a run
const sprintFieldIdCache = new Map(); // projectId -> fieldId
const sprintIterationsCache = new Map(); // projectId -> iterations array

/**
 * Compute sprint window [start, end) given startDate ISO and duration (days)
 * @param {string} startDateIso
 * @param {number} durationDays
 * @returns {{ start: Date, end: Date }}
 */
function computeSprintWindow(startDateIso, durationDays) {
  const start = new Date(startDateIso);
  const end = new Date(start);
  end.setDate(end.getDate() + durationDays);
  return { start, end };
}

async function getSprintFieldId(projectId) {
  if (sprintFieldIdCache.has(projectId)) return sprintFieldIdCache.get(projectId);
  const res = await graphql(`
    query($projectId: ID!) {
      node(id: $projectId) { ... on ProjectV2 { field(name: "Sprint") { ... on ProjectV2IterationField { id } } } }
    }
  `, { projectId });
  const id = res?.node?.field?.id;
  if (id) sprintFieldIdCache.set(projectId, id);
  return id;
}

/**
 * Get all sprint iterations for a project, with caching
 * @param {string} projectId
 * @returns {Promise<Array<{id: string, title: string, duration: number, startDate: string}>>}
 */
async function getSprintIterations(projectId) {
  if (sprintIterationsCache.has(projectId)) {
    return sprintIterationsCache.get(projectId);
  }

  // Query both active and completed iterations
  const result = await graphql(`
    query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          field(name: "Sprint") {
            ... on ProjectV2IterationField {
              id
              configuration {
                iterations {
                  id
                  title
                  duration
                  startDate
                }
                completedIterations {
                  id
                  title
                  duration
                  startDate
                }
              }
            }
          }
        }
      }
    }
  `, { projectId });

  // Combine active and completed iterations
  const activeIterations = result?.node?.field?.configuration?.iterations || [];
  const completedIterations = result?.node?.field?.configuration?.completedIterations || [];
  const allIterations = [...activeIterations, ...completedIterations];

  sprintIterationsCache.set(projectId, allIterations);
  return allIterations;
}


// Columns eligible for sprint assignment
const ELIGIBLE_COLUMNS = ['Next', 'Active', 'Done', 'Waiting'];
const INACTIVE_COLUMNS = ['New', 'Parked', 'Backlog'];

/**
 * Get current sprint information for a project item
 * @param {string} projectId - The project board ID
 * @param {string} itemId - The project item ID
 * @returns {Promise<{sprintId: string|null, sprintTitle: string|null}>}
 */
async function getItemSprint(projectId, itemId) {
  // Resolve Sprint field ID to disambiguate values
  const sprintFieldId = await getSprintFieldId(projectId);

  let cursor = null;
  while (true) {
    const result = await graphql(`
      query($itemId: ID!, $cursor: String) {
        item: node(id: $itemId) {
          ... on ProjectV2Item {
            fieldValues(first: 50, after: $cursor) {
              nodes {
                ... on ProjectV2ItemFieldIterationValue {
                  iterationId
                  title
                  field { ... on ProjectV2IterationField { id } }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      }
    `, { itemId, cursor });

    const fieldValues = result.item?.fieldValues?.nodes || [];
    const sprintValue = fieldValues.find(v => v?.field?.id === sprintFieldId);
    if (sprintValue) {
      return {
        sprintId: sprintValue.iterationId || null,
        sprintTitle: sprintValue.title || null
      };
    }

    const pageInfo = result.item?.fieldValues?.pageInfo;
    if (!pageInfo?.hasNextPage) break;
    cursor = pageInfo.endCursor;
  }

  return { sprintId: null, sprintTitle: null };
}

/**
 * Get the current active sprint
 * @param {string} projectId - The project board ID
 * @returns {Promise<{sprintId: string, title: string}>}
 */
async function getCurrentSprint(projectId) {
  const today = new Date().toISOString();
  log.info('Getting current sprint:');
  log.info(`  • Current date: ${today}`);
  const iterations = await getSprintIterations(projectId);
  log.info(`  • Found ${iterations.length} sprints`);

  const currentSprint = iterations.find(sprint => {
    const { start, end } = computeSprintWindow(sprint.startDate, sprint.duration);
    const now = new Date();
    const isCurrentSprint = now >= start && now < end;
    log.debug(`  • Sprint "${sprint.title}": ${start.toISOString()} to ${end.toISOString()} - ${isCurrentSprint ? 'CURRENT' : 'not current'}`);
    return isCurrentSprint;
  });

  if (!currentSprint) {
    log.warning('  • No active sprint found matching current date');
    throw new Error('No active sprint found');
  }

  log.info(`  • Current sprint: ${currentSprint.title} (${currentSprint.id})`);
  return {
    sprintId: currentSprint.id,
    title: currentSprint.title
  };
}

/**
 * Find the sprint that contains a specific ISO date
 * @param {string} projectId
 * @param {string} isoDate
 * @returns {Promise<{id: string, title: string}|null>}
 */
async function findSprintForDate(projectId, isoDate) {
  const when = new Date(isoDate);
  const iterations = await getSprintIterations(projectId);

  log.debug(`Finding sprint for date: ${isoDate} (parsed: ${when.toISOString()})`);
  log.debug(`Checking against ${iterations.length} sprints`);

  for (const sprint of iterations) {
    const { start, end } = computeSprintWindow(sprint.startDate, sprint.duration);
    const isInRange = when >= start && when < end;
    log.debug(`  Sprint "${sprint.title}": ${start.toISOString()} to ${end.toISOString()} - ${isInRange ? 'MATCH' : 'no match'}`);
    if (isInRange) {
      log.debug(`  ✅ Found matching sprint: ${sprint.title} (${sprint.id})`);
      return { id: sprint.id, title: sprint.title };
    }
  }

  log.warning(`❌ No sprint found for date ${isoDate} among ${iterations.length} available sprints`);
  return null;
}

/**
 * Extract completion date from content node
 * @param {any} content
 * @returns {string|null}
 */
function getCompletionDateFromContent(content) {
  if (!content) return null;
  switch (content.__typename) {
    case 'PullRequest':
      return content.mergedAt || content.closedAt || null;
    case 'Issue':
      return content.closedAt || null;
    default:
      return content.closedAt || null;
  }
}

/**
 * Get the completion timestamp for an item (mergedAt for PRs if present, else closedAt)
 * @param {string} projectItemId
 * @returns {Promise<string|null>} ISO timestamp or null
 */
async function getItemCompletionDate(projectItemId) {
  const result = await graphql(`
    query($itemId: ID!) {
      node(id: $itemId) {
        ... on ProjectV2Item {
          content {
            __typename
            ... on Issue { closedAt }
            ... on PullRequest { closedAt mergedAt }
          }
        }
      }
    }
  `, { itemId: projectItemId });
  const content = result?.node?.content;
  return getCompletionDateFromContent(content);
}

/**
 * Batch set Sprint iteration for multiple items using GraphQL aliases
 * @param {string} projectId
 * @param {Array<{ projectItemId: string, iterationId: string }>} updates
 * @param {number} batchSize
 * @returns {Promise<number>} count of successful updates
 */
async function setItemSprintsBatch(projectId, updates, batchSize = 20, options = {}) {
  const {
    getSprintFieldId: getSprintFieldIdFn = getSprintFieldId,
    graphqlClient = graphql
  } = options;

  if (!Array.isArray(updates) || updates.length === 0) return 0;
  const fieldId = await getSprintFieldIdFn(projectId);
  if (!fieldId) {
    log.warning(`Sprint field not found for project ${projectId}. Aborting sprint batch update of ${updates.length} items.`);
    return 0;
  }
  let success = 0;
  for (let i = 0; i < updates.length; i += batchSize) {
    const slice = updates.slice(i, i + batchSize);
    const varDecls = [];
    const parts = [];
    const variables = {};
    slice.forEach((u, idx) => {
      const vName = `input${idx}`;
      varDecls.push(`$${vName}: UpdateProjectV2ItemFieldValueInput!`);
      parts.push(`m${idx}: updateProjectV2ItemFieldValue(input: $${vName}) { projectV2Item { id } }`);
      variables[vName] = {
        projectId,
        itemId: u.projectItemId,
        fieldId,
        value: { iterationId: u.iterationId }
      };
    });
    const mutation = `mutation(${varDecls.join(', ')}) { ${parts.join(' ')} }`;
    const res = await graphqlClient(mutation, variables);
    // Each alias key (m0, m1, ...) maps to a mutation result
    Object.keys(res || {}).forEach(mutationKey => {
      if (res[mutationKey]?.projectV2Item?.id) success += 1;
    });
  }
  return success;
}

async function assignItemToSprint(projectId, projectItemId, iterationId, overrides = {}) {
  const {
    getSprintFieldId: getSprintFieldIdFn = getSprintFieldId,
    graphqlClient = graphql
  } = overrides;

  const sprintFieldId = await getSprintFieldIdFn(projectId);
  if (!sprintFieldId) {
    throw new Error(`Sprint field not found for project ${projectId}`);
  }

  await graphqlClient(`
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $iterationId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $fieldId
        value: { iterationId: $iterationId }
      }) {
        projectV2Item { id }
      }
    }
  `, { projectId, itemId: projectItemId, fieldId: sprintFieldId, iterationId });

  return iterationId;
}

/**
 * Determine the sprint action required for a project item based on its column and current sprint state.
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} params.projectItemId
 * @param {string} params.currentColumn
 * @returns {Promise<{
 *   action: 'assign' | 'remove' | 'skip',
 *   reason: string,
 *   targetIterationId?: string,
 *   targetSprintTitle?: string,
 *   currentSprintId?: string|null,
 *   currentSprintTitle?: string|null
 * }>}
 */
async function determineSprintAction({ projectId, projectItemId, currentColumn }, overrides = {}) {
  const {
    getItemSprint: getItemSprintFn = getItemSprint,
    getCurrentSprint: getCurrentSprintFn = getCurrentSprint,
    getSprintIterations: getSprintIterationsFn = getSprintIterations,
    getItemCompletionDate: getItemCompletionDateFn = getItemCompletionDate,
    findSprintForDate: findSprintForDateFn = findSprintForDate
  } = overrides;

  const { sprintId: currentSprintId, sprintTitle: currentSprintTitle } =
    await getItemSprintFn(projectId, projectItemId);

  if (!ELIGIBLE_COLUMNS.includes(currentColumn) && !INACTIVE_COLUMNS.includes(currentColumn)) {
    return {
      action: 'skip',
      reason: `Column ${currentColumn} not eligible for sprint changes`,
      currentSprintId,
      currentSprintTitle
    };
  }

  if (ELIGIBLE_COLUMNS.includes(currentColumn)) {
    if (currentColumn === 'Done') {
      const completedAt = await getItemCompletionDateFn(projectItemId);
      if (!completedAt) {
        return {
          action: 'skip',
          reason: 'Done item has no closed/merged date; refusing to default to current sprint',
          currentSprintId,
          currentSprintTitle
        };
      }

      const target = await findSprintForDateFn(projectId, completedAt);
      if (target) {
        if (String(currentSprintId) === String(target.id)) {
          return {
            action: 'skip',
            reason: 'Historical sprint already set',
            currentSprintId,
            currentSprintTitle
          };
        }

        return {
          action: 'assign',
          reason: `Assigned to historical sprint (${target.title})`,
          targetIterationId: target.id,
          targetSprintTitle: target.title,
          currentSprintId,
          currentSprintTitle
        };
      }

      const iterations = await getSprintIterationsFn(projectId);
      const completionDate = new Date(completedAt);
      const sortedIterations = [...iterations].sort(
        (a, b) => new Date(a.startDate) - new Date(b.startDate)
      );
      const nextSprint = sortedIterations.find(sprint => {
        const sprintStart = new Date(sprint.startDate);
        return sprintStart > completionDate;
      });

      if (nextSprint) {
        if (String(currentSprintId) === String(nextSprint.id)) {
          return {
            action: 'skip',
            reason: 'Historical sprint already set',
            currentSprintId,
            currentSprintTitle
          };
        }

        return {
          action: 'assign',
          reason: `Assigned to next available sprint (${nextSprint.title})`,
          targetIterationId: nextSprint.id,
          targetSprintTitle: nextSprint.title,
          currentSprintId,
          currentSprintTitle
        };
      }

      return {
        action: 'skip',
        reason: 'No sprint covers completion date and no future sprint available',
        currentSprintId,
        currentSprintTitle
      };
    }

    try {
      const { sprintId: activeSprintId, title: activeSprintTitle } = await getCurrentSprintFn(projectId);
      if (String(currentSprintId) === String(activeSprintId)) {
        return {
          action: 'skip',
          reason: 'Already in active sprint',
          currentSprintId,
          currentSprintTitle
        };
      }

      return {
        action: 'assign',
        reason: `Assigned to current sprint (${activeSprintTitle})`,
        targetIterationId: activeSprintId,
        targetSprintTitle: activeSprintTitle,
        currentSprintId,
        currentSprintTitle
      };
    } catch (error) {
      const message = error?.message || '';
      if (
        message.includes('No active sprint') ||
        message.includes('field(name: "Sprint")') ||
        message.includes('Cannot read properties of undefined')
      ) {
        return {
          action: 'skip',
          reason: 'No active sprint or Sprint field not configured',
          currentSprintId,
          currentSprintTitle
        };
      }

      throw error;
    }
  }

  // Inactive columns handling
  if (!currentSprintId) {
    return {
      action: 'skip',
      reason: 'No sprint assigned',
      currentSprintId,
      currentSprintTitle
    };
  }

  return {
    action: 'remove',
    reason: `Removed sprint from inactive column (${currentColumn})`,
    currentSprintId,
    currentSprintTitle
  };
}

/**
 * Process sprint assignment for an item based on requirements
 * @param {Object} item - The issue or PR
 * @param {string} projectItemId - The project item ID
 * @param {string} projectId - The project board ID
 * @param {string} currentColumn - The item's current column name
 * @returns {Promise<{changed: boolean, newSprint?: string}>}
 */
async function processSprintAssignment(item, projectItemId, projectId, currentColumn) {
  log.info(`Processing sprint assignment for ${item.__typename} #${item.number}:`);
  log.info(`  • Current column: ${currentColumn}`);

  const decision = await determineSprintAction({ projectId, projectItemId, currentColumn });
  log.info(`  • Current sprint: ${decision.currentSprintTitle || 'None'} (${decision.currentSprintId || 'None'})`);

  if (decision.action !== 'assign') {
    log.info(`  • Skip: ${decision.reason}`);
    return {
      changed: false,
      reason: decision.reason
    };
  }

  try {
    await assignItemToSprint(projectId, projectItemId, decision.targetIterationId);
    log.info(`  • Assigned sprint: ${decision.targetSprintTitle || decision.targetIterationId}`);
    return {
      changed: true,
      newSprint: decision.targetIterationId,
      reason: decision.reason
    };
  } catch (error) {
    const message = error?.message || '';
    if (
      message.includes('No active sprint') ||
      message.includes('field(name: "Sprint")') ||
      message.includes('Cannot read properties of undefined')
    ) {
      log.info('  • Skip: No active sprint or Sprint field not configured');
      return {
        changed: false,
        reason: 'No active sprint or Sprint field not configured'
      };
    }

    log.error(`  • Error: Failed to process sprint assignment: ${message}`);
    if (error.stack) log.error(error.stack);
    throw error;
  }
}

/**
 * Remove sprint assignment from a project item
 * @param {string} projectId - The project board ID
 * @param {string} projectItemId - The project item ID
 * @returns {Promise<boolean>} True if sprint was removed successfully
 */
async function removeItemSprint(projectId, projectItemId) {
  try {
    const sprintFieldId = await getSprintFieldId(projectId);
    if (!sprintFieldId) {
      log.warning(`Sprint field not found for project ${projectId}. Cannot remove sprint.`);
      return false;
    }

    // Clear sprint field using GitHub's dedicated clear mutation
    // This is the correct way to clear iteration field values per GitHub GraphQL API
    await graphql(`
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!) {
        clearProjectV2ItemFieldValue(input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
        }) {
          projectV2Item { id }
        }
      }
    `, { projectId, itemId: projectItemId, fieldId: sprintFieldId });

    return true;
  } catch (error) {
    log.error(`Failed to remove sprint from item ${projectItemId}: ${error.message}`);
    throw error;
  }
}

/**
 * Process sprint removal for items in inactive columns
 * @param {Object} item - The issue or PR
 * @param {string} projectItemId - The project item ID
 * @param {string} projectId - The project board ID
 * @param {string} currentColumn - The item's current column name
 * @returns {Promise<{changed: boolean, reason?: string}>}
 */
async function processSprintRemoval(item, projectItemId, projectId, currentColumn) {
  log.info(`Processing sprint removal for ${item.__typename} #${item.number}:`);
  log.info(`  • Current column: ${currentColumn}`);

  const decision = await determineSprintAction({ projectId, projectItemId, currentColumn });
  log.info(`  • Current sprint: ${decision.currentSprintTitle || 'None'} (${decision.currentSprintId || 'None'})`);

  if (decision.action !== 'remove') {
    log.info(`  • Skip: ${decision.reason}`);
    return {
      changed: false,
      reason: decision.reason
    };
  }

  try {
    await removeItemSprint(projectId, projectItemId);
    log.info(`  • Removed sprint: ${decision.currentSprintTitle} (${decision.currentSprintId})`);

    return {
      changed: true,
      reason: decision.reason
    };
  } catch (error) {
    const message = error?.message || '';
    if (
      message.includes('field(name: "Sprint")') ||
      message.includes('Cannot read properties of undefined') ||
      message.includes('Sprint field not found')
    ) {
      log.info('  • Skip: Sprint field not configured');
      return {
        changed: false,
        reason: 'Sprint field not configured'
      };
    }

    log.error(`  • Error: Failed to remove sprint: ${message}`);
    if (error.stack) log.error(error.stack);
    throw error;
  }
}

/**
 * Clear sprint values in batches using GraphQL aliases
 * @param {string} projectId
 * @param {Array<{ projectItemId: string }>} removals
 * @param {number} batchSize
 * @returns {Promise<number>}
 */
async function clearItemSprintsBatch(projectId, removals, batchSize = 20, options = {}) {
  const {
    getSprintFieldId: getSprintFieldIdFn = getSprintFieldId,
    graphqlClient = graphql
  } = options;

  if (!Array.isArray(removals) || removals.length === 0) return 0;
  const fieldId = await getSprintFieldIdFn(projectId);
  if (!fieldId) {
    log.warning(`Sprint field not found for project ${projectId}. Aborting sprint clear batch of ${removals.length} items.`);
    return 0;
  }

  let success = 0;
  for (let i = 0; i < removals.length; i += batchSize) {
    const slice = removals.slice(i, i + batchSize);
    const varDecls = [];
    const parts = [];
    const variables = {};

    slice.forEach((removal, idx) => {
      const vName = `input${idx}`;
      varDecls.push(`$${vName}: ClearProjectV2ItemFieldValueInput!`);
      parts.push(`m${idx}: clearProjectV2ItemFieldValue(input: $${vName}) { projectV2Item { id } }`);
      variables[vName] = {
        projectId,
        itemId: removal.projectItemId,
        fieldId
      };
    });

    const mutation = `mutation(${varDecls.join(', ')}) { ${parts.join(' ')} }`;
    const res = await graphqlClient(mutation, variables);
    Object.keys(res || {}).forEach(mutationKey => {
      if (res[mutationKey]?.projectV2Item?.id) success += 1;
    });
  }

  return success;
}

export {
  processSprintAssignment,
  processSprintRemoval,
  determineSprintAction,
  getItemSprint,
  getCurrentSprint,
  setItemSprintsBatch,
  clearItemSprintsBatch,
  getSprintFieldId,
  getSprintIterations,
  findSprintForDate,
  removeItemSprint
};
