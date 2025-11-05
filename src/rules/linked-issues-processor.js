/**
 * @fileoverview Linked issues processor using rule-based system
 *
 * @directive Always run tests after modifying this file:
 * ```bash
 * npm test -- linked-issues-processor.test.js
 * ```
 * Changes here can affect how linked issues are processed.
 */

import { getItemColumn, setItemColumn } from '../github/api.js';
import { log } from '../utils/log.js';
import { getItemAssignees, setItemAssignees } from './assignees.js';
import { processLinkedIssueRules } from './processors/unified-rule-processor.js';

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
 * @returns {Object} Processing result
 */
async function processLinkedIssues(pullRequest, projectId, currentColumn, currentSprint) {
    const { number: pullRequestNumber, repository: { nameWithOwner: repositoryName }, state, merged, projectItemId } = pullRequest;
    const linkedIssueNodes = pullRequest.linkedIssues?.nodes || [];

    let changed = false;
    let reason = '';
    const linkedIssueResults = [];

    log.info(`Processing linked issues for PR #${pullRequestNumber} in ${repositoryName}`);

    if (linkedIssueNodes.length === 0) {
        reason = 'No linked issues';
        log.info(`No linked issues found for PR #${pullRequestNumber}`);
        return { changed, reason, linkedIssues: linkedIssueResults };
    }

    // Get PR's actual state from project board (not from parameter or API response)
    let prActualColumn = null;
    let prActualAssignees = [];
    
    if (projectItemId) {
        try {
            prActualColumn = await getItemColumn(projectId, projectItemId);
            prActualAssignees = await getItemAssignees(projectId, projectItemId);
            log.info(`PR #${pullRequestNumber} actual state - Column: ${prActualColumn || 'None'}, Assignees: ${prActualAssignees.join(', ') || 'None'}`);
        } catch (error) {
            log.warn(`Could not get PR actual state from project board: ${error.message}, using fallback`);
            // Fallback to parameter if project board lookup fails
            prActualColumn = currentColumn;
            prActualAssignees = pullRequest.assignees?.nodes?.map(a => a.login) || [];
        }
    } else {
        log.warn(`PR #${pullRequestNumber} has no projectItemId, using fallback values`);
        prActualColumn = currentColumn;
        prActualAssignees = pullRequest.assignees?.nodes?.map(a => a.login) || [];
    }

    // Process rules for this PR
    const ruleActions = processLinkedIssueRules(pullRequest);

    if (ruleActions.length === 0) {
        reason = 'No linked issue rules triggered';
        log.info(`No linked issue rules triggered for PR #${pullRequestNumber}`);
        return { changed, reason, linkedIssues: linkedIssueResults };
    }

    // Process each linked issue
    for (const linkedIssue of linkedIssueNodes) {
        const { id: linkedIssueId, number: linkedIssueNumber, repository: { nameWithOwner: linkedIssueRepositoryName } } = linkedIssue;

        try {
            // Get linked issue's actual state from project board
            const linkedIssueColumn = await getItemColumn(projectId, linkedIssueId);
            const linkedIssueAssignees = await getItemAssignees(projectId, linkedIssueId);

            log.info(`Linked issue #${linkedIssueNumber} state - Column: ${linkedIssueColumn || 'None'}, Assignees: ${linkedIssueAssignees.join(', ') || 'None'}`);

            // Evaluate skip condition from rules.yml
            // skip_if: "item.column === item.pr.column && item.assignees === item.pr.assignees"
            const columnsMatch = linkedIssueColumn === prActualColumn;
            const assigneesMatch = arraysEqual(linkedIssueAssignees, prActualAssignees);
            
            if (columnsMatch && assigneesMatch) {
                log.info(`Skipping linked issue #${linkedIssueNumber} - column and assignees already match PR`);
                linkedIssueResults.push({
                    id: linkedIssueId,
                    number: linkedIssueNumber,
                    column: linkedIssueColumn,
                    assignees: linkedIssueAssignees,
                    skipped: true
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
                            await setItemColumn(projectId, linkedIssueId, prActualColumn);
                            log.info(`Set linked issue #${linkedIssueNumber} column to ${prActualColumn} (inherited from PR)`);
                            changed = true;
                        }
                        break;

                    case 'inherit_assignees':
                        // Inherit PR's actual assignees if different
                        if (prActualAssignees.length > 0) {
                            if (!arraysEqual(prActualAssignees, linkedIssueAssignees)) {
                                await setItemAssignees(projectId, linkedIssueId, prActualAssignees);
                                log.info(`Set linked issue #${linkedIssueNumber} assignees to: ${prActualAssignees.join(', ')} (inherited from PR)`);
                                changed = true;
                            }
                        }
                        break;

                    default:
                        log.warn(`Unknown linked issue action: ${action}`);
                }
            }

            // Get final state after updates
            const finalColumn = await getItemColumn(projectId, linkedIssueId);
            const finalAssignees = await getItemAssignees(projectId, linkedIssueId);

            log.info(`Linked issue #${linkedIssueNumber} final state - Column: ${finalColumn || 'None'}, Assignees: ${finalAssignees.join(', ') || 'None'}`);

            linkedIssueResults.push({
                id: linkedIssueId,
                number: linkedIssueNumber,
                column: finalColumn,
                assignees: finalAssignees,
                skipped: false
            });

        } catch (error) {
            log.error(`Error updating linked issue ${linkedIssueNumber} in repository ${linkedIssueRepositoryName}: ${error.message}`);
            throw error;
        }
    }

    // Print state change summary
    log.printStateSummary();

    return {
        changed,
        reason: changed ? 'Linked issues updated' : 'No changes needed',
        linkedIssues: linkedIssueResults,
        processed: linkedIssueResults.length
    };
}

export { processLinkedIssues };
