#!/usr/bin/env bash
set -euo pipefail

# GitHub Project Automator - Consumer Repository Bootstrap
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/bcgov/project-automator/main/scripts/setup-consumer.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/bcgov/project-automator/main/scripts/setup-consumer.sh | bash -s -- --board <url> --repos <r1,r2> --users <u1> --dir <dir>

BOARD_URL=""
REPOS_INPUT=""
USERS_INPUT=""
TARGET_DIR="project-sync"
NON_INTERACTIVE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --board|-b)
      BOARD_URL="$2"
      shift 2
      ;;
    --repos|-r)
      REPOS_INPUT="$2"
      shift 2
      ;;
    --users|-u)
      USERS_INPUT="$2"
      shift 2
      ;;
    --dir|-d)
      TARGET_DIR="$2"
      shift 2
      ;;
    --non-interactive)
      NON_INTERACTIVE=true
      shift
      ;;
    *)
      shift
      ;;
  esac
done

prompt_user() {
  local prompt_text="$1"
  local default_val="$2"
  local response=""

  if [ -c /dev/tty ]; then
    read -r -p "$prompt_text [$default_val]: " response < /dev/tty || true
  elif [ -t 0 ]; then
    read -r -p "$prompt_text [$default_val]: " response || true
  fi

  if [ -z "$response" ]; then
    echo "$default_val"
  else
    echo "$response"
  fi
}

echo "========================================================"
echo "  🚀 GitHub Project Automator - Consumer Repo Setup"
echo "========================================================"
echo ""

if [ "$NON_INTERACTIVE" = false ]; then
  if [ -z "$BOARD_URL" ]; then
    BOARD_URL=$(prompt_user "GitHub Project Board URL" "https://github.com/orgs/my-org/projects/1")
  fi
  if [ -z "$REPOS_INPUT" ]; then
    REPOS_INPUT=$(prompt_user "Monitored repositories (comma-separated)" "my-org/my-repo")
  fi
  if [ -z "$USERS_INPUT" ]; then
    USERS_INPUT=$(prompt_user "Monitored users (comma-separated)" "my-user")
  fi
  if [ "$TARGET_DIR" = "project-sync" ]; then
    TARGET_DIR=$(prompt_user "Directory to create" "project-sync")
  fi
fi

# Fallback defaults
BOARD_URL="${BOARD_URL:-https://github.com/orgs/my-org/projects/1}"
REPOS_INPUT="${REPOS_INPUT:-my-org/my-repo}"
USERS_INPUT="${USERS_INPUT:-my-user}"

# Extract default organization from Board URL
DEFAULT_ORG=$(echo "$BOARD_URL" | sed -E 's#^https?://github\.com/(orgs|users)/([^/]+)/.*#\2#' || echo "my-org")
if [ -z "$DEFAULT_ORG" ] || [ "$DEFAULT_ORG" = "$BOARD_URL" ]; then
  DEFAULT_ORG="my-org"
fi
IS_USER_BOARD=false
if echo "$BOARD_URL" | grep -q "github.com/users/"; then
  IS_USER_BOARD=true
fi

# Determine distinct organizations
IFS=',' read -ra REPOS_ARRAY <<< "$REPOS_INPUT"
IFS=',' read -ra USERS_ARRAY <<< "$USERS_INPUT"

DISTINCT_ORGS=("$DEFAULT_ORG")
for repo in "${REPOS_ARRAY[@]}"; do
  repo=$(echo "$repo" | xargs)
  if [[ "$repo" == *"/"* ]]; then
    org_name="${repo%%/*}"
    found=false
    for existing in "${DISTINCT_ORGS[@]}"; do
      if [ "$existing" = "$org_name" ]; then
        found=true
        break
      fi
    done
    if [ "$found" = false ]; then
      DISTINCT_ORGS+=("$org_name")
    fi
  fi
done

IS_MULTI_ORG=false
if [ "${#DISTINCT_ORGS[@]}" -gt 1 ]; then
  IS_MULTI_ORG=true
fi

echo ""
echo "Creating consumer repository files in: $TARGET_DIR..."
mkdir -p "$TARGET_DIR/.github/workflows"

# 1. Write rules.yml
ALLOWED_ORGS_YAML=""
for o in "${DISTINCT_ORGS[@]}"; do
  ALLOWED_ORGS_YAML="${ALLOWED_ORGS_YAML}    - \"$o\"\n"
done

REPOS_YAML=""
for r in "${REPOS_ARRAY[@]}"; do
  r=$(echo "$r" | xargs)
  if [[ "$r" != *"/"* ]]; then
    r="$DEFAULT_ORG/$r"
  fi
  REPOS_YAML="${REPOS_YAML}      - $r\n"
done

USERS_YAML=""
for u in "${USERS_ARRAY[@]}"; do
  u=$(echo "$u" | xargs)
  USERS_YAML="${USERS_YAML}      - $u\n"
done

cat <<EOF > "$TARGET_DIR/rules.yml"
# Project Board Sync Configuration
project:
  url: "$BOARD_URL"
  organization: "$DEFAULT_ORG"
  allowedOrgs:
$(printf "$ALLOWED_ORGS_YAML")
  fields:
    status: "Status"
    sprint: "Sprint"

automation:
  user_scope:
    monitored_users:
$(printf "$USERS_YAML")
  repository_scope:
    repositories:
$(printf "$REPOS_YAML")
exclusions:
  exact_titles:
    - "Dependency Dashboard"
  title_substrings:
    - "ZAP Security Report"
    - "ZAP Full Scan Report"
    - "ZAP Scan Baseline Report"
    - "ZAP API Scan Report"
  title_prefixes:
    - "ZAP: "
  exclude_labels: []
  authors:
    - renovate[bot]
    - dependabot[bot]
    - mend-bolt-for-github[bot]
    - mend-for-github-com[bot]
  unless_review_requested: true

technical:
  update_window_hours: 2

sprints:
  assign_current:
    - Active
    - Next
  assign_current_if_empty:
    - Waiting
    - Done
  clear:
    - New
    - Backlog

board_columns:
  locked:
    - New
    - Done
    - Waiting
    - Parked
  pull_request:
    ready: Active
    draft: keep
    draft_no_status: Active
  linked_issue:
    ready: Active
    draft: keep
    closed: Next
  issue:
    no_status: New
EOF

# 2. Write .github/workflows/sync.yml
cat <<'EOF' > "$TARGET_DIR/.github/workflows/sync.yml"
name: Board Sync

on:
  schedule:
    - cron: "17 * * * *" # Hourly (staggered to avoid top-of-hour load drops)
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
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

      - name: Run Project Automator
        uses: bcgov/project-automator@343c42ff06360e4db6d9cebde5693f6e50148336 # v1.0.0
        with:
          github_token: ${{ secrets.PROJECT_SYNC_TOKEN }}
          config_path: rules.yml
          dry_run: ${{ inputs.dry_run || false }}
          backfill: ${{ inputs.catch_up && 'all' || '' }}
          verbose: 'true'
EOF

# 3. Write .github/workflows/validate.yml
cat <<'EOF' > "$TARGET_DIR/.github/workflows/validate.yml"
name: Validate Rules

on:
  pull_request:
    paths:
      - 'rules.yml'
      - 'boards/**'
      - '.github/workflows/validate.yml'
  workflow_dispatch:

permissions: {}

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    name: Validate Configuration
    runs-on: ubuntu-26.04
    timeout-minutes: 5
    permissions:
      contents: read
    steps:
      - name: Checkout Rules
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

      - name: Validate Rules & Connectivity
        uses: bcgov/project-automator@343c42ff06360e4db6d9cebde5693f6e50148336 # v1.0.0
        with:
          github_token: ${{ secrets.PROJECT_SYNC_TOKEN }}
          config_path: rules.yml
          validate_only: 'true'
EOF

# 4. Write README.md
cat <<EOF > "$TARGET_DIR/README.md"
# Project Board Sync

Dedicated consumer repository running automated GitHub Projects synchronization using [\`bcgov/project-automator\`](https://github.com/bcgov/project-automator).

## Structure
- [\`rules.yml\`](rules.yml): Board status, sprints, monitored repositories, and exclusions.
- [\`.github/workflows/sync.yml\`](.github/workflows/sync.yml): Scheduled hourly live sync with manual \`dry_run\` and \`catch_up\` controls.
- [\`.github/workflows/validate.yml\`](.github/workflows/validate.yml): Pull request validation ensuring rules and connectivity remain valid before merging.

## Setup & Secrets
Requires a Personal Access Token stored as a repository secret named \`PROJECT_SYNC_TOKEN\`.
See the [interactive token guide](https://github.com/bcgov/project-automator#authentication--token-setup) for pre-scoped PAT links.
EOF

# 5. Write .gitignore
cat <<'EOF' > "$TARGET_DIR/.gitignore"
.tmp/
node_modules/
*.log
EOF

# Optional Git initialization
if command -v git >/dev/null 2>&1; then
  if [ ! -d "$TARGET_DIR/.git" ]; then
    (cd "$TARGET_DIR" && git init -b main >/dev/null 2>&1 || true)
  fi
fi

echo "✔ Files created successfully in $TARGET_DIR:"
echo "  - $TARGET_DIR/rules.yml"
echo "  - $TARGET_DIR/.github/workflows/sync.yml"
echo "  - $TARGET_DIR/.github/workflows/validate.yml"
echo "  - $TARGET_DIR/README.md"
echo "  - $TARGET_DIR/.gitignore"
echo ""
echo "--------------------------------------------------------"
echo "  🔑 STEP 1: GENERATE YOUR GITHUB TOKEN"
echo "--------------------------------------------------------"

if [ "$IS_USER_BOARD" = true ]; then
  echo "Your configuration targets a user-owned board (fine-grained tokens do not support user boards)."
  echo "Generate a Classic Personal Access Token with pre-scoped 'project' and 'repo' permissions:"
  echo ""
  echo "  --> https://github.com/settings/tokens/new?scopes=project,repo&description=PROJECT_SYNC_TOKEN"
  echo ""
else
  echo "Generate a Fine-Grained Personal Access Token targeting resource owner: $DEFAULT_ORG"
  echo ""
  echo "  --> https://github.com/settings/personal-access-tokens/new"
  echo ""
  echo "Required Permissions:"
  echo "  - Organization > Projects: Read and write"
  echo "  - Repository > Issues: Read and write"
  echo "  - Repository > Pull requests: Read and write"
  if [ "$IS_MULTI_ORG" = true ]; then
    echo ""
    echo "Multi-organization note: this token also covers public items across your other organizations."
    echo "For private repositories or assignee writes in another organization, generate a second"
    echo "Fine-Grained PAT for that organization and map it under 'tokens:' in rules.yml."
  fi
fi

echo "--------------------------------------------------------"
echo "  🔐 STEP 2: ADD SECRET TO YOUR REPOSITORY"
echo "--------------------------------------------------------"
echo "Save your token under repository secret 'PROJECT_SYNC_TOKEN':"
echo "  Settings -> Secrets and variables -> Actions -> New repository secret"
echo ""
echo "--------------------------------------------------------"
echo "  🚀 STEP 3: PUSH TO GITHUB & RUN VERIFICATION"
echo "--------------------------------------------------------"
echo "Push to your default branch ('main'), then run:"
echo "  gh workflow run sync.yml -f dry_run=true"
echo ""
echo "All set!"
