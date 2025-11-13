# Requirements Inventory

**Source**: `rules.yml` - Primary source of truth for business rules  
**Date**: Generated as part of SpecKit re-engineering  
**Purpose**: Complete inventory of all declared business rules and configuration

## Configuration Structure

### Project Configuration

**Location**: `rules.yml` → `project`

**Properties**:
- `url`: GitHub project URL (e.g., `https://github.com/orgs/bcgov/projects/16`)
- `id`: Alternative - GitHub project ID (optional, can be resolved from URL)

**Behavior**: System automatically resolves project ID from URL if URL is provided.

### Automation Configuration

**Location**: `rules.yml` → `automation`

**Structure**:
- `user_scope`: Rules that apply across all repositories based on monitored users
- `repository_scope`: Rules that apply to specific repositories

#### User Scope

**Location**: `automation.user_scope`

**Configuration**:
- `monitored_users`: Array of GitHub usernames to monitor (e.g., `["DerekRoberts"]`)

**Rule Types**:
- `board_items`: Rules for adding items to board
- `assignees`: Rules for managing assignees

#### Repository Scope

**Location**: `automation.repository_scope`

**Configuration**:
- `organization`: GitHub organization name (e.g., `"bcgov"`)
- `repositories`: Array of repository names to monitor
- **Declared Repositories**:
  - `action-builder-ghcr`
  - `nr-nerds`
  - `quickstart-openshift`
  - `quickstart-openshift-backends`
  - `quickstart-openshift-helpers`

**Rule Types**:
- `board_items`: Rules for adding items to board
- `columns`: Rules for column assignment with transition validation
- `sprints`: Rules for sprint assignment
- `linked_issues`: Rules for linked issue synchronization
- **Not declared**: `assignees` rules at the repository scope (only present in `user_scope` today)

### Technical Configuration

**Location**: `rules.yml` → `technical`

**Properties**:
- `batch_size`: Number of items to process in a batch (default: `10`)
- `batch_delay_seconds`: Delay between batches in seconds (default: `1`)
- `update_window_hours`: Time window for finding recent items (default: `24`)
- `optimization.skip_unchanged`: Skip items that haven't changed (default: `true`)
- `optimization.dedup_by_id`: Deduplicate by item ID (default: `true`)
- **Note**: Runtime must honor both optimization flags before enqueuing mutations.

### Runtime Environment Variables

**Required**:
- `GITHUB_TOKEN`: Token with `repo`, `project`, and `read:org` scopes.
- `GITHUB_AUTHOR`: GitHub username whose authored/assigned content is monitored.

**Optional / Contextual**:
- `PROJECT_URL`, `PROJECT_ID`: Overrides for project identification (otherwise resolved from `rules.yml`).
- `OVERRIDE_REPOS`: Comma-separated repository overrides (bypass `rules.yml` repository list).
- `VERBOSE`, `STRICT_MODE`: Toggle verbose logging and preflight strictness.
- `DRY_RUN`: When `true`, evaluates all rules but skips GraphQL/REST mutations (still produces logs/metrics).
- `GITHUB_EVENT_NAME`, `GITHUB_EVENT_PATH`: Provided by GitHub Actions; if present the runtime seeds items directly from the triggering event payload before performing repository-wide searches.

## Rule Types and Specifications

### 1. Board Items Rules (`board_items`)

**Purpose**: Determine which items (PRs/Issues) are added to the project board.

#### Rule: `authored_pull_requests` (User Scope)

- **Name**: `authored_pull_requests`
- **Description**: "Add pull requests authored by any monitored user"
- **Scope**: `user_scope`
- **Trigger**:
  - `type`: `"PullRequest"`
  - `condition`: `"monitored.users.includes(item.author)"`
- **Action**: `"add_to_board"`
- **Skip Condition**: `"item.inProject"` (skip if already in project)

#### Rule: `assigned_pull_requests` (User Scope)

- **Name**: `assigned_pull_requests`
- **Description**: "Add pull requests assigned to any monitored user"
- **Scope**: `user_scope`
- **Trigger**:
  - `type`: `"PullRequest"`
  - `condition`: `"item.assignees.some(assignee => monitored.users.includes(assignee))"`
- **Action**: `"add_to_board"`
- **Skip Condition**: `"item.inProject"`

#### Rule: `repository_pull_requests` (Repository Scope)

- **Name**: `repository_pull_requests`
- **Description**: "Add pull requests from monitored repositories"
- **Scope**: `repository_scope`
- **Trigger**:
  - `type`: `"PullRequest"`
  - `condition`: `"monitored.repos.includes(item.repository)"`
- **Action**: `"add_to_board"`
- **Skip Condition**: `"item.inProject"`

#### Rule: `repository_issues` (Repository Scope)

- **Name**: `repository_issues`
- **Description**: "Add issues from monitored repositories"
- **Scope**: `repository_scope`
- **Trigger**:
  - `type`: `"Issue"`
  - `condition`: `"monitored.repos.includes(item.repository)"`
- **Action**: `"add_to_board"`
- **Skip Condition**: `"item.inProject"`

### 2. Column Rules (`columns`)

**Purpose**: Determine which column items are placed in, with transition validation.

#### Rule: `new_pull_requests_to_active`

- **Name**: `new_pull_requests_to_active`
- **Description**: "Move pull requests from New to Active"
- **Scope**: `repository_scope`
- **Trigger**:
  - `type`: `"PullRequest"`
  - `condition`: `"item.column === 'New'"`
- **Action**: `"set_column"`
- **Value**: `"Active"`
- **Skip Condition**: `"item.column !== 'New'"`
- **Valid Transitions**:
  - `from`: `"New"`
  - `to`: `"Active"`
  - `conditions`: `[]` (no additional conditions)

#### Rule: `pull_requests_no_column`

- **Name**: `pull_requests_no_column`
- **Description**: "Set new pull requests to Active"
- **Scope**: `repository_scope`
- **Trigger**:
  - `type`: `"PullRequest"`
  - `condition`: `"!item.column"`
- **Action**: `"set_column"`
- **Value**: `"Active"`
- **Skip Condition**: `"item.column"`
- **Valid Transitions**:
  - `from`: `"None"`
  - `to`: `"Active"`
  - `conditions`: `[]`

#### Rule: `issues_no_column`

- **Name**: `issues_no_column`
- **Description**: "Set new issues to New"
- **Scope**: `repository_scope`
- **Trigger**:
  - `type`: `"Issue"`
  - `condition`: `"!item.column"`
- **Action**: `"set_column"`
- **Value**: `"New"`
- **Skip Condition**: `"item.column"`
- **Valid Transitions**:
  - `from`: `"None"`
  - `to`: `"New"`
  - `conditions`: `[]`

**Important**: `validTransitions` are declared but must be enforced by code. This is a known gap.

### 3. Sprint Rules (`sprints`)

**Purpose**: Assign items to appropriate sprints based on column state.

**Edge Case Handling** (as documented in comments):
- Items completed during sprint gaps are assigned to next available sprint
- Both active and completed iterations are queried from GitHub API
- Graceful handling when no future sprint exists

#### Rule: `active_sprint_assignment`

- **Name**: `active_sprint_assignment`
- **Description**: "Assign current sprint in Next/Active columns"
- **Scope**: `repository_scope`
- **Trigger**:
  - `type`: `["PullRequest", "Issue"]` (applies to both)
  - `condition`: `"item.column === 'Next' || item.column === 'Active'"`
- **Action**: `"set_sprint"`
- **Value**: `"current"` (resolves to current active sprint)
- **Skip Condition**: `"item.sprint === 'current'"`

#### Rule: `waiting_sprint_assignment`

- **Name**: `waiting_sprint_assignment`
- **Description**: "Assign current sprint to items in Waiting column (only if no sprint set)"
- **Scope**: `repository_scope`
- **Trigger**:
  - `type`: `["PullRequest", "Issue"]`
  - `condition`: `"item.column === 'Waiting'"`
- **Action**: `"set_sprint"`
- **Value**: `"current"`
- **Skip Condition**: `"item.sprint != null"` (only if no sprint already set)

#### Rule: `done_sprint_assignment`

- **Name**: `done_sprint_assignment`
- **Description**: "Assign sprint in Done column"
- **Scope**: `repository_scope`
- **Trigger**:
  - `type`: `["PullRequest", "Issue"]`
  - `condition`: `"item.column === 'Done'"`
- **Action**: `"set_sprint"`
- **Value**: `"current"`
- **Skip Condition**: `"item.sprint === 'current'"`

**Note**: Sprint removal for inactive columns (New, Parked, Backlog) is not implemented ([Issue #66](https://github.com/bcgov/action-gh-project-automator/issues/66)).

### 4. Assignee Rules (`assignees`)

**Purpose**: Manage assignees on items.

#### Rule: `assign_authored_prs` (User Scope)

- **Name**: `assign_authored_prs`
- **Description**: "Add PR author as assignee"
- **Scope**: `user_scope`
- **Trigger**:
  - `type`: `"PullRequest"`
  - `condition`: `"monitored.users.includes(item.author)"`
- **Action**: `"add_assignee"`
- **Value**: `"item.author"`
- **Skip Condition**: `"item.assignees.includes(item.author)"`

### 5. Linked Issues Rules (`linked_issues`)

**Purpose**: Synchronize linked issues with their associated PR state.

#### Rule: `linked_issue_inheritance`

- **Name**: `linked_issue_inheritance`
- **Description**: "Sync linked issues with PR state"
- **Scope**: `repository_scope`
- **Trigger**:
  - `type`: `"LinkedIssue"`
  - `condition`: `"!item.pr.closed || item.pr.merged"`
- **Action**: `["inherit_column", "inherit_assignees"]` (array of actions)
- **Skip Condition**: `"item.column === item.pr.column && item.assignees === item.pr.assignees"`

**Known Gaps**:
- `inherit_column` action is declared but not fully implemented
- `inherit_assignees` action is declared but not fully implemented
- Processor exists but actions are incomplete

## Rule Metadata

### Rule Structure

Every rule must have:
- `name`: Unique identifier (string)
- `description`: Human-readable description (string)
- `trigger`: Conditions for rule activation
  - `type`: Item type(s) - `"PullRequest"`, `"Issue"`, `"LinkedIssue"`, or array
  - `condition`: JavaScript-like condition expression (string)
- `action`: Action to perform (string or array of strings)
- `value`: Optional value for action (string)
- `skip_if`: Condition to skip rule execution (string, optional)
- `validTransitions`: Optional - for column rules only (array)

### Condition Evaluation

Conditions are JavaScript-like expressions evaluated in a context with:
- `item`: The current item (PR/Issue/LinkedIssue)
- `monitored.users`: Array of monitored usernames
- `monitored.repos`: Array of monitored repository names

### Actions

**Supported Actions**:
- `add_to_board`: Add item to project board
- `set_column`: Set item column (requires `value`)
- `set_sprint`: Set item sprint (requires `value` - typically `"current"`)
- `add_assignee`: Add assignee to item (requires `value`)
- `remove_sprint`: Remove sprint value from item (no additional `value` provided)
- `inherit_column`: Inherit column from linked PR (linked issues only)
- `inherit_assignees`: Inherit assignees from linked PR (linked issues only)

## Implementation Status

### Fully Implemented
- ✅ Basic board addition rules (`add_to_board`)
- ✅ Basic column assignment rules (`set_column`)
- ✅ Basic sprint assignment rules (`set_sprint`)
- ✅ Basic assignee rules (`add_assignee`)

### Partially Implemented
- ⚠️ `validTransitions` validation (declared but not enforced)
- ⚠️ Linked issues processing (processor exists but actions incomplete)

### Not Implemented
- ❌ `inherit_column` action for linked issues
- ❌ `inherit_assignees` action for linked issues
- ❌ Sprint removal for inactive columns ([Issue #66](https://github.com/bcgov/action-gh-project-automator/issues/66))

## Configuration Requirements

### Environment Variables (Not in rules.yml)

**Required**:
- `GITHUB_TOKEN`: GitHub personal access token
- `GITHUB_AUTHOR`: GitHub username to monitor

**Optional**:
- `PROJECT_URL`: Override project URL
- `PROJECT_ID`: Override project ID
- `OVERRIDE_REPOS`: Comma-separated list of repos to override
- `VERBOSE`: Enable verbose logging (`true`/`false`)
- `STRICT_MODE`: Enable strict preflight checks (`true`/`false`)

## Next Steps

1. Map each rule to its code implementation
2. Identify gaps between declared rules and implementation
3. Document how conditions are evaluated
4. Document how actions are executed
5. Create unified specification from this inventory

