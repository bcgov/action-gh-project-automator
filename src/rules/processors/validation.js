/**
 * @fileoverview Shared validation utilities for rule processors
 *
 * @directive Always run the full test suite after making changes to validation rules:
 * ```bash
 * npm test
 * ```
 * This ensures that changes don't break existing rule validation logic.
 */

import { loadBoardRules } from '../../config/board-rules.js';
import { log } from '../../utils/log.js';

let cachedConfig = null;

async function getConfig() {
    if (!cachedConfig) {
        cachedConfig = await loadBoardRules();
    }
    return cachedConfig;
}

class RuleValidation {
    constructor() {
        // Configuration will be loaded lazily
    }

    async ensureConfig() {
        if (!this._config) {
            this._config = await getConfig();
            // Initialize monitored repositories from config
            // Support both fully qualified (org/repo) and simple (repo) formats
            this.monitoredRepos = new Set(
                this._config.project?.repositories?.map(repo => {
                    if (repo.includes('/')) return repo;
                    const org = this._config.project?.organization || 'bcgov';
                    return `${org}/${repo}`;
                }) || []
            );

            // Initialize monitored users from config
            this.monitoredUsers = new Set(this._config.monitoredUsers || []);
        }
        return this._config;
    }

    get monitoredRepos() {
        // Lazy initialization
        if (!this._monitoredRepos) {
            return new Set();
        }
        return this._monitoredRepos;
    }

    set monitoredRepos(value) {
        this._monitoredRepos = value;
    }

    get monitoredUsers() {
        if (!this._monitoredUsers) {
            return new Set();
        }
        return this._monitoredUsers;
    }

    set monitoredUsers(value) {
        this._monitoredUsers = value;
    }

    get steps() {
        if (!this._steps) {
            this._steps = {
                markStepComplete: (step) => {
                    log.debug(`Validation step completed: ${step}`);
                }
            };
        }
        return this._steps;
    }

    /**
     * Validate item condition based on rule requirements
     */
    async validateItemCondition(item, condition) {
        await this.ensureConfig();
        try {
            // Type validation
            if (condition.type) {
                let typeMatch = false;
                if (Array.isArray(condition.type)) {
                    // Handle array of types (e.g., ["PullRequest", "Issue"])
                    if (condition.type.includes(item.__typename)) {
                        typeMatch = true;
                    }
                } else {
                    // Handle single type (e.g., "PullRequest")
                    if (item.__typename === condition.type) {
                        typeMatch = true;
                    }
                }

                if (!typeMatch) {
                    log.debug(`Type mismatch: ${item.__typename} does not match ${JSON.stringify(condition.type)}`);
                    return false;
                }

                // If type matches and there is no further condition string, return true
                if (!condition.condition) {
                    return true;
                }
            }

            // New monitored users condition
            if (condition.condition === "monitored.users.includes(item.author)") {
                const result = this.monitoredUsers.has(item.author?.login);
                log.debug(`Monitored users check: ${item.author?.login} in monitored users -> ${result}`);
                return result;
            }

            // Repository condition - NEW
            if (condition.condition === "monitored.repos.includes(item.repository)") {
                const result = this.monitoredRepos.has(item.repository?.nameWithOwner);
                log.debug(`Repository check: ${item.repository?.nameWithOwner} in monitored repos -> ${result}`);
                return result;
            }

            // New monitored users assignee condition
            if (condition.condition === "item.assignees.some(assignee => monitored.users.includes(assignee))") {
                const result = item.assignees?.nodes?.some(a => this.monitoredUsers.has(a.login)) || false;
                log.debug(`Monitored users assignee check: ${item.assignees?.nodes?.map(a => a.login).join(', ')} includes monitored user -> ${result}`);
                return result;
            }

            // Column condition - NEW
            if (condition.condition === "!item.column") {
                const result = !item.column || item.column === 'None';
                log.debug(`No column check: ${item.column} -> ${result}`);
                return result;
            }

            // Specific column checks
            if (condition.condition === "item.column === 'New'" ||
                condition.condition === "item.column === \"New\"") {
                const result = item.column === 'New';
                log.debug(`Column check (New): ${item.column} === 'New' -> ${result}`);
                return result;
            }

            if (condition.condition === "item.column === 'Next' || item.column === 'Active'" ||
                condition.condition === "item.column === \"Next\" || item.column === \"Active\"") {
                const result = item.column === 'Next' || item.column === 'Active';
                log.debug(`Column check (Next/Active): ${item.column} in ['Next', 'Active'] -> ${result}`);
                return result;
            }

            if (condition.condition === "item.column === 'Done'" ||
                condition.condition === "item.column === \"Done\"") {
                const result = item.column === 'Done';
                log.debug(`Column check (Done): ${item.column} === 'Done' -> ${result}`);
                return result;
            }

            if (condition.condition === "item.column === 'Waiting'" ||
                condition.condition === "item.column === \"Waiting\"") {
                const result = item.column === 'Waiting';
                log.debug(`Column check (Waiting): ${item.column} === 'Waiting' -> ${result}`);
                return result;
            }

            // Inactive columns check (New, Parked, Backlog)
            if (condition.condition === "item.column === 'New' || item.column === 'Parked' || item.column === 'Backlog'" ||
                condition.condition === "item.column === \"New\" || item.column === \"Parked\" || item.column === \"Backlog\"") {
                const result = item.column === 'New' || item.column === 'Parked' || item.column === 'Backlog';
                log.debug(`Column check (inactive): ${item.column} in ['New', 'Parked', 'Backlog'] -> ${result}`);
                return result;
            }

            // Sprint conditions
            if (condition.condition === "item.sprint === 'current'") {
                const result = item.sprint === 'current';
                log.debug(`Sprint check (current): ${item.sprint} === 'current' -> ${result}`);
                return result;
            }

            // Linked issue conditions
            if (condition.condition === "!item.pr.closed || item.pr.merged") {
                const result = !item.pr?.closed || item.pr?.merged;
                log.debug(`Linked PR check: !${item.pr?.closed} || ${item.pr?.merged} -> ${result}`);
                return result;
            }

            // Column inheritance conditions
            if (condition.condition === "item.column === item.pr.column && item.assignees === item.pr.assignees") {
                const result = item.column === item.pr?.column &&
                    JSON.stringify(item.assignees) === JSON.stringify(item.pr?.assignees);
                log.debug(`Column/assignee inheritance check: ${result}`);
                return result;
            }

            // Assignee inheritance conditions
            if (condition.condition === "item.assignees.includes(item.author)") {
                const result = item.assignees?.nodes?.some(a => a.login === item.author?.login) || false;
                log.debug(`Author assignee check: ${item.assignees?.nodes?.map(a => a.login).join(', ')} includes ${item.author?.login} -> ${result}`);
                return result;
            }

            return false;
        } catch (error) {
            log.error(`Error validating condition: ${error.message}`, { condition });
            return false;
        }
    }

    /**
     * Validate skip conditions
     */
    async validateSkipRule(item, skipIf) {
        await this.ensureConfig();
        try {
            // Project membership check
            if (skipIf === "item.inProject") {
                const result = item.projectItems?.nodes?.length > 0;
                log.debug(`Skip check (in project): ${result}`);
                return result;
            }

            // Column-based skip conditions
            if (skipIf === "item.column !== 'New'") {
                const result = item.column !== 'New';
                log.debug(`Skip check (not New column): ${item.column} !== 'New' -> ${result}`);
                return result;
            }

            if (skipIf === "item.column") {
                const result = item.column && item.column !== 'None';
                log.debug(`Skip check (has column): ${item.column} exists -> ${result}`);
                return result;
            }

            // Sprint-based skip conditions
            if (skipIf === "item.sprint === 'current'" ||
                skipIf === "item.sprint === \"current\"") {
                const result = item.sprint === 'current';
                log.debug(`Skip check (current sprint): ${item.sprint} === 'current' -> ${result}`);
                return result;
            }

            // Sprint null check - skip if sprint is not null (has a sprint)
            if (skipIf === "item.sprint != null") {
                const result = item.sprint != null;
                log.debug(`Skip check (sprint not null): ${item.sprint} != null -> ${result}`);
                return result;
            }

            // Sprint null check - skip if sprint is null (no sprint)
            if (skipIf === "item.sprint == null") {
                const result = item.sprint == null;
                log.debug(`Skip check (sprint is null): ${item.sprint} == null -> ${result}`);
                return result;
            }

            // Assignee-based skip conditions
            if (skipIf === "item.assignees.includes(item.author)") {
                const result = item.assignees?.nodes?.some(a => a.login === item.author?.login) || false;
                log.debug(`Skip check (author assigned): ${item.assignees?.nodes?.map(a => a.login).join(', ')} includes ${item.author?.login} -> ${result}`);
                return result;
            }

            return false;
        } catch (error) {
            log.error(`Error validating skip condition: ${error.message}`, { skipIf });
            return false;
        }
    }
}

export { RuleValidation };
