import fs from 'node:fs';
import { log } from './log.js';

class AuditLogger {
  constructor() {
    this.events = [];
    this.startTime = new Date();
  }

  /**
   * Log a transition event
   * @param {Object} event
   * @param {string} event.type - e.g., 'PullRequest', 'Issue'
   * @param {number|string} event.number
   * @param {string} event.repo
   * @param {string} event.action - e.g., 'Move Column', 'Assign Sprint'
   * @param {string} event.from - Previous state
   * @param {string} event.to - New state
   * @param {string} event.rule - Rule name that triggered it
   * @param {string} [event.reason] - Human readable reason
   */
  logEvent(event) {
    this.events.push({
      ...event,
      timestamp: new Date()
    });
    
    // Also log to standard output for real-time visibility
    const itemRef = `${event.type} #${event.number} [${event.repo}]`;
    log.info(`[AUDIT] ${itemRef}: ${event.action} | ${event.from} -> ${event.to} (Rule: ${event.rule})`);
  }

  /**
   * Generate a Markdown summary for GHA
   * @returns {string} Markdown content
   */
  generateSummary() {
    if (this.events.length === 0) {
      return '### ✅ Run Complete: No changes needed.\nAll items are currently perfectly aligned with board rules.';
    }

    let summary = `### 🤖 Automator Run Summary (${new Date().toLocaleTimeString()})\n\n`;
    summary += '| Item | Action | Transition | Rule |\n';
    summary += '| :--- | :--- | :--- | :--- |\n';

    for (const e of this.events) {
      const itemLink = `[${e.type} #${e.number}](https://github.com/${e.repo}/issues/${e.number})`;
      summary += `| ${itemLink} | **${e.action}** | \`${e.from}\` → \`${e.to}\` | ${e.rule} |\n`;
    }

    summary += `\n**Total Actions taken: ${this.events.length}**`;
    return summary;
  }

  /**
   * Write the summary to the GHA environment if available
   */
  async pushToGhaSummary() {
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (!summaryPath) {
      log.debug('GITHUB_STEP_SUMMARY not set, skipping summary output.');
      return;
    }

    const markdown = this.generateSummary();
    try {
      fs.appendFileSync(summaryPath, markdown);
      log.info('Successfully pushed audit summary to GitHub Actions.');
    } catch (error) {
      log.error(`Failed to write GHA summary: ${error.message}`);
    }
  }
}

export const auditLog = new AuditLogger();
