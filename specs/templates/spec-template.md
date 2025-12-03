# Feature: [Feature Name]

## Problem Statement

[Describe the problem this feature solves. Include context, user impact, and why this feature is needed.]

**Root Causes:**
1. [Primary root cause]
2. [Secondary root cause if applicable]

**Impact:**
- [Impact on users/workflow]
- [Business or technical impact]

## Solution

[High-level description of the solution. What does this feature do?]

### Rules.yml Pattern

[If this feature adds/modifies rules.yml patterns, document them here with example YAML configuration.]

Users configure this via the `[rule_name]` rule in their `rules.yml`:

```yaml
# Example rules.yml configuration
automation:
  # ... configuration pattern ...
```

**Location in rules.yml**: [Lines or section reference]

## Implementation Details

[Describe how the feature is implemented. Include:]

### Search/Processing Logic

[How the feature searches for or processes items]

### Rule Processing

[How rules are evaluated and applied]

### Board Item Evaluation

[How items are evaluated for board addition/updates]

## Test Scenarios

### Acceptance Criteria

1. [ ] [Criterion 1]
2. [ ] [Criterion 2]
3. [ ] [Criterion 3]

### Test Cases

**Scenario 1: [Scenario Name]**
- [Setup/Context]
- Expected: [Expected behavior]

**Scenario 2: [Scenario Name]**
- [Setup/Context]
- Expected: [Expected behavior]

## Edge Cases

1. **[Edge Case Name]**: [Description and how it's handled]
2. **[Edge Case Name]**: [Description and how it's handled]

## Related Code

### Files Modified

- `[file path]`: [What was changed]
- `[file path]`: [What was changed]

### Related Pull Request

- PR #[number]: [PR title]
  - Link: [PR URL]

## Implementation Notes

[Additional technical notes, decisions, or context that future developers should know]

## Future Enhancements

[Potential improvements or follow-up work]

## References

- GitHub Issue: [Issue URL if applicable]
- Implementation PR: [PR URL]
- Rules.yml documentation: See root `rules.yml` file
- Related specs: [Links to related feature specs]
