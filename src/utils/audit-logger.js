import fs from 'node:fs/promises';
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
    const reasonText = event.reason ? ` | Reason: ${event.reason}` : '';
    log.info(`[AUDIT] ${itemRef}: ${event.action} | ${event.from} -> ${event.to} (Rule: ${event.rule})${reasonText}`);
  }

  /**
   * Generate a Markdown summary for GHA
   * @param {Object} [stats]
   * @param {string} [stats.health] - 'GREEN', 'YELLOW', 'RED', 'BLACK'
   * @param {string} [stats.watermark] - The sync watermark found
   * @param {number} [stats.windowHours] - Fallback window hours if no watermark
   * @returns {string} Markdown content
   */
  generateSummary(stats = {}) {
    const durationSec = Math.round((new Date() - this.startTime) / 1000);
    const timeStr = new Date().toLocaleTimeString();

    let metaInfo = '';
    if (stats.watermark) {
      metaInfo += `**Sync Window: Gapless (since ${stats.watermark})**\n`;
    } else if (stats.windowHours) {
      metaInfo += `**Sync Window: ${stats.windowHours}h Sliding Window**\n`;
    }

    let healthIndicator = '';
    if (stats.health) {
      const emoji = {
        GREEN: '🟢',
        YELLOW: '🟡',
        RED: '🔴',
        BLACK: '💀',
        UNKNOWN: '⚪'
      }[stats.health] || '⚪';
      healthIndicator = `\n**API Health: ${emoji} ${stats.health}**\n`;
    }
    
    if (this.events.length === 0) {
      return `### ✅ Run Complete: No changes needed.\n${healthIndicator}\nAll items are currently perfectly aligned with board rules.\n\n*Completed at ${timeStr} (Duration: ${durationSec}s)*`;
    }

    let summary = `### 🤖 Automator Run Summary (${timeStr})\n\n`;
    summary += healthIndicator;
    summary += metaInfo;
    summary += `\n*Run Duration: ${durationSec}s*\n\n`;
    summary += '| Item | Action | Transition | Rule | Reason |\n';
    summary += '| :--- | :--- | :--- | :--- | :--- |\n';

    for (const e of this.events) {
      const segment = e.type === 'PullRequest' ? 'pull' : 'issues';
      const itemLink = `[${e.type} #${e.number}](https://github.com/${e.repo}/${segment}/${e.number})`;
      summary += `| ${itemLink} | **${e.action}** | \`${e.from}\` → \`${e.to}\` | ${e.rule} | ${e.reason || '-'} |\n`;
    }

    summary += `\n**Total Actions taken: ${this.events.length}**`;
    return summary;
  }

  /**
   * Write the summary to the GHA environment if available
   * @param {Object} [stats]
   */
  async pushToGhaSummary(stats = {}) {
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (!summaryPath) {
      log.debug('GITHUB_STEP_SUMMARY not set, skipping summary output.');
      return;
    }

    const markdown = this.generateSummary(stats);
    try {
      // Ensure leading newline to avoid concatenation issues
      await fs.appendFile(summaryPath, `\n${markdown}\n`);
      log.info('Successfully pushed audit summary to GitHub Actions.');
    } catch (error) {
      log.error(`Failed to write GHA summary: ${error.message}`);
    }
  }
}

export const auditLog = new AuditLogger();
