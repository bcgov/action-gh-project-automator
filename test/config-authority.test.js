import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { loadBoardRules } from '../src/config/board-rules.js';
import { buildSearchQueries } from '../src/github/queries.js';
import { projectItemsFragment } from '../src/utils/board-state.js';
import { sprintAction } from '../src/utils/sprint.js';

const shippedPath = new URL('../rules.yml', import.meta.url);
const shipped = yaml.load(fs.readFileSync(shippedPath, 'utf8'));

function writeRules(mutate) {
  const config = structuredClone(shipped);
  mutate(config);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-'));
  const file = path.join(dir, 'rules.yml');
  fs.writeFileSync(file, yaml.dump(config));
  return file;
}

const required = [
  ['project', 'url'],
  ['project', 'organization'],
  ['project', 'fields'],
  ['project', 'fields', 'status'],
  ['automation', 'repository_scope', 'repositories'],
  ['board_columns'],
  ['board_columns', 'locked'],
  ['board_columns', 'linked_issue', 'closed'],
  ['exclusions'],
  ['exclusions', 'title_prefixes'],
  ['technical', 'update_window_hours'],
];

for (const keyPath of required) {
  const key = keyPath.join('.');
  test(`a missing ${key} fails fast and names the key`, () => {
    const file = writeRules((config) => {
      const parent = keyPath.slice(0, -1).reduce((node, k) => node[k], config);
      delete parent[keyPath.at(-1)];
    });
    assert.throws(
      () => loadBoardRules(file),
      (err) => err.message.includes(`missing required key ${key}`)
    );
  });
}

test('keys nothing reads are rejected', () => {
  const file = writeRules((config) => {
    config.technical.batch_size = 10;
  });
  assert.throws(() => loadBoardRules(file), /unknown key technical\.batch_size/);
});

test('the shipped rules.yml loads with every setting the engine reads', () => {
  const config = loadBoardRules();
  assert.strictEqual(config.project.url, 'https://github.com/orgs/bcgov/projects/16');
  assert.strictEqual(config.project.organization, 'bcgov');
  assert.deepStrictEqual(config.project.allowedOrgs, ['bcgov', 'bcgov-c']);
  assert.deepStrictEqual(config.project.fields, { status: 'Status', sprint: 'Sprint' });
  assert.deepStrictEqual(config.monitoredUsers, ['DerekRoberts']);
  assert.strictEqual(config.technical.update_window_hours, 2);
});

test('values from rules.yml reach the engine instead of hardcoded ones', () => {
  const file = writeRules((config) => {
    config.project.organization = 'example-org';
    config.project.allowedOrgs = ['example-org'];
    config.automation.user_scope.monitored_users = ['alice', 'bob'];
    config.technical.update_window_hours = 6;
  });
  const config = loadBoardRules(file);
  assert.strictEqual(config.project.organization, 'example-org');
  assert.deepStrictEqual(config.project.allowedOrgs, ['example-org']);
  assert.deepStrictEqual(config.monitoredUsers, ['alice', 'bob']);
  assert.strictEqual(config.technical.update_window_hours, 6);
});

test('every monitored user gets user-scope searches', () => {
  const { userQueries } = buildSearchQueries({
    org: 'bcgov',
    repos: [],
    monitoredUsers: ['alice', 'bob'],
    since: '2026-10-11T00:00:00Z',
  });
  for (const user of ['alice', 'bob']) {
    assert.ok(
      userQueries.some((q) => q.startsWith(`author:${user} `)),
      user
    );
    assert.ok(
      userQueries.some((q) => q.startsWith(`assignee:${user} `)),
      user
    );
    assert.ok(
      userQueries.some((q) => q.startsWith(`review-requested:${user} `)),
      user
    );
  }
});

test('project field names come from rules.yml', () => {
  const fragment = projectItemsFragment({ status: 'State', sprint: 'Iteration' });
  assert.match(fragment, /fieldValueByName\(name: "State"\)/);
  assert.match(fragment, /fieldValueByName\(name: "Iteration"\)/);
  assert.throws(() => projectItemsFragment(undefined), /project\.fields/);
});

test('sprint changes follow rules.yml sprints', () => {
  const { sprints } = loadBoardRules();
  const current = 'it-2';
  // assign_current: always set to the current sprint
  for (const col of sprints.assign_current) {
    assert.strictEqual(sprintAction(col, null, current, sprints), 'assign', col);
    assert.strictEqual(sprintAction(col, { id: 'it-1' }, current, sprints), 'assign', col);
    assert.strictEqual(sprintAction(col, { id: current }, current, sprints), null, col);
  }
  // assign_current_if_empty: only when there's no sprint
  for (const col of sprints.assign_current_if_empty) {
    assert.strictEqual(sprintAction(col, null, current, sprints), 'assign', col);
    assert.strictEqual(sprintAction(col, { id: 'it-1' }, current, sprints), null, col);
  }
  // clear: remove any sprint
  for (const col of sprints.clear) {
    assert.strictEqual(sprintAction(col, { id: 'it-1' }, current, sprints), 'clear', col);
    assert.strictEqual(sprintAction(col, null, current, sprints), null, col);
  }
  // No current iteration or no column: nothing to assign
  assert.strictEqual(sprintAction('Active', null, null, sprints), null);
  assert.strictEqual(sprintAction(null, { id: 'it-1' }, current, sprints), null);

  // Custom columns are honoured
  const custom = { assign_current: ['Review'], assign_current_if_empty: [], clear: ['Active'] };
  assert.strictEqual(sprintAction('Review', null, current, custom), 'assign');
  assert.strictEqual(sprintAction('Active', { id: 'it-1' }, current, custom), 'clear');
  assert.throws(() => sprintAction('Active', null, current, undefined), /sprints/);
});

test('optional configurations: rules.yml without sprints, user_scope, or allowedOrgs', () => {
  const file = writeRules((config) => {
    delete config.sprints;
    delete config.project.fields.sprint;
    delete config.automation.user_scope;
    delete config.project.allowedOrgs;
  });
  const config = loadBoardRules(file);
  assert.strictEqual(config.sprints, undefined);
  assert.strictEqual(config.project.fields.sprint, undefined);
  assert.deepStrictEqual(config.monitoredUsers, []);
  assert.deepStrictEqual(config.project.allowedOrgs, ['bcgov']);

  const fragment = projectItemsFragment(config.project.fields);
  assert.match(fragment, /fieldValueByName\(name: "Status"\)/);
  assert.doesNotMatch(fragment, /sprint:/);
});

test('src has no hardcoded user, org, project URL or sprint columns', () => {
  const srcDir = new URL('../src/', import.meta.url);
  const files = fs.readdirSync(srcDir, { recursive: true }).filter((f) => f.endsWith('.js'));
  const banned = [
    /DerekRoberts/,
    /['"]bcgov(-c)?['"]/,
    /github\.com\/orgs\/bcgov\/projects/,
    /\['Active', 'Next'/,
    /GITHUB_PROJECT_URL|INPUT_PROJECT_URL/,
    /UPDATE_WINDOW_HOURS/,
  ];
  for (const file of files) {
    const text = fs.readFileSync(new URL(file, srcDir), 'utf8');
    for (const pattern of banned) {
      assert.ok(!pattern.test(text), `${file} matches ${pattern}`);
    }
  }
});
