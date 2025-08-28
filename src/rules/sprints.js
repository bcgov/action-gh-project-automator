const { graphql } = require('../github/api');
const { log } = require('../utils/log');
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
  const result = await graphql(`
    query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          field(name: "Sprint") {
            ... on ProjectV2IterationField {
              id
              configuration {
                iterations { id title duration startDate }
              }
            }
          }
        }
      }
    }
  `, { projectId });
  const iterations = result?.node?.field?.configuration?.iterations || [];
  sprintIterationsCache.set(projectId, iterations);
  return iterations;
}


// Columns eligible for sprint assignment
const ELIGIBLE_COLUMNS = ['Next', 'Active', 'Done', 'Waiting'];

/**
 * Get current sprint information for a project item
 * @param {string} projectId - The project board ID
 * @param {string} itemId - The project item ID
 * @returns {Promise<{sprintId: string|null, sprintTitle: string|null}>}
 */
async function getItemSprint(projectId, itemId) {
  // Resolve Sprint field ID to disambiguate values
  const sprintFieldId = await getSprintFieldId(projectId);
  const result = await graphql(`
    query($itemId: ID!) {
      item: node(id: $itemId) {
        ... on ProjectV2Item {
          fieldValues(first: 20) {
            nodes {
              ... on ProjectV2ItemFieldIterationValue {
                iterationId
                title
                field { ... on ProjectV2IterationField { id } }
              }
            }
          }
        }
      }
    }
  `, { itemId });

  const fieldValues = result.item?.fieldValues?.nodes || [];
  const sprintValue = fieldValues.find(v => v?.field?.id === sprintFieldId);

  return {
    sprintId: sprintValue?.iterationId || null,
    sprintTitle: sprintValue?.title || null
  };
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
  for (const sprint of iterations) {
    const { start, end } = computeSprintWindow(sprint.startDate, sprint.duration);
    if (when >= start && when < end) return { id: sprint.id, title: sprint.title };
  }
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
async function setItemSprintsBatch(projectId, updates, batchSize = 20) {
  if (!Array.isArray(updates) || updates.length === 0) return 0;
  const fieldId = await getSprintFieldId(projectId);
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
    const res = await graphql(mutation, variables);
    // Each alias key (m0, m1, ...) maps to a mutation result
    Object.keys(res || {}).forEach(mutationKey => {
      if (res[mutationKey]?.projectV2Item?.id) success += 1;
    });
  }
  return success;
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

  // Only process items in Next, Active, Done, or Waiting columns
  if (!ELIGIBLE_COLUMNS.includes(currentColumn)) {
    log.info(`  • Skip: Not in Next, Active, Done, or Waiting column (${currentColumn})`);
    return {
      changed: false,
      reason: 'Not in Next, Active, Done, or Waiting column'
    };
  }

  // Get current sprint assignment
  const { sprintId: currentSprintId, sprintTitle: currentSprintTitle } =
    await getItemSprint(projectId, projectItemId);
  log.info(`  • Current sprint: ${currentSprintTitle || 'None'} (${currentSprintId || 'None'})`);

  // Get active sprint or historical sprint depending on column
  try {
    // For Done column, anchor to completion date; refuse defaults
    if (currentColumn === 'Done') {
      const completedAt = await getItemCompletionDate(projectItemId);
      if (!completedAt) {
        const errMsg = 'Done item has no closed/merged date; refusing to default to current sprint';
        log.error(`  • Error: ${errMsg}`);
        throw new Error(errMsg);
      }
      const target = await findSprintForDate(projectId, completedAt);
      if (!target) {
        const errMsg = `No sprint covers completion date ${completedAt}`;
        log.error(`  • Error: ${errMsg}`);
        throw new Error(errMsg);
      }

      log.info(`  • Target sprint by completion date: ${target.title} (${target.id})`);

      if (String(currentSprintId) === String(target.id)) {
        log.info('  • Skip: Done item already in correct historical sprint');
        return { changed: false, reason: 'Historical sprint already set' };
      }

      // Set sprint to historical target
      const sprintFieldId = await getSprintFieldId(projectId);
      await graphql(`
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
      `, { projectId, itemId: projectItemId, fieldId: sprintFieldId, iterationId: target.id });

      return { changed: true, newSprint: target.id, reason: `Assigned to historical sprint (${target.title})` };
    }

    // For Active/Next/Waiting: use current sprint, with no-op guard
    const { sprintId: activeSprintId, title: activeSprintTitle } = await getCurrentSprint(projectId);
    log.info(`  • Active sprint: ${activeSprintTitle} (${activeSprintId})`);

    if (String(currentSprintId) === String(activeSprintId)) {
      log.info('  • Skip: Already in active sprint');
      return { changed: false, reason: 'Already in active sprint' };
    }

    const sprintFieldId = await getSprintFieldId(projectId);
    await graphql(`
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $iterationId: String!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: { iterationId: $iterationId }
        }) { projectV2Item { id } }
      }
    `, { projectId, itemId: projectItemId, fieldId: sprintFieldId, iterationId: activeSprintId });

    return { changed: true, newSprint: activeSprintId, reason: `Assigned to current sprint (${activeSprintTitle})` };

  } catch (error) {
    const message = error?.message || '';
    // Gracefully skip if there is no sprint configured or no active sprint
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

module.exports = {
  processSprintAssignment,
  getItemSprint,
  getCurrentSprint,
  setItemSprintsBatch,
  getSprintFieldId
};
