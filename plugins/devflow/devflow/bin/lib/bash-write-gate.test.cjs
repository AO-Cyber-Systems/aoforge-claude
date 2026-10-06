'use strict';

/**
 * bash-write-gate.test.cjs — TRD 60-03
 *
 * Hand-built cases only: the PATH_CASES table from 60-01, the named unit cases
 * below, and (tests 9-10) a hermetic git repository from the tracked-repo
 * builder. No generated data.
 *
 * The pure tests run against a fake index: a path is tracked only when it is
 * listed in TRACKED (relative to /repo), and a directory only when it is in DIRS.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { evaluateBashWrites } = require('./bash-write-gate.cjs');
const { PATH_CASES, TRACKED, DIRS } = require('./__fixtures__/bash-write-cases.cjs');

const CWD = '/repo';

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const fakeIsTracked = (abs) => new Set(abs.filter((a) => TRACKED.includes(path.relative(CWD, a))));
const fakeIsDirectory = (abs) => DIRS.includes(abs);

/** The context the pure tests run with: cwd and project root are both /repo. */
function ctx(extra = {}) {
  return {
    cwd: CWD,
    projectRoot: CWD,
    home: '/home/u',
    isDirectory: fakeIsDirectory,
    isTracked: fakeIsTracked,
    ...extra,
  };
}

/** `passed` as {path, reason}, sorted by path then reason. */
function passedOf(result) {
  return result.passed
    .map((p) => ({ path: p.path, reason: p.reason }))
    .sort((a, b) => cmp(String(a.path), String(b.path)) || cmp(a.reason, b.reason));
}

describe('1. PATH_CASES', () => {
  for (const c of PATH_CASES) {
    test(c.name, () => {
      const result = evaluateBashWrites(c.cmd, ctx({ cwd: c.cwd }));
      assert.deepStrictEqual([...result.gated].sort(), [...c.gated].sort());
      const want = c.passed.map((p) => ({ path: p.path, reason: p.reason }))
        .sort((a, b) => cmp(String(a.path), String(b.path)) || cmp(a.reason, b.reason));
      assert.deepStrictEqual(passedOf(result), want);
    });
  }

  test('the table has all 14 cases', () => {
    assert.strictEqual(PATH_CASES.length, 14);
  });
});

describe('2. isTracked is asked only when there is a candidate', () => {
  for (const cmd of ['echo x > README.md', 'echo x > /tmp/a', 'echo x > "$F"', 'ls src']) {
    test(cmd, () => {
      let calls = 0;
      const isTracked = (abs) => { calls += 1; return fakeIsTracked(abs); };
      evaluateBashWrites(cmd, ctx({ isTracked }));
      assert.strictEqual(calls, 0);
    });
  }

  test('one call covers every candidate of a command', () => {
    const seen = [];
    const isTracked = (abs) => { seen.push([...abs]); return fakeIsTracked(abs); };
    evaluateBashWrites('echo x > src/a.js; echo y > src/a.go; echo z > src/new.js', ctx({ isTracked }));
    assert.strictEqual(seen.length, 1);
    assert.deepStrictEqual(seen[0].sort(), ['/repo/src/a.go', '/repo/src/a.js', '/repo/src/new.js']);
  });
});

describe('3. defaults fail open', () => {
  test('with no isTracked injected nothing is gated', () => {
    const result = evaluateBashWrites('echo x > src/a.js', { cwd: CWD, projectRoot: CWD, home: '/home/u' });
    assert.deepStrictEqual(result.gated, []);
    assert.deepStrictEqual(passedOf(result), [{ path: '/repo/src/a.js', reason: 'untracked' }]);
  });

  test('with no isDirectory injected a bare cp destination is a file', () => {
    const result = evaluateBashWrites('cp /tmp/a.js src', {
      cwd: CWD, projectRoot: CWD, home: '/home/u', isTracked: fakeIsTracked,
    });
    assert.deepStrictEqual(result.gated, []);
    assert.deepStrictEqual(passedOf(result), [{ path: '/repo/src', reason: 'untracked' }]);
  });

  test('the default isOutside is the path.relative test', () => {
    const result = evaluateBashWrites('echo x > ../other/a.js; echo y > src/a.js', {
      cwd: CWD, projectRoot: CWD, home: '/home/u', isTracked: fakeIsTracked,
    });
    assert.deepStrictEqual(result.gated, ['/repo/src/a.js']);
    assert.deepStrictEqual(passedOf(result), [{ path: '/other/a.js', reason: 'outside-project' }]);
  });

  test('an injected isOutside wins over the default', () => {
    const result = evaluateBashWrites('echo x > src/a.js', ctx({ isOutside: () => true }));
    assert.deepStrictEqual(result.gated, []);
    assert.deepStrictEqual(passedOf(result), [{ path: '/repo/src/a.js', reason: 'outside-project' }]);
  });
});

describe('4. the same tracked file written twice is gated once', () => {
  test('echo a > src/a.js; echo b >> src/a.js', () => {
    const result = evaluateBashWrites('echo a > src/a.js; echo b >> src/a.js', ctx());
    assert.deepStrictEqual(result.gated, ['/repo/src/a.js']);
    assert.strictEqual(result.writes.length, 2);
  });

  test('a repeated untracked file is never gated', () => {
    const result = evaluateBashWrites('echo a > src/new.js; echo b >> src/new.js', ctx());
    assert.deepStrictEqual(result.gated, []);
    assert.ok(result.passed.length >= 1);
    assert.ok(result.passed.every((p) => p.reason === 'untracked'));
  });
});
