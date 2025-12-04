# Project Board Automator Constitution

## Purpose
- Capture non-negotiable operating principles for the Project Board Automator re-engineering effort.
- Establish clear separation between user-facing configuration and developer-facing specifications.

## Critical Directories
- **`specs/`** - Developer-facing feature specifications using SpecKit framework. **DO NOT DELETE** this directory.
- **`rules.yml`** - User-facing configuration template. Users provide their own in their repositories.

## DO NOT
- **Never delete `specs/` directory** thinking `rules.yml` replaces it. They serve different purposes:
  - `rules.yml` is user-facing configuration (users customize in their repos)
  - `specs/` contains developer-facing documentation (our internal planning)
- SpecKit specs are for development; rules.yml is for users. One does not replace the other.

## Guiding Principles
- **Spec-Driven Development**: Use SpecKit framework for feature specifications. All new features require specs.
- **User Configuration**: `rules.yml` is user-facing configuration - users provide their own or use our default template.
- **Developer Documentation**: Feature specs in `specs/` document what we build and the rules.yml patterns we support.
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
- **Feature Specifications**: All new features must have SpecKit specs in `specs/[number]-[feature-name]/`
- **SpecKit Structure**: Follow SpecKit framework patterns (spec.md, plan.md, contracts/, etc.)
- **Rules.yml Patterns**: Specs document the rules.yml schema/patterns we support for users
- Keep README in sync with configurable inputs, outputs, and operational toggles.
- Maintain clear separation: specs document development, rules.yml is user configuration.

## Operational Practices
- Enforce DRY_RUN safeguards for destructive mutations.
- Track rate-limit and batching metrics for observability.
- Treat workflow failures as blockers; investigate before new feature work.

## Change Control
- Changes to default behaviors require explicit sign-off and spec updates.
- Reference this constitution in PR descriptions when deviating from standard process.
