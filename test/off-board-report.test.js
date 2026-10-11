import test from 'node:test';
import assert from 'node:assert';
import { loadBoardRules } from '../src/config/board-rules.js';
import { findOffBoardIssues, renderReport, REPORT_MARKER } from '../src/report/off-board.js';

const config = loadBoardRules({ monitoredUser: 'DerekRoberts' });
const PROJECT = 'PVT_project16';
const settings = config.off_board_report;

const issue = (repository, number, title, extra = {}) => ({
  repository,
  number,
  title,
  url: `https://github.com/${repository}/issues/${number}`,
  createdAt: '2026-10-01T12:00:00Z',
  labels: [],
  projectIds: [],
  ...extra,
});

test('off_board_report is configured and its issue is kept off the board', () => {
  assert.strictEqual(settings.repository, 'bcgov/project-automator');
  assert.ok(settings.label);
  assert.ok(config.exclusions.exact_titles.includes(settings.title));
});

test('findOffBoardIssues keeps only issues missing from the project', () => {
  const issues = [
    issue('bcgov/actions-openshift', 43, 'Off the board'),
    issue('bcgov/actions-openshift', 44, 'On the board', { projectIds: [PROJECT] }),
    issue('bcgov/actions', 7, 'On another board', { projectIds: ['PVT_other'] }),
    issue('bcgov/actions', 8, 'Dependency Dashboard'),
    issue('bcgov/quickstart-openshift', 9, 'ZAP Security Report'),
    issue('bcgov/project-automator', 10, settings.title, { labels: [settings.label] }),
  ];
  const { offBoard, excluded } = findOffBoardIssues(issues, {
    projectId: PROJECT,
    exclusions: config.exclusions,
    reportLabel: settings.label,
  });
  assert.deepStrictEqual(
    offBoard.map((i) => `${i.repository}#${i.number}`),
    ['bcgov/actions-openshift#43', 'bcgov/actions#7']
  );
  assert.strictEqual(excluded, 2);
});

test('renderReport groups by repository and is stable for the same input', () => {
  const now = new Date('2026-10-11T15:00:00Z');
  const offBoard = [
    issue('bcgov/actions-openshift', 46, 'b'),
    issue('bcgov/actions', 7, 'c'),
    issue('bcgov/actions-openshift', 43, 'a'),
  ];
  const opts = {
    projectUrl: 'https://github.com/orgs/bcgov/projects/16',
    repositories: ['bcgov/actions', 'bcgov/actions-openshift'],
    excluded: 2,
    now,
  };
  const body = renderReport(offBoard, opts);
  assert.ok(body.startsWith(REPORT_MARKER));
  assert.ok(body.includes('**3** open issue(s) not on the board'));
  assert.ok(body.indexOf('### bcgov/actions\n') < body.indexOf('### bcgov/actions-openshift'));
  assert.ok(
    body.indexOf('actions-openshift/issues/43') < body.indexOf('actions-openshift/issues/46')
  );
  assert.ok(body.includes('Skipped 2 excluded issue(s)'));
  assert.strictEqual(renderReport(offBoard, opts), body);
});

test('renderReport says so when everything is on the board', () => {
  const body = renderReport([], {
    projectUrl: 'https://github.com/orgs/bcgov/projects/16',
    repositories: ['bcgov/actions'],
    excluded: 0,
  });
  assert.ok(body.includes('All open Core repo issues are on the board.'));
});
