import * as core from '@actions/core';
import { loadBoardRules } from '../config/board-rules.js';
import { getProjectId } from '../github/api.js';
import { listOpenIssues, upsertReportIssue } from './github.js';
import { findOffBoardIssues, renderReport } from './off-board.js';

async function run() {
  try {
    const config = loadBoardRules({ monitoredUser: 'DerekRoberts' });
    const settings = config.off_board_report;
    if (!settings) throw new Error('off_board_report is not configured in rules.yml');

    const projectUrl = config.project.url;
    const repositories = config.project.repositories || [];
    const projectId = await getProjectId(projectUrl);
    if (!projectId) throw new Error(`Failed to resolve Project ID from URL: ${projectUrl}`);

    const issues = [];
    for (const repo of repositories) {
      const repoIssues = await listOpenIssues(repo);
      core.info(`${repo}: ${repoIssues.length} open issue(s)`);
      issues.push(...repoIssues);
    }

    const { offBoard, excluded } = findOffBoardIssues(issues, {
      projectId,
      exclusions: config.exclusions,
      reportLabel: settings.label,
    });
    const body = renderReport(offBoard, { projectUrl, repositories, excluded });
    core.info(`${offBoard.length} open issue(s) off the board, ${excluded} excluded.`);
    await core.summary.addRaw(body).write();

    if (process.env.DRY_RUN === 'true') {
      core.info('[DRY RUN] Not editing the report issue.');
      return;
    }
    const [owner, repo] = settings.repository.split('/');
    const url = await upsertReportIssue({
      owner,
      repo,
      label: settings.label,
      title: settings.title,
      body,
    });
    core.info(`Report issue: ${url}`);
  } catch (error) {
    core.setFailed(`Off-board report failed: ${error.message}`);
  }
}

run();
