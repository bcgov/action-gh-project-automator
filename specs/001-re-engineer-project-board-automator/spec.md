# Project Board Automator - Unified Specification

**Version**: 1.0  
**Date**: Generated as part of SpecKit re-engineering  
**Primary Source**: `rules.yml` - Business rules and configuration  
**Complementary Source**: Codebase - Implementation details  
**Governance**: Refer to `memory/constitution.md` for enduring principles that constrain this specification.

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Configuration System](#configuration-system)
4. [GitHub API Integration](#github-api-integration)
5. [Rule Processing Engine](#rule-processing-engine)
6. [State Management](#state-management)
7. [Error Handling](#error-handling)
8. [Observability](#observability)
9. [Data Models](#data-models)
10. [Behavioral Specifications](#behavioral-specifications)
11. [Governance & Change Control](#governance--change-control)

## 1. System Overview

### Purpose

GitHub Projects v2 automation tool that synchronizes issues and pull requests across multiple repositories based on configurable rules defined in `rules.yml`.

### Scope

**In Scope**:
- Adding PRs and issues to project boards based on `rules.yml` rules
- Assigning columns based on `rules.yml` column rules
- Assigning sprints based on `rules.yml` sprint rules
- Managing assignees based on `rules.yml` assignee rules
- Synchronizing linked issues with PRs based on `rules.yml` linked_issues rules

**Out of Scope**:
- Creating or modifying project boards
- Managing labels
- Managing milestones (beyond sprints)
- Creating issues or PRs

### Boundaries

- **Input**: GitHub API (GraphQL and REST)
- **Configuration**: `rules.yml` file (primary source of truth)
- **Output**: Project board updates (columns, sprints, assignees, item additions)

## 2. Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    rules.yml                            │
│         (Primary Source of Truth)                       │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Configuration Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ loader.js    │  │ schema.js    │  │ board-rules.js│ │
│  │ (Loads)      │  │ (Validates)  │  │ (Normalizes)  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Rule Processing Engine                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ add-items.js │  │ columns.js   │  │ sprints.js   │ │
│  │ (board_items)│  │ (columns)    │  │ (sprints)    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│  ┌──────────────┐  ┌──────────────┐                   │
│  │ assignees.js │  │ linked-issues│                   │
│  │ (assignees)  │  │ (linked)     │                   │
│  └──────────────┘  └──────────────┘                   │
│  ┌──────────────────────────────────────┐            │
│  │ unified-rule-processor.js             │            │
│  │ (Evaluates rules.yml conditions)      │            │
│  └──────────────────────────────────────┘            │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              State Management                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ state-      │  │ state-       │  │ state-      │ │
│  │ verifier.js │  │ transition-  │  │ changes.js  │ │
│  │ (Verifies)  │  │ validator.js  │  │ (Tracks)    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              GitHub API Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ api.js       │  │ rate-limit.js│  │ batch.js     │ │
│  │ (GraphQL/    │  │ (Throttling) │  │ (Batching)   │ │
│  │  REST)       │  └──────────────┘  └──────────────┘ │
│  └──────────────┘                                        │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Load Configuration**: `loader.js` loads `rules.yml` → `schema.js` validates → `board-rules.js` normalizes
2. **Get Items**: `getRecentItems()` queries GitHub API for recent PRs/issues
3. **Process Rules**: For each item, `unified-rule-processor.js` evaluates `rules.yml` conditions
4. **Execute Actions**: Rule processors execute actions (add to board, set column, etc.)
5. **Verify State**: `state-verifier.js` verifies all changes match expectations
6. **Handle Errors**: Error classification and retry logic for transient failures

### Integration Points

- **GitHub GraphQL API**: Project board queries and mutations
- **GitHub REST API**: Item queries (fallback)
- **Environment Variables**: Configuration overrides
- **File System**: `rules.yml` loading

## 3. Configuration System

### Primary Source: rules.yml

**Location**: Repository root by default. Alternate paths must be provided explicitly when invoking the GitHub Action so downstream consumers still treat the file as the single business rule contract.

**Structure**: See `requirements-inventory.md` for the normalized schema captured directly from `rules.yml`.

**Key Sections** (authoritative fields that drive runtime behavior):
- `project`: Project identification (`url` or `id`). Exactly one must be present.
- `automation.user_scope`: Monitored users and teams that seed rule evaluation and skip conditions.
- `automation.repository_scope`: Monitored repositories, branch filters, and per-repo overrides.
- `technical`: Performance and optimization settings (batch size, update windows, rate-limit tolerances).

### Environment Variables

**Required**:
- `GITHUB_TOKEN`: GitHub personal access token
- `GITHUB_AUTHOR`: GitHub username to monitor

**Optional Runtime Modifiers** (document any behavior changes before enabling in production workflows):
- `PROJECT_URL`: Override project URL
- `PROJECT_ID`: Override project ID
- `OVERRIDE_REPOS`: Comma-separated repo list
- `VERBOSE`: Enable verbose logging (`true`/`false`)
- `STRICT_MODE`: Enable strict preflight checks (`true`/`false`)
- `DRY_RUN`: When `true`, executes the full evaluation pipeline but skips mutations against the GitHub API (still logs queued actions and metrics).
- `GITHUB_EVENT_NAME`, `GITHUB_EVENT_PATH`: Provided automatically in GitHub Actions. When present, the runtime seeds work from the event payload before falling back to repository-wide queries.
- `GITHUB_REPOSITORY`, `GITHUB_WORKSPACE`: Present in GitHub-hosted runners; required when packaging as an action but not for local dry runs.

### Configuration Loading

**File**: `src/config/loader.js`

**Process**:
1. Load YAML file from configured path
2. Validate against JSON schema (`schema.js`)
3. Normalize structure (`board-rules.js`)
4. Merge user_scope and repository_scope rules
5. Derive rule metadata (ids, summary strings) for downstream processors
6. Return normalized configuration

**Validation**: All `rules.yml` files must pass schema validation before processing. Failures are considered critical and must block the workflow per the constitution.

## 4. GitHub API Integration

### GraphQL Queries

**Primary API**: GitHub GraphQL API v4

**Key Queries**:
- Project board queries (items, fields, columns)
- Item queries (PRs, issues, linked issues)
- Sprint/iteration queries
- Field value queries

**File**: `src/github/api.js`

### REST API (Fallback)

**Used for**: Item queries when GraphQL is insufficient

### Rate Limiting

**Configuration**: From `rules.yml` technical settings
- `batch_size`: Items per batch (default: 10)
- `batch_delay_seconds`: Delay between batches (default: 1)

**Implementation**: `src/utils/rate-limit.js` and `src/utils/batch.js`

**Behavior**: 
- Batches operations to respect rate limits
- Exponential backoff on rate limit errors
- Retries with delays

## 5. Rule Processing Engine

### Rule Evaluation Flow

1. **Load Rules**: Get rules for rule type from `rules.yml`
2. **Seed Items**: If executed within a GitHub Action with `GITHUB_EVENT_*` context, load the triggering pull request/issue directly from the event payload via `loadEventItems`. Otherwise, or in addition, search monitored repositories for recent activity using `getRecentItems`.
3. **Evaluate Skip Condition**: If `skip_if` present and true, skip rule
4. **Check Trigger Type**: Verify item type matches `trigger.type`
5. **Evaluate Condition**: Evaluate `trigger.condition` expression
6. **Format Action**: If condition matches, format action with parameters
7. **Return Actions**: Return array of actions to execute

### Condition Evaluation

**File**: `src/rules/processors/validation.js`

**Context Variables**:
- `item`: Current item (PR/Issue/LinkedIssue)
- `monitored.users`: Array from `rules.yml` user_scope.monitored_users
- `monitored.repos`: Array from `rules.yml` repository_scope.repositories

**Supported Expressions**:
- `monitored.users.includes(item.author)`
- `item.assignees.some(assignee => monitored.users.includes(assignee))`
- `monitored.repos.includes(item.repository)`
- `item.column === 'New'`
- `!item.column`
- `item.column === 'Next' || item.column === 'Active'`
- `!item.pr.closed || item.pr.merged`

### Rule Types

See `requirements-inventory.md` for complete rule specifications:

1. **board_items**: Add items to project board
2. **columns**: Set item columns with transition validation
3. **sprints**: Assign items to sprints
4. **assignees**: Manage item assignees
5. **linked_issues**: Synchronize linked issues with PRs

### Action Execution

Each rule processor executes actions:
- `add_to_board`: Adds item to project board
- `set_column`: Sets item column (validates transitions)
- `set_sprint`: Sets item sprint
- `add_assignee`: Adds assignee to item
- `inherit_column`: Inherits column from linked PR (linked issues)
- `inherit_assignees`: Inherits assignees from linked PR (linked issues)
### Post-Processing: Existing Item Sweep

After processing newly added items, the runtime iterates every existing project item to reconcile sprint assignments. This sweep uses batching helpers with no-op guards to minimize duplicate mutations and respects `DRY_RUN` when enabled. The sweep is gated by `technical.existing_items.sweep_enabled`, but can be overridden via the environment: setting `ENABLE_EXISTING_SWEEP=true` explicitly enables the sweep, `ENABLE_EXISTING_SWEEP=false` explicitly disables it, and leaving the variable undefined falls back to `technical.existing_items.sweep_enabled`. The sweep also short-circuits when the rate-limit preflight (`SWEEP_RATE_LIMIT_MIN`, default `technical.existing_items.min_rate_limit_remaining`) reports insufficient remaining calls.

## 6. State Management

### State Verification

**Purpose**: Verify all state changes match `rules.yml` expectations

**File**: `src/utils/state-verifier.js`

**Verification Types**:
- Addition verification: Item added to board
- Column verification: Column set correctly
- Sprint verification: Sprint assigned correctly
- Assignee verification: Assignees set correctly
- Complete state verification: All aspects verified

**Retry Logic**:
- Up to 3 retries with exponential backoff
- 5 second delay for eventual consistency
- Tracks verification progress

### Transition Validation

**Purpose**: Enforce `validTransitions` from `rules.yml`

**File**: `src/utils/state-transition-validator.js`

**Current Status**: ⚠️ Declared but not strictly enforced (see gap-analysis.md)

**Required Behavior**:
- Load `validTransitions` from `rules.yml` column rules
- Validate all column transitions
- Block invalid transitions
- Allow only declared transitions

### State Tracking

**File**: `src/utils/state-changes.js`

**Purpose**: Track all state changes for observability

**Tracks**:
- Items added
- Columns changed
- Sprints assigned
- Assignees updated

## 7. Error Handling

### Error Classification

**Critical Errors**:
- Authentication failures
- Invalid configuration
- State verification failures (after retries)

**Non-Critical Errors**:
- Items not added to project (already in project, etc.)
- Rate limit errors (transient)

### Retry Strategy

**Retryable Errors**:
- State verification failures (eventual consistency)
- Rate limit errors
- Transient API errors

**Retry Logic**:
- Max 3 retries
- Exponential backoff (1s, 2s, 4s)
- Max delay: 5 seconds

### Error Recovery

**Recovery Steps**:
1. Classify error (critical vs. non-critical)
2. Log error with context
3. Retry if retryable
4. Report summary at end
5. Exit with appropriate code (1 for critical, 0 for non-critical)

## 8. Observability

### Logging

**File**: `src/utils/log.js`

**Log Levels**:
- `info`: General information
- `warning`: Warnings (non-fatal)
- `error`: Errors (may be fatal)
- `debug`: Debug information (when `DEBUG=true`)

**Structured Logging**:
- Operation summaries
- State change tracking
- Error context

### Metrics

**Tracked**:
- Items processed
- Items added
- Items skipped
- Errors encountered
- Board item counters (`board.items.total`, `board.actions.added`, `board.actions.skipped`, `board.actions.failed`)
- Linked issue counters (`linked.items.total`, `linked.actions.column.assigned`, `linked.actions.assignees.assigned`, `linked.actions.skipped`, `linked.actions.failed`)
- Existing item sweep counters (`existing.sweep.disabled`, `existing.sweep.rate_limited`, `existing.items.processed`, `existing.assignments.queued`, `existing.assignments.applied`, `existing.removals.queued`, `existing.removals.applied`)
- State verification retries
- Seeded items sourced from event payloads

**Reporting**:
- End-of-run summary
- State verification reports
- Performance metrics

## 9. Data Models

### Project Board Structure

**From GitHub API**:
- Project ID: Unique identifier
- Fields: Status (columns), Sprint (iterations), Assignees
- Items: PRs and Issues linked to project

### Item Types

**PullRequest**: GitHub pull request
- Properties: `id`, `number`, `author`, `assignees`, `repository`, `state`, `merged`

**Issue**: GitHub issue
- Properties: `id`, `number`, `author`, `assignees`, `repository`, `state`

**LinkedIssue**: Issue linked to a PR
- Properties: Issue properties + `pr` (linked PR reference)

### State Representation

**Column**: String (e.g., "New", "Active", "Done")
- From project board Status field
- Valid values from project configuration

**Sprint**: Sprint ID or "current"
- Resolved from project board Sprint field
- "current" resolves to active sprint covering today

**Assignees**: Array of GitHub usernames
- From project board Assignees field

### Configuration Schema

**From**: `src/config/schema.js`

**Validates**:
- Project configuration (URL or ID)
- Automation rules structure
- Rule metadata (name, description, trigger, action)
- Technical settings

## 10. Behavioral Specifications

### Rule Evaluation Behavior

**Order**:
1. User scope rules evaluated first
2. Repository scope rules evaluated second
3. Rules within scope evaluated in declaration order

**Item Sources**:
- If the runtime is invoked from a GitHub Action with `GITHUB_EVENT_NAME`/`GITHUB_EVENT_PATH`, the triggering PR/issue is hydrated directly from the event payload (preferred source to avoid API drift).
- After seed items are processed—or when no event payload is available—the system queries monitored repositories for recent activity within `technical.update_window_hours` (default 24h, or 1h for pull request events).

**Short-Circuit**:
- Skip condition evaluated first
- If skip condition true, rule not evaluated
- Condition only evaluated if skip condition false

**Action Execution**:
- Actions executed in order returned by processor
- Each action executed independently
- State verified after each action
- After newly added items are processed, an existing-item sweep reconciles sprint assignments for all project items using batched mutations (with no-op guards). This sweep is always attempted unless rate limits prevent it, and it honors `DRY_RUN` by logging queued changes without applying them.

### State Transition Behavior

**Valid Transitions**:
- From `rules.yml` validTransitions declarations
- Must be explicitly declared
- Conditions may be specified (currently empty arrays)

**Transition Validation**:
- Current column → target column
- Check validTransitions rules
- Block if not valid
- Allow if valid

**Current Gap**: ValidTransitions declared but not strictly enforced (see gap-analysis.md)

### Error Recovery Behavior

**Transient Errors**:
- Retry with exponential backoff
- Up to 3 attempts
- Log each attempt

**Permanent Errors**:
- Log error
- Continue processing other items
- Report at end

**Critical Errors**:
- Log error
- Stop processing
- Exit with code 1

### Idempotency

**Safe Re-runs**:
- Skip conditions prevent duplicate operations
- State verification ensures correctness
- Deduplication prevents duplicate processing

**Skip Conditions**:
- `item.inProject`: Skip if already in project
- `item.column !== 'New'`: Skip if column not as expected
- `item.sprint === 'current'`: Skip if sprint already set

## Implementation Status

See `gap-analysis.md` for detailed status:

- **Fully Implemented**: 8/12 rules (67%)
- **Partially Implemented**: 4/12 rules (33%)
- **Known Gaps**: validTransitions enforcement, linked issues actions

## 11. Governance & Change Control

### Mandates
- `memory/constitution.md` defines non-negotiable principles; any updates require stakeholder approval and must be referenced in PR notes.
- `rules.yml` remains the authoritative description of business intent. Specifications cannot redefine rule behavior without a synchronized change to `rules.yml`.
- Default runtime behaviors must not drift silently; documentation and changelog entries are mandatory for every change.

### Specification Maintenance
- Note the provenance of every spec edit (source: `rules.yml`, implementation observation, or approved design change).
- Log discrepancies in the gap analysis before pursuing remediation; unresolved items must be tracked to closure.
- When packaging as a GitHub Action, propagate governance notes to user-facing documentation so consumers inherit the same guardrails.

## References

- **Requirements Inventory**: `requirements-inventory.md`
- **Code Mapping**: `code-to-rules-mapping.md`
- **Gap Analysis**: `gap-analysis.md`
- **Constitution**: `../../memory/constitution.md`
- **rules.yml**: Root of repository

