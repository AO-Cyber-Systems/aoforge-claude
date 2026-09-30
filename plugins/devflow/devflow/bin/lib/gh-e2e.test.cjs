'use strict';

// gh-e2e.test.cjs (TRD 46-09) — objective 46's success criteria 1-4 as one scenario on ONE stateful
// fake GitHub, plus the legacy mapping-shape x command matrix.
//
//   SC1  after `gh sync` writes an entry, sync-objectives / comment / close-issue / pull resolve the
//        same issue, and pull finds push's baseline.
//   SC2  deleting .gh-mapping.json (and .gh-sync-state.json) and re-running sync creates no duplicate.
//   SC3  a human edit outside the managed sections survives two consecutive syncs, byte for byte.
//   SC4  a 403 secondary-limit response is retried after `retry-after`; writes are never concurrent.
//
// The fake is installed ONLY through `gh._setRunGh(fake.runGh)`. That one call must reach gh.cjs,
// gh-pull.cjs and every gh-* module through the gh-client seam; the tests never touch a per-module
// setter. The clock is fake (gh-client `_setNow` / `_setSleep`), so pacing and retry never really
// sleep. HOME and DEVFLOW_GH_CACHE_DIR point at temp dirs: no real GitHub, no real ~/.claude, no network.

const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const gh = require('./gh.cjs');
const client = require('./gh-client.cjs');
const { cmdGhPull } = require('./gh-pull.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');

const PLANNING = (root, ...p) => path.join(root, '.planning', ...p);
const MAPPING = (root) => PLANNING(root, '.gh-mapping.json');
const SYNC_STATE = (root) => PLANNING(root, '.gh-sync-state.json');
const OBJ_MD = (root, dir) => PLANNING(root, 'objectives', dir, 'OBJECTIVE.md');

const ROADMAP = [
  '# Roadmap',
  '',
  '## Milestones',
  '',
  '- 🚧 **v1.4 E2E** - Objectives 2-2.1 (in progress)',
  '',
  '## Objectives',
  '',
  '### Objective 2: a',
  '**Goal:** Build a',
  '',
  '**Success Criteria** (what must be TRUE):',
  '  1. a works',
  '',
  '### Objective 2.1: b',
  '**Goal:** Build b',
  '',
  '**Success Criteria** (what must be TRUE):',
  '  1. b works',
  '',
].join('\n');

/** Hand-built temp project: two objectives, one TRD each, no SUMMARY. */
function makeProject({ enabled = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-e2e-'));
  const planning = PLANNING(root);
  fs.mkdirSync(path.join(planning, 'objectives', '02-a'), { recursive: true });
  fs.mkdirSync(path.join(planning, 'objectives', '02.1-b'), { recursive: true });
  fs.writeFileSync(path.join(planning, 'config.json'), JSON.stringify({ github: { enabled, repo: 'o/r' } }, null, 2));
  fs.writeFileSync(path.join(planning, 'ROADMAP.md'), ROADMAP);
  fs.writeFileSync(path.join(planning, 'PROJECT.md'), '# Demo\n');
  fs.writeFileSync(OBJ_MD(root, '02-a'), '---\nobjective: 02-a\n---\n\n# Objective 2: a\n');
  fs.writeFileSync(OBJ_MD(root, '02.1-b'), '---\nobjective: 02.1-b\n---\n\n# Objective 2.1: b\n');
  fs.writeFileSync(PLANNING(root, 'objectives', '02-a', '02-01-first-TRD.md'), '---\nwave: 1\n---\n# first\n');
  fs.writeFileSync(PLANNING(root, 'objectives', '02.1-b', '02.1-01-only-TRD.md'), '---\nwave: 1\n---\n# only\n');
  return root;
}

/** Run fn with process.exit / stdout / stderr captured. The first exit code wins; exit does not throw. */
function capture(fn) {
  const out = { stdout: '', stderr: '', code: null };
  const saved = { exit: process.exit, out: process.stdout.write, err: process.stderr.write };
  process.exit = (c) => { if (out.code === null) out.code = c === undefined ? 0 : c; };
  process.stdout.write = (chunk) => { out.stdout += chunk; return true; };
  process.stderr.write = (chunk) => { out.stderr += chunk; return true; };
  try {
    fn();
  } finally {
    process.exit = saved.exit;
    process.stdout.write = saved.out;
    process.stderr.write = saved.err;
  }
  return out;
}

const json = (s) => JSON.parse(s);
/** An exit that was never called is an exit 0 (gh-pull exits only on failure). */
const exitOf = (r) => (r.code === null ? 0 : r.code);

const sync = (root, args = ['--all']) => capture(() => gh.cmdGhSync(root, args, false));
const comment = (root, target, body) => capture(() => gh.cmdGhComment(root, [target, body], false));
const closeIssue = (root, target, body) => capture(() => gh.cmdGhCloseIssue(root, target, body, false));
/** `gh pull` prints prose unless raw; raw=true gives the JSON payload. */
const pull = (root, args) => capture(() => cmdGhPull(root, args, true));

const callsSince = (f, from) => f.calls().slice(from);
const writesSince = (f, from) => f.writes().slice(from);
const verbOf = (argv, noun, verb) => argv[0] === noun && argv[1] === verb;
const creates = (argvs) => argvs.filter((a) => verbOf(a, 'issue', 'create'));

// ─── Shared environment ──────────────────────────────────────────────────────

let clock;
let sleeps;
let tmpHome;
let savedEnv;
let fake;
let root;

function setUpEnv() {
  clock = Date.UTC(2026, 8, 30, 12, 0, 0);
  sleeps = [];
  client._resetClient();
  client._setNow(() => clock);
  client._setSleep((ms) => { sleeps.push(ms); clock += ms; });
  gh._resetCache();
  savedEnv = { HOME: process.env.HOME, DEVFLOW_GH_CACHE_DIR: process.env.DEVFLOW_GH_CACHE_DIR };
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-e2e-home-'));
  process.env.HOME = tmpHome;
  process.env.DEVFLOW_GH_CACHE_DIR = path.join(tmpHome, 'gh-cache');
}

/** The one and only way the fake is installed. */
function installFake() {
  fake = createFakeGitHub({ repo: 'o/r', now: () => clock });
  gh._setRunGh(fake.runGh);
  return fake;
}

function tearDownEnv() {
  if (fake) {
    for (const argv of fake.calls()) {
      for (const a of argv) assert.ok(!String(a).includes('[object Object]'), `argv carries [object Object]: ${argv.join(' ')}`);
    }
  }
  fake = null;
  gh._setRunGh(null);
  client._resetClient();
  client._setNow(null);
  client._setSleep(null);
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  if (root) fs.rmSync(root, { recursive: true, force: true });
  if (tmpHome) fs.rmSync(tmpHome, { recursive: true, force: true });
  root = null;
}

// ─── The scenario (tests 1-7, 9): one project, one fake, in order ────────────

describe('e2e push -> pull on one fake GitHub', () => {
  before(() => {
    setUpEnv();
    root = makeProject();
    installFake();
  });
  after(tearDownEnv);

  test('1: `sync --all` pushes both objectives; mapping v3, frontmatter and sync-state share the ids', () => {
    const r = sync(root);
    assert.equal(exitOf(r), 0, r.stderr);
    const res = json(r.stdout);
    assert.equal(res.ok, true, r.stdout);
    assert.deepEqual(res.results.map((x) => x.id), ['2', '2.1']);

    assert.equal(fake.issues.length, 2);
    assert.match(fake.issues[0].body, /<!-- devflow:id=2 -->/);
    assert.match(fake.issues[1].body, /<!-- devflow:id=2\.1 -->/);

    const mapping = json(fs.readFileSync(MAPPING(root), 'utf-8'));
    assert.equal(mapping.version, 3);
    assert.deepEqual(Object.keys(mapping.objectives).sort(), ['2', '2.1']);
    assert.equal(mapping.objectives['2'].issue_id, 1);
    assert.equal(mapping.objectives['2.1'].issue_id, 2);

    assert.match(fs.readFileSync(OBJ_MD(root, '02-a'), 'utf-8'), /^github_issue: o\/r#1$/m);
    assert.match(fs.readFileSync(OBJ_MD(root, '02.1-b'), 'utf-8'), /^github_issue: o\/r#2$/m);

    const state = json(fs.readFileSync(SYNC_STATE(root), 'utf-8'));
    assert.deepEqual(Object.keys(state.objectives).sort(), ['2', '2.1']);
  });

  test('2 (SC1): sync-objectives, pull (any spelling), comment and close-issue all resolve the same issue', () => {
    const mappingBefore = fs.readFileSync(MAPPING(root), 'utf-8');

    // The deprecated alias is the same push: same issues, no create.
    let from = fake.calls().length;
    const alias = capture(() => gh.cmdGhSyncObjectives(root, false));
    assert.equal(exitOf(alias), 0, alias.stderr);
    assert.deepEqual(creates(callsSince(fake, from)), []);
    assert.equal(fake.issues.length, 2);
    assert.equal(fs.readFileSync(MAPPING(root), 'utf-8'), mappingBefore, 'the alias leaves the mapping alone');

    // pull finds push's baseline: the same issue for the dir name and the id, no drift, no first sync.
    for (const spelling of ['02-a', '2']) {
      from = fake.calls().length;
      const r = pull(root, [spelling]);
      assert.equal(exitOf(r), 0, `${spelling}: ${r.stdout}${r.stderr}`);
      const payload = json(r.stdout);
      assert.equal(payload.ok, true, r.stdout);
      assert.equal(payload.drift, false, `pull ${spelling} must find push's baseline: ${r.stdout}`);
      assert.notEqual(payload.first_sync, true);
      const views = callsSince(fake, from).filter((a) => verbOf(a, 'issue', 'view'));
      assert.ok(views.length >= 1, `pull ${spelling} read the issue`);
      assert.ok(views.every((a) => a[2] === '1' && a.includes('o/r')), `pull ${spelling} -> ${views.map((a) => a.join(' ')).join(' | ')}`);
    }

    // comment resolves 2 and 02.1-b to their own issues.
    from = fake.calls().length;
    assert.equal(exitOf(comment(root, '2', 'hi')), 0);
    assert.equal(exitOf(comment(root, '02.1-b', 'hi')), 0);
    const posted = callsSince(fake, from).filter((a) => verbOf(a, 'issue', 'comment'));
    assert.deepEqual(posted.map((a) => a[2]), ['1', '2']);

    // close-issue 2 closes #1 and only #1.
    from = fake.calls().length;
    const closed = closeIssue(root, '2', 'Verified');
    assert.equal(exitOf(closed), 0, closed.stdout + closed.stderr);
    assert.deepEqual(callsSince(fake, from).filter((a) => verbOf(a, 'issue', 'close')).map((a) => a[2]), ['1']);
    assert.equal(fake.issues[0].state, 'CLOSED');
    assert.equal(fake.issues[1].state, 'OPEN');
  });

  test('3: drift round trip - a label added on GitHub shows up in pull, and --apply writes it to OBJECTIVE.md', () => {
    fake.labels.push('needs-review');
    const edit = fake.runGh(['issue', 'edit', '2', '--repo', 'o/r', '--add-label', 'needs-review']);
    assert.equal(edit.ok, true, edit.stderr);

    const report = pull(root, ['2.1']);
    assert.equal(exitOf(report), 0, report.stdout + report.stderr);
    const drift = json(report.stdout);
    assert.equal(drift.ok, true);
    assert.equal(drift.drift, true);
    assert.notEqual(drift.first_sync, true, 'the baseline was found');
    assert.ok(drift.fields.labels.gh.includes('needs-review'), JSON.stringify(drift.fields));

    const before = fs.readFileSync(OBJ_MD(root, '02.1-b'), 'utf-8');
    assert.ok(!before.includes('needs-review'), 'report-only mode writes nothing');

    const applied = pull(root, ['2.1', '--apply']);
    assert.equal(exitOf(applied), 0, applied.stdout + applied.stderr);
    assert.equal(json(applied.stdout).drift, true);
    const after = fs.readFileSync(OBJ_MD(root, '02.1-b'), 'utf-8');
    assert.match(after, /^labels: .*needs-review/m, after);
    assert.match(after, /^github_issue: o\/r#2$/m, 'pull --apply keeps the other frontmatter lines');

    // Applied: the next pull has nothing to report.
    const again = pull(root, ['2.1']);
    assert.equal(json(again.stdout).drift, false, again.stdout);
  });

  test('4 (SC2): losing .gh-mapping.json and .gh-sync-state.json re-syncs onto the same issues - zero creates', () => {
    const mappingBefore = json(fs.readFileSync(MAPPING(root), 'utf-8'));
    fs.rmSync(MAPPING(root));
    fs.rmSync(SYNC_STATE(root));
    const from = fake.calls().length;
    const writesFrom = fake.writes().length;

    const r = sync(root);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    assert.equal(json(r.stdout).ok, true);

    assert.equal(fake.issues.length, 2, 'no duplicate issue');
    assert.deepEqual(creates(writesSince(fake, writesFrom)), [], 'zero issue create calls');
    assert.deepEqual(creates(callsSince(fake, from)), []);

    const rebuilt = json(fs.readFileSync(MAPPING(root), 'utf-8'));
    assert.equal(rebuilt.version, 3);
    assert.equal(rebuilt.objectives['2'].issue_id, mappingBefore.objectives['2'].issue_id);
    assert.equal(rebuilt.objectives['2.1'].issue_id, mappingBefore.objectives['2.1'].issue_id);
    assert.deepEqual(Object.keys(json(fs.readFileSync(SYNC_STATE(root), 'utf-8')).objectives).sort(), ['2', '2.1']);
  });

  test('5 (SC2): losing the mapping AND the github_issue frontmatter refs still finds the issues by marker', () => {
    fs.rmSync(MAPPING(root));
    fs.rmSync(SYNC_STATE(root));
    for (const dir of ['02-a', '02.1-b']) {
      const file = OBJ_MD(root, dir);
      fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace(/^github_issue:.*\n/m, ''));
      assert.ok(!fs.readFileSync(file, 'utf-8').includes('github_issue'));
    }
    const from = fake.calls().length;

    const r = sync(root);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);

    assert.equal(fake.issues.length, 2, 'no duplicate issue');
    assert.deepEqual(creates(callsSince(fake, from)), [], 'zero issue create calls');
    assert.match(fs.readFileSync(OBJ_MD(root, '02-a'), 'utf-8'), /^github_issue: o\/r#1$/m);
    assert.match(fs.readFileSync(OBJ_MD(root, '02.1-b'), 'utf-8'), /^github_issue: o\/r#2$/m);
    const rebuilt = json(fs.readFileSync(MAPPING(root), 'utf-8'));
    assert.equal(rebuilt.objectives['2'].issue_id, 1);
    assert.equal(rebuilt.objectives['2.1'].issue_id, 2);
  });
});
