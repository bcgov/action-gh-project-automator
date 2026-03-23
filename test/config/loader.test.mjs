import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import ConfigLoader from '../../src/config/loader.js';
import { loadBoardRules } from '../../src/config/board-rules.js';

test('ConfigLoader', async (t) => {
    await t.test('loads valid config from rules.yml', async () => {
      const loader = new ConfigLoader();
      const __filename = new URL(import.meta.url).pathname;
      const __dirname = __filename.substring(0, __filename.lastIndexOf('/'));
      const repoRoot = path.resolve(__dirname, '../..');
      const configPath = path.join(repoRoot, 'rules.yml');
      // Ensure downstream loaders use the same config resolution during this test
      process.env.CONFIG_FILE = configPath;
      const config = loader.load(configPath);

      // Basic structure checks - no version field in new structure
      assert.ok(config.project, 'has project section');
      assert.ok(config.automation, 'has automation section');
      assert.ok(config.technical, 'has technical section');

      // Project settings: prefer URL-based configuration which we resolve at runtime
      assert.equal(
        config.project.url,
        'https://github.com/orgs/bcgov/projects/16',
        'correct project URL'
      );

      // Automation structure
      assert.ok(config.automation.user_scope, 'has user_scope');
      assert.ok(config.automation.user_scope.monitored_users, 'has monitored_users');
      assert.ok(Array.isArray(config.automation.user_scope.monitored_users), 'monitored_users is an array');
      assert.ok(config.automation.user_scope.monitored_users.length > 0, 'has at least one monitored user');
      assert.ok(config.automation.user_scope.monitored_users.includes('DerekRoberts'), 'includes DerekRoberts');
      assert.ok(config.automation.repository_scope, 'has repository_scope');
      // Organization field is optional now (deprecated but still supported for backward compatibility)
      assert.ok(Array.isArray(config.automation.repository_scope.repositories), 'has repository list');
      assert.ok(config.automation.repository_scope.repositories.includes('bcgov/nr-nerds'), 'includes current repo with org');

      // After normalization through loadBoardRules, check merged rules
      const normalizedConfig = await loadBoardRules();

      const ruleSections = Object.keys(normalizedConfig.rules);
      for (const section of ruleSections) {
        assert.ok(Array.isArray(normalizedConfig.rules[ section ]), `has ${section} rules`);
        assert.ok(normalizedConfig.rules[ section ].length > 0, `${section} has rules defined`);
      }

      // Technical settings
      assert.equal(config.technical.batch_size, 10, 'correct batch size');
      assert.equal(config.technical.update_window_hours, 24, 'correct update window');
      assert.ok(config.technical.optimization.skip_unchanged, 'optimization enabled');
    });
});
