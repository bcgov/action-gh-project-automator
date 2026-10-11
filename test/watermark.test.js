import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getWatermark, saveWatermark, watermarkDir } from '../src/utils/watermark.js';

const quiet = { info() {}, warning() {}, error() {}, debug() {} };

/**
 * Fake of @actions/cache that behaves like the real one: an entry only matches when the
 * restore paths equal the saved paths, and a prefix restore key returns the newest entry.
 */
function fakeCache() {
  const entries = [];
  return {
    entries,
    async saveCache(paths, key) {
      const files = {};
      for (const dir of paths) {
        for (const name of await fs.readdir(dir)) {
          files[path.join(dir, name)] = await fs.readFile(path.join(dir, name), 'utf8');
        }
      }
      entries.push({ paths: [...paths], key, files });
      return 1;
    },
    async restoreCache(paths, primaryKey, restoreKeys = []) {
      const samePaths = entries.filter((e) => JSON.stringify(e.paths) === JSON.stringify(paths));
      const match =
        samePaths.find((e) => e.key === primaryKey) ||
        samePaths.filter((e) => restoreKeys.some((k) => e.key.startsWith(k))).pop();
      if (!match) return undefined;
      for (const [file, content] of Object.entries(match.files)) {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, content);
      }
      return match.key;
    },
  };
}

const projectId = 'PVT_test/project';

test('watermarkDir is fixed for a project and differs between projects', () => {
  assert.strictEqual(watermarkDir(projectId), watermarkDir(projectId));
  assert.notStrictEqual(watermarkDir(projectId), watermarkDir('PVT_other'));
  assert.ok(!/[^a-zA-Z0-9_-]/.test(path.basename(watermarkDir(projectId))));
});

test('a saved watermark is restored by the next run', async () => {
  const cache = fakeCache();
  const overrides = { cache, log: quiet };
  assert.strictEqual(await getWatermark(projectId, overrides), null);

  await saveWatermark(projectId, '2026-10-11T18:00:00.000Z', overrides);
  assert.strictEqual(await getWatermark(projectId, overrides), '2026-10-11T18:00:00.000Z');
  assert.deepStrictEqual(cache.entries[0].paths, [watermarkDir(projectId)]);
});

test('the newest watermark wins', async () => {
  const cache = fakeCache();
  const overrides = { cache, log: quiet };
  await saveWatermark(projectId, '2026-10-11T17:00:00.000Z', overrides);
  await new Promise((r) => setTimeout(r, 5)); // keys carry Date.now()
  await saveWatermark(projectId, '2026-10-11T18:00:00.000Z', overrides);
  assert.strictEqual(await getWatermark(projectId, overrides), '2026-10-11T18:00:00.000Z');
});

test('a stale file in the folder is not mistaken for a restored watermark', async () => {
  const cache = fakeCache();
  await fs.mkdir(watermarkDir(projectId), { recursive: true });
  await fs.writeFile(path.join(watermarkDir(projectId), 'last_sync_timestamp.txt'), 'stale');
  assert.strictEqual(await getWatermark(projectId, { cache, log: quiet }), null);
});
