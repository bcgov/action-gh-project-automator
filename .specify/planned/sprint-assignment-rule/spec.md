# Sprint Assignment Rule Enhancement

## Issue Reference
- **GitHub Issue**: #66
- **Title**: feat(rules): disallow sprint assignment on New/Parked/Backlog
- **Priority**: Enhancement

## Problem Statement
Items moved to New, Parked, or Backlog columns should have no Sprint assigned. Currently, the system may assign sprints to items in these columns, which doesn't align with project management best practices.

## Requirements

### Functional Requirements
1. **Sprint Removal**: Items moved to New, Parked, or Backlog columns should have their sprint assignment removed
2. **No-Op Guards**: Avoid unnecessary API writes when sprint is already null
3. **Rule Implementation**: Add new rule to existing sprint assignment logic
4. **Test Coverage**: Comprehensive tests for all scenarios

### Non-Functional Requirements
1. **Performance**: No-op guards prevent unnecessary GitHub API calls
2. **Reliability**: Rule should work consistently across all item types (PRs, Issues)
3. **Maintainability**: Rule should integrate cleanly with existing sprint assignment system

## Acceptance Criteria
- [ ] Items moved to New column have sprint removed
- [ ] Items moved to Parked column have sprint removed
- [ ] Items moved to Backlog column have sprint removed
- [ ] No-op guards prevent API calls when sprint is already null
- [ ] Rule integrates with existing sprint assignment logic
- [ ] Comprehensive test coverage for all scenarios
- [ ] Rule is configurable via rules.yml

## Technical Constraints
- Must work with existing `src/rules/sprints.js` module
- Must maintain backward compatibility with current sprint rules
- Must use existing state verification and logging systems
- Must follow existing rule processor patterns

## Success Metrics
- Sprint removal works for all three target columns
- No unnecessary API calls (no-op guards working)
- All tests pass
- Rule is properly documented in rules.yml
