/**
 * Board column policy. `rules.yml` `board_columns` overrides these defaults.
 * `keep` leaves the item in its current column.
 */
export const KEEP = 'keep';

export const DEFAULT_COLUMN_POLICY = {
  // Items in these columns are never moved
  locked: ['Waiting', 'Parked'],
  pull_request: {
    ready: 'Active',
    // A draft PR is the lock on its issue, so it stays put
    draft: KEEP,
    draft_no_status: 'New',
    merged: 'Done',
    closed: 'Done',
  },
  linked_issue: {
    ready: 'Active',
    draft: KEEP,
    merged: 'Done',
    closed: 'Next',
  },
  issue: {
    no_status: 'New',
    closed: 'Done',
  },
};

function resolvePolicy(policy) {
  if (!policy) return DEFAULT_COLUMN_POLICY;
  return {
    locked: policy.locked || DEFAULT_COLUMN_POLICY.locked,
    pull_request: { ...DEFAULT_COLUMN_POLICY.pull_request, ...policy.pull_request },
    linked_issue: { ...DEFAULT_COLUMN_POLICY.linked_issue, ...policy.linked_issue },
    issue: { ...DEFAULT_COLUMN_POLICY.issue, ...policy.issue },
  };
}

function normalizeColumn(column) {
  return !column || column === 'None' ? null : column;
}

function apply(target, currentColumn) {
  return target === KEEP ? currentColumn : target;
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
 * @param {object} [options.policy] - `board_columns` from rules.yml
 * @returns {string|null} The resolved target column name
 */
export function determineTargetColumn(itemType, isClosed, currentColumn, options = {}) {
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
    if (isClosed) return policy.issue.closed;
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
 * @param {object} [policy] - `board_columns` from rules.yml
 * @returns {string|null} The resolved target column name
 */
export function determineLinkedIssueColumn(pr, currentColumn, policy) {
  const resolved = resolvePolicy(policy);
  const current = normalizeColumn(currentColumn);

  if (current && resolved.locked.includes(current)) {
    return current;
  }
  return apply(resolved.linked_issue[pullRequestState(pr)], current);
}
