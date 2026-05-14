import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processBoardItemRules } from '../../src/rules/processors/unified-rule-processor.js';

function buildSeedItem(overrides = {}) {
  return {
    __typename: 'PullRequest',
    number: 123,
    id: 'PR_node',
    author: { login: 'octocat' },
    repository: { nameWithOwner: 'org/repo' },
    assignees: { nodes: [] },
    projectItems: { nodes: [] },
    ...overrides
  };
}

function buildIssueItem(overrides = {}) {
  return buildSeedItem({
    __typename: 'Issue',
    author: undefined,
    ...overrides
  });
}

function buildConfig(boardItemsRules) {
  return {
    project: {
      organization: 'org',
      repositories: ['repo']
    },
    rules: {
      board_items: boardItemsRules
    }
  };
}

function createTestValidator({ monitoredUsers = [], monitoredRepos = [] } = {}) {
  const monitoredUsersSet = new Set(monitoredUsers);
  const monitoredReposSet = new Set(monitoredRepos);

  return {
    steps: {
      markStepComplete: () => {}
    },
    validateSkipRule: (item, skipIf) => {
      if (skipIf === 'item.inProject') {
        return item.projectItems?.nodes?.length > 0;
      }
      return false;
    },
    validateItemCondition: (item, trigger) => {
      if (trigger?.type && item.__typename !== trigger.type) {
        return false;
      }

      switch (trigger?.condition) {
        case 'monitored.users.includes(item.author)':
          return monitoredUsersSet.has(item.author?.login);
        case 'monitored.repos.includes(item.repository)':
          return monitoredReposSet.has(item.repository?.nameWithOwner);
        default:
          return false;
      }
    }
  };
}

test('processBoardItemRules returns add_to_board for authored pull request', async () => {
  const item = buildSeedItem();

  const config = buildConfig([
    {
      name: 'authored_pull_requests',
      trigger: {
        type: 'PullRequest',
        condition: 'monitored.users.includes(item.author)'
      },
      action: 'add_to_board',
      skip_if: 'item.inProject'
    }
  ]);

  const actions = await processBoardItemRules(item, {
    loadBoardRulesFn: () => config,
    ruleValidator: createTestValidator({
      monitoredUsers: ['octocat']
    })
  });

  assert.equal(actions.length, 1);
  assert.equal(actions[0].action, 'add_to_board');
});

test('processBoardItemRules skips item already in project', async () => {
  const item = buildSeedItem({
    projectItems: { nodes: [{ id: 'existing' }] }
  });

  const config = buildConfig([
    {
      name: 'authored_pull_requests',
      trigger: {
        type: 'PullRequest',
        condition: 'monitored.users.includes(item.author)'
      },
      action: 'add_to_board',
      skip_if: 'item.inProject'
    }
  ]);

  const actions = await processBoardItemRules(item, {
    loadBoardRulesFn: () => config,
    ruleValidator: createTestValidator({
      monitoredUsers: ['octocat']
    })
  });

  assert.equal(actions.length, 0);
});

test('processBoardItemRules triggers repository scope rule for issues', async () => {
  const config = buildConfig([
    {
      name: 'repository_issues',
      trigger: {
        type: 'Issue',
        condition: 'monitored.repos.includes(item.repository)'
      },
      action: 'add_to_board',
      skip_if: 'item.inProject'
    }
  ]);

  const issueItem = buildIssueItem({
    number: 77,
    id: 'ISSUE_node'
  });

  const actions = await processBoardItemRules(issueItem, {
    loadBoardRulesFn: () => config,
    ruleValidator: createTestValidator({
      monitoredRepos: ['org/repo']
    })
  });

  assert.equal(actions.length, 1);
  assert.equal(actions[0].action, 'add_to_board');
});

