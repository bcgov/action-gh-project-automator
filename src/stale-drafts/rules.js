const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Latest real activity on a pull request. Label changes are ignored, so adding or
 * removing the stale label doesn't count as an update.
 * @param {object} pr - Pull request with createdAt, lastCommitAt, lastCommentAt, lastReviewAt, lastEventAt
 * @returns {Date}
 */
export function lastActivity(pr) {
  const times = [pr.createdAt, pr.lastCommitAt, pr.lastCommentAt, pr.lastReviewAt, pr.lastEventAt]
    .filter(Boolean)
    .map((t) => new Date(t).getTime());
  return new Date(Math.max(...times));
}

/**
 * Decide whether the stale label should be added, removed, or left alone.
 * @param {object} pr - { isDraft, state, author, labels, projectIds, ...activity }
 * @param {object} options
 * @param {object} options.settings - `stale_drafts` from rules.yml
 * @param {string} options.projectId - Project node ID
 * @param {Date} [options.now]
 * @returns {'add'|'remove'|null}
 */
export function staleLabelAction(pr, { settings, projectId, now = new Date() }) {
  const hasLabel = (pr.labels || []).includes(settings.label);
  const stale =
    pr.state === 'OPEN' &&
    pr.isDraft === true &&
    settings.authors.includes(pr.author) &&
    (pr.projectIds || []).includes(projectId) &&
    now.getTime() - lastActivity(pr).getTime() >= settings.days * DAY_MS;

  if (stale && !hasLabel) return 'add';
  if (!stale && hasLabel) return 'remove';
  return null;
}
