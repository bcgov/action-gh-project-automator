# Code to rules.yml Mapping

**Purpose**: Document how each `rules.yml` rule is implemented in code  
**Source**: Codebase analysis  
**Date**: Generated as part of SpecKit re-engineering

## Mapping Methodology

Each section maps:
1. **rules.yml Rule**: The declared rule from `requirements-inventory.md`
2. **Code Implementation**: How it's implemented in code
3. **Gap Analysis**: Differences between declared and implemented

## 1. Board Items Rules

### Rule: `authored_pull_requests` (User Scope)

**rules.yml Declaration**:
```yaml
- name: "authored_pull_requests"
  trigger:
    type: "PullRequest"
    condition: "monitored.users.includes(item.author)"
  action: "add_to_board"
  skip_if: "item.inProject"
```

**Code Implementation**:
- **Entry**: `src/index.js` loads seed items via `loadEventItems()` (when `GITHUB_EVENT_*` present) before invoking `processAddItems()`. Covered by `test/utils/event-items.test.js` and `test/rules/add-items-event.test.js`.
- **Module**: `src/rules/add-items.js`
- **Function**: `processAddItems()` → calls `processBoardItemRules()` → `processRuleType('board_items')`
- **Processor**: `src/rules/processors/unified-rule-processor.js`
- **Condition Evaluation**: `src/rules/processors/validation.js` (`validateRuleCondition()`)
- **Action Execution**: `addItemToProject()` in `src/github/api.js`, which updates `projectItemsCache` eagerly to keep state verification coherent.

**Implementation Flow**:
1. `processAddItems()` gets recent items via `getRecentItems()`
2. For each item, calls `processBoardItemRules()` which processes `rules.yml` board_items rules
3. `unified-rule-processor.js` evaluates conditions from `rules.yml`
4. If condition matches (`monitored.users.includes(item.author)`), action `add_to_board` is returned
5. `add-items.js` executes `addItemToProject()` if action is `add_to_board`
6. Skips if `item.inProject` (checked via `isItemInProject()`)

**Status**: ✅ **Fully Implemented** - Matches `rules.yml` declaration

### Rule: `assigned_pull_requests` (User Scope)

**rules.yml Declaration**:
```yaml
- name: "assigned_pull_requests"
  trigger:
    type: "PullRequest"
    condition: "item.assignees.some(assignee => monitored.users.includes(assignee))"
  action: "add_to_board"
  skip_if: "item.inProject"
```

**Code Implementation**: Same as `authored_pull_requests` - uses same processor path

**Status**: ✅ **Fully Implemented** - Matches `rules.yml` declaration

### Rule: `repository_pull_requests` (Repository Scope)

**rules.yml Declaration**:
```yaml
- name: "repository_pull_requests"
  trigger:
    type: "PullRequest"
    condition: "monitored.repos.includes(item.repository)"
  action: "add_to_board"
  skip_if: "item.inProject"
```

**Code Implementation**: Same processor path as user scope rules

**Status**: ✅ **Fully Implemented** - Matches `rules.yml` declaration

### Rule: `repository_issues` (Repository Scope)

**rules.yml Declaration**:
```yaml
- name: "repository_issues"
  trigger:
    type: "Issue"
    condition: "monitored.repos.includes(item.repository)"
  action: "add_to_board"
  skip_if: "item.inProject"
```

**Code Implementation**: Same processor path

**Status**: ✅ **Fully Implemented** - Matches `rules.yml` declaration

## 2. Column Rules

### Rule: `new_pull_requests_to_active`

**rules.yml Declaration**:
```yaml
- name: "new_pull_requests_to_active"
  trigger:
    type: "PullRequest"
    condition: "item.column === 'New'"
  action: "set_column"
  value: "Active"
  skip_if: "item.column !== 'New'"
  validTransitions:
    - from: "New"
      to: "Active"
      conditions: []
```

**Code Implementation**:
- **File**: `src/rules/columns.js`
- **Function**: `processColumnAssignment()`
- **Rule Processing**: Delegates to `processRuleType('columns')` in the unified processor.
- **Transition Validation**: `validateColumnTransition()` (same module) consults `StateVerifier.getTransitionValidator()`, which is initialized from `StateVerifier.initializeTransitionRules(boardConfig)` in `src/index.js`.
- **Regression Coverage**: `test/state-verifier-transitions.test.js` ensures `validTransitions` reloading and enforcement; state verification retries are covered by `test/state-verifier-retry.test.cjs`.

**Implementation Details**:
1. `processColumnAssignment()` retrieves current column via `getItemColumn()` and targets declared `value`.
2. All transitions are validated via `validateColumnTransition()`; invalid transitions are blocked with explicit logging and no fallback.
3. Batch writes use `setItemColumnsBatch()` when a queue is provided; otherwise `setItemColumn()` mutates directly.
4. Closed/Merged fast-path sets `Done`/`Closed` when available, still honoring declared transitions.

**Status**: ✅ **Fully Implemented**
- Column updates now strictly honor `validTransitions` as declared in `rules.yml`.
- Remaining work lives in linked issues (see below).

### Rule: `pull_requests_no_column`

**rules.yml Declaration**:
```yaml
- name: "pull_requests_no_column"
  trigger:
    type: "PullRequest"
    condition: "!item.column"
  action: "set_column"
  value: "Active"
  validTransitions:
    - from: "None"
      to: "Active"
      conditions: []
```

**Code Implementation**: Same as `new_pull_requests_to_active`

**Status**: ✅ **Fully Implemented** - Shares enforcement path with `new_pull_requests_to_active`.

### Rule: `issues_no_column`

**rules.yml Declaration**:
```yaml
- name: "issues_no_column"
  trigger:
    type: "Issue"
    condition: "!item.column"
  action: "set_column"
  value: "New"
  validTransitions:
    - from: "None"
      to: "New"
      conditions: []
```

**Code Implementation**: Same as other column rules

**Status**: ✅ **Fully Implemented** - Shares enforcement path with `new_pull_requests_to_active`.

## 3. Sprint Rules

### Rule: `active_sprint_assignment`

**rules.yml Declaration**:
```yaml
- name: "active_sprint_assignment"
  trigger:
    type: ["PullRequest", "Issue"]
    condition: "item.column === 'Next' || item.column === 'Active'"
  action: "set_sprint"
  value: "current"
  skip_if: "item.sprint === 'current'"
```

**Code Implementation**:
- **File**: `src/rules/sprints.js`
- **Coordinator**: `processSprintAssignment()` orchestrates per-item updates for new additions; `src/index.js` also invokes `determineSprintAction()` during the existing-items sweep.
- **Sprint Resolution**: `getSprintIterations()` gathers active + completed iterations; `getCurrentSprint()` selects the active slice; `findSprintForDate()` backfills historical sprints.
- **Batched Mutations**: `setItemSprintsBatch()` applies GraphQL aliases for bulk updates; regression covered by `test/rules/sprint-batching.test.js`.
- **Eventual Consistency**: Decisions/logging handled within `determineSprintAction()` with unit coverage in `test/rules/sprint-batching.test.js`.

**Implementation Details**:
1. `processSprintAssignment()` gets current column
2. Checks if column matches `rules.yml` condition (`Next` or `Active`)
3. Gets all iterations (active + completed) via `getSprintIterations()`
4. Finds current sprint (sprint that covers today's date)
5. Sets sprint if not already set

**Status**: ✅ **Fully Implemented** - Matches `rules.yml` declaration
- ✅ Handles edge cases (gaps, completed iterations) as documented in comments

### Rule: `waiting_sprint_assignment`

**rules.yml Declaration**:
```yaml
- name: "waiting_sprint_assignment"
  trigger:
    type: ["PullRequest", "Issue"]
    condition: "item.column === 'Waiting'"
  action: "set_sprint"
  value: "current"
  skip_if: "item.sprint != null"
```

**Code Implementation**: Same as `active_sprint_assignment` but for `Waiting` column

**Status**: ✅ **Fully Implemented** - Matches `rules.yml` declaration

### Rule: `done_sprint_assignment`

**rules.yml Declaration**:
```yaml
- name: "done_sprint_assignment"
  trigger:
    type: ["PullRequest", "Issue"]
    condition: "item.column === 'Done'"
  action: "set_sprint"
  value: "current"
  skip_if: "item.sprint === 'current'"
```

**Code Implementation**: Same as other sprint rules

**Status**: ✅ **Fully Implemented** - Matches `rules.yml` declaration

### Rule: `remove_sprint_inactive_columns`

**rules.yml Declaration**:
```yaml
- name: "remove_sprint_inactive_columns"
  trigger:
    type: ["PullRequest", "Issue"]
    condition: "item.column === 'New' || item.column === 'Parked' || item.column === 'Backlog'"
  action: "remove_sprint"
  skip_if: "item.sprint == null"
```

**Code Implementation**:
- **File**: `src/rules/sprints.js`
- **Function**: `processSprintRemoval()` (new items) and the existing-item sweep inside `src/index.js::processExistingItemsSprintAssignments()`.
- **Decision Engine**: `determineSprintAction()` returns `action: 'remove'` for inactive columns with assigned sprints (covered by `test/rules/sprint-batching.test.js`).
- **Mutation Helpers**: `removeItemSprint()` clears the Sprint field for single items; `clearItemSprintsBatch()` performs batched clears for existing items.

**Status**: ✅ **Fully Implemented**
- Removal logic honours skip conditions and DRY_RUN mode; batched removals logged via counters.

## 4. Assignee Rules

### Rule: `assign_authored_prs` (User Scope)

**rules.yml Declaration**:
```yaml
- name: "assign_authored_prs"
  trigger:
    type: "PullRequest"
    condition: "monitored.users.includes(item.author)"
  action: "add_assignee"
  value: "item.author"
  skip_if: "item.assignees.includes(item.author)"
```

**Code Implementation**:
- **File**: `src/rules/assignees.js`
- **Function**: `processAssignees()`
- **Rule Processing**: Uses `processAssigneeRules()` from unified processor
- **Action Execution**: `setItemAssignees()` in `assignees.js`
  - Resolves repository assignee roster via `fetchRepoAssignees()` (`src/github/api.js`)
  - Translates GitHub logins to node IDs with `getUserIdsBatched()` for minimal diff updates
  - Covered by `test/rules/assignees-delta.test.js`

**Implementation Details**:
1. `processAssignees()` processes assignee rules from `rules.yml`
2. Evaluates conditions via unified processor
3. Executes `add_assignee` action by calling `setItemAssignees()`

**Status**: ✅ **Fully Implemented** - Matches `rules.yml` declaration

## 5. Linked Issues Rules

### Rule: `linked_issue_inheritance`

**rules.yml Declaration**:
```yaml
- name: "linked_issue_inheritance"
  trigger:
    type: "LinkedIssue"
    condition: "!item.pr.closed || item.pr.merged"
  action: ["inherit_column", "inherit_assignees"]
  skip_if: "item.column === item.pr.column && item.assignees === item.pr.assignees"
```

**Code Implementation**:
- **File**: `src/rules/linked-issues-processor.js`
- **Function**: `processLinkedIssues()`
- **Rule Processing**: Uses `processLinkedIssueRules()` from unified processor

**Implementation Details**:
1. `processLinkedIssues()` gets linked issues from PR
2. Processes linked issue rules via `processLinkedIssueRules()`
3. **CRITICAL GAP**: `inherit_column` action exists but implementation is incomplete:
   - Line 68-73: Only sets column if `currentColumn` is provided and different
   - Doesn't properly inherit from PR column state
4. **CRITICAL GAP**: `inherit_assignees` action exists but:
   - Line 76-82: Gets PR assignees but doesn't properly handle inheritance
   - Skip condition not properly evaluated

**Status**: ⚠️ **Partially Implemented**
- ✅ Processor exists and processes rules
- ❌ `inherit_column` action incomplete (doesn't properly inherit from PR)
- ❌ `inherit_assignees` action incomplete (doesn't properly inherit from PR)
- ❌ Skip condition not properly evaluated

## Implementation Architecture

### Unified Rule Processor

**File**: `src/rules/processors/unified-rule-processor.js`

**Purpose**: Central processor for all rule types from `rules.yml`

**Functions**:
- `processRuleType(item, ruleType)`: Processes rules of a specific type
- `processAllRules(item)`: Processes all rule types for an item
- `processBoardItemRules(item)`: Backward compatibility for board_items
- `processLinkedIssueRules(item)`: Processes linked issue rules
- `processAssigneeRules(item)`: Processes assignee rules

**Flow**:
1. Load `rules.yml` configuration
2. Get rules for specified type (e.g., `board_items`, `columns`)
3. For each rule:
   - Evaluate `skip_if` condition (if present)
   - Evaluate `trigger.condition` (if skip condition not met)
   - If condition matches, format action and return
4. Return array of actions to execute

### Condition Evaluation

**File**: `src/rules/processors/validation.js`

**Purpose**: Evaluates JavaScript-like conditions from `rules.yml`

**Supported Conditions**:
- `monitored.users.includes(item.author)`
- `item.assignees.some(...)`
- `monitored.repos.includes(item.repository)`
- `item.column === 'New'`
- `!item.column`
- `item.column === 'Next' || item.column === 'Active'`
- `!item.pr.closed || item.pr.merged`

**Context Variables**:
- `item`: Current item being processed
- `monitored.users`: Array from `rules.yml` user_scope.monitored_users
- `monitored.repos`: Array from `rules.yml` repository_scope.repositories

### Event Payload Seeding

- **File**: `src/utils/event-items.js`
- **Purpose**: Hydrates GitHub Action payloads into GraphQL-like nodes (`PullRequest` / `Issue`).
- **Integration**: `src/index.js` calls `loadEventItems()` before `processAddItems()`; seed items skip expensive `getRecentItems()` calls.
- **Tests**: `test/utils/event-items.test.js`, `test/rules/add-items-event.test.js`.

### State Transition Validator

**File**: `src/utils/state-transition-validator.js`

**Purpose**: Validates column transitions against `rules.yml` validTransitions.

**Current Implementation**:
- `StateVerifier.initializeTransitionRules(boardConfig)` reloads transitions on every run (see `src/index.js`).
- `validateColumnTransition()` surfaces detailed rejection reasons; errors now block transitions instead of falling back.
- Regression coverage: `test/state-verifier-transitions.test.js` and `test/state-verifier-retry.test.cjs`.

**Remaining Considerations**:
- Linked issue workflows still bypass transition validation (future work when linked rules are rebuilt).

### Existing Item Sprint Sweep

- **Coordinator**: `processExistingItemsSprintAssignments()` in `src/index.js`
- **Decision Logic**: Reuses `determineSprintAction()` for assignments, historical backfill, and removals.
- **Batch Operations**: `setItemSprintsBatch()` and `clearItemSprintsBatch()` (in `src/rules/sprints.js`) apply GraphQL alias batching; covered by `test/rules/sprint-batching.test.js`.
- **Observability**: Counters (`existing.items.processed`, `existing.assignments.*`, `existing.removals.*`) surface sweep impact; respects `DRY_RUN`.

### GitHub API Helpers

- **File**: `src/github/api.js`
- **Caching**: `projectItemsCache` now updates immediately after `addItemToProject()` to avoid stale reads; `__resetProjectCaches()` available for tests.
- **Pagination Guard**: `getProjectItems()` invokes `shouldProceed()` before heavy pagination; behavior verified by `test/github/project-items-pagination.test.js`.
- **Assignee Delta Support**: `fetchRepoAssignees()` supplies repository assignee rosters used by `setItemAssignees()`.

## Summary of Gaps

### Critical Gaps

1. **Linked Issues Actions Incomplete**
   - `inherit_column`: Declared but implementation doesn't properly inherit from PR
   - `inherit_assignees`: Declared but implementation doesn't properly inherit from PR
   - Skip condition not properly evaluated

### Missing Features

None beyond the linked-issue work above. Future enhancements should be tracked in the gap analysis.

### Working Correctly

- ✅ Board addition rules (seeded event payloads + recent item search).
- ✅ Column assignment with strict `validTransitions` enforcement and retry handling.
- ✅ Sprint assignment/removal (new items and existing-item sweep with batching).
- ✅ Assignee delta updates via repository roster lookups.

## Next Steps

1. Finish linked issues `inherit_column` / `inherit_assignees` implementations and tests.
2. Extend transition validation to linked issue workflows once rebuilt.
3. Ensure new metrics (seeded items, existing sweep batches) surface in observability dashboards.

