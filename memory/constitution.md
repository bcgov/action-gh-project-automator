# Project Board Automator Constitution

## Purpose
- Capture non-negotiable operating principles for the Project Board Automator re-engineering effort.
- Anchor all specifications to `rules.yml` as the authoritative source for business rules.

## Guiding Principles
- **Source of Truth**: `rules.yml` defines every business rule; code must reflect it exactly.
- **Rules-First Delivery**: Build and verify directly against `rules.yml`; capture only lightweight notes needed for onboarding.
- **Incremental PRs**: Prefer small, reviewable changes with clear testing notes.
- **Backward Compatibility**: Preserve current behavior by default; deviations require explicit approval.
- **ESM Standard**: All new runtime and test code uses ES modules; CommonJS remains only while migrating legacy tests.

## Architecture Standards
- **Modules**: Maintain modular rule processors (`add-items`, `columns`, `sprints`, `assignees`, `linked-issues`) and supporting utilities.
- **Configuration Flow**: Load and validate configuration through `src/config` schema before execution.
- **State Management**: Use `state-verifier` and `state-transition-validator` to enforce `validTransitions` and report drift.
- **API Integration**: Interactions with GitHub must honor rate limiting and batching helpers (`batch`, `rate-limit`).

## Coding Practices
- Use descriptive logging with `Logger` utilities; avoid silent failures.
- Guard all mutators with no-op checks to reduce API calls.
- Prefer pure helpers with dependency injection for testability.
- Document novel helpers with JSDoc; keep comments minimal but precise.

## Testing Expectations
- Each rule processor change requires targeted unit tests referencing the rule id.
- Favour `node --test` suites; new tests written in ESM with explicit mocks.
- Provide regression coverage for observed bugs before shipping fixes.

## Documentation Requirements
- Keep README in sync with configurable inputs, outputs, and operational toggles.
- Maintain lightweight notes (e.g., this constitution) only when they provide clear value beyond `rules.yml`.
- Record gaps between declared rules and implemented behavior within the codebase or issues; avoid large standalone specs.

## Operational Practices
- Enforce DRY_RUN safeguards for destructive mutations.
- Track rate-limit and batching metrics for observability.
- Treat workflow failures as blockers; investigate before new feature work.

## Change Control
- Changes to default behaviors require explicit sign-off and spec updates.
- Reference this constitution in PR descriptions when deviating from standard process.
