# Create Release Notes

Write release notes for this action from the merged pull requests since the previous release.

- Start with a one-line summary, then group changes as features, fixes and docs or maintenance.
- Link each change to its pull request or issue.
- Call out anything that needs a consumer to change their workflow or `rules.yml`, with the exact change.
- Consumers pin the action by release commit SHA, so give the tag name; the release workflow adds the built `dist/` to the tag.
- Use plain Markdown and code blocks for configuration examples.
