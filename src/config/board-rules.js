import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import ConfigLoader from './loader.js';

/**
 * Load and validate rules.yml, the only source of settings, and flatten its scopes.
 * @param {string} [configPath] - Defaults to CONFIG_FILE or the nearest rules.yml
 * @returns {object} The parsed and validated configuration
 */

import { projectOwnerFromUrl } from '../utils/board-lookup.js';

function loadBoardRules(configPath = resolveConfigPath()) {
  const loader = new ConfigLoader();
  const config = loader.load(configPath);

  // exclusions.exclude_labels is optional (added after configs were in use): absent means none
  if (config.exclusions.exclude_labels === undefined) {
    config.exclusions.exclude_labels = [];
  }

  // tokens is optional: absent means every call uses the default github_token
  if (config.tokens === undefined) {
    config.tokens = {};
  }

  // Default allowedOrgs to the owner parsed from project.url when omitted
  if (!config.project.allowedOrgs || config.project.allowedOrgs.length === 0) {
    config.project.allowedOrgs = [projectOwnerFromUrl(config.project.url)];
  }

  // Flatten the scopes into the fields the sync reads
  if (config.automation) {
    config.project = {
      ...config.project,
      repositories: config.automation.repository_scope?.repositories || [],
    };

    config.monitoredUsers = config.automation.user_scope?.monitored_users || [];
  } else {
    config.monitoredUsers = [];
  }

  return config;
}

export { loadBoardRules, resolveConfigPath };

/**
 * Resolve the configuration file path, preferring a flattened, repo-level config.
 * Order of precedence:
 * 1) customPath argument, INPUT_CONFIG_PATH, or CONFIG_FILE env var
 * 2) CWD/rules.yml (root level config)
 * 3) Walk up parent directories from CWD to find rules.yml
 * 4) Legacy package-local config
 * @param {string} [customPath]
 * @returns {string}
 */
function resolveConfigPath(customPath) {
  // 1) Explicit customPath, config_path action input, or CONFIG_FILE env override
  const candidate = customPath || process.env.INPUT_CONFIG_PATH || process.env.CONFIG_FILE;
  if (candidate) {
    const absoluteEnvPath = path.isAbsolute(candidate)
      ? candidate
      : path.resolve(process.cwd(), candidate);
    if (fs.existsSync(absoluteEnvPath)) return absoluteEnvPath;
    throw new Error(`Configuration file not found: ${candidate}`);
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
