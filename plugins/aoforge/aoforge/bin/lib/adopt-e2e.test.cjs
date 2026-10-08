'use strict';

// adopt-e2e.test.cjs — deterministic adopt pipeline E2E structural checks (objective 37, TRD 08).
//
// Test list (TDD Playbook habit #2 — reviewable artifact, written before implementation):
//
//  15. DoD: go-service, flutter-app, node-cli — the full scripted pipeline (preflight -> begin ->
//      skill-active start -> stand-in maps -> PROJECT.md -> inferences -> scaffold -> report ->
//      skill-active end -> `aof-tools commit --files <commit_files>`) -> `adopt-e2e-assert.cjs
//      check <root> --home <home>` exit 0, every check `ok: true`. flutter-app pre-writes a
//      `v=2 src=claude-md` block into CLAUDE.md before scaffold (as map-codebase would); go/node
//      let scaffold insert it.
//  16. Afterwards `adopt preflight` -> `route: 'upgrade'`; `adopt begin` -> `route: 'upgrade'`;
//      `compare` against a snapshot taken before them -> unchanged.
//  17. Checker negatives: an extra fixture commit on aoforge/adopt -> `one_commit` false, exit 1;
//      an untracked file -> `tree_clean` false; a second AOFORGE block -> `claude_block_versioned`
//      false.
//  18. `snapshot` then `compare` with no change -> exit 0; after touching one file -> exit 1 and
//      the file is named.

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
  writeMappedDocs,
  writeProjectMd,
  writeInferences,
} = require('./__fixtures__/adopt-fixtures.cjs');

const managedBlock = require('./managed-block.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'aof-tools.cjs');
const CHECKER_PATH = path.join(__dirname, '__fixtures__', 'adopt-e2e-assert.cjs');

const KIND_FOR = { 'go-service': 'api', 'flutter-app': 'app', 'node-cli': 'cli' };
const NAME_FOR = { 'go-service': 'Orders Service', 'flutter-app': 'Habit Tracker', 'node-cli': 'Todo CLI' };

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
  const r = run(['--cwd', fixture, 'adopt', sub, ...extraArgs], mkdtemp('df-e2e-spawn-'), gitEnv(fakeHome));
  let report = null;
  try { report = JSON.parse(r.stdout); } catch { /* left null on parse failure */ }
  return { ...r, report };
}

function runChecker(args, cwd) {
  const r = spawnSync(process.execPath, [CHECKER_PATH, ...args], {
    cwd: cwd || mkdtemp('df-e2e-checker-'), encoding: 'utf-8', timeout: 30000,
  });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* left null on parse failure */ }
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', out: (r.stdout || '') + (r.stderr || ''), json };
}

/**
 * runFullPipeline(kind, {prewriteClaudeBlock}) -> adopted + committed fixture root.
 *
 * preflight -> begin -> skill-active start -> stand-in maps (writeMappedDocs, writeProjectMd)
 * -> [pre-write a CLAUDE.md block, flutter-app only] -> inferences -> scaffold -> report ->
 * skill-active end -> `aof-tools commit --files <commit_files>`.
 */
function runFullPipeline(kind, { prewriteClaudeBlock = false } = {}) {
  const env = gitEnv(fakeHome);
  const root = makeFixture(kind, { parent: mkdtemp('df-e2e-parent-'), home: fakeHome });

  let r = runAdopt(root, 'preflight');
  assert.strictEqual(r.status, 0, r.out);

  r = runAdopt(root, 'begin');
  assert.strictEqual(r.status, 0, r.out);

  const skStart = run(['--cwd', root, 'skill-active', '--start', 'adopt'], mkdtemp('df-e2e-spawn-'), env);
  assert.strictEqual(skStart.status, 0, skStart.out);

  writeMappedDocs(root);
  writeProjectMd(root, { name: NAME_FOR[kind], kind: KIND_FOR[kind], defaultWork: 'feature' });

  if (prewriteClaudeBlock) {
    const claudePath = path.join(root, 'CLAUDE.md');
    const existing = fs.existsSync(claudePath) ? fs.readFileSync(claudePath, 'utf-8') : '';
    const withBlock = managedBlock.upsert(
      existing,
      '## AOForge\n\nMapped by /aoforge:map-codebase.\n',
      { v: 2, src: 'claude-md' },
      { position: 'prepend' },
    );
    fs.writeFileSync(claudePath, withBlock, 'utf-8');
  }

  writeInferences(root, [
    { field: 'kind', value: KIND_FOR[kind], confidence: 'high', evidence: 'fixture manifest' },
    { field: 'default_work', value: 'feature', confidence: 'low', evidence: 'no roadmap history' },
    { field: 'validated:Core flow', value: 'present', confidence: 'medium', evidence: 'fixture source scan' },
  ]);

  r = runAdopt(root, 'scaffold');
  assert.strictEqual(r.status, 0, r.out);

  r = runAdopt(root, 'report');
  assert.strictEqual(r.status, 0, r.out);
  const commitFiles = r.report.commit_files;
  const commitMessage = r.report.commit_message;
  assert.ok(Array.isArray(commitFiles) && commitFiles.length > 0, r.out);

  const skEnd = run(['--cwd', root, 'skill-active', '--end'], mkdtemp('df-e2e-spawn-'), env);
  assert.strictEqual(skEnd.status, 0, skEnd.out);

  const commitResult = run(['--cwd', root, 'commit', commitMessage, '--files', ...commitFiles], mkdtemp('df-e2e-spawn-'), env);
  assert.strictEqual(commitResult.status, 0, commitResult.out);

  return root;
}

beforeEach(() => {
  spawnedTmpRoots = [];
  fakeHome = makeFakeHome();
});

afterEach(() => {
  for (const dir of spawnedTmpRoots) fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(fakeHome, { recursive: true, force: true });
});

describe('adopt E2E structural checker', () => {
  for (const kind of ['go-service', 'flutter-app', 'node-cli']) {
    test(`15. full pipeline on ${kind} passes every structural check`, () => {
      const root = runFullPipeline(kind, { prewriteClaudeBlock: kind === 'flutter-app' });
      const result = runChecker(['check', root, '--home', fakeHome]);
      assert.strictEqual(result.status, 0, result.out);
      assert.ok(result.json && result.json.ok === true, JSON.stringify(result.json, null, 2));
      for (const c of result.json.checks) {
        assert.strictEqual(c.ok, true, `${c.id}: ${c.detail}`);
      }
    });
  }

  test('16. after the pipeline, preflight/begin route to upgrade and write nothing', () => {
    const root = runFullPipeline('go-service');
    const snapFile = path.join(mkdtemp('df-e2e-snap-'), 'before.json');
    const snap = runChecker(['snapshot', root, '--out', snapFile]);
    assert.strictEqual(snap.status, 0, snap.out);

    const pf = runAdopt(root, 'preflight');
    assert.strictEqual(pf.status, 0, pf.out);
    assert.strictEqual(pf.report.route, 'upgrade', pf.out);

    const bg = runAdopt(root, 'begin');
    assert.strictEqual(bg.status, 0, bg.out);
    assert.strictEqual(bg.report.route, 'upgrade', bg.out);

    const cmp = runChecker(['compare', root, '--before', snapFile]);
    assert.strictEqual(cmp.status, 0, cmp.out);
    assert.strictEqual(cmp.json.ok, true, JSON.stringify(cmp.json));
  });

  test('17. checker negatives: extra commit, untracked file, second AOFORGE block', () => {
    const env = gitEnv(fakeHome);

    // (a) an extra fixture commit on aoforge/adopt -> one_commit false
    const rootA = runFullPipeline('node-cli');
    fs.writeFileSync(path.join(rootA, 'EXTRA.md'), 'extra work\n', 'utf-8');
    execFileSync('git', ['-C', rootA, 'add', '-A'], { env });
    execFileSync('git', ['-C', rootA, 'commit', '-m', 'extra commit'], { env });
    const resA = runChecker(['check', rootA, '--home', fakeHome]);
    assert.strictEqual(resA.status, 1, resA.out);
    const oneCommit = resA.json.checks.find((c) => c.id === 'one_commit');
    assert.strictEqual(oneCommit.ok, false, JSON.stringify(oneCommit));

    // (b) an untracked file -> tree_clean false
    const rootB = runFullPipeline('node-cli');
    fs.writeFileSync(path.join(rootB, 'untracked.txt'), 'oops\n', 'utf-8');
    const resB = runChecker(['check', rootB, '--home', fakeHome]);
    assert.strictEqual(resB.status, 1, resB.out);
    const treeClean = resB.json.checks.find((c) => c.id === 'tree_clean');
    assert.strictEqual(treeClean.ok, false, JSON.stringify(treeClean));

    // (c) a second AOFORGE block -> claude_block_versioned false
    const rootC = runFullPipeline('node-cli');
    const claudePath = path.join(rootC, 'CLAUDE.md');
    const existing = fs.readFileSync(claudePath, 'utf-8');
    const duplicateBlock = managedBlock.upsert('', '## Duplicate\n\nSecond block.\n', { v: 1, src: 'claude-md' }, { position: 'prepend' });
    fs.writeFileSync(claudePath, existing + '\n' + duplicateBlock, 'utf-8');
    const resC = runChecker(['check', rootC, '--home', fakeHome]);
    assert.strictEqual(resC.status, 1, resC.out);
    const claudeVersioned = resC.json.checks.find((c) => c.id === 'claude_block_versioned');
    assert.strictEqual(claudeVersioned.ok, false, JSON.stringify(claudeVersioned));
  });

  test('18. snapshot then compare — clean is exit 0, one touched file is exit 1 and named', () => {
    const root = runFullPipeline('node-cli');
    const snapFile = path.join(mkdtemp('df-e2e-snap-'), 'before.json');
    const snap = runChecker(['snapshot', root, '--out', snapFile]);
    assert.strictEqual(snap.status, 0, snap.out);

    let cmp = runChecker(['compare', root, '--before', snapFile]);
    assert.strictEqual(cmp.status, 0, cmp.out);
    assert.deepStrictEqual(cmp.json.changed, []);

    fs.appendFileSync(path.join(root, 'README.md'), '\nTouched.\n', 'utf-8');
    cmp = runChecker(['compare', root, '--before', snapFile]);
    assert.strictEqual(cmp.status, 1, cmp.out);
    assert.ok(cmp.json.changed.includes('README.md'), JSON.stringify(cmp.json));
  });
});
