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

All automation is configured in a repo-level `rules.yml` file. Users provide their own `rules.yml` or use the template in this repository. The configuration includes:
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

## Files

- `project-board-sync.js`: The main script that runs the automation
- `rules.yml`: User-facing configuration template (users provide their own or use this default)
- `specs/`: Developer-facing feature specifications using [SpecKit framework](https://github.com/github/spec-kit)
- GitHub Issues: Roadmap and future ideas are tracked in repository Issues
- `fetch-user-assignments.js`: Utility to find issues and PRs assigned to users

## Development

This project uses [SpecKit](https://github.com/github/spec-kit) for spec-driven development:

- **Feature Specifications**: See `specs/` directory for feature documentation
- **SpecKit Guide**: See [specs/README.md](specs/README.md) for how to create and work with specs
- **User Configuration**: `rules.yml` is user-facing configuration (users customize in their repos)
- **Developer Documentation**: Specs document features and the rules.yml patterns we support

For detailed development guidelines, see:
- `memory/constitution.md` - Project development principles
- `specs/README.md` - SpecKit usage and guidelines
- `.github/copilot-instructions.md` - AI coding assistant guidance

## Tests

Test scripts are located in the `tests/` directory. See the [tests README](tests/README.md) for more information.
