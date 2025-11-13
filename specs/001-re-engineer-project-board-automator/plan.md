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

### Phase 2: Linked Issues Stabilization (High Priority)

**Goal**: Close the remaining runtime gap by finishing linked issue inheritance and adding observability.

#### 2.1 Complete Linked Issues inherit_column

**Problem**: `inherit_column` action incomplete - doesn't properly inherit from PR

**Current State**:
- Uses the column decided earlier in the run instead of the PR's actual project state
- Skip guard does not prevent redundant updates

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

#### 2.2 Complete Linked Issues inherit_assignees

**Problem**: `inherit_assignees` action incomplete - doesn't properly inherit from PR

**Current State**:
- Relies on API payload instead of project board state
- Skip guard does not compare normalized assignee sets

**Solution**:
1. Get PR's assignees from project board via `getItemAssignees()`
2. Compare with linked issue's assignees using set semantics
3. Only set if different
4. Properly evaluate skip condition

**Files to Modify**:
- `src/rules/linked-issues-processor.js` - Fix inherit_assignees logic

**Tests Needed**:
- Test assignee inheritance from PR to linked issue
- Test skip condition evaluation
- Test when PR assignees change

#### 2.3 Fix Skip Condition Evaluation

**Problem**: Skip condition not properly evaluated for linked issues

**Current State**:
- Skip condition declared but not evaluated using live board state
- Uses shallow equality without normalization

**Solution**:
1. Get PR's actual column and assignees from project board
2. Get linked issue's actual column and assignees
3. Evaluate skip condition: `item.column === item.pr.column && item.assignees === item.pr.assignees`
4. Skip if condition is true with clear logging

**Files to Modify**:
- `src/rules/linked-issues-processor.js` - Add skip condition evaluation

**Tests Needed**:
- Test skip condition when column and assignees match
- Test skip condition when they don't match

#### 2.4 Add Linked Issue Observability

**Problem**: No visibility into inheritance attempts, skips, or errors.

**Solution**:
1. Add counters for `linked.actions.column.assigned`, `linked.actions.assignees.assigned`, `linked.actions.skipped`, `linked.actions.failed`.
2. Include summary output in end-of-run report.
3. Wire metrics into existing logger/state summary utilities.

**Files to Modify**:
- `src/rules/linked-issues-processor.js`
- `src/utils/log.js` (if new counters require formatting)

**Tests Needed**:
- Unit tests asserting counter increments via dependency injection.
- Update integration tests to assert summary output (optional in near term).

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

**Current State**: ✅ Strict transitions now enforced; focus shifts to resiliency.

**Improvements**:
- Expand regression tests for inactive/closed item routing.
- Ensure batch operations (`setItemColumnsBatch`) cover large updates.
- Harden logging/error surfacing.

**Files to Modify**:
- `src/rules/columns.js`
- `test/rules/columns*.test.js` (expand coverage)

#### 3.3 Rebuild Sprint Processor

**Current State**: ✅ Assignment/removal implemented with batching.

**Improvements**:
- Validate historical sprint lookup edge cases (future-dated completions).
- Ensure existing-item sweep respects rate-limit guardrails.
- Add integration-style tests for batching helpers.

**Files to Modify**:
- `src/rules/sprints.js`
- `test/rules/sprint-batching.test.js` (extend scenarios)

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

**Goal**: Strengthen verification tooling now that transitions are strict.

**Current State**: ✅ Core verification and retry logic working, but reporting can improve.

**Improvements**:
- Expand reporting on retry outcomes (success vs. exhausted).
- Ensure linked-issue verification hooks exist once inheritance is fixed.
- Add comprehensive tests around retryWithTracking metrics.

**Files to Modify**:
- `src/utils/state-verifier.js`
- `src/utils/state-transition-validator.js` (follow-up tweaks if needed)

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

1. **Phase 2 First**: Stabilize linked issues (inheritance + observability)
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

2. **Linked Issues Changes Breaking Workflows**
   - **Mitigation**: Test thoroughly, provide clear documentation
3. **Test Coverage Gaps**
   - **Mitigation**: Write tests from specs, aim for high coverage

### Rollback Plan

1. **Git Revert**: Revert commits if issues found
2. **Feature Flags**: Consider feature flags for major changes
3. **Monitoring**: Monitor logs for errors
4. **Quick Fixes**: Have fix branches ready

## Success Metrics

### Phase 2 (Linked Issues)
- [ ] inherit_column works correctly
- [ ] inherit_assignees works correctly
- [ ] Skip condition evaluated correctly
- [ ] Linked issue metrics recorded
- [ ] All tests pass

### Phase 3 (Rule Processors)
- [ ] All rule processors match `rules.yml` exactly
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

- **Phase 2**: 2-3 days (linked issues stabilization)
- **Phase 3**: 1-2 weeks (rule processors)
- **Phase 4-7**: 1-2 weeks (infrastructure)
- **Total**: 3-4 weeks for complete rebuild

## Dependencies

- SpecKit specs must be complete (✅ DONE)
- Tests must be written from specs
- `rules.yml` must be stable
- GitHub API access for testing

## Next Steps

1. Start Phase 2: Stabilize linked issues
2. Write tests from specs first
3. Implement fixes
4. Validate against specs
5. Move to Phase 3

