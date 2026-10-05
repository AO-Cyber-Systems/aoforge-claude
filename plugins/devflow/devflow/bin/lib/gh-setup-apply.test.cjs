'use strict';

// TRD 50-11 — gh-setup.cjs, the apply half of `df-tools gh setup` (GEN-04): `renderTemplates` and `applySetup`.
//
// readSetupState -> renderTemplates -> planSetup -> applySetup run in-process against the 50-01 fake GitHub
// (gh-client's `_setRunGh` seam, a clock that never sleeps, the wiki's git seam stubbed). Nothing here touches
// the network, port 8080, or the real ~/.claude: `hermeticEnv` points the gh cache and outbox at a temp dir.

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const setup = require('./gh-setup.cjs');
const client = require('./gh-client.cjs');
const wiki = require('./gh-wiki.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { hermeticEnv } = require('./__fixtures__/gh-store-fixtures.cjs');

const VERSION = '2.12.0';
const NOW = '2026-10-01T00:00:00.000Z';
const GIT_OK = { ok: true, status: 0, stdout: 'abc123\tHEAD\n', stderr: '' };
const WORKFLOW = '.github/workflows/devflow.yml';
const PR_TEMPLATE = '.github/pull_request_template.md';
const ALL_LABELS = ['devflow:objective', 'devflow:trd', 'devflow:decision', 'devflow:todo', 'devflow:debug', 'devflow:quick'];
const DEFAULT_CHECKS = `AO-Cyber-Systems/devflow-claude/.github/workflows/devflow-checks.yml@v${VERSION}`;

describe('renderTemplates', () => {
  test('substitutes {{checks_workflow}} with the pinned default and {{devflow_ref}} with the plugin version', () => {
    const t = setup.renderTemplates({}, VERSION);
    assert.ok(t.workflow.includes(`uses: ${DEFAULT_CHECKS}`), t.workflow);
    assert.ok(t.workflow.includes(`devflow-ref: v${VERSION}`));
    assert.doesNotMatch(t.workflow, /\{\{\s*(checks_workflow|devflow_ref)\s*\}\}/);
    assert.ok(t.workflow.startsWith('# devflow:managed'), 'the managed header survives');
    assert.ok(t.workflow.includes('${{ vars.DEVFLOW_APP_CLIENT_ID }}'), 'GitHub expressions are not touched');
    assert.ok(t.prTemplate.includes('<!-- devflow:pr-template:start -->'));
  });

  test('github.checks_workflow overrides the default; an empty string keeps it; a leading v in the version is tolerated', () => {
    assert.ok(setup.renderTemplates({ checks_workflow: 'acme/ci/.github/workflows/x.yml@main' }, VERSION).workflow.includes('uses: acme/ci/.github/workflows/x.yml@main'));
    assert.ok(setup.renderTemplates({ checks_workflow: '' }, VERSION).workflow.includes(`uses: ${DEFAULT_CHECKS}`));
    assert.ok(setup.renderTemplates(undefined, `v${VERSION}`).workflow.includes(`devflow-ref: v${VERSION}`));
    assert.doesNotMatch(setup.renderTemplates(undefined, `v${VERSION}`).workflow, /vv\d/);
  });

  test('a replacement containing $& or $1 is inserted literally', () => {
    const t = setup.renderTemplates({ checks_workflow: 'a/b/.github/workflows/c.yml@$&-$1' }, VERSION);
    assert.ok(t.workflow.includes('uses: a/b/.github/workflows/c.yml@$&-$1'));
  });
});

describe('applySetup (tests 2-7)', () => {
  let hermetic;
  let root;
  let fake;
  let clock;
  let failures;

  beforeEach(() => {
    hermetic = hermeticEnv();
    wiki._setRunGit(() => ({ ...GIT_OK }));
    clock = { t: Date.UTC(2026, 9, 1, 12, 0, 0) };
    client._setNow(() => clock.t);
    client._setSleep((ms) => { clock.t += ms; });
    failures = [];
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
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-setup-apply-'));
    fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(root, '.planning', 'config.json'), `${JSON.stringify({ github: { enabled: true, repo: 'o/r', ...github } })}\n`);
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), body);
    }
    return root;
  }

  /** A bare Organization repository: no issue types or fields yet, wiki off, nothing set up. */
  function install(opts = {}) {
    fake = createFakeGitHub({ types: [], fields: [], hasWiki: false, ...opts });
    client._setRunGh((args, o) => {
      const r = fake.runGh(args, o);
      if (!r.ok && client.isWriteArgs(args)) failures.push(args.join(' '));
      return r;
    });
    return fake;
  }

  function plan({ refresh = false } = {}) {
    const read = setup.readSetupState(root, { refresh });
    assert.equal(read.ok, true, read.error);
    return setup.planSetup({ ...read.state, templates: setup.renderTemplates(read.state.github, VERSION) });
  }

  const apply = ({ refresh = false } = {}) => setup.applySetup(root, plan({ refresh }), { refresh, now: () => NOW });

  const outcome = (r, kind, target) => r.outcomes.find((o) => o.kind === kind && (target === undefined || o.target === target));
  const apiJson = (apiPath) => JSON.parse(fake.runGh(['api', apiPath]).stdout);
  const recordFile = () => setup.setupRecordPath('o/r');
  const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf-8');

  test('2. applies the ruleset, labels, types, fields, repo settings and both local files', () => {
    install();
    project();
    const r = apply();
    assert.equal(r.ok, true, JSON.stringify(r.outcomes.filter((o) => o.status === 'failed')));
    assert.equal(r.outcomes.filter((o) => o.status === 'failed').length, 0);

    assert.equal(fake.rulesets.length, 1);
    assert.equal(fake.rulesets[0].name, 'devflow: default branch');
    assert.ok(fake.rulesets[0].rules.some((x) => x.type === 'merge_queue'), 'the merge queue rule is on');
    assert.ok(fake.rulesets[0].rules.some((x) => x.type === 'required_status_checks'));
    assert.deepEqual([...fake.labels].sort(), [...ALL_LABELS].sort());
    assert.deepEqual(apiJson('orgs/o/issue-types').map((t) => t.name).sort(), ['Debug', 'Decision', 'Objective', 'Quick', 'TRD']);
    const fields = apiJson('orgs/o/issue-fields');
    assert.deepEqual(fields.map((f) => [f.name, f.data_type]).sort(), [['kind', 'single_select'], ['work', 'single_select']]);
    assert.ok(fields.every((f) => Array.isArray(f.options) && f.options.length > 0), 'single select options were sent');
    const meta = apiJson('repos/o/r');
    assert.equal(meta.has_wiki, true);
    assert.equal(meta.delete_branch_on_merge, true);

    const workflow = text(WORKFLOW);
    assert.ok(workflow.includes(`uses: ${DEFAULT_CHECKS}`), 'placeholders substituted');
    assert.doesNotMatch(workflow, /\{\{\s*(checks_workflow|devflow_ref)\s*\}\}/);
    assert.ok(text(PR_TEMPLATE).includes('<!-- devflow:pr-template:start -->'));

    assert.equal(outcome(r, 'ruleset').status, 'created');
    assert.equal(outcome(r, 'workflow').status, 'created');
    assert.equal(outcome(r, 'issue-field', 'work').status, 'created');
  });

  test('2b. one outcome per action, in the plan order, and the issue-field header goes only on the field requests', () => {
    install();
    project();
    const actions = plan();
    const r = setup.applySetup(root, actions, { now: () => NOW });
    assert.deepEqual(r.outcomes.map((o) => [o.kind, o.target]), actions.map((a) => [a.kind, a.target]));
    const withHeader = fake.writes().filter((w) => w.includes('X-GitHub-Api-Version: 2026-03-10'));
    assert.equal(withHeader.length, 2, 'exactly the two issue-field creates');
    assert.ok(withHeader.every((w) => w.includes('orgs/o/issue-fields')));
  });

  test('3. a second apply makes zero GitHub writes and leaves both files byte-identical (SC2)', () => {
    install();
    project();
    assert.equal(apply().ok, true);
    const writes = fake.writes().length;
    const workflow = fs.readFileSync(path.join(root, WORKFLOW));
    const template = fs.readFileSync(path.join(root, PR_TEMPLATE));
    const mtime = fs.statSync(path.join(root, WORKFLOW)).mtimeMs;

    const again = apply();
    assert.equal(again.ok, true);
    assert.equal(fake.writes().length, writes, 'zero new writes');
    assert.deepEqual(fs.readFileSync(path.join(root, WORKFLOW)), workflow);
    assert.deepEqual(fs.readFileSync(path.join(root, PR_TEMPLATE)), template);
    assert.equal(fs.statSync(path.join(root, WORKFLOW)).mtimeMs, mtime, 'the file was not rewritten');
    assert.deepEqual(again.outcomes.filter((o) => ['created', 'updated', 'failed'].includes(o.status)), []);
    assert.equal(outcome(again, 'ruleset').status, 'exists');
  });

  // ─── 55-01: the ruleset grants repository admins a bypass ───────────────────

  const ADMIN = { actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' };
  const rulesetId = () => JSON.parse(fake.runGh(['api', 'repos/o/r/rulesets']).stdout).find((r) => r.name === 'devflow: default branch').id;
  const rulesetGet = () => apiJson(`repos/o/r/rulesets/${rulesetId()}`);
  const rulesetPuts = () => fake.writes().filter((w) => w.includes('PUT') && w.some((a) => /rulesets\/\d+$/.test(a)));

  test('55-01 test 1. a fresh apply creates the ruleset with the admin bypass; GitHub then reports an admin can bypass it', () => {
    install({ isAdmin: true });
    project();
    const r = apply();
    assert.equal(r.ok, true, JSON.stringify(r.outcomes.filter((o) => o.status === 'failed')));
    assert.equal(outcome(r, 'ruleset').status, 'created');
    const created = rulesetGet();
    assert.equal(created.current_user_can_bypass, 'always', 'it was `never` before the fix');
    assert.deepEqual(created.bypass_actors, [ADMIN]);
  });

  test('55-01 test 2. a second apply after that makes zero GitHub writes and leaves the ruleset as it was', () => {
    install({ isAdmin: true });
    project();
    assert.equal(apply().ok, true);
    const before = rulesetGet();
    const writes = fake.writes().length;
    const again = apply();
    assert.equal(again.ok, true);
    assert.equal(fake.writes().length, writes, 'zero new writes');
    assert.equal(outcome(again, 'ruleset').status, 'exists');
    assert.deepEqual(rulesetGet(), before);
  });

  test('55-01 test 3. a complete ruleset with only another bypass actor is updated: the PUT keeps it first and appends the admin entry once', () => {
    const team = { actor_id: 7, actor_type: 'Team', bypass_mode: 'always' };
    install({ isAdmin: true, rulesets: [{ ...setup.desiredRuleset({ mergeMethod: 'squash' }), bypass_actors: [team] }] });
    project();
    assert.equal(fake.rulesets[0].bypass_actors.length, 1);
    assert.equal(rulesetGet().current_user_can_bypass, 'never', 'the seeded ruleset cannot be bypassed by an admin');

    const actions = plan();
    const rs = actions.find((a) => a.kind === 'ruleset');
    assert.equal(rs.status, 'update');
    assert.deepEqual(JSON.parse(rs.request.input).bypass_actors, [team, ADMIN], 'the PUT body, in that order');

    const r = setup.applySetup(root, actions, { now: () => NOW });
    assert.equal(r.ok, true, JSON.stringify(r.outcomes.filter((o) => o.status === 'failed')));
    assert.equal(outcome(r, 'ruleset').status, 'updated');
    assert.equal(rulesetPuts().length, 1, 'exactly one ruleset PUT');
    assert.deepEqual(fake.rulesets[0].bypass_actors, [team, ADMIN]);
    assert.equal('current_user_can_bypass' in fake.rulesets[0], false, 'the computed field never reaches the stored ruleset');
    assert.equal(rulesetGet().current_user_can_bypass, 'always');

    const writes = fake.writes().length;
    assert.equal(apply().ok, true);
    assert.equal(fake.writes().length, writes, 'a second apply makes zero writes');
  });

  test('55-01 test 4. an existing admin bypass in pull_request mode is exists: setup never changes the mode and writes nothing', () => {
    const tuned = { actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'pull_request' };
    install({ isAdmin: true, rulesets: [{ ...setup.desiredRuleset({ mergeMethod: 'squash' }), bypass_actors: [tuned] }] });
    project();
    const rs = plan().find((a) => a.kind === 'ruleset');
    assert.equal(rs.status, 'exists');
    assert.equal(rs.request, undefined);

    const rulesetWrites = () => fake.writes().filter((w) => w.some((a) => /rulesets/.test(a))).length;
    const before = rulesetWrites();
    const r = apply();
    assert.equal(r.ok, true, JSON.stringify(r.outcomes.filter((o) => o.status === 'failed')));
    assert.equal(outcome(r, 'ruleset').status, 'exists');
    assert.equal(rulesetWrites(), before, 'no ruleset write');
    assert.deepEqual(fake.rulesets[0].bypass_actors, [tuned], 'the user\'s mode is untouched');
    assert.equal(rulesetGet().current_user_can_bypass, 'pull_requests_only');
  });

  test('55-01 test 4b. a non-admin token is told `never` even with the admin entry listed', () => {
    install({ isAdmin: false, rulesets: [{ ...setup.desiredRuleset({ mergeMethod: 'squash' }), bypass_actors: [ADMIN] }] });
    project();
    assert.equal(rulesetGet().current_user_can_bypass, 'never');
  });

  test('2c. an existing PR template keeps its own text and gains the DevFlow block, once', () => {
    install();
    project({}, { [PR_TEMPLATE]: '## My checklist\n\n- [ ] tested\n' });
    assert.equal(apply().ok, true);
    const t = text(PR_TEMPLATE);
    assert.ok(t.startsWith('## My checklist'), 'the user text stays first');
    assert.equal(t.split('<!-- devflow:pr-template:start -->').length, 2, 'one block');
    assert.equal(outcome(apply(), 'pr-template').status, 'exists');
  });

  test('4. a merge queue 422 retries without the rule, records it, reports it and does not fail', () => {
    install({ mergeQueueAllowed: false });
    project();
    const first = apply();
    assert.equal(first.ok, true);
    const rs = outcome(first, 'ruleset');
    assert.equal(rs.status, 'created');
    assert.equal(rs.degraded, true);
    assert.match(rs.note, /merge queue unavailable on this plan/);
    assert.equal(fake.rulesets.length, 1);
    assert.ok(!fake.rulesets[0].rules.some((x) => x.type === 'merge_queue'), 'stored without merge_queue');
    assert.ok(fake.rulesets[0].rules.some((x) => x.type === 'required_status_checks'), 'the rest of the ruleset is intact');
    assert.equal(failures.length, 1, 'exactly one rejected write');
    assert.deepEqual(JSON.parse(fs.readFileSync(recordFile(), 'utf-8')), { merge_queue: false, at: NOW });

    // The next plan omits the rule: nothing to write.
    const writes = fake.writes().length;
    const second = apply();
    assert.equal(second.ok, true);
    assert.equal(fake.writes().length, writes, 'a second apply makes zero writes');
    assert.equal(outcome(second, 'ruleset').status, 'exists');

    // --refresh forgets the record and tries the rule again: one more 422, still a successful run.
    const third = apply({ refresh: true });
    assert.equal(third.ok, true);
    assert.equal(failures.length, 2, 'the refresh tried merge_queue once more and was refused');
    assert.match(outcome(third, 'ruleset').note, /merge queue unavailable on this plan/);
    assert.ok(!fake.rulesets[0].rules.some((x) => x.type === 'merge_queue'));
    assert.deepEqual(JSON.parse(fs.readFileSync(recordFile(), 'utf-8')), { merge_queue: false, at: NOW }, 'the record is written again');
  });

  test('4b. --refresh on a plan that now accepts merge queues drops the record and ends with the rule on', () => {
    install({ mergeQueueAllowed: true });
    project();
    fs.mkdirSync(path.dirname(recordFile()), { recursive: true });
    fs.writeFileSync(recordFile(), JSON.stringify({ merge_queue: false, at: 'old' }));
    assert.equal(apply().ok, true);
    assert.ok(!fake.rulesets[0].rules.some((x) => x.type === 'merge_queue'), 'the record keeps the rule off');

    assert.equal(apply({ refresh: true }).ok, true);
    assert.ok(fake.rulesets[0].rules.some((x) => x.type === 'merge_queue'), 'refresh put the rule on');
    assert.equal(fs.existsSync(recordFile()), false, 'the stale record is gone');
    assert.equal(failures.length, 0);
  });

  test('5. an issue field whose options are rejected is created as text, reported, and the run succeeds', () => {
    install({ fieldOptionsAccepted: false });
    project();
    const r = apply();
    assert.equal(r.ok, true);
    const work = outcome(r, 'issue-field', 'work');
    assert.equal(work.status, 'created');
    assert.equal(work.degraded, true);
    assert.match(work.note, /field work created as text: single-select options were not accepted/);
    assert.deepEqual(apiJson('orgs/o/issue-fields').map((f) => [f.name, f.data_type]).sort(), [['kind', 'text'], ['work', 'text']]);
    assert.equal(apiJson('orgs/o/issue-fields')[0].options, undefined, 'no options on the text retry');
    assert.equal(failures.length, 2, 'one rejected create per field');
    const fieldWrites = fake.writes().filter((w) => w.includes('orgs/o/issue-fields'));
    assert.equal(fieldWrites.length, 4, 'a rejected create and a text retry per field');
    assert.ok(fieldWrites.every((w) => w.includes('X-GitHub-Api-Version: 2026-03-10')), 'the retry keeps the dated header');

    const writes = fake.writes().length;
    assert.equal(apply().ok, true);
    assert.equal(fake.writes().length, writes, 'the text fields now exist, so a second apply is write-free');
  });

  test('6a. a 403 on the org types and fields is a skip with the degraded note, and the run succeeds', () => {
    install({ orgAdmin: false });
    project();
    const r = apply();
    assert.equal(r.ok, true);
    const org = r.outcomes.filter((x) => x.kind === 'issue-type' || x.kind === 'issue-field');
    assert.equal(org.length, 7, 'five types and two fields were attempted');
    for (const o of org) {
      assert.equal(o.status, 'skipped', `${o.kind} ${o.target}`);
      assert.match(o.note, /needs an organization owner; DevFlow uses labels and body metadata/);
    }
    assert.equal(apiJson('orgs/o/issue-types').length, 0);
    assert.equal(outcome(r, 'ruleset').status, 'created', 'the repository-level actions still ran');
    assert.deepEqual([...fake.labels].sort(), [...ALL_LABELS].sort());
  });

  test('6b. a 403 on a repo-level action fails the run after the remaining actions are attempted', () => {
    install({ isAdmin: false });
    project();
    const actions = plan();
    const r = setup.applySetup(root, actions, { now: () => NOW });
    assert.equal(r.ok, false);
    const ruleset = outcome(r, 'ruleset');
    assert.equal(ruleset.status, 'failed');
    assert.match(ruleset.error, /403/);
    assert.equal(outcome(r, 'repo-settings').status, 'failed');
    assert.deepEqual([...fake.labels].sort(), [...ALL_LABELS].sort(), 'labels were still attempted and created');
    assert.equal(outcome(r, 'workflow').status, 'created', 'local files were still written');
    assert.ok(fs.existsSync(path.join(root, WORKFLOW)));
    assert.ok(fs.existsSync(path.join(root, PR_TEMPLATE)));
    assert.equal(r.outcomes.length, actions.length, 'every action has an outcome');
  });

  test('7. an unmanaged .github/workflows/devflow.yml is a conflict: untouched, the run fails, the rest still applies', () => {
    install();
    project({}, { [WORKFLOW]: 'name: my own\non: push\n' });
    const r = apply();
    assert.equal(r.ok, false);
    assert.equal(outcome(r, 'workflow').status, 'conflict');
    assert.equal(text(WORKFLOW), 'name: my own\non: push\n', 'the file was not touched');
    assert.equal(outcome(r, 'ruleset').status, 'created');
    assert.equal(outcome(r, 'pr-template').status, 'created');
  });

  test('8. a managed workflow that drifted is refreshed in place', () => {
    install();
    project({}, { [WORKFLOW]: '# devflow:managed\nname: old\n' });
    const r = apply();
    assert.equal(r.ok, true);
    assert.equal(outcome(r, 'workflow').status, 'updated');
    assert.ok(text(WORKFLOW).includes(`uses: ${DEFAULT_CHECKS}`));
  });

  test('9. a label created by someone else after the plan was read is exists, not a failure', () => {
    install();
    project();
    const actions = plan();
    fake.labels.push('devflow:trd');
    const r = setup.applySetup(root, actions, { now: () => NOW });
    assert.equal(r.ok, true);
    assert.equal(outcome(r, 'label', 'devflow:trd').status, 'exists');
    assert.equal(outcome(r, 'label', 'devflow:objective').status, 'created');
  });

  test('10. exists, skip, manual and advisory actions are reported as such and nothing is sent for them', () => {
    install({ hasWiki: true });
    project();
    assert.equal(apply().ok, true);
    const writes = fake.writes().length;
    const r = apply();
    assert.equal(fake.writes().length, writes);
    assert.equal(outcome(r, 'wiki').status, 'exists');
    assert.equal(outcome(r, 'advisory', 'ruleset').status, 'advisory', 'the unpinned-checks advisory is carried through');
    assert.equal(r.ok, true);
  });
});
