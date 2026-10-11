import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import ConfigLoader from './loader.js';

/**
 * Load and validate rules.yml, the only source of settings, and flatten its scopes.
 * @param {string} [configPath] - Defaults to CONFIG_FILE or the nearest rules.yml
 * @returns {object} The parsed and validated configuration
 */

function loadBoardRules(configPath = resolveConfigPath()) {
  const loader = new ConfigLoader();
  const config = loader.load(configPath);

  // Normalize the new scope-based structure to the old flat structure for backward compatibility
  if (config.automation) {
    config.rules = mergeRuleScopes(config.automation);
    config.project = {
      ...config.project,
      repositories: config.automation.repository_scope.repositories,
    };

    // Every listed user is monitored (the schema requires at least one)
    config.monitoredUsers = config.automation.user_scope.monitored_users;
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
    Object.keys(automation.user_scope.rules).forEach((ruleType) => allRuleTypes.add(ruleType));
  }

  // Collect rule types from repository scope
  if (automation.repository_scope?.rules) {
    Object.keys(automation.repository_scope.rules).forEach((ruleType) =>
      allRuleTypes.add(ruleType)
    );
  }

  // Initialize all rule types with empty arrays
  allRuleTypes.forEach((ruleType) => {
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
    console.warn(
      '⚠️  No monitored users configured. Skipping user-scope rules (board_items, assignees that depend on users).'
    );
    console.warn(
      '   To enable user-based rules, configure monitored_users in automation.user_scope'
    );
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
  return Array.isArray(monitoredUsers) ? monitoredUsers : null;
}

/**
 * Merge a rule group into the merged rules object
 * @param {object} merged The merged rules object
 * @param {object} ruleGroup The rule group to merge
 */
function mergeRuleGroup(merged, ruleGroup) {
  Object.keys(ruleGroup).forEach((ruleType) => {
    if (Array.isArray(ruleGroup[ruleType])) {
      merged[ruleType].push(...ruleGroup[ruleType]);
    }
  });
}

export { loadBoardRules };

/**
 * Resolve the configuration file path, preferring a flattened, repo-level config.
 * Order of precedence:
 * 1) CONFIG_FILE env var (absolute or relative to CWD)
 * 2) CWD/rules.yml (root level config)
 * 3) Walk up parent directories from CWD to find rules.yml
 * 4) Legacy package-local config
 * @returns {string}
 */
function resolveConfigPath() {
  // 1) Explicit env override
  const fromEnv = process.env.CONFIG_FILE;
  if (fromEnv) {
    const absoluteEnvPath = path.isAbsolute(fromEnv)
      ? fromEnv
      : path.resolve(process.cwd(), fromEnv);
    if (fs.existsSync(absoluteEnvPath)) return absoluteEnvPath;
  }

  // 2) CWD/rules.yml (root level config)
  const rootConfig = path.join(process.cwd(), 'rules.yml');
  if (fs.existsSync(rootConfig)) return rootConfig;

  // 3) Walk up to find repo-level rules.yml
  const DIRECTORY_TRAVERSAL_LIMIT = 8;
  let current = process.cwd();
  for (let i = 0; i < DIRECTORY_TRAVERSAL_LIMIT; i += 1) {
    const candidate = path.join(current, 'rules.yml');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // 4) Legacy package-local config (last resort during migration)
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname, '../../rules.yml');
}
