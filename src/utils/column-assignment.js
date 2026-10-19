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

/**
 * Column for an item being added to the board, from `board_columns.on_add_by_label`.
 * The first rule whose label the item carries wins; labels match ignoring case.
 * Used only when an item is added with no Status, never on later runs or label changes.
 * @param {Array<string>} labels - Label names on the issue or pull request
 * @param {object} policy - `board_columns` from rules.yml, normalized by loadBoardRules
 * @returns {string|null} The routed column, or null when no rule matches
 */
export function columnForLabelsOnAdd(labels, policy) {
  const rules = resolvePolicy(policy).on_add_by_label;
  if (!Array.isArray(rules)) {
    throw new Error('board_columns.on_add_by_label from rules.yml is required');
  }
  const names = new Set(labels.map((name) => name.toLowerCase()));
  return rules.find((rule) => names.has(rule.label.toLowerCase()))?.column || null;
}

/**
 * Extract all unique target column names defined in rules.yml policy.
 * Ignores 'keep' since that leaves the item in its existing column.
 * @param {object} config - Parsed configuration from rules.yml
 * @returns {Array<string>} List of unique column names
 */
export function getConfiguredColumns(config) {
  const columns = new Set();
  const bc = config?.board_columns;
  if (bc) {
    if (Array.isArray(bc.locked)) {
      bc.locked.forEach((col) => {
        if (typeof col === 'string' && col.length > 0) columns.add(col);
      });
    }
    const addIfValid = (val) => {
      if (typeof val === 'string' && val !== KEEP && val.length > 0) {
        columns.add(val);
      }
    };
    if (bc.pull_request) {
      addIfValid(bc.pull_request.ready);
      addIfValid(bc.pull_request.draft);
      addIfValid(bc.pull_request.draft_no_status);
    }
    if (bc.linked_issue) {
      addIfValid(bc.linked_issue.ready);
      addIfValid(bc.linked_issue.draft);
      addIfValid(bc.linked_issue.closed);
    }
    if (bc.issue) {
      addIfValid(bc.issue.no_status);
    }
    if (Array.isArray(bc.on_add_by_label)) {
      // Routing columns are used literally (`keep` isn't a sentinel here), so check them all
      bc.on_add_by_label.forEach((rule) => {
        if (typeof rule?.column === 'string' && rule.column.length > 0) columns.add(rule.column);
      });
    }
  }
  if (config?.sprints) {
    ['assign_current', 'assign_current_if_empty', 'clear'].forEach((key) => {
      if (Array.isArray(config.sprints[key])) {
        config.sprints[key].forEach((col) => {
          if (typeof col === 'string' && col.length > 0) {
            columns.add(col);
          }
        });
      }
    });
  }
  return Array.from(columns);
}

/**
 * Validates configured columns against available status options on the project board.
 * @param {Array<string>} configuredColumns - Column names from rules.yml
 * @param {Array<{id: string, name: string}>} statusOptions - Single-select options from Project board
 * @throws {Error} When configured columns are missing from the project board
 */
export function validateBoardColumns(configuredColumns, statusOptions = []) {
  if (!Array.isArray(statusOptions) || statusOptions.length === 0) {
    throw new Error('Project board has no status columns configured.');
  }
  const availableNames = new Set(statusOptions.map((opt) => opt.name));
  const missing = configuredColumns.filter((col) => !availableNames.has(col));
  if (missing.length > 0) {
    const availableList = statusOptions.map((opt) => `"${opt.name}"`).join(', ');
    throw new Error(
      `Status columns in rules.yml not found on project board: ${missing.map((c) => `"${c}"`).join(', ')}. Available columns: ${availableList}`
    );
  }
}
