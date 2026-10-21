import test from 'node:test';
import assert from 'node:assert';
import { loadBoardRules } from '../src/config/board-rules.js';
import { authorLogin, commitAuthorLogins, findExcludedAuthor } from '../src/utils/exclusions.js';

const { exclusions } = loadBoardRules();
const off = { authors: [], unless_review_requested: false, unless_human_commit: false };

test('authorLogin adds the [bot] suffix only for bots', () => {
  assert.strictEqual(authorLogin({ __typename: 'Bot', login: 'renovate' }), 'renovate[bot]');
  assert.strictEqual(authorLogin({ __typename: 'User', login: 'renovate' }), 'renovate');
  assert.strictEqual(authorLogin(null), null);
});

test('listed authors are excluded, ignoring case', () => {
  for (const author of [
    'renovate[bot]',
    'Dependabot[bot]',
    'mend-bolt-for-github[bot]',
    'mend-for-github-com[bot]',
  ]) {
    assert.strictEqual(
      findExcludedAuthor({ author, isReviewRequested: false }, exclusions),
      author
    );
  }
});

test('unless_review_requested keeps a PR that requests review from a monitored user', () => {
  const item = { author: 'renovate[bot]', isReviewRequested: true };
  assert.strictEqual(
    findExcludedAuthor(item, { ...exclusions, unless_review_requested: true }),
    null
  );
  assert.strictEqual(
    findExcludedAuthor(item, {
      authors: ['renovate[bot]'],
      unless_review_requested: false,
      unless_human_commit: false,
    }),
    'renovate[bot]'
  );
});

test('github-actions[bot] and people are not excluded by the shipped rules', () => {
  for (const author of ['github-actions[bot]', 'DerekRoberts', null]) {
    assert.strictEqual(findExcludedAuthor({ author, isReviewRequested: false }, exclusions), null);
  }
});

test('both settings default to off', () => {
  const rules = loadBoardRules();
  assert.ok(rules.exclusions.authors.length > 0);
  assert.strictEqual(
    findExcludedAuthor({ author: 'renovate[bot]', isReviewRequested: false }, off),
    null
  );
  assert.throws(
    () => findExcludedAuthor({ author: 'x', isReviewRequested: false }, {}),
    /required/
  );
});

test('shipped rules: a bot PR that requests review is still excluded', () => {
  const item = {
    author: 'renovate[bot]',
    isReviewRequested: true,
    commitAuthors: ['renovate[bot]'],
  };
  assert.strictEqual(findExcludedAuthor(item, exclusions), 'renovate[bot]');
});

test('shipped rules: a bot PR with a human commit is added', () => {
  const item = {
    author: 'renovate[bot]',
    isReviewRequested: false,
    commitAuthors: ['renovate[bot]', 'DerekRoberts'],
  };
  assert.strictEqual(findExcludedAuthor(item, exclusions), null);
});

test('shipped rules: bot commit authors do not count as human', () => {
  for (const commitAuthors of [['renovate[bot]'], ['dependabot[bot]', 'github-actions[bot]']]) {
    assert.strictEqual(
      findExcludedAuthor(
        { author: 'dependabot[bot]', isReviewRequested: false, commitAuthors },
        exclusions
      ),
      'dependabot[bot]'
    );
  }
});

test('shipped rules: a missing or empty commits list stays excluded', () => {
  for (const commitAuthors of [undefined, []]) {
    assert.strictEqual(
      findExcludedAuthor(
        { author: 'renovate[bot]', isReviewRequested: false, commitAuthors },
        exclusions
      ),
      'renovate[bot]'
    );
  }
  assert.deepStrictEqual(commitAuthorLogins({}), []);
  assert.deepStrictEqual(commitAuthorLogins({ commits: { nodes: [] } }), []);
});

test('shipped rules: a human PR is unaffected', () => {
  for (const commitAuthors of [undefined, [], ['renovate[bot]']]) {
    assert.strictEqual(
      findExcludedAuthor(
        { author: 'DerekRoberts', isReviewRequested: false, commitAuthors },
        exclusions
      ),
      null
    );
  }
});

test('commitAuthorLogins reads logins and skips commits without a linked user', () => {
  const item = {
    commits: {
      nodes: [
        { commit: { authors: { nodes: [{ user: { login: 'renovate[bot]' } }] } } },
        { commit: { authors: { nodes: [{ user: null }, { user: { login: 'DerekRoberts' } }] } } },
      ],
    },
  };
  assert.deepStrictEqual(commitAuthorLogins(item), ['renovate[bot]', 'DerekRoberts']);
});
