import fs from 'fs/promises';
import { log } from './log.js';

function mapAssignees(list) {
  if (!Array.isArray(list)) {
    return { nodes: [] };
  }
  return {
    nodes: list
      .filter(Boolean)
      .map(assignee => ({ login: assignee.login }))
  };
}

function buildRepository(repository) {
  if (repository?.full_name) {
    return { nameWithOwner: repository.full_name };
  }
  if (repository?.nameWithOwner) {
    return { nameWithOwner: repository.nameWithOwner };
  }
  return { nameWithOwner: 'unknown/unknown' };
}

function fromPullRequest(payload) {
  if (!payload?.pull_request) return null;
  const { pull_request: pr, repository } = payload;
  return {
    __typename: 'PullRequest',
    id: pr.node_id || pr.id || null,
    number: pr.number,
    repository: buildRepository(repository),
    author: pr.user ? { login: pr.user.login } : null,
    assignees: mapAssignees(pr.assignees),
    state: pr.state,
    updatedAt: pr.updated_at,
    url: pr.html_url
  };
}

function fromIssues(payload) {
  if (!payload?.issue) return null;
  const { issue, repository } = payload;
  return {
    __typename: 'Issue',
    id: issue.node_id || issue.id || null,
    number: issue.number,
    repository: buildRepository(repository),
    author: issue.user ? { login: issue.user.login } : null,
    assignees: mapAssignees(issue.assignees),
    state: issue.state,
    updatedAt: issue.updated_at,
    url: issue.html_url
  };
}

const eventTransformers = {
  pull_request: fromPullRequest,
  pull_request_target: fromPullRequest,
  issues: fromIssues,
  issue_comment: fromIssues
};

/**
 * Load relevant items from the GitHub Actions event payload.
 * Returns an array of pseudo-GraphQL nodes compatible with rule processors.
 *
 * @param {string} eventName
 * @param {string} eventPath
 * @returns {Promise<Array<Object>>}
 */
export async function loadEventItems(eventName, eventPath) {
  if (!eventName || !eventPath) {
    return [];
  }

  const transformer = eventTransformers[eventName];
  if (!transformer) {
    return [];
  }

  try {
    const raw = await fs.readFile(eventPath, 'utf8');
    const payload = JSON.parse(raw);
    const item = transformer(payload);
    if (!item || !item.id) {
      log.debug(`Event payload for ${eventName} did not yield a usable item.`);
      return [];
    }
    return [item];
  } catch (error) {
    log.warning(`Failed to load event payload items: ${error.message}`);
    return [];
  }
}

