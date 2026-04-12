# Spec 006: Sprint Assignment Rules

## Problem Statement

Sprint management in GitHub Projects v2 is often manual and error-prone. Items in active columns (like `Active` or `Next`) should automatically be assigned to the current sprint. Conversely, items that are moved to inactive columns or "Parked" should have their sprint cleared to avoid cluttering future sprint reports.

## Solution

Implement automated sprint assignment and clearing based on the item's current column.

### Rules.yml Patterns

#### 1. Current Sprint Assignment
Assign items to the "current" sprint if they are in an active column.

```yaml
rules:
  sprints:
    - name: "Current Sprint Assignment"
      trigger:
        type: "PullRequest|Issue"
        condition: "item.column === 'Next' || item.column === 'Active'"
      action: "set_sprint"
      value: "current"
      skip_if: "item.sprint === 'current'"
```

#### 2. Sprint Clearing
Clear the sprint if an item is moved to an inactive column.

```yaml
rules:
  sprints:
    - name: "Sprint Clearing for Inactive Items"
      trigger:
        type: "PullRequest|Issue"
        condition: "item.column === 'New' || item.column === 'Parked' || item.column === 'Backlog'"
      action: "clear_sprint"
      skip_if: "item.sprint == null"
```

## Implementation Details

### Current vs. Next Sprint
The automation supports the special value `current`. The metadata resolver calculates the ID of the current sprint based on the board's iteration field and today's date.

### Sync Engine Integration
The `sync-engine` handles the actual GraphQL mutation for the sprint field. Sprint IDs are resolved once per run to minimize API calls.

## Test Scenarios

### Acceptance Criteria
1. ✅ Items in `Active` column get the `current` sprint assigned.
2. ✅ Items in `Parked` column have their sprint removed.
3. ✅ Items with the correct sprint already assigned are skipped.

### Edge Cases
- **No Active Sprint**: If the project does not have an active sprint configured, the automation should log a warning and continue without failing the run.
- **Multiple Iteration Fields**: The system expects exactly one field named "Sprint" (or similar configurable name).

## Related Code
- `src/rules/processors/unified-rule-processor.js`
- `src/github/api.js` (Sprint resolution logic)
