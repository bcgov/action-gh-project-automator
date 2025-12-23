# SpecKit Feature Specifications

This directory contains feature specifications using the [SpecKit framework](https://github.com/github/spec-kit) for spec-driven development.

## Overview

We use SpecKit to document and plan features before implementation. Specs are **developer-facing** documentation that describe what we build and how it works. This is separate from user-facing configuration in `rules.yml`.

### Separation of Concerns

- **Developer-Facing**: Feature specs in `specs/` directory - our internal development documentation
- **User-Facing**: `rules.yml` in repo root - end users provide their own or use our default template

## SpecKit Framework

This project follows the [GitHub SpecKit](https://github.com/github/spec-kit) methodology:

1. **Specification** (`spec.md`): Describe the feature, problem, solution, and requirements
2. **Plan** (`plan.md`): Technical implementation approach (optional, for complex features)
3. **Tasks** (`tasks.md`): Actionable task breakdown (optional, auto-generated if using SpecKit CLI)
4. **Contracts** (`contracts/`): API contracts and interfaces (optional)

## Directory Structure

```
specs/
├── README.md (this file)
├── templates/
│   ├── spec-template.md
│   └── plan-template.md
└── [number]-[feature-name]/
    ├── spec.md
    ├── plan.md (optional)
    ├── tasks.md (optional)
    └── contracts/ (optional)
```

## Numbering Strategy

Specs are numbered sequentially starting from `001`:

- `001-issues-assigned-to-users/` - First feature spec
- `002-[next-feature]/` - Second feature spec
- `003-[another-feature]/` - Third feature spec

**Guidelines:**
- Use zero-padded 3-digit numbers (001, 002, etc.)
- Use kebab-case for feature names
- Be descriptive but concise

## How Specs Relate to rules.yml

Feature specs document:
- What the feature does
- The rules.yml patterns users can configure
- Implementation details
- Test scenarios

**rules.yml** remains:
- User-facing configuration (users customize in their repos)
- Executable configuration (not documentation)
- The source of truth for runtime behavior

**Relationship:**
- Specs describe the features we build
- Specs document the rules.yml schema/patterns we support
- Users configure behavior via rules.yml
- Code implements the rules.yml patterns

## Creating a New Spec

### 1. Create Directory

```bash
mkdir -p specs/XXX-feature-name
```

Replace `XXX` with the next sequential number (001, 002, etc.).

### 2. Copy Template

```bash
cp specs/templates/spec-template.md specs/XXX-feature-name/spec.md
```

### 3. Fill in Spec

Edit `spec.md` following the template structure:
- Problem Statement
- Solution
- Rules.yml Pattern (if applicable)
- Implementation Details
- Test Scenarios
- Edge Cases
- Related Code

### 4. Create Plan (if needed)

For complex features, create an implementation plan:

```bash
cp specs/templates/plan-template.md specs/XXX-feature-name/plan.md
```

### 5. Reference in PR

When implementing, reference the spec number in your PR description:
- "Implements spec 001: Issues assigned to monitored users"
- Link to the spec directory in the PR

## Backlog: Existing Features Needing Specs

The following existing features need retroactive specs (created when time permits):

1. **Board Addition Rules** - Multiple rules for adding items to board
   - Repository-scoped PRs
   - Repository-scoped Issues
   - User-authored PRs
   - User-assigned PRs (already covered in 001)

2. **Column Assignment Rules** - Rules for setting initial columns
   - PRs → Active column
   - Issues → New column

3. **Sprint Assignment Rules** - Rules for sprint management
   - Active sprint assignment
   - Sprint removal for inactive columns
   - Done column sprint assignment

4. **Linked Issue Processing** - Inheritance of PR state to linked issues
   - Column inheritance
   - Assignee inheritance
   - Sprint inheritance

5. **Assignee Rules** - Automatic assignee management
   - PR author assignment
   - Linked issue assignee inheritance

6. **Existing Items Sweep** - Background processing of items already on board

These will be prioritized based on:
- Feature complexity
- Documentation needs
- Developer onboarding requirements

## Spec Review Checklist

Before marking a spec as complete:

- [ ] Problem statement clearly describes the issue
- [ ] Solution is well-defined
- [ ] Rules.yml pattern is documented (if applicable)
- [ ] Implementation details are clear
- [ ] Test scenarios cover main paths and edge cases
- [ ] Related code is referenced
- [ ] PR is linked (if implemented)

## Resources

- [GitHub SpecKit Repository](https://github.com/github/spec-kit)
- [SpecKit Documentation](https://github.com/github/spec-kit/tree/main/docs)
- Templates: `specs/templates/`
- Constitution: `memory/constitution.md`

## See Also

- Root `rules.yml` - User-facing configuration template
- `memory/constitution.md` - Project development principles
- `README.md` - User-facing project documentation


