import { isTitleExcluded } from '../utils/exclusions.js';

export const REPORT_MARKER = '<!-- off-board-report -->';

/**
 * Keep open issues that aren't on the project, skipping excluded noise and the report itself.
 * @param {Array<object>} issues - { number, title, url, repository, createdAt, labels, projectIds }
 * @param {object} options
 * @param {string} options.projectId - Project node ID
 * @param {object} [options.exclusions] - `exclusions` from rules.yml
 * @param {string} options.reportLabel - Label carried by the report issue
 * @returns {{ offBoard: Array<object>, excluded: number }}
 */
export function findOffBoardIssues(issues, { projectId, exclusions, reportLabel }) {
  const offBoard = [];
  let excluded = 0;
  for (const issue of issues) {
    if ((issue.labels || []).includes(reportLabel)) continue;
    if ((issue.projectIds || []).includes(projectId)) continue;
    if (isTitleExcluded(issue.title, exclusions)) {
      excluded++;
      continue;
    }
    offBoard.push(issue);
  }
  return { offBoard, excluded };
}

/**
 * Render the report issue body, grouped by repository.
 * @param {Array<object>} offBoard - Issues from findOffBoardIssues
 * @param {object} options
 * @param {string} options.projectUrl - Project URL
 * @param {Array<string>} options.repositories - Repositories that were checked
 * @param {number} options.excluded - Count of excluded issues
 * @param {Date} [options.now] - Report time
 * @returns {string} Markdown body
 */
export function renderReport(offBoard, { projectUrl, repositories, excluded, now = new Date() }) {
  const lines = [
    REPORT_MARKER,
    `Open issues in the Core repos that aren't on [the project board](${projectUrl}).`,
    '',
    `_Updated ${now.toISOString()} by the scheduled report job. This issue is edited in place on every run._`,
    '',
  ];

  if (offBoard.length === 0) {
    lines.push('All open Core repo issues are on the board.');
  } else {
    lines.push(`**${offBoard.length}** open issue(s) not on the board:`);
    const byRepo = new Map();
    for (const issue of offBoard) {
      if (!byRepo.has(issue.repository)) byRepo.set(issue.repository, []);
      byRepo.get(issue.repository).push(issue);
    }
    for (const repo of [...byRepo.keys()].sort()) {
      lines.push('', `### ${repo}`, '');
      const repoIssues = byRepo.get(repo).sort((a, b) => a.number - b.number);
      for (const issue of repoIssues) {
        lines.push(`- ${issue.url} - opened ${issue.createdAt.slice(0, 10)}`);
      }
    }
  }

  lines.push(
    '',
    `<sub>Checked ${repositories.length} repositories from \`repository_scope\` in \`rules.yml\`. ` +
      `Skipped ${excluded} excluded issue(s) (ZAP reports, Dependency Dashboards).</sub>`,
    ''
  );
  return lines.join('\n');
}
