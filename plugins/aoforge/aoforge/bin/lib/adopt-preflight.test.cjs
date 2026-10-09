'use strict';

// adopt-preflight.test.cjs — the deterministic routing/refusal front-door for
// /aoforge:adopt (objective 37, TRD 05, ADP-03).
//
// Test list (TDD Playbook habit #2 — reviewable artifact, written before
// implementation):
//
// Spawned aof-tools (`spawnSync`, cwd = an unrelated mkdtemp dir; fixtures via
// adopt-fixtures.cjs) — `aof-tools --cwd <fixture> adopt preflight`:
//   1. go-service fixture -> exit 0, route 'adopt', repo_state.state in
//      {brownfield, scratch}, git.branch 'main', git.dirty [].
//   2. aoforge fixture -> exit 0, route 'upgrade', next mentions
//      `upgrade --check`.
//   3. empty fixture -> exit 0, route 'new-project', next mentions
//      /aoforge:new-project.
//   4. dirty fixture -> exit 3, route 'refuse', reason 'dirty-tree',
//      git.dirty superset of [main.go, notes.txt]; repoSnapshot identical
//      before/after.
//   5. a plain (non-git) directory -> exit 3, reason 'not-a-git-repo';
//      snapshot unchanged.
//   6. --cwd into a subdirectory of a repo -> exit 3, reason
//      'not-repo-root', message names the real top level.
//   7. a rebase-merge dir / MERGE_HEAD file -> exit 3, reason
//      'operation-in-progress', git.busy 'rebase' / 'merge'.
//   8. `git checkout --detach` -> exit 3, reason 'detached-head'.
//   9. `git init` only (unborn, nothing on disk) -> exit 0, route
//      'new-project' (greenfield beats unborn/no-commits).
//   10. a pre-existing aoforge/adopt branch with no marker -> exit 3, reason
//       'adopt-branch-exists'.
//
// `aof-tools --cwd <fixture> adopt begin`:
//   11. go-service fixture -> exit 0, route 'adopt', created_branch true;
//       `git branch --show-current` is aoforge/adopt; HEAD sha unchanged;
//       file snapshot unchanged; marker has status in_progress, base_branch,
//       base_sha, started_at, plugin_version.
//   12. begin again -> route 'resume', created_branch false, marker bytes
//       identical to the first call's.
//   13. after begin + writeMappedDocs + writeProjectMd({kind:'api'}) ->
//       preflight route 'resume', adopt.steps
//       {mapped:true, project_md:true, scaffolded:false, reported:false};
//       with only STACK.md written, mapped is false.
//   14. after begin, append to main.go -> preflight refuses dirty-tree,
//       naming main.go only (owned paths are not offending).
//   15. after begin + writeMappedDocs, `git switch main` -> preflight
//       refuses 'adopt-in-progress-elsewhere'.
//   16. begin on a fixture that preflights to dirty/aoforge/empty is a pure
//       read: same route as preflight, created_branch false, no branch, no
//       marker, repoSnapshot identical before/after.
//   17. once the adopt commit (ROADMAP.md tracked) lands, preflight routes
//       to 'upgrade' even with the marker still present.
//
// Pure `decideRoute(facts)` (18) — one row per rule plus precedence rows
// (busy beats detached; resume beats dirty; dirty beats `.aoforge` present;
// greenfield beats unborn; adopt-branch-exists only for brownfield/scratch).
//
// Help (19): `aof-tools adopt --help` prints `Usage: aof-tools adopt`;
// help.test.cjs (dispatcher/table parity) stays green.

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const {
  makeFixture,
  makeFakeHome,
  gitEnv,
  snapshot,
  writeMappedDocs,
  writeProjectMd,
} = require('./__fixtures__/adopt-fixtures.cjs');

const { decideRoute } = require('./adopt.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'aof-tools.cjs');

// ─── Helpers ────────────────────────────────────────────────────────────────

let spawnedTmpRoots = [];
function mkdtemp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  spawnedTmpRoots.push(dir);
  return dir;
}

let fakeHome;

function run(argv, cwd, env) {
  const r = spawnSync(process.execPath, [TOOLS_PATH, ...argv], {
    cwd, encoding: 'utf-8', timeout: 30000, env,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', out: (r.stdout || '') + (r.stderr || '') };
}

function runAdopt(fixture, sub, extraArgs = []) {
  const r = run(['--cwd', fixture, 'adopt', sub, ...extraArgs], mkdtemp('df-adopt-spawn-'), gitEnv(fakeHome));
  let report = null;
  try { report = JSON.parse(r.stdout); } catch { /* left null on parse failure */ }
  return { ...r, report };
}

function gitOut(root, args) {
  try {
    return execFileSync('git', ['-C', root, ...args], { env: gitEnv(fakeHome), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return `ERR:${e.status}`;
  }
}

function repoSnapshot(root) {
  return {
    files: snapshot(root),
    status: gitOut(root, ['status', '--porcelain=v1', '--untracked-files=all']),
    branches: gitOut(root, ['branch', '--list']),
    head: gitOut(root, ['rev-parse', 'HEAD']),
    stash: gitOut(root, ['stash', 'list']),
  };
}

function markerFilePath(root) {
  const p = gitOut(root, ['rev-parse', '--git-path', 'aoforge-adopt.json']).trim();
  return path.resolve(root, p);
}

beforeEach(() => {
  spawnedTmpRoots = [];
  fakeHome = makeFakeHome();
});

afterEach(() => {
  for (const dir of spawnedTmpRoots) fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(fakeHome, { recursive: true, force: true });
});

// ─── Spawned: adopt preflight (tests 1-10) ────────────────────────────────

describe('aof-tools adopt preflight (spawned)', () => {
  test('1. go-service fixture routes to adopt with a clean main branch', () => {
    const fixture = makeFixture('go-service', { parent: mkdtemp('df-adopt-parent-'), home: fakeHome });
    const { status, report, out } = runAdopt(fixture, 'preflight');
    assert.strictEqual(status, 0, out);
    assert.strictEqual(report.route, 'adopt');
    assert.ok(['brownfield', 'scratch'].includes(report.repo_state.state), report.repo_state.state);
    assert.strictEqual(report.git.branch, 'main');
    assert.deepStrictEqual(report.git.dirty, []);
  });

  test('2. an already-AOForge fixture routes to upgrade', () => {
    const fixture = makeFixture('aoforge', { parent: mkdtemp('df-adopt-parent-'), home: fakeHome });
    const { status, report, out } = runAdopt(fixture, 'preflight');
    assert.strictEqual(status, 0, out);
    assert.strictEqual(report.route, 'upgrade');
    assert.match(report.next, /upgrade --check/);
  });

  test('3. an empty fixture points at new-project', () => {
    const fixture = makeFixture('empty', { parent: mkdtemp('df-adopt-parent-'), home: fakeHome });
    const { status, report, out } = runAdopt(fixture, 'preflight');
    assert.strictEqual(status, 0, out);
    assert.strictEqual(report.route, 'new-project');
    assert.match(report.next, /\/aoforge:new-project/);
  });

  test('4. a dirty fixture refuses and leaves the tree unchanged', () => {
    const fixture = makeFixture('dirty', { parent: mkdtemp('df-adopt-parent-'), home: fakeHome });
    const before = repoSnapshot(fixture);
    const { status, report, out } = runAdopt(fixture, 'preflight');
    assert.strictEqual(status, 3, out);
    assert.strictEqual(report.route, 'refuse');
    assert.strictEqual(report.reason, 'dirty-tree');
    assert.ok(report.git.dirty.includes('main.go'), JSON.stringify(report.git.dirty));
    assert.ok(report.git.dirty.includes('notes.txt'), JSON.stringify(report.git.dirty));
    assert.deepStrictEqual(repoSnapshot(fixture), before);
  });

  test('5. a non-git directory refuses as not-a-git-repo and is left unchanged', () => {
    const dir = mkdtemp('df-adopt-nogit-');
    fs.writeFileSync(path.join(dir, 'main.go'), 'package main\n', 'utf-8');
    const before = snapshot(dir);
    const { status, report, out } = runAdopt(dir, 'preflight');
    assert.strictEqual(status, 3, out);
    assert.strictEqual(report.route, 'refuse');
    assert.strictEqual(report.reason, 'not-a-git-repo');
    assert.deepStrictEqual(snapshot(dir), before);
  });

  test('6. --cwd into a subdirectory refuses as not-repo-root and names the top level', () => {
    const fixture = makeFixture('go-service', { parent: mkdtemp('df-adopt-parent-'), home: fakeHome });
    const sub = path.join(fixture, 'internal');
    const { status, report, out } = runAdopt(sub, 'preflight');
    assert.strictEqual(status, 3, out);
    assert.strictEqual(report.reason, 'not-repo-root');
    assert.strictEqual(fs.realpathSync(report.git.toplevel), fs.realpathSync(fixture));
    assert.ok(report.message.includes(report.git.toplevel), report.message);
  });

  test('7. a rebase or a merge in progress refuses as operation-in-progress', () => {
    const fixtureA = makeFixture('go-service', { parent: mkdtemp('df-adopt-parent-'), home: fakeHome });
    const rebasePath = gitOut(fixtureA, ['rev-parse', '--git-path', 'rebase-merge']).trim();
    fs.mkdirSync(path.resolve(fixtureA, rebasePath), { recursive: true });
    let r = runAdopt(fixtureA, 'preflight');
    assert.strictEqual(r.status, 3, r.out);
    assert.strictEqual(r.report.reason, 'operation-in-progress');
    assert.strictEqual(r.report.git.busy, 'rebase');

    const fixtureB = makeFixture('go-service', { parent: mkdtemp('df-adopt-parent-'), home: fakeHome });
    const mergeHeadPath = gitOut(fixtureB, ['rev-parse', '--git-path', 'MERGE_HEAD']).trim();
    fs.writeFileSync(path.resolve(fixtureB, mergeHeadPath), 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef\n', 'utf-8');
    r = runAdopt(fixtureB, 'preflight');
    assert.strictEqual(r.status, 3, r.out);
    assert.strictEqual(r.report.reason, 'operation-in-progress');
    assert.strictEqual(r.report.git.busy, 'merge');
  });

  test('8. a detached HEAD refuses as detached-head', () => {
    const fixture = makeFixture('go-service', { parent: mkdtemp('df-adopt-parent-'), home: fakeHome });
    execFileSync('git', ['-C', fixture, 'checkout', '--detach'], { env: gitEnv(fakeHome), stdio: ['ignore', 'pipe', 'pipe'] });
    const { status, report, out } = runAdopt(fixture, 'preflight');
    assert.strictEqual(status, 3, out);
    assert.strictEqual(report.reason, 'detached-head');
  });

  test('9. an unborn repo with nothing on disk still routes to new-project', () => {
    const dir = mkdtemp('df-adopt-unborn-');
    execFileSync('git', ['-C', dir, 'init', '-q', '-b', 'main'], { env: gitEnv(fakeHome), stdio: ['ignore', 'pipe', 'pipe'] });
    const { status, report, out } = runAdopt(dir, 'preflight');
    assert.strictEqual(status, 0, out);
    assert.strictEqual(report.route, 'new-project');
  });

  test('10. a pre-existing aoforge/adopt branch with no marker refuses', () => {
    const fixture = makeFixture('go-service', { parent: mkdtemp('df-adopt-parent-'), home: fakeHome });
    execFileSync('git', ['-C', fixture, 'branch', 'aoforge/adopt'], { env: gitEnv(fakeHome), stdio: ['ignore', 'pipe', 'pipe'] });
    const { status, report, out } = runAdopt(fixture, 'preflight');
    assert.strictEqual(status, 3, out);
    assert.strictEqual(report.reason, 'adopt-branch-exists');
  });
});

// ─── Spawned: adopt begin, marker, resume (tests 11-17) ───────────────────

describe('aof-tools adopt begin (spawned)', () => {
  test('11. begin on a brownfield repo creates the branch and marker', () => {
    const fixture = makeFixture('go-service', { parent: mkdtemp('df-adopt-parent-'), home: fakeHome });
    const beforeSha = gitOut(fixture, ['rev-parse', 'HEAD']).trim();
    const beforeFiles = snapshot(fixture);

    const { status, report, out } = runAdopt(fixture, 'begin');
    assert.strictEqual(status, 0, out);
    assert.strictEqual(report.route, 'adopt');
    assert.strictEqual(report.created_branch, true);

    assert.strictEqual(gitOut(fixture, ['branch', '--show-current']).trim(), 'aoforge/adopt');
    assert.strictEqual(gitOut(fixture, ['rev-parse', 'HEAD']).trim(), beforeSha);
    assert.deepStrictEqual(snapshot(fixture), beforeFiles);

    assert.strictEqual(report.adopt.marker.status, 'in_progress');
    assert.strictEqual(report.adopt.marker.base_branch, 'main');
    assert.ok(report.adopt.marker.base_sha);
    assert.ok(report.adopt.marker.started_at);
    assert.ok(report.adopt.marker.plugin_version);
  });

  test('12. calling begin again resumes instead of re-branching', () => {
    const fixture = makeFixture('go-service', { parent: mkdtemp('df-adopt-parent-'), home: fakeHome });
    const first = runAdopt(fixture, 'begin');
    assert.strictEqual(first.status, 0, first.out);

    const markerBefore = fs.readFileSync(markerFilePath(fixture), 'utf-8');

    const second = runAdopt(fixture, 'begin');
    assert.strictEqual(second.status, 0, second.out);
    assert.strictEqual(second.report.route, 'resume');
    assert.strictEqual(second.report.created_branch, false);

    const markerAfter = fs.readFileSync(markerFilePath(fixture), 'utf-8');
    assert.strictEqual(markerAfter, markerBefore);
  });

  test('13. resume steps reflect mapped/project_md progress on disk', () => {
    const fixture = makeFixture('go-service', { parent: mkdtemp('df-adopt-parent-'), home: fakeHome });
    runAdopt(fixture, 'begin');
    writeMappedDocs(fixture);
    writeProjectMd(fixture, { name: 'Orders service', kind: 'api' });

    let { status, report, out } = runAdopt(fixture, 'preflight');
    assert.strictEqual(status, 0, out);
    assert.strictEqual(report.route, 'resume');
    assert.deepStrictEqual(report.adopt.steps, { mapped: true, project_md: true, scaffolded: false, reported: false });

    const fixture2 = makeFixture('go-service', { parent: mkdtemp('df-adopt-parent-'), home: fakeHome });
    runAdopt(fixture2, 'begin');
    fs.mkdirSync(path.join(fixture2, '.aoforge', 'codebase'), { recursive: true });
    fs.writeFileSync(path.join(fixture2, '.aoforge', 'codebase', 'STACK.md'), '# STACK\n\nSome content.\n', 'utf-8');
    ({ status, report, out } = runAdopt(fixture2, 'preflight'));
    assert.strictEqual(status, 0, out);
    assert.strictEqual(report.route, 'resume');
    assert.strictEqual(report.adopt.steps.mapped, false);
  });

  test('14. dirty non-owned files after begin block resume', () => {
    const fixture = makeFixture('go-service', { parent: mkdtemp('df-adopt-parent-'), home: fakeHome });
    runAdopt(fixture, 'begin');
    fs.appendFileSync(path.join(fixture, 'main.go'), '// dirty\n', 'utf-8');

    const { status, report, out } = runAdopt(fixture, 'preflight');
    assert.strictEqual(status, 3, out);
    assert.strictEqual(report.reason, 'dirty-tree');
    assert.match(report.message, /main\.go/);
  });

  test('15. switching away from aoforge/adopt mid-resume refuses', () => {
    const fixture = makeFixture('go-service', { parent: mkdtemp('df-adopt-parent-'), home: fakeHome });
    runAdopt(fixture, 'begin');
    writeMappedDocs(fixture);
    execFileSync('git', ['-C', fixture, 'switch', 'main'], { env: gitEnv(fakeHome), stdio: ['ignore', 'pipe', 'pipe'] });

    const { status, report, out } = runAdopt(fixture, 'preflight');
    assert.strictEqual(status, 3, out);
    assert.strictEqual(report.reason, 'adopt-in-progress-elsewhere');
  });

  test('16. begin on a non-adopt route is a pure read: no branch, no marker, tree unchanged', () => {
    for (const kind of ['dirty', 'aoforge', 'empty']) {
      const fixture = makeFixture(kind, { parent: mkdtemp('df-adopt-parent-'), home: fakeHome, name: `f-${kind}` });
      const pf = runAdopt(fixture, 'preflight');
      const before = repoSnapshot(fixture);

      const b = runAdopt(fixture, 'begin');
      assert.strictEqual(b.status, pf.status, kind);
      assert.strictEqual(b.report.route, pf.report.route, kind);
      assert.strictEqual(b.report.created_branch, false, kind);

      assert.deepStrictEqual(repoSnapshot(fixture), before, kind);
    }
  });

  test('17. once the adopt commit lands, preflight routes to upgrade even with the marker present', () => {
    const fixture = makeFixture('go-service', { parent: mkdtemp('df-adopt-parent-'), home: fakeHome });
    runAdopt(fixture, 'begin');
    writeMappedDocs(fixture);
    writeProjectMd(fixture, { name: 'Orders service', kind: 'api' });
    fs.writeFileSync(path.join(fixture, '.aoforge', 'ROADMAP.md'), '# Roadmap\n', 'utf-8');
    execFileSync('git', ['-C', fixture, 'add', '-A'], { env: gitEnv(fakeHome), stdio: ['ignore', 'pipe', 'pipe'] });
    execFileSync('git', ['-C', fixture, 'commit', '-q', '-m', 'adopt'], { env: gitEnv(fakeHome), stdio: ['ignore', 'pipe', 'pipe'] });

    const { status, report, out } = runAdopt(fixture, 'preflight');
    assert.strictEqual(status, 0, out);
    assert.strictEqual(report.route, 'upgrade');
  });
});

// ─── Pure decideRoute — rule-order table (test 18) ─────────────────────────

describe('decideRoute — pure rule-order table (test 18)', () => {
  function makeFacts(over = {}) {
    const git = {
      is_repo: true, toplevel: '/repo', isTopLevel: true, branch: 'main', head_sha: 'sha1',
      detached: false, unborn: false, busy: null, dirty: [],
      ...(over.git || {}),
    };
    return {
      target: '/repo',
      isDirectory: true,
      state: 'brownfield',
      marker: null,
      branchExists: false,
      roadmapTracked: false,
      ...over,
      git,
    };
  }

  const rows = [
    { name: 'not a directory -> refuse not-a-directory', facts: makeFacts({ isDirectory: false }), route: 'refuse', reason: 'not-a-directory' },
    { name: 'not a git repo -> refuse not-a-git-repo', facts: makeFacts({ git: { is_repo: false } }), route: 'refuse', reason: 'not-a-git-repo' },
    { name: 'not top level -> refuse not-repo-root', facts: makeFacts({ git: { isTopLevel: false } }), route: 'refuse', reason: 'not-repo-root' },
    { name: 'busy operation -> refuse operation-in-progress', facts: makeFacts({ git: { busy: 'rebase' } }), route: 'refuse', reason: 'operation-in-progress' },
    { name: 'detached HEAD -> refuse detached-head', facts: makeFacts({ git: { detached: true } }), route: 'refuse', reason: 'detached-head' },
    { name: 'active marker, branch matches, clean -> resume', facts: makeFacts({ marker: { status: 'in_progress', branch: 'aoforge/adopt' }, git: { branch: 'aoforge/adopt' } }), route: 'resume', reason: null },
    { name: 'active marker, branch mismatch -> refuse adopt-in-progress-elsewhere', facts: makeFacts({ marker: { status: 'in_progress', branch: 'aoforge/adopt' }, git: { branch: 'main' } }), route: 'refuse', reason: 'adopt-in-progress-elsewhere' },
    { name: 'active marker, non-owned dirty -> refuse dirty-tree (resume beats dirty only when owned)', facts: makeFacts({ marker: { status: 'in_progress', branch: 'aoforge/adopt' }, git: { branch: 'aoforge/adopt', dirty: ['main.go'] } }), route: 'refuse', reason: 'dirty-tree' },
    { name: 'active marker, owned-only dirty -> resume (resume beats dirty)', facts: makeFacts({ marker: { status: 'in_progress', branch: 'aoforge/adopt' }, git: { branch: 'aoforge/adopt', dirty: ['.aoforge/codebase/STACK.md', 'CLAUDE.md'] } }), route: 'resume', reason: null },
    { name: 'no marker, dirty tree -> refuse dirty-tree', facts: makeFacts({ git: { dirty: ['x.txt'] } }), route: 'refuse', reason: 'dirty-tree' },
    { name: 'dirty beats .aoforge present -> refuse dirty-tree, not upgrade', facts: makeFacts({ state: 'aoforge', git: { dirty: ['x.txt'] } }), route: 'refuse', reason: 'dirty-tree' },
    { name: '.aoforge present -> upgrade', facts: makeFacts({ state: 'aoforge' }), route: 'upgrade', reason: null },
    { name: 'greenfield -> new-project', facts: makeFacts({ state: 'greenfield' }), route: 'new-project', reason: null },
    { name: 'greenfield beats unborn -> new-project', facts: makeFacts({ state: 'greenfield', git: { unborn: true } }), route: 'new-project', reason: null },
    { name: 'no commits yet (brownfield, unborn) -> refuse no-commits', facts: makeFacts({ state: 'brownfield', git: { unborn: true } }), route: 'refuse', reason: 'no-commits' },
    { name: 'aoforge/adopt branch already exists -> refuse adopt-branch-exists', facts: makeFacts({ state: 'brownfield', branchExists: true }), route: 'refuse', reason: 'adopt-branch-exists' },
    { name: 'adopt-branch-exists only applies to brownfield/scratch: aoforge ignores it', facts: makeFacts({ state: 'aoforge', branchExists: true }), route: 'upgrade', reason: null },
    { name: 'brownfield -> adopt', facts: makeFacts({ state: 'brownfield' }), route: 'adopt', reason: null },
    { name: 'scratch -> adopt', facts: makeFacts({ state: 'scratch' }), route: 'adopt', reason: null },
    { name: 'busy beats detached', facts: makeFacts({ git: { busy: 'merge', detached: true } }), route: 'refuse', reason: 'operation-in-progress' },
  ];

  for (const row of rows) {
    test(`18. ${row.name}`, () => {
      const result = decideRoute(row.facts);
      assert.strictEqual(result.route, row.route, JSON.stringify(result));
      assert.strictEqual(result.reason, row.reason, JSON.stringify(result));
    });
  }
});

// ─── Help (test 19) ─────────────────────────────────────────────────────────

describe('aof-tools adopt --help (test 19)', () => {
  test('19. adopt --help prints usage', () => {
    const r = run(['adopt', '--help'], mkdtemp('df-adopt-help-'), { ...process.env, HOME: fakeHome });
    assert.strictEqual(r.status, 0, r.out);
    assert.match(r.stdout, /^Usage: aof-tools adopt /m);
  });
});
