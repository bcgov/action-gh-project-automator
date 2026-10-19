# Project Board Automator Constitution

Operating principles for this action. `docs/design.md` describes how the sync works; `README.md` documents inputs and `rules.yml` keys.

## Configuration
- `rules.yml` is the only source of settings. The engine hardcodes no user, organization, project URL or column name.
- Every key the engine reads is required, except a few optional lists that default to `[]` so existing configs keep loading. Unknown keys in fixed sections are rejected.
- Settings are plain lists (`board_columns`, `sprints`, `exclusions`, the two scopes); there is no rule language.
- Load and validate config through `src/config` (`loadBoardRules` and the JSON schema) before any API call.

## Engine
- `src/index.js` runs the sync: search since the watermark, skip excluded titles and labels, add missing items, then set column, sprint and assignee, including for the issues a PR closes.
- Helpers live in `src/utils` (columns, sprints, exclusions, backfill, watermark, summary) and `src/github` (API calls and search queries).
- Closed and merged items are left to GitHub's built-in project workflows.
- Guard every write with a no-op check, honour `DRY_RUN`, and log with `@actions/core`.
- Fail clearly on missing access; don't save the watermark after a failed search.

## Code and tests
- Native ES modules on Node 24; no CommonJS.
- Tests use `node:test` and `node:assert` and make no network calls (stub `fetch` or inject dependencies). Cover edge cases and add a regression test for each bug fix.

## Change control
- Preserve current behaviour by default; changing a default needs explicit sign-off.
- Keep PRs small. Update `README.md` when inputs or `rules.yml` keys change, and `docs/design.md` when sync behaviour changes.
