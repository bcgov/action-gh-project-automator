# Task Breakdown

**Purpose**: Actionable tasks for SpecKit re-engineering  
**Based on**: Unified specification, gap analysis, and implementation plan  
**Organization**: By phase, with dependencies and priorities

## Phase 1: SpecKit Foundation ✅ COMPLETE

### ✅ 1.1 Create Constitution
- [x] Extract principles from code conventions
- [x] Document architecture decisions
- [x] Establish `rules.yml` as primary source principle
- [x] Create `memory/constitution.md`

### ✅ 1.2 Extract Requirements from rules.yml
- [x] Analyze all rule definitions
- [x] Document configuration structure
- [x] Identify declared vs. implemented features
- [x] Create `requirements-inventory.md`

### ✅ 1.3 Extract Implementation Details
- [x] Map rules.yml rules to code implementations
- [x] Document how rules are executed
- [x] Extract environment variables
- [x] Create `code-to-rules-mapping.md`

### ✅ 1.4 Gap Analysis
- [x] Compare declarations vs. implementations
- [x] Identify incomplete features
- [x] Document known bugs
- [x] Create `gap-analysis.md`

### ✅ 1.5 Unified Specification
- [x] Create system overview
- [x] Document architecture
- [x] Document configuration system
- [x] Document rule processing engine
- [x] Create `spec.md`

## Phase 2: Fix Critical Gaps (High Priority)

### 2.1 Fix validTransitions Enforcement

#### Task 2.1.1: Ensure validTransitions Loaded
- [ ] Review `StateVerifier.initializeTransitionRules()` implementation
- [ ] Verify it loads all `validTransitions` from `rules.yml` column rules
- [ ] Add logging to confirm rules are loaded
- [ ] Test: Verify rules are loaded on initialization
- **File**: `src/utils/state-verifier.js`
- **Dependencies**: None
- **Priority**: High

#### Task 2.1.2: Remove Backward Compatibility Fallback
- [ ] Remove try-catch fallback in `validateColumnTransition()` in `columns.js`
- [ ] Make validation strict - throw error on validation failure
- [ ] Update error handling to properly handle validation errors
- [ ] Test: Verify invalid transitions are blocked
- **File**: `src/rules/columns.js`
- **Dependencies**: 2.1.1
- **Priority**: High

#### Task 2.1.3: Add Transition Enforcement Tests
- [ ] Write test for valid transition (should be allowed)
- [ ] Write test for invalid transition (should be blocked)
- [ ] Write test for transition not in validTransitions (should be blocked)
- [ ] Verify tests pass
- **File**: `test/processors/columns-transition.test.js` (new)
- **Dependencies**: 2.1.2
- **Priority**: High

### 2.2 Complete Linked Issues inherit_column

#### Task 2.2.1: Get PR's Actual Column from Project Board
- [ ] Modify `processLinkedIssues()` to get PR's project item ID
- [ ] Call `getItemColumn(projectId, prProjectItemId)` to get PR's actual column
- [ ] Store PR's actual column for use in inheritance
- [ ] Test: Verify PR column is retrieved correctly
- **File**: `src/rules/linked-issues-processor.js`
- **Dependencies**: None
- **Priority**: High

#### Task 2.2.2: Implement Proper Column Inheritance
- [ ] Replace `currentColumn` parameter usage with PR's actual column
- [ ] Only set linked issue column if different from current
- [ ] Ensure inheritance uses PR's actual state
- [ ] Test: Verify column inheritance works correctly
- **File**: `src/rules/linked-issues-processor.js`
- **Dependencies**: 2.2.1
- **Priority**: High

#### Task 2.2.3: Add Column Inheritance Tests
- [ ] Write test for column inheritance from PR to linked issue
- [ ] Write test for skip when column already matches
- [ ] Write test for when PR column changes
- [ ] Verify tests pass
- **File**: `test/rules/linked-issues-inherit-column.test.js` (new)
- **Dependencies**: 2.2.2
- **Priority**: High

### 2.3 Complete Linked Issues inherit_assignees

#### Task 2.3.1: Get PR's Actual Assignees from Project Board
- [ ] Modify `processLinkedIssues()` to get PR's project item ID
- [ ] Call `getItemAssignees(projectId, prProjectItemId)` to get PR's actual assignees
- [ ] Store PR's actual assignees for use in inheritance
- [ ] Test: Verify PR assignees are retrieved correctly
- **File**: `src/rules/linked-issues-processor.js`
- **Dependencies**: None
- **Priority**: High

#### Task 2.3.2: Implement Proper Assignee Inheritance
- [ ] Replace API response usage with PR's actual assignees from project board
- [ ] Compare PR assignees with linked issue assignees
- [ ] Only set if different
- [ ] Ensure inheritance uses PR's actual state
- [ ] Test: Verify assignee inheritance works correctly
- **File**: `src/rules/linked-issues-processor.js`
- **Dependencies**: 2.3.1
- **Priority**: High

#### Task 2.3.3: Add Assignee Inheritance Tests
- [ ] Write test for assignee inheritance from PR to linked issue
- [ ] Write test for skip when assignees already match
- [ ] Write test for when PR assignees change
- [ ] Verify tests pass
- **File**: `test/rules/linked-issues-inherit-assignees.test.js` (new)
- **Dependencies**: 2.3.2
- **Priority**: High

### 2.4 Fix Skip Condition Evaluation

#### Task 2.4.1: Get Actual State for Skip Condition
- [ ] Get PR's actual column and assignees from project board
- [ ] Get linked issue's actual column and assignees
- [ ] Store both for skip condition evaluation
- [ ] Test: Verify actual state is retrieved correctly
- **File**: `src/rules/linked-issues-processor.js`
- **Dependencies**: 2.2.1, 2.3.1
- **Priority**: High

#### Task 2.4.2: Evaluate Skip Condition
- [ ] Evaluate skip condition: `item.column === item.pr.column && item.assignees === item.pr.assignees`
- [ ] Skip all actions if condition is true
- [ ] Log skip reason
- [ ] Test: Verify skip condition works correctly
- **File**: `src/rules/linked-issues-processor.js`
- **Dependencies**: 2.4.1
- **Priority**: High

#### Task 2.4.3: Add Skip Condition Tests
- [ ] Write test for skip when column and assignees match
- [ ] Write test for no skip when they don't match
- [ ] Write test for skip when column matches but assignees don't
- [ ] Write test for skip when assignees match but column doesn't
- [ ] Verify tests pass
- **File**: `test/rules/linked-issues-skip-condition.test.js` (new)
- **Dependencies**: 2.4.2
- **Priority**: High

## Phase 3: Rebuild Rule Processors (Medium Priority)

### 3.1 Rebuild Board Items Processor

#### Task 3.1.1: Review and Improve Board Items Processor
- [ ] Review `add-items.js` against `rules.yml` board_items rules
- [ ] Ensure all conditions evaluated correctly
- [ ] Improve error handling
- [ ] Add comprehensive logging
- **File**: `src/rules/add-items.js`
- **Dependencies**: Phase 2 complete
- **Priority**: Medium

#### Task 3.1.2: Enhance Board Items Tests
- [ ] Review existing tests
- [ ] Add tests for all board_items rules from `rules.yml`
- [ ] Test edge cases
- [ ] Verify test coverage
- **File**: `test/rules/add-items.test.js`
- **Dependencies**: 3.1.1
- **Priority**: Medium

### 3.2 Rebuild Column Processor

#### Task 3.2.1: Review and Improve Column Processor
- [ ] Review `columns.js` after Phase 2 fixes
- [ ] Ensure all edge cases handled
- [ ] Improve transition validation
- [ ] Add comprehensive logging
- **File**: `src/rules/columns.js`
- **Dependencies**: Phase 2 complete (2.1.x)
- **Priority**: Medium

#### Task 3.2.2: Enhance Column Tests
- [ ] Review existing tests
- [ ] Add tests for all column rules from `rules.yml`
- [ ] Test transition validation
- [ ] Test edge cases
- **File**: `test/rules/columns.test.js`
- **Dependencies**: 3.2.1
- **Priority**: Medium

### 3.3 Rebuild Sprint Processor

#### Task 3.3.1: Add Sprint Removal Rules to rules.yml
- [ ] Add sprint removal rules to `rules.yml` sprints section
- [ ] Define rules for inactive columns (New, Parked, Backlog)
- [ ] Document sprint removal behavior
- [ ] Test: Verify rules.yml validates
- **File**: `rules.yml`
- **Dependencies**: None
- **Priority**: Medium

#### Task 3.3.2: Implement Sprint Removal Logic
- [ ] Add `remove_sprint` action handling in `sprints.js`
- [ ] Implement sprint removal for inactive columns
- [ ] Add comprehensive logging
- [ ] Test: Verify sprint removal works
- **File**: `src/rules/sprints.js`
- **Dependencies**: 3.3.1
- **Priority**: Medium

#### Task 3.3.3: Add Sprint Removal Tests
- [ ] Write test for sprint removal in New column
- [ ] Write test for sprint removal in Parked column
- [ ] Write test for sprint removal in Backlog column
- [ ] Write test for skip when no sprint set
- **File**: `test/rules/sprints-removal.test.js` (new)
- **Dependencies**: 3.3.2
- **Priority**: Medium

### 3.4 Rebuild Assignee Processor

#### Task 3.4.1: Review and Improve Assignee Processor
- [ ] Review `assignees.js` against `rules.yml` assignee rules
- [ ] Ensure all conditions evaluated correctly
- [ ] Improve error handling
- [ ] Add comprehensive logging
- **File**: `src/rules/assignees.js`
- **Dependencies**: Phase 2 complete
- **Priority**: Medium

#### Task 3.4.2: Enhance Assignee Tests
- [ ] Review existing tests
- [ ] Add tests for all assignee rules from `rules.yml`
- [ ] Test edge cases
- [ ] Verify test coverage
- **File**: `test/rules/assignees.test.js`
- **Dependencies**: 3.4.1
- **Priority**: Medium

### 3.5 Rebuild Linked Issues Processor

#### Task 3.5.1: Review and Improve Linked Issues Processor
- [ ] Review `linked-issues-processor.js` after Phase 2 fixes
- [ ] Ensure all actions work correctly
- [ ] Improve error handling
- [ ] Add comprehensive logging
- **File**: `src/rules/linked-issues-processor.js`
- **Dependencies**: Phase 2 complete (2.2.x, 2.3.x, 2.4.x)
- **Priority**: Medium

#### Task 3.5.2: Enhance Linked Issues Tests
- [ ] Review existing tests
- [ ] Add tests for all linked_issues rules from `rules.yml`
- [ ] Test inherit_column action
- [ ] Test inherit_assignees action
- [ ] Test skip condition
- **File**: `test/rules/linked-issues.test.js`
- **Dependencies**: 3.5.1
- **Priority**: Medium

## Phase 4: Rebuild Configuration System (Medium Priority)

### 4.1 Improve Configuration Loading

#### Task 4.1.1: Review Configuration Loading
- [ ] Review `loader.js` against `rules.yml` schema
- [ ] Ensure all structures properly loaded
- [ ] Improve validation error messages
- [ ] Add comprehensive logging
- **File**: `src/config/loader.js`
- **Dependencies**: None
- **Priority**: Medium

#### Task 4.1.2: Enhance Configuration Tests
- [ ] Review existing tests
- [ ] Add tests for all `rules.yml` structures
- [ ] Test validation errors
- [ ] Test edge cases
- **File**: `test/config/loader.test.js`
- **Dependencies**: 4.1.1
- **Priority**: Medium

### 4.2 Improve Schema Validation

#### Task 4.2.1: Review Schema Validation
- [ ] Review `schema.js` against `rules.yml` structure
- [ ] Ensure all fields validated
- [ ] Improve error messages
- [ ] Add validation for edge cases
- **File**: `src/config/schema.js`
- **Dependencies**: None
- **Priority**: Medium

#### Task 4.2.2: Enhance Schema Tests
- [ ] Review existing tests
- [ ] Add tests for all schema validations
- [ ] Test invalid configurations
- [ ] Test edge cases
- **File**: `test/config/schema.test.js`
- **Dependencies**: 4.2.1
- **Priority**: Medium

## Phase 5: Rebuild State Verification (Medium Priority)

### 5.1 Improve State Verification

#### Task 5.1.1: Review State Verification
- [ ] Review `state-verifier.js` after Phase 2 fixes
- [ ] Ensure validTransitions enforced
- [ ] Improve retry logic
- [ ] Add comprehensive logging
- **File**: `src/utils/state-verifier.js`
- **Dependencies**: Phase 2 complete (2.1.x)
- **Priority**: Medium

#### Task 5.1.2: Enhance State Verification Tests
- [ ] Review existing tests
- [ ] Add tests for all verification types
- [ ] Test retry logic
- [ ] Test edge cases
- **File**: `test/utils/state-verifier.test.js`
- **Dependencies**: 5.1.1
- **Priority**: Medium

## Phase 6: Standardize Error Handling (Low Priority)

### 6.1 Standardize Error Patterns

#### Task 6.1.1: Review Error Handling Across Modules
- [ ] Review error handling in all rule processors
- [ ] Identify inconsistencies
- [ ] Document standard error patterns
- [ ] Create error handling guidelines
- **Files**: All rule processors
- **Dependencies**: None
- **Priority**: Low

#### Task 6.1.2: Implement Standard Error Handling
- [ ] Standardize error classification
- [ ] Consistent retry logic
- [ ] Better error messages
- [ ] Update all modules
- **Files**: All rule processors, utilities
- **Dependencies**: 6.1.1
- **Priority**: Low

## Phase 7: Enhance Testing (Ongoing)

### 7.1 Comprehensive Test Coverage

#### Task 7.1.1: Review Test Coverage
- [ ] Run test coverage analysis
- [ ] Identify gaps
- [ ] Document missing tests
- [ ] Prioritize test additions
- **Files**: All test files
- **Dependencies**: None
- **Priority**: Medium

#### Task 7.1.2: Add Missing Tests
- [ ] Add tests for all rules from `rules.yml`
- [ ] Add edge case tests
- [ ] Add error handling tests
- [ ] Add state verification tests
- **Files**: Test files as needed
- **Dependencies**: 7.1.1
- **Priority**: Medium

## Phase 8: GitHub Action Conversion (Future)

### 8.1 Create Action Structure

#### Task 8.1.1: Create action.yml
- [ ] Create `action.yml` with metadata
- [ ] Define inputs and outputs
- [ ] Document action usage
- [ ] Test: Verify action.yml is valid
- **File**: `action.yml` (new)
- **Dependencies**: Phases 1-7 complete
- **Priority**: Future

#### Task 8.1.2: Support Default rules.yml
- [ ] Create default `rules.yml` template
- [ ] Document how to override
- [ ] Support repo-root and custom paths
- [ ] Test: Verify default rules work
- **File**: `rules.yml.default` (new), action code
- **Dependencies**: 8.1.1
- **Priority**: Future

## Task Dependencies Summary

### Critical Path (Phase 2)
1. 2.1.1 → 2.1.2 → 2.1.3 (validTransitions)
2. 2.2.1 → 2.2.2 → 2.2.3 (inherit_column)
3. 2.3.1 → 2.3.2 → 2.3.3 (inherit_assignees)
4. (2.2.1 + 2.3.1) → 2.4.1 → 2.4.2 → 2.4.3 (skip condition)

### After Phase 2
- Phase 3 can start after Phase 2 complete
- Phase 4 can run in parallel with Phase 3
- Phase 5 can run in parallel with Phase 3
- Phase 6 can run anytime
- Phase 7 should run continuously

## Execution Order Recommendation

1. **Start with Phase 2** (Critical Gaps)
   - Highest impact, fixes broken functionality
   - Can be done incrementally
   - Each task validates before moving on

2. **Then Phase 3** (Rule Processors)
   - Improves quality of working code
   - Can be done one processor at a time

3. **Parallel Phases 4-7** (Infrastructure)
   - Lower priority
   - Ongoing improvements

4. **Phase 8** (Future)
   - After all phases complete
   - Convert to GitHub Action format

## Success Criteria

- [ ] Phase 2: All critical gaps fixed, tests pass
- [ ] Phase 3: All rule processors match `rules.yml` exactly
- [ ] Phase 4: Configuration system perfect
- [ ] Phase 5: State verification robust
- [ ] Phase 6: Error handling consistent
- [ ] Phase 7: Test coverage comprehensive
- [ ] Phase 8: GitHub Action format ready

