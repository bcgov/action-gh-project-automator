# Consumer Setup Prompt

Use this prompt to instruct an AI coding assistant to create and configure a dedicated consumer repository for GitHub Projects board automation.

---

Set up a consumer repository for GitHub Project board automation under the `<ORG_OR_USER>` account to run automated board synchronization using `bcgov/project-automator`.

### Target & Requirements:
1. **Repository**: Create or configure a dedicated repository under `<ORG_OR_USER>` (e.g. `<ORG_OR_USER>/project-sync`).
2. **Action Pin**: Reference the immutable release commit SHA from `bcgov/project-automator` releases (e.g. `uses: bcgov/project-automator@<RELEASE_SHA> # vX.Y.Z`).
3. **Configuration**:
   - Port the `rules.yml` template from `bcgov/project-automator`.
   - Update `project.url` to `<PROJECT_BOARD_URL>` (e.g. `https://github.com/orgs/<ORG>/projects/<NUMBER>`).
   - Configure `automation.repository_scope` and/or `automation.user_scope` for the target repositories and users.
   - Configure `.github/workflows/sync.yml` with:
     - Staggered hourly schedule (e.g. `17 * * * *` to avoid top-of-hour GitHub Actions load drops).
     - `workflow_dispatch` with `catch_up` and `dry_run` boolean inputs (both defaulting to `false`).
     - Event-isolated concurrency (`group: ${{ github.workflow }}-${{ github.event_name }}-${{ github.ref }}` with `cancel-in-progress: true`) so manual and scheduled runs do not cancel each other.
     - Dynamic timeout (`timeout-minutes: ${{ inputs.catch_up && 60 || 5 }}`).
     - Explicit LTS runner (`ubuntu-26.04`).
     - Minimal permissions (`permissions: {}` top-level, `contents: read` on job).
     - Step parameters: `dry_run: ${{ inputs.dry_run || false }}` and `backfill: ${{ inputs.catch_up && 'all' || '' }}`.
4. **Interactive Token Guidance & Verification**:
   - Walk the user through creating their `PROJECT_SYNC_TOKEN` by asking two scoping questions:
     1. Does the board or monitored repositories span multiple organizations (or a user account)?
     2. Is automatic assignment of authored items to monitored users required (requires repo write access)?
     Provide direct links to GitHub's token creation and repository secrets settings.
   - Remind the user to merge the initial PR to the default branch (`main`) so GitHub Actions activates `workflow_dispatch`.
   - Trigger or run the startup access check via `workflow_dispatch` with `dry_run: true` to confirm board and repository connectivity.
   - Trigger a manual `workflow_dispatch` with `catch_up: true` to backfill existing open issues and pull requests onto the board.
