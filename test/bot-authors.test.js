import test from 'node:test';
import assert from 'node:assert';
import { loadBoardRules } from '../src/config/board-rules.js';
import { botOnlyPullRequestAuthor } from '../src/utils/exclusions.js';

const { exclusions } = loadBoardRules();

const commit = (login) => ({
  commit: { authors: { nodes: [{ user: login ? { login } : null }] } },
});
const pr = (author, commitLogins) => ({
  __typename: 'PullRequest',
  author,
  commits: { totalCount: commitLogins.length, nodes: commitLogins.map(commit) },
});
const renovate = { __typename: 'Bot', login: 'renovate' };

test('a Renovate PR with only bot commits is skipped', () => {
  assert.strictEqual(
    botOnlyPullRequestAuthor(pr(renovate, ['renovate[bot]', null]), exclusions),
    'renovate[bot]'
  );
  assert.strictEqual(
    botOnlyPullRequestAuthor(
      pr({ __typename: 'Bot', login: 'dependabot' }, ['dependabot[bot]']),
      exclusions
    ),
    'dependabot[bot]'
  );
});

test('a bot PR with a human commit is added or kept', () => {
  assert.strictEqual(
    botOnlyPullRequestAuthor(pr(renovate, ['renovate[bot]', 'DerekRoberts']), exclusions),
    null
  );
});

test('PRs by people, unlisted bots and issues are not affected', () => {
  assert.strictEqual(
    botOnlyPullRequestAuthor(pr({ __typename: 'User', login: 'renovate' }, []), exclusions),
    null
  );
  assert.strictEqual(
    botOnlyPullRequestAuthor(pr({ __typename: 'Bot', login: 'other' }, []), exclusions),
    null
  );
  assert.strictEqual(
    botOnlyPullRequestAuthor({ __typename: 'Issue', author: renovate }, exclusions),
    null
  );
});

test('an empty or absent list skips nothing', () => {
  assert.strictEqual(botOnlyPullRequestAuthor(pr(renovate, []), { exclude_bot_authors: [] }), null);
  assert.throws(() => botOnlyPullRequestAuthor(pr(renovate, []), {}), /exclude_bot_authors/);
});

test('a bot PR with more commits than fetched fails instead of guessing', () => {
  const item = pr(renovate, ['renovate[bot]']);
  item.commits.totalCount = 101;
  assert.throws(() => botOnlyPullRequestAuthor(item, exclusions), /human commits can't be checked/);
});
