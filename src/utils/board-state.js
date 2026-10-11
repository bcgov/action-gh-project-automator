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
  };
}

// GraphQL selection for an item's project items with Status and Sprint, used by search and linked issues
export const PROJECT_ITEMS_FRAGMENT = `
  projectItems(first: 20, includeArchived: true) {
    nodes {
      id
      project { id }
      status: fieldValueByName(name: "Status") {
        ... on ProjectV2ItemFieldSingleSelectValue { name }
      }
      sprint: fieldValueByName(name: "Sprint") {
        ... on ProjectV2ItemFieldIterationValue { iterationId title }
      }
    }
  }
`;
