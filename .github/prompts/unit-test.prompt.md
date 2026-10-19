# Create Unit Test(s)

Write unit tests for this repository.

- Use `node:test` and `node:assert` in ES modules; put suites in `test/` as `*.test.js`.
- Make no network calls: stub `globalThis.fetch` or inject dependencies. API helpers need a dummy `GITHUB_TOKEN` and no `DRY_RUN`; restore `fetch` and the environment in `finally`.
- Name each test for the behaviour it checks, and cover edge cases as well as the main path.
- For config behaviour, write a modified copy of the shipped `rules.yml` to a temp directory and load it with `loadBoardRules`, as `test/config-authority.test.js` does.
- Run `npm test` and `npm run lint` before finishing.

```js
import test from 'node:test';
import assert from 'node:assert';
import { assignUserToItem } from '../src/github/api.js';

test('assignUserToItem skips a repository-admin 403 without retrying', async () => {
  const saved = { token: process.env.GITHUB_TOKEN, dryRun: process.env.DRY_RUN };
  process.env.GITHUB_TOKEN = 'test-token';
  delete process.env.DRY_RUN;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: 'Must have admin rights to Repository.' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  try {
    assert.strictEqual(await assignUserToItem('org/repo', 1, 'someone'), 'skipped');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of [
      ['GITHUB_TOKEN', saved.token],
      ['DRY_RUN', saved.dryRun],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
```
