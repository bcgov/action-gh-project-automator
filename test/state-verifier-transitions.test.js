const test = require('node:test');
const assert = require('node:assert/strict');
const { StateVerifier } = require('../src/utils/state-verifier');

function resetStateVerifier() {
  StateVerifier.transitionValidator = null;
  if (StateVerifier.steps?.completedSteps) {
    StateVerifier.steps.completedSteps.clear();
  }
}

function buildRules(transitions) {
  return {
    rules: {
      columns: [
        {
          name: 'test_rule',
          validTransitions: transitions
        }
      ]
    }
  };
}

test('StateVerifier.initializeTransitionRules loads validTransitions and enforces them', () => {
  resetStateVerifier();
  // Prime the validator to satisfy dependency checks
  StateVerifier.getTransitionValidator();

  StateVerifier.initializeTransitionRules(
    buildRules([
      { from: 'New', to: 'Active', conditions: [] },
      { from: 'None', to: 'Active', conditions: [] }
    ])
  );

  const validator = StateVerifier.getTransitionValidator();
  const allowed = validator.validateColumnTransition('New', 'Active');
  assert.equal(allowed.valid, true, 'Transition declared in rules should be allowed');

  const disallowed = validator.validateColumnTransition('Active', 'New');
  assert.equal(disallowed.valid, false, 'Undeclared transition should be blocked');
  assert.equal(
    disallowed.reason,
    'Transition from "Active" to "New" is not allowed',
    'Blocked transition should provide clear reason'
  );
});

test('StateVerifier.initializeTransitionRules replaces previously loaded transitions', () => {
  resetStateVerifier();
  StateVerifier.getTransitionValidator();

  StateVerifier.initializeTransitionRules(
    buildRules([{ from: 'New', to: 'Active', conditions: [] }])
  );
  let validator = StateVerifier.getTransitionValidator();
  assert.equal(
    validator.validateColumnTransition('New', 'Active').valid,
    true,
    'Initial transition should be allowed'
  );

  StateVerifier.initializeTransitionRules(
    buildRules([{ from: 'New', to: 'Review', conditions: [] }])
  );
  validator = StateVerifier.getTransitionValidator();
  assert.equal(
    validator.validateColumnTransition('New', 'Active').valid,
    false,
    'Old transitions should be cleared on re-initialization'
  );
  assert.equal(
    validator.validateColumnTransition('New', 'Review').valid,
    true,
    'Newly declared transition should be allowed'
  );
});

