/**
 * Determines the target column for an item based on its type, state, and current column.
 * @param {string} itemType - 'PullRequest' or 'Issue'
 * @param {boolean} isClosed - Whether the item is closed or merged
 * @param {string|null} currentColumn - The current column on the project board
 * @returns {string|null} The resolved target column name
 */
export function determineTargetColumn(itemType, isClosed, currentColumn) {
  if (isClosed) {
    return 'Done';
  }
  if (itemType === 'PullRequest') {
    return currentColumn === 'Waiting' ? 'Waiting' : 'Active';
  }
  if (itemType === 'Issue') {
    if (currentColumn === 'None' || !currentColumn) {
      return 'New';
    }
  }
  return currentColumn;
}
