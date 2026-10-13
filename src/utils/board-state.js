/**
 * Read an item's board membership, column and sprint from the projectItems in its search result.
 * @param {object} item - Issue or PR node with projectItems.nodes
 * @param {string} projectId
 * @returns {{ projectItemId: string, column: string|null, sprint: {id: string, title: string}|null } | null}
 *   null when the item isn't on the project
 */
export function boardState(item, projectId) {
  const projectItem = (item?.projectItems?.nodes || []).find((p) => p?.project?.id === projectId);
  if (!projectItem) return null;
  const sprint = projectItem.sprint?.iterationId
    ? { id: projectItem.sprint.iterationId, title: projectItem.sprint.title }
    : null;
  return {
    projectItemId: projectItem.id,
    column: projectItem.status?.name || null,
    sprint,
    isArchived: Boolean(projectItem.isArchived),
  };
}

/**
 * GraphQL selection for an item's project items with status and sprint, used by search and linked issues.
 * @param {{ status: string, sprint: string }} fields - `project.fields` from rules.yml
 * @returns {string}
 */
export function projectItemsFragment(fields) {
  if (!fields?.status) {
    throw new Error('project.fields.status from rules.yml is required');
  }
  const sprintSelection = fields.sprint
    ? `sprint: fieldValueByName(name: ${JSON.stringify(fields.sprint)}) {
        ... on ProjectV2ItemFieldIterationValue { iterationId title }
      }`
    : '';
  return `
  projectItems(first: 20, includeArchived: true) {
    nodes {
      id
      isArchived
      project { id }
      status: fieldValueByName(name: ${JSON.stringify(fields.status)}) {
        ... on ProjectV2ItemFieldSingleSelectValue { name }
      }
      ${sprintSelection}
    }
  }
`;
}
