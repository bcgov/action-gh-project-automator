/**
 * Checks if an item should be excluded based on its title.
 * @param {string | null | undefined} title - The title of the issue or pull request
 * @param {object} [exclusionsConfig] - Optional exclusions configuration from rules.yml
 * @returns {boolean} True if the item should be excluded, false otherwise
 */
const DEFAULT_EXCLUDED_EXACT_TITLES = ['Dependency Dashboard'];
// ZAP report titles: default issue_title of zaproxy/action-full-scan, action-baseline and action-api-scan
const DEFAULT_EXCLUDED_TITLE_SUBSTRINGS = [
  'ZAP Security Report',
  'ZAP Full Scan Report',
  'ZAP Scan Baseline Report',
  'ZAP API Scan Report',
];
// ZAP report titles set with a custom issue_title, e.g. "ZAP: backendPy" in quickstart-openshift-modules
const DEFAULT_EXCLUDED_TITLE_PREFIXES = ['ZAP: '];

export function isTitleExcluded(title, exclusionsConfig) {
  if (typeof title !== 'string') {
    return false;
  }
  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0) {
    return false;
  }

  const exactTitles = exclusionsConfig?.exact_titles || DEFAULT_EXCLUDED_EXACT_TITLES;
  const titleSubstrings = exclusionsConfig?.title_substrings || DEFAULT_EXCLUDED_TITLE_SUBSTRINGS;
  const titlePrefixes = exclusionsConfig?.title_prefixes || DEFAULT_EXCLUDED_TITLE_PREFIXES;

  const exactSet = new Set(exactTitles);

  if (exactSet.has(trimmedTitle)) {
    return true;
  }
  if (titlePrefixes.some((prefix) => trimmedTitle.startsWith(prefix))) {
    return true;
  }
  return titleSubstrings.some((substring) => trimmedTitle.includes(substring));
}
