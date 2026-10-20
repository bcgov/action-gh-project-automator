import test from 'node:test';
import assert from 'node:assert';
import { loadBoardRules } from '../src/config/board-rules.js';
import { authorLogin, findExcludedAuthor } from '../src/utils/exclusions.js';

const { exclusions } = loadBoardRules();
const off = { authors: [], unless_review_requested: false };

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
  assert.strictEqual(findExcludedAuthor(item, exclusions), null);
  assert.strictEqual(
    findExcludedAuthor(item, { authors: ['renovate[bot]'], unless_review_requested: false }),
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
