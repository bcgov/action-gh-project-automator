import test from 'node:test';
import assert from 'node:assert';
import { formatAccessSummary, formatSummaryRow, escapeTableCell } from '../src/utils/summary.js';

test('formatAccessSummary renders OK and Failed rows with Markdown formatting', () => {
  const access = {
    lines: [
      'project bcgov/16 via default: OK',
      'org bcgov via default: OK',
      'repo bcgov/actions via default: OK',
      'repo bcgov/unreadable via default: cannot read; needs Issues: Read and Pull requests: Read',
    ],
    failures: [
      'repo bcgov/unreadable via default: cannot read; needs Issues: Read and Pull requests: Read',
    ],
  };

  const md = formatAccessSummary(access);
  assert.match(md, /### 🔑 Token & Repository Access Check/);
  assert.match(md, /\| project bcgov\/16 \| `default` \| ✅ OK \| - \|/);
  assert.match(
    md,
    /\| repo bcgov\/unreadable \| `default` \| ❌ Failed \| \*\*cannot read; needs Issues: Read and Pull requests: Read\*\* \|/
  );
  assert.match(md, /Access Check Failed/);
});

test('formatAccessSummary renders success note when there are no failures', () => {
  const access = {
    lines: ['project bcgov/16 via default: OK', 'repo bcgov/actions via default: OK'],
    failures: [],
  };

  const md = formatAccessSummary(access);
  assert.match(
    md,
    /All 2 configured organizations, repositories, and project boards are reachable with `default`/
  );
  assert.doesNotMatch(md, /Access Check Failed/);
  assert.doesNotMatch(md, /\| Target \| Token \|/);
  assert.doesNotMatch(md, /\| :--- /);
});

test('formatAccessSummary returns empty string when access is empty or invalid', () => {
  assert.strictEqual(formatAccessSummary(null), '');
  assert.strictEqual(formatAccessSummary({ lines: [] }), '');
});

test('formatAccessSummary keeps table when all OK but tokens differ', () => {
  const access = {
    lines: ['project bcgov/16 via default: OK', 'repo other/x via other_org: OK'],
    failures: [],
  };
  const md = formatAccessSummary(access);
  assert.match(md, /\| Target \| Token \| Status \| Details \|/);
  assert.match(md, /\| repo other\/x \| `other_org` \| ✅ OK \| - \|/);
});

/** Split a Markdown row on unescaped pipes. */
function cells(row) {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/);
}

test('formatSummaryRow keeps four columns when title contains pipes and newlines', () => {
  for (const status of ['Success', 'Failed']) {
    const row = formatSummaryRow({
      type: 'PullRequest',
      number: 429,
      repo: 'bcgov/nr-hydrometric-rating-curve',
      title: 'fix: unsafe |safe in templates | more\nline two',
      status,
      action: 'Moved to Active',
    });
    const c = cells(row);
    assert.strictEqual(c.length, 4, row);
    assert.match(c[1], /unsafe \\\|safe in templates \\\| more line two/);
    assert.strictEqual(c[2].trim(), `${status === 'Success' ? '✅' : '❌'} ${status}`);
    assert.strictEqual(c[3].trim(), 'Moved to Active');
    assert.ok(!row.slice(0, -1).includes('\n'));
  }
});

test('escapeTableCell handles nullish and backslashes', () => {
  assert.strictEqual(escapeTableCell(null), '');
  assert.strictEqual(escapeTableCell('a\\|b'), 'a\\\\\\|b');
});
