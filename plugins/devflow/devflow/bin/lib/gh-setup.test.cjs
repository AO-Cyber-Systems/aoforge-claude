'use strict';

// TRD 50-09 — gh-setup.cjs, the read + plan half of `df-tools gh setup` (GEN-04).
//
// The plan is a pure function over a state snapshot (table tests over hand-built state objects), the
// renderer is pure, and `readSetupState` makes gh READS only (tested against the 50-01 fake, whose
// `writes()` must stay empty). Nothing here touches the network, port 8080, or the real ~/.claude.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const setup = require('./gh-setup.cjs');
const { CONTEXTS } = require('./gh-check.cjs');

// The payload of 50-RESEARCH "Code Examples", written out literally so a drift in desiredRuleset fails here.
const RESEARCH_PAYLOAD = {
  name: 'devflow: default branch',
  target: 'branch',
  enforcement: 'active',
  bypass_actors: [],
  conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
  rules: [
    { type: 'deletion' },
    { type: 'non_fast_forward' },
    {
      type: 'pull_request',
      parameters: {
        required_approving_review_count: 0,
        dismiss_stale_reviews_on_push: false,
        require_code_owner_review: false,
        require_last_push_approval: false,
        required_review_thread_resolution: false,
      },
    },
    {
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: false,
        required_status_checks: [{ context: 'devflow/linked-issue' }, { context: 'devflow/planning-consistency' }],
      },
    },
    {
      type: 'merge_queue',
      parameters: {
        check_response_timeout_minutes: 60,
        grouping_strategy: 'ALLGREEN',
        max_entries_to_build: 5,
        max_entries_to_merge: 5,
        merge_method: 'SQUASH',
        min_entries_to_merge: 1,
        min_entries_to_merge_wait_minutes: 5,
      },
    },
  ],
};

const ruleOf = (ruleset, type) => ruleset.rules.find((r) => r.type === type);
const copy = (v) => JSON.parse(JSON.stringify(v));

// ─── Test 1: the desired ruleset ──────────────────────────────────────────────

describe('desiredRuleset (test 1)', () => {
  test('the default payload deep-equals the research payload', () => {
    assert.deepEqual(setup.desiredRuleset({ mergeMethod: 'squash' }), RESEARCH_PAYLOAD);
    assert.deepEqual(setup.desiredRuleset(), RESEARCH_PAYLOAD, 'every option has a default');
  });

  test('the name is the exported constant and the contexts are the 50-03 CONTEXTS', () => {
    assert.equal(setup.SETUP_RULESET_NAME, 'devflow: default branch');
    const desired = setup.desiredRuleset();
    assert.equal(desired.name, setup.SETUP_RULESET_NAME);
    const contexts = ruleOf(desired, 'required_status_checks').parameters.required_status_checks.map((c) => c.context);
    assert.deepEqual(contexts, [CONTEXTS.linkedIssue, CONTEXTS.planningConsistency]);
  });

  test('an appId pins each required check with integration_id', () => {
    const desired = setup.desiredRuleset({ mergeMethod: 'squash', appId: 42 });
    assert.deepEqual(
      ruleOf(desired, 'required_status_checks').parameters.required_status_checks,
      [{ context: 'devflow/linked-issue', integration_id: 42 }, { context: 'devflow/planning-consistency', integration_id: 42 }],
    );
  });

  test('an appId that is not a positive integer pins nothing', () => {
    for (const appId of [undefined, null, '', 0, -3, 1.5, 'abc', NaN]) {
      const checks = ruleOf(setup.desiredRuleset({ appId }), 'required_status_checks').parameters.required_status_checks;
      assert.ok(checks.every((c) => !('integration_id' in c)), `appId ${String(appId)} must not pin`);
    }
    // The config template ships app_id as a string: a numeric string is the same as the number.
    const fromString = ruleOf(setup.desiredRuleset({ appId: '42' }), 'required_status_checks').parameters.required_status_checks;
    assert.ok(fromString.every((c) => c.integration_id === 42));
  });

  test('mergeQueue:false leaves the merge_queue rule out', () => {
    const desired = setup.desiredRuleset({ mergeMethod: 'squash', mergeQueue: false });
    assert.equal(ruleOf(desired, 'merge_queue'), undefined);
    assert.deepEqual(desired.rules.map((r) => r.type), ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks']);
  });

  test('the merge method is upper-cased from github.pr.merge_method; anything unknown is SQUASH', () => {
    const method = (m) => ruleOf(setup.desiredRuleset({ mergeMethod: m }), 'merge_queue').parameters.merge_method;
    assert.equal(method('merge'), 'MERGE');
    assert.equal(method('rebase'), 'REBASE');
    assert.equal(method('REBASE'), 'REBASE');
    assert.equal(method('fast-forward'), 'SQUASH');
    assert.equal(method(undefined), 'SQUASH');
  });

  test('approvals default to 0 and there are no Enterprise-only rules', () => {
    const desired = setup.desiredRuleset();
    assert.equal(ruleOf(desired, 'pull_request').parameters.required_approving_review_count, 0);
    assert.equal(desired.enforcement, 'active', 'evaluate is Enterprise-only');
    const types = desired.rules.map((r) => r.type);
    for (const forbidden of ['branch_name_pattern', 'commit_message_pattern', 'commit_author_email_pattern']) {
      assert.ok(!types.includes(forbidden), `${forbidden} is an Enterprise-only rule`);
    }
  });

  test('each call returns a fresh object (a caller can edit it)', () => {
    const a = setup.desiredRuleset();
    a.rules.length = 0;
    assert.equal(setup.desiredRuleset().rules.length, 5);
  });
});

// ─── Test 2: satisfaction ─────────────────────────────────────────────────────

describe('rulesetSatisfies (test 2)', () => {
  const desired = () => setup.desiredRuleset({ mergeMethod: 'squash' });

  test('an identical ruleset satisfies', () => {
    assert.equal(setup.rulesetSatisfies(desired(), desired()), true);
  });

  test('stricter approvals satisfy; fewer do not', () => {
    const stricter = desired();
    ruleOf(stricter, 'pull_request').parameters.required_approving_review_count = 2;
    assert.equal(setup.rulesetSatisfies(stricter, desired()), true);

    const wanted = desired();
    ruleOf(wanted, 'pull_request').parameters.required_approving_review_count = 1;
    assert.equal(setup.rulesetSatisfies(desired(), wanted), false);
  });

  test('a missing rule type does not satisfy', () => {
    for (const type of ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks', 'merge_queue']) {
      const existing = desired();
      existing.rules = existing.rules.filter((r) => r.type !== type);
      assert.equal(setup.rulesetSatisfies(existing, desired()), false, `without ${type}`);
    }
  });

  test('an extra user rule or an extra required context is allowed', () => {
    const existing = desired();
    existing.rules.push({ type: 'required_linear_history' });
    ruleOf(existing, 'required_status_checks').parameters.required_status_checks.push({ context: 'ci/build' });
    assert.equal(setup.rulesetSatisfies(existing, desired()), true);
  });

  test('a missing required context does not satisfy', () => {
    const existing = desired();
    ruleOf(existing, 'required_status_checks').parameters.required_status_checks = [{ context: 'devflow/linked-issue' }];
    assert.equal(setup.rulesetSatisfies(existing, desired()), false);
  });

  test('the include list must contain ~DEFAULT_BRANCH', () => {
    const existing = desired();
    existing.conditions.ref_name.include = ['refs/heads/release/*'];
    assert.equal(setup.rulesetSatisfies(existing, desired()), false);
    existing.conditions.ref_name.include = ['refs/heads/release/*', '~DEFAULT_BRANCH'];
    assert.equal(setup.rulesetSatisfies(existing, desired()), true);
    delete existing.conditions;
    assert.equal(setup.rulesetSatisfies(existing, desired()), false, 'no conditions at all');
  });

  test('a ruleset that is not active enforces nothing, so it does not satisfy', () => {
    for (const enforcement of ['disabled', 'evaluate']) {
      const existing = desired();
      existing.enforcement = enforcement;
      assert.equal(setup.rulesetSatisfies(existing, desired()), false, enforcement);
    }
  });

  test('an App pin is required only when the desired ruleset pins', () => {
    const pinned = setup.desiredRuleset({ appId: 42 });
    assert.equal(setup.rulesetSatisfies(desired(), pinned), false, 'unpinned existing vs a pinned desire');
    assert.equal(setup.rulesetSatisfies(pinned, pinned), true);
    assert.equal(setup.rulesetSatisfies(pinned, desired()), true, 'a pinned existing satisfies an unpinned desire');
    const other = setup.desiredRuleset({ appId: 7 });
    assert.equal(setup.rulesetSatisfies(other, pinned), false, 'pinned to a different App');
  });

  test('merge_queue parameters are the user\'s to tune; a desired ruleset without the queue never demands one', () => {
    const tuned = desired();
    ruleOf(tuned, 'merge_queue').parameters.max_entries_to_build = 20;
    assert.equal(setup.rulesetSatisfies(tuned, desired()), true);
    assert.equal(setup.rulesetSatisfies(desired(), setup.desiredRuleset({ mergeQueue: false })), true);
    const noQueue = setup.desiredRuleset({ mergeQueue: false });
    assert.equal(setup.rulesetSatisfies(noQueue, setup.desiredRuleset({ mergeQueue: false })), true);
  });

  test('a malformed existing ruleset never throws and never satisfies', () => {
    assert.equal(setup.rulesetSatisfies(null, desired()), false);
    assert.equal(setup.rulesetSatisfies({}, desired()), false);
    assert.equal(setup.rulesetSatisfies({ rules: 'nope' }, desired()), false);
  });
});

// ─── unionRuleset: update PUTs the union, never a removal ─────────────────────

describe('unionRuleset', () => {
  const desired = () => setup.desiredRuleset({ mergeMethod: 'squash' });

  test('no existing ruleset: the union is the desired ruleset', () => {
    assert.deepEqual(setup.unionRuleset(null, desired()), desired());
  });

  test('keeps the user\'s extra rule and context, adds what is missing, raises nothing down', () => {
    const existing = {
      id: 9001,
      name: 'devflow: default branch',
      target: 'branch',
      enforcement: 'active',
      bypass_actors: [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }],
      conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: ['refs/heads/scratch'] } },
      rules: [
        { type: 'required_linear_history' },
        { type: 'pull_request', parameters: { ...ruleOf(desired(), 'pull_request').parameters, required_approving_review_count: 2 } },
        { type: 'required_status_checks', parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: 'ci/build' }] } },
      ],
    };
    const before = copy(existing);
    const union = setup.unionRuleset(existing, desired());
    assert.deepEqual(existing, before, 'the existing ruleset is not mutated');

    const types = union.rules.map((r) => r.type);
    assert.deepEqual(types, ['required_linear_history', 'pull_request', 'required_status_checks', 'deletion', 'non_fast_forward', 'merge_queue'],
      'existing rules keep their order, missing desired rules follow in the desired order');
    assert.equal(ruleOf(union, 'pull_request').parameters.required_approving_review_count, 2, 'approvals are never lowered');
    const checks = ruleOf(union, 'required_status_checks').parameters;
    assert.equal(checks.strict_required_status_checks_policy, true, 'the user\'s strict policy stays');
    assert.deepEqual(checks.required_status_checks.map((c) => c.context), ['ci/build', 'devflow/linked-issue', 'devflow/planning-consistency']);
    assert.deepEqual(union.bypass_actors, existing.bypass_actors, 'the user\'s bypass actors stay');
    assert.deepEqual(union.conditions.ref_name.exclude, ['refs/heads/scratch']);
    assert.equal(setup.rulesetSatisfies(union, desired()), true, 'the union satisfies the desired ruleset');
  });

  test('raises approvals to the desired count, adds ~DEFAULT_BRANCH and turns enforcement on', () => {
    const wanted = desired();
    ruleOf(wanted, 'pull_request').parameters.required_approving_review_count = 1;
    const existing = desired();
    existing.enforcement = 'disabled';
    existing.conditions.ref_name.include = ['refs/heads/release/*'];
    const union = setup.unionRuleset(existing, wanted);
    assert.equal(union.enforcement, 'active');
    assert.deepEqual(union.conditions.ref_name.include, ['refs/heads/release/*', '~DEFAULT_BRANCH']);
    assert.equal(ruleOf(union, 'pull_request').parameters.required_approving_review_count, 1);
  });

  test('pins an existing unpinned context when the desired ruleset pins', () => {
    const union = setup.unionRuleset(desired(), setup.desiredRuleset({ appId: 42 }));
    assert.ok(ruleOf(union, 'required_status_checks').parameters.required_status_checks.every((c) => c.integration_id === 42));
  });

  test('the union carries only the writable fields (no id or server metadata)', () => {
    const existing = { ...desired(), id: 9001, source: 'o/r', source_type: 'Repository', created_at: 'x' };
    const union = setup.unionRuleset(existing, desired());
    assert.deepEqual(Object.keys(union).sort(), ['bypass_actors', 'conditions', 'enforcement', 'name', 'rules', 'target']);
  });
});
