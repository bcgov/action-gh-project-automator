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

// Up to 100 labels per item, the GraphQL page limit; labelNames fails on more
export const LABELS_FRAGMENT = 'labels(first: 100) { totalCount nodes { name } }';

/**
 * Label names from a GraphQL `labels` connection, fetched with LABELS_FRAGMENT.
 * Fails when the item has more labels than were fetched, since an excluded label could be missed.
 * @param {{ totalCount: number, nodes: Array<{ name: string }> }} labels
 * @returns {Array<string>}
 */
export function labelNames(labels) {
  if (!labels || !Array.isArray(labels.nodes)) {
    throw new Error('Labels were not fetched for this item');
  }
  if (labels.totalCount > labels.nodes.length) {
    throw new Error(
      `Item has ${labels.totalCount} labels but only ${labels.nodes.length} were fetched; label exclusions can't be checked`
    );
  }
  return labels.nodes.map((label) => label.name);
}

// Up to 100 commits per PR, the GraphQL page limit; isBotOnlyPullRequest fails on more
export const COMMIT_AUTHORS_FRAGMENT =
  'commits(first: 100) { totalCount nodes { commit { authors(first: 10) { nodes { user { login } } } } } }';

/**
 * GitHub login of a GraphQL author: a Bot's login comes back without the "[bot]" suffix.
 * @param {{ __typename?: string, login?: string } | null | undefined} author
 * @returns {string | null}
 */
function authorLogin(author) {
  if (!author?.login) return null;
  return author.__typename === 'Bot' ? `${author.login}[bot]` : author.login;
}

/**
 * Checks if a pull request is opened by an excluded bot and has no commit from a person.
 * A commit counts as human when one of its authors is a GitHub user that isn't a bot.
 * @param {object} item - Search result with author and COMMIT_AUTHORS_FRAGMENT commits
 * @param {object} exclusionsConfig - `exclusions` from rules.yml
 * @returns {string | null} The bot login when the PR should be skipped, otherwise null
 */
export function botOnlyPullRequestAuthor(item, exclusionsConfig) {
  if (!exclusionsConfig || !Array.isArray(exclusionsConfig.exclude_bot_authors)) {
    throw new Error('exclusions.exclude_bot_authors from rules.yml is required');
  }
  if (item?.__typename !== 'PullRequest') return null;
  const login = authorLogin(item.author);
  const bots = new Set(exclusionsConfig.exclude_bot_authors.map((name) => name.toLowerCase()));
  if (!login || !bots.has(login.toLowerCase())) return null;

  const commits = item.commits;
  if (!commits || !Array.isArray(commits.nodes)) {
    throw new Error('Commits were not fetched for this pull request');
  }
  if (commits.totalCount > commits.nodes.length) {
    throw new Error(
      `Pull request has ${commits.totalCount} commits but only ${commits.nodes.length} were fetched; human commits can't be checked`
    );
  }
  const hasHumanCommit = commits.nodes.some((node) =>
    (node.commit?.authors?.nodes || []).some((a) => {
      const user = a.user?.login;
      return Boolean(user) && !user.endsWith('[bot]') && !bots.has(user.toLowerCase());
    })
  );
  return hasHumanCommit ? null : login;
}
