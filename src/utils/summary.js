/**
 * Escape a value for safe use inside a Markdown table cell.
 * Pipes are escaped and newlines collapsed so columns stay intact.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeTableCell(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n|\r/g, ' ')
    .trim();
}

/**
 * Format one row of the main run summary table (Item | Title | Status | Result).
 * @param {{type: string, number: number, repo: string, title: string, status: string, action: string}} s
 * @returns {string} Markdown table row
 */
export function formatSummaryRow(s) {
  const icon = s.status === 'Success' ? '✅' : '❌';
  const item = `**${escapeTableCell(s.type)} #${escapeTableCell(s.number)}** (${escapeTableCell(s.repo)})`;
  return `| ${item} | ${escapeTableCell(s.title)} | ${icon} ${escapeTableCell(s.status)} | ${escapeTableCell(s.action)} |\n`;
}

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

  const parsed = access.lines.map((line) => {
    const match = line.match(/^(.+?)\s+via\s+([^:]+):\s+(.+)$/);
    return match ? { target: match[1], token: match[2], details: match[3] } : { raw: line };
  });
  const hasFailures = Array.isArray(access.failures) && access.failures.length > 0;
  const tokens = new Set(parsed.map((p) => p.token));
  const allOkSameToken =
    !hasFailures && tokens.size === 1 && parsed.every((p) => !p.raw && p.details === 'OK');

  let md = `### 🔑 Token & Repository Access Check\n\n`;

  if (allOkSameToken) {
    md += `> [!NOTE]\n> ✅ All ${parsed.length} configured organizations, repositories, and project boards are reachable with \`${escapeTableCell(parsed[0].token)}\`.\n`;
    return md;
  }

  md += `| Target | Token | Status | Details |\n`;
  md += `| :--- | :--- | :--- | :--- |\n`;

  for (const p of parsed) {
    if (p.raw === undefined) {
      const isOk = p.details === 'OK';
      const icon = isOk ? '✅ OK' : '❌ Failed';
      const detailText = isOk ? '-' : `**${escapeTableCell(p.details)}**`;
      md += `| ${escapeTableCell(p.target)} | \`${escapeTableCell(p.token)}\` | ${icon} | ${detailText} |\n`;
    } else {
      md += `| ${escapeTableCell(p.raw)} | - | - | - |\n`;
    }
  }

  if (hasFailures) {
    md += `\n> [!CAUTION]\n> **Access Check Failed**: One or more repositories or project boards are unreachable. Verify your token permissions and repository access.\n`;
  } else {
    md += `\n> [!NOTE]\n> All configured organizations, repositories, and project boards are reachable with the active token(s).\n`;
  }

  return md;
}
