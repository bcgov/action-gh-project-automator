import * as core from '@actions/core';
import { getClients } from '../github/api.js';

/**
 * List open issues in a repository with the projects they belong to.
 * @param {string} nameWithOwner - e.g. bcgov/actions
 * @returns {Promise<Array<object>>}
 */
export async function listOpenIssues(nameWithOwner) {
  const { graphql } = getClients();
  const [owner, name] = nameWithOwner.split('/');
  const issues = [];
  let cursor = null;
  for (let page = 0; page < 20; page++) {
    const result = await graphql(
      `
        query ($owner: String!, $name: String!, $cursor: String) {
          repository(owner: $owner, name: $name) {
            isArchived
            issues(states: OPEN, first: 100, after: $cursor) {
              nodes {
                number
                title
                url
                createdAt
                labels(first: 20) {
                  nodes {
                    name
                  }
                }
                projectItems(first: 20, includeArchived: true) {
                  nodes {
                    project {
                      id
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `,
      { owner, name, cursor }
    );
    const repo = result.repository;
    if (!repo || repo.isArchived) {
      core.info(`Skipping ${nameWithOwner}: missing or archived.`);
      return [];
    }
    for (const node of repo.issues.nodes) {
      issues.push({
        number: node.number,
        title: node.title,
        url: node.url,
        createdAt: node.createdAt,
        repository: nameWithOwner,
        labels: node.labels.nodes.map((l) => l.name),
        projectIds: node.projectItems.nodes.map((i) => i.project?.id).filter(Boolean),
      });
    }
    if (!repo.issues.pageInfo.hasNextPage) break;
    cursor = repo.issues.pageInfo.endCursor;
  }
  return issues;
}

/**
 * Find the report issue by label, open first, then closed.
 * @returns {Promise<object|null>}
 */
export async function findReportIssue(owner, repo, label) {
  const { octokit } = getClients();
  for (const state of ['open', 'closed']) {
    const { data } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      labels: label,
      state,
      per_page: 10,
      sort: 'created',
      direction: 'asc',
    });
    const issue = data.find((i) => !i.pull_request);
    if (issue) return issue;
  }
  return null;
}

/**
 * Edit the existing report issue, or create and pin it on the very first run.
 * @returns {Promise<string>} Report issue URL
 */
export async function upsertReportIssue({ owner, repo, label, title, body }) {
  const { octokit, graphql } = getClients();
  const existing = await findReportIssue(owner, repo, label);
  if (existing) {
    if (existing.body === body && existing.state === 'open') return existing.html_url;
    await octokit.rest.issues.update({
      owner,
      repo,
      issue_number: existing.number,
      body,
      state: 'open',
    });
    return existing.html_url;
  }

  const { data: created } = await octokit.rest.issues.create({
    owner,
    repo,
    title,
    body,
    labels: [label],
  });
  try {
    await graphql(
      `
        mutation ($issueId: ID!) {
          pinIssue(input: { issueId: $issueId }) {
            issue {
              number
            }
          }
        }
      `,
      { issueId: created.node_id }
    );
  } catch (err) {
    core.warning(`Created report issue #${created.number} but could not pin it: ${err.message}`);
  }
  return created.html_url;
}
