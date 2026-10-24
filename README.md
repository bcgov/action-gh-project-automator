# Project Sync

[![Node.js 24+](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![ES Modules](https://img.shields.io/badge/module-ESM-blue.svg)](https://nodejs.org/api/esm.html)
[![Checks](https://img.shields.io/badge/Stability-Ludicrous%20Coverage-orange.svg)](#stability--predictability)

**Project Sync** is a high-performance GitHub Projects v2 automation engine designed to synchronize issues and pull requests across complex, multi-repository organizations with 100% predictability.

## Overview

This tool transforms your GitHub Project into a self-driving productivity engine. It eliminates manual board maintenance by implementing a rule-based state machine for:

- **Intelligent Intake**: Automatically adds PRs and issues to the project board based on authorship, assignment, or repository source.
- **Dynamic Workflows**: Moves items between columns (e.g., `New` → `Active`) based on real-time state changes.
- **Sprint Orchestration**: Seamlessly manages sprint assignments and rollovers.
- **Smart Inheritance**: Propagates PR metadata (sprints, columns, and the author as assignee when a monitored user wrote the PR) to linked issues.
- **Multi-Org Mastery**: Monitors activity across `bcgov` and `bcgov-c` simultaneously.

## Usage as a GitHub Action

You can consume Project Automator as a standalone GitHub Action in your own consumer repository:

```yaml
name: Board Sync

on:
  schedule:
    - cron: "17 * * * *" # Hourly (staggered to avoid top-of-hour runner contention)
  workflow_dispatch:
    inputs:
      catch_up:
        description: 'Catch up: add all missing open items'
        required: false
        default: false
        type: boolean
      dry_run:
        description: 'Dry run: execute in read-only mode'
        required: false
        default: false
        type: boolean

permissions: {}

concurrency:
  group: ${{ github.workflow }}-${{ github.event_name }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  sync:
    name: Sync Board
    runs-on: ubuntu-26.04
    timeout-minutes: ${{ inputs.catch_up && 60 || 5 }}
    permissions:
      contents: read
    steps:
      - name: Checkout Rules
        uses: actions/checkout@<checkout-release-sha> # v7.0.1

      - name: Run Project Automator
        uses: bcgov/project-automator@<release-commit-sha> # vX.Y.Z
        with:
          github_token: ${{ secrets.PROJECT_SYNC_TOKEN }}
          config_path: rules.yml
          dry_run: ${{ inputs.dry_run || false }}
          backfill: ${{ inputs.catch_up && 'all' || '' }}
          verbose: 'true'
```

Always pin the action to a full 40-character release commit SHA rather than a floating tag (such as `@v1`). Floating tags can be retargeted or mutated, introducing unexpected behavioral changes or supply-chain risks into scheduled workflows. Release SHAs are published in each [GitHub Release](https://github.com/bcgov/project-automator/releases).

### Action Inputs

| Input | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `github_token` | **Yes** | `github.token` | Personal access token that can read and write the project board and read the monitored repositories. The default Actions token has no Projects access, so the run fails until you set this. A `GITHUB_TOKEN` environment variable never replaces it. See [Authentication & Token Setup](#authentication--token-setup). |
| `config_path` | No | `rules.yml` | Path to rules configuration file in the repository. |
| `dry_run` | No | `false` | Run in read-only mode without mutating board items or watermarks. |
| `backfill` | No | `''` | Backfill window for open items: `30d`-style or `all`. |
| `verbose` | No | `true` | Enable verbose log output. |
| `validate_only` | No | `false` | Verify configuration syntax, remote board connectivity, and status columns without syncing or mutating items. |

## Automated Noise Exclusions

To prevent automated noise and metadata artifacts from cluttering the project board, the engine early-skips issues and pull requests matching specific titles or labels before applying rule transitions.

### Default Exclusions
By default, the engine excludes:
- **Dependency Dashboard** (Exact Match): Excludes Renovate or Dependabot organization-wide interactive dashboards.
- **ZAP Security Report** (Substring Match): Excludes automated vulnerability and security scan reports.
- **ZAP Full Scan Report**, **ZAP Scan Baseline Report**, **ZAP API Scan Report** (Substring Match): Exclude issues opened by the ZAP GitHub Actions (`zaproxy/action-full-scan`, `action-baseline`, `action-api-scan`) under their default titles, and titles that extend them (e.g. `ZAP Full Scan Report: <url>` from `bcgov/actions/scan-url`).
- **ZAP: ** (Prefix Match): Excludes ZAP reports opened with a custom `issue_title` such as `ZAP: <name>` (e.g. `ZAP: backendPy` from `bcgov/quickstart-openshift-modules`).

### Custom Exclusions
Teams can customize exclusions in their `rules.yml` to filter out specific automated noise:

```yaml
# Exclusion rules to filter out automated noise by title
exclusions:
  exact_titles:
    - "Dependency Dashboard"
    - "My Custom Noise Title"
  title_substrings:
    - "ZAP Security Report"
    - "ZAP Full Scan Report"
    - "ZAP Scan Baseline Report"
    - "ZAP API Scan Report"
    - "[Automated]"
  title_prefixes:
    - "ZAP: "
  exclude_labels:
    - "do not track"
```

Strings checked against `exact_titles` must match the issue or pull request title exactly (trailing/leading whitespaces and carriage returns are automatically trimmed before evaluation). Strings in `title_substrings` will exclude any item containing that substring, and strings in `title_prefixes` will exclude any item whose title starts with that prefix. Title matches are case-sensitive. An item carrying any label in `exclude_labels` is skipped; label names must match whole, ignoring case, as GitHub treats label names. The three title lists are required in `rules.yml`; there are no built-in defaults. `exclude_labels` is the one optional key: when it's absent, no labels are excluded (`[]`), so configs written before it keep working. Like title exclusions, a label exclusion skips the item on every run, so it isn't added, moved or assigned; it isn't removed from the board if it's already there. Title and label exclusions also apply to the issues a PR closes, so an excluded issue isn't moved, given a sprint or assigned through its PR.

### Author exclusions

Two optional keys skip items by who opened them, such as dependency bots, so routine updates don't count as sprint work:

```yaml
exclusions:
  authors:
    - renovate[bot]
    - dependabot[bot]
    - mend-bolt-for-github[bot]
    - mend-for-github-com[bot]
  unless_review_requested: true
```

`authors` lists GitHub logins, matched ignoring case; bots use their full login with the `[bot]` suffix. Renovate run by Mend opens PRs as `renovate[bot]`. An issue or PR by a listed author is skipped like any other exclusion. With `unless_review_requested: true`, a PR by a listed author is still added when a monitored user is a requested reviewer, so a bot PR that needs a person's attention still reaches the board. Both keys are off when absent (`[]` and `false`), and the engine has no built-in author list. Nothing already on the board is removed.

`github-actions[bot]` is deliberately not listed: workflows use it to open real report PRs (for example in `bcgov/action-repo-reporter`), so excluding it would hide work. The trade-off is that any routine PR a workflow opens as `github-actions[bot]` still reaches the board. The title exclusions above stay as a fallback for bot issues such as the Dependency Dashboard and ZAP reports.

## Stability & Predictability

We treat stability as a first-class feature. Our "Ludicrous Testing" philosophy ensures that every rule processed is verified against a comprehensive matrix of conditions.

- **Hardcoded Validation**: We use a strict whitelist-based validator to ensure rule evaluation is 100% predictable and secure against code injection.
- **Native Efficiency**: Built on **Node.js 24** and native **ES Modules** for lightning-fast, future-proof execution.
- **Zero-Network Tests**: Our 240+ count test suite runs in pure isolation, guaranteeing that the core logic is bulletproof without ever making a real API call.
- **Strict Environments**: We enforce Node versions via `.npmrc` to ensure that every developer and CI runner is perfectly aligned.

## Visibility & Auditing

Designed for transparency. Every run provides:

- **GitHub Actions Job Summary**: A premium Markdown report generated in the Action's summary tab.
- **Audit Logs**: Detailed console output with a `[AUDIT]` prefix for all state transitions.
- **Precision Metrics**: Real-time counters for processed, added, and skipped items.

## Consumer Setup

Run this action from your own dedicated consumer repository, which holds your `rules.yml`, your workflow, and your token secrets. This engine repository provides the reusable action logic and an example [`rules.yml`](rules.yml).

### Automated Consumer Scaffolding (1-Line Setup)

To bootstrap a consumer repository in seconds without installing Node.js or cloning this repository, run the curl bootstrap command:

```bash
curl -fsSL https://raw.githubusercontent.com/bcgov/project-automator/main/scripts/setup-consumer.sh | bash
```

Or pass your arguments directly:
```bash
curl -fsSL https://raw.githubusercontent.com/bcgov/project-automator/main/scripts/setup-consumer.sh | bash -s -- \
  --board https://github.com/orgs/<ORG>/projects/<NUMBER> \
  --repos <ORG>/<REPO1>,<ORG>/<REPO2> \
  --users <USER1> \
  --dir ./project-sync
```

This generates `rules.yml`, `.github/workflows/sync.yml`, `.github/workflows/validate.yml`, `.gitignore`, and `README.md` pre-populated with your board and repository settings, alongside the exact pre-scoped token setup URL.

### Step-by-Step Consumer Quickstart

Follow these 5 steps to configure automated synchronization for your GitHub Project:

1. **Create a Dedicated Consumer Repository**:
   Create a repository (e.g. `your-org/project-sync`), public by default (use a private repository only if your board metadata or repository names are sensitive).
2. **Add `rules.yml`**:
   Copy [`rules.yml`](rules.yml) into the root of your consumer repository (or into `boards/<name>.yml` for multi-board setups). Customize:
   - `project.url`: Your GitHub Project (v2) URL (e.g. `https://github.com/orgs/my-org/projects/1`).
   - `project.organization`: Default organization for unqualified repository names.
   - `project.allowedOrgs`: Organizations to query for user-scoped items.
   - `automation.repository_scope.repositories`: Repositories whose open items are synced unconditionally.
   - `automation.user_scope.monitored_users`: Logins whose authored, assigned, or review-requested items are tracked.
   - `board_columns` & `sprints`: Status columns and active sprint assignments.
3. **Generate & Configure Token Secret (`PROJECT_SYNC_TOKEN`)**:
   Prefer **Fine-Grained PATs** (see [Authentication & Token Setup](#authentication--token-setup)):
   - **Organization Boards (Single or Multi-Organization)**: Create a [Fine-Grained PAT](https://github.com/settings/personal-access-tokens/new) scoped to the board's organization (`Organization → Projects: Read and write`, `Repository → Issues: Read and write`, `Repository → Pull requests: Read and write`). It can also search and add **public** items from other organizations in `allowedOrgs` (e.g. `bcgov-c`). If another organization has private repositories or needs assignee writes, map a second fine-grained PAT for that organization under [`tokens:`](#per-owner-tokens-optional).
   - **User-Owned Boards (`github.com/users/.../projects/...`)**: Fine-grained tokens cannot access user-owned Projects v2; use a [Classic PAT](https://github.com/settings/tokens/new) (`project` and `repo` scopes).
   Save the token in your consumer repository under **Settings** → **Secrets and variables** → **Actions** as `PROJECT_SYNC_TOKEN`.
4. **Set Up Workflow (`.github/workflows/sync.yml`)**:
   Add [`.github/workflows/sync.yml`](#usage-as-a-github-action) on your default branch (`main`) with a staggered hourly cron (e.g. `17 * * * *`) and `workflow_dispatch`. Pin `bcgov/project-automator` to its full 40-character release commit SHA. (`workflow_dispatch` is only available once the workflow file is merged to the default branch.)
5. **Verify and Catch Up**:
   - Run an initial verification via **Actions** → **Board Sync** → **Run workflow** with `dry_run: true` (`gh workflow run sync.yml -R <OWNER>/<REPO> -f dry_run=true`).
   - Inspect the job log: verify that the startup access report confirms access to the project board and all monitored repositories (`Access: ...: OK`).
   - Run workflow dispatch with `catch_up: true` once to backfill any existing open issues and pull requests onto the board (`gh workflow run sync.yml -R <OWNER>/<REPO> -f catch_up=true`).

### Sample AI Agent Prompt

You can copy and paste this prompt directly into an AI coding assistant (such as GitHub Copilot, Cursor, or Claude) to set up and verify a dedicated consumer repository (also available in [`.github/prompts/consumer-setup.prompt.md`](.github/prompts/consumer-setup.prompt.md)):

```text
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
```

### Multi-board consumer repository layout

 A single consumer repository can manage one board (using a root `rules.yml`) or multiple boards (using one config file per board under `boards/`). Keep the repository public by default, or make it private if your board URLs, repository lists, or user scopes are internal.

Example layout, one workflow job per board:

```text
project-sync/
├── .github/
│   └── workflows/
│       └── sync.yml            # one job per board; the action pinned by release commit SHA
├── boards/
│   ├── org-a-board.yml         # rules.yml for one board
│   └── org-b-board.yml         # rules.yml for another board
└── README.md                   # which boards this repository manages and who owns each token
```

- Give each job only the secrets for its own board, through that job's `env:` and `with:`, never at workflow level.
- Pin the action by the full release commit SHA from the release notes, with the version as a comment, never by tag.
- Verify each board with `dry_run: true`, check the access report and planned changes in the log, and then run live scheduled syncs.

### Choosing tokens

| Your config covers | Token setup |
| --- | --- |
| One organization, with an organization-owned board | One **Fine-Grained PAT** as `github_token` (see [Authentication & Token Setup](#authentication--token-setup)). |
| Multiple organizations, with an organization-owned board | **Fine-Grained PATs** (recommended): one Fine-Grained PAT for the board's organization as `github_token` (which also covers public items in other `allowedOrgs`), plus an optional per-owner Fine-Grained PAT in `tokens:` for any additional organization that has private repositories or needs assignee writes (see [Per-Owner Tokens](#per-owner-tokens-optional)). A Classic PAT is only needed if a private item from another organization must be added onto the board. |
| A user-owned board (`github.com/users/.../projects/...`) | A **Classic PAT** as `github_token`: GitHub Fine-Grained PATs do not support user-owned Projects v2. |

- Prefer Fine-Grained PATs over Classic PATs: a fine-grained token is scoped to a single organization with explicit permissions, whereas a classic PAT grants broad `repo` access across every organization the user belongs to.
- The include and exclude lists in `rules.yml` limit what the action touches, **not** what a token can reach. Least privilege comes only from each token's scope.
- Some organizations require administrator approval for fine-grained tokens; check with an organization owner if token requests are queued for approval.

### Example workflow

```yaml
name: Board Sync
on:
  schedule:
    - cron: "30 * * * *" # hourly
  workflow_dispatch:
permissions: {}
jobs:
  org-a-board:
    runs-on: ubuntu-26.04
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@<release-commit-sha> # vX.Y.Z
      - uses: bcgov/project-automator@<release-commit-sha> # vX.Y.Z
        env:
          ORG_B_TOKEN: ${{ secrets.ORG_B_TOKEN }} # only if boards/org-a-board.yml maps an owner to it in tokens:
        with:
          github_token: ${{ secrets.ORG_A_BOARD_TOKEN }}
          config_path: boards/org-a-board.yml
          dry_run: 'true' # 'false' once the log looks right
```

## Configuration

Configure your entire workflow in a single, version-controlled `rules.yml` file.

### Project Connection
The tool resolves your project identity with minimal friction:

```yaml
project:
  url: https://github.com/orgs/bcgov/projects/16
  # Organization and ID are automatically resolved from the URL
```

### Resource Monitoring
Define which realms the engine should govern:

```yaml
project:
  allowedOrgs:
    - bcgov
    - bcgov-c
```

### Authentication & Token Setup

The sync engine requires authentication via a repository secret named `PROJECT_SYNC_TOKEN` configured in your workflow (`.github/workflows/sync.yml`).

#### Fine-Grained Personal Access Token (Recommended for Organization Boards)

Use a fine-grained PAT whenever your project board is owned by an organization (both single-organization and multi-organization setups):

1. Go to GitHub **Settings** → **Developer Settings** → **Personal Access Tokens** → [**Fine-grained tokens**](https://github.com/settings/personal-access-tokens/new). A token owned by a team or service account is better than a personal one.
2. Set **Token name** to `PROJECT_SYNC_TOKEN`.
3. Set **Resource owner** to the organization that owns the project board (e.g. `bcgov`).
4. Under **Repository access**, choose **All repositories** if `user_scope` is set: user searches aren't limited to the monitored list, and the token also needs the issues a PR closes and, without a checkout, the repository holding `rules.yml`. Otherwise you can select the monitored repositories plus those.
5. Set these permissions:
   * **Organization → Projects: Read and write**, for the project board.
   * **Repository → Issues: Read** and **Pull requests: Read**, for search and item metadata. Choose **Read and write** for both if `user_scope` is set, because the run assigns authored items to their author.
   * **Repository → Contents: Read**, only when `rules.yml` is fetched without a checkout.
   * **Repository → Metadata: Read** is included automatically.

No organization membership permission (classic `read:org`) is needed.

- **Multi-organization setups with Fine-Grained PATs**: A fine-grained PAT is scoped to one organization, but its GraphQL search and board mutations can still discover and add **public** issues and pull requests from other organizations listed in `project.allowedOrgs` (e.g. public repositories in `bcgov-c`). If another organization has **private** repositories in `repository_scope` or `allowedOrgs` (or needs assignee writes in that organization), create a second fine-grained PAT with **Resource owner** set to that organization (**All repositories**, **Repository → Issues & Pull requests: Read and write**) and map it under [`tokens:`](#per-owner-tokens-optional).

#### Classic Personal Access Token (User-Owned Boards or Cross-Org Private Board Additions)

GitHub Fine-Grained PATs cannot access Projects v2 owned by a personal user account (`github.com/users/<USER>/projects/<N>`), and an organization-scoped fine-grained PAT cannot add a private issue or PR from a *different* organization onto the board. In those cases only, use a classic PAT:

1. Go to GitHub **Settings** → **Developer Settings** → **Personal Access Tokens** → [**Tokens (classic)**](https://github.com/settings/tokens/new).
2. Set **Note** to `PROJECT_SYNC_TOKEN`.
3. Choose an expiration matching your organization's token rotation policy.
4. Select the required scopes:
   * **`project`**: Read and write access to organization and user project boards.
   * **`repo`**: Full control of private and public repositories, issues, and pull requests (**`public_repo`** is sufficient if all monitored repositories and your consumer repository are public).
5. Click **Generate token** and copy the string.

Adding an assignee requires write/triage rights on that repository. When GitHub refuses the assignee update, the engine logs a warning, leaves the GitHub assignee unchanged, and continues. The item is still added to the project, and its status and sprint are still updated.

#### Per-Owner Tokens (optional)

An optional `tokens:` map in `rules.yml` gives an owner (organization or user) its own token. Each entry names the environment variable that holds the token, never the token itself:

```yaml
tokens:
  bcgov-c: BCGOV_C_TOKEN
```

```yaml
      - uses: bcgov/project-automator@<sha> # vX.Y.Z
        env:
          BCGOV_C_TOKEN: ${{ secrets.BCGOV_C_TOKEN }}
        with:
          github_token: ${{ secrets.PROJECT_SYNC_TOKEN }}
```

- A mapped owner's token is used for everything about that owner: its repositories, its items and their linked issues, its assignees, and (for the board's owner) the project board. User searches for a mapped organization in `allowedOrgs` run with its token, limited to that organization.
- Every other owner uses `github_token`.
- There's no fallback: if a mapped variable is unset or empty, the run fails before it reads the board, naming the owner and the variable.
- Without `tokens:`, every call uses `github_token`, as before.
- Adding an item to the board uses the board owner's token, so that token must also be able to see items from other owners. When the board owner is mapped in `tokens:`, that mapped token is the one used for every board call, cross-owner additions included, so a broad `github_token` doesn't help there: either give the board owner's mapped token that visibility, or leave the board owner unmapped so the board uses a broad `github_token`. Otherwise, track only the board owner's items.
- A pull request's linked issues are read with the PR owner's token, then with each other configured token, and the results are combined. A private issue in another owner is found only when one of those tokens can read both the pull request and the issue, such as a classic PAT as `github_token`.

#### Access Failures

Every run, including `dry_run: true` and `--validate`, starts with an access check before any write. It logs one line for the project, each owner and each monitored repository, naming the token used (`github_token` or a `tokens:` variable, never its value):

```text
Access: project bcgov/16 via github_token: OK
Access: org bcgov-c via BCGOV_C_TOKEN: cannot read 1 of 2 repositories
Access: repo bcgov-c/app via BCGOV_C_TOKEN: cannot read; needs Metadata, Issues and Pull requests read
```

A run fails, with a non-zero exit and a message naming what to fix, when:

- The access check finds a problem: the token can't read the project board or can't update it, or can't read a repository in `automation.repository_scope.repositories` (GitHub search skips a repository it can't read without an error). Every problem is listed, not just the first.
- A search fails. The watermark isn't saved, so the next run searches the same window again.
- The token is empty in an Actions run, including `dry_run: true`. From the command line, `--dry-run` and `--validate` without a token still check `rules.yml` offline.

The token comes only from the `github_token` input. A `GITHUB_TOKEN` environment variable is ignored in an Actions run; from the command line it's used only when there's no input.

#### Adding the Secret to GitHub Actions

1. Copy the generated token string.
2. Navigate to your repository's **Settings** → **Secrets and variables** → **Actions**.
3. Click **New repository secret**.
4. Set **Name** to `PROJECT_SYNC_TOKEN` and paste your token in **Secret**.

## Development

- **Design notes**: [docs/design.md](docs/design.md) explains how the sync discovers items and decides board changes.
- **Project Constitution**: Review [memory/constitution.md](memory/constitution.md) for our core development principles.
- **AI Pair Programming**: See [.github/copilot-instructions.md](.github/copilot-instructions.md) for guidance when working with AI coding assistants.

## Search Window & API Usage

Each run searches open issues and PRs, plus PRs closed without merging, updated since the last successful run (the watermark, minus a 10-minute overlap). Without a watermark it falls back to the last 2 hours. Closed and merged items are left to GitHub's built-in project workflows, which move them to Done. Board membership, Status and Sprint come back with the search results, so there are no per-item board lookups, and the monitored repos are combined into as few searches as fit. Each run's job summary shows the API call count and the remaining rate limit.

## Catch Up

Normal runs only see items updated since the last successful run. To add older open items that aren't on the board yet (for example after adding repos to `repository_scope`), go to **Actions → Sync → Run workflow**, tick **Catch up**, and run it. From the command line:

```bash
gh workflow run sync.yml -R bcgov/project-automator -f catch_up=true
```

A catch-up runs the normal sync code with the backfill set to `all`. It searches all open issues and PRs in the monitored repos (and the monitored users' authored, assigned and review-requested items), ignoring the watermark, and applies the same exclusions. It only adds the missing items, in the column the normal sync gives an item with no Status (for example, Active for a monitored user's PRs and `board_columns.issue.no_status`, New, for issues). Items already on the board aren't re-added or moved, and the run doesn't save the watermark. Leave it unticked for a normal run. There's no schedule for it.

## Testing

We value exhaustive verification. Run the full suite, including the ludicrous coverage matrix:

```bash
npm test
```

For targeted testing of the core engines:
```bash
# Test the unified rule processor
npm test -- test/processors/unified-rule-processor.test.js

# Test the ludicrous validation matrix
npm test -- test/processors/ludicrous-coverage.test.js
```
