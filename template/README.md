# Project Board Sync

Dedicated consumer repository running automated GitHub Projects synchronization using [`bcgov/project-automator`](https://github.com/bcgov/project-automator).

## Structure
- [`rules.yml`](rules.yml): Board status, sprints, monitored repositories, and exclusions.
- [`.github/workflows/sync.yml`](.github/workflows/sync.yml): Scheduled hourly live sync with manual `dry_run` and `catch_up` controls.
- [`.github/workflows/validate.yml`](.github/workflows/validate.yml): Pull request validation ensuring rules and connectivity remain valid before merging.

## Setup & Secrets
Requires a Personal Access Token stored as a repository secret named `PROJECT_SYNC_TOKEN`.
See the [interactive token guide](https://github.com/bcgov/project-automator#authentication--token-setup) for pre-scoped PAT links.
