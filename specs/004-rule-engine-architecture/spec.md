# Spec 004: Rule Engine Architecture and Stability

## Problem Statement

The GitHub Project Board automation requires a stable, predictable, and secure way to evaluate rules defined in `rules.yml`. Legacy implementations often relied on `eval()` or complex regex-based parsers which are prone to security vulnerabilities (code injection) and are difficult to debug or test comprehensively.

## Solution

We implement a **Unified Rule Processor** coupled with a **Hardcoded String Validator**. This architecture ensures that only pre-approved condition strings can be executed, providing a "whitelist" approach to rule evaluation.

### Key Components

1.  **Unified Rule Processor** (`unified-rule-processor.js`):
    *   A single entry point for all rule types (board items, columns, sprints, assignees, linked issues).
    *   Uses Dependency Injection for configuration and validation, making it 100% testable without network access.
    *   Deduplicates actions to prevent redundant API calls.

2.  **Rule Validation Engine** (`validation.js`):
    *   A singleton instance that handles lazy-loading of configuration.
    *   Implements a string-matching "whitelist" for conditions and skip rules.
    *   Provides high-performance, synchronous evaluation of item state.

3.  **Stability Hardening**:
    *   Strict Node 24 requirement via `.npmrc`.
    *   Native ES Module (ESM) architecture.
    *   "Ludicrous" test coverage requirements for core logic.

## Rules.yml Pattern

The engine supports the following standard `rules.yml` structure:

```yaml
rules:
  rule_type:
    - name: "Optional Name"
      trigger:
        type: "ItemType" # e.g., PullRequest or Issue
        condition: "hardcoded_condition_string"
      action: "action_name"
      value: "action_value"
      skip_if: "hardcoded_skip_string"
```

## Implementation Details

### Hardcoded Validator

The validator (`RuleValidation` class) uses explicit string comparisons:

| Condition String | Technical Implementation |
|------------------|--------------------------|
| `monitored.users.includes(item.author)` | `monitoredUsers.has(item.author.login)` |
| `item.column === 'Active'` | `item.column === 'Active'` |
| `!item.column` | `!item.column || item.column === 'None'` |
| `item.sprint === 'current'` | `item.sprint === 'current'` |

### Action Deduplication

Actions are deduplicated before execution to ensure that if multiple rules trigger the same action (e.g., setting a column to "Active"), it only happens once per run.

## Test Scenarios

### Path Tests
- [ ] Verify each rule type executes exactly once if conditions match.
- [ ] Verify skip rules correctly prevent execution.
- [ ] Verify multiple actions can be executed for a single rule (e.g., LinkedIssues).

### Edge Cases
- [ ] Item with missing fields (author, repository, etc.).
- [ ] Empty or malformed `rules.yml`.
- [ ] Non-matching condition strings (should fail gracefully).
- [ ] Conflict between multiple rules (deduplication behavior).

## Related Code
- `src/rules/processors/unified-rule-processor.js`
- `src/rules/processors/validation.js`
- `src/config/board-rules.js`
