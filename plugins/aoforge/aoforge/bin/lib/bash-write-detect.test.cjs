'use strict';

/**
 * bash-write-detect.test.cjs — TRD 60-02
 *
 * Hand-built cases only: the WRITE_CASES / MENTION_CASES tables from 60-01 and
 * the named unit cases below. No generated data.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { detectBashWrites, mayWrite } = require('./bash-write-detect.cjs');
const { WRITE_CASES, MENTION_CASES } = require('./__fixtures__/bash-write-cases.cjs');

const CWD = '/repo';

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Keep {form, path} (plus sources/into for cp and mv), sorted by form then path. */
function project(writes) {
  return writes
    .map((w) => {
      const p = { form: w.form, path: w.path };
      if (w.form === 'cp' || w.form === 'mv') {
        p.sources = w.sources;
        p.into = w.into;
      }
      return p;
    })
    .sort((a, b) => cmp(a.form, b.form) || cmp(String(a.path), String(b.path)));
}

const detect = (cmd, opts) => project(detectBashWrites(cmd, { cwd: CWD, ...opts }));

describe('1. WRITE_CASES', () => {
  for (const c of WRITE_CASES) {
    test(c.name, () => {
      assert.deepStrictEqual(project(detectBashWrites(c.cmd, { cwd: c.cwd })), project(c.writes));
    });
  }
});

describe('2. MENTION_CASES', () => {
  for (const c of MENTION_CASES) {
    test(c.name, () => {
      assert.deepStrictEqual(detectBashWrites(c.cmd, { cwd: c.cwd }), []);
    });
  }
});

describe('3-5. cd tracking', () => {
  test('3. a bare cd goes home', () => {
    assert.deepStrictEqual(
      project(detectBashWrites('cd && echo x > a', { cwd: '/repo', home: '/h' })),
      [{ form: 'redirect', path: '/h/a' }]
    );
  });

  test('4. an unresolvable cd gives a null relative target, an absolute target still resolves', () => {
    assert.deepStrictEqual(detect('cd "$D" && echo x > a.js'), [{ form: 'redirect', path: null }]);
    assert.deepStrictEqual(detect('cd "$D" && echo x > /abs/a.js'), [
      { form: 'redirect', path: '/abs/a.js' },
    ]);
  });

  test('5. popd and cd - lose the directory', () => {
    assert.deepStrictEqual(detect('popd; echo x > a'), [{ form: 'redirect', path: null }]);
    assert.deepStrictEqual(detect('cd -; echo x > a'), [{ form: 'redirect', path: null }]);
  });

  test('a cd applies to later segments only, never to its own words', () => {
    assert.deepStrictEqual(detect('cd sub > log.txt && echo x > a'), [
      { form: 'redirect', path: '/repo/log.txt' },
      { form: 'redirect', path: '/repo/sub/a' },
    ]);
  });

  test('cd chains compose, and ~ uses the injected home', () => {
    assert.deepStrictEqual(detect('cd a && cd b && echo x > f'), [
      { form: 'redirect', path: '/repo/a/b/f' },
    ]);
    assert.deepStrictEqual(detect('echo x > ~/f', { home: '/h' }), [
      { form: 'redirect', path: '/h/f' },
    ]);
  });

  test('pushd with no argument swaps directories, so the base is unknown', () => {
    assert.deepStrictEqual(detect('pushd; echo x > a'), [{ form: 'redirect', path: null }]);
  });

  test('no cwd: a relative target is null and an absolute one resolves', () => {
    assert.deepStrictEqual(project(detectBashWrites('echo x > a')), [
      { form: 'redirect', path: null },
    ]);
    assert.deepStrictEqual(project(detectBashWrites('echo x > /abs/a')), [
      { form: 'redirect', path: '/abs/a' },
    ]);
  });
});

describe('6-7. shell recursion', () => {
  test('6. the depth is exhausted at 3', () => {
    assert.deepStrictEqual(detectBashWrites('bash -c "echo x > a"', { cwd: CWD, depth: 3 }), []);
  });

  test('6b. two nested shells reach the write, a third level does not', () => {
    const two = "bash -c \"bash -c 'echo x > a'\"";
    assert.deepStrictEqual(detect(two), [{ form: 'redirect', path: '/repo/a' }]);
    const three = 'bash -c "bash -c \\"bash -c \'echo x > a\'\\""';
    assert.deepStrictEqual(detect(three), []);
  });

  test('7. a heredoc fed to a shell is code, a heredoc fed to a script is its stdin', () => {
    assert.deepStrictEqual(detect("bash <<'EOF'\nsed -i 's/a/b/' src/a.js\nEOF"), [
      { form: 'sed-i', path: '/repo/src/a.js' },
    ]);
    assert.deepStrictEqual(detect("bash run.sh <<'EOF'\nsed -i x f\nEOF"), []);
  });

  test('bash -lc and the cwd the recursion inherits', () => {
    assert.deepStrictEqual(detect("cd sub && bash -lc 'echo x > a'"), [
      { form: 'redirect', path: '/repo/sub/a' },
    ]);
  });

  test('a shell script operand with -c absent is not parsed', () => {
    assert.deepStrictEqual(detect('sh scripts/gen.sh > out.txt'), [
      { form: 'redirect', path: '/repo/out.txt' },
    ]);
  });
});

describe('8-10. wrappers and per-command operands', () => {
  test('8. sudo and env wrappers', () => {
    assert.deepStrictEqual(detect('sudo tee /etc/hosts'), [{ form: 'tee', path: '/etc/hosts' }]);
    assert.deepStrictEqual(detect("env -i PATH=/bin sed -i 's/a/b/' f"), [
      { form: 'sed-i', path: '/repo/f' },
    ]);
  });

  test('command -v does not run the command', () => {
    assert.deepStrictEqual(detect("command -v sed; sed -i 's/a/b/' f"), [
      { form: 'sed-i', path: '/repo/f' },
    ]);
  });

  test('9. sed -i -f takes the script file, not a target', () => {
    assert.deepStrictEqual(detect('sed -i -f fix.sed src/a.js src/b.js'), [
      { form: 'sed-i', path: '/repo/src/a.js' },
      { form: 'sed-i', path: '/repo/src/b.js' },
    ]);
  });

  test('9b. sed --in-place=SUFFIX', () => {
    assert.deepStrictEqual(detect("sed --in-place=.bak 's/a/b/' f"), [
      { form: 'sed-i', path: '/repo/f' },
    ]);
  });

  test('9c. sed -n -i, and a printed sed that is not in place', () => {
    assert.deepStrictEqual(detect("sed -n -i 's/a/b/p' f"), [{ form: 'sed-i', path: '/repo/f' }]);
    assert.deepStrictEqual(detect("sed -n 's/a/b/p' f"), []);
  });

  test('9d. perl: a -Mstrict flag is not in-place', () => {
    assert.deepStrictEqual(detect("perl -Mstrict -e 'print 1' f"), []);
    assert.deepStrictEqual(detect("perl -i.bak -pe 's/a/b/' f g"), [
      { form: 'perl-i', path: '/repo/f' },
      { form: 'perl-i', path: '/repo/g' },
    ]);
  });

  test('10. cp into a directory, and a single operand', () => {
    assert.deepStrictEqual(detect('cp -r lib dest/'), [
      { form: 'cp', path: '/repo/dest', sources: ['/repo/lib'], into: true },
    ]);
    assert.deepStrictEqual(detect('cp a'), []);
  });

  test('10b. cp -- ends the options', () => {
    assert.deepStrictEqual(detect('cp -- -a b'), [
      { form: 'cp', path: '/repo/b', sources: ['/repo/-a'], into: false },
    ]);
  });

  test('10c. mv -t and a dot destination', () => {
    assert.deepStrictEqual(detect('mv -t dest a b'), [
      { form: 'mv', path: '/repo/dest', sources: ['/repo/a', '/repo/b'], into: true },
    ]);
    assert.deepStrictEqual(detect('cp a .'), [
      { form: 'cp', path: '/repo', sources: ['/repo/a'], into: true },
    ]);
  });

  test('redirect targets: devices, fd duplication and a mid-word > are not writes', () => {
    assert.deepStrictEqual(detect('echo x > /dev/null 2>&1'), []);
    assert.deepStrictEqual(detect('echo a->b'), []);
  });

  test('a redirect before the command word, and a bare redirect with no target', () => {
    assert.deepStrictEqual(detect('> out.txt echo x'), [{ form: 'redirect', path: '/repo/out.txt' }]);
    assert.deepStrictEqual(detect('echo x >'), []);
  });
});

describe('11-12. inline interpreter writes', () => {
  test('11. a name bound to two different literals is unresolvable', () => {
    assert.deepStrictEqual(detect("python3 - <<'EOF'\np='a.py'\np='b.py'\nopen(p,'w')\nEOF"), [
      { form: 'python', path: null },
    ]);
  });

  test('11b. a name bound to the same literal twice still resolves', () => {
    assert.deepStrictEqual(detect("python3 - <<'EOF'\np='a.py'\np='a.py'\nopen(p,'w')\nEOF"), [
      { form: 'python', path: '/repo/a.py' },
    ]);
  });

  test('11c. a name rebound to something that is not a literal is unresolvable', () => {
    assert.deepStrictEqual(detect("python3 - <<'EOF'\np='a.py'\np=p+'x'\nopen(p,'w')\nEOF"), [
      { form: 'python', path: null },
    ]);
  });

  test('12. a template literal with an expansion is unresolvable', () => {
    assert.deepStrictEqual(
      detect('node -e "require(\'fs\').writeFileSync(\\`${d}/a.json\\`, \'\')"'),
      [{ form: 'node', path: null }]
    );
  });

  test('12b. a template literal without an expansion is a literal', () => {
    assert.deepStrictEqual(
      detect('node -e "require(\'fs\').writeFileSync(\\`src/a.json\\`, \'\')"'),
      [{ form: 'node', path: '/repo/src/a.json' }]
    );
  });

  test('python modes: only w, a, x and + write', () => {
    for (const mode of ['r', 'rb', 'rt']) {
      assert.deepStrictEqual(detect(`python3 -c "open('f', '${mode}')"`), [], mode);
    }
    for (const mode of ['w', 'wb', 'a', 'ab', 'x', 'r+']) {
      assert.deepStrictEqual(detect(`python3 -c "open('f', '${mode}')"`), [
        { form: 'python', path: '/repo/f' },
      ], mode);
    }
    assert.deepStrictEqual(detect('python3 -c "open(\'f\', encoding=\'utf8\')"'), []);
  });

  test('python: a mode that is not a literal is no write, a path that is not a literal is null', () => {
    assert.deepStrictEqual(detect('python3 -c "open(\'f\', m)"'), []);
    assert.deepStrictEqual(detect('python3 -c "open(os.path.join(d, \'f\'), \'w\')"'), [
      { form: 'python', path: null },
    ]);
    assert.deepStrictEqual(detect('python3 -c "open(f\'{d}/a\', \'w\')"'), [
      { form: 'python', path: null },
    ]);
    assert.deepStrictEqual(detect('python3 -c "open(d + \'/a\', \'w\')"'), [
      { form: 'python', path: null },
    ]);
  });

  test('python: a Path bound to a name, write_bytes, and an unbound receiver', () => {
    assert.deepStrictEqual(
      detect("python3 - <<'EOF'\nfrom pathlib import Path\np = Path('src/a.py')\np.write_bytes(b'x')\nEOF"),
      [{ form: 'python', path: '/repo/src/a.py' }]
    );
    assert.deepStrictEqual(detect('python3 -c "target.write_text(\'x\')"'), [
      { form: 'python', path: null },
    ]);
  });

  test('python and node program text is only the interpreter operand, never a script file', () => {
    assert.deepStrictEqual(detect("python3 tools/gen.py <<'EOF'\nopen('f','w')\nEOF"), []);
    assert.deepStrictEqual(detect("node scripts/build.js <<'EOF'\nrequire('fs').writeFileSync('f','')\nEOF"), []);
  });

  test('python -c code beats a heredoc, and node -p and --eval take code', () => {
    assert.deepStrictEqual(detect("python3 -c \"open('a','w')\" <<'EOF'\nopen('b','w')\nEOF"), [
      { form: 'python', path: '/repo/a' },
    ]);
    assert.deepStrictEqual(detect('node -p "require(\'fs\').appendFileSync(\'f\', \'\')"'), [
      { form: 'node', path: '/repo/f' },
    ]);
    assert.deepStrictEqual(detect('node --eval "require(\'fs\').createWriteStream(\'f\')"'), [
      { form: 'node', path: '/repo/f' },
    ]);
  });

  test('node: a name bound by const, and a path that is not a literal', () => {
    assert.deepStrictEqual(
      detect('node -e "const f = \'a.json\'; require(\'fs\').writeFileSync(f, \'\')"'),
      [{ form: 'node', path: '/repo/a.json' }]
    );
    assert.deepStrictEqual(
      detect('node -e "require(\'fs\').writeFileSync(path.join(d, \'a\'), \'\')"'),
      [{ form: 'node', path: null }]
    );
    assert.deepStrictEqual(detect('node -e "require(\'fs\').readFileSync(\'f\')"'), []);
  });

  test('inline code resolves against the cd-tracked base, and a null base gives null', () => {
    assert.deepStrictEqual(detect('cd sub && python3 -c "open(\'a\',\'w\')"'), [
      { form: 'python', path: '/repo/sub/a' },
    ]);
    assert.deepStrictEqual(detect('cd "$D" && python3 -c "open(\'a\',\'w\')"'), [
      { form: 'python', path: null },
    ]);
    assert.deepStrictEqual(detect('cd "$D" && python3 -c "open(\'/abs/a\',\'w\')"'), [
      { form: 'python', path: '/abs/a' },
    ]);
  });

  test('inline writes carry the segment and the argument text', () => {
    const [w] = detectBashWrites('ls; python3 -c "open(\'a\',\'w\')"', { cwd: CWD });
    assert.strictEqual(w.segment, 1);
    assert.strictEqual(w.raw, "'a'");
  });

  test('an interpreter inside bash -c is parsed', () => {
    assert.deepStrictEqual(detect("bash -c \"python3 -c \\\"open('a','w')\\\"\""), [
      { form: 'python', path: '/repo/a' },
    ]);
  });
});

describe('13. an input redirect is not a write', () => {
  test('python3 - < gen.py', () => {
    assert.deepStrictEqual(detect('python3 - < gen.py'), []);
  });

  test('cat < in.txt > out.txt writes only out.txt', () => {
    assert.deepStrictEqual(detect('cat < in.txt > out.txt'), [
      { form: 'redirect', path: '/repo/out.txt' },
    ]);
  });
});

describe('14. mayWrite', () => {
  test('false for commands that cannot write', () => {
    for (const c of ['ls -la', 'git status', 'npm test', 'rg -n foo src']) {
      assert.strictEqual(mayWrite(c), false, c);
    }
  });

  test('true for every WRITE_CASES command', () => {
    for (const c of WRITE_CASES) assert.strictEqual(mayWrite(c.cmd), true, c.name);
  });
});

describe('15. purity', () => {
  test('the module source requires neither fs nor child_process', () => {
    const src = fs.readFileSync(path.join(__dirname, 'bash-write-detect.cjs'), 'utf8');
    assert.doesNotMatch(src, /require\(\s*['"](?:node:)?(?:fs|child_process)['"]\s*\)/);
  });
});
