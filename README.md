# 🚀 Project Board Rule Engine

[![Node.js 24+](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen.svg)](https://nodejs.org/)
[![ES Modules](https://img.shields.io/badge/module-ESM-blue.svg)](https://nodejs.org/api/esm.html)
[![Checks](https://img.shields.io/badge/Stability-Ludicrous%20Coverage-orange.svg)](#stability--predictability)

**Project Board Rule Engine** is a high-performance GitHub Projects v2 automation tool designed to synchronize issues and pull requests across complex, multi-repository environments with 100% predictability.

## ✨ Overview

This action transforms your GitHub Project into a self-driving productivity engine. It eliminates manual board maintenance by implementing a rule-based state machine for:

- **Intelligent Intake**: Automatically adds PRs and issues to the project board based on authorship, assignment, or repository source.
- **Dynamic Workflows**: Moves items between columns based on real-time state changes and linked issue status.
- **Sprint Orchestration**: Seamlessly manages sprint assignments, rollovers, and capacity planning.
- **Smart Inheritance**: Propagates metadata (assignees, sprints, columns) between PRs and their linked issues.
- **Cross-Boundary Mastery**: Monitors and manages activity across multiple organizations and repositories simultaneously.

## 🛡️ Stability & Predictability

We treat stability as a first-class feature. Our "Ludicrous Testing" philosophy ensures that every rule processed is verified against a comprehensive matrix of conditions.

- **Hardcoded Validation**: We use a strict whitelist-based validator to ensure rule evaluation is 100% predictable.
- **Native Efficiency**: Built on **Node.js 24** and native **ES Modules** for lightning-fast, future-proof execution.
- **Zero-Network Tests**: Our 300+ count test suite runs in pure isolation, guaranteeing core logic is bulletproof.

## ⚙️ Configuration

Configure your entire workflow in a single, version-controlled `rules.yml` file.

### Project Connection
The tool resolves your project identity with minimal friction:

```yaml
project:
  url: https://github.com/orgs/YOUR_ORG/projects/1
```

### Resource Monitoring
Define which realms the engine should govern:

```yaml
project:
  allowedOrgs:
    - your-main-org
    - your-community-org
```


## 🚀 Usage

There are two ways to deploy this action depending on your team structure.

---

### Pattern 1: Per-Repo Shadow Mode *(Recommended for Teams)*

Install this action in each repository your team works in. Any PR or issue that is **created, assigned to you, or requests your review** is instantly added to your board.

This is the right choice for Scrum Masters who want their board to automatically reflect everything their team is working on—without manually curating it.

Create `.github/workflows/project-sync.yml` in each repository:

```yaml
name: Project Board Sync

on:
  pull_request:
    types: [opened, reopened, assigned, review_requested, synchronize]
  issues:
    types: [opened, reopened, assigned]

jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: DerekRoberts/gh-project-automator@v1
        with:
          github_token: ${{ secrets.PROJECT_SYNC_TOKEN }}
          project_url: 'https://github.com/orgs/YOUR_ORG/projects/1'
          # github_author is optional — defaults to the user who triggered the workflow
```

> **Note**: `PROJECT_SYNC_TOKEN` must be a Personal Access Token (PAT) with `repo` and `project` scope. The built-in `GITHUB_TOKEN` does not have cross-repository project write permissions.

No `rules.yml` is required for this pattern. The action uses the `project_url` input and the triggering user's identity to make all decisions. You can optionally add a `rules.yml` if you want custom column assignment rules or sprint logic.

---

### Pattern 2: Central Dispatcher *(For Org-Wide Governance)*

Run the action on a schedule from a single, central repository. It sweeps all configured repositories and reconciles the board regardless of who triggered what.

This is the right choice for platform teams or leads managing many repositories who want a single source of truth.

Create `.github/workflows/project-sync.yml` in your **central admin repository**:

```yaml
name: Project Board Sync (Central)

on:
  schedule:
    - cron: '0 * * * *'  # Runs every hour
  workflow_dispatch:       # Allow manual trigger

concurrency:
  group: project-sync
  cancel-in-progress: false

jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: DerekRoberts/gh-project-automator@v1
        with:
          github_token: ${{ secrets.PROJECT_SYNC_TOKEN }}
          project_url: 'https://github.com/orgs/YOUR_ORG/projects/1'
          github_author: 'your-github-username'
          window_hours: '2'
          verbose: 'true'
          # config_file defaults to 'rules.yml' in the repo root.
          # Override if your rules file lives elsewhere:
          # config_file: '.github/project-rules.yml'
```

Pair this with a `rules.yml` at the root of your central repo. Copy `rules.example.yml` from this repository as your starting point — it is fully annotated and covers all available options:

```yaml
project:
  url: https://github.com/orgs/YOUR_ORG/projects/1
  allowedOrgs:
    - your-main-org
    - your-partner-org
  repositories:
    - your-main-org/repo-one
    - your-main-org/repo-two
    - your-partner-org/shared-repo
```

---

## 📋 Visibility & Auditing

Designed for transparency. Every run provides:

- **GitHub Actions Job Summary**: A rich Markdown report generated in the Action's summary tab.
- **Audit Logs**: Detailed console output with a `[AUDIT]` prefix for all state transitions.
- **Precision Metrics**: Real-time counters for processed, added, and skipped items.

---

## 🛠️ Development & Specs

This project follows a **Spec-Driven Development** model using the [SpecKit](https://github.com/github/spec-kit) framework.

- **SpecKit Architecture**: Documentation for our feature specifications lives in the `specs/` directory. See the [SpecKit README](specs/README.md) for usage guidelines.
- **Rule Engine Spec**: See [Spec 004](specs/004-rule-engine-architecture/spec.md) for a deep dive into our validation architecture.
- **Project Constitution**: Review [memory/constitution.md](memory/constitution.md) for our core development principles and "Ludicrous Testing" standards.
- **AI Pair Programming**: See [.github/copilot-instructions.md](.github/copilot-instructions.md) for guidance when working with AI coding assistants.

## 🧪 Testing

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

## 🔄 Migration

If you are migrating from the internal `bcgov/action-gh-project-automator` repository, note the following changes:

- **New Path**: The primary `action.yml` is now located in the root directory. 
- **Legacy Support**: A shim remains at `.github/actions/sync-engine/action.yml` to prevent breaking existing workflows, but we recommend updating your `uses` references to the root path or the new Marketplace-ready repository.
- **Smart Fallbacks**: You no longer need to explicitly set `github_author` if you are monitoring the user who triggers the action; it now defaults to the workflow actor automatically.

---
*Built with ❤️ by the Advanced Project Automation Team.*
