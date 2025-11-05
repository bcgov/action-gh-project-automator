# Gap Analysis: Declared vs. Implemented

**Purpose**: Compare `rules.yml` declarations against code implementations  
**Sources**: `requirements-inventory.md` + `code-to-rules-mapping.md`  
**Date**: Generated as part of SpecKit re-engineering

## Summary

- **Total Rules Declared**: 12 rules across 5 rule types
- **Fully Implemented**: 8 rules (67%)
- **Partially Implemented**: 4 rules (33%)
- **Not Implemented**: 0 rules (but 2 missing features)

## Gap Categories

### 1. Fully Declared and Implemented ✅

**Board Items Rules** (4/4):
- ✅ `authored_pull_requests` (user scope)
- ✅ `assigned_pull_requests` (user scope)
- ✅ `repository_pull_requests` (repository scope)
- ✅ `repository_issues` (repository scope)

**Sprint Rules** (3/3):
- ✅ `active_sprint_assignment`
- ✅ `waiting_sprint_assignment`
- ✅ `done_sprint_assignment`

**Assignee Rules** (1/1):
- ✅ `assign_authored_prs` (user scope)

**Total**: 8 rules fully working

### 2. Declared but Partially Implemented ⚠️

**Column Rules** (3/3 - all have same gap):
- ⚠️ `new_pull_requests_to_active`
- ⚠️ `pull_requests_no_column`
- ⚠️ `issues_no_column`

**Gap**: All three column rules declare `validTransitions` but transitions are not strictly enforced.

**Details**:
- `validTransitions` declared in `rules.yml`:
  ```yaml
  validTransitions:
    - from: "New"
      to: "Active"
      conditions: []
  ```
- Code has `StateTransitionValidator` but:
  - Validation exists but has backward compatibility fallback
  - `validateColumnTransition()` in `columns.js` allows transitions on validation errors
  - ValidTransitions from `rules.yml` may not be fully loaded into validator

**Impact**: Medium - Transitions work but declared validation rules are not enforced

**Linked Issues Rules** (1/1):
- ⚠️ `linked_issue_inheritance`

**Gap**: Actions `inherit_column` and `inherit_assignees` are declared but incompletely implemented.

**Details**:
- `rules.yml` declares:
  ```yaml
  action: ["inherit_column", "inherit_assignees"]
  ```
- Code in `linked-issues-processor.js`:
  - `inherit_column` (lines 68-73): Only sets column if `currentColumn` is provided and different
    - Doesn't properly inherit from PR column state
    - Doesn't check PR's actual column
  - `inherit_assignees` (lines 76-82): Gets PR assignees but:
    - Doesn't properly handle inheritance logic
    - Skip condition not properly evaluated
  - Skip condition: `item.column === item.pr.column && item.assignees === item.pr.assignees`
    - Not properly evaluated before executing actions

**Impact**: High - Linked issue synchronization doesn't work as declared

**Total**: 4 rules partially implemented

### 3. Not Declared but Documented as Needed ❌

**Sprint Removal** (Issue #66):
- Not in `rules.yml` but documented as needed
- Should remove sprint from items in inactive columns (New, Parked, Backlog)

**Impact**: Medium - Feature requested but not implemented

## Detailed Gap Analysis

### Gap 1: validTransitions Not Enforced

**Location**: `src/rules/columns.js` → `validateColumnTransition()`

**Current Behavior**:
```javascript
function validateColumnTransition(fromColumn, toColumn, item) {
  try {
    const validator = StateVerifier.getTransitionValidator();
    const result = validator.validateColumnTransition(fromColumn, toColumn, context);
    // ... validation logic ...
    return result;
  } catch (error) {
    // If validation fails, allow the transition (backward compatibility)
    return { valid: true, reason: 'Validation error - allowing transition for backward compatibility' };
  }
}
```

**Problem**: Try-catch allows transitions even when validation fails.

**Required Behavior**:
- Load `validTransitions` from `rules.yml` into validator
- Strictly enforce transitions - block invalid transitions
- Only allow transitions declared in `validTransitions`

**Fix Required**:
1. Ensure `StateVerifier.initializeTransitionRules()` loads all `validTransitions` from `rules.yml`
2. Remove backward compatibility fallback in `validateColumnTransition()`
3. Make validation strict - block invalid transitions

### Gap 2: Linked Issues inherit_column Incomplete

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

### Gap 3: Linked Issues inherit_assignees Incomplete

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

### Gap 4: Skip Condition Not Evaluated

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

### Gap 5: Sprint Removal Not Implemented

**Location**: Not implemented anywhere

**Required Behavior** (from Issue #66):
- Remove sprint from items in inactive columns (New, Parked, Backlog)
- Should be a rule in `rules.yml` sprints section

**Fix Required**:
1. Add sprint removal rules to `rules.yml`:
   ```yaml
   sprints:
     - name: "remove_sprint_inactive_columns"
       trigger:
         type: ["PullRequest", "Issue"]
         condition: "item.column === 'New' || item.column === 'Parked' || item.column === 'Backlog'"
       action: "remove_sprint"
       skip_if: "item.sprint == null"
   ```
2. Implement `remove_sprint` action in `sprints.js`
3. Add sprint removal logic

## Implementation Priority

### High Priority (Critical Functionality)

1. **Fix validTransitions Enforcement**
   - Impact: Medium - Declared but not enforced
   - Effort: Medium
   - Blocks: None

2. **Complete Linked Issues inherit_column**
   - Impact: High - Core functionality broken
   - Effort: Low
   - Blocks: None

3. **Complete Linked Issues inherit_assignees**
   - Impact: High - Core functionality broken
   - Effort: Low
   - Blocks: None

4. **Fix Skip Condition Evaluation**
   - Impact: High - Incorrect behavior
   - Effort: Low
   - Blocks: None

### Medium Priority (Enhancement)

5. **Implement Sprint Removal**
   - Impact: Medium - Feature requested
   - Effort: Medium
   - Blocks: None

## Testing Gaps

### Missing Tests

1. **validTransitions Enforcement**
   - Need tests that verify invalid transitions are blocked
   - Need tests that verify valid transitions are allowed

2. **Linked Issues inherit_column**
   - Need tests that verify column inheritance from PR
   - Need tests for skip condition evaluation

3. **Linked Issues inherit_assignees**
   - Need tests that verify assignee inheritance from PR
   - Need tests for skip condition evaluation

4. **Sprint Removal**
   - Need tests for sprint removal in inactive columns

## Recommendations

1. **Immediate**: Fix linked issues actions (high impact, low effort)
2. **Short-term**: Enforce validTransitions (medium impact, medium effort)
3. **Medium-term**: Implement sprint removal (medium impact, medium effort)
4. **Ongoing**: Add comprehensive tests for all gaps

## Success Criteria

- [ ] All `validTransitions` from `rules.yml` are strictly enforced
- [ ] `inherit_column` properly inherits PR's column to linked issues
- [ ] `inherit_assignees` properly inherits PR's assignees to linked issues
- [ ] Skip conditions are properly evaluated for all rules
- [ ] Sprint removal works for inactive columns
- [ ] All gaps have test coverage

