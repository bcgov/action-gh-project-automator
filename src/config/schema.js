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
  required: ['project', 'automation', 'technical', 'board_columns', 'sprints', 'exclusions'],
  properties: {
    project: {
      type: 'object',
      required: ['url', 'organization', 'allowedOrgs', 'fields'],
      properties: {
        url: { type: 'string', pattern: '^https://github\\.com/(orgs|users)/[^/]+/projects/\\d+$' },
        organization: { type: 'string', minLength: 1 },
        allowedOrgs: { type: 'array', items: { type: 'string' }, minItems: 1 },
        fields: {
          type: 'object',
          required: ['status', 'sprint'],
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
      required: ['user_scope', 'repository_scope'],
      properties: {
        user_scope: {
          type: 'object',
          required: ['monitored_users', 'rules'],
          properties: {
            monitored_users: {
              type: 'array',
              items: { type: 'string', minLength: 1 },
              minItems: 1,
            },
            rules: { $ref: '#/definitions/ruleGroups' },
          },
        },
        repository_scope: {
          type: 'object',
          required: ['repositories', 'rules'],
          properties: {
            repositories: {
              type: 'array',
              items: { type: 'string', minLength: 1 },
              minItems: 1,
            },
            rules: { $ref: '#/definitions/ruleGroups' },
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
      },
      additionalProperties: false,
    },
  },
  definitions: {
    ruleGroups: {
      type: 'object',
      properties: {
        board_items: {
          type: 'array',
          items: { $ref: '#/definitions/rule' },
        },
        columns: {
          type: 'array',
          items: {
            allOf: [
              { $ref: '#/definitions/rule' },
              {
                type: 'object',
                properties: {
                  validTransitions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['from', 'to', 'conditions'],
                      properties: {
                        from: {
                          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
                        },
                        to: { type: 'string' },
                        conditions: { type: 'array', items: { type: 'string' } },
                      },
                    },
                  },
                },
              },
            ],
          },
        },
        linked_issues: {
          type: 'array',
          items: { $ref: '#/definitions/rule' },
        },
        assignees: {
          type: 'array',
          items: { $ref: '#/definitions/rule' },
        },
      },
    },
    rule: {
      type: 'object',
      required: ['name', 'trigger', 'action'],
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        trigger: {
          type: 'object',
          required: ['type', 'condition'],
          properties: {
            type: {
              oneOf: [
                { type: 'string', enum: ['PullRequest', 'Issue', 'LinkedIssue'] },
                {
                  type: 'array',
                  items: { type: 'string', enum: ['PullRequest', 'Issue', 'LinkedIssue'] },
                },
              ],
            },
            condition: { type: 'string' },
            stateRequirements: {
              type: 'object',
              properties: {
                column: { type: 'string' },
                sprint: { type: 'string' },
                assignees: {
                  type: 'array',
                  items: { type: 'string' },
                },
                labels: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
          },
        },
        action: {
          oneOf: [
            { type: 'string' },
            {
              type: 'array',
              items: { type: 'string' },
            },
          ],
        },
        value: { type: 'string' },
        skip_if: { type: 'string' },
      },
    },
  },
};

export default schema;
