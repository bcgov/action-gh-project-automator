# Feature: Issues Assigned to Monitored Users

## Problem Statement

Issues assigned to monitored users were not being automatically added to the project board. For example, issue #522 in `nr-results-exam` repository was assigned to `DerekRoberts` but was never added to the board or assigned a sprint.

**Root Causes:**
1. Missing rule in `rules.yml` to add issues assigned to monitored users (only PRs had this rule)
2. Incomplete search functionality - `getRecentItems` wasn't searching for issues assigned to users across repositories

**Impact:**
- Issues assigned to monitored users from repositories not in the monitored list were not tracked
- Users had to manually add these issues to the board
- Sprint assignments were not applied automatically

## Solution

Add support for automatically adding issues assigned to monitored users to the project board, regardless of repository.

### Rules.yml Pattern

Users configure this via the `assigned_issues` rule in their `rules.yml`:

```yaml
automation:
  user_scope:
    monitored_users:
      - YourUsername
    rules:
      board_items:
        - name: "assigned_issues"
          description: "Add issues assigned to any monitored user"
          trigger:
            type: "Issue"
            condition: "item.assignees.some(assignee =>
              monitored.users.includes(assignee))"
          action: "add_to_board"
          skip_if: "item.inProject"
```

**Location in rules.yml**: `automation.user_scope.rules.board_items` (see root `rules.yml`)

## Implementation Details

### Search Enhancement

The `getRecentItems` function in `src/github/api.js` now performs three types of searches:

1. **Repository-scoped search**: Items in monitored repositories (limited by `OVERRIDE_REPOS` or config)
2. **Author search**: PRs authored by monitored user (across ALL repositories)
3. **Assignee search**: Issues/PRs assigned to monitored user (across ALL repositories) ← **NEW**

The assignee search uses GitHub's search API with the query pattern:
```
assignee:username created:>timestamp
```

This searches across ALL repositories in the organization, not just monitored ones.

### Rule Processing

The `assigned_issues` rule is processed by the unified rule processor:
- Rule name: `assigned_issues`
- Rule type: `board_items`
- Trigger: Issue type with assignees matching monitored users
- Action: `add_to_board`
- Skip condition: Item already in project

### Board Item Evaluation

The `board-items-evaluator.js` was updated to properly recognize and report when an issue is assigned to a monitored user:
- Priority: Assigned to user → In monitored repo → No match
- Reason reported: "Issue is assigned to monitored user"

## Test Scenarios

### Acceptance Criteria

1. ✅ Issues assigned to monitored users are found via search across all repositories
2. ✅ Issues already on the board are skipped (idempotent)
3. ✅ Issues from repos not in monitored list are processed when assigned
4. ✅ Issues are added to board and follow normal workflow (column, sprint, assignees)
5. ✅ Rule is properly evaluated and triggers add_to_board action

### Test Cases

**Scenario 1: Issue Assigned in Non-Monitored Repo**
- Issue #522 in `nr-results-exam` assigned to `DerekRoberts`
- `nr-results-exam` not in monitored repositories list
- Expected: Issue is found via assignee search, added to board

**Scenario 2: Issue Already on Board**
- Issue assigned to user but already on board
- Expected: Rule evaluates but skip_if condition prevents duplicate addition

**Scenario 3: Multiple Assignees**
- Issue assigned to multiple users including monitored user
- Expected: Issue is added if any assignee matches monitored user

**Scenario 4: Issue in Monitored Repo + Assigned**
- Issue in monitored repo AND assigned to monitored user
- Expected: Issue is found (via repo search or assignee search), added once

## Edge Cases

1. **Already on Board**: Items already in project are skipped via `skip_if: "item.inProject"` condition
2. **Multiple Assignees**: Rule uses `item.assignees.some()` to check if ANY assignee matches
3. **Repository Scope**: User-scoped searches (assignee) work across ALL repos, not limited by `OVERRIDE_REPOS`
4. **Rate Limiting**: Assignee search respects rate limit guards and can be skipped if rate limit is low
5. **Search Window**: Uses same time window as other searches (configurable via `UPDATE_WINDOW_HOURS`)

## Related Code

### Files Modified

- `rules.yml`: Added `assigned_issues` rule in user_scope.board_items
- `src/github/api.js`: Added assignee search functionality across all repositories
- `src/rules/helpers/board-items-evaluator.js`: Updated reason description to prioritize assignee check
- `test/github/get-recent-items-rate-limit.test.mjs`: Updated to expect assignee search in addition to repo and author searches

### Related Pull Request

- PR #133: feat: add support for issues assigned to monitored users
  - Link: https://github.com/bcgov/action-gh-project-automator/pull/133

## Implementation Notes

### Search Order

The search order ensures user-scoped items are found regardless of repository:
1. Repository-scoped search (limited scope)
2. Author search (all repos) 
3. Assignee search (all repos) ← New

### User-Scoped vs Repository-Scoped

- **User-scoped rules** (like `assigned_issues`): Search across ALL repositories
- **Repository-scoped rules**: Only search in configured repositories
- This allows users to be tracked across the entire organization

### Rule Evaluation Flow

1. Item found via search (repo/author/assignee)
2. Rule processor evaluates `assigned_issues` rule
3. Condition checked: `item.assignees.some(assignee => monitored.users.includes(assignee))`
4. If condition matches and item not in project → Action: `add_to_board`
5. Item processed through normal workflow (column assignment, sprint, assignees)

## Future Enhancements

Potential improvements:
- Configurable search window per rule type
- Support for multiple monitored users in search query optimization
- Metrics/observability for assignee search performance

## References

- GitHub Issue: https://github.com/bcgov/nr-results-exam/issues/522
- Implementation PR: https://github.com/bcgov/action-gh-project-automator/pull/133
- Rules.yml documentation: See root `rules.yml` file
- Rule processor: `src/rules/processors/unified-rule-processor.js`
