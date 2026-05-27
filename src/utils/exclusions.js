/**
 * Checks if an item should be excluded based on its title.
 * @param {string | null | undefined} title - The title of the issue or pull request
 * @returns {boolean} True if the item should be excluded, false otherwise
 */
const EXCLUDED_EXACT_TITLES = new Set(['Dependency Dashboard']);
const EXCLUDED_TITLE_SUBSTRINGS = ['ZAP Security Report'];

export function isTitleExcluded(title) {
  if (typeof title !== 'string' || title.length === 0) {
    return false;
  }
  if (EXCLUDED_EXACT_TITLES.has(title)) {
    return true;
  }
  return EXCLUDED_TITLE_SUBSTRINGS.some((substring) => title.includes(substring));
}
