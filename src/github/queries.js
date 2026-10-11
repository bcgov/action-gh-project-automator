const HOUR_MS = 60 * 60 * 1000;
export const WATERMARK_OVERLAP_MS = 10 * 60 * 1000;
// GitHub search accepts long qualifier lists; stay well under its limits
export const MAX_QUERY_LENGTH = 900;

/**
 * Resolve the updated-since cutoff: the last successful run's watermark (minus a 10-minute
 * overlap) when valid, otherwise the fallback window.
 * @param {string|null} watermark - ISO timestamp from the last successful run
 * @param {number} fallbackHours - Window used when there's no watermark
 * @param {Date} [now]
 * @returns {string} ISO timestamp
 */
export function resolveSince(watermark, fallbackHours = 2, now = new Date()) {
  const mark = watermark ? Date.parse(watermark) : NaN;
  if (!Number.isNaN(mark) && mark <= now.getTime()) {
    // Overlap the last run a little, since the search index can lag behind recent updates
    return new Date(mark - WATERMARK_OVERLAP_MS).toISOString();
  }
  return new Date(now.getTime() - (fallbackHours || 2) * HOUR_MS).toISOString();
}

/**
 * Split repo qualifiers into as few groups as fit in one query each.
 * @param {Array<string>} qualifiers - e.g. ['repo:bcgov/actions', ...]
 * @param {number} reserved - Length taken by the rest of the query
 * @param {number} maxLength
 * @returns {Array<Array<string>>}
 */
export function chunkQualifiers(qualifiers, reserved, maxLength = MAX_QUERY_LENGTH) {
  const chunks = [];
  let current = [];
  let length = reserved;
  for (const q of qualifiers) {
    if (current.length > 0 && length + q.length + 1 > maxLength) {
      chunks.push(current);
      current = [];
      length = reserved;
    }
    current.push(q);
    length += q.length + 1;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Build the search queries for a sync run.
 * Only open items and PRs closed without merging are searched: GitHub's built-in project
 * workflows move closed and merged items to Done, and a PR closed without merging is the
 * one closed-item rule the sync handles (its linked issue goes back to Next).
 * @param {object} options
 * @param {string} options.org - Default organization for unqualified repos
 * @param {Array<string>} options.repos - Monitored repositories
 * @param {string} options.monitoredUser
 * @param {string} options.since - ISO cutoff
 * @param {number} [options.maxLength]
 * @returns {{ repoQueries: Array<string>, userQueries: Array<string> }}
 */
export function buildSearchQueries({
  org,
  repos,
  monitoredUser,
  since,
  maxLength = MAX_QUERY_LENGTH,
}) {
  const window = `archived:false updated:>=${since} sort:updated-desc`;
  const openSuffix = `is:open ${window}`;
  const closedPrSuffix = `is:pr is:closed is:unmerged ${window}`;

  const qualifiers = (repos || []).map(
    (repo) => `repo:${repo.includes('/') ? repo : `${org}/${repo}`}`
  );
  const reserved = Math.max(openSuffix.length, closedPrSuffix.length);
  const repoQueries = [];
  for (const chunk of chunkQualifiers(qualifiers, reserved, maxLength)) {
    const repoPart = chunk.join(' ');
    repoQueries.push(`${repoPart} ${openSuffix}`, `${repoPart} ${closedPrSuffix}`);
  }

  const user = monitoredUser;
  const userQueries = [
    `author:${user} is:pr ${openSuffix}`,
    `author:${user} ${closedPrSuffix}`,
    `assignee:${user} ${openSuffix}`,
    `assignee:${user} ${closedPrSuffix}`,
    `review-requested:${user} is:pr ${openSuffix}`,
  ];
  return { repoQueries, userQueries };
}
