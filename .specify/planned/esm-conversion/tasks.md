# ESM Conversion - Actionable Tasks

## Task 1: Package Configuration
**Priority**: High
**Estimated Time**: 15 minutes

### Subtasks:
1.1. Update `package.json` to enable ESM
   - Add `"type": "module"` to package.json
   - Verify Node.js version requirement (>=20.0.0)

1.2. Verify dependency compatibility
   - Check that all dependencies support ESM
   - Verify Octokit packages work with ESM

### Acceptance Criteria:
- [ ] package.json has `"type": "module"`
- [ ] All dependencies are ESM-compatible
- [ ] No immediate errors on npm install

## Task 2: Convert Core Files
**Priority**: High
**Estimated Time**: 45 minutes

### Subtasks:
2.1. Convert `src/index.js` (main entry point)
   - Convert require() statements to import
   - Convert module.exports to export
   - Handle __dirname/__filename if used

2.2. Convert `src/github/api.js` (critical for Octokit)
   - Convert Octokit imports to ESM
   - Convert all other require() statements
   - Test that imports work

2.3. Convert `src/config/loader.js`
   - Convert require() statements
   - Handle file path resolution
   - Update exports

### Acceptance Criteria:
- [ ] src/index.js uses ESM syntax
- [ ] src/github/api.js imports Octokit successfully
- [ ] src/config/loader.js works with ESM
- [ ] No import/export errors

## Task 3: Convert Rule Processors
**Priority**: High
**Estimated Time**: 60 minutes

### Subtasks:
3.1. Convert main rule files
   - `src/rules/add-items.js`
   - `src/rules/assignees.js`
   - `src/rules/columns.js`
   - `src/rules/sprints.js`

3.2. Convert processor files
   - `src/rules/processors/board-items.js`
   - `src/rules/processors/column-rules.js`
   - `src/rules/processors/sprint-rules.js`
   - `src/rules/processors/unified-rule-processor.js`

3.3. Convert remaining rule files
   - `src/rules/linked-issues.js`
   - `src/rules/linked-issues-processor.js`

### Acceptance Criteria:
- [ ] All rule files use ESM syntax
- [ ] All imports/exports work correctly
- [ ] No circular dependency issues

## Task 4: Convert Utility Files
**Priority**: Medium
**Estimated Time**: 45 minutes

### Subtasks:
4.1. Convert core utilities
   - `src/utils/log.js`
   - `src/utils/rate-limit.js`
   - `src/utils/state-verifier.js`
   - `src/utils/state-transition-validator.js`

4.2. Convert remaining utilities
   - `src/utils/batch.js`
   - `src/utils/environment-validator.js`
   - `src/utils/graphql-cache.js`
   - `src/utils/validation-runner.js`

4.3. Convert config utilities
   - `src/config/schema.js`
   - `src/config/board-rules.js`

### Acceptance Criteria:
- [ ] All utility files use ESM syntax
- [ ] All imports/exports work correctly
- [ ] No path resolution issues

## Task 5: Convert Test Files
**Priority**: Medium
**Estimated Time**: 30 minutes

### Subtasks:
5.1. Convert test files to ESM
   - Update all test files in `test/` directory
   - Convert require() statements to import
   - Update test runners if needed

5.2. Verify test compatibility
   - Run all tests to ensure they pass
   - Fix any ESM-related test issues

### Acceptance Criteria:
- [ ] All test files use ESM syntax
- [ ] All tests pass
- [ ] Test runners work with ESM

## Task 6: Integration Testing
**Priority**: High
**Estimated Time**: 30 minutes

### Subtasks:
6.1. Test app startup
   - Verify app starts without ESM errors
   - Check that all modules load correctly
   - Verify Octokit packages work

6.2. Test core functionality
   - Test configuration loading
   - Test API connections
   - Test rule processing

6.3. End-to-end validation
   - Run the app with test data
   - Verify all functionality works
   - Check for any regressions

### Acceptance Criteria:
- [ ] App starts successfully
- [ ] All core functionality works
- [ ] No regressions from CommonJS version
- [ ] Octokit packages work correctly

## Task 7: Documentation and Cleanup
**Priority**: Low
**Estimated Time**: 15 minutes

### Subtasks:
7.1. Update documentation
   - Update README if needed
   - Document any ESM-specific requirements
   - Update any setup instructions

7.2. Code cleanup
   - Remove any unused imports
   - Ensure consistent ESM syntax
   - Add any missing file extensions

### Acceptance Criteria:
- [ ] Documentation is updated
- [ ] Code is clean and consistent
- [ ] No unused imports or exports
- [ ] All file extensions are correct


