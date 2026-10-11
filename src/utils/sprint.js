/**
 * Decide the sprint change for an item from `rules.yml` `sprints`.
 * @param {string|null} column - The item's column after column moves
 * @param {{id: string}|null} currentSprint - The item's sprint
 * @param {string|null} currentSprintId - The project's current iteration
 * @param {object} sprints - `sprints` from rules.yml
 * @param {Array<string>} sprints.assign_current - Columns that always get the current sprint
 * @param {Array<string>} sprints.assign_current_if_empty - Columns that get it only when unset
 * @param {Array<string>} sprints.clear - Columns that have the sprint removed
 * @returns {'assign'|'clear'|null}
 */
export function sprintAction(column, currentSprint, currentSprintId, sprints) {
  if (!sprints?.assign_current || !sprints.assign_current_if_empty || !sprints.clear) {
    throw new Error('sprints from rules.yml is required');
  }
  if (!column) return null;
  if (sprints.clear.includes(column)) {
    return currentSprint ? 'clear' : null;
  }
  if (!currentSprintId) return null;
  if (sprints.assign_current.includes(column)) {
    return currentSprint?.id === currentSprintId ? null : 'assign';
  }
  if (sprints.assign_current_if_empty.includes(column)) {
    return currentSprint ? null : 'assign';
  }
  return null;
}
