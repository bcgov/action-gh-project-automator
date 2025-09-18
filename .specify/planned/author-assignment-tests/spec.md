# Author Assignment Test Coverage Enhancement

## Issue Reference
- **GitHub Issue**: #68
- **Title**: test: improve author assignment coverage across scenarios
- **Priority**: Enhancement

## Problem Statement
Current test coverage for author assignment is insufficient. We need comprehensive tests for combinations of monitored user vs repository scenarios to ensure author attribution propagates correctly and assignment behavior works as expected across all use cases.

## Current State Analysis
Based on the existing codebase, author assignment rules include:
- PRs authored by monitored users (any repository)
- PRs assigned to monitored users (any repository)
- PRs from monitored repositories (any author)
- Issues from monitored repositories (any author)

## Requirements

### Functional Requirements
1. **Monitored User + Any Repository**: Test author assignment when monitored user authors PR in any repo
2. **Monitored User + Monitored Repository**: Test author assignment when monitored user authors PR in monitored repo
3. **Any User + Monitored Repository**: Test author assignment when any user authors PR in monitored repo
4. **Assignment Propagation**: Test that author attribution correctly propagates to assignee field
5. **Edge Cases**: Test scenarios with multiple assignees, existing assignees, etc.

### Test Coverage Requirements
1. **Scenario Matrix**: Cover all combinations of user/repo monitoring
2. **Assignment Logic**: Verify correct assignment behavior in each scenario
3. **Propagation Testing**: Ensure author attribution flows correctly
4. **No-Op Guards**: Test that unnecessary assignments are skipped
5. **Error Handling**: Test assignment failures and edge cases

### Non-Functional Requirements
1. **Performance**: Tests should run quickly and not impact CI/CD
2. **Reliability**: Tests should be deterministic and not flaky
3. **Maintainability**: Tests should be easy to understand and modify
4. **Coverage**: Achieve comprehensive coverage of assignment scenarios

## Acceptance Criteria
- [ ] Test matrix covers all user/repo monitoring combinations
- [ ] Author attribution propagation is verified in all scenarios
- [ ] Assignment behavior is correct for each test case
- [ ] No-op guards are tested (skip when already assigned)
- [ ] Edge cases are covered (multiple assignees, existing assignments)
- [ ] Error scenarios are tested (assignment failures)
- [ ] Test performance is acceptable (< 5 seconds per test suite)
- [ ] All tests are deterministic and reliable

## Technical Constraints
- Must work with existing `src/rules/assignees.js` module
- Must use existing test framework and mocking infrastructure
- Must maintain compatibility with current assignment rules
- Must follow existing test patterns and conventions
- Must integrate with existing state verification systems

## Test Scenarios Matrix

### Scenario 1: Monitored User + Any Repository
- **Setup**: DerekRoberts authors PR in non-monitored repo
- **Expected**: Author assigned to PR
- **Test**: Verify assignment occurs

### Scenario 2: Monitored User + Monitored Repository
- **Setup**: DerekRoberts authors PR in monitored repo
- **Expected**: Author assigned to PR (both rules may trigger)
- **Test**: Verify assignment occurs, test deduplication

### Scenario 3: Any User + Monitored Repository
- **Setup**: Non-monitored user authors PR in monitored repo
- **Expected**: No author assignment (only repo rule triggers)
- **Test**: Verify no assignment occurs

### Scenario 4: Assignment Propagation
- **Setup**: PR already has assignees, author is monitored user
- **Expected**: Author added to existing assignees
- **Test**: Verify author is added without removing existing assignees

### Scenario 5: No-Op Guards
- **Setup**: PR already assigned to author
- **Expected**: No additional assignment attempt
- **Test**: Verify no API call is made

## Success Metrics
- [ ] 100% test coverage for author assignment scenarios
- [ ] All test scenarios pass consistently
- [ ] Test execution time < 5 seconds
- [ ] No flaky tests in CI/CD
- [ ] Clear test documentation and naming
- [ ] Integration with existing test infrastructure
