import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import * as core from '@actions/core';
import { loadBoardRules, resolveConfigPath } from './config/board-rules.js';
import * as api from './github/api.js';
import {
  determineLinkedIssueColumn,
  determineTargetColumn,
  getConfiguredColumns,
  validateBoardColumns,
} from './utils/column-assignment.js';
import { findExcludedLabel, isTitleExcluded, labelNames } from './utils/exclusions.js';
import { resolveSince } from './github/queries.js';
import {
  columnAfterAdd,
  createBoardLookup,
  formatBoardFetch,
  projectOwnerFromUrl,
} from './utils/board-lookup.js';
import { apiUsage, formatApiUsage } from './utils/api-usage.js';
import { getWatermark, saveWatermark } from './utils/watermark.js';
import { sprintAction } from './utils/sprint.js';
import { formatResultCounts } from './utils/summary.js';
import {
  backfillSince,
  parseBackfill,
  planBackfillItem,
  shouldSaveWatermark,
} from './utils/backfill.js';

async function run(options = {}) {
  try {
    core.info('🚀 Starting Project Automator...');

    // Dry run configuration: CLI/action input or environment variable
    const dryRun = options.dryRun !== undefined ? String(options.dryRun) : core.getInput('dry_run');
    if (dryRun === 'true' || process.env.DRY_RUN === 'true' || process.argv.includes('--dry-run')) {
      process.env.DRY_RUN = 'true';
      core.info('🔍 Running in DRY_RUN mode (read-only, mutations disabled).');
    } else {
      process.env.DRY_RUN = 'false';
    }

    // 1. Load rules.yml: resolve from local disk or fetch via GitHub API when running without checkout
    const configPathInput =
      options.configPath || core.getInput('config_path') || process.env.CONFIG_FILE || 'rules.yml';
    let resolvedConfigPath;
    try {
      resolvedConfigPath = resolveConfigPath(configPathInput);
    } catch (err) {
      if (process.env.GITHUB_REPOSITORY) {
        core.info(
          `Local config not found. Fetching '${configPathInput}' from ${process.env.GITHUB_REPOSITORY}...`
        );
        let content;
        try {
          content = await api.fetchRepoFile(configPathInput);
        } catch (fetchErr) {
          throw new Error(
            `Cannot read '${configPathInput}' from ${process.env.GITHUB_REPOSITORY}: ${fetchErr.message}. Check config_path, add actions/checkout before this step, or give the token read access to the repository contents.`,
            { cause: fetchErr }
          );
        }
        const tmpPath = path.join(os.tmpdir(), 'project-automator-rules.yml');
        fs.writeFileSync(tmpPath, content, 'utf8');
        resolvedConfigPath = tmpPath;
      } else {
        throw err;
      }
    }

    const config = loadBoardRules(resolvedConfigPath);
    const projectUrl = config.project.url;
    const { allowedOrgs, organization } = config.project;
    const maintainerRepos = config.project.repositories;
    const monitoredUsers = config.monitoredUsers;
    const windowHours = config.technical.update_window_hours;
    api.setProjectFields(config.project.fields);
    // Manual catch-up: '30d' or 'all' (empty = normal run)
    const backfill = parseBackfill(core.getInput('backfill'));

    core.info(`Configured Project URL: ${projectUrl}`);
    core.info(`Allowed Orgs: ${allowedOrgs.join(', ')}`);
    core.info(`Maintainer Repos: ${maintainerRepos.join(', ')}`);
    core.info(`Monitored Users: ${monitoredUsers.join(', ')}`);

    // 2. Resolve Project Board and Fields
    const token = api.resolveToken();
    const isDryRun = process.env.DRY_RUN === 'true';
    const isValidateOnly = process.argv.includes('--validate');

    // Command-line dry runs and --validate can check the config offline; an action run needs a token
    if (!token) {
      if (process.env.GITHUB_ACTIONS === 'true' || !(isDryRun || isValidateOnly)) {
        throw new Error(api.NO_TOKEN_MESSAGE);
      }
      core.info('✔ Offline validation passed: configuration syntax and schema are valid.');
      core.warning(
        'GITHUB_TOKEN not configured; skipping remote project board connectivity, column verification, and planned mutation reporting.'
      );
      return;
    }

    // Per-owner tokens from rules.yml; a mapped owner with no token fails here, before any call
    api.setOwnerTokens(api.resolveOwnerTokens(config.tokens), projectOwnerFromUrl(projectUrl));
    for (const owner of Object.keys(config.tokens)) {
      core.info(`Owner ${owner} uses token ${api.tokenNameFor(owner)}.`);
    }

    // Start-up access check: every project, owner and repository, before any write (dry runs too)
    core.info('Checking token access...');
    const access = await api.checkAccess({
      projectUrl,
      org: organization,
      repos: maintainerRepos,
      allowedOrgs,
    });
    for (const line of access.lines) core.info(`Access: ${line}`);
    api.requireAccess(access);
    const projectId = access.projectId;
    core.info(`Resolved Project ID: ${projectId}`);

    core.info('Fetching Project Metadata & Columns...');
    const meta = await api.getProjectMetadata(projectId);
    if (!meta.statusFieldId) {
      throw new Error(
        `Status field "${config.project.fields.status}" was not found on the project board.`
      );
    }
    validateBoardColumns(getConfiguredColumns(config), meta.statusOptions);
    core.info('✔ Configured status columns verified against project board.');

    if (config.project.fields.sprint && config.sprints) {
      core.info(`Sprint Field Present: ${!!meta.sprintFieldId}`);
      if (meta.currentSprintTitle) {
        core.info(
          `Active Iteration (Sprint): "${meta.currentSprintTitle}" (ID: ${meta.currentSprintId})`
        );
      } else {
        core.info('⚠️ No active Iteration (Sprint) resolved for today.');
      }
    } else {
      core.info('Sprint tracking not configured; bypassing iteration resolution.');
    }

    core.info(`✔ Token can read all ${maintainerRepos.length} monitored repositories.`);

    if (isValidateOnly) {
      core.info('✔ Remote board connectivity and status columns validated successfully.');
      return;
    }

    // Membership, column and sprint: from search results, or the board's item list for cross-org items
    const board = createBoardLookup({
      projectId,
      projectOwner: projectOwnerFromUrl(projectUrl),
      fetchBoardItems: () => api.getProjectBoardItems(projectId),
    });

    // 3. Discover items: since the last successful run (or the fallback window),
    //    or, for a backfill, open items over the requested window, ignoring the watermark
    const runStartedAt = new Date().toISOString();
    let since;
    if (backfill) {
      since = backfillSince(backfill);
      core.info(
        `Backfill: open items ${since ? `updated since ${since}` : 'of any age'}; watermark ignored and not saved`
      );
    } else {
      const watermark = await getWatermark(projectId);
      since = resolveSince(watermark, windowHours);
      core.info(
        watermark
          ? `Searching since last successful run: ${since}`
          : `No watermark; searching the last ${windowHours}h (since ${since})`
      );
    }
    const recentItems = await api.getRecentItems(
      organization,
      maintainerRepos,
      monitoredUsers,
      since,
      { allowedOrgs, openOnly: Boolean(backfill) }
    );
    core.info(`Discovered ${recentItems.length} recent items to evaluate.`);

    const summaryReport = [];

    // 4. Process each item sequentially
    for (const item of recentItems) {
      try {
        const itemType = item.__typename; // "Issue" or "PullRequest"
        const repoName = item.repository?.nameWithOwner;
        const number = item.number;
        const title = item.title;
        const author = item.author?.login;
        const assignees = (item.assignees?.nodes || []).map((a) => a.login);
        const isClosed = item.state === 'CLOSED' || item.state === 'MERGED';
        const isMerged = item.state === 'MERGED';
        const isDraft = itemType === 'PullRequest' && item.isDraft === true;

        core.info(`\n--- Evaluating ${itemType} #${number} inside ${repoName}: "${title}" ---`);

        // Exclude specific automated noise by title
        if (isTitleExcluded(title, config.exclusions)) {
          core.info(`Skipping: Automated item excluded based on title ("${title}").`);
          continue;
        }
        const excludedLabel = findExcludedLabel(labelNames(item.labels), config.exclusions);
        if (excludedLabel) {
          core.info(`Skipping: Item excluded based on label ("${excludedLabel}").`);
          continue;
        }

        // Check Triggers for Board Addition
        const isMaintainerRepo = maintainerRepos.includes(repoName);
        const isAuthored = monitoredUsers.includes(author);
        const isAssigned = assignees.some((login) => monitoredUsers.includes(login));
        const isReviewer =
          itemType === 'PullRequest' &&
          (item.reviewRequests?.nodes || []).some((req) =>
            monitoredUsers.includes(req.requestedReviewer?.login)
          );
        // The monitored user to assign: the author when monitored, otherwise the first listed (if any)
        const assignee = isAuthored ? author : monitoredUsers[0] || null;

        const shouldBeAdded = isMaintainerRepo || isAuthored || isAssigned || isReviewer;
        let addReason = '';
        if (isMaintainerRepo) addReason = 'Maintainer Repo';
        else if (isAuthored) addReason = 'Authored by monitored user';
        else if (isAssigned) addReason = 'Assigned to monitored user';
        else if (isReviewer) addReason = 'Review request pending';

        if (!shouldBeAdded) {
          core.info(`Skipping: Item does not match any personal board addition trigger rules.`);
          continue;
        }

        core.info(`Match Found: item should be on board due to: "${addReason}"`);

        // Backfill only adds missing items; items already on the board aren't re-added or moved
        if (backfill) {
          const plan = planBackfillItem(await board.stateFor(item, repoName), config.board_columns);
          if (plan.action === 'skip') {
            core.info(`Already on the board (${plan.projectItemId}); leaving it alone.`);
            continue;
          }
          core.info(`Backfill: adding to the board...`);
          const newItemId = await api.addItemToProject(item.id, projectId, `${repoName}#${number}`);
          // The add returns the existing item if it was already there: never overwrite its Status
          const existing = await api.getProjectItemState(newItemId);
          const column = columnAfterAdd(existing, plan.column);
          if (column) await api.updateItemColumn(projectId, newItemId, column);
          else core.info(`Already had Status "${existing.column}"; leaving it alone.`);
          summaryReport.push({
            type: itemType,
            number,
            repo: repoName,
            title,
            status: 'Success',
            action: column
              ? `Backfill: added to "${column}"`
              : `Backfill: already in "${existing.column}"`,
          });
          continue;
        }

        // Board state from the search result, or the board's item list for cross-org items
        const state = await board.stateFor(item, repoName);
        if (state?.isArchived) {
          core.info(`Item ${repoName}#${number} is archived on the project board; skipping.`);
          continue;
        }
        let projectItemId = state?.projectItemId || null;
        let currentColumn = state?.column || null;
        let currentSprint = state?.sprint || null;

        if (projectItemId) {
          core.info(`Item is already present on the board. Project Item ID: ${projectItemId}`);
        } else if (isClosed) {
          // A PR closed without merging isn't added; only its linked issues are updated below
          core.info('Closed item is not on the board; not adding it.');
        } else {
          core.info(`Adding item to project board...`);
          projectItemId = await api.addItemToProject(item.id, projectId, `${repoName}#${number}`);
          core.info(`Successfully added! Project Item ID: ${projectItemId}`);
          // The add returns the existing item if it was already there: use its real Status and Sprint
          const existing = await api.getProjectItemState(projectItemId);
          currentColumn = existing.column;
          currentSprint = existing.sprint;
        }

        // --- Column Assignment ---
        core.info(`Current Column: ${currentColumn || 'None'}`);

        const targetColumn = determineTargetColumn(itemType, isClosed, currentColumn, {
          merged: isMerged,
          draft: isDraft,
          policy: config.board_columns,
        });
        let columnAction = '';

        if (!projectItemId) {
          columnAction = 'Not on board';
        } else if (targetColumn && targetColumn !== currentColumn) {
          core.info(`Moving Status from "${currentColumn || 'None'}" to "${targetColumn}"...`);
          await api.updateItemColumn(projectId, projectItemId, targetColumn);
          core.info(`Successfully moved column!`);
          columnAction = `Moved to "${targetColumn}"`;
        } else {
          core.info(`Status column is already set correctly to: "${targetColumn || 'None'}"`);
          columnAction = `Retained in "${currentColumn || 'None'}"`;
        }

        // --- Sprint Assignment (rules.yml sprints) ---
        const finalColumn = projectItemId ? targetColumn || currentColumn : null;
        core.info(
          `Current Sprint Field Value: ${currentSprint ? `"${currentSprint.title}"` : 'None'}`
        );

        if (config.sprints && config.project.fields.sprint) {
          const sprintChange = sprintAction(
            finalColumn,
            currentSprint,
            meta.currentSprintId,
            config.sprints
          );
          if (sprintChange === 'assign') {
            core.info(`Assigning current active sprint iteration "${meta.currentSprintTitle}"...`);
            await api.updateItemSprint(projectId, projectItemId, meta.currentSprintId);
            core.info('Sprint successfully associated!');
          } else if (sprintChange === 'clear') {
            core.info(`Clearing sprint iteration (column "${finalColumn}")...`);
            await api.updateItemSprint(projectId, projectItemId, null);
            core.info('Sprint cleared!');
          }
        }

        // --- Assignee Check ---
        let assigneeAction = '';
        if (isAuthored && !isAssigned) {
          core.info(`Self-assigning authored item on GitHub...`);
          const assignment = await api.assignUserToItem(repoName, number, author);
          if (assignment === 'assigned') {
            core.info('User successfully assigned!');
            assigneeAction = 'Assignee added';
          } else if (assignment === 'skipped') {
            assigneeAction = 'Assignee skipped (no repository admin)';
          }
        }

        // --- Linked Issues Progression (Spec 3.2) ---
        if (itemType === 'PullRequest') {
          core.info('Checking for linked issues closing references...');
          const linkedIssues = await api.fetchLinkedIssuesForPullRequest(
            item.id,
            projectId,
            repoName
          );
          core.info(`Found ${linkedIssues.length} linked issues.`);

          for (const linked of linkedIssues) {
            if (isTitleExcluded(linked.title, config.exclusions)) {
              core.info(
                `Skipping linked Issue #${linked.number} inside ${linked.repository?.nameWithOwner}: excluded based on title.`
              );
              continue;
            }
            const linkedExcludedLabel = findExcludedLabel(linked.labels, config.exclusions);
            if (linkedExcludedLabel) {
              core.info(
                `Skipping linked Issue #${linked.number} inside ${linked.repository?.nameWithOwner}: excluded based on label ("${linkedExcludedLabel}").`
              );
              continue;
            }
            // Cross-org linked issues aren't in their own projectItems: use the board's item list
            if (board.isCrossOrg(linked.repository?.nameWithOwner)) {
              Object.assign(linked, {
                projectItemId: null,
                column: null,
                sprint: null,
                ...(await board.stateFor(linked, linked.repository?.nameWithOwner)),
              });
            }
            if (linked.projectItemId) {
              if (linked.isArchived) {
                core.info(
                  `Linked Issue #${linked.number} inside ${linked.repository?.nameWithOwner} is archived on the project board; skipping.`
                );
                continue;
              }
              core.info(
                `Processing linked Issue #${linked.number} inside ${linked.repository?.nameWithOwner}...`
              );

              // Ready PR -> Active, draft PR -> stays put, closed unmerged -> Next
              const linkedCurrentCol = linked.column;
              const linkedTargetCol = determineLinkedIssueColumn(
                { isClosed, merged: isMerged, draft: isDraft },
                linkedCurrentCol,
                config.board_columns,
                { isClosed: linked.isClosed }
              );

              if (linkedTargetCol && linkedTargetCol !== linkedCurrentCol) {
                core.info(
                  `Updating linked issue status column from "${linkedCurrentCol || 'None'}" to "${linkedTargetCol}"...`
                );
                await api.updateItemColumn(projectId, linked.projectItemId, linkedTargetCol);
              }

              // Inherit Sprint (only assigned here, as before; never cleared)
              if (config.sprints && config.project.fields.sprint) {
                const linkedSprintChange = sprintAction(
                  linkedTargetCol,
                  linked.sprint,
                  meta.currentSprintId,
                  config.sprints
                );
                if (linkedSprintChange === 'assign') {
                  core.info(`Updating linked issue sprint to current active iteration...`);
                  await api.updateItemSprint(projectId, linked.projectItemId, meta.currentSprintId);
                }
              }

              // Inherit Assignee (open issues only)
              if (!linked.isClosed && assignee) {
                await api.assignUserToItem(
                  linked.repository?.nameWithOwner,
                  linked.number,
                  assignee
                );
              }
            }
          }
        }

        summaryReport.push({
          type: itemType,
          number,
          repo: repoName,
          title,
          status: 'Success',
          action: [columnAction, assigneeAction].filter(Boolean).join('; '),
        });
      } catch (itemErr) {
        core.error(
          `Failed to process ${item.__typename} ${item.repository?.nameWithOwner}#${item.number}: ${itemErr.message}`
        );
        summaryReport.push({
          type: item.__typename,
          number: item.number,
          repo: item.repository?.nameWithOwner,
          title: item.title,
          status: 'Failed',
          action: itemErr.message,
        });
      }
    }

    // 5. Generate beautiful job summary
    core.info('\n--- Generating Run Summary ---');
    let summaryHtml = `### 🚀 Project Automator Summary\n\n`;
    summaryHtml += `| Item | Title | Status | Result |\n`;
    summaryHtml += `| :--- | :--- | :--- | :--- |\n`;

    let hasFailure = false;
    for (const s of summaryReport) {
      const icon = s.status === 'Success' ? '✅' : '❌';
      if (s.status === 'Failed') hasFailure = true;
      summaryHtml += `| **${s.type} #${s.number}** (${s.repo}) | ${s.title} | ${icon} ${s.status} | ${s.action} |\n`;
    }

    summaryHtml += formatResultCounts(summaryReport);
    summaryHtml += formatBoardFetch(board.stats);
    summaryHtml += formatApiUsage(apiUsage, await api.getRateLimit());
    if (process.env.GITHUB_STEP_SUMMARY) {
      await core.summary.addRaw(summaryHtml).write();
    } else {
      core.info(summaryHtml);
    }

    // Only a fully successful normal run moves the watermark forward, so failed items are retried
    if (shouldSaveWatermark({ backfill, hasFailure })) {
      await saveWatermark(projectId, runStartedAt);
    }

    if (hasFailure) {
      const failed = summaryReport.filter((s) => s.status === 'Failed').length;
      throw new Error(
        `${failed} item(s) failed to sync to the project board; the rest were processed. See the summary.`
      );
    }

    core.info('🎉 All operations completed successfully.');
  } catch (error) {
    core.setFailed(`Engine execution crashed: ${error.message}`);
    throw error;
  }
}

export { run };

function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    const scriptPath = fileURLToPath(import.meta.url);
    const entryPath = path.resolve(process.argv[1]);
    return scriptPath === entryPath || fs.realpathSync(scriptPath) === fs.realpathSync(entryPath);
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  run().catch(() => {
    process.exitCode = 1;
  });
}
