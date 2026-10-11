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
