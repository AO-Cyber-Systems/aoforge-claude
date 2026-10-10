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

const { main, compareRuleset, missingContexts, assertReadOnly } = require('./ruleset-check.cjs');
const {
  REPO,
  APPLIED_ID,
  approvedRuleset,
  appliedRuleset,
  withoutRule,
  withRequiredChecks,
  orgRulesetSummary,
  rulesetSummary,
  checkRuns,
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

// ─── checks ──────────────────────────────────────────────────────────────────

const REQUIRED = 'test (npm test, gated)';
const GITHUB_ACTIONS = 15368;
const CHECKS = ['checks', '--repo', REPO, '--file', '.github/rulesets/main.json'];

/** Routes for `checks`: per PR, the head sha lookup and the check runs on that sha. */
function checksRoutes(prs, { raw } = {}) {
  const routes = {};
  for (const [number, { sha, runs }] of Object.entries(prs)) {
    routes[`pr view ${number} --repo ${REPO} --json headRefOid --jq .headRefOid`] = { status: 0, stdout: `${sha}\n` };
    routes[`api repos/${REPO}/commits/${sha}/check-runs --paginate`] = raw && raw[number] ? { status: 0, stdout: raw[number] } : ok(checkRuns(runs));
  }
  return routes;
}

const reported = (name, appId = GITHUB_ACTIONS) => ({ name, appId });

test('RC-6 checks: every required context is reported by the pinned app on each sampled pull request', () => {
  const gh = fakeGh(checksRoutes({
    101: { sha: 'aaa111', runs: [reported(REQUIRED), reported('CodeQL', 57789), reported('build')] },
    102: { sha: 'bbb222', runs: [reported(REQUIRED), reported('CodeQL', 57789)] },
  }));

  const r = run([...CHECKS, '--prs', '101,102'], { gh });

  assert.strictEqual(r.exitCode, 0, r.all);
  assert.match(r.out, /#101/);
  assert.match(r.out, /#102/);
  assert.match(r.out, /test \(npm test, gated\)/);
});

test('RC-7 checks: a required context is missing on one pull request (the path-filtered case)', () => {
  const gh = fakeGh(checksRoutes({
    101: { sha: 'aaa111', runs: [reported(REQUIRED)] },
    102: { sha: 'bbb222', runs: [reported('CodeQL', 57789)] },
  }));

  const r = run([...CHECKS, '--prs', '101,102'], { gh });

  assert.strictEqual(r.exitCode, 1, r.all);
  assert.match(r.all, /#102/, 'the pull request is named');
  assert.match(r.all, /test \(npm test, gated\)/, 'the context is named');
  assert.match(r.all, /not reported/);
});

test('RC-8 checks: the context is reported, but by an app other than the pinned one', () => {
  const gh = fakeGh(checksRoutes({
    101: { sha: 'aaa111', runs: [reported(REQUIRED, 99)] },
  }));

  const r = run([...CHECKS, '--prs', '101'], { gh });

  assert.strictEqual(r.exitCode, 1, r.all);
  assert.match(r.all, /pinned to 15368, reported by 99/);
});

test('RC-12 checks: reads every page of a paginated reply (gh concatenates the pages)', () => {
  const page1 = JSON.stringify({ total_count: 2, check_runs: [{ name: 'CodeQL', app: { id: 57789 } }] });
  const page2 = JSON.stringify({ total_count: 2, check_runs: [{ name: REQUIRED, app: { id: GITHUB_ACTIONS } }] });
  const gh = fakeGh(checksRoutes({ 101: { sha: 'aaa111', runs: [] } }, { raw: { 101: `${page1}\n${page2}\n` } }));

  const r = run([...CHECKS, '--prs', '101'], { gh });

  assert.strictEqual(r.exitCode, 0, r.all);
});

test('RC-13 checks: a failed gh call is an error, not a missing context', () => {
  const gh = fakeGh({
    [`pr view 101 --repo ${REPO} --json headRefOid --jq .headRefOid`]: { status: 1, stdout: '', stderr: 'no pull requests found' },
  });

  const r = run([...CHECKS, '--prs', '101'], { gh });

  assert.strictEqual(r.exitCode, 2);
  assert.match(r.err, /no pull requests found/);
});

test('RC-14 usage: a missing --repo, an unknown command and an unknown flag exit 2', () => {
  const gh = fakeGh({});
  assert.strictEqual(run(['compare', '--file', 'x'], { gh }).exitCode, 2);
  assert.strictEqual(run(['apply', '--repo', REPO, '--file', 'x'], { gh }).exitCode, 2);
  assert.strictEqual(run([...COMPARE, '--force'], { gh }).exitCode, 2);
  assert.strictEqual(run([...CHECKS], { gh }).exitCode, 2, '--prs is required for checks');
  assert.deepStrictEqual(gh.calls, [], 'nothing was sent to GitHub');
});

test('RC-15 missingContexts names each pull request, context and reason', () => {
  const missing = missingContexts(approvedRuleset(), [
    { pr: 1, runs: [{ name: REQUIRED, appId: GITHUB_ACTIONS }] },
    { pr: 2, runs: [] },
    { pr: 3, runs: [{ name: REQUIRED, appId: 7 }, { name: REQUIRED, appId: 8 }] },
  ]);

  assert.deepStrictEqual(missing, [
    { pr: 2, context: REQUIRED, pinned: GITHUB_ACTIONS, reason: 'not reported' },
    { pr: 3, context: REQUIRED, pinned: GITHUB_ACTIONS, reason: 'reported by app 7, 8' },
  ]);
});

test('RC-16 assertReadOnly refuses every gh form that could write', () => {
  const writes = [
    ['api', '--method', 'POST', 'repos/O/R/rulesets'],
    ['api', '-X', 'DELETE', 'repos/O/R/rulesets/1'],
    ['api', '--method=PUT', 'repos/O/R/rulesets/1'],
    ['api', 'repos/O/R/rulesets', '-f', 'name=x'],
    ['api', 'repos/O/R/rulesets', '--field', 'name=x'],
    ['api', 'repos/O/R/rulesets', '--input', 'main.json'],
    ['pr', 'merge', '1', '--repo', 'O/R'],
  ];
  for (const args of writes) assert.throws(() => assertReadOnly(args), /read-only/, args.join(' '));

  assert.doesNotThrow(() => assertReadOnly(['api', 'repos/O/R/rulesets']));
  assert.doesNotThrow(() => assertReadOnly(['api', 'repos/O/R/commits/abc/check-runs', '--paginate']));
  assert.doesNotThrow(() => assertReadOnly(['api', '--method', 'GET', 'repos/O/R/rulesets']));
  assert.doesNotThrow(() => assertReadOnly(['pr', 'view', '1', '--repo', 'O/R', '--json', 'headRefOid', '--jq', '.headRefOid']));
});
