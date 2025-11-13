# Gap Analysis: Declared vs. Implemented

**Purpose**: Compare `rules.yml` declarations against code implementations  
**Sources**: `requirements-inventory.md` + `code-to-rules-mapping.md`  
**Date**: Generated as part of SpecKit re-engineering

## Summary

- **Total Rules Declared**: 13 rules across 5 rule types
- **Fully Implemented**: 12 rules (92%)
- **Partially Implemented**: 1 rule (8%)
- **Not Implemented**: 0 rules

## Gap Categories

### 1. Fully Declared and Implemented ✅

**Board Items Rules** (4/4):
- ✅ `authored_pull_requests` (user scope)
- ✅ `assigned_pull_requests` (user scope)
- ✅ `repository_pull_requests` (repository scope)
- ✅ `repository_issues` (repository scope)

**Column Rules** (3/3):
- ✅ `new_pull_requests_to_active`
- ✅ `pull_requests_no_column`
- ✅ `issues_no_column`
  - Strict `validTransitions` enforcement via `StateVerifier.initializeTransitionRules()` and `validateColumnTransition()` with regression tests in `test/state-verifier-transitions.test.js`.

**Sprint Rules** (4/4):
- ✅ `active_sprint_assignment`
- ✅ `waiting_sprint_assignment`
- ✅ `done_sprint_assignment`
- ✅ `remove_sprint_inactive_columns`
  - Batched assignment/removal implemented through `determineSprintAction()`, `setItemSprintsBatch()`, and `clearItemSprintsBatch()` with coverage in `test/rules/sprint-batching.test.js` and runtime metrics (`existing.*` counters).

**Assignee Rules** (1/1):
- ✅ `assign_authored_prs` (user scope)
  - Delta logic validated via `test/rules/assignees-delta.test.js`.

**Total**: 12 rules fully working

### 2. Declared but Partially Implemented ⚠️

**Linked Issues Rules** (1/1):
- ⚠️ `linked_issue_inheritance`

**Gap**: Actions `inherit_column` and `inherit_assignees` are declared but incompletely implemented; skip guards rely on stale data.

### 3. Not Declared but Documented as Needed ❌

None at this time. Sprint removal now lives in `rules.yml` and is implemented; other enhancements should be logged as new rules or tracked in future design work.

## Detailed Gap Analysis

### Gap 1: Linked Issues inherit_column Incomplete

**Location**: `src/rules/linked-issues-processor.js` → `processLinkedIssues()`

**Current Behavior**:
```javascript
case 'inherit_column':
    if (currentColumn && currentColumn !== initialColumn) {
        await setItemColumn(projectId, linkedIssueId, currentColumn);
        // ...
    }
    break;
```

**Problems**:
1. Uses `currentColumn` parameter (PR's target column) instead of PR's actual current column
2. Doesn't check if PR is actually in that column
3. Doesn't properly inherit from PR's actual state

**Required Behavior**:
- Get PR's actual column from project board
- Inherit that column to linked issue
- Only set if different from linked issue's current column

**Fix Required**:
1. Get PR's actual column via `getItemColumn(projectId, prProjectItemId)`
2. Use PR's actual column for inheritance
3. Properly evaluate skip condition

### Gap 2: Linked Issues inherit_assignees Incomplete

**Location**: `src/rules/linked-issues-processor.js` → `processLinkedIssues()`

**Current Behavior**:
```javascript
case 'inherit_assignees':
    const prAssignees = pullRequest.assignees?.nodes?.map(a => a.login) || [];
    if (prAssignees.length > 0) {
        await setItemAssignees(projectId, linkedIssueId, prAssignees);
        // ...
    }
    break;
```

**Problems**:
1. Gets assignees from `pullRequest.assignees.nodes` (GitHub API response)
2. Should get assignees from project board field (actual state)
3. Doesn't properly evaluate skip condition
4. Doesn't check if assignees are already the same

**Required Behavior**:
- Get PR's assignees from project board field (not API response)
- Compare with linked issue's assignees
- Only set if different
- Properly evaluate skip condition

**Fix Required**:
1. Get PR's assignees via `getItemAssignees(projectId, prProjectItemId)`
2. Compare with linked issue's assignees
3. Only set if different
4. Evaluate skip condition before executing

### Gap 3: Skip Condition Not Evaluated

**Location**: `src/rules/linked-issues-processor.js` → `processLinkedIssues()`

**Current Behavior**: Skip condition from `rules.yml` is not evaluated:
```yaml
skip_if: "item.column === item.pr.column && item.assignees === item.pr.assignees"
```

**Required Behavior**:
- Evaluate skip condition before executing actions
- Skip if condition is true
- Use actual project board state (not API response)

**Fix Required**:
1. Get PR's actual column and assignees from project board
2. Get linked issue's actual column and assignees
3. Evaluate skip condition
4. Skip if condition is true

### Gap 4: Observability for Linked Issue Actions

**Location**: `src/rules/linked-issues-processor.js`

**Current Behavior**:
- Logging is minimal; counters do not expose inheritance attempts vs. successes.

**Required Behavior**:
- Emit metrics compatible with existing `log.incrementCounter` usage (e.g., `linked.actions.assigned`, `linked.actions.skipped`).
- Surface in end-of-run summary for visibility.

## Implementation Priority

### High Priority (Critical Functionality)

1. **Complete Linked Issues inherit_column**
   - Impact: High - Core functionality broken
   - Effort: Low
   - Blocks: None

2. **Complete Linked Issues inherit_assignees**
   - Impact: High - Core functionality broken
   - Effort: Low
   - Blocks: None

3. **Fix Skip Condition Evaluation**
   - Impact: High - Incorrect behavior
   - Effort: Low
   - Blocks: None

4. **Add Linked Issue Observability**
   - Impact: Medium - Needed for monitoring
   - Effort: Low
   - Blocks: None

## Testing Gaps

### Missing Tests

1. **Linked Issues inherit_column**
   - Need tests that verify column inheritance from PR
   - Need tests for skip condition evaluation

2. **Linked Issues inherit_assignees**
   - Need tests that verify assignee inheritance from PR
   - Need tests for skip condition evaluation

3. **Linked Issues Observability**
   - Need assertions around metrics/log output when inheritance is skipped/applied

## Recommendations

1. **Immediate**: Fix linked issues actions (high impact, low effort)
2. **Short-term**: Add observability counters for linked issue processing
3. **Ongoing**: Build dedicated tests for inheritance logic and skip conditions

## Success Criteria

- [ ] `inherit_column` properly inherits PR's column to linked issues
- [ ] `inherit_assignees` properly inherits PR's assignees to linked issues
- [ ] Skip conditions are properly evaluated for all rules
- [ ] Linked issue observability metrics recorded for success/skip/error paths
- [ ] All gaps have targeted test coverage

