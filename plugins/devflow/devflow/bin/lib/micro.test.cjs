'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  startMicro,
  commitMicro,
  abortMicro,
  _resetMocks,
} = require('./micro.cjs');

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function mkAmbient() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'micro-'));
  fs.mkdirSync(path.join(root, '.planning'));
  return { root, planningDir: path.join(root, '.planning') };
}

function mkGitAmbient() {
  const env = mkAmbient();
  // Init git repo
  spawnSync('git', ['init', '-q'], { cwd: env.root });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: env.root });
  spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: env.root });
  // Create an initial commit so HEAD exists
  fs.writeFileSync(path.join(env.root, 'README.md'), '# test\n');
  spawnSync('git', ['add', 'README.md'], { cwd: env.root, env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' } });
  spawnSync('git', ['commit', '-m', 'chore: initial'], { cwd: env.root, env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' } });
  // Write a minimal STATE.md with 5-column Quick Tasks Completed table
  const stateMd5col = `# DevFlow State\n\n## Quick Tasks Completed\n\n| # | Description | Date | Commit | Directory |\n|---|---|---|---|---|\n`;
  fs.writeFileSync(path.join(env.root, '.planning', 'STATE.md'), stateMd5col, 'utf8');
  return env;
}

function mkGitAmbient6col() {
  const env = mkGitAmbient();
  // Overwrite STATE.md with 6-column (Status column present)
  const stateMd6col = `# DevFlow State\n\n## Quick Tasks Completed\n\n| # | Description | Date | Commit | Directory | Status |\n|---|---|---|---|---|---|\n`;
  fs.writeFileSync(path.join(env.root, '.planning', 'STATE.md'), stateMd6col, 'utf8');
  return env;
}

// ─── startMicro ───────────────────────────────────────────────────────────────

describe('startMicro', () => {
  let env;
  beforeEach(() => { env = mkAmbient(); });
  afterEach(() => {
    fs.rmSync(env.root, { recursive: true, force: true });
    _resetMocks();
  });

  // Test 1: happy path — returns ok:true with next_num, slug, task_dir, marker
  test('happy: returns ok:true with next_num, slug, task_dir, marker and writes .skill-active', () => {
    const result = startMicro({
      planningDir: env.planningDir,
      description: 'fix typo in readme',
      pid: 1234,
      now: '2026-05-06T00:00:00Z',
    });
    assert.equal(result.ok, true);
    assert.ok(typeof result.next_num === 'number');
    assert.ok(typeof result.slug === 'string');
    assert.ok(typeof result.task_dir === 'string');
    assert.ok(result.marker);
    // marker should have skill = 'micro'
    const markerPath = path.join(env.planningDir, '.skill-active');
    assert.equal(fs.existsSync(markerPath), true);
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    assert.equal(marker.skill, 'micro');
  });

  // Test 2: edge — empty description → ok:false, reason:missing-description
  test('edge: empty description returns ok:false with reason missing-description', () => {
    const result = startMicro({
      planningDir: env.planningDir,
      description: '',
      pid: 1,
      now: '2026-05-06T00:00:00Z',
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'missing-description');
  });

  // Test 3: edge — whitespace-only description → ok:false, reason:missing-description
  test('edge: whitespace-only description returns ok:false with reason missing-description', () => {
    const result = startMicro({
      planningDir: env.planningDir,
      description: '   ',
      pid: 1,
      now: '2026-05-06T00:00:00Z',
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'missing-description');
  });

  // Test 4: edge — planningDir null → ok:false, reason:no-planning-dir
  test('edge: planningDir null returns ok:false with reason no-planning-dir', () => {
    const result = startMicro({
      planningDir: null,
      description: 'rename foo to bar',
      pid: 1,
      now: '2026-05-06T00:00:00Z',
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no-planning-dir');
  });

  // Test 5: edge — pre-existing marker is overwritten (last-write-wins)
  test('edge: pre-existing marker is overwritten (last-write-wins)', () => {
    // Write a marker for a different skill
    const markerPath = path.join(env.planningDir, '.skill-active');
    fs.writeFileSync(markerPath, JSON.stringify({ skill: 'build', started_at: 'x', pid: 1 }), 'utf8');
    const result = startMicro({
      planningDir: env.planningDir,
      description: 'fix typo in readme',
      pid: 2,
      now: '2026-05-06T01:00:00Z',
    });
    assert.equal(result.ok, true);
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    assert.equal(marker.skill, 'micro');
  });

  // Test 6: edge — existing .planning/quick dirs raise next_num correctly
  test('edge: existing .planning/quick/0042-foo dir makes next_num === 43', () => {
    fs.mkdirSync(path.join(env.planningDir, 'quick', '0042-foo'), { recursive: true });
    const result = startMicro({
      planningDir: env.planningDir,
      description: 'add missing semicolon',
      pid: 1,
      now: '2026-05-06T00:00:00Z',
    });
    assert.equal(result.ok, true);
    assert.equal(result.next_num, 43);
  });

  // Test 7: edge — description with special chars produces slug ≤40 chars lowercase-hyphen
  test('edge: description with special chars produces slug that is lowercase-hyphen and ≤40 chars', () => {
    const result = startMicro({
      planningDir: env.planningDir,
      description: 'Fix typo: Rename "foo" → "bar" (important!)',
      pid: 1,
      now: '2026-05-06T00:00:00Z',
    });
    assert.equal(result.ok, true);
    assert.match(result.slug, /^[a-z0-9-]+$/);
    assert.ok(result.slug.length <= 40, `slug length ${result.slug.length} exceeds 40 chars`);
  });
});

// ─── startMicro: placeholder dir (F2) ────────────────────────────────────────

describe('startMicro: placeholder dir (F2)', () => {
  let env;
  beforeEach(() => { env = mkAmbient(); });
  afterEach(() => {
    fs.rmSync(env.root, { recursive: true, force: true });
    _resetMocks();
  });

  // Test list F2-1: startMicro creates placeholder dir on disk
  test('F2-1 happy: startMicro creates .planning/quick/<N>-<slug>/ on disk', () => {
    const result = startMicro({
      planningDir: env.planningDir,
      description: 'fix x',
      pid: 1,
      now: '2026-05-08T00:00:00Z',
    });
    assert.equal(result.ok, true);
    const expectedDir = path.join(env.planningDir, 'quick', `${result.next_num}-${result.slug}`);
    assert.equal(fs.existsSync(expectedDir), true, `expected dir to exist at ${expectedDir}`);
    assert.equal(fs.statSync(expectedDir).isDirectory(), true);
  });

  // Test list F2-3: consecutive starts get distinct N values (collision-free)
  test('F2-3 happy: consecutive starts allocate distinct N (no collision with init quick scan)', () => {
    const first = startMicro({
      planningDir: env.planningDir,
      description: 'first task',
      pid: 1,
      now: '2026-05-08T00:00:00Z',
    });
    assert.equal(first.ok, true);
    const second = startMicro({
      planningDir: env.planningDir,
      description: 'second task',
      pid: 2,
      now: '2026-05-08T00:01:00Z',
    });
    assert.equal(second.ok, true);
    // Distinct N — second must be one higher than first because first's dir is on disk
    assert.equal(second.next_num, first.next_num + 1,
      `expected second.next_num=${first.next_num + 1}, got ${second.next_num} (collision with first)`);
  });
});

// ─── commitMicro ─────────────────────────────────────────────────────────────

describe('commitMicro', () => {
  let env;
  beforeEach(() => {
    env = mkGitAmbient();
    process.env.DEVFLOW_ALLOW_RAW_COMMIT = '1';
  });
  afterEach(() => {
    fs.rmSync(env.root, { recursive: true, force: true });
    delete process.env.DEVFLOW_ALLOW_RAW_COMMIT;
    _resetMocks();
  });

  // Test 8: happy — commits chore(micro): {description}, removes marker, appends STATE.md row
  test('happy: commits with chore(micro): message, removes marker, appends STATE.md row', () => {
    // First start a micro task to set the marker
    startMicro({ planningDir: env.planningDir, description: 'fix typo in readme', pid: 1, now: '2026-05-06T00:00:00Z' });
    // Create a file to commit
    fs.writeFileSync(path.join(env.root, 'fix.txt'), 'fix\n');
    spawnSync('git', ['add', 'fix.txt'], { cwd: env.root, env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' } });

    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'fix typo in readme',
      files: null,
      now: '2026-05-06T00:01:00Z',
      gitRunner: null,
    });
    assert.equal(result.ok, true, `expected ok:true, got reason: ${result.reason}`);
    assert.ok(result.commit_hash, 'expected commit_hash');
    assert.equal(result.removed_marker, true);
    // marker should be gone
    assert.equal(fs.existsSync(path.join(env.planningDir, '.skill-active')), false);
    // STATE.md should have an appended row
    const stateMd = fs.readFileSync(path.join(env.planningDir, 'STATE.md'), 'utf8');
    assert.ok(stateMd.includes('fix typo in readme'), 'STATE.md should contain task description');
  });

  // Test 9: happy with files array — only that subset is staged.
  // After F1 fix: gitRunner called TWICE — once with files arg, once with .planning/STATE.md.
  test('happy with files: passes files list to gitRunner (called twice — source + STATE.md)', () => {
    startMicro({ planningDir: env.planningDir, description: 'bump dependency version', pid: 1, now: '2026-05-06T00:00:00Z' });
    // Create two files, only stage one
    fs.writeFileSync(path.join(env.root, 'a.txt'), 'a\n');
    fs.writeFileSync(path.join(env.root, 'b.txt'), 'b\n');

    const allCalls = [];
    const mockGitRunner = (cwd, opts) => {
      allCalls.push({ cwd, opts });
      // simulate success
      return { exitCode: 0, stdout: 'abc1234', stderr: '' };
    };

    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'bump dependency version',
      files: ['a.txt'],
      now: '2026-05-06T00:01:00Z',
      gitRunner: mockGitRunner,
    });
    // The gitRunner should have been called twice — first with source files, second with STATE.md
    assert.equal(allCalls.length, 2, `expected 2 gitRunner calls (source + STATE.md), got ${allCalls.length}`);
    assert.deepEqual(allCalls[0].opts.files, ['a.txt'], 'first call should pass source files list');
    assert.deepEqual(allCalls[1].opts.files, ['.planning/STATE.md'], 'second call should stage .planning/STATE.md');
  });

  // Test 10: edge — no active marker → ok:false, reason:no-active-micro
  test('edge: no active marker returns ok:false with reason no-active-micro', () => {
    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'rename foo to bar',
      files: null,
      now: '2026-05-06T00:00:00Z',
      gitRunner: null,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no-active-micro');
  });

  // Test 11: edge — commit fails → ok:false, reason:commit-failed, marker stays
  test('edge: gitRunner failure returns ok:false, reason commit-failed, marker stays', () => {
    startMicro({ planningDir: env.planningDir, description: 'fix typo in readme', pid: 1, now: '2026-05-06T00:00:00Z' });

    const failingGitRunner = () => ({ exitCode: 1, stdout: '', stderr: 'nothing to commit' });

    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'fix typo in readme',
      files: null,
      now: '2026-05-06T00:01:00Z',
      gitRunner: failingGitRunner,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'commit-failed');
    assert.equal(result.removed_marker, false);
    // marker must still be present
    assert.equal(fs.existsSync(path.join(env.planningDir, '.skill-active')), true);
  });

  // Test 12: edge — STATE.md missing → ok:false, reason:no-state-file
  test('edge: STATE.md missing returns ok:false with reason no-state-file', () => {
    fs.unlinkSync(path.join(env.planningDir, 'STATE.md'));
    startMicro({ planningDir: env.planningDir, description: 'add missing semicolon', pid: 1, now: '2026-05-06T00:00:00Z' });

    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'add missing semicolon',
      files: null,
      now: '2026-05-06T00:01:00Z',
      gitRunner: null,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no-state-file');
  });

  // Test 13: edge — STATE.md has no Quick Tasks section → creates 5-col section
  test('edge: STATE.md with no Quick Tasks section creates 5-col section on commit', () => {
    // Overwrite STATE.md with no Quick Tasks section
    fs.writeFileSync(path.join(env.planningDir, 'STATE.md'), '# DevFlow State\n\nSome content.\n', 'utf8');
    startMicro({ planningDir: env.planningDir, description: 'fix typo in readme', pid: 1, now: '2026-05-06T00:00:00Z' });
    fs.writeFileSync(path.join(env.root, 'fix2.txt'), 'fix\n');
    spawnSync('git', ['add', 'fix2.txt'], { cwd: env.root, env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' } });

    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'fix typo in readme',
      files: null,
      now: '2026-05-06T00:01:00Z',
      gitRunner: null,
    });
    assert.equal(result.ok, true, `expected ok:true, got ${result.reason}`);
    const stateMd = fs.readFileSync(path.join(env.planningDir, 'STATE.md'), 'utf8');
    assert.ok(stateMd.includes('Quick Tasks Completed'), 'should have created the section');
    // 5-col shape — no Status column header
    const lines = stateMd.split('\n');
    const headerLine = lines.find(l => l.includes('# |') || l.includes('Description'));
    assert.ok(headerLine, 'should have a table header line');
    assert.ok(!headerLine.includes('Status'), 'created section should NOT have Status column');
  });

  // Test 14: edge — STATE.md with 6-col table appends row with Status='Atomic'
  test('edge: STATE.md with 6-col Status table appends row with Status=Atomic', () => {
    // Rebuild env with 6-col STATE.md
    fs.rmSync(env.root, { recursive: true, force: true });
    env = mkGitAmbient6col();
    process.env.DEVFLOW_ALLOW_RAW_COMMIT = '1';

    startMicro({ planningDir: env.planningDir, description: 'rename foo to bar', pid: 1, now: '2026-05-06T00:00:00Z' });
    fs.writeFileSync(path.join(env.root, 'fix3.txt'), 'fix\n');
    spawnSync('git', ['add', 'fix3.txt'], { cwd: env.root, env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' } });

    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'rename foo to bar',
      files: null,
      now: '2026-05-06T00:01:00Z',
      gitRunner: null,
    });
    assert.equal(result.ok, true, `expected ok:true, got ${result.reason}`);
    const stateMd = fs.readFileSync(path.join(env.planningDir, 'STATE.md'), 'utf8');
    assert.ok(stateMd.includes('Atomic'), 'should contain Status=Atomic in appended row');
  });
});

// ─── commitMicro: atomic STATE.md (F1) ───────────────────────────────────────

describe('commitMicro: atomic STATE.md (F1)', () => {
  let env;
  beforeEach(() => {
    env = mkGitAmbient();
    process.env.DEVFLOW_ALLOW_RAW_COMMIT = '1';
  });
  afterEach(() => {
    fs.rmSync(env.root, { recursive: true, force: true });
    delete process.env.DEVFLOW_ALLOW_RAW_COMMIT;
    _resetMocks();
  });

  // Test list F1-6 (THE bug): after commitMicro returns ok, working tree is clean
  test('F1-6 happy: working tree is clean after commitMicro returns ok (no M .planning/STATE.md)', () => {
    startMicro({ planningDir: env.planningDir, description: 'fix typo in readme', pid: 1, now: '2026-05-06T00:00:00Z' });
    fs.writeFileSync(path.join(env.root, 'fix.txt'), 'fix\n');
    spawnSync('git', ['add', 'fix.txt'], { cwd: env.root, env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' } });

    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'fix typo in readme',
      files: null,
      now: '2026-05-06T00:01:00Z',
      gitRunner: null,
    });
    assert.equal(result.ok, true, `expected ok:true, got reason: ${result.reason}`);

    // Working tree should be clean — NO `M .planning/STATE.md`
    const statusProc = spawnSync('git', ['status', '--porcelain'], {
      cwd: env.root,
      encoding: 'utf8',
    });
    assert.equal(statusProc.stdout.trim(), '',
      `expected clean tree, got: ${JSON.stringify(statusProc.stdout)}`);
  });

  // No-sweep contract: with no --files, commit never stages UNTRACKED files. A
  // `git add .` fallback once pushed a user's unrelated untracked drafts to a PR.
  function headFiles(root) {
    return spawnSync('git', ['show', '--name-only', '--format=', 'HEAD~1'], { cwd: root, encoding: 'utf8' })
      .stdout.trim().split('\n').filter(Boolean);
  }

  test('NS-1: with a staged fix, an unrelated untracked file is NOT committed', () => {
    startMicro({ planningDir: env.planningDir, description: 'fix typo', pid: 1, now: '2026-05-06T00:00:00Z' });
    fs.writeFileSync(path.join(env.root, 'fix.txt'), 'fix\n');
    fs.writeFileSync(path.join(env.root, 'draft-proposal.md'), 'unrelated\n');
    spawnSync('git', ['add', 'fix.txt'], { cwd: env.root, env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' } });

    const result = commitMicro({ planningDir: env.planningDir, description: 'fix typo', files: null, now: '2026-05-06T00:01:00Z', gitRunner: null });
    assert.equal(result.ok, true, `expected ok:true, got: ${result.message}`);
    assert.deepEqual(headFiles(env.root), ['fix.txt'], 'the source commit holds exactly what was staged');
    const status = spawnSync('git', ['status', '--porcelain'], { cwd: env.root, encoding: 'utf8' }).stdout;
    assert.match(status, /^\?\? draft-proposal\.md$/m, `the draft must still be untracked; status: ${status}`);
  });

  test('NS-2: nothing staged → tracked modifications are committed, untracked files are not', () => {
    startMicro({ planningDir: env.planningDir, description: 'fix readme', pid: 1, now: '2026-05-06T00:00:00Z' });
    fs.writeFileSync(path.join(env.root, 'README.md'), '# test, fixed\n');
    fs.writeFileSync(path.join(env.root, 'draft-proposal.md'), 'unrelated\n');

    const result = commitMicro({ planningDir: env.planningDir, description: 'fix readme', files: null, now: '2026-05-06T00:01:00Z', gitRunner: null });
    assert.equal(result.ok, true, `expected ok:true, got: ${result.message}`);
    assert.deepEqual(headFiles(env.root), ['README.md']);
    const status = spawnSync('git', ['status', '--porcelain'], { cwd: env.root, encoding: 'utf8' }).stdout;
    assert.match(status, /^\?\? draft-proposal\.md$/m, `the draft must still be untracked; status: ${status}`);
  });

  test('NS-3: only untracked files present → refuses, names --files, commits nothing', () => {
    startMicro({ planningDir: env.planningDir, description: 'add file', pid: 1, now: '2026-05-06T00:00:00Z' });
    fs.writeFileSync(path.join(env.root, 'new.txt'), 'new\n');
    const before = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: env.root, encoding: 'utf8' }).stdout;

    const result = commitMicro({ planningDir: env.planningDir, description: 'add file', files: null, now: '2026-05-06T00:01:00Z', gitRunner: null });
    assert.equal(result.ok, false);
    assert.match(result.message, /--files/, `must tell the caller how to include a new file; got: ${result.message}`);
    assert.equal(spawnSync('git', ['rev-parse', 'HEAD'], { cwd: env.root, encoding: 'utf8' }).stdout, before);
  });

  // Test list F1-7: two commits — `chore(micro): record STATE.md row for ...` then `chore(micro): ...`
  test('F1-7 happy: produces two atomic commits — source then STATE.md row', () => {
    startMicro({ planningDir: env.planningDir, description: 'fix typo in readme', pid: 1, now: '2026-05-06T00:00:00Z' });
    fs.writeFileSync(path.join(env.root, 'fix.txt'), 'fix\n');
    spawnSync('git', ['add', 'fix.txt'], { cwd: env.root, env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' } });

    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'fix typo in readme',
      files: null,
      now: '2026-05-06T00:01:00Z',
      gitRunner: null,
    });
    assert.equal(result.ok, true, `expected ok:true, got reason: ${result.reason}`);

    // Get last 2 commit messages, newest first
    const logProc = spawnSync('git', ['log', '--format=%s', '-2'], {
      cwd: env.root,
      encoding: 'utf8',
    });
    const messages = logProc.stdout.trim().split('\n');
    assert.equal(messages.length, 2, `expected 2 commit messages, got: ${JSON.stringify(messages)}`);
    // Newest (HEAD) is the STATE.md commit
    assert.equal(messages[0], 'chore(micro): record STATE.md row for fix typo in readme',
      `HEAD message wrong: ${messages[0]}`);
    // HEAD~1 is the source commit
    assert.equal(messages[1], 'chore(micro): fix typo in readme',
      `HEAD~1 message wrong: ${messages[1]}`);
  });

  // Test list F1-8: STATE.md row records SOURCE commit hash (HEAD~1), not STATE.md commit hash (HEAD)
  test('F1-8 happy: STATE.md row records SOURCE commit hash (HEAD~1), not STATE.md commit hash', () => {
    startMicro({ planningDir: env.planningDir, description: 'fix typo in readme', pid: 1, now: '2026-05-06T00:00:00Z' });
    fs.writeFileSync(path.join(env.root, 'fix.txt'), 'fix\n');
    spawnSync('git', ['add', 'fix.txt'], { cwd: env.root, env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' } });

    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'fix typo in readme',
      files: null,
      now: '2026-05-06T00:01:00Z',
      gitRunner: null,
    });
    assert.equal(result.ok, true, `expected ok:true, got reason: ${result.reason}`);

    // Resolve HEAD~1 (source commit hash)
    const sourceHashProc = spawnSync('git', ['rev-parse', '--short', 'HEAD~1'], {
      cwd: env.root,
      encoding: 'utf8',
    });
    const sourceHash = sourceHashProc.stdout.trim();
    assert.ok(sourceHash, 'expected to resolve HEAD~1');

    const stateMd = fs.readFileSync(path.join(env.planningDir, 'STATE.md'), 'utf8');
    assert.ok(stateMd.includes(sourceHash),
      `expected STATE.md to contain source hash ${sourceHash}, got STATE.md content:\n${stateMd}`);
  });

  // Test list F1-9: return shape includes both commit_hash and state_commit_hash
  test('F1-9 happy: return shape includes commit_hash AND state_commit_hash', () => {
    startMicro({ planningDir: env.planningDir, description: 'fix typo in readme', pid: 1, now: '2026-05-06T00:00:00Z' });
    fs.writeFileSync(path.join(env.root, 'fix.txt'), 'fix\n');
    spawnSync('git', ['add', 'fix.txt'], { cwd: env.root, env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' } });

    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'fix typo in readme',
      files: null,
      now: '2026-05-06T00:01:00Z',
      gitRunner: null,
    });
    assert.equal(result.ok, true, `expected ok:true, got reason: ${result.reason}`);
    assert.ok(result.commit_hash, 'expected commit_hash (source)');
    assert.ok(result.state_commit_hash, 'expected state_commit_hash');
    assert.notEqual(result.commit_hash, result.state_commit_hash,
      'commit_hash and state_commit_hash should be distinct');
  });

  // Test list F1-10 (graceful degradation): if second commit (STATE.md) fails,
  // first commit still landed, marker still removed, ok:true with state_commit_hash:null
  test('F1-10 edge: STATE.md commit failure → ok:true, commit_hash set, state_commit_hash:null, marker removed', () => {
    startMicro({ planningDir: env.planningDir, description: 'fix typo in readme', pid: 1, now: '2026-05-06T00:00:00Z' });
    fs.writeFileSync(path.join(env.root, 'fix.txt'), 'fix\n');

    let callIdx = 0;
    const stderrChunks = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => { stderrChunks.push(String(chunk)); return true; };

    let result;
    try {
      // Mock runner: first call (source) succeeds; second call (STATE.md) fails
      const mockGitRunner = (cwd, opts) => {
        callIdx += 1;
        if (callIdx === 1) {
          // Real source commit — actually do it so HEAD advances
          const r = spawnSync('git', ['add', 'fix.txt'], {
            cwd, encoding: 'utf8',
            env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' },
          });
          if (r.status !== 0) return { exitCode: 1, stdout: '', stderr: r.stderr || '' };
          const c = spawnSync('git', ['commit', '-m', opts.message], {
            cwd, encoding: 'utf8',
            env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' },
          });
          return {
            exitCode: c.status ?? 1,
            stdout: (c.stdout || '').trim(),
            stderr: (c.stderr || '').trim(),
          };
        }
        // Second call — simulated failure
        return { exitCode: 1, stdout: '', stderr: 'simulated STATE.md commit failure' };
      };

      result = commitMicro({
        planningDir: env.planningDir,
        description: 'fix typo in readme',
        files: null,
        now: '2026-05-06T00:01:00Z',
        gitRunner: mockGitRunner,
      });
    } finally {
      process.stderr.write = origWrite;
    }

    assert.equal(result.ok, true, `expected ok:true even with STATE.md commit failure, got: ${JSON.stringify(result)}`);
    assert.ok(result.commit_hash, 'commit_hash should be set (source landed)');
    assert.equal(result.state_commit_hash, null, 'state_commit_hash should be null on failure');
    assert.equal(result.removed_marker, true, 'marker should still be removed');
    assert.equal(fs.existsSync(path.join(env.planningDir, '.skill-active')), false,
      'marker file must not exist on disk');
    // Warning emitted to stderr
    const stderrAll = stderrChunks.join('');
    assert.ok(stderrAll.includes('STATE.md'),
      `expected stderr warning mentioning STATE.md, got: ${JSON.stringify(stderrAll)}`);
  });
});

// ─── commitMicro: --files scopes the commit (#120) ───────────────────────────
//
// `micro commit --files <paths>` once staged the named paths and then ran a
// whole-index `git commit`, so anything the user had already staged rode along
// into the micro's commit (and into the STATE.md follow-up commit). With an
// explicit list, both commits must be pathspec-limited to exactly those paths.

describe('commitMicro: --files scopes the commit (#120)', () => {
  let env;
  const git = (root, ...args) => spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' },
  });
  // No .trim() before splitting: it would eat the leading space of ` D` / ` M` lines.
  const lines = (s) => s.split('\n').filter(Boolean);

  // Both files tracked and committed, so a later edit to either is a tracked modification.
  function seed(e) {
    fs.writeFileSync(path.join(e.root, 'a.md'), 'a\n');
    fs.writeFileSync(path.join(e.root, 'b.md'), 'b\n');
    git(e.root, 'add', 'a.md', 'b.md');
    git(e.root, 'commit', '-m', 'chore: seed');
  }

  beforeEach(() => {
    env = mkGitAmbient();
    process.env.DEVFLOW_ALLOW_RAW_COMMIT = '1';
  });
  afterEach(() => {
    fs.rmSync(env.root, { recursive: true, force: true });
    delete process.env.DEVFLOW_ALLOW_RAW_COMMIT;
    _resetMocks();
  });

  test('FS-1: --files b.md leaves an unrelated staged a.md staged and out of both commits', () => {
    seed(env);
    startMicro({ planningDir: env.planningDir, description: 'edit b', pid: 1, now: '2026-05-06T00:00:00Z' });
    fs.writeFileSync(path.join(env.root, 'a.md'), 'a staged\n');
    git(env.root, 'add', 'a.md');
    fs.writeFileSync(path.join(env.root, 'b.md'), 'b changed\n');

    const result = commitMicro({
      planningDir: env.planningDir, description: 'edit b', files: ['b.md'],
      now: '2026-05-06T00:01:00Z', gitRunner: null,
    });
    assert.equal(result.ok, true, `expected ok:true, got: ${JSON.stringify(result)}`);

    assert.deepEqual(lines(git(env.root, 'show', '--name-only', '--format=', 'HEAD~1').stdout), ['b.md'],
      'the source commit holds exactly the named path');
    assert.deepEqual(lines(git(env.root, 'show', '--name-only', '--format=', 'HEAD').stdout), ['.planning/STATE.md'],
      'the STATE.md follow-up commit holds only STATE.md');
    assert.deepEqual(lines(git(env.root, 'diff', '--cached', '--name-only').stdout), ['a.md'],
      'the unrelated staged file is still staged');
    assert.equal(git(env.root, 'show', ':a.md').stdout, 'a staged\n',
      'its staged content is untouched');
  });

  test('FS-2: --files new.txt commits a path that was untracked until the runner staged it', () => {
    seed(env);
    startMicro({ planningDir: env.planningDir, description: 'add new', pid: 1, now: '2026-05-06T00:00:00Z' });
    fs.writeFileSync(path.join(env.root, 'a.md'), 'a staged\n');
    git(env.root, 'add', 'a.md');
    fs.writeFileSync(path.join(env.root, 'new.txt'), 'new\n');

    const result = commitMicro({
      planningDir: env.planningDir, description: 'add new', files: ['new.txt'],
      now: '2026-05-06T00:01:00Z', gitRunner: null,
    });
    assert.equal(result.ok, true, `expected ok:true, got: ${JSON.stringify(result)}`);

    assert.deepEqual(lines(git(env.root, 'show', '--name-only', '--format=', 'HEAD~1').stdout), ['new.txt']);
    assert.deepEqual(lines(git(env.root, 'diff', '--cached', '--name-only').stdout), ['a.md'],
      'a.md is still the only staged path');
  });

  test('FS-3: a tracked .skill-active deleted by endSkill is recorded in the STATE.md commit, a.md stays staged', () => {
    seed(env);
    startMicro({ planningDir: env.planningDir, description: 'edit b', pid: 1, now: '2026-05-06T00:00:00Z' });
    git(env.root, 'add', '.planning/.skill-active');
    git(env.root, 'commit', '-m', 'chore: track marker');
    fs.writeFileSync(path.join(env.root, 'a.md'), 'a staged\n');
    git(env.root, 'add', 'a.md');
    fs.writeFileSync(path.join(env.root, 'b.md'), 'b changed\n');

    const result = commitMicro({
      planningDir: env.planningDir, description: 'edit b', files: ['b.md'],
      now: '2026-05-06T00:01:00Z', gitRunner: null,
    });
    assert.equal(result.ok, true, `expected ok:true, got: ${JSON.stringify(result)}`);

    assert.deepEqual(lines(git(env.root, 'show', '--name-only', '--format=', 'HEAD~1').stdout), ['b.md']);
    const stateCommit = lines(git(env.root, 'show', '--name-status', '--format=', 'HEAD').stdout);
    assert.ok(stateCommit.includes('D\t.planning/.skill-active'),
      `the marker deletion must be in the STATE.md commit; got: ${JSON.stringify(stateCommit)}`);
    assert.ok(stateCommit.some((l) => l.endsWith('\t.planning/STATE.md')),
      `STATE.md must be in the STATE.md commit; got: ${JSON.stringify(stateCommit)}`);
    assert.ok(!stateCommit.some((l) => l.endsWith('\ta.md')),
      `a.md must not be in the STATE.md commit; got: ${JSON.stringify(stateCommit)}`);

    const status = lines(git(env.root, 'status', '--porcelain').stdout);
    assert.ok(!status.some((l) => l.includes('.skill-active')),
      `no .skill-active line may linger in the tree; got: ${JSON.stringify(status)}`);
    assert.ok(status.includes('M  a.md'),
      `a.md must still be staged and uncommitted; got: ${JSON.stringify(status)}`);
  });

  test('FS-4: a --files path with no changes fails instead of committing whatever else was staged', () => {
    seed(env);
    startMicro({ planningDir: env.planningDir, description: 'edit b', pid: 1, now: '2026-05-06T00:00:00Z' });
    fs.writeFileSync(path.join(env.root, 'a.md'), 'a staged\n');
    git(env.root, 'add', 'a.md');
    const headBefore = git(env.root, 'rev-parse', 'HEAD').stdout.trim();

    const result = commitMicro({
      planningDir: env.planningDir, description: 'edit b', files: ['b.md'],
      now: '2026-05-06T00:01:00Z', gitRunner: null,
    });
    assert.equal(result.ok, false, 'b.md is unchanged: nothing may be committed');
    assert.equal(result.reason, 'commit-failed');
    assert.equal(git(env.root, 'rev-parse', 'HEAD').stdout.trim(), headBefore, 'HEAD must not move');
    assert.deepEqual(lines(git(env.root, 'diff', '--cached', '--name-only').stdout), ['a.md'],
      'a.md must still be staged');
    assert.ok(fs.existsSync(path.join(env.planningDir, '.skill-active')),
      'the commit-failed path returns before endSkill, so the marker stays');
  });
});

// ─── abortMicro ──────────────────────────────────────────────────────────────

describe('abortMicro', () => {
  let env;
  beforeEach(() => { env = mkAmbient(); });
  afterEach(() => {
    fs.rmSync(env.root, { recursive: true, force: true });
    _resetMocks();
  });

  // Test 15: happy — marker present → removes, returns ok:true, removed:true
  test('happy: marker present → removes marker, returns ok:true removed:true', () => {
    startMicro({ planningDir: env.planningDir, description: 'fix typo in readme', pid: 1, now: '2026-05-06T00:00:00Z' });
    assert.equal(fs.existsSync(path.join(env.planningDir, '.skill-active')), true);
    const result = abortMicro({ planningDir: env.planningDir });
    assert.equal(result.ok, true);
    assert.equal(result.removed, true);
    assert.equal(fs.existsSync(path.join(env.planningDir, '.skill-active')), false);
  });

  // Test 16: happy — marker absent → idempotent ok:true, removed:false
  test('happy: marker absent → idempotent ok:true removed:false', () => {
    const result = abortMicro({ planningDir: env.planningDir });
    assert.equal(result.ok, true);
    assert.equal(result.removed, false);
  });

  // Test 17: edge — planningDir null → ok:false, reason:no-planning-dir
  test('edge: planningDir null returns ok:false with reason no-planning-dir', () => {
    const result = abortMicro({ planningDir: null });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no-planning-dir');
  });

  // Test list F2-2: startMicro then abortMicro removes the placeholder dir from disk
  test('F2-2 happy: abortMicro removes placeholder dir created by startMicro', () => {
    const start = startMicro({
      planningDir: env.planningDir,
      description: 'add missing semicolon',
      pid: 1,
      now: '2026-05-08T00:00:00Z',
    });
    assert.equal(start.ok, true);
    const dir = path.join(env.planningDir, 'quick', `${start.next_num}-${start.slug}`);
    assert.equal(fs.existsSync(dir), true, 'precondition: dir should exist after start');

    // Need .micro-description on disk for abort to find which dir to remove
    // (startMicro already wrote it, but verify)
    const descFile = path.join(env.planningDir, '.micro-description');
    assert.equal(fs.existsSync(descFile), true, 'precondition: .micro-description should exist');

    const result = abortMicro({ planningDir: env.planningDir });
    assert.equal(result.ok, true);
    assert.equal(fs.existsSync(dir), false,
      `expected placeholder dir to be removed after abort, but still exists at ${dir}`);
  });

  // Test list F2-4: abortMicro is idempotent — placeholder dir already gone, no error
  test('F2-4 edge: abortMicro idempotent when placeholder dir already cleaned up', () => {
    const start = startMicro({
      planningDir: env.planningDir,
      description: 'idempotent abort test',
      pid: 1,
      now: '2026-05-08T00:00:00Z',
    });
    assert.equal(start.ok, true);
    const dir = path.join(env.planningDir, 'quick', `${start.next_num}-${start.slug}`);

    // Manually pre-remove the placeholder dir to simulate "already gone"
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(fs.existsSync(dir), false, 'precondition: dir manually pre-removed');

    // abort should still return ok:true without throwing
    const result = abortMicro({ planningDir: env.planningDir });
    assert.equal(result.ok, true, `expected ok:true even when dir already gone, got: ${JSON.stringify(result)}`);
  });
});

// ─── cmdMicro (CLI dispatch) ──────────────────────────────────────────────────

const DF_TOOLS = require.resolve('../df-tools.cjs');

// micro commit now goes through `df-tools commit`, whose store-mode gate honours DEVFLOW_SKIP_GH_GATE. An escape set in
// the ambient environment must never reach a refusal test, so the base env drops it (and its reason) before extraEnv.
const GATE_ENV_VARS = ['DEVFLOW_ALLOW_RAW_COMMIT', 'DEVFLOW_SKIP_GH_GATE', 'DEVFLOW_SKIP_GH_GATE_REASON'];

function cleanGateEnv(base) {
  const env = { ...base };
  for (const key of GATE_ENV_VARS) delete env[key];
  return env;
}

function spawnMicro(cwd, extraArgs, extraEnv) {
  return spawnSync(process.execPath, [DF_TOOLS, 'micro', ...extraArgs], {
    cwd,
    encoding: 'utf8',
    env: { ...cleanGateEnv(process.env), ...extraEnv },
  });
}

describe('cmdMicro (CLI dispatch via spawnSync e2e)', () => {
  let env;
  beforeEach(() => {
    env = mkGitAmbient();
  });
  afterEach(() => {
    fs.rmSync(env.root, { recursive: true, force: true });
  });

  // e2e-1: start → commit round trip
  test('e2e-1: start then commit round-trip; marker created/removed, commit in git log, STATE.md row appended', () => {
    // Start
    const startProc = spawnMicro(env.root, ['start', 'fix typo in readme', '--raw'], { DEVFLOW_ALLOW_RAW_COMMIT: '1' });
    assert.equal(startProc.status, 0, `start failed: ${startProc.stderr}`);
    const startResult = JSON.parse(startProc.stdout);
    assert.equal(startResult.ok, true);
    // marker exists
    assert.equal(fs.existsSync(path.join(env.planningDir, '.skill-active')), true);

    // Stage a file for commit
    fs.writeFileSync(path.join(env.root, 'e2e-fix.txt'), 'e2e fix\n');
    spawnSync('git', ['add', 'e2e-fix.txt'], { cwd: env.root, env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' } });

    // Commit
    const commitProc = spawnMicro(env.root, ['commit', '--raw'], { DEVFLOW_ALLOW_RAW_COMMIT: '1' });
    assert.equal(commitProc.status, 0, `commit failed: ${commitProc.stderr}`);
    const commitResult = JSON.parse(commitProc.stdout);
    assert.equal(commitResult.ok, true);
    assert.equal(commitResult.removed_marker, true);

    // marker gone
    assert.equal(fs.existsSync(path.join(env.planningDir, '.skill-active')), false);

    // commit message in git log
    const logProc = spawnSync('git', ['log', '-1', '--pretty=%s'], { cwd: env.root, encoding: 'utf8' });
    assert.ok(logProc.stdout.trim().startsWith('chore(micro):'), `expected chore(micro): prefix, got: ${logProc.stdout.trim()}`);
    assert.ok(logProc.stdout.includes('fix typo in readme'), `expected description in commit msg: ${logProc.stdout.trim()}`);

    // STATE.md row appended
    const stateMd = fs.readFileSync(path.join(env.planningDir, 'STATE.md'), 'utf8');
    assert.ok(stateMd.includes('fix typo in readme'), 'STATE.md should contain committed task description');
  });

  // e2e-2: outside any .planning/ tree → start exits non-zero with planning dir error in stderr
  test('e2e-2: outside .planning/ tree, start exits non-zero with no-planning-dir in stderr', () => {
    const proc = spawnMicro(os.tmpdir(), ['start', 'x', '--raw'], {});
    assert.notEqual(proc.status, 0, 'expected non-zero exit outside .planning tree');
    // error() writes "Error: <message>" — check for the planning dir error text
    const stderrLower = proc.stderr.toLowerCase();
    assert.ok(
      stderrLower.includes('no-planning-dir') || stderrLower.includes('.planning') || stderrLower.includes('planning'),
      `expected planning-dir error in stderr, got: ${proc.stderr}`
    );
  });

  // dispatch: unknown subcommand exits non-zero
  test('unknown subcommand exits non-zero', () => {
    const proc = spawnMicro(env.root, ['bogus'], {});
    assert.notEqual(proc.status, 0, 'expected non-zero exit for unknown subcommand');
  });
});

// ─── commitMicro: store mode (52-03) ─────────────────────────────────────────
//
// With `github.store` on, STATE.md is a generated view (`df-tools gh pull --all` rebuilds it). micro must not append its
// "Quick Tasks Completed" row there: the append is W055 drift, and the second commit fails once the cache is gitignored.
// Mirrors workflows/quick.md Step 7, which is skipped in store mode.

const planningDrift = require('./planning-drift.cjs');
const { contentHash } = require('./gh-trd.cjs');

/** STATE.md as the store writes it. A generated view must start with GENERATED_HEADER or drift calls it hand-edited. */
const STORE_STATE_MD = `${planningDrift.GENERATED_HEADER}\n# DevFlow State\n\n## Quick Tasks Completed\n\n| # | Description | Date | Commit | Directory |\n|---|---|---|---|---|\n`;

/** mkGitAmbient plus a store-mode `.planning/config.json` and a generated-view STATE.md. */
function mkGitAmbientStore() {
  const env = mkGitAmbient();
  fs.writeFileSync(
    path.join(env.planningDir, 'config.json'),
    JSON.stringify({ github: { enabled: true, store: true } }, null, 2) + '\n',
    'utf8'
  );
  fs.writeFileSync(path.join(env.planningDir, 'STATE.md'), STORE_STATE_MD, 'utf8');
  return env;
}

function gitOut(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

const gm = require('./gh-mapping.cjs');
const fx = require('./__fixtures__/upgrade-fixtures.cjs');

/**
 * Check out a branch that the v3 mapping links to objective 50. micro's default runner now commits through
 * `df-tools commit`, whose store-mode gate (50-06) refuses the default and unlinked branches, so every store-mode test
 * that really commits runs on a linked branch (53-03). The mapping is written after the init commit, untracked.
 */
function linkStoreBranch(env, branch = '50-linked') {
  gitOut(env.root, ['checkout', '-q', '-b', branch]);
  const m = gm.emptyMapping();
  gm.setEntry(m, '50', { issue_id: 500 });
  gm.setPr(m, '50', { branch });
  const w = gm.writeMappingV3(env.root, m);
  assert.equal(w.ok, true, w.error);
}

/** A runner that records its calls and succeeds without touching git. */
function recordingRunner(calls) {
  return (cwd, opts) => {
    calls.push({ cwd, opts });
    return { exitCode: 0, stdout: 'abc1234', stderr: '' };
  };
}

describe('commitMicro: store mode (52-03)', () => {
  let env;
  let stateMdPath;
  beforeEach(() => {
    env = mkGitAmbientStore();
    stateMdPath = path.join(env.planningDir, 'STATE.md');
    process.env.DEVFLOW_ALLOW_RAW_COMMIT = '1';
  });
  afterEach(() => {
    fs.rmSync(env.root, { recursive: true, force: true });
    delete process.env.DEVFLOW_ALLOW_RAW_COMMIT;
    planningDrift._setDriftReaders(null);
    _resetMocks();
  });

  test('SM-0 fixture: the store fixture is in store mode', () => {
    assert.equal(require('./planning-mode.cjs').isStoreMode(env.root), true);
  });

  // 53-03: SM-1 used to run on the default branch. micro now commits through `df-tools commit`, which refuses that in
  // store mode, so SM-1 runs on the objective's linked branch; the refusal cases are in the 53-03 describe below.
  test('SM-1 e2e: micro start then commit --files a.txt makes one commit and leaves STATE.md byte-identical', () => {
    linkStoreBranch(env);
    const before = fs.readFileSync(stateMdPath);

    const startProc = spawnMicro(env.root, ['start', 'fix typo in readme', '--raw'], { DEVFLOW_ALLOW_RAW_COMMIT: '1' });
    assert.equal(startProc.status, 0, `start failed: ${startProc.stderr}`);
    assert.equal(fs.existsSync(path.join(env.planningDir, '.skill-active')), true);

    fs.writeFileSync(path.join(env.root, 'a.txt'), 'a\n');
    const commitProc = spawnMicro(env.root, ['commit', '--files', 'a.txt', '--raw'], { DEVFLOW_ALLOW_RAW_COMMIT: '1' });
    assert.equal(commitProc.status, 0, `commit failed: ${commitProc.stderr}`);
    const result = JSON.parse(commitProc.stdout);
    assert.equal(result.ok, true);
    assert.equal(result.state_commit_hash, null);
    assert.equal(result.state_row, 'skipped_store_mode');
    assert.equal(result.removed_marker, true);

    // Exactly one new commit: HEAD~1 is the initial commit, and HEAD holds only the source file.
    assert.equal(gitOut(env.root, ['rev-list', '--count', 'HEAD']), '2');
    assert.equal(gitOut(env.root, ['log', '-1', '--pretty=%s', 'HEAD~1']), 'chore: initial');
    assert.equal(gitOut(env.root, ['log', '-1', '--pretty=%s']), 'chore(micro): fix typo in readme');
    assert.equal(gitOut(env.root, ['show', '--name-only', '--pretty=format:', 'HEAD']), 'a.txt');

    assert.ok(fs.readFileSync(stateMdPath).equals(before), 'STATE.md must be byte-identical in store mode');
    assert.equal(fs.existsSync(path.join(env.planningDir, '.skill-active')), false, 'marker removed');
    assert.equal(fs.existsSync(path.join(env.planningDir, '.micro-description')), false, 'description file removed');
  });

  test('SM-2: the runner is called once, for the source files, and the result reports the skipped row', () => {
    const before = fs.readFileSync(stateMdPath);
    startMicro({ planningDir: env.planningDir, description: 'bump dependency version', pid: 1, now: '2026-05-06T00:00:00Z' });
    fs.writeFileSync(path.join(env.root, 'a.txt'), 'a\n');

    const calls = [];
    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'bump dependency version',
      files: ['a.txt'],
      now: '2026-05-06T00:01:00Z',
      gitRunner: recordingRunner(calls),
    });

    assert.equal(calls.length, 1, `expected 1 runner call (source only), got ${calls.length}`);
    assert.deepEqual(calls[0].opts.files, ['a.txt']);
    assert.equal(calls[0].opts.message, 'chore(micro): bump dependency version');

    const { commit_hash: commitHash, ...rest } = result;
    assert.match(commitHash, /^[0-9a-f]{7,}$/);
    assert.deepEqual(rest, { ok: true, state_commit_hash: null, state_row: 'skipped_store_mode', removed_marker: true });

    assert.ok(fs.readFileSync(stateMdPath).equals(before), 'STATE.md must be byte-identical in store mode');
    assert.equal(fs.existsSync(path.join(env.planningDir, '.skill-active')), false, 'marker removed');
    assert.equal(fs.existsSync(path.join(env.planningDir, '.micro-description')), false, 'description file removed');
  });

  test('SM-3: a missing STATE.md does not refuse the commit and is not created', () => {
    fs.unlinkSync(stateMdPath);
    startMicro({ planningDir: env.planningDir, description: 'add missing semicolon', pid: 1, now: '2026-05-06T00:00:00Z' });

    const calls = [];
    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'add missing semicolon',
      files: ['a.txt'],
      now: '2026-05-06T00:01:00Z',
      gitRunner: recordingRunner(calls),
    });

    assert.equal(result.ok, true, `expected ok:true, got reason: ${result.reason}`);
    assert.notEqual(result.reason, 'no-state-file');
    assert.equal(result.state_row, 'skipped_store_mode');
    assert.equal(calls.length, 1);
    assert.equal(fs.existsSync(stateMdPath), false, 'STATE.md must not be created in store mode');
    assert.equal(fs.existsSync(path.join(env.planningDir, '.skill-active')), false, 'marker removed');
  });

  test('SM-4: findCacheDrift reports nothing for STATE.md after a store-mode micro commit (no W055)', () => {
    linkStoreBranch(env); // 53-03: the default runner is gated like any store-mode commit
    planningDrift._setDriftReaders({
      readIndex: () => ({ 'STATE.md': contentHash(STORE_STATE_MD) }),
      readLedger: () => ({ version: 1, entries: {}, corrupt: false }),
    });
    const pre = planningDrift.findCacheDrift(env.root);
    assert.equal(pre.applicable, true, 'drift check must apply in store mode');
    assert.deepEqual(pre.drift.filter((d) => d.rel === 'STATE.md'), [], 'baseline: STATE.md starts clean');

    startMicro({ planningDir: env.planningDir, description: 'fix typo in readme', pid: 1, now: '2026-05-06T00:00:00Z' });
    fs.writeFileSync(path.join(env.root, 'a.txt'), 'a\n');
    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'fix typo in readme',
      files: ['a.txt'],
      now: '2026-05-06T00:01:00Z',
      gitRunner: null,
    });
    assert.equal(result.ok, true, `expected ok:true, got reason: ${result.reason}`);

    const post = planningDrift.findCacheDrift(env.root);
    assert.deepEqual(post.drift.filter((d) => d.rel === 'STATE.md'), [], 'no W055 for STATE.md after micro');
  });

  test('SM-4 control: a row appended to the store STATE.md is reported as changed drift', () => {
    planningDrift._setDriftReaders({
      readIndex: () => ({ 'STATE.md': contentHash(STORE_STATE_MD) }),
      readLedger: () => ({ version: 1, entries: {}, corrupt: false }),
    });
    // What micro did before 52-03: append a "Quick Tasks Completed" row.
    fs.appendFileSync(stateMdPath, '| 1 | fix typo in readme | 2026-05-06 | abc1234 | x |\n', 'utf8');
    const drift = planningDrift.findCacheDrift(env.root).drift.filter((d) => d.rel === 'STATE.md');
    assert.equal(drift.length, 1);
    assert.equal(drift[0].reason, 'changed');
  });
});

describe('commitMicro: local mode with a github block but store off (52-03)', () => {
  let env;
  beforeEach(() => {
    env = mkGitAmbient();
    fs.writeFileSync(
      path.join(env.planningDir, 'config.json'),
      JSON.stringify({ github: { enabled: true, store: false } }, null, 2) + '\n',
      'utf8'
    );
    process.env.DEVFLOW_ALLOW_RAW_COMMIT = '1';
  });
  afterEach(() => {
    fs.rmSync(env.root, { recursive: true, force: true });
    delete process.env.DEVFLOW_ALLOW_RAW_COMMIT;
    _resetMocks();
  });

  test('SL-1: the row is appended, the runner is called twice, and the result has no state_row key', () => {
    startMicro({ planningDir: env.planningDir, description: 'bump dependency version', pid: 1, now: '2026-05-06T00:00:00Z' });
    const calls = [];
    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'bump dependency version',
      files: ['a.txt'],
      now: '2026-05-06T00:01:00Z',
      gitRunner: recordingRunner(calls),
    });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 2, `expected 2 runner calls (source + STATE.md), got ${calls.length}`);
    assert.deepEqual(calls[1].opts.files, ['.planning/STATE.md']);
    assert.equal(Object.hasOwn(result, 'state_row'), false, 'local result shape is unchanged');
    assert.ok(fs.readFileSync(path.join(env.planningDir, 'STATE.md'), 'utf8').includes('bump dependency version'));
  });

  test('SL-2: STATE.md missing still refuses with no-state-file', () => {
    fs.unlinkSync(path.join(env.planningDir, 'STATE.md'));
    startMicro({ planningDir: env.planningDir, description: 'add missing semicolon', pid: 1, now: '2026-05-06T00:00:00Z' });
    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'add missing semicolon',
      files: null,
      now: '2026-05-06T00:01:00Z',
      gitRunner: null,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no-state-file');
  });
});

// ─── micro commits through `df-tools commit` (53-03) ─────────────────────────
//
// micro's default runner used to run `git add` + `git commit` with DEVFLOW_ALLOW_RAW_COMMIT=1, so in store mode a micro
// commit landed on the default branch or an unlinked branch with no refusal and no override-log entry. It now spawns
// `df-tools commit`, which owns the GEN-01 gate, the override log and the Refs trailer. These cases are the store-mode
// refusal, the linked branch, the logged escape, the local-mode no-files resolution and a source-text guard.

const U1_STORE_IGNORE = [
  '# >>> devflow store (0010) >>>',
  '.planning/*',
  '!.planning/config.json',
  '!.planning/STACK.md',
  '# <<< devflow store (0010) <<<',
  '',
].join('\n');
const GATE_LINKED_BRANCH = '53-linked';
const gateCleanup = [];

/**
 * A store-mode repo on `branch`, shaped like misc-commit-gate.test.cjs `storeRepo()`: config.json turns on github.store,
 * `.gitignore` carries the store block (so `.planning/` is a cache, STATE.md included), the v3 mapping is written AFTER the
 * init commit and links GATE_LINKED_BRANCH to objective 53, and a `gh` shim first on PATH records its calls and fails.
 */
function mkStoreGateRepo({ branch = 'main' } = {}) {
  const home = fx.makeFakeHome();
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-micro-gate-')));
  const shim = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-micro-shim-')));
  gateCleanup.push(root, home, shim);
  const ghLog = path.join(shim, 'gh-calls.log');
  fs.writeFileSync(path.join(shim, 'gh'), `#!/bin/sh\necho "$@" >> "${ghLog}"\nexit 1\n`, { mode: 0o755 });

  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(root, 'README.md'), '# test\n');
  fs.writeFileSync(path.join(root, '.gitignore'), U1_STORE_IGNORE);
  fs.writeFileSync(
    path.join(root, '.planning', 'config.json'),
    `${JSON.stringify({ commit_docs: true, github: { enabled: true, store: true } })}\n`,
    'utf8'
  );
  fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), STORE_STATE_MD, 'utf8');
  fx.initGitFixture(root, home);

  const m = gm.emptyMapping();
  gm.setEntry(m, '53', { issue_id: 530 });
  gm.setPr(m, '53', { branch: GATE_LINKED_BRANCH });
  const w = gm.writeMappingV3(root, m);
  assert.equal(w.ok, true, w.error);

  const p = { root, home, shim, ghLog, planningDir: path.join(root, '.planning') };
  if (branch !== 'main') gitIn(p, ['checkout', '-q', '-b', branch]);
  return p;
}

function gitIn(p, args) {
  const r = spawnSync('git', ['-C', p.root, ...args], { env: fx.gitEnv(p.home), encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

/** `df-tools micro <args>` in the fixture, with a clean gate environment plus `extraEnv`; stdout parsed when it is JSON. */
function gateMicro(p, args, extraEnv = {}) {
  const base = cleanGateEnv({ ...fx.gitEnv(p.home), PATH: `${p.shim}${path.delimiter}${process.env.PATH}` });
  const r = spawnSync(process.execPath, [DF_TOOLS, 'micro', ...args], {
    cwd: p.root, env: { ...base, ...extraEnv }, encoding: 'utf8',
  });
  const out = (r.stdout || '').trim();
  let json = null;
  try { json = JSON.parse(out); } catch { /* not JSON */ }
  return { status: r.status, out, err: (r.stderr || '').trim(), json };
}

function overrideEntries(p) {
  const file = path.join(p.root, '.planning', '.override-log.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

describe('micro commit through df-tools commit: the store-mode gate (53-03)', () => {
  afterEach(() => {
    while (gateCleanup.length) {
      const dir = gateCleanup.pop();
      if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  /** Start a micro and leave an uncommitted a.txt; returns HEAD before the commit attempt. */
  function startWithChange(p) {
    const start = gateMicro(p, ['start', 'fix typo', '--raw']);
    assert.equal(start.status, 0, `start failed: ${start.err}`);
    fs.writeFileSync(path.join(p.root, 'a.txt'), 'a\n');
    return gitIn(p, ['rev-parse', 'HEAD']);
  }

  function assertRefusedUntouched(p, r, before, gateReason) {
    assert.notEqual(r.status, 0, `a refused micro commit must exit non-zero: ${r.out} ${r.err}`);
    assert.ok(r.json, `the refusal is JSON on stdout: out=${r.out} err=${r.err}`);
    assert.equal(r.json.ok, false);
    assert.equal(r.json.reason, 'gate-refused');
    assert.equal(r.json.gate_reason, gateReason);
    assert.match(r.json.message, /df-tools gh pr start/, 'the message names the linked-branch remedy');
    assert.match(r.json.message, /DEVFLOW_SKIP_GH_GATE=1/, 'the message names the logged escape');
    assert.doesNotMatch(r.json.message, /git commit failed/, 'the gate message is verbatim, not wrapped');
    assert.equal(r.json.removed_marker, false);
    assert.match(r.err, /gh pr start/, 'stderr carries the message for a human too');
    assert.equal(gitIn(p, ['rev-parse', 'HEAD']), before, 'HEAD is unchanged');
    assert.equal(gitIn(p, ['diff', '--cached', '--name-only']), '', 'nothing is staged');
    assert.equal(fs.existsSync(path.join(p.planningDir, '.skill-active')), true, 'the marker is kept so the user can retry');
    assert.equal(fs.existsSync(path.join(p.root, 'a.txt')), true, 'the change is untouched');
  }

  test('G-1 e2e: store mode on an unlinked branch is refused with the gate message; HEAD, index and marker are unchanged', () => {
    const p = mkStoreGateRepo({ branch: 'feat/x' });
    const before = startWithChange(p);
    const r = gateMicro(p, ['commit', '--files', 'a.txt', '--raw']);
    assertRefusedUntouched(p, r, before, 'unlinked_branch');
  });

  test('G-2 e2e: store mode on the default branch is refused with default_branch', () => {
    const p = mkStoreGateRepo({ branch: 'main' });
    const before = startWithChange(p);
    const r = gateMicro(p, ['commit', '--files', 'a.txt', '--raw']);
    assertRefusedUntouched(p, r, before, 'default_branch');
  });

  test('G-3 e2e: a refused micro commit is retried on the linked branch: one commit, only a.txt, STATE.md untouched', () => {
    const p = mkStoreGateRepo({ branch: 'feat/x' });
    const before = startWithChange(p);
    const stateBefore = fs.readFileSync(path.join(p.planningDir, 'STATE.md'));
    assert.notEqual(gateMicro(p, ['commit', '--files', 'a.txt', '--raw']).status, 0);

    gitIn(p, ['checkout', '-q', '-b', GATE_LINKED_BRANCH]);
    const r = gateMicro(p, ['commit', '--files', 'a.txt', '--raw']);
    assert.equal(r.status, 0, `retry failed: ${r.out} ${r.err}`);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.state_commit_hash, null);
    assert.equal(r.json.state_row, 'skipped_store_mode');
    assert.equal(r.json.removed_marker, true);

    assert.equal(gitIn(p, ['rev-list', '--count', `${before}..HEAD`]), '1', 'exactly one new commit');
    assert.equal(gitIn(p, ['log', '-1', '--pretty=%s']), 'chore(micro): fix typo');
    assert.equal(gitIn(p, ['show', '--name-only', '--pretty=format:', 'HEAD']), 'a.txt');
    assert.ok(fs.readFileSync(path.join(p.planningDir, 'STATE.md')).equals(stateBefore), 'STATE.md is byte-identical');
    assert.equal(fs.existsSync(path.join(p.planningDir, '.skill-active')), false, 'marker removed');
    assert.deepEqual(overrideEntries(p), [], 'an allowed commit logs no override');
  });

  test('G-4 e2e: DEVFLOW_SKIP_GH_GATE=1 lets the refused micro commit land and logs one gate:gh override', () => {
    const p = mkStoreGateRepo({ branch: 'feat/x' });
    const before = startWithChange(p);
    const r = gateMicro(p, ['commit', '--files', 'a.txt', '--raw'], {
      DEVFLOW_SKIP_GH_GATE: '1', DEVFLOW_SKIP_GH_GATE_REASON: 'test',
    });
    assert.equal(r.status, 0, `escaped commit failed: ${r.out} ${r.err}`);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.state_row, 'skipped_store_mode');

    assert.equal(gitIn(p, ['rev-list', '--count', `${before}..HEAD`]), '1', 'exactly one new commit');
    assert.equal(gitIn(p, ['show', '--name-only', '--pretty=format:', 'HEAD']), 'a.txt');
    const log = overrideEntries(p);
    assert.equal(log.length, 1, `one override entry, got ${JSON.stringify(log)}`);
    assert.equal(log[0].gate, 'gh');
    assert.equal(log[0].reason, 'test');
  });

  test('G-5: the gate reasons micro maps to gate-refused cover every refusal code gh-gate.cjs can emit', () => {
    const { _GATE_REASONS } = require('./micro.cjs');
    assert.ok(_GATE_REASONS instanceof Set, 'micro.cjs exports its gate-reason set');
    const src = fs.readFileSync(path.join(__dirname, 'gh-gate.cjs'), 'utf8');
    const emitted = [...src.matchAll(/refuse\(\s*'([a-z_]+)'/g)].map((m) => m[1]);
    assert.ok(emitted.length >= 3, `expected gh-gate.cjs to emit at least three refusal codes, found ${emitted}`);
    for (const code of emitted) assert.ok(_GATE_REASONS.has(code), `micro.cjs does not map gh-gate reason ${code} to gate-refused`);
  });
});

describe('micro commit through df-tools commit: local-mode file resolution (53-03)', () => {
  let env;
  const git = (root, ...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  const lines = (s) => s.split('\n').filter(Boolean);
  const sourceCommitFiles = (root) => lines(git(root, 'show', '--name-only', '--format=', 'HEAD~1').stdout);

  beforeEach(() => {
    env = mkGitAmbient();
    fs.writeFileSync(path.join(env.root, 'c.txt'), 'c\n');
    git(env.root, 'add', 'c.txt');
    git(env.root, 'commit', '-m', 'chore: seed c');
  });
  afterEach(() => {
    fs.rmSync(env.root, { recursive: true, force: true });
    _resetMocks();
  });

  const commit = (description) => commitMicro({
    planningDir: env.planningDir, description, files: null, now: '2026-05-06T00:01:00Z', gitRunner: null,
  });

  test('R-1: with b.txt staged and c.txt modified but unstaged, no --files commits b.txt only', () => {
    startMicro({ planningDir: env.planningDir, description: 'add b', pid: 1, now: '2026-05-06T00:00:00Z' });
    fs.writeFileSync(path.join(env.root, 'b.txt'), 'b\n');
    git(env.root, 'add', 'b.txt');
    fs.writeFileSync(path.join(env.root, 'c.txt'), 'c changed\n');

    const result = commit('add b');
    assert.equal(result.ok, true, `expected ok:true, got: ${JSON.stringify(result)}`);
    assert.deepEqual(sourceCommitFiles(env.root), ['b.txt']);
    assert.ok(lines(git(env.root, 'status', '--porcelain').stdout).includes(' M c.txt'), 'c.txt is still an unstaged edit');
  });

  test('R-2: with nothing staged and c.txt modified, no --files commits c.txt', () => {
    startMicro({ planningDir: env.planningDir, description: 'edit c', pid: 1, now: '2026-05-06T00:00:00Z' });
    fs.writeFileSync(path.join(env.root, 'c.txt'), 'c changed\n');
    fs.writeFileSync(path.join(env.root, 'draft.md'), 'untracked\n');

    const result = commit('edit c');
    assert.equal(result.ok, true, `expected ok:true, got: ${JSON.stringify(result)}`);
    assert.deepEqual(sourceCommitFiles(env.root), ['c.txt']);
    assert.ok(lines(git(env.root, 'status', '--porcelain').stdout).includes('?? draft.md'), 'the untracked draft is never swept in');
  });

  test('R-3: with only an untracked file, no --files gives the nothing-staged error and commits nothing', () => {
    startMicro({ planningDir: env.planningDir, description: 'add d', pid: 1, now: '2026-05-06T00:00:00Z' });
    fs.writeFileSync(path.join(env.root, 'd.txt'), 'd\n');
    const before = git(env.root, 'rev-parse', 'HEAD').stdout;

    const result = commit('add d');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'commit-failed');
    assert.match(result.message, /nothing staged/);
    assert.match(result.message, /--files/);
    assert.equal(git(env.root, 'rev-parse', 'HEAD').stdout, before);
    assert.equal(fs.existsSync(path.join(env.planningDir, '.skill-active')), true, 'the marker is kept');
  });

  test('R-4: a staged deletion (git rm) is committed by no --files and the file leaves HEAD', () => {
    startMicro({ planningDir: env.planningDir, description: 'drop c', pid: 1, now: '2026-05-06T00:00:00Z' });
    git(env.root, 'rm', '-q', 'c.txt');

    const result = commit('drop c');
    assert.equal(result.ok, true, `expected ok:true, got: ${JSON.stringify(result)}`);
    assert.equal(git(env.root, 'show', '--name-status', '--format=', 'HEAD~1').stdout.trim(), 'D\tc.txt');
    assert.equal(git(env.root, 'ls-tree', '--name-only', 'HEAD', 'c.txt').stdout.trim(), '', 'c.txt is gone from HEAD');
  });

  test('R-5: a project in a subdirectory of its repo resolves the implicit list relative to the project', () => {
    // .planning/ lives in <repo>/proj, so `git diff --name-only` would print `proj/x.txt`, which df-tools commit (run from
    // proj/) cannot resolve. The runner asks for paths relative to the project root.
    const proj = path.join(env.root, 'proj');
    fs.mkdirSync(path.join(proj, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(proj, 'x.txt'), 'x\n');
    fs.writeFileSync(path.join(proj, '.planning', 'STATE.md'), '# DevFlow State\n\n## Quick Tasks Completed\n\n| # | Description | Date | Commit | Directory |\n|---|---|---|---|---|\n');
    git(env.root, 'add', 'proj/x.txt');
    git(env.root, 'commit', '-m', 'chore: seed proj');
    const planningDir = path.join(proj, '.planning');
    startMicro({ planningDir, description: 'edit x', pid: 1, now: '2026-05-06T00:00:00Z' });
    fs.writeFileSync(path.join(proj, 'x.txt'), 'x changed\n');

    const result = commitMicro({ planningDir, description: 'edit x', files: null, now: '2026-05-06T00:01:00Z', gitRunner: null });
    assert.equal(result.ok, true, `expected ok:true, got: ${JSON.stringify(result)}`);
    assert.deepEqual(sourceCommitFiles(env.root), ['proj/x.txt']);
  });
});

describe('micro.cjs commits only through df-tools commit (53-03)', () => {
  const source = fs.readFileSync(path.join(__dirname, 'micro.cjs'), 'utf8');

  test('X-1: no raw `git commit` spawn and no DEVFLOW_ALLOW_RAW_COMMIT escape remain in micro.cjs', () => {
    assert.doesNotMatch(source, /spawnSync\(\s*'git',\s*\[\s*'commit'/, 'micro.cjs must not spawn `git commit`');
    assert.doesNotMatch(source, /commitArgs/, 'the raw commit argument list is gone');
    assert.doesNotMatch(source, /DEVFLOW_ALLOW_RAW_COMMIT\s*:\s*'1'/, 'no raw-commit escape in any env');
  });

  test('X-2: the default runner spawns the df-tools CLI next to micro.cjs, not one under ~/.claude', () => {
    assert.match(source, /path\.join\(__dirname, '\.\.', 'df-tools\.cjs'\)/);
    assert.match(source, /'commit'/);
    assert.doesNotMatch(source, /\.claude\/devflow/, 'never resolve df-tools through the home mirror');
  });
});
