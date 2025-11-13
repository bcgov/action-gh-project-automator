# Linked-Issue Assignee Inheritance Blueprint

## Goals
- Use project board state as the source of truth for linked-issue assignee inheritance.
- Preserve the `skip_if` guard (`item.assignees === item.pr.assignees`) using normalized comparisons.
- Minimize API calls by using dependency injection helpers and existing no-op guards.
- Provide clear observability around assignments, skips, and failures.

## Current State
- `processLinkedIssues` (after column work) already resolves project item IDs and pulls board state via `getItemColumnFn` / `getItemAssigneesFn`.
- Assignee inheritance currently relies on the API payload (`pullRequest.assignees.nodes`) and calls `setItemAssignees` without normalization.
- Skip condition short-circuits only when column *and* assignees match. Because of the stale PR assignee data, we often miss skips.

## Requirements
1. **Project-State Source**: Use `getItemAssigneesFn(projectId, projectItemId)` for both the PR and linked issue.
2. **Normalization**: Compare assignee sets via `arraysEqual` (already exported) to avoid order sensitivity.
3. **Idempotent Writes**: Reuse `setItemAssignees` which already computes deltas and avoids unnecessary mutations.
4. **Override Friendly**: Keep all new logic injections optional (matching the pattern introduced for columns).
5. **Observability Hooks**: Emit counters once the metrics work lands (`linked.actions.assignees.assigned`, `linked.actions.skipped`).

## Implementation Steps
1. **Resolve PR Assignees**
   - Ensure `prActualAssignees` is sourced from `getItemAssigneesFn(projectId, projectItemId)` with fallback to payload when board lookup fails.
   - Normalize to an array of logins (`string[]`).

2. **Linked Issue Resolution**
   - For each linked issue project item (`linkedIssueProjectItemId`), fetch assignees via `getItemAssigneesFn` once before evaluating skip conditions.
   - Normalize to a sorted array for comparison.

3. **Skip Guard Evaluation**
   - Use `arraysEqual(linkedIssueAssignees, prActualAssignees)` to determine when the skip guard should trigger.
   - Record skip reason (`state_matches_pr`) as already done for columns.

4. **Apply Inheritance**
   - If the skip guard does not short-circuit and `prActualAssignees.length > 0`, call `setItemAssigneesFn(projectId, linkedIssueProjectItemId, prActualAssignees)`.
   - Respect existing `setItemAssignees` no-op guard (delta calculation) to avoid redundant GraphQL calls.
   - Capture success reason (`assignees_inherited`).

5. **Error Handling**
   - Leverage `handleClassifiedError` to maintain consistency with other actions.
   - If `setItemAssigneesFn` throws rate-limit errors, allow the outer loop to log and continue (existing behavior).

6. **Testing Strategy**
   - Create `test/rules/linked-issues-assignees.test.js` mirroring the column tests:
     - Inheritance when assignees differ.
     - Skip when sets already match.
     - Fallback when PR project item lookup fails (uses payload).
   - Mock dependencies (`getItemAssigneesFn`, `setItemAssigneesFn`, `isItemInProjectFn`) via dependency injection.

7. **Observability (Deferred to Task 2.5)**
   - Once metrics work begins, increment counters within the inheritance branch and skip guard.
   - Include assignee results in summary output (counts of updated vs skipped).

## Dependencies & Risks
- Depends on `fetchLinkedIssuesForPullRequest` returning project item IDs; if missing, inheritance gracefully skips due to `linkedIssueProjectItemId` guard.
- `setItemAssignees` internally fetches repo assignees; ensure this remains efficient under repeated calls (potential future optimization: pass current repo assignees through overrides).
- Rate limits: assignee mutations are REST-based; batching is not available. Monitor for bursts when many linked issues inherit simultaneously.

## Deliverables
- Updated `processLinkedIssues` with project-state based assignee inheritance and enriched skip reasons.
- New unit tests in `test/rules/linked-issues-assignees.test.js` covering inheritance/no-op paths.
- Documentation updates (plan/tasks) once implementation lands.
