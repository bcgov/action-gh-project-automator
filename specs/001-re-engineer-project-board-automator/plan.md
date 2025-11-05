# Implementation Plan

**Purpose**: Technical plan for guided rebuild using SpecKit specs as blueprint  
**Based on**: Unified specification, gap analysis, and code-to-rules mapping  
**Strategy**: Systematic rebuild to match `rules.yml` exactly

## Architecture Decisions

### Rebuild Strategy

**Approach**: Guided rebuild (not full rewrite)
- Keep: Architecture pattern, `rules.yml` format, test infrastructure structure
- Rebuild: Rule processors, configuration loading, error handling, state management
- Rationale: 80%+ codebase is fragile, but architecture pattern is sound

### Key Principles

1. **rules.yml is Primary Source**: All business logic must match `rules.yml` exactly
2. **Test-Driven**: Write tests from `rules.yml` specs, then implement
3. **Incremental**: Rebuild one module at a time, verify each step
4. **Backward Compatible**: Maintain existing `rules.yml` format
5. **Spec-Driven**: Use unified spec as blueprint for all changes

## Implementation Phases

### Phase 1: Foundation (Complete)

✅ **Status**: COMPLETE
- ✅ Constitution created
- ✅ Requirements inventory extracted
- ✅ Code-to-rules mapping documented
- ✅ Gap analysis complete
- ✅ Unified specification created

### Phase 2: Fix Critical Gaps (High Priority)

**Goal**: Fix the 4 critical gaps identified in gap analysis

#### 2.1 Fix validTransitions Enforcement

**Problem**: `validTransitions` declared in `rules.yml` but not strictly enforced

**Current State**:
- `StateTransitionValidator` exists but not fully integrated
- `validateColumnTransition()` has backward compatibility fallback
- ValidTransitions from `rules.yml` may not be loaded

**Solution**:
1. Ensure `StateVerifier.initializeTransitionRules()` loads all `validTransitions` from `rules.yml`
2. Remove backward compatibility fallback in `columns.js`
3. Make validation strict - block invalid transitions
4. Add tests for transition enforcement

**Files to Modify**:
- `src/utils/state-transition-validator.js` - Ensure rules loaded
- `src/rules/columns.js` - Remove fallback, enforce strict validation
- `src/utils/state-verifier.js` - Ensure initialization loads validTransitions

**Tests Needed**:
- Test valid transitions are allowed
- Test invalid transitions are blocked
- Test validTransitions from rules.yml are respected

#### 2.2 Complete Linked Issues inherit_column

**Problem**: `inherit_column` action incomplete - doesn't properly inherit from PR

**Current State**:
- Uses `currentColumn` parameter instead of PR's actual column
- Doesn't check PR's actual state from project board

**Solution**:
1. Get PR's actual column from project board via `getItemColumn()`
2. Use PR's actual column for inheritance
3. Only set if different from linked issue's current column
4. Properly evaluate skip condition

**Files to Modify**:
- `src/rules/linked-issues-processor.js` - Fix inherit_column logic

**Tests Needed**:
- Test column inheritance from PR to linked issue
- Test skip condition evaluation
- Test when PR column changes

#### 2.3 Complete Linked Issues inherit_assignees

**Problem**: `inherit_assignees` action incomplete - doesn't properly inherit from PR

**Current State**:
- Gets assignees from API response instead of project board
- Doesn't properly evaluate skip condition

**Solution**:
1. Get PR's assignees from project board via `getItemAssignees()`
2. Compare with linked issue's assignees
3. Only set if different
4. Properly evaluate skip condition

**Files to Modify**:
- `src/rules/linked-issues-processor.js` - Fix inherit_assignees logic

**Tests Needed**:
- Test assignee inheritance from PR to linked issue
- Test skip condition evaluation
- Test when PR assignees change

#### 2.4 Fix Skip Condition Evaluation

**Problem**: Skip condition not properly evaluated for linked issues

**Current State**:
- Skip condition declared but not evaluated
- Uses API response instead of project board state

**Solution**:
1. Get PR's actual column and assignees from project board
2. Get linked issue's actual column and assignees
3. Evaluate skip condition: `item.column === item.pr.column && item.assignees === item.pr.assignees`
4. Skip if condition is true

**Files to Modify**:
- `src/rules/linked-issues-processor.js` - Add skip condition evaluation

**Tests Needed**:
- Test skip condition when column and assignees match
- Test skip condition when they don't match

### Phase 3: Rebuild Rule Processors (Medium Priority)

**Goal**: Rebuild rule processors to match `rules.yml` exactly

#### 3.1 Rebuild Board Items Processor

**Current State**: ✅ Mostly working, but can be improved

**Improvements**:
- Ensure all conditions from `rules.yml` are evaluated correctly
- Improve error handling
- Add comprehensive tests

**Files to Modify**:
- `src/rules/add-items.js`
- `src/rules/processors/unified-rule-processor.js`

#### 3.2 Rebuild Column Processor

**Current State**: ⚠️ Works but validTransitions not enforced (fixing in Phase 2)

**Improvements**:
- After Phase 2 fixes, ensure all edge cases handled
- Improve transition validation
- Add comprehensive tests

**Files to Modify**:
- `src/rules/columns.js` (after Phase 2 fixes)

#### 3.3 Rebuild Sprint Processor

**Current State**: ✅ Working, but can add sprint removal

**Improvements**:
- Add sprint removal for inactive columns (Issue #66)
- Improve edge case handling
- Add comprehensive tests

**Files to Modify**:
- `src/rules/sprints.js` - Add sprint removal logic
- `rules.yml` - Add sprint removal rules

#### 3.4 Rebuild Assignee Processor

**Current State**: ✅ Working

**Improvements**:
- Ensure all conditions evaluated correctly
- Improve error handling
- Add comprehensive tests

**Files to Modify**:
- `src/rules/assignees.js`

#### 3.5 Rebuild Linked Issues Processor

**Current State**: ⚠️ Partially working (fixing in Phase 2)

**Improvements**:
- After Phase 2 fixes, ensure all actions work correctly
- Improve error handling
- Add comprehensive tests

**Files to Modify**:
- `src/rules/linked-issues-processor.js` (after Phase 2 fixes)

### Phase 4: Rebuild Configuration System (Medium Priority)

**Goal**: Ensure configuration system perfectly matches `rules.yml` schema

**Current State**: ✅ Mostly working

**Improvements**:
- Ensure all `rules.yml` structures are properly loaded
- Improve validation error messages
- Add comprehensive tests

**Files to Modify**:
- `src/config/loader.js`
- `src/config/schema.js`
- `src/config/board-rules.js`

### Phase 5: Rebuild State Verification (Medium Priority)

**Goal**: Ensure state verification enforces `rules.yml` outcomes

**Current State**: ✅ Working but can be improved

**Improvements**:
- Ensure validTransitions are enforced (from Phase 2)
- Improve retry logic
- Add comprehensive tests

**Files to Modify**:
- `src/utils/state-verifier.js`
- `src/utils/state-transition-validator.js`

### Phase 6: Standardize Error Handling (Low Priority)

**Goal**: Consistent error handling patterns across all modules

**Current State**: ⚠️ Inconsistent patterns

**Improvements**:
- Standardize error classification
- Consistent retry logic
- Better error messages

**Files to Modify**:
- All rule processors
- All utilities

### Phase 7: Enhance Testing (Ongoing)

**Goal**: Comprehensive test coverage for all rules

**Current State**: ⚠️ Some tests exist but gaps identified

**Improvements**:
- Test all rules from `rules.yml`
- Test edge cases
- Test error handling
- Test state verification

**Files to Create/Modify**:
- Test files for each rule processor
- Integration tests
- Edge case tests

### Phase 8: GitHub Action Conversion (Future)

**Goal**: Convert to reusable GitHub Action format

**Steps**:
1. Create `action.yml` with metadata
2. Support default `rules.yml` in action repo
3. Support custom `rules.yml` path override
4. Support reading from consuming repo
5. Update documentation

## Migration Strategy

### Incremental Approach

1. **Phase 2 First**: Fix critical gaps (validTransitions, linked issues)
   - Highest impact, lowest risk
   - Can be done incrementally
   - Tests validate each fix

2. **Phase 3 Next**: Rebuild rule processors
   - One processor at a time
   - Test after each rebuild
   - Maintain backward compatibility

3. **Phases 4-7**: Infrastructure improvements
   - Lower priority
   - Can be done in parallel
   - Ongoing improvements

### Testing Strategy

1. **Test from Specs**: Write tests based on `rules.yml` specifications
2. **Test Before Fix**: Ensure existing tests pass before changes
3. **Test After Fix**: Ensure new tests pass after changes
4. **Regression Tests**: Ensure no existing functionality breaks

### Rollout Plan

1. **Development**: Work on feature branch
2. **Testing**: Run all tests locally
3. **Review**: Code review against specs
4. **Merge**: Merge to main after validation
5. **Deploy**: Self-host from this repo first
6. **Monitor**: Watch for issues
7. **Iterate**: Fix issues as they arise

## Risk Mitigation

### Risks

1. **Breaking Existing Functionality**
   - **Mitigation**: Comprehensive tests, incremental changes, backward compatibility

2. **ValidTransitions Breaking Workflows**
   - **Mitigation**: Strict validation but clear error messages, allow configuration override

3. **Linked Issues Changes Breaking Workflows**
   - **Mitigation**: Test thoroughly, provide clear documentation

4. **Test Coverage Gaps**
   - **Mitigation**: Write tests from specs, aim for high coverage

### Rollback Plan

1. **Git Revert**: Revert commits if issues found
2. **Feature Flags**: Consider feature flags for major changes
3. **Monitoring**: Monitor logs for errors
4. **Quick Fixes**: Have fix branches ready

## Success Metrics

### Phase 2 (Critical Gaps)
- [ ] validTransitions strictly enforced
- [ ] inherit_column works correctly
- [ ] inherit_assignees works correctly
- [ ] Skip condition evaluated correctly
- [ ] All tests pass

### Phase 3 (Rule Processors)
- [ ] All rule processors match `rules.yml` exactly
- [ ] Sprint removal implemented
- [ ] All tests pass
- [ ] No regressions

### Phase 4-7 (Infrastructure)
- [ ] Configuration system perfect
- [ ] State verification robust
- [ ] Error handling consistent
- [ ] Test coverage comprehensive

### Overall
- [ ] 100% of `rules.yml` rules fully implemented
- [ ] All gaps closed
- [ ] No bugs reintroduced
- [ ] Ready for GitHub Action conversion

## Timeline Estimate

- **Phase 2**: 2-3 days (critical gaps)
- **Phase 3**: 1-2 weeks (rule processors)
- **Phase 4-7**: 1-2 weeks (infrastructure)
- **Total**: 3-4 weeks for complete rebuild

## Dependencies

- SpecKit specs must be complete (✅ DONE)
- Tests must be written from specs
- `rules.yml` must be stable
- GitHub API access for testing

## Next Steps

1. Start Phase 2: Fix critical gaps
2. Write tests from specs first
3. Implement fixes
4. Validate against specs
5. Move to Phase 3

