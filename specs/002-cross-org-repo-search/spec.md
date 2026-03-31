# Fix: Cross-Org Repo Search and Backfill Mode

## Problem Statement

Items from repositories in organizations other than the default (`bcgov`) were never discovered by the automation. For example, `bcgov-c/nr-mof-db` had ~130 issues/PRs assigned to a monitored user, but only 7 (added manually) were on the project board. None received automatic sprint assignments.

**Root Causes:**
1. **Malformed repo search queries**: The code constructed `repo:bcgov/bcgov-c/nr-mof-db` instead of `repo:bcgov-c/nr-mof-db`. The `rules.yml` stores repos as fully qualified names (`bcgov-c/nr-mof-db`), but `getRecentItems` unconditionally prefixed them with the default org (`bcgov/`). Confirmed via GraphQL: the correct query returns 71 results, the malformed one returns 0.
2. **No backfill mechanism**: All search queries used `created:>since` with a 24-hour window. Only items created in the last 24 hours were ever discovered. Items created before the automation was deployed were permanently invisible.

**Impact:**
- Cross-org repositories (e.g. `bcgov-c/*`) were effectively excluded from automation
- Items from those repos never appeared on the board or received sprint assignments
- No way to populate the board with pre-existing items

## Solution

### 1. Handle Fully Qualified Repo Names

Repos that already contain an org prefix (e.g. `bcgov-c/nr-mof-db`) are used directly in search queries instead of being prefixed with the default org.

**Applied in three locations:**
- `src/github/api.js`: repo search query construction
- `src/rules/add-items.js`: `monitoredRepos` set construction
- `src/index.js`: log output

**Pattern:**
```javascript
// Before (broken for cross-org repos)
`repo:${org}/${repo}`

// After
repo.includes('/') ? repo : `${org}/${repo}`
```

### 2. Backfill Mode

A `BACKFILL` environment variable (exposed as a `workflow_dispatch` input) removes the `created:>since` date filter from all three search queries, allowing discovery of all items regardless of creation date.

**Usage**: Actions → GH Project Board Sync → Run workflow → check "Backfill"

This is intended for one-time use during initial board population. Normal scheduled runs use the 24-hour window.

## Implementation Details

### Search Query Construction

`getRecentItems` in `src/github/api.js` builds three search queries:
1. **Repo search**: `repo:org/repo created:>since` — now handles `repo:org1/repo1 OR repo:org2/repo2` correctly
2. **Author search**: `org:bcgov org:bcgov-c author:user created:>since`
3. **Assignee search**: `org:bcgov org:bcgov-c assignee:user created:>since`

When `BACKFILL=true`, the `created:>since` clause is omitted from all three.

### Rule Processing

No changes to rule processing. The fix is entirely in the search/discovery layer. Once items are found, they follow the existing pipeline: board addition → column assignment → sprint assignment → assignees → linked issues.

## Test Scenarios

### Acceptance Criteria

1. ✅ Cross-org repos (`bcgov-c/nr-mof-db`) produce correct search queries
2. ✅ Same-org repos (`bcgov/nr-nerds`) still work correctly
3. ✅ Backfill mode discovers items regardless of creation date
4. ✅ Normal mode still uses 24-hour window
5. ✅ All existing tests pass (53/53)

### Test Cases

**Scenario 1: Cross-org repo search**
- Repo `bcgov-c/nr-mof-db` in `rules.yml` repositories list
- Expected: query is `repo:bcgov-c/nr-mof-db`, not `repo:bcgov/bcgov-c/nr-mof-db`

**Scenario 2: Same-org repo still works**
- Repo `bcgov/nr-nerds` in repositories list
- Expected: query is `repo:bcgov/nr-nerds` (unchanged behavior)

**Scenario 3: Partial repo name**
- Repo `nr-nerds` (no org prefix) in repositories list
- Expected: query is `repo:bcgov/nr-nerds` (org prepended as before)

**Scenario 4: Backfill mode**
- `BACKFILL=true` set
- Expected: no `created:>since` in any search query

## Related Code

### Files Modified

- `src/github/api.js`: Handle fully qualified repo names in search queries; add BACKFILL env var support
- `src/rules/add-items.js`: Fix `monitoredRepos` set construction for cross-org repos
- `src/index.js`: Fix log output for cross-org repo names
- `.github/workflows/project-board-sync.yml`: Add `backfill` workflow_dispatch input

### Related Pull Request

- PR #150: fix: handle cross-org repos in search queries and add backfill mode
  - Link: https://github.com/bcgov/action-gh-project-automator/pull/150

## References

- Spec template: `specs/templates/spec-template.md`
- Related spec: `specs/001-issues-assigned-to-users/spec.md`
- Rules.yml documentation: See root `rules.yml` file
