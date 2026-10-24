# Consumer Setup Prompt

Use this prompt to instruct an AI coding assistant to create and configure a dedicated consumer repository for GitHub Projects board automation.

---

Set up a consumer repository for GitHub Project board automation under `<CONSUMER_REPO>` (e.g. `DerekRoberts/project-sync`, public by default unless private is requested) to run automated board synchronization using `bcgov/project-automator`.

### 1. Gather Inputs (ask the user for any missing values before writing files)
- **Consumer Repository**: `<CONSUMER_REPO>` (create as a public repository if it does not exist yet).
- **Project Board URL**: `<PROJECT_BOARD_URL>` (e.g. `https://github.com/orgs/<ORG>/projects/<NUMBER>`).
- **Monitored Repositories**: `<REPOSITORIES>` for `automation.repository_scope.repositories` (or copy the current `rules.yml` from `bcgov/project-automator` if migrating the existing board config).
- **Monitored Users**: `<USERS>` for `automation.user_scope.monitored_users`.
- **Allowed Organizations**: `<ALLOWED_ORGS>` for `project.allowedOrgs` (defaults to the project board's organization plus any additional organizations whose repositories or user items are tracked).
- **Token Type Direction**: Assume by default that the user only has **user-scoped PATs** (since most organizations block org-scoped fine-grained tokens and GitHub Apps), and ask the user to confirm whether to use the default **Classic PAT (`project` + `public_repo`)** or an **org-scoped Fine-Grained PAT** if their organization explicitly allows it.

### 2. Action Pin & Workflows
- Query the latest release tag and its full 40-character commit SHA from `bcgov/project-automator` (e.g. `gh api repos/bcgov/project-automator/tags --jq '.[0] | "\(.commit.sha) # \(.name)"'`) and `actions/checkout`. Never use floating tags (`@v1`, `@main`).
- Configure `.github/workflows/sync.yml`:
  - Triggers: staggered hourly schedule (e.g. `cron: "17 * * * *"`, never `0 * * * *`) and `workflow_dispatch` with boolean inputs `catch_up` (default `false`) and `dry_run` (default `false`).
  - Permissions: `permissions: {}` at top level; `contents: read` on the job.
  - Concurrency: `group: ${{ github.workflow }}-${{ github.event_name }}-${{ github.ref }}` with `cancel-in-progress: true` so scheduled runs never cancel a manual `catch_up` run.
  - Runner & Timeout: `runs-on: ubuntu-26.04` and `timeout-minutes: ${{ inputs.catch_up && 60 || 5 }}`.
  - Step inputs: `github_token: ${{ secrets.PROJECT_SYNC_TOKEN }}`, `config_path: rules.yml`, `dry_run: 'true'` (keep unconditionally in dry-run mode during initial setup so scheduled runs do not mutate the board before verification completes), `backfill: ${{ inputs.catch_up && 'all' || '' }}`, `verbose: 'true'`.
  - If `rules.yml` defines per-owner `tokens:`, pass each mapped environment variable in the step's `env:` block from `secrets.<VAR_NAME>`.

### 3. Configuration (`rules.yml` & `README.md`)
- Port `rules.yml` from `bcgov/project-automator` (or `template/rules.yml`) and populate `project.url`, `project.organization`, `project.allowedOrgs`, `automation.user_scope.monitored_users`, and `automation.repository_scope.repositories`.
- Add a concise `README.md` and `.gitignore` (`.tmp/`, `node_modules/`, `*.log`).

### 4. Authentication (Default to User-Scoped Classic PAT; Ask User Before Choosing)
Most users cannot create org-level Fine-Grained PATs (many organizations, such as `bcgov`, block org-scoped fine-grained tokens and custom GitHub Apps), and GitHub only exposes the `Organization -> Projects` permission on a Fine-Grained PAT when the organization is selected as the **Resource owner** (a user-scoped Fine-Grained PAT has no `Projects` permission at all). Ask the user for direction and guide them through setting `PROJECT_SYNC_TOKEN` in `<CONSUMER_REPO>` (`Settings -> Secrets and variables -> Actions`, or `gh secret set PROJECT_SYNC_TOKEN -R <CONSUMER_REPO>`):
- **Option A (Default — Most Users) — User-scoped Classic PAT**:
  - Create a **Classic PAT** with least-privilege scopes:
    - **Public repositories only (recommended)**: `project` and `public_repo` scopes (`https://github.com/settings/tokens/new?scopes=project,public_repo&description=PROJECT_SYNC_TOKEN`). This grants read/write on the project board and assignee updates on public repos across all `allowedOrgs` without granting access to any private repositories (`project` alone is sufficient if automatic self-assignment of authored items is not needed).
    - **Private repositories included**: `project` and `repo` scopes (`https://github.com/settings/tokens/new?scopes=project,repo&description=PROJECT_SYNC_TOKEN`).
- **Option B (If Available) — Organization allows org-scoped Fine-Grained PATs**:
  - Create a **Fine-Grained PAT** at `https://github.com/settings/personal-access-tokens/new` with **Resource owner** set to the board's organization (`<ORG>`), **Repository access** set to **All repositories**, and permissions **Organization -> Projects: Read and write**, **Repository -> Issues: Read and write**, **Repository -> Pull requests: Read and write**.
  - Note: Adding an item to the board uses only the board owner's token, so Fine-Grained PATs only support cross-organization board additions when the other organization's items are **public** (you may optionally map a second Fine-Grained PAT under `tokens:` in `rules.yml` + `env:` in `sync.yml` for cross-org public-repository assignee writes). Adding **private** items from another organization requires a board token with access to both resources (use Option A: Classic PAT with `project` and `repo`).

### 5. Merge & Verification
- Open a PR (or push to `main` if initializing an empty repo) and wait for `.github/workflows/sync.yml` to be on the default branch (`main`) — GitHub Actions `workflow_dispatch` cannot run until the workflow file is on the default branch.
- Once on `main` and `PROJECT_SYNC_TOKEN` is set, trigger a dry-run verification:
  `gh workflow run sync.yml -R <CONSUMER_REPO> -f dry_run=true`
- Inspect the run log (`gh run view --log`) to confirm `Access: ...: OK` across the project board, organizations, and repositories.
- Once verified green, update `dry_run` in `.github/workflows/sync.yml` from `'true'` to `${{ inputs.dry_run || false }}` on `main` to enable live scheduled runs.
- Trigger a manual catch-up run to backfill existing open items onto the board:
  `gh workflow run sync.yml -R <CONSUMER_REPO> -f catch_up=true`

