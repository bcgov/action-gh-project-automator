/**
 * Checks if an item should be excluded based on its title.
 * @param {string | null | undefined} title - The title of the issue or pull request
 * @param {object} exclusionsConfig - `exclusions` from rules.yml (required by the schema)
 * @returns {boolean} True if the item should be excluded, false otherwise
 */
export function isTitleExcluded(title, exclusionsConfig) {
  if (!exclusionsConfig) {
    throw new Error('exclusions from rules.yml is required');
  }
  if (typeof title !== 'string') {
    return false;
  }
  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0) {
    return false;
  }

  const exactTitles = exclusionsConfig.exact_titles || [];
  const titleSubstrings = exclusionsConfig.title_substrings || [];
  const titlePrefixes = exclusionsConfig.title_prefixes || [];

  const exactSet = new Set(exactTitles);

  if (exactSet.has(trimmedTitle)) {
    return true;
  }
  if (titlePrefixes.some((prefix) => trimmedTitle.startsWith(prefix))) {
    return true;
  }
  return titleSubstrings.some((substring) => trimmedTitle.includes(substring));
}

/**
 * Checks if an item should be excluded based on its labels.
 * GitHub label names are unique per repository regardless of case, so matching ignores case.
 * @param {Array<string>} labels - Label names on the issue or pull request
 * @param {object} exclusionsConfig - `exclusions` from rules.yml (required by the schema)
 * @returns {string | null} The first matching excluded label, or null when none match
 */
export function findExcludedLabel(labels, exclusionsConfig) {
  if (!exclusionsConfig || !Array.isArray(exclusionsConfig.exclude_labels)) {
    throw new Error('exclusions.exclude_labels from rules.yml is required');
  }
  const excluded = new Set(exclusionsConfig.exclude_labels.map((name) => name.toLowerCase()));
  return labels.find((name) => excluded.has(name.toLowerCase())) || null;
}
