# Sprint Assignment Edge Cases

## Issue Reference
- **Source**: Real-world sprint assignment failures
- **Priority**: Medium
- **Type**: Edge Case Handling

## Problem Statement
Sprint assignment can fail in several edge cases that need to be handled gracefully to prevent project sync failures and maintain proper work tracking.

## Identified Edge Cases

### 1. **Sprint Coverage Gaps**
- **Problem**: Items completed during gaps in sprint coverage (e.g., between Sprint 71 and Sprint 72)
- **Current Behavior**: Throws "No sprint covers completion date" error
- **Desired Behavior**: Assign to next available sprint

### 2. **Missing Historical Sprints**
- **Problem**: GraphQL API not returning completed iterations
- **Current Behavior**: Only queries `iterations` field, missing `completedIterations`
- **Desired Behavior**: Query both active and completed iterations

### 3. **No Future Sprints**
- **Problem**: Items completed after the last configured sprint
- **Current Behavior**: Could throw errors or leave items unassigned
- **Desired Behavior**: Skip assignment gracefully with clear logging

## Requirements

### Functional Requirements
1. **Gap Handling**: Items completed during sprint gaps should be assigned to the next available sprint
2. **Complete Sprint Query**: Query both `iterations` and `completedIterations` fields
3. **Graceful Degradation**: Handle cases where no future sprint exists
4. **Clear Logging**: Provide informative messages for all edge cases
5. **Preserve Work History**: Ensure all completed work is tracked in a sprint when possible

### Non-Functional Requirements
1. **Reliability**: No project sync failures due to sprint assignment edge cases
2. **Performance**: Efficient sprint lookup and assignment
3. **Maintainability**: Clear, well-documented edge case handling
4. **Backward Compatibility**: Existing sprint assignment behavior unchanged

## Acceptance Criteria
- [ ] Items completed during sprint gaps are assigned to next available sprint
- [ ] Both active and completed iterations are queried from GitHub API
- [ ] No "No sprint covers completion date" errors
- [ ] Clear logging for all edge case scenarios
- [ ] Graceful handling when no future sprint exists
- [ ] All existing sprint assignment behavior preserved
- [ ] Comprehensive test coverage for edge cases

## Technical Implementation

### Sprint Query Enhancement
```javascript
// Query both active and completed iterations
const result = await graphql(`
  query($projectId: ID!) {
    node(id: $projectId) {
      ... on ProjectV2 {
        field(name: "Sprint") {
          ... on ProjectV2IterationField {
            configuration {
              iterations { id title duration startDate }
              completedIterations { id title duration startDate }
            }
          }
        }
      }
    }
  }
`);
```

### Gap Handling Logic
```javascript
if (!target) {
  // Find next available sprint after completion date
  const sortedIterations = iterations.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  const nextSprint = sortedIterations.find(sprint => {
    const sprintStart = new Date(sprint.startDate);
    return sprintStart > completionDate;
  });
  
  if (nextSprint) {
    // Assign to next sprint
    return assignToSprint(nextSprint);
  } else {
    // No future sprint - skip gracefully
    return { changed: false, reason: 'No future sprint available' };
  }
}
```

## Success Metrics
- [ ] Zero "No sprint covers completion date" errors in production
- [ ] All completed work is tracked in sprints when possible
- [ ] Project sync completes successfully even with edge cases
- [ ] Clear audit trail for all sprint assignment decisions
- [ ] Performance impact is minimal

## Related Issues
- Sprint assignment failures for Done items
- GitHub GraphQL API limitations
- Project sync reliability improvements
