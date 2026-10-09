'use strict';

// Test list (TDD Playbook habit #2 — reviewable artifact, written before implementation):
//
// Spawned aof-tools (`spawnSync(process.execPath, [DF_TOOLS, ...])`, cwd = an unrelated
// mkdtemp dir) — added by Task 2:
//   1. `--cwd <proj> find-objective 1 --raw` finds `<proj>/.aoforge/objectives/01-alpha`,
//      while the spawn cwd has no `.aoforge/`.
//   2. `--cwd <proj> state load --raw` reads `<proj>/.aoforge/STATE.md` (not the spawn
//      cwd's).
//   3. `find-objective 1 --raw --cwd <proj>` (trailing) → same as 1.
//   4. `--cwd=<proj> find-objective 1 --raw` → same as 1.
//   5. Relative: spawn cwd = parent of proj, `--cwd <basename> find-objective 1 --raw` →
//      same as 1.
//   6. `--cwd` as the last token → exit 1, stderr contains `--cwd requires a directory`.
//   7. `--cwd /does/not/exist find-objective 1` → exit 1, stderr contains `not a
//      directory`; `--cwd <a file>` → same.
//   8. `--cwd <proj> commit --help` → exit 0, prints commit usage, `git -C <proj> log`
//      unchanged (a fixture git repo) — help still wins and nothing is written.
//   9. `--cwd <proj>` with no command → exit 1 (top-level usage), same as today's
//      no-command case.
//
// Pure `extractCwdFlag(args, {originalCwd})` — this Task (1):
//   10. `['--cwd', 'd', 'state', 'load']` → `{args: ['state','load'], dir: <originalCwd>/d}`.
//   11. `['state', 'load', '--cwd', 'd']` → trailing form extracted.
//   12. `['handoff', 'create', 'git', 'status', '--cwd', 'd']` → NOT extracted (forwarded
//       tail; `dir: null`, args unchanged).
//   13. `['state', 'load', '--', '--cwd', 'd']` → NOT extracted.
//   14. `['dup-detect', 'check', '--cwd', 'd']` → NOT extracted (dup-detect owns `--cwd`,
//       `dup-detect-cli.cjs:109`).
//   15. `['--cwd', 'a', 'state', '--cwd', 'b']` → error `--cwd given twice`.
//   16. `['--cwd=']` / `['--cwd']` → error `--cwd requires a directory`.
//   17. Absolute dir is kept as is (`path.resolve(originalCwd, dir)`).
//
// Plus: extractCwdFlag never mutates its `args` input.

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const { extractCwdFlag } = require('./cwd-flag.cjs');
const { makeFixture, makeFakeHome, gitEnv } = require('./__fixtures__/adopt-fixtures.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'aof-tools.cjs');

// ─── Helpers (spawned tests) ──────────────────────────────────────────────────

function run(argv, cwd, envOverrides) {
  const r = spawnSync(process.execPath, [TOOLS_PATH, ...argv], {
    cwd,
    encoding: 'utf-8',
    timeout: 30000,
    env: { ...process.env, ...(envOverrides || {}) },
  });
  return {
    status: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    out: (r.stdout || '') + (r.stderr || ''),
  };
}

// A minimal AOForge project — enough for find-objective/state/commit to see a
// real, distinguishable target. Deliberately NOT a git repo (git only matters
// for test 8, which uses adopt-fixtures' makeFixture('aoforge', ...) instead).
function makeProject(dir) {
  fs.mkdirSync(path.join(dir, '.aoforge', 'objectives', '01-alpha'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aoforge', 'objectives', '01-alpha', 'OBJECTIVE.md'), '# alpha\n', 'utf-8');
  fs.writeFileSync(path.join(dir, '.aoforge', 'STATE.md'), '# State\n\n**Status:** active\n', 'utf-8');
  fs.writeFileSync(path.join(dir, '.aoforge', 'ROADMAP.md'), '# Roadmap\n', 'utf-8');
  fs.writeFileSync(path.join(dir, '.aoforge', 'config.json'), '{}\n', 'utf-8');
  return dir;
}

let spawnedTmpRoots = [];
function mkdtemp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  spawnedTmpRoots.push(dir);
  return dir;
}

let fakeHome;

// ─── Spawned aof-tools — end-to-end (tests 1-9) ────────────────────────────────

describe('aof-tools --cwd — end to end (spawned)', () => {
  beforeEach(() => {
    spawnedTmpRoots = [];
    fakeHome = makeFakeHome();
  });

  afterEach(() => {
    for (const dir of spawnedTmpRoots) fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  test('1. --cwd <proj> find-objective 1 --raw finds the project dir, not the spawn cwd', () => {
    const proj = makeProject(mkdtemp('df-cwd-proj-'));
    const spawnCwd = mkdtemp('df-cwd-spawn-');
    const r = run(['--cwd', proj, 'find-objective', '1', '--raw'], spawnCwd, { HOME: fakeHome });
    assert.strictEqual(r.status, 0, r.out);
    assert.strictEqual(r.stdout.trim(), path.join('.aoforge', 'objectives', '01-alpha'));
  });

  test('2. --cwd <proj> state load --raw reads the project STATE.md, not the spawn cwd\'s', () => {
    const proj = makeProject(mkdtemp('df-cwd-proj-'));
    const spawnCwd = mkdtemp('df-cwd-spawn-'); // no .aoforge/ at all
    const r = run(['--cwd', proj, 'state', 'load', '--raw'], spawnCwd, { HOME: fakeHome });
    assert.strictEqual(r.status, 0, r.out);
    assert.match(r.stdout, /state_exists=true/);
    assert.match(r.stdout, /roadmap_exists=true/);
    assert.match(r.stdout, /config_exists=true/);

    // Sanity: the spawn cwd on its own reports the opposite.
    const control = run(['state', 'load', '--raw'], spawnCwd, { HOME: fakeHome });
    assert.match(control.stdout, /state_exists=false/);
  });

  test('3. find-objective 1 --raw --cwd <proj> (trailing) — same as 1', () => {
    const proj = makeProject(mkdtemp('df-cwd-proj-'));
    const spawnCwd = mkdtemp('df-cwd-spawn-');
    const r = run(['find-objective', '1', '--raw', '--cwd', proj], spawnCwd, { HOME: fakeHome });
    assert.strictEqual(r.status, 0, r.out);
    assert.strictEqual(r.stdout.trim(), path.join('.aoforge', 'objectives', '01-alpha'));
  });

  test('4. --cwd=<proj> find-objective 1 --raw — same as 1', () => {
    const proj = makeProject(mkdtemp('df-cwd-proj-'));
    const spawnCwd = mkdtemp('df-cwd-spawn-');
    const r = run([`--cwd=${proj}`, 'find-objective', '1', '--raw'], spawnCwd, { HOME: fakeHome });
    assert.strictEqual(r.status, 0, r.out);
    assert.strictEqual(r.stdout.trim(), path.join('.aoforge', 'objectives', '01-alpha'));
  });

  test('5. relative --cwd resolves against the spawn (original) cwd', () => {
    const parent = mkdtemp('df-cwd-parent-');
    makeProject(path.join(parent, 'proj'));
    const r = run(['--cwd', 'proj', 'find-objective', '1', '--raw'], parent, { HOME: fakeHome });
    assert.strictEqual(r.status, 0, r.out);
    assert.strictEqual(r.stdout.trim(), path.join('.aoforge', 'objectives', '01-alpha'));
  });

  test('6. --cwd as the last token errors before running anything', () => {
    const spawnCwd = mkdtemp('df-cwd-spawn-');
    const r = run(['--cwd'], spawnCwd, { HOME: fakeHome });
    assert.strictEqual(r.status, 1, r.out);
    assert.match(r.stderr, /--cwd requires a directory/);
  });

  test('7. --cwd rejects a missing path and a non-directory path', () => {
    const spawnCwd = mkdtemp('df-cwd-spawn-');

    const missing = path.join(spawnCwd, 'does-not-exist');
    let r = run(['--cwd', missing, 'find-objective', '1'], spawnCwd, { HOME: fakeHome });
    assert.strictEqual(r.status, 1, r.out);
    assert.match(r.stderr, /not a directory/);

    const filePath = path.join(spawnCwd, 'a-file.txt');
    fs.writeFileSync(filePath, 'x', 'utf-8');
    r = run(['--cwd', filePath, 'find-objective', '1'], spawnCwd, { HOME: fakeHome });
    assert.strictEqual(r.status, 1, r.out);
    assert.match(r.stderr, /not a directory/);
  });

  test('8. --cwd <fixture> commit --help prints help and writes nothing', () => {
    const parent = mkdtemp('df-cwd-fixture-parent-');
    const proj = makeFixture('aoforge', { parent, home: fakeHome });
    const before = execFileSync('git', ['-C', proj, 'log', '--oneline'], {
      env: gitEnv(fakeHome), encoding: 'utf-8',
    });

    const r = run(['--cwd', proj, 'commit', '--help'], mkdtemp('df-cwd-spawn-'), { HOME: fakeHome });
    assert.strictEqual(r.status, 0, r.out);
    assert.match(r.stdout, /^Usage: aof-tools commit /m);

    const after = execFileSync('git', ['-C', proj, 'log', '--oneline'], {
      env: gitEnv(fakeHome), encoding: 'utf-8',
    });
    assert.strictEqual(after, before, 'commit --help must never write a commit');
  });

  test('9. --cwd <proj> with no command still exits 1 with the top-level usage', () => {
    const proj = makeProject(mkdtemp('df-cwd-proj-'));
    const r = run(['--cwd', proj], mkdtemp('df-cwd-spawn-'), { HOME: fakeHome });
    assert.strictEqual(r.status, 1, r.out);
    assert.match(r.out, /Usage: aof-tools \[--cwd <dir>\] <command>/);
  });
});

// ─── Pure extractCwdFlag(args, {originalCwd}) (tests 10-17) ──────────────────

describe('extractCwdFlag — pure parser', () => {
  let originalCwd;

  beforeEach(() => {
    originalCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'df-cwd-pure-'));
    fs.mkdirSync(path.join(originalCwd, 'd'));
  });

  afterEach(() => {
    fs.rmSync(originalCwd, { recursive: true, force: true });
  });

  test('10. leading --cwd <d> is extracted; dir resolves against originalCwd', () => {
    const r = extractCwdFlag(['--cwd', 'd', 'state', 'load'], { originalCwd });
    assert.deepStrictEqual(r.args, ['state', 'load']);
    assert.strictEqual(r.dir, path.join(originalCwd, 'd'));
    assert.strictEqual(r.error, null);
  });

  test('11. trailing --cwd <d> is extracted', () => {
    const r = extractCwdFlag(['state', 'load', '--cwd', 'd'], { originalCwd });
    assert.deepStrictEqual(r.args, ['state', 'load']);
    assert.strictEqual(r.dir, path.join(originalCwd, 'd'));
    assert.strictEqual(r.error, null);
  });

  test('12. a forwarded tail (handoff create ...) is NOT extracted', () => {
    const input = ['handoff', 'create', 'git', 'status', '--cwd', 'd'];
    const r = extractCwdFlag(input, { originalCwd });
    assert.strictEqual(r.dir, null);
    assert.strictEqual(r.error, null);
    assert.deepStrictEqual(r.args, input);
  });

  test('13. a literal -- ends the flag region: not extracted', () => {
    const input = ['state', 'load', '--', '--cwd', 'd'];
    const r = extractCwdFlag(input, { originalCwd });
    assert.strictEqual(r.dir, null);
    assert.strictEqual(r.error, null);
    assert.deepStrictEqual(r.args, input);
  });

  test('14. dup-detect owns --cwd: a trailing one is NOT extracted', () => {
    const input = ['dup-detect', 'check', '--cwd', 'd'];
    const r = extractCwdFlag(input, { originalCwd });
    assert.strictEqual(r.dir, null);
    assert.strictEqual(r.error, null);
    assert.deepStrictEqual(r.args, input);
  });

  test('15. --cwd given twice (leading + trailing) errors', () => {
    const r = extractCwdFlag(['--cwd', 'a', 'state', '--cwd', 'b'], { originalCwd });
    assert.strictEqual(r.error, '--cwd given twice');
  });

  test('16. a missing value errors, leading or bare', () => {
    assert.strictEqual(extractCwdFlag(['--cwd='], { originalCwd }).error, '--cwd requires a directory');
    assert.strictEqual(extractCwdFlag(['--cwd'], { originalCwd }).error, '--cwd requires a directory');
  });

  test('17. an absolute dir is kept as-is', () => {
    const abs = fs.mkdtempSync(path.join(os.tmpdir(), 'df-cwd-abs-'));
    try {
      const r = extractCwdFlag(['--cwd', abs, 'state', 'load'], { originalCwd });
      assert.strictEqual(r.dir, abs);
      assert.strictEqual(r.error, null);
    } finally {
      fs.rmSync(abs, { recursive: true, force: true });
    }
  });

  test('extractCwdFlag never mutates its args input', () => {
    const input = ['--cwd', 'd', 'state', 'load'];
    const copy = input.slice();
    extractCwdFlag(input, { originalCwd });
    assert.deepStrictEqual(input, copy);
  });

  test('a bad leading value (not a directory) errors', () => {
    const r = extractCwdFlag(['--cwd', 'no-such-subdir', 'state', 'load'], { originalCwd });
    assert.match(r.error, /not a directory/);
  });
});
