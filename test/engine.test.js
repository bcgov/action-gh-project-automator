import test from 'node:test';
import assert from 'node:assert';
import { loadBoardRules } from '../src/config/board-rules.js';
import { getProjectId } from '../src/github/api.js';
import { determineTargetColumn } from '../src/utils/column-assignment.js';
import fs from 'node:fs';
import { findExcludedLabel, isTitleExcluded, labelNames } from '../src/utils/exclusions.js';

const { board_columns: policy, exclusions: shippedExclusions } = loadBoardRules();

test('loadBoardRules resolves config and flattens scope', () => {
  const rules = loadBoardRules();
  assert.ok(rules.project);
  assert.strictEqual(rules.rules, undefined);
  assert.deepStrictEqual(rules.monitoredUsers, ['DerekRoberts']);
  assert.deepStrictEqual(rules.project.allowedOrgs, ['bcgov', 'bcgov-c']);
});

test('getProjectId correctly rejects malformed project URLs', async () => {
  process.env.INPUT_GITHUB_TOKEN = 'test-token';
  await assert.rejects(
    () => getProjectId('https://github.com/invalid/format'),
    /Invalid project.url format/
  );
});

test('determineTargetColumn maps columns correctly', () => {
  // Closed and merged items aren't moved (GitHub's built-in workflows move them to Done)
  assert.strictEqual(determineTargetColumn('PullRequest', true, 'Active', { policy }), 'Active');
  assert.strictEqual(determineTargetColumn('Issue', true, 'New', { policy }), 'New');
  assert.strictEqual(determineTargetColumn('PullRequest', true, 'Waiting', { policy }), 'Waiting');

  // Pull Requests already in Waiting stay in Waiting
  assert.strictEqual(determineTargetColumn('PullRequest', false, 'Waiting', { policy }), 'Waiting');

  // Open PRs outside locked columns go to Active; New is locked
  assert.strictEqual(determineTargetColumn('PullRequest', false, 'New', { policy }), 'New');
  assert.strictEqual(determineTargetColumn('PullRequest', false, 'Backlog', { policy }), 'Active');
  assert.strictEqual(determineTargetColumn('PullRequest', false, 'None', { policy }), 'Active');
  assert.strictEqual(determineTargetColumn('PullRequest', false, null, { policy }), 'Active');

  // Issues without column go to New
  assert.strictEqual(determineTargetColumn('Issue', false, null, { policy }), 'New');
  assert.strictEqual(determineTargetColumn('Issue', false, 'None', { policy }), 'New');

  // Issues already in a column stay unchanged
  assert.strictEqual(determineTargetColumn('Issue', false, 'Active', { policy }), 'Active');
  assert.strictEqual(determineTargetColumn('Issue', false, 'Backlog', { policy }), 'Backlog');
  assert.strictEqual(determineTargetColumn('Issue', false, 'Waiting', { policy }), 'Waiting');
});

test('isTitleExcluded correctly identifies automated noise titles', () => {
  // Excluded titles
  assert.strictEqual(isTitleExcluded('Dependency Dashboard', shippedExclusions), true);
  assert.strictEqual(isTitleExcluded('Dependency Dashboard ', shippedExclusions), true);
  assert.strictEqual(isTitleExcluded('Dependency Dashboard\r', shippedExclusions), true);
  assert.strictEqual(isTitleExcluded(' Dependency Dashboard ', shippedExclusions), true);
  assert.strictEqual(isTitleExcluded('ZAP Security Report', shippedExclusions), true);
  assert.strictEqual(isTitleExcluded(' ZAP Security Report ', shippedExclusions), true);
  assert.strictEqual(
    isTitleExcluded('OWASP ZAP Security Report - API Scan', shippedExclusions),
    true
  );

  // Non-excluded titles
  assert.strictEqual(
    isTitleExcluded('Fix security bug in project board', shippedExclusions),
    false
  );
  assert.strictEqual(isTitleExcluded('Update README documentation', shippedExclusions), false);
  assert.strictEqual(isTitleExcluded('dependency dashboard', shippedExclusions), false); // Case-sensitive check
  assert.strictEqual(isTitleExcluded('', shippedExclusions), false);
  assert.strictEqual(isTitleExcluded(null, shippedExclusions), false);
  assert.strictEqual(isTitleExcluded(undefined, shippedExclusions), false);
  assert.strictEqual(isTitleExcluded(12345, shippedExclusions), false);
  assert.strictEqual(isTitleExcluded(true, shippedExclusions), false);
  assert.strictEqual(isTitleExcluded({ title: 'Dependency Dashboard' }, shippedExclusions), false);
});

test('isTitleExcluded excludes ZAP scan report titles but keeps ZAP work items', () => {
  const zapReports = [
    'ZAP Full Scan Report', // zaproxy/action-full-scan default issue_title
    'ZAP Scan Baseline Report', // zaproxy/action-baseline default issue_title
    'ZAP API Scan Report', // zaproxy/action-api-scan default issue_title
    'ZAP Full Scan Report: https://quickstart-openshift-test.apps.silver.devops.gov.bc.ca/', // bcgov/actions scan-url
    'ZAP: backendPy', // bcgov/quickstart-openshift-modules custom issue_title
  ];
  const zapWorkItems = [
    'fix(frontend): clear ZAP header warnings from the TEST scan',
    'feat: reusable DAST action for ZAP and Nuclei',
    'feat(scan-url): action to scan URL with ZAP and Nuclei',
  ];
  const { exclusions } = loadBoardRules();
  for (const config of [exclusions]) {
    for (const title of zapReports) {
      assert.strictEqual(isTitleExcluded(title, config), true, title);
    }
    for (const title of zapWorkItems) {
      assert.strictEqual(isTitleExcluded(title, config), false, title);
    }
  }
});

test('ZAP reports from newly added Core repos are in scope but skipped', () => {
  const { project, exclusions } = loadBoardRules();
  const zapTitlesByRepo = {
    'bcgov/actions-openshift': ['ZAP Full Scan Report', 'ZAP: frontend'],
    'bcgov/devops-scripts': ['ZAP Scan Baseline Report', 'ZAP: backend'],
    'bcgov/quickstart-openshift-modules': ['ZAP: backendPy', 'ZAP: backendJava', 'ZAP: backendGo'],
    'bcgov/renovate-config': ['ZAP API Scan Report', 'ZAP Security Report: backend'],
  };
  for (const [repo, titles] of Object.entries(zapTitlesByRepo)) {
    assert.ok(project.repositories.includes(repo), `${repo} should be in repository scope`);
    for (const title of titles) {
      assert.strictEqual(isTitleExcluded(title, exclusions), true, `${repo}: ${title}`);
    }
  }
  // Work items that mention ZAP, or put it after a type prefix, stay on the board
  assert.strictEqual(isTitleExcluded('fix: ZAP: tune scan rules', exclusions), false);
  assert.strictEqual(isTitleExcluded('ZAP scan tuning for modules', exclusions), false);
});

test('isTitleExcluded respects custom exclusions configuration', () => {
  const customConfig = {
    exact_titles: ['Custom Blocked Title'],
    title_substrings: ['[Automated]'],
  };

  // Custom exclusions match
  assert.strictEqual(isTitleExcluded('Custom Blocked Title', customConfig), true);
  assert.strictEqual(isTitleExcluded('Custom Blocked Title ', customConfig), true);
  assert.strictEqual(isTitleExcluded('This is [Automated] event', customConfig), true);

  // Only the configured exclusions apply
  assert.strictEqual(isTitleExcluded('Dependency Dashboard', customConfig), false);
  assert.strictEqual(isTitleExcluded('ZAP Security Report', customConfig), false);
});

test('isTitleExcluded requires the exclusions config', () => {
  assert.throws(() => isTitleExcluded('Dependency Dashboard'), /exclusions/);
});

test('findExcludedLabel skips items carrying an excluded label, ignoring case', () => {
  const config = { exclude_labels: ['Do Not Track', 'wontfix'] };
  assert.strictEqual(findExcludedLabel(['bug', 'do not track'], config), 'do not track');
  assert.strictEqual(findExcludedLabel(['WONTFIX'], config), 'WONTFIX');
  assert.strictEqual(findExcludedLabel(['bug', 'enhancement'], config), null);
  assert.strictEqual(findExcludedLabel([], config), null);
  // Label names match whole, not as substrings
  assert.strictEqual(findExcludedLabel(['wontfix-later'], config), null);
});

test('the shipped rules.yml excludes no labels', () => {
  assert.deepStrictEqual(shippedExclusions.exclude_labels, []);
  assert.strictEqual(findExcludedLabel(['bug', 'dependencies'], shippedExclusions), null);
});

test('findExcludedLabel requires exclusions.exclude_labels', () => {
  assert.throws(() => findExcludedLabel(['bug']), /exclusions\.exclude_labels/);
  assert.throws(
    () => findExcludedLabel(['bug'], { exact_titles: [] }),
    /exclusions\.exclude_labels/
  );
});

test('labelNames returns fetched label names and fails when labels were cut off', () => {
  assert.deepStrictEqual(labelNames({ totalCount: 2, nodes: [{ name: 'bug' }, { name: 'ci' }] }), [
    'bug',
    'ci',
  ]);
  assert.deepStrictEqual(labelNames({ totalCount: 0, nodes: [] }), []);
  assert.throws(() => labelNames({ totalCount: 101, nodes: [{ name: 'bug' }] }), /101 labels/);
  assert.throws(() => labelNames(undefined), /Labels were not fetched/);
});

test('linked issues with an excluded label are skipped before any linked-issue change', () => {
  const index = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const loop = index.indexOf('for (const linked of linkedIssues)');
  const guard = index.indexOf('findExcludedLabel(linked.labels', loop);
  assert.ok(loop !== -1 && guard !== -1, 'the linked-issue loop checks label exclusions');
  for (const step of [
    'board.isCrossOrg(linked',
    'updateItemColumn(projectId, linked.projectItemId',
    'updateItemSprint(projectId, linked.projectItemId',
    'linked.repository?.nameWithOwner,\n                  linked.number',
  ]) {
    const at = index.indexOf(step, loop);
    assert.ok(at !== -1 && guard < at, step);
  }
  const api = fs.readFileSync(new URL('../src/github/api.js', import.meta.url), 'utf8');
  assert.match(api, /labels: labelNames\(node\.labels\)/);
});

test('linked issues with an excluded title are skipped before any linked-issue change', () => {
  const index = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const loop = index.indexOf('for (const linked of linkedIssues)');
  const guard = index.indexOf('isTitleExcluded(linked.title, config.exclusions)', loop);
  assert.ok(loop !== -1 && guard !== -1, 'the linked-issue loop checks title exclusions');
  for (const step of [
    'board.isCrossOrg(linked',
    'updateItemColumn(projectId, linked.projectItemId',
    'updateItemSprint(projectId, linked.projectItemId',
    'linked.repository?.nameWithOwner,\n                  linked.number',
  ]) {
    const at = index.indexOf(step, loop);
    assert.ok(at !== -1 && guard < at, step);
  }
  const api = fs.readFileSync(new URL('../src/github/api.js', import.meta.url), 'utf8');
  const linkedQuery = api.slice(api.indexOf('async function fetchLinkedIssuesForPullRequest'));
  assert.match(linkedQuery, /closingIssuesReferences[\s\S]*?\n\s+title\n/);
  assert.match(linkedQuery, /title: node\.title/);
});

test("a teammate's PR does not assign the monitored user to its linked issues", () => {
  const index = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.ok(index.includes('const assignee = isAuthored ? author : null;'));
  assert.ok(!index.includes('monitoredUsers[0]'), 'no fallback to the first monitored user');
  const loop = index.indexOf('for (const linked of linkedIssues)');
  const guard = index.indexOf('if (!linked.isClosed && assignee)', loop);
  const assign = index.indexOf('api.assignUserToItem(', guard);
  assert.ok(
    loop !== -1 && guard > loop && assign > guard,
    'linked issues are assigned only with an assignee'
  );
});
