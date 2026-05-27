/**
 * Checks if an item should be excluded based on its title.
 * @param {string} title - The title of the issue or pull request
 * @returns {boolean} True if the item should be excluded, false otherwise
 */
export function isTitleExcluded(title) {
  if (!title) return false;
  const excludedTitles = ['Dependency Dashboard', 'ZAP Security Report'];
  return excludedTitles.includes(title) || title.includes('ZAP Security Report');
}
