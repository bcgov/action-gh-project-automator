import * as core from '@actions/core';
import { loadBoardRules } from '../config/board-rules.js';
import { getProjectId } from '../github/api.js';
import { addLabel, removeLabel, searchPullRequests } from './github.js';
import { staleLabelAction } from './rules.js';

async function run() {
  try {
    const config = loadBoardRules({ monitoredUser: 'DerekRoberts' });
    const settings = config.stale_drafts;
    if (!settings) throw new Error('stale_drafts is not configured in rules.yml');

    const projectId = await getProjectId(config.project.url);
    if (!projectId) throw new Error(`Failed to resolve Project ID from URL: ${config.project.url}`);

    // Open drafts that may need the label, plus anything already labelled that may need it removed
    const byId = new Map();
    for (const author of settings.authors) {
      for (const query of [
        `is:pr is:open draft:true author:${author} archived:false`,
        `is:pr is:open label:${settings.label} author:${author} archived:false`,
      ]) {
        for (const pr of await searchPullRequests(query)) byId.set(pr.id, pr);
      }
    }

    const dryRun = process.env.DRY_RUN === 'true';
    let failures = 0;
    for (const pr of byId.values()) {
      const action = staleLabelAction(pr, { settings, projectId });
      if (!action) continue;
      const what = `${action === 'add' ? 'Add' : 'Remove'} "${settings.label}" on ${pr.url}`;
      if (dryRun) {
        core.info(`[DRY RUN] ${what}`);
        continue;
      }
      try {
        await (action === 'add' ? addLabel(pr, settings.label) : removeLabel(pr, settings.label));
        core.info(what);
      } catch (err) {
        failures++;
        core.warning(`${what} failed: ${err.message}`);
      }
    }
    core.info(`Checked ${byId.size} pull request(s).`);
    if (failures > 0) core.setFailed(`${failures} label update(s) failed.`);
  } catch (error) {
    core.setFailed(`Stale draft check failed: ${error.message}`);
  }
}

run();
