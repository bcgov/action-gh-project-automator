import { getClients } from '../github/api.js';

const PR_FIELDS = `
  ... on PullRequest {
    id number url state isDraft createdAt
    repository { nameWithOwner }
    author { login }
    labels(first: 50) { nodes { name } }
    projectItems(first: 20) { nodes { project { id } } }
    commits(last: 1) { nodes { commit { committedDate } } }
    comments(last: 1) { nodes { createdAt } }
    reviews(last: 1) { nodes { submittedAt } }
    timelineItems(
      last: 1
      itemTypes: [CONVERT_TO_DRAFT_EVENT, REOPENED_EVENT, RENAMED_TITLE_EVENT, HEAD_REF_FORCE_PUSHED_EVENT]
    ) {
      nodes {
        ... on ConvertToDraftEvent { createdAt }
        ... on ReopenedEvent { createdAt }
        ... on RenamedTitleEvent { createdAt }
        ... on HeadRefForcePushedEvent { createdAt }
      }
    }
  }
`;

function toPullRequest(node) {
  return {
    id: node.id,
    number: node.number,
    url: node.url,
    repository: node.repository.nameWithOwner,
    state: node.state,
    isDraft: node.isDraft,
    author: node.author?.login,
    labels: node.labels.nodes.map((l) => l.name),
    projectIds: node.projectItems.nodes.map((i) => i.project?.id).filter(Boolean),
    createdAt: node.createdAt,
    lastCommitAt: node.commits.nodes[0]?.commit?.committedDate,
    lastCommentAt: node.comments.nodes[0]?.createdAt,
    lastReviewAt: node.reviews.nodes[0]?.submittedAt,
    lastEventAt: node.timelineItems.nodes[0]?.createdAt,
  };
}

/**
 * Search pull requests, following pagination.
 * @param {string} searchQuery - GitHub search query
 * @returns {Promise<Array<object>>}
 */
export async function searchPullRequests(searchQuery) {
  const { graphql } = getClients();
  const results = [];
  let cursor = null;
  for (let page = 0; page < 10; page++) {
    const data = await graphql(
      `
        query ($searchQuery: String!, $cursor: String) {
          search(query: $searchQuery, type: ISSUE, first: 50, after: $cursor) {
            nodes { ${PR_FIELDS} }
            pageInfo { hasNextPage endCursor }
          }
        }
      `,
      { searchQuery, cursor }
    );
    results.push(...data.search.nodes.filter((n) => n?.id).map(toPullRequest));
    if (!data.search.pageInfo.hasNextPage) break;
    cursor = data.search.pageInfo.endCursor;
  }
  return results;
}

export async function addLabel(pr, label) {
  const { octokit } = getClients();
  const [owner, repo] = pr.repository.split('/');
  await octokit.rest.issues.addLabels({ owner, repo, issue_number: pr.number, labels: [label] });
}

export async function removeLabel(pr, label) {
  const { octokit } = getClients();
  const [owner, repo] = pr.repository.split('/');
  await octokit.rest.issues.removeLabel({ owner, repo, issue_number: pr.number, name: label });
}
