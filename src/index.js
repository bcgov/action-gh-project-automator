import * as core from '@actions/core';
import { loadBoardRules } from './config/board-rules.js';
import * as api from './github/api.js';
import { determineLinkedIssueColumn, determineTargetColumn } from './utils/column-assignment.js';
import { isTitleExcluded } from './utils/exclusions.js';
import { resolveSince } from './github/queries.js';
import { boardState } from './utils/board-state.js';
import { apiUsage, formatApiUsage } from './utils/api-usage.js';
import { getWatermark, saveWatermark } from './utils/watermark.js';
import {
  backfillSince,
  parseBackfill,
  planBackfillItem,
  shouldSaveWatermark,
} from './utils/backfill.js';

async function run() {
  try {
    core.info("🚀 Starting Derek's Personal Project Automator Rebuild Engine...");

    // 1. Resolve and Load rules.yml
    const monitoredUser = 'DerekRoberts';
    const config = loadBoardRules({ monitoredUser });

    // Extract parameters
    const projectUrl =
      config.project?.url || process.env.GITHUB_PROJECT_URL || process.env.INPUT_PROJECT_URL;
    const allowedOrgs = config.project?.allowedOrgs || ['bcgov', 'bcgov-c'];
    const maintainerRepos = config.project?.repositories || [];
    const windowHours = parseInt(process.env.UPDATE_WINDOW_HOURS || '2', 10);
    // Manual catch-up: '30d' or 'all' (empty = normal run)
    const backfill = parseBackfill(core.getInput('backfill'));

    if (!projectUrl) {
      throw new Error('Project URL is not configured. Please define it in rules.yml or inputs.');
    }

    core.info(`Configured Project URL: ${projectUrl}`);
    core.info(`Allowed Orgs: ${allowedOrgs.join(', ')}`);
    core.info(`Maintainer Repos: ${maintainerRepos.join(', ')}`);
    core.info(`Monitored User: ${monitoredUser}`);

    // 2. Resolve Project Board and Fields
    core.info('Resolving Project Board ID...');
    const projectId = await api.getProjectId(projectUrl);
    if (!projectId) {
      throw new Error(`Failed to resolve Project ID from URL: ${projectUrl}`);
    }
    core.info(`Resolved Project ID: ${projectId}`);

    core.info('Fetching Project Metadata & Iterations...');
    const meta = await api.getProjectMetadata(projectId);
    core.info(`Sprint Field Present: ${!!meta.sprintFieldId}`);
    if (meta.currentSprintTitle) {
      core.info(
        `Active Iteration (Sprint): "${meta.currentSprintTitle}" (ID: ${meta.currentSprintId})`
      );
    } else {
      core.info('⚠️ No active Iteration (Sprint) resolved for today.');
    }

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
      config.project?.organization || 'bcgov',
      maintainerRepos,
      monitoredUser,
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

        // Check Triggers for Board Addition
        const isMaintainerRepo = maintainerRepos.includes(repoName);
        const isAuthored = author === monitoredUser;
        const isAssigned = assignees.includes(monitoredUser);
        const isReviewer =
          itemType === 'PullRequest' &&
          (item.reviewRequests?.nodes || []).some(
            (req) => req.requestedReviewer?.login === monitoredUser
          );

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
          const plan = planBackfillItem(item, projectId, config.board_columns);
          if (plan.action === 'skip') {
            core.info(`Already on the board (${plan.projectItemId}); leaving it alone.`);
            continue;
          }
          core.info(`Backfill: adding to the board in "${plan.column}"...`);
          const newItemId = await api.addItemToProject(item.id, projectId);
          await api.updateItemColumn(projectId, newItemId, plan.column);
          summaryReport.push({
            type: itemType,
            number,
            repo: repoName,
            title,
            status: 'Success',
            action: `Backfill: added to "${plan.column}"`,
          });
          continue;
        }

        // Board state comes from the search result: no per-item lookups
        const board = boardState(item, projectId);
        let projectItemId = board?.projectItemId || null;
        const currentColumn = board?.column || null;
        const currentSprint = board?.sprint || null;

        if (projectItemId) {
          core.info(`Item is already present on the board. Project Item ID: ${projectItemId}`);
        } else if (isClosed) {
          // A PR closed without merging isn't added; only its linked issues are updated below
          core.info('Closed item is not on the board; not adding it.');
        } else {
          core.info(`Adding item to project board...`);
          projectItemId = await api.addItemToProject(item.id, projectId);
          core.info(`Successfully added! Project Item ID: ${projectItemId}`);
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

        // --- Sprint Assignment ---
        const activeColumns = ['Active', 'Next', 'Waiting', 'Done'];
        const inactiveColumns = ['New', 'Parked', 'Backlog'];

        const finalColumn = projectItemId ? targetColumn || currentColumn : null;
        core.info(
          `Current Sprint Field Value: ${currentSprint ? `"${currentSprint.title}"` : 'None'}`
        );

        if (activeColumns.includes(finalColumn)) {
          if (
            meta.currentSprintId &&
            (!currentSprint || currentSprint.id !== meta.currentSprintId)
          ) {
            core.info(`Assigning current active sprint iteration "${meta.currentSprintTitle}"...`);
            await api.updateItemSprint(projectId, projectItemId, meta.currentSprintId);
            core.info('Sprint successfully associated!');
          }
        } else if (inactiveColumns.includes(finalColumn)) {
          if (currentSprint) {
            core.info('Clearing sprint iteration (inactive status column)...');
            await api.updateItemSprint(projectId, projectItemId, null);
            core.info('Sprint cleared!');
          }
        }

        // --- Assignee Check ---
        let assigneeAction = '';
        if (isAuthored && !isAssigned) {
          core.info(`Self-assigning authored item on GitHub...`);
          const assignment = await api.assignUserToItem(repoName, number, monitoredUser);
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
          const linkedIssues = await api.fetchLinkedIssuesForPullRequest(item.id, projectId);
          core.info(`Found ${linkedIssues.length} linked issues.`);

          for (const linked of linkedIssues) {
            if (linked.projectItemId) {
              core.info(
                `Processing linked Issue #${linked.number} inside ${linked.repository?.nameWithOwner}...`
              );

              // Ready PR -> Active, draft PR -> stays put, closed unmerged -> Next
              const linkedCurrentCol = linked.column;
              const linkedTargetCol = determineLinkedIssueColumn(
                { isClosed, merged: isMerged, draft: isDraft },
                linkedCurrentCol,
                config.board_columns
              );

              if (linkedTargetCol && linkedTargetCol !== linkedCurrentCol) {
                core.info(
                  `Updating linked issue status column from "${linkedCurrentCol || 'None'}" to "${linkedTargetCol}"...`
                );
                await api.updateItemColumn(projectId, linked.projectItemId, linkedTargetCol);
              }

              // Inherit Sprint
              const linkedCurrentSprint = linked.sprint;
              if (activeColumns.includes(linkedTargetCol)) {
                if (
                  meta.currentSprintId &&
                  (!linkedCurrentSprint || linkedCurrentSprint.id !== meta.currentSprintId)
                ) {
                  core.info(`Updating linked issue sprint to current active iteration...`);
                  await api.updateItemSprint(projectId, linked.projectItemId, meta.currentSprintId);
                }
              }

              // Inherit Assignee
              await api.assignUserToItem(
                linked.repository?.nameWithOwner,
                linked.number,
                monitoredUser
              );
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
        core.error(`Failed to process item: ${itemErr.message}`);
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
    let summaryHtml = `### 🚀 Derek's Personal Project Automator Summary\n\n`;
    summaryHtml += `| Item | Title | Status | Result |\n`;
    summaryHtml += `| :--- | :--- | :--- | :--- |\n`;

    let hasFailure = false;
    for (const s of summaryReport) {
      const icon = s.status === 'Success' ? '✅' : '❌';
      if (s.status === 'Failed') hasFailure = true;
      summaryHtml += `| **${s.type} #${s.number}** (${s.repo}) | ${s.title} | ${icon} ${s.status} | ${s.action} |\n`;
    }

    summaryHtml += formatApiUsage(apiUsage, await api.getRateLimit());
    await core.summary.addRaw(summaryHtml).write();

    // Only a fully successful normal run moves the watermark forward, so failed items are retried
    if (shouldSaveWatermark({ backfill, hasFailure })) {
      await saveWatermark(projectId, runStartedAt);
    }

    if (hasFailure) {
      throw new Error('Some items failed to sync to the project board. Check logs for details.');
    }

    core.info('🎉 All operations completed successfully.');
  } catch (error) {
    core.setFailed(`Engine execution crashed: ${error.message}`);
  }
}

run();
