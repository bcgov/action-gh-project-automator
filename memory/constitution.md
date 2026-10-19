# Project Board Automator Constitution

## Purpose
- Capture non-negotiable operating principles for the Project Board Automator re-engineering effort.
- Establish clear separation between user-facing configuration and developer-facing design notes.

## Critical Directories
- **`docs/design.md`** - Developer-facing design notes: how the sync works and why.
- **`rules.yml`** - User-facing configuration template. Users provide their own in their repositories.

## Guiding Principles
- **User Configuration**: `rules.yml` is user-facing configuration - users provide their own or use our default template.
- **Developer Documentation**: `docs/design.md` records how the sync works; keep it short and current.
- **Incremental PRs**: Prefer small, reviewable changes with clear testing notes.
- **Backward Compatibility**: Preserve current behavior by default; deviations require explicit approval.
- **Strict ESM Standard**: All runtime and test code must use native ES modules. CommonJS is completely deprecated and prohibited in this repository.
- **Ludicrous Testing Philosophy**: We prioritize exhaustive, branch-level test coverage. Core logic must be verified against a matrix of conditions to ensure zero regressions.

## Architecture Standards
- **Modules**: Maintain modular rule processors (`add-items`, `columns`, `sprints`, `assignees`, `linked-issues`) and supporting utilities.
- **Predictable Rule Engine**: All rule evaluation must use the standardized, whitelist-based `RuleValidation` engine to prevent security risks and guarantee behavioral predictability.
- **Configuration Flow**: Load and validate configuration through `src/config` schema before execution.
- **State Management**: Use `state-verifier` and `state-transition-validator` to enforce `validTransitions` and report drift.
- **API Integration**: Interactions with GitHub must honor rate limiting and batching helpers (`batch`, `rate-limit`).

## Coding Practices
- Use descriptive logging with `Logger` utilities; avoid silent failures.
- Guard all mutators with no-op checks to reduce API calls.
- **Mandatory Dependency Injection**: All processing functions must support dependency injection of loaders and validators to allow for 100% network-less testing.
- Document novel helpers with JSDoc; keep comments minimal but precise.

## Testing Expectations
- **Zero-Network Isolation**: Unit tests must never make real network calls. Use `st.mock.method` or dependency injection for all external interactions.
- **Ludicrous Coverage Matrix**: Core logic (validators, processors) must be tested against a complete matrix of standard and edge-case inputs.
- Each rule processor change requires targeted unit tests referencing the rule id.
- Favour `node --test` suites; new tests written in ESM with explicit mocks.
- Provide regression coverage for observed bugs before shipping fixes.

## Documentation Requirements
- Update `docs/design.md` when a change alters how the sync behaves.
- Keep README in sync with configurable inputs, outputs, and operational toggles.
- Maintain clear separation: docs/design.md documents development, rules.yml is user configuration.

## Operational Practices
- Enforce DRY_RUN safeguards for destructive mutations.
- Track rate-limit and batching metrics for observability.
- Treat workflow failures as blockers; investigate before new feature work.

## Change Control
- Changes to default behaviors require explicit sign-off and design note updates.
- Reference this constitution in PR descriptions when deviating from standard process.
