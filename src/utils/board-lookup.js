import { boardState } from './board-state.js';

/**
 * Lowercased owner of an `owner/repo` name.
 * @param {string} nameWithOwner
 * @returns {string}
 */
export function repoOwner(nameWithOwner) {
  return String(nameWithOwner || '')
    .split('/')[0]
    .toLowerCase();
}

/**
 * Lowercased owner login from a project URL like https://github.com/orgs/<org>/projects/<n>.
 * @param {string} projectUrl
 * @returns {string}
 */
export function projectOwnerFromUrl(projectUrl) {
  const match = String(projectUrl).match(/github\.com\/(?:orgs|users)\/([^/]+)\/projects\//);
  if (!match) throw new Error(`Cannot read the project owner from ${projectUrl}`);
  return match[1].toLowerCase();
}

/**
 * Board membership, column and sprint for any item.
 *
 * An issue or PR only lists the projects owned by its own repo's owner in `projectItems`, so a
 * bcgov-c item never shows a bcgov project there. For items in another owner's repos, the board's
 * item list is fetched from the project side, once per run and only when such an item shows up.
 * Same-owner items keep using the `projectItems` from their search result.
 *
 * @param {object} options
 * @param {string} options.projectId
 * @param {string} options.projectOwner - Lowercased project owner login
 * @param {() => Promise<{ items: Map<string, object>, calls: number }>} options.fetchBoardItems
 *   Content node id -> { projectItemId, column, sprint }, and the API calls it took
 */
export function createBoardLookup({ projectId, projectOwner, fetchBoardItems }) {
  const stats = { fetches: 0, calls: 0, items: 0 };
  let pending = null;

  function isCrossOrg(nameWithOwner) {
    return repoOwner(nameWithOwner) !== projectOwner;
  }

  function boardItems() {
    if (!pending) {
      stats.fetches++;
      pending = fetchBoardItems().then(({ items, calls }) => {
        stats.calls = calls;
        stats.items = items.size;
        return items;
      });
    }
    return pending;
  }

  /**
   * @param {object} node - Issue or PR with `id` (and `projectItems` for same-owner items)
   * @param {string} nameWithOwner - The node's repository
   * @returns {Promise<{ projectItemId: string, column: string|null, sprint: object|null } | null>}
   */
  async function stateFor(node, nameWithOwner) {
    if (!isCrossOrg(nameWithOwner)) return boardState(node, projectId);
    const items = await boardItems();
    return items.get(node.id) || null;
  }

  return { stats, isCrossOrg, stateFor };
}

/**
 * Status to set after adding an item. addProjectV2ItemById returns the existing item when the
 * content is already on the board, so the add only sets the no-status column when it has none.
 * @param {{ column: string|null }|null} existing - The item's state right after the add
 * @param {string} noStatusColumn - `board_columns.issue.no_status` (New)
 * @returns {string|null} Column to set, or null to leave Status alone
 */
export function columnAfterAdd(existing, noStatusColumn) {
  return existing?.column ? null : noStatusColumn;
}

/**
 * Job summary line for the board item list fetch.
 * @param {{ fetches: number, calls: number, items: number }} stats
 * @returns {string}
 */
export function formatBoardFetch(stats) {
  if (!stats.fetches) return '\n**Board item list:** not fetched (no cross-org items)\n';
  return `\n**Board item list:** fetched for cross-org items (${stats.calls} calls, ${stats.items} items)\n`;
}
