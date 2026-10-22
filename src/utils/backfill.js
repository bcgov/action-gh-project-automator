import { determineTargetColumn } from './column-assignment.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Parse the `backfill` workflow input.
 * @param {string|undefined|null} raw - '' (normal run), 'all', or a window like '30d'
 * @returns {null | { all: true } | { days: number }}
 * @throws {Error} When the value isn't empty, 'all' or '<days>d'
 */
export function parseBackfill(raw) {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === '') return null;
  if (value === 'all') return { all: true };
  const match = value.match(/^(\d+)d$/);
  if (match && parseInt(match[1], 10) > 0) return { days: parseInt(match[1], 10) };
  throw new Error(`Invalid backfill "${raw}": use a window like "30d", "all", or leave it empty.`);
}

/**
 * Updated-since cutoff for a backfill run. The watermark is ignored.
 * @param {{ all: true } | { days: number }} backfill - From parseBackfill
 * @param {Date} [now]
 * @returns {string|null} ISO timestamp, or null for no updated-since filter
 */
export function backfillSince(backfill, now = new Date()) {
  if (backfill.all) return null;
  return new Date(now.getTime() - backfill.days * DAY_MS).toISOString();
}

/**
 * What a backfill run does with one item: items already on the board are left alone
 * (not re-added or moved); missing items are added in the column the normal sync would
 * pick for an item with no Status (backfill only finds open items).
 * @param {object|null} board - The item's board state (null when it isn't on the board)
 * @param {object} policy - `board_columns` from rules.yml
 * @param {{ itemType: string, draft: boolean, authored: boolean }} item
 * @returns {{ action: 'skip', projectItemId: string } | { action: 'add', column: string }}
 */
export function planBackfillItem(board, policy, { itemType, draft, authored }) {
  if (board) return { action: 'skip', projectItemId: board.projectItemId };
  const column = determineTargetColumn(itemType, false, null, { draft, authored, policy });
  return { action: 'add', column };
}

/**
 * Only a normal run with no failures moves the watermark. A backfill run never saves it,
 * so it can't move it backwards or skip a normal run's window.
 * @param {{ backfill: object|null, hasFailure: boolean }} run
 * @returns {boolean}
 */
export function shouldSaveWatermark({ backfill, hasFailure }) {
  return !backfill && !hasFailure;
}
