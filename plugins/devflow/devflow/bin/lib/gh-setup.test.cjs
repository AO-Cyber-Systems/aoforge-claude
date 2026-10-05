'use strict';

// TRD 50-09 — gh-setup.cjs, the read + plan half of `df-tools gh setup` (GEN-04).
//
// The plan is a pure function over a state snapshot (table tests over hand-built state objects), the
// renderer is pure, and `readSetupState` makes gh READS only (tested against the 50-01 fake, whose
// `writes()` must stay empty). Nothing here touches the network, port 8080, or the real ~/.claude.

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const setup = require('./gh-setup.cjs');
const { CONTEXTS } = require('./gh-check.cjs');

// The payload of 50-RESEARCH "Code Examples", written out literally so a drift in desiredRuleset fails here.
// `bypass_actors` is the one deliberate departure (55-01): the live smoke showed `[]` leaves the workflow pull
// request unmergeable (`current_user_can_bypass: never`), so repository admins (RepositoryRole 5) may bypass.
const ADMIN_BYPASS = { actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' };
const RESEARCH_PAYLOAD = {
  name: 'devflow: default branch',
  target: 'branch',
  enforcement: 'active',
  bypass_actors: [ADMIN_BYPASS],
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

  test('test 7. bypass_actors is the repository-admin entry, with and without appId / mergeQueue:false', () => {
    const admin = [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }];
    assert.deepEqual(setup.desiredRuleset().bypass_actors, admin);
    assert.deepEqual(setup.desiredRuleset({ appId: 42 }).bypass_actors, admin);
    assert.deepEqual(setup.desiredRuleset({ mergeQueue: false }).bypass_actors, admin);
    assert.deepEqual(setup.desiredRuleset({ appId: '7', mergeQueue: false, mergeMethod: 'rebase' }).bypass_actors, admin);
  });

  test('test 7b. the admin entry is a fresh object each call (a caller can edit it)', () => {
    const a = setup.desiredRuleset();
    a.bypass_actors[0].bypass_mode = 'pull_request';
    a.bypass_actors.push({ actor_id: 1, actor_type: 'Team', bypass_mode: 'always' });
    assert.deepEqual(setup.desiredRuleset().bypass_actors, [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }]);
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

  test('test 8. a complete ruleset with no repository-admin bypass does not satisfy: empty, absent or another actor', () => {
    const empty = desired();
    empty.bypass_actors = [];
    assert.equal(setup.rulesetSatisfies(empty, desired()), false, 'bypass_actors: []');

    const absent = desired();
    delete absent.bypass_actors;
    assert.equal(setup.rulesetSatisfies(absent, desired()), false, 'the field is absent');

    const other = desired();
    other.bypass_actors = [{ actor_id: 7, actor_type: 'Team', bypass_mode: 'always' }, { actor_id: 5, actor_type: 'Team', bypass_mode: 'always' }];
    assert.equal(setup.rulesetSatisfies(other, desired()), false, 'a Team with id 5 is not the repository admin role');
  });

  test('test 8b. the admin entry satisfies in any bypass_mode, and among other actors; the mode is never compared', () => {
    for (const bypass_mode of ['always', 'pull_request', 'exempt']) {
      const existing = desired();
      existing.bypass_actors = [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode }];
      assert.equal(setup.rulesetSatisfies(existing, desired()), true, bypass_mode);
    }
    const among = desired();
    among.bypass_actors = [{ actor_id: 7, actor_type: 'Team', bypass_mode: 'always' }, { actor_id: '5', actor_type: 'RepositoryRole', bypass_mode: 'pull_request' }];
    assert.equal(setup.rulesetSatisfies(among, desired()), true, 'a string actor id still names the role');
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
    const existing = { ...desired(), id: 9001, source: 'o/r', source_type: 'Repository', created_at: 'x', current_user_can_bypass: 'never' };
    const union = setup.unionRuleset(existing, desired());
    assert.deepEqual(Object.keys(union).sort(), ['bypass_actors', 'conditions', 'enforcement', 'name', 'rules', 'target']);
  });

  test('test 9. no existing ruleset: the union is the desired ruleset, admin bypass included', () => {
    assert.deepEqual(setup.unionRuleset(null, desired()), desired());
    assert.deepEqual(setup.unionRuleset(null, desired()).bypass_actors, [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }]);
  });

  test('test 9b. an existing admin entry in pull_request mode is kept as it is and never duplicated', () => {
    const existing = desired();
    existing.bypass_actors = [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'pull_request' }];
    const union = setup.unionRuleset(existing, desired());
    assert.deepEqual(union.bypass_actors, [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'pull_request' }]);
    assert.equal(union.bypass_actors.filter((a) => a.actor_type === 'RepositoryRole' && a.actor_id === 5).length, 1);
  });

  test('test 9c. a ruleset with no admin bypass gains it once, after every actor the user had, none removed or reordered', () => {
    const existing = desired();
    existing.rules = existing.rules.filter((r) => r.type !== 'merge_queue');
    existing.bypass_actors = [{ actor_id: 7, actor_type: 'Team', bypass_mode: 'always' }, { actor_id: 9, actor_type: 'Integration', bypass_mode: 'pull_request' }];
    const before = copy(existing);
    const union = setup.unionRuleset(existing, desired());
    assert.deepEqual(existing, before, 'the existing ruleset is not mutated');
    assert.deepEqual(union.bypass_actors, [
      { actor_id: 7, actor_type: 'Team', bypass_mode: 'always' },
      { actor_id: 9, actor_type: 'Integration', bypass_mode: 'pull_request' },
      { actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' },
    ]);
    assert.deepEqual(setup.unionRuleset({ ...union, id: 1 }, desired()).bypass_actors, union.bypass_actors, 'a second union adds nothing');
  });

  test('test 9d. an existing ruleset with the field absent or empty gets exactly the admin entry', () => {
    const noField = desired();
    delete noField.bypass_actors;
    assert.deepEqual(setup.unionRuleset(noField, desired()).bypass_actors, [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }]);
    const empty = desired();
    empty.bypass_actors = [];
    assert.deepEqual(setup.unionRuleset(empty, desired()).bypass_actors, [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }]);
  });

  test('test 9e. the union satisfies the desired ruleset whenever it started without the admin bypass', () => {
    const existing = desired();
    existing.bypass_actors = [];
    assert.equal(setup.rulesetSatisfies(existing, desired()), false);
    assert.equal(setup.rulesetSatisfies(setup.unionRuleset(existing, desired()), desired()), true);
  });
});

// ─── planSetup: state builders ────────────────────────────────────────────────

const cap = require('./gh-capability.cjs');

const START = '<!-- devflow:pr-template:start -->';
const END = '<!-- devflow:pr-template:end -->';
const BLOCK = `${START}\n## Summary\n\nCloses #\n${END}`;
const TEMPLATES = {
  workflow: '# devflow:managed\nname: DevFlow checks\non:\n  pull_request:\n  merge_group:\n',
  prTemplate: `${BLOCK}\n`,
};
const WORKFLOW_PATH = '.github/workflows/devflow.yml';
const PR_TEMPLATE_PATH = '.github/pull_request_template.md';
const ALL_LABELS = ['devflow:objective', 'devflow:trd', 'devflow:decision', 'devflow:todo', 'devflow:debug', 'devflow:quick'];
const TYPE_NAMES = ['Objective', 'TRD', 'Decision', 'Debug', 'Quick'];
const FIELD_HEADER = 'X-GitHub-Api-Version: 2026-03-10';

/** An empty Organization repository: wiki off, nothing set up, no local files. Override per case. */
function baseState(over = {}) {
  return {
    repo: 'o/r',
    owner: 'o',
    name: 'r',
    ownerType: 'Organization',
    meta: { has_wiki: false, delete_branch_on_merge: false, default_branch: 'main' },
    github: { enabled: true, repo: 'o/r' },
    rulesets: [],
    labels: [],
    types: [],
    fields: [],
    wiki: 'disabled',
    local: { workflow: null, prTemplate: null, otherWorkflows: [] },
    templates: TEMPLATES,
    record: {},
    ...over,
  };
}

/** Everything already in place, so a plan over it has nothing to do. */
function satisfiedState(over = {}) {
  return baseState({
    meta: { has_wiki: true, delete_branch_on_merge: true, default_branch: 'main' },
    labels: [...ALL_LABELS],
    types: TYPE_NAMES.map((name, i) => ({ id: `IT_${i + 1}`, name, is_enabled: true })),
    fields: [{ id: 11, name: 'work', data_type: 'single_select' }, { id: 12, name: 'kind', data_type: 'single_select' }],
    local: { workflow: TEMPLATES.workflow, prTemplate: `${BLOCK}\n`, otherWorkflows: [] },
    rulesets: [{ id: 9001, ...setup.desiredRuleset({ mergeMethod: 'squash' }) }],
    wiki: 'ok',
    ...over,
  });
}

const kindsOf = (actions) => actions.map((a) => a.kind).filter((k, i, all) => k !== all[i - 1]);
const pick = (actions, kind, target) => actions.find((a) => a.kind === kind && (target === undefined || a.target === target));
const all = (actions, kind) => actions.filter((a) => a.kind === kind);
const sent = (action) => JSON.parse(action.request.input);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

// ─── Test 3: an empty Organization repository ────────────────────────────────

describe('planSetup, an empty Organization repository (test 3)', () => {
  const actions = () => setup.planSetup(baseState());

  test('the actions come in the documented order', () => {
    assert.deepEqual(kindsOf(actions()), [
      'repo-settings', 'label', 'issue-type', 'issue-field', 'workflow', 'pr-template', 'ruleset', 'advisory', 'wiki',
    ]);
  });

  test('every action has kind, target, status and a description', () => {
    for (const a of actions()) {
      assert.equal(typeof a.kind, 'string');
      assert.equal(typeof a.target, 'string');
      assert.ok(['create', 'update', 'exists', 'skip', 'manual', 'conflict', 'advisory'].includes(a.status), `${a.kind}: ${a.status}`);
      assert.ok(typeof a.desc === 'string' && a.desc.length > 0, `${a.kind} ${a.target} has a desc`);
    }
  });

  test('the ruleset action POSTs the desired ruleset as --input -', () => {
    const rule = pick(actions(), 'ruleset');
    assert.equal(rule.status, 'create');
    assert.equal(rule.target, 'devflow: default branch');
    assert.deepEqual(rule.request.args, ['api', '-X', 'POST', 'repos/o/r/rulesets', '--input', '-']);
    assert.deepEqual(rule.payload, setup.desiredRuleset({ mergeMethod: 'squash' }));
    assert.deepEqual(sent(rule), rule.payload, 'what is sent is exactly the payload');
  });

  test('repo settings: PATCH with both keys', () => {
    const s = pick(actions(), 'repo-settings');
    assert.equal(s.status, 'create');
    assert.deepEqual(s.payload, { has_wiki: true, delete_branch_on_merge: true });
    assert.deepEqual(s.request.args, ['api', '-X', 'PATCH', 'repos/o/r', '--input', '-']);
    assert.deepEqual(sent(s), s.payload);
  });

  test('labels: one create per label, through gh label create', () => {
    const labels = all(actions(), 'label');
    assert.deepEqual(labels.map((l) => l.target), ALL_LABELS);
    assert.ok(labels.every((l) => l.status === 'create'));
    assert.deepEqual(labels[0].request.args,
      ['label', 'create', 'devflow:objective', '--repo', 'o/r', '--color', '1d76db', '--description', 'DevFlow tracking']);
    assert.equal(labels[0].request.input, undefined, 'a label create has no stdin');
  });

  test('issue types: the five names with their colours, POSTed to the org', () => {
    const types = all(actions(), 'issue-type');
    assert.deepEqual(types.map((t) => t.target), TYPE_NAMES);
    assert.deepEqual(types.map((t) => t.payload.color), ['purple', 'blue', 'yellow', 'red', 'gray']);
    for (const t of types) {
      assert.equal(t.status, 'create');
      assert.deepEqual(t.request.args, ['api', '-X', 'POST', 'orgs/o/issue-types', '--input', '-']);
      assert.equal(t.payload.name, t.target);
      assert.equal(t.payload.is_enabled, true);
      assert.deepEqual(sent(t), t.payload);
    }
  });

  test('issue fields: work and kind as single_select with inline options and the api-version header', () => {
    const fields = all(actions(), 'issue-field');
    assert.deepEqual(fields.map((f) => f.target), ['work', 'kind']);
    for (const f of fields) {
      assert.equal(f.status, 'create');
      assert.deepEqual(f.request.args, ['api', '-X', 'POST', 'orgs/o/issue-fields', '-H', FIELD_HEADER, '--input', '-']);
      assert.equal(f.payload.data_type, 'single_select');
      assert.deepEqual(sent(f), f.payload);
    }
    assert.deepEqual(fields[0].payload.options.map((o) => o.name), ['feature', 'port', 'refactor', 'foundation', 'bugfix', 'prototype', 'spike']);
    assert.deepEqual(fields[1].payload.options.map((o) => o.name), ['api', 'app', 'library', 'ui-lib', 'cli', 'plugin']);
  });

  test('local files: the workflow and the PR template are created from the templates', () => {
    const wf = pick(actions(), 'workflow');
    assert.equal(wf.status, 'create');
    assert.equal(wf.target, WORKFLOW_PATH);
    assert.deepEqual(wf.file, { path: WORKFLOW_PATH, content: TEMPLATES.workflow });
    assert.equal(wf.request, undefined, 'a local file is not a gh request');

    const pr = pick(actions(), 'pr-template');
    assert.equal(pr.status, 'create');
    assert.equal(pr.target, PR_TEMPLATE_PATH);
    assert.deepEqual(pr.file, { path: PR_TEMPLATE_PATH, content: `${BLOCK}\n` });
  });

  test('the unpinned App advisory follows the ruleset; the disabled wiki is covered by the settings action', () => {
    const list = actions();
    const advisory = pick(list, 'advisory', 'ruleset');
    assert.equal(advisory.status, 'advisory');
    assert.match(advisory.desc, /required checks are not pinned to an App; anyone with write access can post these contexts/);
    const wiki = pick(list, 'wiki');
    assert.equal(wiki.status, 'skip');
    assert.match(wiki.desc, /has_wiki/);
  });

  test('planSetup is pure: it does not mutate a frozen state and is repeatable', () => {
    const state = deepFreeze(baseState());
    assert.deepEqual(setup.planSetup(state), setup.planSetup(state));
  });

  test('planSetup needs the templates it renders', () => {
    const state = baseState();
    delete state.templates;
    assert.throws(() => setup.planSetup(state), /templates/);
  });
});

// ─── Test 4: nothing to do ───────────────────────────────────────────────────

describe('planSetup, everything present and satisfied (test 4)', () => {
  test('every action is exists (or an advisory) and nothing carries a request, payload or file', () => {
    const actions = setup.planSetup(satisfiedState());
    for (const a of actions) {
      assert.ok(a.status === 'exists' || a.status === 'advisory', `${a.kind} ${a.target} is ${a.status}`);
      assert.equal(a.request, undefined, `${a.kind} ${a.target} has no request`);
      assert.equal(a.payload, undefined, `${a.kind} ${a.target} has no payload`);
      assert.equal(a.file, undefined, `${a.kind} ${a.target} has no file`);
    }
    const settled = actions.filter((a) => a.status !== 'advisory');
    assert.ok(settled.length >= 1 + 6 + 5 + 2 + 2 + 1 + 1, 'every kind is reported, not omitted');
    assert.ok(settled.every((a) => a.status === 'exists'));
  });

  test('a ruleset stricter than the desired one is exists too', () => {
    const stricter = setup.desiredRuleset({ mergeMethod: 'squash' });
    stricter.rules.find((r) => r.type === 'pull_request').parameters.required_approving_review_count = 3;
    stricter.rules.push({ type: 'required_linear_history' });
    const rule = pick(setup.planSetup(satisfiedState({ rulesets: [{ id: 9001, ...stricter }] })), 'ruleset');
    assert.equal(rule.status, 'exists');
    assert.equal(rule.request, undefined);
  });

  test('only the settings that differ are patched', () => {
    const a = pick(setup.planSetup(satisfiedState({ meta: { has_wiki: true, delete_branch_on_merge: false, default_branch: 'main' } })), 'repo-settings');
    assert.equal(a.status, 'update');
    assert.deepEqual(a.payload, { delete_branch_on_merge: true });
    const b = pick(setup.planSetup(satisfiedState({ meta: { has_wiki: false, delete_branch_on_merge: true, default_branch: 'main' } })), 'repo-settings');
    assert.deepEqual(b.payload, { has_wiki: true });
  });

  test('a label that exists in another case is not created again', () => {
    const labels = [...ALL_LABELS];
    labels[0] = 'DevFlow:Objective';
    const l = pick(setup.planSetup(satisfiedState({ labels })), 'label', 'devflow:objective');
    assert.equal(l.status, 'exists');
  });
});

// ─── Test 5: an existing weaker ruleset ──────────────────────────────────────

describe('planSetup, an existing weaker ruleset (test 5)', () => {
  const existing = () => ({
    id: 9007,
    name: 'devflow: default branch',
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [],
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    rules: [{ type: 'deletion' }, { type: 'required_linear_history' }],
  });

  test('update: PUT to rulesets/<id> with the union, keeping the user\'s extra rule', () => {
    const rule = pick(setup.planSetup(satisfiedState({ rulesets: [existing()] })), 'ruleset');
    assert.equal(rule.status, 'update');
    assert.deepEqual(rule.request.args, ['api', '-X', 'PUT', 'repos/o/r/rulesets/9007', '--input', '-']);
    assert.deepEqual(rule.payload, setup.unionRuleset(existing(), setup.desiredRuleset({ mergeMethod: 'squash' })));
    assert.deepEqual(sent(rule), rule.payload);
    const types = rule.payload.rules.map((r) => r.type);
    assert.ok(types.includes('required_linear_history'), 'the user\'s rule survives');
    for (const t of ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks', 'merge_queue']) assert.ok(types.includes(t), t);
    assert.equal(setup.rulesetSatisfies(rule.payload, setup.desiredRuleset({ mergeMethod: 'squash' })), true);
  });

  test('a ruleset with every rule but no admin bypass is an update that only appends the admin entry (55-01)', () => {
    const complete = setup.desiredRuleset({ mergeMethod: 'squash' });
    complete.bypass_actors = [{ actor_id: 7, actor_type: 'Team', bypass_mode: 'always' }];
    const rule = pick(setup.planSetup(satisfiedState({ rulesets: [{ id: 9001, ...complete }] })), 'ruleset');
    assert.equal(rule.status, 'update');
    assert.deepEqual(rule.request.args, ['api', '-X', 'PUT', 'repos/o/r/rulesets/9001', '--input', '-']);
    assert.deepEqual(rule.payload.bypass_actors, [
      { actor_id: 7, actor_type: 'Team', bypass_mode: 'always' },
      { actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' },
    ]);
    assert.deepEqual(rule.payload.rules, complete.rules, 'nothing else changes');
  });

  test('a ruleset whose admin bypass is pull_request mode is exists: the user\'s mode is never changed (55-01)', () => {
    const tuned = setup.desiredRuleset({ mergeMethod: 'squash' });
    tuned.bypass_actors = [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'pull_request' }];
    const rule = pick(setup.planSetup(satisfiedState({ rulesets: [{ id: 9001, ...tuned }] })), 'ruleset');
    assert.equal(rule.status, 'exists');
    assert.equal(rule.request, undefined);
  });

  test('a ruleset with another name is not ours: a new one is created beside it', () => {
    const other = { ...existing(), id: 5, name: 'org-wide protections' };
    const rule = pick(setup.planSetup(satisfiedState({ rulesets: [other] })), 'ruleset');
    assert.equal(rule.status, 'create');
  });

  test('a ruleset that could not be read is reported, never overwritten', () => {
    const summaryOnly = { id: 9007, name: 'devflow: default branch', target: 'branch', enforcement: 'active' };
    const rule = pick(setup.planSetup(satisfiedState({ rulesets: [summaryOnly] })), 'ruleset');
    assert.equal(rule.status, 'skip');
    assert.equal(rule.request, undefined);
    const none = pick(setup.planSetup(satisfiedState({ rulesets: null, readErrors: { rulesets: 'gh: Forbidden (HTTP 403)' } })), 'ruleset');
    assert.equal(none.status, 'skip');
    assert.match(none.desc, /403/);
  });
});

// ─── Ruleset options: App pin, merge method, merge queue record ──────────────

describe('planSetup, ruleset options', () => {
  test('github.app_id pins each required check and drops the unpinned advisory', () => {
    const list = setup.planSetup(baseState({ github: { enabled: true, repo: 'o/r', app_id: 42 } }));
    const rule = pick(list, 'ruleset');
    const checks = rule.payload.rules.find((r) => r.type === 'required_status_checks').parameters.required_status_checks;
    assert.deepEqual(checks.map((c) => c.integration_id), [42, 42]);
    assert.equal(pick(list, 'advisory', 'ruleset'), undefined);
  });

  test('github.pr.merge_method sets the merge queue method', () => {
    const rule = pick(setup.planSetup(baseState({ github: { enabled: true, repo: 'o/r', pr: { merge_method: 'rebase' } } })), 'ruleset');
    assert.equal(rule.payload.rules.find((r) => r.type === 'merge_queue').parameters.merge_method, 'REBASE');
  });

  test('a recorded merge-queue rejection omits the rule, says so, and keeps a second apply write-free', () => {
    const list = setup.planSetup(baseState({ record: { merge_queue: false } }));
    const rule = pick(list, 'ruleset');
    assert.equal(rule.payload.rules.some((r) => r.type === 'merge_queue'), false);
    const advisory = list.find((a) => a.status === 'advisory' && /merge queue/i.test(a.desc));
    assert.ok(advisory, 'an advisory names the unavailable merge queue');
    assert.match(advisory.desc, /--refresh/);

    // The ruleset an apply would have stored (no merge_queue) satisfies the next plan: zero writes.
    const stored = { id: 9001, ...rule.payload };
    const second = pick(setup.planSetup(satisfiedState({ record: { merge_queue: false }, rulesets: [stored] })), 'ruleset');
    assert.equal(second.status, 'exists');
  });
});

// ─── Test 6: a User-owned repository ─────────────────────────────────────────

describe('planSetup, a User-owned repository (test 6)', () => {
  const caps = {
    repo: 'o/r', owner_type: 'User', push: true,
    org_types: { available: false, enabled: [] }, issue_fields: { available: false, ids: {} },
    sub_issues: 'ok', dependencies: 'ok', wiki: 'ok',
  };
  const state = () => baseState({ ownerType: 'User', types: null, fields: null });

  test('issue types and fields are skipped with the describeDegraded text, never an error', () => {
    const [typesSentence, fieldsSentence] = cap.describeDegraded(caps);
    const list = setup.planSetup(state());
    const types = all(list, 'issue-type');
    const fields = all(list, 'issue-field');
    assert.equal(types.length, 1);
    assert.equal(fields.length, 1);
    assert.equal(types[0].status, 'skip');
    assert.equal(fields[0].status, 'skip');
    assert.equal(types[0].desc, typesSentence);
    assert.equal(fields[0].desc, fieldsSentence);
    assert.match(typesSentence, /labels/, 'the degraded text names the fallback (labels / body metadata)');
    assert.match(fieldsSentence, /body meta/);
    for (const a of [...types, ...fields]) assert.equal(a.request, undefined);
  });

  test('labels, settings, files and the ruleset are still planned', () => {
    const list = setup.planSetup(state());
    assert.equal(all(list, 'label').length, ALL_LABELS.length);
    assert.ok(all(list, 'label').every((l) => l.status === 'create'));
    assert.equal(pick(list, 'ruleset').status, 'create');
    assert.equal(pick(list, 'workflow').status, 'create');
  });

  test('an Organization whose types could not be read is skipped the same way', () => {
    const list = setup.planSetup(baseState({ types: null, fields: null }));
    assert.equal(all(list, 'issue-type')[0].status, 'skip');
    assert.match(all(list, 'issue-type')[0].desc, /could not be read/);
    assert.equal(all(list, 'issue-field')[0].status, 'skip');
  });
});

// ─── Test 7: types and fields on an Organization ─────────────────────────────

describe('planSetup, issue types and fields (test 7)', () => {
  test('a disabled Decision type is updated to enabled; the others already exist', () => {
    const types = TYPE_NAMES.map((name, i) => ({ id: `IT_${i + 1}`, name, is_enabled: name !== 'Decision' }));
    const list = all(setup.planSetup(satisfiedState({ types })), 'issue-type');
    const decision = list.find((t) => t.target === 'Decision');
    assert.equal(decision.status, 'update');
    assert.deepEqual(decision.request.args, ['api', '-X', 'PUT', 'orgs/o/issue-types/IT_3', '--input', '-']);
    assert.deepEqual(decision.payload, { name: 'Decision', is_enabled: true });
    assert.deepEqual(sent(decision), decision.payload);
    assert.ok(list.filter((t) => t !== decision).every((t) => t.status === 'exists'));
  });

  test('only the missing types are created', () => {
    const types = [{ id: 'IT_1', name: 'Objective', is_enabled: true }, { id: 'IT_2', name: 'TRD', is_enabled: true }];
    const list = all(setup.planSetup(satisfiedState({ types })), 'issue-type');
    assert.deepEqual(list.filter((t) => t.status === 'create').map((t) => t.target), ['Decision', 'Debug', 'Quick']);
    assert.deepEqual(list.filter((t) => t.status === 'exists').map((t) => t.target), ['Objective', 'TRD']);
  });

  test('a missing kind field is created with options and the api-version header; work exists', () => {
    const list = all(setup.planSetup(satisfiedState({ fields: [{ id: 11, name: 'work', data_type: 'single_select' }] })), 'issue-field');
    assert.equal(list.find((f) => f.target === 'work').status, 'exists');
    const kind = list.find((f) => f.target === 'kind');
    assert.equal(kind.status, 'create');
    assert.deepEqual(kind.request.args, ['api', '-X', 'POST', 'orgs/o/issue-fields', '-H', FIELD_HEADER, '--input', '-']);
    assert.equal(kind.payload.name, 'kind');
    assert.equal(kind.payload.data_type, 'single_select');
    assert.deepEqual(kind.payload.options.map((o) => o.name), ['api', 'app', 'library', 'ui-lib', 'cli', 'plugin']);
    assert.deepEqual(sent(kind), kind.payload);
  });

  test('an existing field of any type, in any case, is exists and is never retyped', () => {
    const fields = [{ id: 11, name: 'Work', data_type: 'text' }, { id: 12, name: 'KIND', data_type: 'number' }];
    const list = all(setup.planSetup(satisfiedState({ fields })), 'issue-field');
    assert.ok(list.every((f) => f.status === 'exists' && f.request === undefined));
  });
});

// ─── Test 8: local files ─────────────────────────────────────────────────────

describe('planSetup, the local files (test 8)', () => {
  const withLocal = (local) => setup.planSetup(satisfiedState({ local: { workflow: TEMPLATES.workflow, prTemplate: `${BLOCK}\n`, otherWorkflows: [], ...local } }));

  test('a workflow without the managed header that differs is a conflict, reported and never overwritten', () => {
    const wf = pick(withLocal({ workflow: 'name: my own ci\non: push\n' }), 'workflow');
    assert.equal(wf.status, 'conflict');
    assert.equal(wf.file, undefined);
    assert.match(wf.desc, /devflow:managed/);
  });

  test('a byte-equal workflow is exists; a managed one that drifted is updated', () => {
    assert.equal(pick(withLocal({}), 'workflow').status, 'exists');
    const drifted = pick(withLocal({ workflow: '# devflow:managed\nname: DevFlow checks (old)\n' }), 'workflow');
    assert.equal(drifted.status, 'update');
    assert.deepEqual(drifted.file, { path: WORKFLOW_PATH, content: TEMPLATES.workflow });
  });

  test('a byte-equal file that lacks the managed header is still exists (equal wins over conflict)', () => {
    const plain = { ...TEMPLATES, workflow: 'name: no header\non: pull_request\n' };
    const list = setup.planSetup(satisfiedState({ templates: plain, local: { workflow: plain.workflow, prTemplate: `${BLOCK}\n`, otherWorkflows: [] } }));
    assert.equal(pick(list, 'workflow').status, 'exists');
  });

  test('a PR template without the block gets it appended, keeping the user\'s text', () => {
    const mine = '## My own template\n\nDescribe the change.\n';
    const pr = pick(withLocal({ prTemplate: mine }), 'pr-template');
    assert.equal(pr.status, 'update');
    assert.ok(pr.file.content.startsWith('## My own template\n\nDescribe the change.'));
    assert.ok(pr.file.content.endsWith(`${BLOCK}\n`));
    assert.equal(pr.file.content.split(START).length, 2, 'exactly one block');
    assert.equal(pr.file.path, PR_TEMPLATE_PATH);
  });

  test('a drifted block is replaced in place and the text around it is untouched', () => {
    const drifted = `Before.\n\n${START}\nold text\n${END}\n\nAfter.\n`;
    const pr = pick(withLocal({ prTemplate: drifted }), 'pr-template');
    assert.equal(pr.status, 'update');
    assert.equal(pr.file.content, `Before.\n\n${BLOCK}\n\nAfter.\n`);
  });

  test('an equal block is exists, whatever surrounds it', () => {
    const pr = pick(withLocal({ prTemplate: `Before.\n\n${BLOCK}\n\nAfter.\n` }), 'pr-template');
    assert.equal(pr.status, 'exists');
    assert.equal(pr.file, undefined);
  });

  test('a template given without the markers is wrapped in them', () => {
    const bare = { ...TEMPLATES, prTemplate: '## Summary\n\nCloses #\n' };
    const pr = pick(setup.planSetup(baseState({ templates: bare })), 'pr-template');
    assert.equal(pr.file.content, `${START}\n## Summary\n\nCloses #\n${END}\n`);
  });
});

// ─── Test 9: wiki and merge_group advisories ─────────────────────────────────

describe('planSetup, wiki and merge_group (test 9)', () => {
  test('the wiki action follows the capability state', () => {
    const wiki = (state) => pick(setup.planSetup(satisfiedState({ wiki: state })), 'wiki');
    assert.equal(wiki('ok').status, 'exists');
    assert.equal(wiki('uninitialised').status, 'manual');
    assert.match(wiki('uninitialised').desc, /first wiki page in the web UI/);
    assert.equal(wiki('disabled').status, 'skip');
    assert.match(wiki('disabled').desc, /has_wiki/);
    assert.equal(wiki('unavailable').status, 'skip');
    assert.match(wiki('unavailable').desc, /docs\/devflow\//);
    assert.equal(wiki('unknown').status, 'skip');
  });

  test('another workflow naming a required check without merge_group is an advisory naming the file', () => {
    const otherWorkflows = [
      { file: '.github/workflows/ci.yml', text: 'on: pull_request\njobs:\n  x:\n    name: devflow/linked-issue\n' },
      { file: '.github/workflows/also.yml', text: 'on:\n  pull_request:\njobs:\n  y:\n    name: devflow/planning-consistency\n' },
      { file: '.github/workflows/fine.yml', text: 'on:\n  pull_request:\n  merge_group:\njobs:\n  z:\n    name: devflow/linked-issue\n' },
      { file: '.github/workflows/unrelated.yml', text: 'on: push\njobs:\n  w:\n    name: build\n' },
    ];
    const list = setup.planSetup(satisfiedState({ local: { workflow: TEMPLATES.workflow, prTemplate: `${BLOCK}\n`, otherWorkflows } }));
    const advisories = list.filter((a) => a.kind === 'advisory' && a.target.startsWith('.github/workflows/'));
    assert.deepEqual(advisories.map((a) => a.target), ['.github/workflows/ci.yml', '.github/workflows/also.yml']);
    for (const a of advisories) {
      assert.equal(a.status, 'advisory');
      assert.match(a.desc, /merge_group/);
      assert.ok(a.desc.includes(a.target), `${a.desc} names ${a.target}`);
      assert.equal(a.file, undefined, 'never rewritten');
    }
  });

  test('the merge_group advisories are last', () => {
    const otherWorkflows = [{ file: '.github/workflows/ci.yml', text: 'name: devflow/linked-issue\non: pull_request\n' }];
    const list = setup.planSetup(baseState({ local: { workflow: null, prTemplate: null, otherWorkflows } }));
    assert.equal(list[list.length - 1].target, '.github/workflows/ci.yml');
    assert.equal(list[list.length - 2].kind, 'wiki');
  });
});

// ─── Test 10: renderPlan ─────────────────────────────────────────────────────

describe('renderPlan (test 10)', () => {
  const indent4 = (text) => text.split('\n').map((l) => `    ${l}`).join('\n');

  test('prints every action line', () => {
    const actions = setup.planSetup(baseState());
    const text = setup.renderPlan(actions);
    for (const a of actions) assert.ok(text.includes(`[${a.status}] ${a.kind} ${a.target}`), `${a.kind} ${a.target}`);
  });

  test('prints the request and the exact pretty JSON payload of every create and update', () => {
    const actions = setup.planSetup(baseState());
    const text = setup.renderPlan(actions);
    for (const a of actions.filter((x) => (x.status === 'create' || x.status === 'update') && x.payload)) {
      assert.ok(text.includes(indent4(JSON.stringify(a.payload, null, 2))), `payload of ${a.kind} ${a.target}`);
    }
    assert.ok(text.includes("    gh api -X POST orgs/o/issue-fields -H 'X-GitHub-Api-Version: 2026-03-10' --input -"));
    assert.ok(text.includes('    gh api -X POST repos/o/r/rulesets --input -'));
    assert.ok(text.includes("    gh label create devflow:objective --repo o/r --color 1d76db --description 'DevFlow tracking'"));
  });

  test('prints the ruleset with every rule and both contexts', () => {
    const text = setup.renderPlan(setup.planSetup(baseState()));
    for (const needle of ['"~DEFAULT_BRANCH"', '"deletion"', '"non_fast_forward"', '"pull_request"', '"required_status_checks"',
      '"merge_queue"', 'devflow/linked-issue', 'devflow/planning-consistency']) {
      assert.ok(text.includes(needle), needle);
    }
    for (const name of [...TYPE_NAMES, 'work', 'kind']) assert.ok(text.includes(name), name);
  });

  test('local files print their path and size, and an exists action prints no payload', () => {
    const text = setup.renderPlan(setup.planSetup(baseState()));
    assert.ok(text.includes(`    write ${WORKFLOW_PATH} (${TEMPLATES.workflow.split('\n').length - 1} lines)`));

    const settled = setup.renderPlan(setup.planSetup(satisfiedState()));
    assert.ok(!settled.includes('gh api'), 'nothing to send');
    assert.ok(!settled.includes('    write '), 'nothing to write');
    assert.ok(settled.includes('[exists] ruleset devflow: default branch'));
  });

  test('ends with a count of each status; an empty plan says so', () => {
    const actions = setup.planSetup(baseState());
    const text = setup.renderPlan(actions);
    const creates = actions.filter((a) => a.status === 'create').length;
    assert.match(text, new RegExp(`Plan: ${actions.length} actions \\(${creates} create,`));
    assert.match(setup.renderPlan([]), /no setup actions/i);
  });

  test('renderPlan is pure: the same actions render the same text', () => {
    const actions = deepFreeze(setup.planSetup(baseState()));
    assert.equal(setup.renderPlan(actions), setup.renderPlan(actions));
  });
});

// ─── Test 11: readSetupState against the fake ────────────────────────────────

const fs = require('fs');
const os = require('os');
const path = require('path');
const client = require('./gh-client.cjs');
const wiki = require('./gh-wiki.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { hermeticEnv } = require('./__fixtures__/gh-store-fixtures.cjs');

const GIT_OK = { ok: true, status: 0, stdout: 'abc123\tHEAD\n', stderr: '' };
const FORBIDDEN = { status: 1, stderr: 'gh: Forbidden (HTTP 403)', stdout: '{"message":"Forbidden","status":"403"}' };

describe('readSetupState (test 11)', () => {
  let hermetic;
  let root;
  let fake;

  beforeEach(() => {
    hermetic = hermeticEnv();
    // The wiki is probed through gh-wiki's git seam: a stub that answers, never a network call.
    wiki._setRunGit(() => ({ ...GIT_OK }));
  });

  afterEach(() => {
    client._resetClient();
    wiki._setRunGit(null);
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = null;
    hermetic.restore();
  });

  /** A project dir with `.planning/config.json` (github enabled, repo o/r) and any extra files (relative path -> text). */
  function project(github = {}, files = {}) {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-setup-'));
    fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(root, '.planning', 'config.json'), `${JSON.stringify({ github: { enabled: true, repo: 'o/r', ...github } })}\n`);
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    }
    return root;
  }

  function install(opts = {}) {
    fake = createFakeGitHub(opts);
    client._setRunGh(fake.runGh);
    return fake;
  }

  const ours = { name: 'devflow: default branch', enforcement: 'active', conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } }, rules: [{ type: 'deletion' }] };
  const writeRecord = (record, text) => {
    const dir = path.join(hermetic.env.DEVFLOW_GH_CACHE_DIR, 'setup');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'o__r.json'), text === undefined ? JSON.stringify(record) : text);
  };

  test('reads the repo, rulesets (full body for ours), labels, types, fields, wiki and local files, with zero writes', () => {
    install({
      rulesets: [ours, { name: 'org-wide', enforcement: 'evaluate' }],
      types: [
        { id: 1, name: 'Objective', is_enabled: true }, { id: 2, name: 'TRD', is_enabled: true }, { id: 3, name: 'Decision', is_enabled: false },
      ],
      hasWiki: true,
    });
    fake.labels.push('devflow:trd');
    const dir = project({ app_id: 42, pr: { merge_method: 'rebase' } }, {
      '.github/workflows/devflow.yml': TEMPLATES.workflow,
      '.github/workflows/ci.yml': 'name: ci\non: pull_request\n',
      '.github/workflows/lint.yaml': 'name: lint\non: push\n',
      '.github/pull_request_template.md': '## mine\n',
    });

    const r = setup.readSetupState(dir);
    assert.equal(r.ok, true, r.error);
    const s = r.state;
    assert.deepEqual([s.repo, s.owner, s.name, s.ownerType], ['o/r', 'o', 'r', 'Organization']);
    assert.deepEqual(s.meta, { has_wiki: true, delete_branch_on_merge: false, default_branch: 'main', private: false });
    assert.equal(s.github.app_id, 42);
    assert.equal(s.github.pr.merge_method, 'rebase');

    assert.equal(s.rulesets.length, 2);
    const mine = s.rulesets.find((x) => x.name === 'devflow: default branch');
    assert.deepEqual(mine.rules, [{ type: 'deletion' }], 'the full body of our ruleset was read by id');
    assert.deepEqual(mine.conditions, ours.conditions);
    assert.equal(mine.id, 9001);
    const other = s.rulesets.find((x) => x.name === 'org-wide');
    assert.equal(other.rules, undefined, 'a ruleset that is not ours stays a summary');

    assert.deepEqual(s.labels, ['devflow:trd']);
    assert.deepEqual(s.types.map((t) => [t.name, t.is_enabled]), [['Objective', true], ['TRD', true], ['Decision', false]]);
    assert.deepEqual(s.types[2].id, 3, 'the id is kept: an update PUTs to it');
    assert.deepEqual(s.fields.map((f) => f.name), ['work', 'kind']);
    assert.equal(s.wiki, 'ok');
    assert.equal(s.capabilities.owner_type, 'Organization');

    assert.equal(s.local.workflow, TEMPLATES.workflow);
    assert.equal(s.local.prTemplate, '## mine\n');
    assert.deepEqual(s.local.otherWorkflows, [
      { file: '.github/workflows/ci.yml', text: 'name: ci\non: pull_request\n' },
      { file: '.github/workflows/lint.yaml', text: 'name: lint\non: push\n' },
    ], 'every other workflow, sorted, never devflow.yml itself');
    assert.deepEqual(s.record, {});
    assert.equal(s.templates, undefined, 'templates are an input of planSetup, not something the reader invents');

    assert.deepEqual(fake.writes(), [], 'zero gh writes');
    assert.ok(fake.calls().length > 0);
  });

  test('absent local files read as null and an absent .github as no other workflows', () => {
    install();
    const s = setup.readSetupState(project()).state;
    assert.equal(s.local.workflow, null);
    assert.equal(s.local.prTemplate, null);
    assert.deepEqual(s.local.otherWorkflows, []);
    assert.deepEqual(fake.writes(), []);
  });

  test('the whole read feeds planSetup: an empty repository plans creates, a set-up one plans nothing', () => {
    install();
    const empty = setup.readSetupState(project());
    const plan = setup.planSetup({ ...empty.state, templates: TEMPLATES });
    assert.equal(pick(plan, 'ruleset').status, 'create');
    assert.deepEqual(fake.writes(), []);
    client._resetClient();
    fs.rmSync(root, { recursive: true, force: true });

    install({
      rulesets: [setup.desiredRuleset({ mergeMethod: 'squash' })],
      types: TYPE_NAMES.map((name, i) => ({ id: i + 1, name, is_enabled: true })),
      deleteBranchOnMerge: true,
    });
    fake.labels.push(...ALL_LABELS);
    const dir = project({}, { [WORKFLOW_PATH]: TEMPLATES.workflow, [PR_TEMPLATE_PATH]: `${BLOCK}\n` });
    const full = setup.readSetupState(dir);
    const settled = setup.planSetup({ ...full.state, templates: TEMPLATES }).filter((a) => a.status !== 'advisory');
    assert.ok(settled.every((a) => a.status === 'exists'), settled.filter((a) => a.status !== 'exists').map((a) => `${a.kind} ${a.target} ${a.status}`).join(', '));
    assert.deepEqual(fake.writes(), []);
  });

  test('a User-owned repository: no org endpoint is read, types and fields are null', () => {
    install({ ownerType: 'User' });
    const r = setup.readSetupState(project());
    assert.equal(r.ok, true, r.error);
    assert.equal(r.state.ownerType, 'User');
    assert.equal(r.state.types, null);
    assert.equal(r.state.fields, null);
    assert.deepEqual(fake.calls().filter((argv) => argv.join(' ').includes('orgs/')), [], 'never asked an org endpoint');
    assert.deepEqual(fake.writes(), []);
  });

  test('a disabled wiki is reported as disabled', () => {
    install({ hasWiki: false });
    assert.equal(setup.readSetupState(project()).state.wiki, 'disabled');
  });

  test('the setup record is read from <gh cache dir>/setup/<owner>__<repo>.json; refresh ignores it; junk reads as empty', () => {
    install();
    const dir = project();
    writeRecord({ merge_queue: false, at: '2026-10-01T00:00:00.000Z' });
    assert.equal(setup.setupRecordPath('o/r'), path.join(hermetic.env.DEVFLOW_GH_CACHE_DIR, 'setup', 'o__r.json'));
    assert.deepEqual(setup.readSetupState(dir).state.record, { merge_queue: false, at: '2026-10-01T00:00:00.000Z' });
    assert.deepEqual(setup.readSetupState(dir, { refresh: true }).state.record, {});
    writeRecord(null, 'not json');
    assert.deepEqual(setup.readSetupState(dir).state.record, {});
    writeRecord(null, '[1,2]');
    assert.deepEqual(setup.readSetupState(dir).state.record, {});
  });

  test('a rulesets list that cannot be read is a null with the reason, never a failure', () => {
    install();
    fake.failNext((argv) => argv.join(' ').includes('repos/o/r/rulesets'), FORBIDDEN);
    const r = setup.readSetupState(project());
    assert.equal(r.ok, true);
    assert.equal(r.state.rulesets, null);
    assert.match(r.state.readErrors.rulesets, /403/);
    assert.equal(pick(setup.planSetup({ ...r.state, templates: TEMPLATES }), 'ruleset').status, 'skip');
  });

  test('our ruleset whose body cannot be read stays a summary (planSetup leaves it alone)', () => {
    install({ rulesets: [ours] });
    fake.failNext((argv) => /repos\/o\/r\/rulesets\/9001/.test(argv.join(' ')), FORBIDDEN);
    const r = setup.readSetupState(project());
    assert.equal(r.ok, true);
    assert.equal(r.state.rulesets[0].rules, undefined);
    assert.match(r.state.readErrors.ruleset, /403/);
    assert.equal(pick(setup.planSetup({ ...r.state, templates: TEMPLATES }), 'ruleset').status, 'skip');
  });

  test('types or fields that cannot be read are null with the reason', () => {
    install();
    // A standing failure, not failNext: the capability probe reads the same endpoint first and would consume a one-shot.
    client._setRunGh((argv, opts) => (argv.join(' ').includes('orgs/o/issue-types') ? { ok: false, stdout: FORBIDDEN.stdout, stderr: FORBIDDEN.stderr, status: 1 } : fake.runGh(argv, opts)));
    const r = setup.readSetupState(project());
    assert.equal(r.ok, true);
    assert.equal(r.state.types, null);
    assert.match(r.state.readErrors.types, /403/);
    assert.equal(Array.isArray(r.state.fields), true, 'fields were still read');
  });

  test('github.enabled false: skipped with zero gh calls', () => {
    client._setRunGh(() => { throw new Error('gh must not run when github is disabled'); });
    const r = setup.readSetupState(project({ enabled: false }));
    assert.equal(r.ok, false);
    assert.equal(r.skipped, true);
    assert.match(r.reason, /github\.enabled/);
  });

  test('a repository that cannot be read is a failure that says so', () => {
    install({ repo: 'x/y' });
    const r = setup.readSetupState(project());
    assert.equal(r.ok, false);
    assert.match(r.error, /o\/r/);
    assert.match(r.error, /not found|not accessible/);
  });

  test('every gh call is a read, nothing is written to the project, and the cache stays in the temp dir', () => {
    install();
    const dir = project({}, { [WORKFLOW_PATH]: TEMPLATES.workflow });
    const before = fs.readdirSync(dir).sort();
    setup.readSetupState(dir);
    assert.deepEqual(fake.writes(), []);
    assert.deepEqual(fs.readdirSync(dir).sort(), before);
    assert.equal(fs.readFileSync(path.join(dir, WORKFLOW_PATH), 'utf-8'), TEMPLATES.workflow);
  });
});

// ─── 55-01: the caller workflow pins one ref (tests 10-13) ───────────────────

describe('renderTemplates, devflow-ref follows a pinned checks_workflow (55-01)', () => {
  const REUSABLE = 'AO-Cyber-Systems/devflow-claude/.github/workflows/devflow-checks.yml';
  const SHA = '0123456789abcdef0123456789abcdef01234567';
  const render = (checks_workflow) => setup.renderTemplates({ checks_workflow }, '2.13.1').workflow;

  test('test 10. a branch after @ pins the runner script to the same branch as the reusable workflow', () => {
    const workflow = render(`${REUSABLE}@feat/x`);
    assert.ok(workflow.includes(`uses: ${REUSABLE}@feat/x`), workflow);
    assert.ok(workflow.includes('devflow-ref: feat/x'), workflow);
    assert.ok(!workflow.includes('devflow-ref: v2.13.1'), 'the plugin tag is not used when a ref is pinned');
    assert.doesNotMatch(workflow, /\{\{\s*(checks_workflow|devflow_ref)\s*\}\}/);
  });

  test('test 11. a 40-hex commit SHA after @ is the devflow-ref too', () => {
    const workflow = render(`${REUSABLE}@${SHA}`);
    assert.ok(workflow.includes(`uses: ${REUSABLE}@${SHA}`), workflow);
    assert.ok(workflow.includes(`devflow-ref: ${SHA}`), workflow);
  });

  test('test 12. without an @, or unset, or empty, both stay v<plugin version>; a uses line without @ is kept as it is', () => {
    const noAt = render(`${REUSABLE}`);
    assert.ok(noAt.includes(`uses: ${REUSABLE}\n`), 'the uses line keeps today\'s value');
    assert.ok(noAt.includes('devflow-ref: v2.13.1'), noAt);

    for (const cfg of [{ checks_workflow: '' }, { checks_workflow: '   ' }, {}, undefined, null]) {
      const workflow = setup.renderTemplates(cfg, '2.13.1').workflow;
      assert.ok(workflow.includes(`uses: ${REUSABLE}@v2.13.1`), JSON.stringify(cfg));
      assert.ok(workflow.includes('devflow-ref: v2.13.1'), JSON.stringify(cfg));
    }
  });

  test('test 12b. an @ that names no ref pins nothing: a trailing @ or a leading @ falls back to v<plugin version>', () => {
    assert.ok(render(`${REUSABLE}@`).includes('devflow-ref: v2.13.1'));
    assert.ok(render('@feat/x').includes('devflow-ref: v2.13.1'));
    assert.ok(render(`${REUSABLE}@  `).includes('devflow-ref: v2.13.1'));
  });

  test('test 12c. a leading v in the plugin version is tolerated and the PR template carries no ref', () => {
    const t = setup.renderTemplates({ checks_workflow: `${REUSABLE}@feat/x` }, 'v2.13.1');
    assert.ok(t.workflow.includes('devflow-ref: feat/x'));
    assert.doesNotMatch(t.workflow, /vv\d/);
    assert.doesNotMatch(t.prTemplate, /devflow-ref/);
  });

  test('test 13. a managed workflow rendered for the previous version is planned as an update: re-running setup refreshes it', () => {
    const older = setup.renderTemplates({}, '2.13.0');
    const newer = setup.renderTemplates({}, '2.13.1');
    assert.notEqual(older.workflow, newer.workflow);
    const plan = setup.planSetup(satisfiedState({
      templates: newer,
      local: { workflow: older.workflow, prTemplate: newer.prTemplate, otherWorkflows: [] },
    }));
    const workflow = pick(plan, 'workflow');
    assert.equal(workflow.status, 'update');
    assert.equal(workflow.desc, 'refresh the managed DevFlow checks workflow');
    assert.equal(workflow.file.path, WORKFLOW_PATH);
    assert.equal(workflow.file.content, newer.workflow);
    assert.equal(pick(plan, 'pr-template').status, 'exists', 'only the workflow differs');

    const same = pick(setup.planSetup(satisfiedState({
      templates: newer,
      local: { workflow: newer.workflow, prTemplate: newer.prTemplate, otherWorkflows: [] },
    })), 'workflow');
    assert.equal(same.status, 'exists', 'a workflow already at this version is left alone');
  });
});
