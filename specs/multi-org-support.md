# Multi-Organization Support

## Status
Implemented

## Context
Previously, the action was hardcoded to only work with the `bcgov` organization. This limited its usefulness for users who wanted to monitor repositories across multiple related organizations (e.g., `bcgov`, `bcgov-c`, `bcgov-nr`).

Additionally, user-scoped rules (author/assignee) were searching across ALL organizations, which caused the action to pick up items from personal orgs that weren't intended to be monitored.

## Changes Made

### 1. Updated Configuration Format
Modified `rules.yml` to support specifying full repository names (including organization) in the `repository_scope.repositories` list.

**Before:**
```yaml
repository_scope:
  organization: "bcgov"
  repositories:
    - action-builder-ghcr
    - nr-nerds
    # ... etc
```

**After:**
```yaml
repository_scope:
  # organization field is now ignored - repositories must be fully qualified
  repositories:
    - bcgov/action-builder-ghcr
    - bcgov/nr-nerds
    - bcgov-c/action-builder-ghcr
    - bcgov-nr/nr-nerds
    # ... etc
```

### 2. Added allowedOrgs Configuration
Added `allowedOrgs` to `project` configuration to limit user-scoped searches.

**Configuration in rules.yml:**
```yaml
project:
  url: "https://github.com/orgs/bcgov/projects/16"
  organization: "bcgov"  # Primary organization
  allowedOrgs:           # Orgs to search for user-scoped items
    - bcgov
    - bcgov-c
    - bcgov-nr
```

### 3. Updated Code to Use Configured Organization
Modified `src/index.js` to determine the organization from the configured repositories rather than hardcoding to `bcgov`.

**Key change in `src/index.js`:**
```javascript
// Determine organization from the first monitored repository or use default
let org = 'bcgov'; // Default fallback
if (boardConfig.project?.organization) {
  org = boardConfig.project.organization;
}
const allowedOrgs = boardConfig.project?.allowedOrgs || [ 'bcgov', 'bcgov-c', 'bcgov-nr' ];
```

### 4. Updated GitHub API to Filter by Organization
Modified `src/github/api.js` to include org filters in user-scoped searches:

**Before:**
```javascript
const authorSearchQuery = `author:${monitoredUser} created:>${since}`;
const assigneeSearchQuery = `assignee:${monitoredUser} created:>${since}`;
```

**After:**
```javascript
const authorOrgsQuery = allowedOrgs.map(o => `org:${o}`).join(' ');
const authorSearchQuery = authorOrgsQuery 
  ? `${authorOrgsQuery} author:${monitoredUser} created:>${since}`
  : `author:${monitoredUser} created:>${since}`;
```

### 5. Updated Documentation
Updated `README.md` to reflect that the tool now supports multiple organizations.

## How It Works

1. The action reads the `repository_scope.repositories` list from `rules.yml`
2. Each repository entry must be in the format `organization/repository`
3. The organization is extracted from the first repository in the list (or defaults to `bcgov`)
4. All rule processing uses this organization context
5. User-scoped rules (those that follow a user across repositories) now respect the `allowedOrgs` configuration
6. When `allowedOrgs` is configured, author/assignee searches are limited to those organizations only

## Configuration Examples

### Single Organization (Original Behavior)
```yaml
project:
  allowedOrgs:
    - bcgov

repository_scope:
  repositories:
    - bcgov/action-builder-ghcr
    - bcgov/nr-nerds
    - bcgov/quickstart-openshift
```

### Multiple Organizations
```yaml
project:
  allowedOrgs:
    - bcgov
    - bcgov-c
    - bcgov-nr

repository_scope:
  repositories:
    - bcgov/action-builder-ghcr
    - bcgov-c/action-builder-ghcr
    - bcgov-nr/nr-nerds
    - bcgov/quickstart-openshift
```

### Note on `organization` Field
The `organization` field under `repository_scope` is now deprecated and ignored. All repositories must be specified with their full `organization/repository` format.

## Backward Compatibility
- Existing configurations that only use the `bcgov` organization will continue to work
- The `organization` field is still read but ignored (with a warning in logs if present)
- Default organization fallback remains `bcgov` for cases where no repositories are configured
- If `allowedOrgs` is not specified, defaults to `[ 'bcgov', 'bcgov-c', 'bcgov-nr' ]`

## Testing
- Verified that the action correctly processes repositories from multiple organizations
- Confirmed that user-scoped rules only trigger for monitored users in the specified repositories
- Ensured that project updates still go to the configured project URL (which should be in one of the organizations)
- Verified that items from personal/sibling orgs are NOT picked up when not in allowedOrgs