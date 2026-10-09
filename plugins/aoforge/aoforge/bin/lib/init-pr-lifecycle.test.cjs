'use strict';
/**
 * TRD 49-08 — init tells the workflows when the objective PR lifecycle replaces `git.branching_strategy`.
 *
 * `init execute-objective` and `init milestone-op` carry `pr_lifecycle`. In store mode (github.enabled +
 * github.store, read from the MAIN checkout) execute-objective also reports the objective branch, the PR
 * number, `branch_name: null` and, when a legacy strategy is configured, `branching_strategy_ignored`. In local
 * mode every existing field keeps its value; the only additions are `pr_lifecycle: false` and, when a strategy
 * is configured, a `deprecations` entry. Init never calls `gh`.
 *
 * The inits end in `output()`, which writes JSON and calls process.exit, so these tests run them in-process with
 * both stubbed (that is also what lets a `_setRunGh` spy see every call) and read the JSON back.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const init = require('./init.cjs');
const ghClient = require('./gh-client.cjs');
const ghMapping = require('./gh-mapping.cjs');

const OBJ_DIR = '49-objective-branch-and-pr-lifecycle';
const DEPRECATION =
  'git.branching_strategy is deprecated: in store mode (github.store) each objective runs on one linked branch and pull request (gh pr start).';

// The awareness cache is out of tree (TRD 45-01); keep every in-process run off the real ~/.claude.
let awarenessDir;
let savedAwarenessEnv;
const dirs = [];
test.beforeEach(() => {
  savedAwarenessEnv = process.env.AOFORGE_AWARENESS_DIR;
  awarenessDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-init-prl-awareness-'));
  process.env.AOFORGE_AWARENESS_DIR = awarenessDir;
});
test.afterEach(() => {
  if (savedAwarenessEnv === undefined) delete process.env.AOFORGE_AWARENESS_DIR;
  else process.env.AOFORGE_AWARENESS_DIR = savedAwarenessEnv;
  ghClient._setRunGh(null);
  for (const d of [awarenessDir, ...dirs.splice(0)]) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
  }
});

/**
 * A minimal project. `github` is the config's github block (omit for a local project), `strategy` is
 * git.branching_strategy (omit for the default), `pr` seeds prs['49'] in the mapping.
 */
function makeProject({ github, strategy, pr } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-init-prl-'));
  dirs.push(dir);
  const config = {};
  if (github) config.github = github;
  if (strategy !== undefined) config.git = { branching_strategy: strategy };
  fs.mkdirSync(path.join(dir, '.aoforge', 'objectives', OBJ_DIR), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aoforge', 'config.json'), JSON.stringify(config));
  fs.writeFileSync(path.join(dir, '.aoforge', 'ROADMAP.md'), '## Objective 49: Objective branch and PR lifecycle\n');
  fs.writeFileSync(path.join(dir, '.aoforge', 'objectives', OBJ_DIR, 'OBJECTIVE.md'), '---\nwork: feature\n---\n# Objective\n');
  if (pr) {
    const mapping = ghMapping.emptyMapping();
    ghMapping.setPr(mapping, '49', pr);
    const w = ghMapping.writeMappingV3(dir, mapping);
    assert.strictEqual(w.ok, true, w.error);
  }
  return dir;
}

const STORE = { enabled: true, store: true };

/** Run an init in-process; resolve to the JSON it printed. */
function runInit(fn, ...args) {
  const realWrite = process.stdout.write;
  const realExit = process.exit;
  let out = '';
  const STOP = Symbol('init-exit');
  process.stdout.write = (chunk) => { out += String(chunk); return true; };
  process.exit = () => { throw STOP; };
  try {
    fn(...args);
  } catch (e) {
    if (e !== STOP) throw e;
  } finally {
    process.stdout.write = realWrite;
    process.exit = realExit;
  }
  return JSON.parse(out);
}

const execObjective = (cwd) => runInit(init.cmdInitExecuteObjective, cwd, '49', new Set(), false, []);
const milestoneOp = (cwd) => runInit(init.cmdInitMilestoneOp, cwd, false, []);

// ─── execute-objective, store mode ───────────────────────────────────────────

test('49-08 test 1: store project, no prs entry -> rendered template branch, null PR', () => {
  const r = execObjective(makeProject({ github: STORE }));
  assert.strictEqual(r.pr_lifecycle, true);
  assert.strictEqual(r.objective_branch, 'df/objective-49-objective-branch-and-pr-lifecycle');
  assert.strictEqual(r.pr_number, null);
  assert.strictEqual(r.branch_name, null);
  assert.ok(!('branching_strategy_ignored' in r), 'no legacy strategy configured, nothing was ignored');
  assert.ok(!('deprecations' in r), 'store mode does not deprecate itself');
});

test('49-08 test 1b: store mode honours a custom objective_branch_template', () => {
  const dir = makeProject({ github: STORE });
  fs.writeFileSync(
    path.join(dir, '.aoforge', 'config.json'),
    JSON.stringify({ github: STORE, git: { objective_branch_template: 'feat/{objective}/{slug}' } })
  );
  const r = execObjective(dir);
  assert.strictEqual(r.objective_branch, 'feat/49/objective-branch-and-pr-lifecycle');
});

test('49-08 test 2: the linked branch in prs[id] wins over the template, and the PR number is reported', () => {
  const r = execObjective(makeProject({ github: STORE, pr: { branch: 'df/objective-49-x', number: 130 } }));
  assert.strictEqual(r.pr_lifecycle, true);
  assert.strictEqual(r.objective_branch, 'df/objective-49-x');
  assert.strictEqual(r.pr_number, 130);
  assert.strictEqual(r.branch_name, null);
});

test('49-08 test 2b: a prs entry with a branch but no number yet reports pr_number null', () => {
  const r = execObjective(makeProject({ github: STORE, pr: { branch: 'df/objective-49-x' } }));
  assert.strictEqual(r.objective_branch, 'df/objective-49-x');
  assert.strictEqual(r.pr_number, null);
});

test('49-08 test 3: store mode with a legacy strategy ignores it and clears branch_name', () => {
  const r = execObjective(makeProject({ github: STORE, strategy: 'objective' }));
  assert.strictEqual(r.pr_lifecycle, true);
  assert.strictEqual(r.branching_strategy_ignored, 'objective');
  assert.strictEqual(r.branch_name, null);
  assert.strictEqual(r.branching_strategy, 'objective', 'the configured value stays readable');
});

test('49-08 test 3b: store mode with the milestone strategy also clears branch_name', () => {
  const r = execObjective(makeProject({ github: STORE, strategy: 'milestone' }));
  assert.strictEqual(r.branching_strategy_ignored, 'milestone');
  assert.strictEqual(r.branch_name, null);
});

test('49-08 test 3c: github.enabled without github.store is local mode', () => {
  const r = execObjective(makeProject({ github: { enabled: true } }));
  assert.strictEqual(r.pr_lifecycle, false);
  assert.ok(!('objective_branch' in r));
  assert.ok(!('pr_number' in r));
});

// ─── execute-objective, local mode ───────────────────────────────────────────

test('49-08 test 4: local project with branching_strategy objective keeps branch_name and gains a deprecation', () => {
  const r = execObjective(makeProject({ strategy: 'objective' }));
  assert.strictEqual(r.pr_lifecycle, false);
  assert.strictEqual(r.branch_name, 'df/objective-49-objective-branch-and-pr-lifecycle');
  assert.strictEqual(r.branching_strategy, 'objective');
  assert.deepStrictEqual(r.deprecations, [DEPRECATION]);
  assert.ok(!('objective_branch' in r));
  assert.ok(!('pr_number' in r));
  assert.ok(!('branching_strategy_ignored' in r));
});

test('49-08 test 4b: local project with the milestone strategy keeps its milestone branch name', () => {
  const r = execObjective(makeProject({ strategy: 'milestone' }));
  assert.strictEqual(r.pr_lifecycle, false);
  assert.strictEqual(typeof r.branch_name, 'string');
  assert.deepStrictEqual(r.deprecations, [DEPRECATION]);
});

test('49-08 test 5: local project with branching_strategy none has no deprecations key', () => {
  const r = execObjective(makeProject({ strategy: 'none' }));
  assert.strictEqual(r.pr_lifecycle, false);
  assert.strictEqual(r.branch_name, null);
  assert.ok(!('deprecations' in r));
});

test('49-08 test 5b: local project with no git block at all (the default) has no deprecations key', () => {
  const r = execObjective(makeProject());
  assert.strictEqual(r.pr_lifecycle, false);
  assert.ok(!('deprecations' in r));
});

test('49-08 test 5c: a prs entry in a LOCAL project is not surfaced (the lifecycle is off)', () => {
  const r = execObjective(makeProject({ pr: { branch: 'df/objective-49-x', number: 130 } }));
  assert.strictEqual(r.pr_lifecycle, false);
  assert.ok(!('objective_branch' in r));
  assert.ok(!('pr_number' in r));
});

test('49-08 test 5d: every pre-existing execute-objective field is still present in both modes', () => {
  const existing = [
    'executor_model', 'verifier_model', 'commit_docs', 'parallelization', 'branching_strategy',
    'objective_branch_template', 'milestone_branch_template', 'verifier_enabled', 'objective_found',
    'objective_dir', 'objective_number', 'objective_name', 'objective_slug', 'jobs', 'summaries',
    'incomplete_jobs', 'job_count', 'incomplete_count', 'branch_name', 'milestone_version',
    'milestone_name', 'milestone_slug', 'state_exists', 'roadmap_exists', 'config_exists',
  ];
  for (const project of [makeProject(), makeProject({ github: STORE })]) {
    const r = execObjective(project);
    for (const k of existing) assert.ok(k in r, `missing ${k}`);
  }
});

// ─── milestone-op ────────────────────────────────────────────────────────────

test('49-08 test 6: milestone-op store -> pr_lifecycle true, with no branch fields', () => {
  const r = milestoneOp(makeProject({ github: STORE, pr: { branch: 'df/objective-49-x', number: 130 } }));
  assert.strictEqual(r.pr_lifecycle, true);
  assert.ok(!('objective_branch' in r));
  assert.ok(!('pr_number' in r));
  assert.ok(!('deprecations' in r));
});

test('49-08 test 6b: milestone-op local -> pr_lifecycle false and every existing field intact', () => {
  const r = milestoneOp(makeProject());
  assert.strictEqual(r.pr_lifecycle, false);
  assert.ok(!('deprecations' in r));
  for (const k of ['commit_docs', 'milestone_version', 'milestone_name', 'milestone_slug', 'objective_count',
    'completed_objectives', 'all_objectives_complete', 'archived_milestones', 'archive_count', 'project_exists',
    'roadmap_exists', 'state_exists', 'archive_exists', 'objectives_dir_exists']) {
    assert.ok(k in r, `missing ${k}`);
  }
});

test('49-08 test 6c: milestone-op local with a configured strategy carries the deprecation', () => {
  const r = milestoneOp(makeProject({ strategy: 'milestone' }));
  assert.strictEqual(r.pr_lifecycle, false);
  assert.deepStrictEqual(r.deprecations, [DEPRECATION]);
});

// ─── no gh ───────────────────────────────────────────────────────────────────

test('49-08 test 7: neither init makes a gh call, in either mode', () => {
  const calls = [];
  ghClient._setRunGh((...a) => { calls.push(a); return { status: 0, stdout: '', stderr: '' }; });
  for (const project of [
    makeProject({ strategy: 'objective' }),
    makeProject({ github: STORE, strategy: 'objective', pr: { branch: 'df/objective-49-x', number: 130 } }),
    makeProject({ github: STORE }),
  ]) {
    execObjective(project);
    milestoneOp(project);
  }
  assert.deepStrictEqual(calls, []);
});

// ─── main-checkout resolution ────────────────────────────────────────────────

test('49-08 test 8: a linked worktree resolves the mode and the prs mapping from the MAIN checkout', () => {
  const main = makeProject({ github: STORE, pr: { branch: 'df/objective-49-x', number: 130 } });
  // A linked worktree: a `.git` FILE whose gitdir sits under <main>/.git/worktrees/<name> with a commondir.
  fs.mkdirSync(path.join(main, '.git', 'worktrees', 'wt'), { recursive: true });
  fs.writeFileSync(path.join(main, '.git', 'worktrees', 'wt', 'commondir'), '../..\n');
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'df-init-prl-wt-'));
  dirs.push(wt);
  fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${path.join(main, '.git', 'worktrees', 'wt')}\n`);
  // The worktree has its own copy of the tracked planning files but NOT the gitignored mapping, and a config
  // that does not enable store mode: the main checkout decides.
  fs.mkdirSync(path.join(wt, '.aoforge', 'objectives', OBJ_DIR), { recursive: true });
  fs.writeFileSync(path.join(wt, '.aoforge', 'config.json'), '{}');
  fs.writeFileSync(path.join(wt, '.aoforge', 'ROADMAP.md'), '## Objective 49: Objective branch and PR lifecycle\n');
  fs.writeFileSync(path.join(wt, '.aoforge', 'objectives', OBJ_DIR, 'OBJECTIVE.md'), '---\nwork: feature\n---\n# Objective\n');

  const r = execObjective(wt);
  assert.strictEqual(r.pr_lifecycle, true);
  assert.strictEqual(r.objective_branch, 'df/objective-49-x');
  assert.strictEqual(r.pr_number, 130);
});
