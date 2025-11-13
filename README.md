# Project Sync

A GitHub Projects v2 automation tool for synchronizing issues and pull requests across multiple repositories.

## Overview

This tool automates the management of GitHub Projects v2 boards based on configurable rules. It handles:

- Adding PRs and issues to the project board
- Assigning users to PRs and issues
- Moving items to the appropriate columns based on state
- Managing sprint assignments
- Processing linked issues when PRs are merged

## Configuration

All automation is configured in a flattened repo-level `config/rules.yml`. The configuration includes:
- Project settings
- Monitored repositories and users
- Business rules for automation
- Performance settings

### Project Configuration

The tool supports multiple ways to specify the GitHub project:

1. **Project URL (Recommended)**: Use the GitHub project URL
   ```bash
   export PROJECT_URL=https://github.com/orgs/bcgov/projects/16
   ```
   The system will automatically resolve the project ID from the URL.

2. **Project ID**: Use the GitHub project ID directly
   ```bash
   export PROJECT_ID=PVT_kwDOAA37OM4AFuzg
   ```

3. **Configuration File**: Add to repo-level `rules.yml`
   ```yaml
   project:
     url: https://github.com/orgs/bcgov/projects/16
     # or
     id: PVT_kwDOAA37OM4AFuzg
   ```

The URL resolution feature automatically extracts the organization and project number from GitHub project URLs and resolves them to the correct project ID via the GitHub API.

See `.github/copilot-instructions.md` for repo-specific AI guidance and development notes.

## Files

- `project-board-sync.js`: The main script that runs the automation
- `rules.yml`: Source of truth for all automation rules (in repository root)
- GitHub Issues: Roadmap and future ideas are tracked in repository Issues
- `fetch-user-assignments.js`: Utility to find issues and PRs assigned to users

## Tests

Test scripts are located in the `tests/` directory. See the [tests README](tests/README.md) for more information.

## Usage

### Running Preflight Checks

Before running the full sync, you can validate your environment and configuration:

```bash
# Set required environment variables
export GITHUB_TOKEN=your_github_token
export GITHUB_AUTHOR=your_github_username

# Optionally set project (choose one method):
# Method 1: Use project URL (recommended)
export PROJECT_URL=https://github.com/orgs/bcgov/projects/16

# Method 2: Use project ID directly
export PROJECT_ID=PVT_kwDOAA37OM4AFuzg

# Method 3: Configure in rules.yml
# project:
#   url: https://github.com/orgs/bcgov/projects/16
#   # or
#   id: PVT_kwDOAA37OM4AFuzg

# Run just the preflight checks to validate configuration
node tests/test-preflight-checks.js
```

The preflight checks validate:
- Environment variables
- GitHub API connectivity
- Sprint assignment logic
- Monitored repositories configuration
- Project configuration
- User assignment functionality
- Sprint configuration
- Specific issue handling

### Running the Full Sync

To run the project sync automation:

```bash
# Set required environment variables
export GITHUB_TOKEN=your_github_token
export GITHUB_AUTHOR=your_github_username

# Optionally set project (choose one method):
# Method 1: Use project URL (recommended)
export PROJECT_URL=https://github.com/orgs/bcgov/projects/16

# Method 2: Use project ID directly
export PROJECT_ID=PVT_kwDOAA37OM4AFuzg

# Method 3: Configure in config/rules.yml
# project:
#   url: https://github.com/orgs/bcgov/projects/16
#   # or
#   id: PVT_kwDOAA37OM4AFuzg

# Optional safety switches:
# DRY_RUN=true will execute all rule evaluation and logging without applying GitHub mutations.

# Run with verbose output (recommended for troubleshooting)
VERBOSE=true node project-board-sync.js

# Run without verbose output (for production)
node project-sync.js

# Run with strict preflight checks (will exit on any check failure)
STRICT_MODE=true node project-sync.js
```

The script is typically run via GitHub Actions on a scheduled basis (every 30 minutes).

All preflight checks are run automatically at the start of the script to ensure proper configuration and connectivity before any changes are made.

## AI Safety and Git Protection

**For BCGov AI Test Group Teams Only**

As AI coding assistants become more common in government development, protecting against accidental repository damage becomes critical. This section documents a git safety solution specifically designed for government DevOps teams working with AI.

### The Problem

AI coding assistants (GitHub Copilot, Cursor, etc.) operate with your credentials and can:
- **Push directly to main branches** (bypassing PR requirements)
- **Force push** to any branch (potentially losing work)
- **Delete branches** without understanding the consequences
- **Override branch protection rules** using your admin access

Traditional solutions like git hooks are impractical for teams managing 80+ repositories across multiple organizations.

### The Solution: Git Safety Function

A bash function that intercepts dangerous git operations while maintaining full functionality for normal development work.

#### Features

- **Dynamic default branch detection** - works on `main`, `master`, `develop`, or any naming convention
- **Lazy performance optimization** - only checks when needed (push operations)
- **Portable across repos** - no per-repository configuration required
- **Admin override available** - emergency access when needed

#### Implementation

Add this to your `~/.bashrc` or centralized bash configuration:

```bash
# Git Safety Function - Prevents dangerous operations by AI
git() {
    local args="$*"

    # Only detect default branch for push operations (lazy detection)
    if [[ "$args" == *"push"* ]]; then
        local default_branch=$(command git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")

        # Block pushing to default branch (any method)
        if [[ "$args" == *"push"*"$default_branch"* ]] || ([[ "$args" == "push" ]] && [[ "$(command git branch --show-current 2>/dev/null)" = "$default_branch" ]]); then
            echo "🚨 BLOCKED: Never push to default branch ($default_branch)! Use feature branches and PRs."
            return 1
        fi
    fi

    # Block deleting main branch (keep this simple for now)
    if [[ "$args" == *"branch"*"-d"*"main"* ]] || [[ "$args" == *"branch"*"-D"*"main"* ]]; then
        echo "🚨 BLOCKED: Never delete main branch!"
        return 1
    fi

    # If we get here, run the normal git command
    $(command which git) "$@"
}
```

#### How It Works

1. **Intercepts all `git` commands** via function override
2. **Detects default branch dynamically** only when needed (push operations)
3. **Blocks dangerous operations** with clear error messages
4. **Allows safe operations** to pass through normally
5. **Uses `$(command which git)`** to call the real git binary

#### System-wide Protection (Recommended)

**THIS PREVENTS AI PUSHING TO MAIN.** AI coding assistants get fresh shells without your personal bashrc, so they can accidentally push to main and break your projects. This solution prevents that by placing git safety in `/etc/profile.d/`, making protection available to every shell on the system automatically:

```bash
sudo mkdir -p /etc/profile.d
sudo tee /etc/profile.d/git-safety.sh > /dev/null << 'EOF'
#!/bin/bash
git() {
    local args="$*"
    if [[ "$args" == *"push"* ]]; then
        local default_branch=$(command git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")
        if [[ "$args" == *"push"*"$default_branch"* ]] || ([[ "$args" == "push" ]] && [[ "$(command git branch --show-current 2>/dev/null)" = "$default_branch" ]]); then
            echo "🚨 BLOCKED: Never push to default branch ($default_branch)! Use feature branches and PRs."
            return 1
        fi
    fi
    if [[ "$args" == *"branch"*"-d"*"main"* ]] || [[ "$args" == *"branch"*"-D"*"main"* ]]; then
        echo "🚨 BLOCKED: Never delete main branch!"
        return 1
    fi
    $(command which git) "$@"
}
export -f git
EOF
sudo chmod +x /etc/profile.d/git-safety.sh
```

**Result:** Every shell (including AI assistants) gets automatic protection against main branch destruction.

## Additional Resources
