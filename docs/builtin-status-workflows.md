# Built-in Status workflows vs Sync

Policy ([ADR-030](https://github.com/DerekRoberts/brain/pull/63), #327): prefer GitHub Projects' free built-in workflows for Status stamps. Sync keeps only what built-ins can't do: intake onto the board, sprints, exclusions, the New lock for issues, Waiting/Parked hands-off and anything needing custom fields or filters.

A Sync Status move is cut only when a built-in already owns it and behaves the same. Today no Sync move qualifies (see "Not cut" below), so this is an inventory, not a code change.

## Inventory

| Status behaviour | Owner | Project config / `rules.yml` key | Notes |
| --- | --- | --- | --- |
| Item added to project | Built-in (PRs → Active; issues off) | Project workflow "Item added to project" | Fixed after #182 sat in New |
| Item closed / PR merged → Done | Built-in | Project workflows "Item closed", "Pull request merged" | Sync never moves closed or merged items |
| Item reopened | Built-in if enabled; Sync doesn't move items out of Done | Project workflow "Item reopened"; `board_columns.locked` has Done | Sync won't pull a reopened item out of Done, so set the built-in to the wanted column |
| PR ready for review → Active | Sync | `board_columns.pull_request.ready` | Also covers draft → ready and open PRs stuck in New |
| New draft PR with no Status → Active | Sync | `board_columns.pull_request.draft_no_status` | Overlaps Item added for PRs, kept as a fallback |
| Draft PR with a Status | Sync (keep) | `board_columns.pull_request.draft` | No move |
| Open PR in New → Active (safety net) | Sync | `locked` lists New for issues only; hourly run (#326) | No built-in fixes items already in New |
| Issue with no Status → New | Sync | `board_columns.issue.no_status` | Item added is off for issues |
| Linked issue follows its PR | Sync | `board_columns.linked_issue.*` | Built-in "Pull request linked to issue" stamps the PR, not the issue; keep it off or not New for PRs |
| Locked columns (New for issues, Done, Waiting, Parked) | Sync | `board_columns.locked` | No built-in equivalent |
| Sprint set / cleared | Sync | `sprints.*` | Built-ins only set Status |
| Intake (authored, assigned, review requested, repo scope) | Sync | `automation.*` | Built-in auto-add filters can't match user scope across orgs |
| Exclusions (titles, labels, bots) | Sync | `exclusions.*` | No built-in equivalent |
| Review approved / changes requested | Neither (optional built-in) | Project workflows | Enable only if it matches the board's meaning |

## Not cut

- `pull_request.ready` and `draft_no_status`: Item added only fires on add. It doesn't cover draft → ready, PRs added before the built-in was fixed, or PRs that land in New; the #326 hourly safety net depends on these.
- Everything else Sync owns has no built-in that does the same job.
