# Copilot Instructions

A JavaScript GitHub Action (native ES modules, Node 24) that syncs issues and pull requests onto a GitHub Projects (v2) board. `rules.yml` is the only source of settings; see `README.md` for its keys and `docs/design.md` for how the sync works.

## Layout

| Path              | Contents                                                           |
| ----------------- | ------------------------------------------------------------------ |
| `src/index.js`    | The sync run: discovery, adds, column, sprint and assignee updates |
| `src/config/`     | `rules.yml` loading and its JSON schema                            |
| `src/github/`     | GitHub API calls and search queries                                |
| `src/utils/`      | Column, sprint, exclusion, backfill, watermark and summary helpers |
| `src/validate.js` | Offline config check and `--dry-run`                               |
| `test/`           | `node --test` suites                                               |
| `rules.yml`       | The config this repo's own sync uses                               |

## Commands

```bash
npm ci
npm test
npm run lint
npm run build # ncc bundle into dist/, only to inspect it
```

`dist/` is gitignored on main; don't commit it. The release workflow builds it and commits it to the release tag.

## Guidelines

- Keep changes small and match existing patterns. Comments explain why, not what.
- Log with `@actions/core`, not `console`.
- Tests use `node:test` and `node:assert`, make no network calls (stub `fetch` or inject dependencies), and cover edge cases as well as the main path.
- Don't hardcode users, organizations, project URLs or column names; read them from `rules.yml`. A new optional key needs a safe default so existing configs keep loading.
- Update `README.md` when inputs or `rules.yml` keys change, and `docs/design.md` when sync behaviour changes.
- Don't change the `package.json` version in a PR; releases are cut separately.

## Domain notes

- `automation.repository_scope.repositories` only decides which items are discovered and added. It never gates column, sprint or assignee updates for items already on the board.
- Before blaming `rules.yml` for a missed item, trace `src/` to confirm the setting is actually read, and check whether discovery found the item or filtered it out.

## Pull requests

- CI must pass: lint, build and unit tests. The `Action` job then runs the PR's code for real against the board in `rules.yml`, so a ready PR must be safe to run.
- The body summarizes the change, notes dependency changes, and links the issue.
- Reviews check that behaviour changes are reflected in `README.md`.
