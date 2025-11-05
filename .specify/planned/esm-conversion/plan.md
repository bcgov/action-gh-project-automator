# ESM Conversion - Technical Plan

## Implementation Strategy

### Phase 1: Package Configuration
1. **Update package.json**
   - Add `"type": "module"` to enable ESM
   - Verify Node.js version requirement (>=20.0.0)
   - Check all dependencies for ESM compatibility

2. **File Extension Strategy**
   - Keep `.js` extensions (Node.js supports ESM in `.js` files with `"type": "module"`)
   - No need to rename files to `.mjs`

### Phase 2: Import/Export Conversion
1. **Convert require() statements**
   - Replace `const { something } = require('package')` with `import { something } from 'package'`
   - Replace `const something = require('package')` with `import something from 'package'`
   - Handle relative imports: `require('./file')` → `import from './file.js'`

2. **Convert module.exports**
   - Replace `module.exports = something` with `export default something`
   - Replace `module.exports = { a, b }` with `export { a, b }`
   - Handle mixed exports appropriately

3. **Handle CommonJS patterns**
   - Convert `__dirname` and `__filename` usage (not available in ESM)
   - Update any CommonJS-specific patterns

### Phase 3: Testing and Validation
1. **Update test files**
   - Convert test files to ESM syntax
   - Update test runners if needed
   - Verify all tests pass

2. **Integration testing**
   - Test app startup
   - Test all major functionality
   - Verify API compatibility

## Technical Decisions

### 1. File Extensions
- **Decision**: Keep `.js` extensions
- **Rationale**: Node.js supports ESM in `.js` files with `"type": "module"`, no need to rename

### 2. Import Paths
- **Decision**: Add `.js` extension to relative imports
- **Rationale**: ESM requires explicit file extensions for relative imports

### 3. Default vs Named Exports
- **Decision**: Use appropriate export type based on usage
- **Rationale**: Maintain existing API contracts while following ESM best practices

### 4. __dirname/__filename
- **Decision**: Use `import.meta.url` and `fileURLToPath` for path resolution
- **Rationale**: ESM equivalent for CommonJS path utilities

## Implementation Steps

1. **Update package.json** to enable ESM
2. **Convert src/index.js** (main entry point)
3. **Convert src/github/api.js** (Octokit imports)
4. **Convert all other source files** systematically
5. **Update test files** to use ESM
6. **Test and validate** all functionality

## Files to Convert

### Core Files
- `src/index.js` - Main entry point
- `src/github/api.js` - Octokit imports (critical)
- `src/config/loader.js` - Configuration loading
- `src/config/schema.js` - Schema validation
- `src/config/board-rules.js` - Board rules

### Rule Processors
- `src/rules/add-items.js`
- `src/rules/assignees.js`
- `src/rules/columns.js`
- `src/rules/linked-issues.js`
- `src/rules/linked-issues-processor.js`
- `src/rules/sprints.js`

### Processors
- `src/rules/processors/board-items.js`
- `src/rules/processors/column-rules.js`
- `src/rules/processors/shared-validator.js`
- `src/rules/processors/sprint-rules.js`
- `src/rules/processors/unified-rule-processor.js`
- `src/rules/processors/validation.js`

### Utilities
- `src/utils/batch.js`
- `src/utils/environment-validator.js`
- `src/utils/graphql-cache.js`
- `src/utils/log.js`
- `src/utils/rate-limit.js`
- `src/utils/state-changes.js`
- `src/utils/state-transition-validator.js`
- `src/utils/state-verifier.js`
- `src/utils/status-tracker.js`
- `src/utils/validation-runner.js`
- `src/utils/validation.js`
- `src/utils/verification-progress.js`
- `src/utils/verification-steps.js`

### Test Files
- All files in `test/` directory
- Update test runners and assertions

## Risk Mitigation

1. **Incremental conversion** - Convert one file at a time
2. **Test after each conversion** - Verify functionality
3. **Backup strategy** - Git commits after each phase
4. **Rollback plan** - Easy to revert if issues arise


