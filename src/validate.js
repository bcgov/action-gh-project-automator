#!/usr/bin/env node

import * as core from '@actions/core';
import { loadBoardRules, resolveConfigPath } from './config/board-rules.js';
import * as api from './github/api.js';
import { projectOwnerFromUrl } from './utils/board-lookup.js';
import { getConfiguredColumns, validateBoardColumns } from './utils/column-assignment.js';

/**
 * Validate rules configuration offline (syntax + schema) and optionally online (board + columns).
 * @param {object} [options]
 * @param {string} [options.configPath] - Optional path to rules.yml
 * @param {boolean} [options.dryRun] - Run dry-run mutation planning if credentials available
 * @returns {Promise<{valid: boolean, offline: boolean, config: object, projectId?: string, meta?: object}>}
 */
export async function validate(options = {}) {
  const args = process.argv.slice(2);
  const configPath =
    options.configPath ||
    (() => {
      const idx = args.findIndex((a) => a === '--config' || a === '-c');
      return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
    })();
  const dryRun = options.dryRun ?? (args.includes('--dry-run') || process.env.DRY_RUN === 'true');

  const resolvedConfigPath = resolveConfigPath(configPath);
  core.info(`Validating configuration at ${resolvedConfigPath}...`);

  // 1. Offline syntax and schema validation
  const config = loadBoardRules(resolvedConfigPath);
  core.info('✔ Syntax and schema validation passed.');

  // 2. Check for credentials
  const token = api.resolveToken();

  if (!token) {
    core.info(
      'ℹ GITHUB_TOKEN not configured; skipping remote project board and column verification.'
    );
    return { valid: true, offline: true, config };
  }

  // 3. Online verification: board connectivity and status columns
  core.info(`Verifying project board connectivity: ${config.project.url}...`);
  api.setProjectFields(config.project.fields);
  api.setOwnerTokens(
    api.resolveOwnerTokens(config.tokens),
    projectOwnerFromUrl(config.project.url)
  );
  const access = await api.checkAccess({
    projectUrl: config.project.url,
    org: config.project.organization,
    repos: config.project.repositories,
    allowedOrgs: config.project.allowedOrgs,
  });
  for (const line of access.lines) core.info(`Access: ${line}`);
  api.requireAccess(access);
  const projectId = access.projectId;
  core.info(`✔ Connected to Project Board (ID: ${projectId}).`);

  const meta = await api.getProjectMetadata(projectId);
  if (!meta.statusFieldId) {
    throw new Error(
      `Status field "${config.project.fields.status}" was not found on the project board.`
    );
  }

  const configuredColumns = getConfiguredColumns(config);
  validateBoardColumns(configuredColumns, meta.statusOptions);
  core.info(
    `✔ Configured status columns verified against project board: ${configuredColumns.join(', ')}.`
  );

  core.info(`✔ Token can read all ${config.project.repositories.length} monitored repositories.`);

  if (dryRun) {
    core.info('🔍 Running dry-run to report planned mutations...');
    process.env.DRY_RUN = 'true';
    const { run } = await import('./index.js');
    await run({ configPath: resolvedConfigPath, dryRun: true });
  }

  return { valid: true, offline: false, config, projectId, meta };
}

// Execute when invoked directly from CLI
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('/validate.js') ||
    process.argv[1].endsWith('\\validate.js') ||
    process.argv[1] === 'src/validate.js' ||
    process.argv[1] === 'scripts/validate.js');

if (isDirectRun) {
  validate().catch((err) => {
    core.setFailed(err.message);
    process.exit(1);
  });
}
