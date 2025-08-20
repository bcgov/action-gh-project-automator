const path = require('path');
const fs = require('fs');
const ConfigLoader = require('./loader');

/**
 * Load the board rules configuration and normalize it for backward compatibility.
 * @returns {object} The parsed and validated configuration
 */
function loadBoardRules(context = {}) {
    const loader = new ConfigLoader();

    // Resolve config path with flattening preference for repo-level config
    const resolvedPath = resolveConfigPath();
    const config = loader.load(resolvedPath);

    // Pass through monitored user from context
    if (context.monitoredUser) {
        config.monitoredUser = context.monitoredUser;
    }

    // Normalize the new scope-based structure to the old flat structure for backward compatibility
    if (config.automation) {
        config.rules = mergeRuleScopes(config.automation);
        config.project = {
            ...config.project,
            organization: config.automation.repository_scope.organization,
            repositories: config.automation.repository_scope.repositories
        };

        // Extract monitored users from structured format for backward compatibility
        const monitoredUsers = getMonitoredUsers(config.automation);
        if (monitoredUsers && monitoredUsers.length > 0) {
            // For backward compatibility, use the first user as the primary monitored user
            config.monitoredUser = monitoredUsers[0];
            // Store the full array for new functionality
            config.monitoredUsers = monitoredUsers;
        }
        // Note: If no monitored users are configured, config.monitoredUser will be undefined
        // This is handled gracefully by the rule processors
    }

    return config;
}

/**
 * Merge user_scope and repository_scope rules into a flat structure
 * @param {object} automation The automation configuration
 * @returns {object} Merged rules object
 */
function mergeRuleScopes(automation) {
    const merged = {};
    
    // Initialize merged object with all rule types from both scopes
    const allRuleTypes = new Set();
    
    // Collect rule types from user scope
    if (automation.user_scope?.rules) {
        Object.keys(automation.user_scope.rules).forEach(ruleType => allRuleTypes.add(ruleType));
    }
    
    // Collect rule types from repository scope
    if (automation.repository_scope?.rules) {
        Object.keys(automation.repository_scope.rules).forEach(ruleType => allRuleTypes.add(ruleType));
    }
    
    // Initialize all rule types with empty arrays
    allRuleTypes.forEach(ruleType => {
        merged[ruleType] = [];
    });

    // Check if monitored users are properly configured
    const monitoredUsers = getMonitoredUsers(automation);
    
    if (monitoredUsers && monitoredUsers.length > 0) {
        // Merge user scope rules only if monitored users are configured
        if (automation.user_scope?.rules) {
            mergeRuleGroup(merged, automation.user_scope.rules);
        }
    } else {
        // Log warning and skip user-scope rules
        console.warn('⚠️  No monitored users configured. Skipping user-scope rules (board_items, assignees that depend on users).');
        console.warn('   To enable user-based rules, configure monitored_users in automation.user_scope');
    }

    // Merge repository scope rules (always included)
    if (automation.repository_scope?.rules) {
        mergeRuleGroup(merged, automation.repository_scope.rules);
    }

    return merged;
}

/**
 * Extract monitored users from automation configuration
 * @param {object} automation The automation configuration
 * @returns {Array<string>|null} The monitored users array or null if not configured
 */
function getMonitoredUsers(automation) {
    if (!automation.user_scope?.monitored_users) {
        return null;
    }

    const monitoredUsers = automation.user_scope.monitored_users;
    
    // If it's an array of strings, use it directly
    if (Array.isArray(monitoredUsers) && monitoredUsers.every(user => typeof user === 'string')) {
        return monitoredUsers;
    }
    
    // Legacy support for single user object format (with warning)
    if (typeof monitoredUsers === 'object' && monitoredUsers.type === 'static') {
        console.warn('⚠️  Legacy monitored_user object format detected. Consider using monitored_users array format.');
        return [monitoredUsers.name];
    }
    
    return null;
}

/**
 * Merge a rule group into the merged rules object
 * @param {object} merged The merged rules object
 * @param {object} ruleGroup The rule group to merge
 */
function mergeRuleGroup(merged, ruleGroup) {
    Object.keys(ruleGroup).forEach(ruleType => {
        if (Array.isArray(ruleGroup[ ruleType ])) {
            merged[ ruleType ].push(...ruleGroup[ ruleType ]);
        }
    });
}

module.exports = {
    loadBoardRules
};

/**
 * Resolve the configuration file path, preferring a flattened, repo-level config.
 * Order of precedence:
 * 1) CONFIG_FILE env var (absolute or relative to CWD)
 * 2) CWD/config/rules.yml
 * 3) Walk up parent directories from CWD to find config/rules.yml
 * 4) Legacy package-local config
 * @returns {string}
 */
function resolveConfigPath() {
    // 1) Explicit env override
    const fromEnv = process.env.CONFIG_FILE;
    if (fromEnv) {
        const absoluteEnvPath = path.isAbsolute(fromEnv) ? fromEnv : path.resolve(process.cwd(), fromEnv);
        if (fs.existsSync(absoluteEnvPath)) return absoluteEnvPath;
    }

    // 2) CWD/config/rules.yml
    const cwdConfig = path.join(process.cwd(), 'config/rules.yml');
    if (fs.existsSync(cwdConfig)) return cwdConfig;

    // 3) Walk up to find repo-level config/rules.yml
    let current = process.cwd();
    for (let i = 0; i < 8; i += 1) {
        const candidate = path.join(current, 'config/rules.yml');
        if (fs.existsSync(candidate)) return candidate;
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }

    // 4) Legacy package-local config (last resort during migration)
    return path.join(__dirname, '../../config/rules.yml');
}
