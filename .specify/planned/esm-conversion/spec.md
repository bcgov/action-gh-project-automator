# ESM Conversion - Specification

## Project Overview

Convert the action-gh-project-automator from CommonJS to ESM (ECMAScript Modules) to resolve compatibility issues with newer package versions and modernize the codebase.

## Current State

The project currently uses CommonJS modules:
- `require()` statements for imports
- `module.exports` for exports
- `package.json` without `"type": "module"`

This causes compatibility issues with newer versions of packages like `@octokit/rest` and `@octokit/graphql` which are ESM-only.

## Problem Statement

**Error**: `ERR_REQUIRE_ESM: require() of ES Module not supported`

**Root Cause**: Newer Octokit packages (v22+) are ESM-only and cannot be imported using CommonJS `require()` statements.

**Impact**:
- App fails to start
- Cannot test recent fixes (eventual consistency, concurrency)
- Blocks further development

## Requirements

### 1. Module System Conversion
- Convert all `require()` statements to `import` statements
- Convert all `module.exports` to `export` statements
- Update `package.json` to use `"type": "module"`

### 2. Compatibility
- Maintain all existing functionality
- Preserve API contracts
- Ensure all tests continue to work
- No breaking changes to external interfaces

### 3. Modern Standards
- Use ESM syntax throughout
- Support for top-level await (if needed)
- Better tree-shaking capabilities
- Future-proof for newer packages

## Success Criteria

1. **App starts successfully** without ESM errors
2. **All existing functionality works** as before
3. **Tests pass** with ESM syntax
4. **Newer packages work** (Octokit v22+)
5. **No breaking changes** to external APIs

## Technical Approach

### Phase 1: Package Configuration
- Update `package.json` to `"type": "module"`
- Verify Node.js version compatibility (>=20.0.0)

### Phase 2: Import/Export Conversion
- Convert all `require()` to `import` statements
- Convert all `module.exports` to `export` statements
- Handle default exports appropriately
- Update file extensions if needed (`.js` to `.mjs`)

### Phase 3: Testing and Validation
- Run all existing tests
- Verify app functionality
- Test with newer package versions
- Ensure no regressions

## Constraints

- Must maintain backward compatibility with existing `rules.yml` format
- Must preserve all existing functionality
- Must work with current GitHub Projects v2 API
- Must support existing rule processors without breaking changes
- Must be compatible with Node.js >=20.0.0

## Risks and Mitigation

**Risk**: Breaking existing functionality
**Mitigation**: Incremental conversion with thorough testing

**Risk**: Test compatibility issues
**Mitigation**: Update test files to use ESM syntax

**Risk**: Third-party package compatibility
**Mitigation**: Verify all dependencies support ESM

## Dependencies

- Node.js >=20.0.0 (already required)
- All existing npm packages (verify ESM compatibility)
- No new dependencies required

## Timeline

**Estimated Time**: 2-3 hours
- Package configuration: 30 minutes
- Import/export conversion: 1-2 hours
- Testing and validation: 30-60 minutes

## Acceptance Criteria

- [ ] App starts without ESM errors
- [ ] All tests pass
- [ ] All existing functionality works
- [ ] Newer Octokit packages work
- [ ] No breaking changes to external APIs
- [ ] Code follows ESM best practices


