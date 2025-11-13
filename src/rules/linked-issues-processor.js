/**
 * @fileoverview Linked issues processor using rule-based system
 *
 * @directive Always run tests after modifying this file:
 * ```bash
 * npm test -- linked-issues-processor.test.js
 * ```
 * Changes here can affect how linked issues are processed.
 */

import {
  getItemColumn,
  setItemColumn,
  getColumnOptionId,
  isItemInProject,
  fetchLinkedIssuesForPullRequest
} from '../github/api.js';
import { log } from '../utils/log.js';
import { getItemAssignees, setItemAssignees } from './assignees.js';
import { processLinkedIssueRules } from './processors/unified-rule-processor.js';
import { handleClassifiedError } from '../utils/error-classifier.js';

/**
 * Compare two arrays for equality (sorted)
 * More efficient than JSON.stringify for array comparison
 * @param {Array} a - First array
 * @param {Array} b - Second array
 * @returns {boolean}
 */
export function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

/**
 * Process linked issues using rule-based system
 * @param {Object} pullRequest The pull request object with projectItemId
 * @param {string} projectId The project ID
 * @param {string} currentColumn The current column (fallback, will get actual from board)
 * @param {string} currentSprint The current sprint
 * @param {Object} [overrides] Optional overrides for internal functions (primarily for testing)
 * @param {Function} [overrides.getItemColumnFn] Getter for an item's column (default: getItemColumn)
 * @param {Function} [overrides.setItemColumnFn] Setter for an item's column (default: setItemColumn)
 * @param {Function} [overrides.getColumnOptionIdFn] Resolver for column option IDs (default: getColumnOptionId)
 * @param {Function} [overrides.getItemAssigneesFn] Getter for item assignees (default: getItemAssignees)
 * @param {Function} [overrides.setItemAssigneesFn] Setter for item assignees (default: setItemAssignees)
 * @param {Function} [overrides.isItemInProjectFn] Predicate to check project membership (default: isItemInProject)
 * @param {Function} [overrides.fetchLinkedIssuesFn] Fetcher for linked issues (default: fetchLinkedIssuesForPullRequest)
 * @param {Array|null} [overrides.ruleActionsOverride] Optional rule actions (default: null, uses processLinkedIssueRules)
 * @param {Object} [overrides.logger] Logger implementation (default: log)
 * @returns {Object} Processing result
 */
async function processLinkedIssues(pullRequest, projectId, currentColumn, currentSprint, overrides = {}) {
    const {
        getItemColumnFn = getItemColumn,
        setItemColumnFn = setItemColumn,
        getColumnOptionIdFn = getColumnOptionId,
        getItemAssigneesFn = getItemAssignees,
        setItemAssigneesFn = setItemAssignees,
        isItemInProjectFn = isItemInProject,
        fetchLinkedIssuesFn = fetchLinkedIssuesForPullRequest,
        ruleActionsOverride = null,
        logger = log
    } = overrides;

    const { number: pullRequestNumber, repository: { nameWithOwner: repositoryName }, state, merged } = pullRequest;
    let { projectItemId } = pullRequest;

    const linkedIssueNodesFromPayload = pullRequest.linkedIssues?.nodes || [];

    let changed = false;
    let reason = '';
    const linkedIssueResults = [];

    logger.info(`Processing linked issues for PR #${pullRequestNumber} in ${repositoryName}`);

    // Get PR's actual state from project board (not from parameter or API response)
    let prActualColumn = null;
    let prActualAssignees = [];
    
    if (!projectItemId && pullRequest.id) {
        try {
            const inProject = await isItemInProjectFn(pullRequest.id, projectId);
            if (inProject.isInProject) {
                projectItemId = inProject.projectItemId;
            }
        } catch (error) {
            logger.warn(`Unable to resolve project item ID for PR #${pullRequestNumber}: ${error.message}`);
        }
    }

    if (projectItemId) {
        try {
            prActualColumn = await getItemColumnFn(projectId, projectItemId);
            prActualAssignees = await getItemAssigneesFn(projectId, projectItemId);
            logger.info(`PR #${pullRequestNumber} actual state - Column: ${prActualColumn || 'None'}, Assignees: ${prActualAssignees.join(', ') || 'None'}`);
        } catch (error) {
            logger.warn(`Could not get PR actual state from project board: ${error.message}, using fallback`);
            // Fallback to parameter if project board lookup fails
            prActualColumn = currentColumn;
            prActualAssignees = pullRequest.assignees?.nodes?.map(a => a.login) || [];
        }
    } else {
        logger.warn(`PR #${pullRequestNumber} has no projectItemId, using fallback values`);
        prActualColumn = currentColumn;
        prActualAssignees = pullRequest.assignees?.nodes?.map(a => a.login) || [];
    }

    // Determine linked issues for this PR
    let linkedIssueNodes = linkedIssueNodesFromPayload;
    if (linkedIssueNodes.length === 0 && pullRequest.id) {
        linkedIssueNodes = await fetchLinkedIssuesFn(pullRequest.id, projectId);
    }

    if (linkedIssueNodes.length === 0) {
        reason = 'No linked issues';
        logger.info(`No linked issues found for PR #${pullRequestNumber}`);
        return { changed, reason, linkedIssues: linkedIssueResults };
    }

    // Process rules for this PR
    const ruleActionsRaw = Array.isArray(ruleActionsOverride)
        ? ruleActionsOverride
        : await processLinkedIssueRules(pullRequest);
    const ruleActions = Array.isArray(ruleActionsRaw) ? ruleActionsRaw : [];

    if (ruleActions.length === 0) {
        reason = 'No linked issue rules triggered';
        logger.info(`No linked issue rules triggered for PR #${pullRequestNumber}`);
        return { changed, reason, linkedIssues: linkedIssueResults };
    }

    // Process each linked issue
    for (const linkedIssue of linkedIssueNodes) {
        const { id: linkedIssueContentId, number: linkedIssueNumber, repository } = linkedIssue;
        const linkedIssueRepositoryName = repository?.nameWithOwner || 'unknown/unknown';

        let linkedIssueProjectItemId = linkedIssue.projectItemId || null;

        if (!linkedIssueProjectItemId && linkedIssueContentId) {
            try {
                const { isInProject: issueInProject, projectItemId: issueProjectItemId } =
                    await isItemInProjectFn(linkedIssueContentId, projectId);
                if (issueInProject) {
                    linkedIssueProjectItemId = issueProjectItemId;
                }
            } catch (error) {
                logger.warn(`Unable to resolve project item for linked issue ${linkedIssueNumber}: ${error.message}`);
            }
        }

        if (!linkedIssueProjectItemId) {
            logger.info(`Skipping linked issue ${linkedIssueNumber} - not present on project board`);
            linkedIssueResults.push({
                id: linkedIssueContentId,
                number: linkedIssueNumber,
                column: null,
                assignees: [],
                skipped: true,
                reason: 'not_in_project'
            });
            continue;
        }

        try {
            // Get linked issue's actual state from project board
            const linkedIssueColumn = await getItemColumnFn(projectId, linkedIssueProjectItemId);
            const linkedIssueAssignees = await getItemAssigneesFn(projectId, linkedIssueProjectItemId);

            logger.info(`Linked issue #${linkedIssueNumber} state - Column: ${linkedIssueColumn || 'None'}, Assignees: ${linkedIssueAssignees.join(', ') || 'None'}`);

            // Evaluate skip condition from rules.yml
            // skip_if: "item.column === item.pr.column && item.assignees === item.pr.assignees"
            const columnsMatch = linkedIssueColumn === prActualColumn;
            const assigneesMatch = arraysEqual(linkedIssueAssignees, prActualAssignees);
            
            if (columnsMatch && assigneesMatch) {
                logger.info(`Skipping linked issue #${linkedIssueNumber} - column and assignees already match PR`);
                linkedIssueResults.push({
                    id: linkedIssueContentId,
                    number: linkedIssueNumber,
                    column: linkedIssueColumn,
                    assignees: linkedIssueAssignees,
                    skipped: true,
                    reason: 'state_matches_pr'
                });
                continue;
            }

            // Apply rule actions
            for (const ruleAction of ruleActions) {
                const { action, params } = ruleAction;

                switch (action) {
                    case 'inherit_column':
                        // Inherit PR's actual column if different
                        if (prActualColumn && prActualColumn !== linkedIssueColumn) {
                            const optionId = await getColumnOptionIdFn(projectId, prActualColumn);
                            if (optionId) {
                                await setItemColumnFn(projectId, linkedIssueProjectItemId, optionId);
                                logger.info(`Set linked issue #${linkedIssueNumber} column to ${prActualColumn} (inherited from PR)`);
                                changed = true;
                            } else {
                                logger.warn(`Unable to resolve column option for '${prActualColumn}' in project ${projectId}`);
                            }
                        }
                        break;

                    case 'inherit_assignees':
                        // Inherit PR's actual assignees if different
                        if (prActualAssignees.length > 0) {
                            if (!arraysEqual(prActualAssignees, linkedIssueAssignees)) {
                                await setItemAssigneesFn(projectId, linkedIssueProjectItemId, prActualAssignees);
                                logger.info(`Set linked issue #${linkedIssueNumber} assignees to: ${prActualAssignees.join(', ')} (inherited from PR)`);
                                changed = true;
                            }
                        }
                        break;

                    default:
                        logger.warn(`Unknown linked issue action: ${action}`);
                }
            }

            // Get final state after updates
            const finalColumn = await getItemColumnFn(projectId, linkedIssueProjectItemId);
            const finalAssignees = await getItemAssigneesFn(projectId, linkedIssueProjectItemId);

            logger.info(`Linked issue #${linkedIssueNumber} final state - Column: ${finalColumn || 'None'}, Assignees: ${finalAssignees.join(', ') || 'None'}`);

            linkedIssueResults.push({
                id: linkedIssueContentId,
                projectItemId: linkedIssueProjectItemId,
                number: linkedIssueNumber,
                column: finalColumn,
                assignees: finalAssignees,
                skipped: false,
                reason: 'updated'
            });

        } catch (error) {
            const itemIdentifier = `Linked Issue #${linkedIssueNumber} in ${linkedIssueRepositoryName}`;
            handleClassifiedError(error, itemIdentifier, logger);
        }
    }

    // Print state change summary
    logger.printStateSummary();

    return {
        changed,
        reason: changed ? 'Linked issues updated' : 'No changes needed',
        linkedIssues: linkedIssueResults,
        processed: linkedIssueResults.length
    };
}

export { processLinkedIssues };
