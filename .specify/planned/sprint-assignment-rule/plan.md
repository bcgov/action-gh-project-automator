# Sprint Assignment Rule - Technical Plan

## Implementation Strategy

### Phase 1: Rule Definition
1. **Add new rule to rules.yml**
   ```yaml
   sprints:
     - name: 'remove_sprint_from_inactive_columns'
       description: 'Remove sprint assignment from New/Parked/Backlog columns'
       trigger:
         type: ['PullRequest', 'Issue']
         condition: "item.column === 'New' || item.column === 'Parked' || item.column === 'Backlog'"
       action: 'remove_sprint'
       skip_if: 'item.sprint == null'
   ```

### Phase 2: Code Implementation
1. **Extend `src/rules/sprints.js`**
   - Add `remove_sprint` action handler
   - Implement no-op guard for null sprint values
   - Add logging for sprint removal operations

2. **Update rule processor**
   - Ensure new rule is processed after existing sprint rules
   - Add validation for remove_sprint action

### Phase 3: Testing
1. **Unit tests in `test/processors/sprint-rules.test.js`**
   - Test sprint removal for each target column
   - Test no-op guard behavior
   - Test rule integration with existing logic

2. **Integration tests**
   - Test with real project data
   - Verify API call reduction with no-op guards

## Technical Decisions

### 1. Rule Processing Order
- **Decision**: Process remove_sprint rules after add_sprint rules
- **Rationale**: Ensures sprint assignment happens before removal logic

### 2. No-Op Guard Implementation
- **Decision**: Check `item.sprint == null` in skip_if condition
- **Rationale**: Prevents unnecessary API calls when sprint is already null

### 3. Action Naming
- **Decision**: Use `remove_sprint` action name
- **Rationale**: Clear, descriptive, follows existing naming patterns

## Implementation Steps

1. **Update rules.yml** with new sprint removal rule
2. **Extend sprints.js** with remove_sprint action handler
3. **Add no-op guard logic** to prevent unnecessary API calls
4. **Create unit tests** for all scenarios
5. **Test integration** with existing sprint rules
6. **Update documentation** with new rule behavior

## Risk Mitigation

- **Backward Compatibility**: New rule doesn't affect existing sprint assignment logic
- **Testing**: Comprehensive test coverage prevents regressions
- **No-Op Guards**: Prevent unnecessary API calls and rate limit issues
- **Gradual Rollout**: Rule can be enabled/disabled via configuration

