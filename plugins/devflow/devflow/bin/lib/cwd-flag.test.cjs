'use strict';

// Test list (TDD Playbook habit #2 — reviewable artifact, written before implementation):
//
// Spawned df-tools (`spawnSync(process.execPath, [DF_TOOLS, ...])`, cwd = an unrelated
// mkdtemp dir) — added by Task 2:
//   1. `--cwd <proj> find-objective 1 --raw` finds `<proj>/.planning/objectives/01-alpha`,
//      while the spawn cwd has no `.planning/`.
//   2. `--cwd <proj> state load --raw` reads `<proj>/.planning/STATE.md` (not the spawn
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

const { extractCwdFlag } = require('./cwd-flag.cjs');

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
