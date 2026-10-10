'use strict';

/**
 * Tests for scripts/ruleset-check.cjs (TRD 74-03, OPS-02).
 *
 * The checker has two jobs. `compare` reads the ruleset applied to a repository back by name and
 * proves it is the text the user approved (.github/rulesets/main.json). `checks` proves every
 * status check that ruleset requires really reports, from the pinned app, on pull requests into
 * the default branch: a required check that never reports hangs every merge.
 *
 * No network. The `gh` runner is injected (fakeGh), the approved file is read through an injected
 * reader, and every server reply is built by scripts/__fixtures__/ruleset-fixtures.cjs.
 */

const test = require('node:test');
const assert = require('node:assert');

const { main, compareRuleset } = require('./ruleset-check.cjs');
const {
  REPO,
  APPLIED_ID,
  approvedRuleset,
  appliedRuleset,
  withoutRule,
  withRequiredChecks,
  orgRulesetSummary,
  rulesetSummary,
  ok,
  fakeGh,
} = require('./__fixtures__/ruleset-fixtures.cjs');

const RULESET_NAME = 'aoforge: default branch';

/** Run the CLI with an injected runner and file. Returns the exit code and what it printed. */
function run(argv, { gh, file = approvedRuleset() } = {}) {
  const out = [];
  const err = [];
  const exitCode = main(argv, {
    gh,
    readFile: () => JSON.stringify(file),
    out: (s) => out.push(String(s)),
    err: (s) => err.push(String(s)),
  });
  return { exitCode, out: out.join('\n'), err: err.join('\n'), all: [...out, ...err].join('\n') };
}

const COMPARE = ['compare', '--repo', REPO, '--file', '.github/rulesets/main.json'];

/** The two routes `compare` reads: the list, then the one ruleset by id. */
function compareRoutes(applied, summaries = [orgRulesetSummary(), rulesetSummary(applied)]) {
  return {
    [`api repos/${REPO}/rulesets`]: ok(summaries),
    [`api repos/${REPO}/rulesets/${APPLIED_ID}`]: ok(applied),
  };
}

test('RC-1 compare: the applied ruleset equals the file, the server adds metadata and a parameter default', () => {
  // The file leaves allowed_merge_methods out; the reply carries it (a server default), plus id, node_id, _links ...
  const file = approvedRuleset();
  delete file.rules.find((r) => r.type === 'pull_request').parameters.allowed_merge_methods;
  const gh = fakeGh(compareRoutes(appliedRuleset()));

  const r = run(COMPARE, { gh, file });

  assert.strictEqual(r.exitCode, 0, r.all);
  assert.match(r.out, /matches/);
  assert.match(r.out, /allowed_merge_methods/, 'the server default is listed, not counted');
});

test('RC-2 compare: only the organisation ruleset exists', () => {
  const gh = fakeGh({ [`api repos/${REPO}/rulesets`]: ok([orgRulesetSummary()]) });

  const r = run(COMPARE, { gh });

  assert.strictEqual(r.exitCode, 1);
  assert.match(r.all, /no ruleset named 'aoforge: default branch'/);
  assert.deepStrictEqual(gh.calls, [`api repos/${REPO}/rulesets`], 'nothing further is read');
});

test('RC-5 compare: the ruleset is applied but not enforced', () => {
  const gh = fakeGh(compareRoutes(appliedRuleset({ enforcement: 'disabled' })));

  const r = run(COMPARE, { gh });

  assert.strictEqual(r.exitCode, 1);
  assert.match(r.all, /enforcement/);
  assert.match(r.all, /disabled/);
  assert.ok(!r.out.includes(`'${RULESET_NAME}' matches`), 'it must not claim a match');
});

test('RC-4 compare: the bypass actor may force-push where the file says pull_request only', () => {
  const applied = appliedRuleset({
    bypass_actors: [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }],
  });
  const gh = fakeGh(compareRoutes(applied));

  const r = run(COMPARE, { gh });

  assert.strictEqual(r.exitCode, 1, r.all);
  assert.match(r.all, /RepositoryRole:5/, 'the actor is named');
  assert.match(r.all, /always/);
  assert.match(r.all, /pull_request/);
});

test('RC-3 compare: the applied ruleset requires a context the file does not', () => {
  const applied = withRequiredChecks(appliedRuleset(), [
    { context: 'test (npm test, gated)', integration_id: 15368 },
    { context: 'build', integration_id: 15368 },
  ]);
  const gh = fakeGh(compareRoutes(applied));

  const r = run(COMPARE, { gh });

  assert.strictEqual(r.exitCode, 1, r.all);
  assert.match(r.all, /build@15368/, 'the extra context is named');
  assert.ok(!r.all.includes('test (npm test, gated)@15368'), 'the agreeing context is not a difference');
});

/** The approved ruleset widened to several of everything, and the same ruleset with each list reversed. */
function widenedPair() {
  const approved = approvedRuleset();
  approved.bypass_actors.push({ actor_id: 1, actor_type: 'OrganizationAdmin', bypass_mode: 'always' });
  approved.conditions.ref_name.include.push('refs/heads/release/*');
  approved.rules.find((r) => r.type === 'required_status_checks').parameters.required_status_checks.push(
    { context: 'harness', integration_id: 15368 }
  );
  const applied = appliedRuleset(JSON.parse(JSON.stringify(approved)));
  applied.bypass_actors.reverse();
  applied.conditions.ref_name.include.reverse();
  applied.rules.reverse();
  const checks = applied.rules.find((r) => r.type === 'required_status_checks').parameters.required_status_checks;
  checks.reverse();
  applied.rules.find((r) => r.type === 'pull_request').parameters.allowed_merge_methods.reverse();
  return { approved, applied };
}

test('RC-9 compareRuleset ignores order in rules, contexts, bypass actors and the include list', () => {
  const { approved, applied } = widenedPair();

  const result = compareRuleset(applied, approved);

  assert.deepStrictEqual(result.differences, []);
  assert.strictEqual(result.match, true);
});

test('RC-10 compareRuleset reports a missing rule type as a difference', () => {
  const result = compareRuleset(withoutRule(appliedRuleset(), 'non_fast_forward'), approvedRuleset());

  assert.strictEqual(result.match, false);
  assert.ok(
    result.differences.some((d) => d.path === 'rules.non_fast_forward'),
    JSON.stringify(result.differences)
  );
});
