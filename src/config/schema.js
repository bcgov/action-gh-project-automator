/**
 * @fileoverview JSON Schema for project board sync configuration
 *
 * @directive Always run schema validation tests after changes:
 * ```bash
 * npm test -- config/loader.test.js
 * ```
 * Schema changes can affect all rule validation.
 */

const schema = {
  type: 'object',
  required: ['project', 'automation', 'technical', 'board_columns', 'exclusions'],
  properties: {
    project: {
      type: 'object',
      required: ['url', 'organization', 'fields'],
      properties: {
        url: { type: 'string', pattern: '^https://github\\.com/(orgs|users)/[^/]+/projects/\\d+$' },
        organization: { type: 'string', minLength: 1 },
        allowedOrgs: { type: 'array', items: { type: 'string' }, minItems: 1 },
        fields: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', minLength: 1 },
            sprint: { type: 'string', minLength: 1 },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    automation: {
      type: 'object',
      required: ['repository_scope'],
      properties: {
        user_scope: {
          type: 'object',
          required: ['monitored_users'],
          properties: {
            monitored_users: {
              type: 'array',
              items: { type: 'string', minLength: 1 },
              minItems: 1,
            },
          },
        },
        repository_scope: {
          type: 'object',
          required: ['repositories'],
          properties: {
            repositories: {
              type: 'array',
              items: { type: 'string', minLength: 1 },
              minItems: 1,
            },
          },
        },
      },
    },
    board_columns: {
      type: 'object',
      required: ['locked', 'pull_request', 'linked_issue', 'issue'],
      properties: {
        locked: { type: 'array', items: { type: 'string' } },
        pull_request: {
          type: 'object',
          required: ['ready', 'draft', 'draft_no_status'],
          properties: {
            ready: { type: 'string' },
            draft: { type: 'string' },
            draft_no_status: { type: 'string' },
            ready_no_status: { type: 'string' },
          },
          additionalProperties: false,
        },
        linked_issue: {
          type: 'object',
          required: ['ready', 'draft', 'closed'],
          properties: {
            ready: { type: 'string' },
            draft: { type: 'string' },
            closed: { type: 'string' },
          },
          additionalProperties: false,
        },
        issue: {
          type: 'object',
          required: ['no_status'],
          properties: {
            no_status: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    technical: {
      type: 'object',
      required: ['update_window_hours'],
      properties: {
        update_window_hours: { type: 'integer', minimum: 1 },
      },
      additionalProperties: false,
    },
    sprints: {
      type: 'object',
      required: ['assign_current', 'assign_current_if_empty', 'clear'],
      properties: {
        assign_current: { type: 'array', items: { type: 'string' } },
        assign_current_if_empty: { type: 'array', items: { type: 'string' } },
        clear: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    },
    // Optional: owner -> environment variable holding that owner's token; absent means none
    tokens: {
      type: 'object',
      propertyNames: { pattern: '^[A-Za-z0-9][A-Za-z0-9-]*$' },
      additionalProperties: { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$' },
    },
    exclusions: {
      type: 'object',
      required: ['exact_titles', 'title_substrings', 'title_prefixes'],
      properties: {
        exact_titles: {
          type: 'array',
          items: { type: 'string' },
        },
        title_substrings: {
          type: 'array',
          items: { type: 'string' },
        },
        title_prefixes: {
          type: 'array',
          items: { type: 'string' },
        },
        // Optional: loadBoardRules sets [] when absent, so configs written before it still load
        exclude_labels: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
        // Optional: loadBoardRules sets [] when absent; logins, case-insensitive
        authors: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
        // Optional: loadBoardRules sets false when absent
        unless_review_requested: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
};

export default schema;
