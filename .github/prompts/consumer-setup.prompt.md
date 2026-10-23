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
   - Configure `.github/workflows/sync.yml` with an hourly schedule (`0 * * * *`), `workflow_dispatch`, explicit LTS runner (`ubuntu-24.04`), and minimal permissions (`permissions: {}` top-level, `contents: read` on job).
4. **Safety & Verification**:
   - Configure `dry_run: true` for the initial verification run.
   - Guide the user to add the required `PROJECT_SYNC_TOKEN` secret to repository secrets.
   - Trigger or run the startup access check to confirm board and repository connectivity.
   - Once verified green, switch `dry_run` to `false` for live scheduled runs.
   - Trigger a manual `workflow_dispatch` with `catch_up: true` to backfill existing open issues and pull requests onto the board.
