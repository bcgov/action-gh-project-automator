import test from 'node:test';
import assert from 'node:assert';
import { formatAccessSummary } from '../src/utils/summary.js';

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
  assert.match(md, /All configured organizations, repositories, and project boards are reachable/);
  assert.doesNotMatch(md, /Access Check Failed/);
});

test('formatAccessSummary returns empty string when access is empty or invalid', () => {
  assert.strictEqual(formatAccessSummary(null), '');
  assert.strictEqual(formatAccessSummary({ lines: [] }), '');
});
