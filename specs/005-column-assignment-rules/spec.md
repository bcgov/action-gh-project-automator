# Spec 005: Column Assignment Rules

## Problem Statement

Items added to the GitHub Project board need to be assigned to the correct initial column based on their type and status. Without automated column assignment, items end up in "None" or requires manual triaging from a massive "New" bucket. 

## Solution

Implement rule-based column assignment that triggers when an item is added to the board or when its state changes (e.g., a PR being opened).

### Rules.yml Patterns

#### 1. Default Column for Issues
Typically, new issues should go to a `New` or `Backlog` column.

```yaml
rules:
  columns:
    - name: "Default Issue Column"
      trigger:
        type: "Issue"
        condition: "!item.column"
      action: "set_column"
      value: "New"
      skip_if: "item.column"
```

#### 2. Default Column for Pull Requests
New PRs usually represent active work and should go to an `Active` column.

```yaml
rules:
  columns:
    - name: "Default PR Column"
      trigger:
        type: "PullRequest"
        condition: "!item.column"
      action: "set_column"
      value: "Active"
      skip_if: "item.column"
```

## Implementation Details

### Processor Logic
The `unified-rule-processor.js` evaluates these rules during the `columns` phase. 

1.  **Discovery**: It finds all rules in the `columns` section of `rules.yml`.
2.  **Validation**: For each rule, it checks the `type` and `condition`.
3.  **Action**: If triggered, it generates a `set_column` action with the specified `value`.
4.  **Deduplication**: If multiple rules try to set a column, only the first one (or the most specific one) wins via the deduplication engine.

### Valid Transitions
The `StateTransitionValidator.js` ensures that column moves are logical (e.g., you can't move from `Done` back to `New`). If a rule tries to perform an invalid transition, it will be blocked and logged as a warning.

## Test Scenarios

### Acceptance Criteria
1. ✅ New Issues are moved to "New" if they have no column.
2. ✅ New PRs are moved to "Active" if they have no column.
3. ✅ Items already in a column are skipped (idempotent).
4. ✅ Type-specific rules (Issue vs PR) correctly target the right items.

### Edge Cases
- **None/Null column**: Items in the "None" state are treated as having no column.
- **Missing Column Names**: If the target column (e.g., "Active") does not exist on the board, the API call will fail gracefully and skip the update.

## Related Code
- `src/rules/processors/unified-rule-processor.js`
- `src/rules/helpers/valid-transitions.js`
- `src/utils/state-transition-validator.js`
