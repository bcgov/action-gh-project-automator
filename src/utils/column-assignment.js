/**
 * Board column moves come only from `rules.yml` `board_columns` (required by the schema).
 * `keep` leaves the item in its current column.
 * Closed and merged items aren't moved here: GitHub's built-in project workflows move them to Done.
 */
export const KEEP = 'keep';

function resolvePolicy(policy) {
  if (!policy?.locked || !policy.pull_request || !policy.linked_issue || !policy.issue) {
    throw new Error('board_columns from rules.yml is required');
  }
  return policy;
}

function normalizeColumn(column) {
  return !column || column === 'None' ? null : column;
}

function apply(target, currentColumn) {
  return target === undefined || target === KEEP ? currentColumn : target;
}

function pullRequestState({ isClosed, merged, draft }) {
  if (merged) return 'merged';
  if (isClosed) return 'closed';
  return draft ? 'draft' : 'ready';
}

/**
 * Determines the target column for a board item.
 * @param {string} itemType - 'PullRequest' or 'Issue'
 * @param {boolean} isClosed - Whether the item is closed or merged
 * @param {string|null} currentColumn - The current column on the project board
 * @param {object} [options]
 * @param {boolean} [options.merged] - PR was merged
 * @param {boolean} [options.draft] - PR is a draft
 * @param {object} options.policy - `board_columns` from rules.yml
 * @returns {string|null} The resolved target column name
 */
export function determineTargetColumn(itemType, isClosed, currentColumn, options) {
  const policy = resolvePolicy(options.policy);
  const current = normalizeColumn(currentColumn);

  if (current && policy.locked.includes(current)) {
    return current;
  }

  if (itemType === 'PullRequest') {
    const state = pullRequestState({ isClosed, merged: options.merged, draft: options.draft });
    if (state === 'draft' && !current) {
      return policy.pull_request.draft_no_status;
    }
    return apply(policy.pull_request[state], current);
  }

  if (itemType === 'Issue') {
    if (isClosed) return current;
    return current || policy.issue.no_status;
  }

  return current;
}

/**
 * Determines the target column for an issue linked to a pull request.
 * @param {object} pr - Linked pull request state
 * @param {boolean} pr.isClosed - PR is closed or merged
 * @param {boolean} pr.merged - PR was merged
 * @param {boolean} pr.draft - PR is a draft
 * @param {string|null} currentColumn - The issue's current column
 * @param {object} policy - `board_columns` from rules.yml
 * @param {object} [options]
 * @param {boolean} [options.isClosed] - Whether the linked issue itself is closed
 * @returns {string|null} The resolved target column name
 */
export function determineLinkedIssueColumn(pr, currentColumn, policy, options = {}) {
  const resolved = resolvePolicy(policy);
  const current = normalizeColumn(currentColumn);

  if (options.isClosed) {
    return current;
  }

  if (current && resolved.locked.includes(current)) {
    return current;
  }
  return apply(resolved.linked_issue[pullRequestState(pr)], current);
}
