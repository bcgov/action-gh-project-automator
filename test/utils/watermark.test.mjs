import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getWatermark, saveWatermark } from '../../src/utils/watermark.js';

test('Watermark Utility - GHA Cache Integration', async (t) => {
  let mockCacheData = {};
  
  const mockCache = {
    restoreCache: async (paths, primaryKey, restoreKeys) => {
      const prefix = restoreKeys[0];
      if (mockCacheData[prefix]) {
        return `${prefix}restored-from-mock`;
      }
      return null;
    },
    saveCache: async (paths, key) => {
      // Extract prefix before the last dash
      const prefix = key.substring(0, key.lastIndexOf('-') + 1);
      mockCacheData[prefix] = 'mock-saved-data';
      return 42;
    }
  };

  const mockFs = {
    mkdtemp: async (prefix) => `/tmp/mock-dir-${prefix.replace(/[^a-zA-Z0-9]/g, '_')}`,
    writeFile: async () => {},
    readFile: async () => '2024-01-01T00:00:00.000Z',
    rm: async () => {}
  };

  const mockLog = {
    info: () => {},
    warning: () => {},
    error: () => {},
    debug: () => {}
  };

  await t.test('should return null when no watermark exists for project', async () => {
    mockCacheData = {};
    const watermark = await getWatermark('my-project', { cache: mockCache, fs: mockFs, log: mockLog });
    assert.strictEqual(watermark, null);
  });

  await t.test('should save and retrieve watermark via cache prefix', async () => {
    mockCacheData = {};
    const timestamp = '2024-01-01T12:00:00.000Z';
    await saveWatermark('my-project', timestamp, { cache: mockCache, fs: mockFs, log: mockLog });
    
    // The utility should find the saved watermark even though the key has a timestamp
    const watermark = await getWatermark('my-project', { cache: mockCache, fs: mockFs, log: mockLog });
    assert.strictEqual(watermark, '2024-01-01T00:00:00.000Z');
  });

  await t.test('should handle project ID sanitization correctly', async () => {
    mockCacheData = {};
    const timestamp = '2024-01-02T12:00:00.000Z';
    // Test with characters that must be sanitized for cache keys
    const specialProjectId = 'org/projects:123';
    await saveWatermark(specialProjectId, timestamp, { cache: mockCache, fs: mockFs, log: mockLog });
    
    const watermark = await getWatermark(specialProjectId, { cache: mockCache, fs: mockFs, log: mockLog });
    assert.strictEqual(watermark, '2024-01-01T00:00:00.000Z');
    
    // Verify prefix was sanitized (org_projects_123)
    const prefixes = Object.keys(mockCacheData);
    assert.ok(prefixes[0].includes('org_projects_123'), `Prefix ${prefixes[0]} should be sanitized`);
  });

  await t.test('should return null if restored timestamp is invalid', async () => {
    const corruptedFs = {
      ...mockFs,
      readFile: async () => 'not-a-valid-timestamp'
    };
    mockCacheData['project-sync-watermark-bad_data-'] = 'saved';
    
    const watermark = await getWatermark('bad-data', { cache: mockCache, fs: corruptedFs, log: mockLog });
    assert.strictEqual(watermark, null);
  });
});
