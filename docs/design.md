# Design notes

How the sync works today. The README covers inputs and `rules.yml` keys; this note covers the decisions behind them.

## Configuration
- `rules.yml` is the only source of settings. Every key the engine reads is required there; the few optional keys (for example `exclusions.exclude_labels`) default to an empty list. Unknown keys under fixed sections are rejected.
- The engine hardcodes no user, organization, project URL or column name.
- `loadBoardRules` flattens `automation.repository_scope.repositories` into `project.repositories` and `automation.user_scope.monitored_users` into `monitoredUsers`. `project.allowedOrgs` defaults to the project owner.
- There is no rule language: behaviour comes from the plain lists in `board_columns`, `sprints` and `exclusions`.

## Discovery
- Each run searches items updated since the last successful run's watermark (with a 10-minute overlap), or `technical.update_window_hours` when there's none.
- Repository scope: open issues and PRs, plus closed unmerged PRs, in the listed repositories.
- User scope, for each monitored user across `allowedOrgs`: PRs they authored, items assigned to them, and PRs awaiting their review.
- A catch-up run (backfill) ignores the watermark, only adds missing items, and doesn't save the watermark.

## Board changes
- Columns follow `board_columns`: locked columns are never touched, PRs move by draft or ready state, issues a PR closes follow that PR, and new issues get `issue.no_status`. `keep` leaves an item where it is.
- Closed and merged items aren't moved by the sync; GitHub's built-in project workflows move them to Done.
- Sprints follow the item's final column through `sprints`.
- A monitored user's authored item is assigned to them, and issues a PR closes inherit its assignee, when the token can assign.
- Excluded titles and labels are skipped on every run; items already on the board aren't removed.
