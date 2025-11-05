# Project Constitution

## Core Principles

### 1. rules.yml is the Primary Source of Truth

**Principle**: `rules.yml` defines WHAT the system should do. Code implements HOW it does it.

- All business rules MUST be declared in `rules.yml`
- Code implementations MUST match `rules.yml` declarations exactly
- If a feature is declared in `rules.yml` but not implemented, it's a bug
- If code implements something not in `rules.yml`, it should be added to `rules.yml` or removed from code
- Configuration structure in `rules.yml` is authoritative
- When in doubt, refer to `rules.yml` as the definitive specification

### 2. Modular Architecture

**Principle**: Clear separation of concerns with well-defined boundaries.

**Components**:
- **Business Rules** (`src/rules/`): Rule implementations that execute `rules.yml` rules
- **Utilities** (`src/utils/`): Common functionality (state verification, rate limiting, batching)
- **Configuration** (`src/config/`): Loading and validation of `rules.yml`
- **GitHub API** (`src/github/`): API wrappers and integration

**Rules**:
- Each module has a single, well-defined responsibility
- Modules communicate through clear interfaces
- Dependencies flow one direction where possible
- Business rules depend on utilities, not vice versa

### 3. State Verification

**Principle**: All state changes must be verified to ensure correctness.

- Every rule module MUST implement state verification
- State verification MUST verify that changes match `rules.yml` expectations
- State transitions MUST respect `rules.yml` validTransitions rules
- Verification failures MUST be logged and handled appropriately
- State tracking MUST be comprehensive and accurate

### 4. Error Handling

**Principle**: Errors must be handled gracefully with clear recovery paths.

- All errors MUST be classified (critical vs. non-critical)
- Retry logic MUST be implemented for transient failures
- Error messages MUST be actionable and include context
- State verification errors MUST be retried with exponential backoff
- Rate limit errors MUST be handled gracefully with appropriate delays

### 5. Testing Requirements

**Principle**: All rules must have corresponding tests.

- Every rule in `rules.yml` MUST have test coverage
- Tests MUST validate that code matches `rules.yml` specifications
- Edge cases identified in `rules.yml` MUST be tested
- State verification logic MUST be tested
- Integration tests MUST verify end-to-end rule execution

### 6. Documentation Standards

**Principle**: Documentation must be accurate and kept in sync with code.

- Public APIs MUST be documented with JSDoc
- Module conventions MUST be documented in module headers
- Complex logic MUST include inline comments explaining intent
- `rules.yml` rules MUST be documented with descriptions
- Changes to behavior MUST update documentation

### 7. Code Quality

**Principle**: Code must be maintainable, readable, and consistent.

- Use JSDoc for all public functions and classes
- Follow consistent naming conventions
- Keep functions focused and single-purpose
- Avoid unnecessary complexity
- Follow DRY (Don't Repeat Yourself) principles
- Use descriptive variable and function names

## Architecture Decisions

### Technology Stack

- **Language**: JavaScript (ESM modules)
- **Node.js**: >= 20.0.0
- **Package Manager**: npm
- **API**: GitHub GraphQL and REST APIs
- **Configuration**: YAML (`rules.yml`)

### Design Patterns

- **Rule Processing**: Declarative rules from `rules.yml` executed by rule processors
- **State Management**: Centralized state verification with retry logic
- **Error Handling**: Classified errors with appropriate recovery strategies
- **Rate Limiting**: Configurable batching and delays from `rules.yml` technical settings

### Module Structure

```
src/
├── index.js              # Main orchestration (loads rules.yml, executes rules)
├── config/               # Configuration loading and validation
│   ├── loader.js         # Loads rules.yml
│   ├── schema.js         # Validates rules.yml structure
│   └── board-rules.js    # Normalizes rules.yml for backward compatibility
├── rules/                # Rule processors (execute rules.yml rules)
│   ├── add-items.js      # Board addition rules (rules.yml board_items)
│   ├── columns.js        # Column rules (rules.yml columns + validTransitions)
│   ├── sprints.js        # Sprint rules (rules.yml sprints)
│   ├── assignees.js      # Assignee rules (rules.yml assignees)
│   ├── linked-issues-processor.js  # Linked issue rules (rules.yml linked_issues)
│   └── processors/       # Shared rule processing utilities
├── utils/                # Common utilities
│   ├── state-verifier.js # State verification (enforces rules.yml outcomes)
│   ├── state-transition-validator.js  # Transition validation (enforces validTransitions)
│   ├── rate-limit.js     # Rate limiting (uses rules.yml technical.batch_size)
│   ├── batch.js          # Batch processing (uses rules.yml technical settings)
│   └── log.js            # Logging utilities
└── github/               # GitHub API integration
    └── api.js            # GraphQL and REST API wrappers
```

## Development Workflow

### Before Making Changes

1. Review `rules.yml` to understand the rule being modified
2. Check existing tests for the rule
3. Review related modules for dependencies
4. Understand the state verification requirements

### When Making Changes

1. Update `rules.yml` first if adding/modifying business rules
2. Update code to match `rules.yml` exactly
3. Update tests to reflect changes
4. Update documentation (JSDoc, README)
5. Verify state verification still works

### After Making Changes

1. Run all tests (`npm test`)
2. Verify state verification passes
3. Check that `rules.yml` and code are in sync
4. Update documentation if needed

## Stability Practices

### Preventing Bug Reintroduction

1. **Spec-Driven**: All changes must align with `rules.yml` specifications
2. **Test Coverage**: Comprehensive tests prevent regressions
3. **State Verification**: Automatic verification catches implementation errors
4. **Code Review**: Review against `rules.yml` to ensure alignment

### Maintaining Consistency

1. Follow module-specific conventions
2. Maintain consistent error handling patterns
3. Preserve state tracking behaviors
4. Keep `rules.yml` and code synchronized

## Future Vision

### GitHub Action Format

- Consumers use this as a GitHub Action
- Default `rules.yml` provided in action repo
- Consumers can override with their own `rules.yml`
- Self-hosting supported (read from repo root)

### Maintainability Goals

- Predictable, consistent behavior
- Clear specifications prevent bugs
- Easy to add new rules by updating `rules.yml`
- Comprehensive test coverage prevents regressions

## References

- **Primary Spec**: `rules.yml` - Source of truth for business rules
- **Code Conventions**: `src/index.js` - Central development reference
- **Rule Documentation**: `src/rules/README.md` - Rule set descriptions
- **Test Coverage**: `test/` - Test specifications

