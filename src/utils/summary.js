/**
 * Success and failure counts for the job summary.
 * @param {Array<{status: string}>} report - One entry per processed item
 * @returns {string} Markdown
 */
export function formatResultCounts(report) {
  const failed = report.filter((s) => s.status === 'Failed').length;
  const succeeded = report.length - failed;
  return `\n**Items:** ${succeeded} succeeded, ${failed} failed\n`;
}

/**
 * Render access check lines into a GitHub Step Summary Markdown table.
 * @param {{lines: Array<string>, failures: Array<string>}} access
 * @returns {string} Markdown table
 */
export function formatAccessSummary(access) {
  if (!access || !Array.isArray(access.lines) || access.lines.length === 0) {
    return '';
  }

  let md = `### 🔑 Token & Repository Access Check\n\n`;
  md += `| Target | Token | Status | Details |\n`;
  md += `| :--- | :--- | :--- | :--- |\n`;

  for (const line of access.lines) {
    const match = line.match(/^(.+?)\s+via\s+([^:]+):\s+(.+)$/);
    if (match) {
      const [, target, token, details] = match;
      const isOk = details === 'OK';
      const icon = isOk ? '✅ OK' : '❌ Failed';
      const detailText = isOk ? '-' : `**${details}**`;
      md += `| ${target} | \`${token}\` | ${icon} | ${detailText} |\n`;
    } else {
      md += `| ${line} | - | - | - |\n`;
    }
  }

  if (access.failures && access.failures.length > 0) {
    md += `\n> [!CAUTION]\n> **Access Check Failed**: One or more repositories or project boards are unreachable. Verify your token permissions and repository access.\n`;
  } else {
    md += `\n> [!NOTE]\n> All configured organizations, repositories, and project boards are reachable with the active token(s).\n`;
  }

  return md;
}
