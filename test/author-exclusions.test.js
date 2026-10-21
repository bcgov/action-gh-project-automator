import test from 'node:test';
import assert from 'node:assert';
import { loadBoardRules } from '../src/config/board-rules.js';
import { authorLogin, commitAuthorLogins, findExcludedAuthor } from '../src/utils/exclusions.js';

const { exclusions } = loadBoardRules();
const off = { authors: [], unless_review_requested: false, unless_human_commit: false };
const bots = {
  authors: ['renovate[bot]', 'dependabot[bot]'],
  unless_review_requested: false,
  unless_human_commit: true,
};
const botOnly = ['renovate[bot]'];

test('authorLogin adds the [bot] suffix only for bots', () => {
  assert.strictEqual(authorLogin({ __typename: 'Bot', login: 'renovate' }), 'renovate[bot]');
  assert.strictEqual(authorLogin({ __typename: 'User', login: 'renovate' }), 'renovate');
  assert.strictEqual(authorLogin(null), null);
});

test('commitAuthorLogins lists unique linked commit authors', () => {
  const item = {
    commits: {
      nodes: [
        { commit: { authors: { nodes: [{ user: { login: 'renovate[bot]' } }] } } },
        { commit: { authors: { nodes: [{ user: null }, { user: { login: 'DerekRoberts' } }] } } },
        { commit: { authors: { nodes: [{ user: { login: 'renovate[bot]' } }] } } },
      ],
    },
  };
  assert.deepStrictEqual(commitAuthorLogins(item), ['renovate[bot]', 'DerekRoberts']);
  assert.deepStrictEqual(commitAuthorLogins({}), []);
});

test('listed authors are excluded, ignoring case', () => {
  for (const author of [
    'renovate[bot]',
    'Dependabot[bot]',
    'mend-bolt-for-github[bot]',
    'mend-for-github-com[bot]',
  ]) {
    assert.strictEqual(
      findExcludedAuthor({ author, isReviewRequested: false, commitAuthors: [author] }, exclusions),
      author
    );
  }
});

test('shipped rules keep a bot PR with a review request excluded', () => {
  const item = { author: 'renovate[bot]', isReviewRequested: true, commitAuthors: botOnly };
  assert.strictEqual(findExcludedAuthor(item, exclusions), 'renovate[bot]');
});

test('unless_review_requested keeps a PR that requests review from a monitored user', () => {
  const item = { author: 'renovate[bot]', isReviewRequested: true, commitAuthors: botOnly };
  assert.strictEqual(
    findExcludedAuthor(item, { ...off, authors: ['renovate[bot]'], unless_review_requested: true }),
    null
  );
  assert.strictEqual(
    findExcludedAuthor(item, { ...off, authors: ['renovate[bot]'] }),
    'renovate[bot]'
  );
});

test('unless_human_commit keeps a bot PR that a person pushed to', () => {
  const item = {
    author: 'renovate[bot]',
    isReviewRequested: false,
    commitAuthors: ['renovate[bot]', 'DerekRoberts'],
  };
  assert.strictEqual(findExcludedAuthor(item, exclusions), null);
  assert.strictEqual(findExcludedAuthor(item, bots), null);
  assert.strictEqual(
    findExcludedAuthor(item, { ...bots, unless_human_commit: false }),
    'renovate[bot]'
  );
});

test('unless_human_commit ignores commits by bots and listed authors', () => {
  const item = {
    author: 'renovate[bot]',
    isReviewRequested: false,
    commitAuthors: ['renovate[bot]', 'dependabot[bot]', 'github-actions[bot]'],
  };
  assert.strictEqual(findExcludedAuthor(item, bots), 'renovate[bot]');
});

test('people and github-actions[bot] are not excluded by the shipped rules', () => {
  for (const author of ['github-actions[bot]', 'DerekRoberts', null]) {
    assert.strictEqual(
      findExcludedAuthor({ author, isReviewRequested: false, commitAuthors: [] }, exclusions),
      null
    );
    assert.strictEqual(
      findExcludedAuthor({ author, isReviewRequested: true, commitAuthors: botOnly }, exclusions),
      null
    );
  }
});

test('shipped exclusion settings, and all three are required', () => {
  const rules = loadBoardRules();
  assert.ok(rules.exclusions.authors.length > 0);
  assert.strictEqual(rules.exclusions.unless_review_requested, false);
  assert.strictEqual(rules.exclusions.unless_human_commit, true);
  assert.strictEqual(
    findExcludedAuthor({ author: 'renovate[bot]', isReviewRequested: false, commitAuthors: [] }, off),
    null
  );
  assert.throws(
    () => findExcludedAuthor({ author: 'x', isReviewRequested: false, commitAuthors: [] }, {}),
    /required/
  );
  assert.throws(
    () =>
      findExcludedAuthor(
        { author: 'x', isReviewRequested: false, commitAuthors: [] },
        { authors: [], unless_review_requested: false }
      ),
    /required/
  );
  assert.throws(
    () => findExcludedAuthor({ author: 'x', isReviewRequested: false }, off),
    /commitAuthors/
  );
});
