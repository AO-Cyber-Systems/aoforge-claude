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

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  evaluateBashWrites,
  gitTrackedSet,
  realpathDeep,
  readBashEditGate,
  effectiveBashMode,
  recommendDefault,
  bashGateReason,
  BASH_GATE_CLASSIFIER,
  BASH_EDIT_GATE_DEFAULT,
  FP_THRESHOLD,
  VALID_BASH_MODES,
} = require('./bash-write-gate.cjs');
const { PATH_CASES, TRACKED, DIRS } = require('./__fixtures__/bash-write-cases.cjs');
const { makeTrackedRepo } = require('./__fixtures__/tracked-repo.cjs');
const { gitAvailable, applyGitTestEnv } = require('./__fixtures__/wiki-remote.cjs');

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

const SEVERITY = { off: 0, warn: 1, strict: 2 };
const leastSevere = (a, b) => (SEVERITY[a] <= SEVERITY[b] ? a : b);

describe('5. effectiveBashMode(editGate, bashEditGate)', () => {
  const rows = [
    ['strict', null, BASH_EDIT_GATE_DEFAULT],
    ['strict', 'strict', 'strict'],
    ['strict', 'warn', 'warn'],
    ['strict', 'off', 'off'],
    ['warn', 'strict', 'warn'],
    ['warn', null, leastSevere('warn', BASH_EDIT_GATE_DEFAULT)],
    ['off', 'strict', 'off'],
    ['banana', 'strict', 'strict'],
  ];
  for (const [editGate, bashEditGate, want] of rows) {
    test(`editGate ${JSON.stringify(editGate)} + bashEditGate ${JSON.stringify(bashEditGate)} -> ${want}`, () => {
      assert.strictEqual(effectiveBashMode(editGate, bashEditGate), want);
    });
  }

  test('an invalid bashEditGate is the shipped default', () => {
    assert.strictEqual(effectiveBashMode('strict', 'banana'), BASH_EDIT_GATE_DEFAULT);
    assert.strictEqual(effectiveBashMode('strict', undefined), BASH_EDIT_GATE_DEFAULT);
  });

  test('editGate off or warn never makes the Bash rule stricter than it', () => {
    for (const bash of ['strict', 'warn', 'off', null]) {
      assert.strictEqual(effectiveBashMode('off', bash), 'off');
      assert.ok(SEVERITY[effectiveBashMode('warn', bash)] <= SEVERITY.warn);
    }
  });
});

describe('6. readBashEditGate(planningDir)', () => {
  let dir;
  before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-bashgate-cfg-')); });
  after(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  const put = (text) => fs.writeFileSync(path.join(dir, 'config.json'), text, 'utf8');

  test('null dir', () => {
    assert.strictEqual(readBashEditGate(null), null);
    assert.strictEqual(readBashEditGate(undefined), null);
  });

  test('missing config.json', () => {
    fs.rmSync(path.join(dir, 'config.json'), { force: true });
    assert.strictEqual(readBashEditGate(dir), null);
  });

  test('malformed JSON', () => {
    put('{ not json');
    assert.strictEqual(readBashEditGate(dir), null);
  });

  test('no gates key, and gates that are not an object', () => {
    for (const text of ['{}', '{"gates":null}', '{"gates":"x"}', 'null', '[]']) {
      put(text);
      assert.strictEqual(readBashEditGate(dir), null, text);
    }
  });

  test('an unknown value is null', () => {
    put('{"gates":{"bashEditGate":"banana"}}');
    assert.strictEqual(readBashEditGate(dir), null);
  });

  test('strict, warn and off come back verbatim', () => {
    for (const mode of ['strict', 'warn', 'off']) {
      put(JSON.stringify({ gates: { bashEditGate: mode } }));
      assert.strictEqual(readBashEditGate(dir), mode);
    }
  });

  test('it does not read gates.editGate', () => {
    put('{"gates":{"editGate":"off"}}');
    assert.strictEqual(readBashEditGate(dir), null);
  });

  test('it never throws: config.json that is a directory', () => {
    fs.rmSync(path.join(dir, 'config.json'), { force: true });
    fs.mkdirSync(path.join(dir, 'config.json'));
    assert.strictEqual(readBashEditGate(dir), null);
    fs.rmSync(path.join(dir, 'config.json'), { recursive: true, force: true });
  });
});

describe('7. recommendDefault and the shipped default', () => {
  test('FP_THRESHOLD is 0.02', () => {
    assert.strictEqual(FP_THRESHOLD, 0.02);
  });

  test('a rate at or under the threshold is strict', () => {
    assert.strictEqual(recommendDefault(0), 'strict');
    assert.strictEqual(recommendDefault(0.02), 'strict');
    assert.strictEqual(recommendDefault(0.0199), 'strict');
  });

  test('a rate over the threshold is warn', () => {
    assert.strictEqual(recommendDefault(0.0201), 'warn');
    assert.strictEqual(recommendDefault(1), 'warn');
  });

  test('a rate that is not a finite number is warn', () => {
    for (const rate of [NaN, undefined, Infinity, null, '0.01', -Infinity]) {
      assert.strictEqual(recommendDefault(rate), 'warn', String(rate));
    }
  });

  test('BASH_EDIT_GATE_DEFAULT is a valid mode and is not off', () => {
    assert.ok(VALID_BASH_MODES.has(BASH_EDIT_GATE_DEFAULT));
    assert.notStrictEqual(BASH_EDIT_GATE_DEFAULT, 'off');
  });

  test('VALID_BASH_MODES is strict, warn and off', () => {
    assert.deepStrictEqual([...VALID_BASH_MODES].sort(), ['off', 'strict', 'warn']);
  });
});

describe('8. bashGateReason(gatedAbs, projectRoot, mode)', () => {
  const root = '/repo';

  test('strict text opens with the denial and the relative path', () => {
    const text = bashGateReason(['/repo/src/a.js'], root, 'strict');
    assert.ok(
      text.startsWith('DevFlow ambient mode active — Bash write to tracked source denied: src/a.js'),
      text,
    );
  });

  test('paths are relative to the project root, three listed then (+N more)', () => {
    const gated = ['/repo/src/a.js', '/repo/src/b.js', '/repo/src/c.js', '/repo/src/d.js', '/repo/src/e.js'];
    const text = bashGateReason(gated, root, 'strict');
    assert.ok(text.includes('src/a.js, src/b.js, src/c.js (+2 more)'), text);
    assert.ok(!text.includes('src/d.js'), text);
    assert.ok(!text.includes('/repo/src'), text);
  });

  test('exactly three paths have no (+N more)', () => {
    const text = bashGateReason(['/repo/a.js', '/repo/b.js', '/repo/c.js'], root, 'strict');
    assert.ok(text.includes('a.js, b.js, c.js'), text);
    assert.ok(!text.includes('more)'), text);
  });

  test('warn text says the write needs approval', () => {
    const text = bashGateReason(['/repo/src/a.js'], root, 'warn');
    assert.ok(text.includes('Bash write to tracked source needs approval'), text);
    assert.ok(!text.includes('denied'), text);
  });

  for (const mode of ['strict', 'warn']) {
    test(`${mode} text names the skill, the overrides, the knob and what is never gated`, () => {
      const text = bashGateReason(['/repo/src/a.js'], root, mode);
      assert.ok(text.includes('/devflow:quick'), text);
      assert.ok(text.includes('/devflow:micro'), text);
      assert.ok(text.includes('"skip devflow"'), text);
      assert.ok(text.includes('"just edit"'), text);
      assert.ok(text.includes('gates.bashEditGate'), text);
      assert.ok(text.includes('.planning/'), text);
      assert.ok(text.includes('*.md'), text);
      assert.ok(text.includes('untracked'), text);
    });

    test(`${mode} text matches BASH_GATE_CLASSIFIER and is one line`, () => {
      const text = bashGateReason(['/repo/src/a.js'], root, mode);
      assert.ok(BASH_GATE_CLASSIFIER.test(text), text);
      assert.ok(!text.includes('\n'), text);
    });
  }

  test('the classifier does not match the Edit/Write denial', () => {
    const editText = 'DevFlow ambient mode active — direct Edit/Write/MultiEdit denied.';
    assert.ok(!BASH_GATE_CLASSIFIER.test(editText));
  });
});

const hasGit = gitAvailable();

describe('9. gitTrackedSet', { skip: !hasGit && 'git is not available' }, () => {
  let repo;
  let nested;
  before(() => {
    repo = makeTrackedRepo({
      files: { 'src/a.js': 'a', 'src/[x].js': 'x', ':(top)magic.js': 'm' },
      untracked: { 'src/new.js': 'n' },
      ignored: { 'build/out.js': 'o' },
    });
    nested = makeTrackedRepo({
      planningDir: 'pkg/.planning',
      files: { 'pkg/src/a.js': 'a' },
      untracked: { 'pkg/src/new.js': 'n' },
    });
  });
  after(() => {
    repo.cleanup();
    nested.cleanup();
  });

  const at = (root, rel) => path.join(root, rel);

  test('a tracked file is in the set; an untracked and an ignored file are not', () => {
    const asked = ['src/a.js', 'src/new.js', 'build/out.js'].map((r) => at(repo.root, r));
    const set = gitTrackedSet(repo.root, asked, { env: repo.env });
    assert.deepStrictEqual([...set], [at(repo.root, 'src/a.js')]);
  });

  test('a tracked name with glob characters matches literally', () => {
    const set = gitTrackedSet(repo.root, [at(repo.root, 'src/[x].js')], { env: repo.env });
    assert.ok(set.has(at(repo.root, 'src/[x].js')));
  });

  test('a name that looks like pathspec magic is a name, not magic', () => {
    const target = at(repo.root, ':(top)magic.js');
    const set = gitTrackedSet(repo.root, [target], { env: repo.env });
    assert.ok(set.has(target));
  });

  test('a glob target is not reported as tracked', () => {
    const set = gitTrackedSet(repo.root, [at(repo.root, 'src/*.js')], { env: repo.env });
    assert.strictEqual(set.size, 0);
  });

  test('the raw and the realpath spelling of the root and the target both work', () => {
    const raw = repo.root;
    const real = fs.realpathSync(repo.root);
    for (const rootSpelling of [raw, real]) {
      for (const targetSpelling of [raw, real]) {
        const target = at(targetSpelling, 'src/a.js');
        const set = gitTrackedSet(rootSpelling, [target], { env: repo.env });
        assert.ok(set.has(target), `root ${rootSpelling} target ${target}`);
      }
    }
  });

  test('a directory that is not a git repository gives an empty set', () => {
    const set = gitTrackedSet(repo.home, [at(repo.home, 'a.js')], { env: repo.env });
    assert.strictEqual(set.size, 0);
  });

  test('a root that does not exist gives an empty set', () => {
    const gone = at(repo.home, 'no-such-dir');
    assert.strictEqual(gitTrackedSet(gone, [at(gone, 'a.js')], { env: repo.env }).size, 0);
  });

  test('a spawn error gives an empty set', () => {
    const set = gitTrackedSet(repo.root, [at(repo.root, 'src/a.js')], { env: { PATH: '' } });
    assert.strictEqual(set.size, 0);
  });

  test('paths outside the root are dropped, and nothing asked gives an empty set', () => {
    const outside = path.join(path.dirname(repo.root), 'elsewhere', 'a.js');
    assert.strictEqual(gitTrackedSet(repo.root, [outside], { env: repo.env }).size, 0);
    assert.strictEqual(gitTrackedSet(repo.root, [], { env: repo.env }).size, 0);
  });

  test('a nested project finds pkg/src/a.js, with paths relative to pkg', () => {
    assert.ok(nested.projectRoot.endsWith(`${path.sep}pkg`));
    const asked = [at(nested.projectRoot, 'src/a.js'), at(nested.projectRoot, 'src/new.js')];
    const set = gitTrackedSet(nested.projectRoot, asked, { env: nested.env });
    assert.deepStrictEqual([...set], [at(nested.projectRoot, 'src/a.js')]);
  });

  test('without an env option it uses process.env (the hook path)', () => {
    const restore = applyGitTestEnv(repo.home);
    try {
      const set = gitTrackedSet(repo.root, [at(repo.root, 'src/a.js')]);
      assert.ok(set.has(at(repo.root, 'src/a.js')));
    } finally {
      restore();
    }
  });
});

describe('realpathDeep', () => {
  test('resolves the deepest existing ancestor and keeps the rest', () => {
    const tmp = fs.realpathSync(os.tmpdir());
    assert.strictEqual(realpathDeep(path.join(os.tmpdir(), 'df-no-such', 'x', 'y.js')),
      path.join(tmp, 'df-no-such', 'x', 'y.js'));
  });

  test('an existing path resolves to its realpath', () => {
    assert.strictEqual(realpathDeep(os.tmpdir()), fs.realpathSync(os.tmpdir()));
  });
});

describe('10. evaluateBashWrites with live predicates', { skip: !hasGit && 'git is not available' }, () => {
  let repo;
  before(() => {
    repo = makeTrackedRepo({
      files: { 'src/a.js': 'a', 'notes.md': '# n' },
      untracked: { 'src/new.js': 'n' },
    });
  });
  after(() => { repo.cleanup(); });

  function live(extra = {}) {
    return {
      cwd: repo.root,
      projectRoot: repo.projectRoot,
      home: repo.home,
      isDirectory: (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } },
      isTracked: (abs) => gitTrackedSet(repo.root, abs, { env: repo.env }),
      ...extra,
    };
  }
  const reasons = (result) => result.passed.map((p) => p.reason);

  test('echo x > src/a.js is gated', () => {
    const result = evaluateBashWrites('echo x > src/a.js', live());
    assert.deepStrictEqual(result.gated, [path.join(repo.root, 'src/a.js')]);
    assert.deepStrictEqual(result.passed, []);
  });

  test('a project under the temp dir is still gated', () => {
    assert.ok(repo.root.startsWith(os.tmpdir()));
    const result = evaluateBashWrites(`echo x > ${path.join(repo.root, 'src/a.js')}`, live());
    assert.deepStrictEqual(result.gated, [path.join(repo.root, 'src/a.js')]);
  });

  test('a write to the temp dir outside the project passes', () => {
    const result = evaluateBashWrites(`echo x > ${path.join(os.tmpdir(), 'df-scratch.txt')}`, live());
    assert.deepStrictEqual(result.gated, []);
    assert.deepStrictEqual(reasons(result), ['outside-project']);
  });

  test('cp <tmp>/a.js src/ over a tracked file is gated', () => {
    const result = evaluateBashWrites(`cp ${path.join(os.tmpdir(), 'a.js')} src/`, live());
    assert.deepStrictEqual(result.gated, [path.join(repo.root, 'src/a.js')]);
  });

  test('cp <tmp>/a.js src (an existing directory, no slash) is judged on the file inside', () => {
    const result = evaluateBashWrites(`cp ${path.join(os.tmpdir(), 'a.js')} src`, live());
    assert.deepStrictEqual(result.gated, [path.join(repo.root, 'src/a.js')]);
  });

  test('cp <tmp>/z.js src/ is a new file, so it passes as untracked', () => {
    const result = evaluateBashWrites(`cp ${path.join(os.tmpdir(), 'z.js')} src/`, live());
    assert.deepStrictEqual(result.gated, []);
    assert.deepStrictEqual(reasons(result), ['untracked']);
  });

  test('an untracked file that exists on disk passes', () => {
    const result = evaluateBashWrites('echo x > src/new.js', live());
    assert.deepStrictEqual(result.gated, []);
    assert.deepStrictEqual(reasons(result), ['untracked']);
  });

  test("sed -i 's/a/b/' notes.md passes as markdown even though it is tracked", () => {
    const result = evaluateBashWrites("sed -i 's/a/b/' notes.md", live());
    assert.deepStrictEqual(result.gated, []);
    assert.deepStrictEqual(reasons(result), ['markdown']);
  });

  test('a write under .planning/ passes', () => {
    const result = evaluateBashWrites('echo x > .planning/config.json', live());
    assert.deepStrictEqual(result.gated, []);
    assert.deepStrictEqual(reasons(result), ['planning']);
  });
});
