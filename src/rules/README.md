# Project Board Sync Rules

This document describes the five rule sets that govern how items (PRs and Issues) are managed in the project board.

## 1. Board Addition Rules

These rules determine which items are added to the project board:

| Item Type | Trigger Condition             | Action               | Skip Condition     |
|-----------|-------------------------------|----------------------|--------------------|
| PR        | Authored by monitored user    | Add to project board | Already in project |
| PR        | Assigned to monitored user    | Add to project board | Already in project |
| PR        | Found in monitored repository | Add to project board | Already in project |
| Issue     | Found in monitored repository | Add to project board | Already in project |

## 2. Column Rules

These rules decide which column an item goes in. They're configured in `board_columns` in `rules.yml` (`keep` means the item stays where it is):

| Item / event                  | PR column                 | Linked issue column |
|-------------------------------|---------------------------|---------------------|
| PR open, ready for review     | Active                    | Active              |
| PR is a draft                 | Stays put (New if no Status) | Stays put (the draft PR is the lock) |
| PR closed without merging     | Not moved                 | Next                |
| PR merged / item closed       | Not moved (GitHub's built-in project workflows move it to Done) | Not moved |
| Issue with no Status          | -                         | New                 |
| Item in Waiting or Parked     | Never moved               | Never moved         |

## 3. Sprint Assignment Rules

These rules determine which sprint an item belongs to:

| Item Type | Trigger Condition   | Action         | Skip Condition             |
|-----------|---------------------|----------------|----------------------------|
| PR, Issue | Column=Next, Active | Sprint=current | Sprint=current already set |
| PR, Issue | Column=Done         | Sprint=current | Sprint=any already set     |

## 4. Linked Issue Rules

When a PR is linked to issues using closing keywords (e.g., "fixes #123"), those issues should inherit:

1. A column based on the PR's state (see Column Rules)
2. The same sprint as the PR
3. The same assignee(s) as the PR

This ensures that related issues are properly tracked alongside their fixing PRs.

## 5. Assignee Rules

These rules govern how assignees are managed:

1. PRs should have at least one assignee
2. If no assignee is set, assign to PR author. If GitHub refuses the assignment for permission reasons (HTTP 403, 404 or 422, e.g. a fork PR target the token can't write to), the assignee update is skipped with a warning and the board update still proceeds.
3. Linked issues inherit assignees from their linked PRs

## Implementation Notes

- The rules are processed in order (1-5) to ensure consistent state
- All operations are idempotent - running multiple times produces the same result
- Errors during processing of one item don't stop processing of others
- Changes are logged for audit purposes
