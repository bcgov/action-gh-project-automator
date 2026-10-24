# Consumer Setup Prompt

Use this prompt to instruct an AI coding assistant to create and configure a dedicated consumer repository for GitHub Projects board automation.

---

Set up a consumer repository for GitHub Project board automation under `<CONSUMER_REPO>` (e.g. `DerekRoberts/project-sync`, public by default unless private is requested) to run automated board synchronization using `bcgov/project-automator`.

### 1. Gather Inputs (or ask the user if any are missing)
- **Consumer Repository**: `<CONSUMER_REPO>` (create as a public repository if it does not exist yet).
- **Project Board URL**: `<PROJECT_BOARD_URL>` (e.g. `https://github.com/orgs/<ORG>/projects/<NUMBER>`).
- **Monitored Repositories**: `<REPOSITORIES>` for `automation.repository_scope.repositories` (or copy the current `rules.yml` from `bcgov/project-automator` if migrating the existing board config).
- **Monitored Users**: `<USERS>` for `automation.user_scope.monitored_users`.
- **Allowed Organizations**: `<ALLOWED_ORGS>` for `project.allowedOrgs` (defaults to the project board's organization plus any additional organizations whose repositories or user items are tracked).

### 2. Action Pin & Workflows
- Query the latest release tag and its full 40-character commit SHA from `bcgov/project-automator` (e.g. `gh api repos/bcgov/project-automator/tags --jq '.[0] | "\(.commit.sha) # \(.name)"'`) and `actions/checkout`. Never use floating tags (`@v1`, `@main`).
- Configure `.github/workflows/sync.yml`:
  - Triggers: staggered hourly schedule (e.g. `cron: "17 * * * *"`, never `0 * * * *`) and `workflow_dispatch` with boolean inputs `catch_up` (default `false`) and `dry_run` (default `false`).
  - Permissions: `permissions: {}` at top level; `contents: read` on the job.
  - Concurrency: `group: ${{ github.workflow }}-${{ github.event_name }}-${{ github.ref }}` with `cancel-in-progress: true` so scheduled runs never cancel a manual `catch_up` run.
  - Runner & Timeout: `runs-on: ubuntu-26.04` and `timeout-minutes: ${{ inputs.catch_up && 60 || 5 }}`.
  - Step inputs: `github_token: ${{ secrets.PROJECT_SYNC_TOKEN }}`, `config_path: rules.yml`, `dry_run: ${{ inputs.dry_run || false }}`, `backfill: ${{ inputs.catch_up && 'all' || '' }}`, `verbose: 'true'`.
  - If `rules.yml` defines per-owner `tokens:`, pass each mapped environment variable in the step's `env:` block from `secrets.<VAR_NAME>`.

### 3. Configuration (`rules.yml` & `README.md`)
- Port `rules.yml` from `bcgov/project-automator` (or `template/rules.yml`) and populate `project.url`, `project.organization`, `project.allowedOrgs`, `automation.user_scope.monitored_users`, and `automation.repository_scope.repositories`.
- Add a concise `README.md` and `.gitignore` (`.tmp/`, `node_modules/`, `*.log`).

### 4. Authentication (Prefer Fine-Grained PATs)
Guide the user to create Fine-Grained Personal Access Token(s) at `https://github.com/settings/personal-access-tokens/new` and store the secret(s) in `<CONSUMER_REPO>` (`Settings -> Secrets and variables -> Actions`, or `gh secret set <NAME> -R <CONSUMER_REPO>`):
- **Primary token (`PROJECT_SYNC_TOKEN`)**:
  - **Resource owner**: The organization that owns the project board (`<ORG>`).
  - **Repository access**: **All repositories** (required when `user_scope` is set or to read linked issues across the org; otherwise select the monitored repositories).
  - **Permissions**: **Organization -> Projects: Read and write**, **Repository -> Issues: Read and write**, **Repository -> Pull requests: Read and write** (read-only on Issues/PRs is sufficient if automatic self-assignment of authored items is not needed).
- **Additional organizations (multi-org setup with Fine-Grained PATs)**:
  - A fine-grained token is scoped to a single organization, but its GraphQL search and board-item mutations can still read and add **public** issues and PRs from other organizations in `allowedOrgs` (e.g. public repos in `bcgov-c`).
  - If another organization in `allowedOrgs` or `repository_scope` has **private** repositories (or needs assignee writes in that org), create a second Fine-Grained PAT with **Resource owner** set to that organization (**All repositories**, **Repository -> Issues & Pull requests: Read and write**), add it as a repository secret (e.g. `BCGOV_C_TOKEN`), map it under `tokens:` in `rules.yml` (`bcgov-c: BCGOV_C_TOKEN`), and pass it in `sync.yml` under `env:`. Note: adding a private item from another organization onto the board requires the board's token to also have visibility into that item; if the board organization's fine-grained token cannot see another organization's private repository, only public items from that organization can be added to the board without a Classic PAT (`project`, `repo`).
- **User-owned boards (`https://github.com/users/<USER>/projects/<N>`)**:
  - GitHub Fine-Grained PATs do not support user-owned Projects v2; only then fall back to a Classic PAT (`project`, `repo`).

### 5. Merge & Verification
- Open a PR (or push to `main` if initializing an empty repo) and wait for `.github/workflows/sync.yml` to be on the default branch (`main`) — GitHub Actions `workflow_dispatch` cannot run until the workflow file is on the default branch.
- Once on `main` and `PROJECT_SYNC_TOKEN` is set, trigger a dry-run verification:
  `gh workflow run sync.yml -R <CONSUMER_REPO> -f dry_run=true`
- Inspect the run log (`gh run view --log`) to confirm `Access: ...: OK` across the project board, organizations, and repositories.
- Trigger a manual catch-up run to backfill existing open items onto the board:
  `gh workflow run sync.yml -R <CONSUMER_REPO> -f catch_up=true`

