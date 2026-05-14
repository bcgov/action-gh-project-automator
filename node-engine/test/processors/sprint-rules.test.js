import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { processSprintRules } from '../../src/rules/processors/unified-rule-processor.js';
import { setupTestEnvironment } from '../setup.js';

describe('processSprintRules', () => {
    test('sets sprint when PR is in Active column', async () => {
        setupTestEnvironment();
        const pr = {
            __typename: 'PullRequest',
            author: { login: 'DerekRoberts' },
            column: 'Active',
            sprint: null,
            projectItems: {
                nodes: []
            }
        };

        const actions = await processSprintRules(pr);
        
        assert.equal(actions.length, 1, 'should set sprint');
        assert.equal(actions[0].action, 'set_sprint: current', 'should set to current sprint');
        assert.equal(actions[0].params.item, pr, 'should include PR in params');
    });

    test('sets sprint when Issue is in Next column', async () => {
        setupTestEnvironment();
        const issue = {
            __typename: 'Issue',
            author: { login: 'DerekRoberts' },
            column: 'Next',
            sprint: null,
            projectItems: {
                nodes: []
            }
        };

        const actions = await processSprintRules(issue);
        
        assert.equal(actions.length, 1, 'should set sprint');
        assert.equal(actions[0].action, 'set_sprint: current', 'should set to current sprint');
        assert.equal(actions[0].params.item, issue, 'should include Issue in params');
    });

    test('sets sprint when PR is in Done column', async () => {
        setupTestEnvironment();
        const pr = {
            __typename: 'PullRequest',
            author: { login: 'DerekRoberts' },
            column: 'Done',
            sprint: null,
            projectItems: {
                nodes: []
            }
        };

        const actions = await processSprintRules(pr);
        
        assert.equal(actions.length, 1, 'should set sprint');
        assert.equal(actions[0].action, 'set_sprint: current', 'should set to current sprint');
        assert.equal(actions[0].params.item, pr, 'should include PR in params');
    });

    test('skips when sprint is already current', async () => {
        setupTestEnvironment();
        const pr = {
            __typename: 'PullRequest',
            author: { login: 'DerekRoberts' },
            column: 'Active',
            sprint: 'current',
            projectItems: {
                nodes: []
            }
        };

        const actions = await processSprintRules(pr);
        
        assert.equal(actions.length, 0, 'should skip when sprint already current');
    });

    test('skips when item has any sprint and is not in Active/Next', async () => {
        setupTestEnvironment();
        const pr = {
            __typename: 'PullRequest',
            author: { login: 'DerekRoberts' },
            column: 'Triage',
            sprint: 'previous-sprint',
            projectItems: {
                nodes: []
            }
        };

        const actions = await processSprintRules(pr);
        
        assert.equal(actions.length, 0, 'should skip when sprint exists and not in Active/Next');
    });
});
