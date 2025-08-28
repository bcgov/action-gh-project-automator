# Technical Details

## Automation Schedule & Performance

### Schedule
- Runs every 30 minutes via GitHub Actions workflow
- Only processes items updated in last 24 hours (based on `updatedAt`)
- All automation rules are applied to items within this window

### Performance Optimizations
- Batch processing: 10 items at a time
- 1s delay between batches to avoid GitHub secondary rate limits
- Deduplicate items by node ID before processing
- Skip unnecessary API calls when target state matches current state
  - Example: Don't update sprint if already correctly assigned
  - Reduces API usage and improves performance
- Optimize column transitions for efficiency

### Logging & Reporting
- Real-time operation logging with levels:
  - Errors: Failed operations and exceptions
  - Warnings: Potential issues or skipped items
  - Info: Status updates and successful changes
- End of run summary includes:
  - Total items processed
  - Success/failure counts
  - Duration and performance metrics
- Verbose mode available for detailed troubleshooting

## State Management

### Rule Processing Order
1. Board Addition Rules: Add items to project board
2. Column Rules: Set appropriate column
3. Sprint Rules: Assign sprints based on column
4. Linked Issue Rules: Sync issue states with PRs
5. Assignee Rules: Manage PR/Issue assignments

### Validation & Verification
- Column transitions follow strict rules defined in config/rules.yml
- Sprint assignments respect board state and column rules
- Assignee changes tracked and verified on both project and repository
- All state changes logged for audit purposes
- Automatic rollback on failed state transitions
- State consistency checks after each operation

### API Usage & Optimization
- Rate limit aware processing with backoff
- Optimized API calls to minimize quota usage
- Retry logic for transient failures
- Batch operations where possible
- Cache frequently accessed data
- Handle GitHub API eventual consistency

## Configuration

### Project Board
Default board settings (can be overridden via environment):
- ID: `PVT_kwDOAA37OM4AFuzg`
- Type: ProjectV2
- Access: Organization-wide

### Environment Variables
Required:
- `GITHUB_AUTHOR`: Monitored user for PR/Issue tracking
- `GITHUB_TOKEN`: GitHub API token with required permissions

Optional:
- `PROJECT_ID`: Override default project board
- `VERBOSE`: Enable detailed logging
- `STRICT_MODE`: Enable strict validation checks

### Organization Settings
Default organization:
- Name: `bcgov`
- Scope: All repositories in monitored list
- Access: Read public repositories

### Rate Limiting & Performance
- Batch size: 10 items per batch
- Batch delay: 1 second between batches
- Update window: 24 hours (based on item update time)
- API quota management: Automatically adapts to limits
- Caching: Optimizes frequent data access

## Review Comment Triage

We address every review comment explicitly using one of three outcomes and respond inline on the PR:

- Accept: Implement in this PR. Criteria: correctness, reduced duplication, clearer intent, safer behavior, reduced API usage, or aligns with conventions. Include a short rationale and the follow-up commit hash.
- Defer: Schedule for a later PR. Criteria: non-trivial design, significant scope increase, unrelated to current PR, or requires tests/infra not included. Respond with why it’s out-of-scope and when/where it will be handled (e.g., tracking issue/PR).
- Dismiss: Do not implement. Criteria: purely stylistic churn, reduces clarity, conflicts with conventions, or adds risk without clear benefit. Provide a brief, respectful rationale and invite re-open if context changes.

Reply templates (suggested):
- Accept: “Accept — Improves X without behavior change; implemented in <commit>.”
- Defer: “Defer — Out of scope for this PR, tracked in <issue/PR>; will address after <dependency>.”
- Dismiss: “Dismiss — Conflicts with <convention/constraint> or adds churn without benefit; happy to revisit with more context.”

Scope guardrails:
- Prefer focused PRs; avoid mixing refactors with behavioral changes unless necessary.
- If addressing a comment substantially broadens scope, choose Defer and document the follow-up.
