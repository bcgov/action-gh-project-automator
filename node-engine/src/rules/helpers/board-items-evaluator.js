import { log } from '../../utils/log.js';

function normalizeMonitoredRepos(repos) {
  if (!repos) {
    return new Set();
  }
  if (repos instanceof Set) {
    return repos;
  }
  return new Set(repos);
}

function getAssigneeLogins(item) {
  const nodes = item?.assignees?.nodes;
  if (!Array.isArray(nodes)) {
    return [];
  }
  return nodes
    .map(node => node?.login)
    .filter(Boolean);
}

/**
 * Describe why a board item matches monitored criteria.
 * @param {Object} params Parameters for evaluation.
 * @param {Object} params.item GitHub pull request or issue node.
 * @param {string} params.monitoredUser Monitored GitHub username.
 * @param {Set<string>|Array<string>} params.monitoredRepos Monitored repositories in org/repo format.
 * @returns {{reason: string, isMonitoredRepo: boolean, isAuthoredByUser: boolean, isAssignedToUser: boolean}}
 */
export function describeBoardItemReason({ item, monitoredUser, monitoredRepos }) {
  const repoFullName = item?.repository?.nameWithOwner;
  const repoSet = normalizeMonitoredRepos(monitoredRepos);
  const isMonitoredRepo = repoFullName ? repoSet.has(repoFullName) : false;
  const isAuthoredByUser = item?.author?.login === monitoredUser;
  const assigneeLogins = getAssigneeLogins(item);
  const isAssignedToUser = assigneeLogins.includes(monitoredUser);

  if (item?.__typename === 'PullRequest') {
    if (isAuthoredByUser) {
      return {
        reason: 'PR is authored by monitored user',
        isMonitoredRepo,
        isAuthoredByUser,
        isAssignedToUser
      };
    }
    if (isAssignedToUser) {
      return {
        reason: 'PR is assigned to monitored user',
        isMonitoredRepo,
        isAuthoredByUser,
        isAssignedToUser
      };
    }
    if (isMonitoredRepo) {
      return {
        reason: 'PR is in a monitored repository',
        isMonitoredRepo,
        isAuthoredByUser,
        isAssignedToUser
      };
    }
    return {
      reason: 'PR does not meet any criteria',
      isMonitoredRepo,
      isAuthoredByUser,
      isAssignedToUser
    };
  }

  if (item?.__typename === 'Issue') {
    if (isAssignedToUser) {
      return {
        reason: 'Issue is assigned to monitored user',
        isMonitoredRepo,
        isAuthoredByUser,
        isAssignedToUser
      };
    }
    if (isMonitoredRepo) {
      return {
        reason: 'Issue is in a monitored repository',
        isMonitoredRepo,
        isAuthoredByUser,
        isAssignedToUser
      };
    }
    return {
      reason: 'Issue does not meet any criteria',
      isMonitoredRepo,
      isAuthoredByUser,
      isAssignedToUser
    };
  }

  return {
    reason: 'Unsupported item type',
    isMonitoredRepo,
    isAuthoredByUser,
    isAssignedToUser
  };
}

/**
 * Analyze a board item to determine rule matches and derived metadata.
 * @param {Object|null} item GitHub pull request or issue node.
 * @param {Object} options Evaluation options.
 * @param {string} options.monitoredUser Monitored GitHub username.
 * @param {Set<string>|Array<string>} options.monitoredRepos Monitored repositories in org/repo format.
 * @param {Function} options.processBoardItemRulesFn Function to evaluate board item rules.
 * @param {import('../../utils/log.js').Logger} [options.logger] Logger instance to use.
 * @returns {Promise<{boardActions: Array, shouldProcess: boolean, reason: string, repoFullName: string, itemType: string, isMonitoredRepo: boolean, isAuthoredByUser: boolean, isAssignedToUser: boolean}>}
 */
export async function analyzeBoardItem(item, options) {
  const {
    monitoredUser,
    monitoredRepos,
    processBoardItemRulesFn,
    logger = log
  } = options;

  if (!item) {
    return {
      boardActions: [],
      shouldProcess: false,
      reason: 'Item is undefined',
      itemType: 'Unknown',
      repoFullName: 'unknown/unknown',
      isMonitoredRepo: false,
      isAuthoredByUser: false,
      isAssignedToUser: false
    };
  }

  const repoFullName = item?.repository?.nameWithOwner || 'unknown/unknown';
  const itemType = item?.__typename || 'Unknown';

  const classification = describeBoardItemReason({
    item,
    monitoredUser,
    monitoredRepos
  });

  let boardActions = [];
  try {
    boardActions = await processBoardItemRulesFn(item, { monitoredUser });
  } catch (error) {
    logger.error(`Failed to evaluate board rules for ${itemType} #${item?.number || 'unknown'}: ${error.message}`);
    throw error;
  }

  const shouldProcess = Array.isArray(boardActions) && boardActions.length > 0;

  return {
    boardActions,
    shouldProcess,
    reason: classification.reason,
    repoFullName,
    itemType,
    isMonitoredRepo: classification.isMonitoredRepo,
    isAuthoredByUser: classification.isAuthoredByUser,
    isAssignedToUser: classification.isAssignedToUser
  };
}


