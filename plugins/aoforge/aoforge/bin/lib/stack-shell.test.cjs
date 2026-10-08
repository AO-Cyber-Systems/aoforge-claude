'use strict';

// stack-shell.test.cjs — Test list (TRD 42-03, tests 11-14 plus scanner unit cases)
//
// - S11 Joins `\` continuations. `\\` at EOL is not a continuation.
// - S12 Drop rules, table-driven: comment, blank, echo, printf, test -f, [ -d x ], control words,
//       set/export/cd/mkdir/chmod, git config, curl, gh, docker login, doctl, a bare --flag, and
//       `${{ x }}`-only text all produce no invocation.
// - S13 Prefix stripping: env assignments land in `env`, `sudo`/`time` vanish, a leading `cd`
//       becomes `cwd` for the rest of the chain.
// - S14 Heredoc bodies are skipped.
// - S15 splitTopLevel splits on `&&` / `;` / newline only at top level, outside quotes, `$( )`
//       and `${{ }}`; pipes never split. isFragment recognises flag / `$` / operator fragments.
// - S16 Fixture module: every builder returns an existing directory.
//
// Fixtures are hand-built (`__fixtures__/stack-ci-fixtures.cjs`), never generated.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const {
  normalizeScript,
  splitTopLevel,
  isFragment,
  splitWords,
  DROP_TOOLS,
} = require('./stack-shell.cjs');
const fixtures = require('./__fixtures__/stack-ci-fixtures.cjs');

const texts = (input, opts) => normalizeScript(input, opts).map((i) => i.text);

describe('S11 line continuations', () => {
  test('a trailing backslash joins the next line into ONE command', () => {
    const out = normalizeScript(['gosec -exclude=G304 \\', '  -fmt sarif ./...']);
    assert.equal(out.length, 1);
    assert.equal(out[0].text, 'gosec -exclude=G304 -fmt sarif ./...');
    assert.equal(out[0].tool, 'gosec');
  });

  test('several continuations chain into one command', () => {
    assert.deepEqual(texts('go test \\\n  -race \\\n  -count=1 \\\n  ./...'), ['go test -race -count=1 ./...']);
  });

  test('a string input with real newlines behaves like the array form', () => {
    assert.deepEqual(texts('flutter build ipa \\\n  --build-number=7'), ['flutter build ipa --build-number=7']);
  });

  test('an escaped backslash (`\\\\`) at end of line is NOT a continuation', () => {
    // The line ends in two backslashes: one literal backslash, then a fresh line.
    const out = texts(['echo-tool a\\\\', 'go test ./...']);
    assert.equal(out.length, 2);
    assert.equal(out[1], 'go test ./...');
  });

  test('three trailing backslashes (odd) DO continue', () => {
    assert.deepEqual(texts(['go vet \\\\\\', './...']), ['go vet \\\\ ./...']);
  });

  test('no output ever ends in a backslash or starts with a bare flag', () => {
    const out = texts('flutter build ipa \\\n  --build-number="${{ inputs.n }}" \\\n  --release\ngosec \\\n  -fmt sarif ./...');
    for (const t of out) {
      assert.ok(!t.endsWith('\\'), `dangling backslash: ${t}`);
      assert.ok(!t.startsWith('-'), `flag fragment: ${t}`);
    }
    assert.equal(out.length, 2);
  });

  test('a comment line ending in a backslash does not swallow the next command', () => {
    assert.deepEqual(texts(['# note \\', 'go test ./...']), ['go test ./...']);
  });

  test('a continuation on the very last line is closed, not dangling', () => {
    assert.deepEqual(texts(['go test ./... \\']), ['go test ./...']);
  });
});

describe('S12 drop rules', () => {
  const DROPPED = [
    ['comment', '# run the tests'],
    ['indented comment', '   # tests'],
    ['blank', ''],
    ['whitespace only', '   \t '],
    ['echo', 'echo "Published svc 1.2.3"'],
    ['printf', 'printf "%s\\n" hi'],
    ['test -f', 'test -f svc/go.mod'],
    ['test -d', 'test -d app'],
    ['[ -d x ]', '[ -d svc ]'],
    ['[[ -f x ]]', '[[ -f svc/go.mod ]]'],
    ['if', 'if'],
    ['if with a conditional', 'if [ -d svc ]; then'],
    ['then', 'then'],
    ['fi', 'fi'],
    ['else', 'else'],
    ['do', 'do'],
    ['done', 'done'],
    ['open brace', '{'],
    ['close brace', '}'],
    ['bare ||', '||'],
    ['set -euo pipefail', 'set -euo pipefail'],
    ['export X=1', 'export X=1'],
    ['cd x', 'cd svc'],
    ['mkdir -p x', 'mkdir -p build/out'],
    ['chmod +x x', 'chmod +x scripts/run.sh'],
    ['git config', 'git config user.name ci-bot'],
    ['curl', 'curl -fsSL https://example.invalid/install.sh'],
    ['gh', 'gh release create v1'],
    ['docker login', 'docker login ghcr.io -u user'],
    ['doctl', 'doctl kubernetes cluster kubeconfig save c1'],
    ['a bare --flag', '--build-number=7'],
    ['a bare -x flag', '-race'],
    ['${{ x }}-only', '${{ inputs.command }}'],
    ['two ${{ }} only', '${{ a }} ${{ b }}'],
    ['a leading $ var', '$GOBIN/tool run'],
  ];
  for (const [name, line] of DROPPED) {
    test(`drops: ${name}`, () => {
      assert.deepEqual(normalizeScript([line]), []);
    });
  }

  test('the control-fragment block yields nothing', () => {
    assert.deepEqual(normalizeScript(['test -f svc/go.mod || {', '  echo missing; exit 1', '}']), []);
  });

  test('echo plus a real command keeps only the command', () => {
    assert.deepEqual(texts(['echo x', 'make build']), ['make build']);
  });

  test('`if <command>; then` keeps the condition command, not the keyword', () => {
    assert.deepEqual(texts('if go vet ./...; then echo ok; fi'), ['go vet ./...']);
  });

  test('`do <command>` keeps the command; loop scaffolding drops', () => {
    assert.deepEqual(texts('for d in a b; do go test ./$d; done'), ['go test ./$d']);
  });

  test('`test -z "$(gofmt -l .)"` is a real format gate and is KEPT', () => {
    const out = texts('test -z "$(gofmt -l .)"');
    assert.deepEqual(out, ['test -z "$(gofmt -l .)"']);
  });

  test('a `[ -z "$(...)" ]` conditional that runs a tool is KEPT', () => {
    assert.deepEqual(texts('[ -z "$(gofmt -l .)" ]'), ['[ -z "$(gofmt -l .)" ]']);
  });

  test('git subcommands that are not plumbing stay (git diff --exit-code)', () => {
    assert.deepEqual(texts('git diff --exit-code'), ['git diff --exit-code']);
  });

  test('DROP_TOOLS is exported and names the spec tools', () => {
    for (const t of ['echo', 'printf', 'set', 'export', 'cd', 'mkdir', 'chmod', 'curl', 'gh', 'doctl']) {
      assert.ok(DROP_TOOLS.has(t), `${t} should be in DROP_TOOLS`);
    }
  });
});

describe('S13 prefix stripping', () => {
  test('a leading VAR=val lands in env; the tool is what follows', () => {
    const [inv] = normalizeScript(['HOME=/root ginkgo -r -p']);
    assert.equal(inv.tool, 'ginkgo');
    assert.equal(inv.text, 'ginkgo -r -p');
    assert.deepEqual(inv.env, { HOME: '/root' });
    assert.deepEqual(inv.argv, ['ginkgo', '-r', '-p']);
  });

  test('several assignments, one quoted with a space', () => {
    const [inv] = normalizeScript(['CGO_ENABLED=0 GOFLAGS="-a -v" go build ./...']);
    assert.equal(inv.tool, 'go');
    assert.deepEqual(inv.env, { CGO_ENABLED: '0', GOFLAGS: '-a -v' });
  });

  test('an assignment with no command produces nothing', () => {
    assert.deepEqual(normalizeScript(['FOO=bar']), []);
  });

  test('`cd svc && go vet ./...` gives `go vet ./...` with cwd `svc`', () => {
    const out = normalizeScript(['cd svc && go vet ./...']);
    assert.equal(out.length, 1);
    assert.equal(out[0].text, 'go vet ./...');
    assert.equal(out[0].cwd, 'svc');
  });

  test('a cd on its own line applies to the following lines', () => {
    const out = normalizeScript(['cd svc', 'go vet ./...', 'go test ./...']);
    assert.deepEqual(out.map((i) => i.cwd), ['svc', 'svc']);
  });

  test('no cd and no option gives cwd null', () => {
    assert.equal(normalizeScript(['go vet ./...'])[0].cwd, null);
  });

  test('the cwd option seeds the cwd, and a relative cd nests under it', () => {
    const out = normalizeScript(['go vet ./...', 'cd inner', 'go test ./...'], { cwd: 'svc' });
    assert.deepEqual(out.map((i) => i.cwd), ['svc', 'svc/inner']);
  });

  test('`cd ..` climbs back to the repo root as null', () => {
    const out = normalizeScript(['cd svc && cd .. && go test ./...']);
    assert.equal(out[0].cwd, null);
  });

  test('a cd inside a subshell does not leak to later lines', () => {
    const out = normalizeScript(['(cd svc && go vet ./...)', 'go test ./...']);
    assert.deepEqual(out.map((i) => [i.text, i.cwd]), [['go vet ./...', 'svc'], ['go test ./...', null]]);
  });

  test('sudo and time are stripped', () => {
    assert.deepEqual(texts(['sudo go vet ./...', 'time go test ./...']), ['go vet ./...', 'go test ./...']);
    assert.equal(normalizeScript(['sudo -E go vet ./...'])[0].text, 'go vet ./...');
    assert.equal(normalizeScript(['sudo -u root go vet ./...'])[0].text, 'go vet ./...');
    assert.equal(normalizeScript(['time -p go build ./...'])[0].tool, 'go');
  });

  test('env / sudo / time combine in any order', () => {
    const [inv] = normalizeScript(['time FOO=1 sudo -E BAR=2 go test ./...']);
    assert.equal(inv.text, 'go test ./...');
    assert.deepEqual(inv.env, { FOO: '1', BAR: '2' });
  });

  test('argv respects quotes and drops the quote characters', () => {
    const [inv] = normalizeScript(["sed -i 's|a|b|' svc/version.txt"]);
    assert.deepEqual(inv.argv, ['sed', '-i', 's|a|b|', 'svc/version.txt']);
    assert.equal(inv.text, "sed -i 's|a|b|' svc/version.txt");
  });

  test('a `${{ }}` expression stays one argv word', () => {
    const [inv] = normalizeScript(['flutter build ipa --build-number=${{ inputs.n }} --release']);
    assert.deepEqual(inv.argv, ['flutter', 'build', 'ipa', '--build-number=${{ inputs.n }}', '--release']);
  });

  test('a && inside a `${{ }}` expression never splits', () => {
    const out = texts('deploy --if "${{ a && b }}"');
    assert.equal(out.length, 1);
  });

  test('pipes are part of ONE invocation', () => {
    assert.deepEqual(texts('go test ./... | tee out.txt'), ['go test ./... | tee out.txt']);
  });

  test('a trailing comment is stripped from the command', () => {
    assert.deepEqual(texts('go test ./... # run everything'), ['go test ./...']);
  });
});

describe('S14 heredocs', () => {
  test('a heredoc body is skipped and records nothing', () => {
    assert.deepEqual(normalizeScript(['cat <<EOF > svc/config.yaml', 'go test ./...', 'name: x', 'EOF']), []);
  });

  test('commands after the terminator are kept', () => {
    assert.deepEqual(texts(['cat <<EOF > c.yaml', 'k: v', 'EOF', 'go build ./...']), ['go build ./...']);
  });

  test('a quoted delimiter and a `<<-` delimiter both work', () => {
    assert.deepEqual(texts(["cat <<'END' > a", 'go test', 'END', 'cat <<-DONE > b', '\tgo vet', '\tDONE', 'make build']), ['make build']);
  });

  test('a body line ending in a backslash does not eat the terminator', () => {
    assert.deepEqual(texts(['cat <<EOF > a', 'line \\', 'EOF', 'make build']), ['make build']);
  });

  test('a non-cat consumer of a heredoc is dropped too', () => {
    assert.deepEqual(normalizeScript(['bash <<EOF', 'go test ./...', 'EOF']), []);
  });

  test('a heredoc mentioned inside a comment does not start skipping', () => {
    assert.deepEqual(texts(['# cat <<EOF', 'go test ./...']), ['go test ./...']);
  });

  test('a here-string (<<<) is not a heredoc', () => {
    assert.deepEqual(texts(['grep -q x <<< "$OUT"', 'go test ./...']).length, 2);
  });
});

describe('S15 splitTopLevel / isFragment / splitWords', () => {
  test('splits on && and ; and newline', () => {
    assert.deepEqual(splitTopLevel('a && b; c\nd'), ['a', 'b', 'c', 'd']);
  });

  test('never splits inside single quotes', () => {
    assert.deepEqual(splitTopLevel("sed -i 's|a|b|' f && go test ./..."), ["sed -i 's|a|b|' f", 'go test ./...']);
    assert.deepEqual(splitTopLevel("echo 'a && b; c'"), ["echo 'a && b; c'"]);
  });

  test('never splits inside double quotes', () => {
    assert.deepEqual(splitTopLevel('echo "a && b; c" && go vet'), ['echo "a && b; c"', 'go vet']);
  });

  test('never splits inside $( ), including nested quotes', () => {
    assert.deepEqual(
      splitTopLevel('test -z "$(gofmt -l . | grep -v "vendor"; true)" && go vet'),
      ['test -z "$(gofmt -l . | grep -v "vendor"; true)"', 'go vet'],
    );
    assert.deepEqual(splitTopLevel('x=$(a && b) && c'), ['x=$(a && b)', 'c']);
  });

  test('never splits inside a backtick span or ${{ }}', () => {
    assert.deepEqual(splitTopLevel('x=`a; b` && c'), ['x=`a; b`', 'c']);
    assert.deepEqual(splitTopLevel('run "${{ a && b }}" && c'), ['run "${{ a && b }}"', 'c']);
  });

  test('an escaped ; does not split (find -exec ... \\;)', () => {
    assert.deepEqual(splitTopLevel('find . -name x -exec rm {} \\; && go test'), ['find . -name x -exec rm {} \\;', 'go test']);
  });

  test('a single | and || never split', () => {
    assert.deepEqual(splitTopLevel('a | b || c'), ['a | b || c']);
  });

  test('a single & (redirect, background) does not split', () => {
    assert.deepEqual(splitTopLevel('go test ./... 2>&1'), ['go test ./... 2>&1']);
  });

  test('a comment starting a word removes the rest of the line', () => {
    assert.deepEqual(splitTopLevel('go vet # a && b\ngo test'), ['go vet', 'go test']);
    assert.deepEqual(splitTopLevel("sed 's/#/x/' f"), ["sed 's/#/x/' f"]);
    assert.deepEqual(splitTopLevel('echo ${#arr[@]}'), ['echo ${#arr[@]}']);
  });

  test('empty and whitespace input give []', () => {
    assert.deepEqual(splitTopLevel(''), []);
    assert.deepEqual(splitTopLevel('  \n ; '), []);
    assert.deepEqual(splitTopLevel(null), []);
  });

  test('isFragment: flags, $ tokens, operators, ${{ }}-only, comments and empties', () => {
    for (const t of ['', '  ', '-x', '--build-number=1', '$VAR', '$(cmd)', '${{ x }}', '${{ a }} ${{ b }}', '|| true', '| grep x', ') ', '# c']) {
      assert.equal(isFragment(t), true, `expected fragment: ${JSON.stringify(t)}`);
    }
    for (const t of ['go test ./...', 'gosec -fmt sarif', 'flutter build ipa --x', './scripts/run.sh', 'x --y']) {
      assert.equal(isFragment(t), false, `expected command: ${JSON.stringify(t)}`);
    }
  });

  test('splitWords honours quotes, escapes and $( )', () => {
    assert.deepEqual(splitWords('a "b c" \'d e\' f\\ g'), ['a', 'b c', 'd e', 'f g']);
    assert.deepEqual(splitWords('x "$(echo a b)" y'), ['x', '$(echo a b)', 'y']);
    assert.deepEqual(splitWords('  '), []);
  });

  test('an unterminated quote never throws', () => {
    assert.doesNotThrow(() => normalizeScript(['echo "unterminated', 'go test ./...']));
    assert.doesNotThrow(() => splitTopLevel("a 'b && c"));
  });
});

describe('S16 fixture module', () => {
  const BUILDERS = [
    'continuationShape', 'flagFragmentShape', 'commentAsTestShape', 'echoOnlyShape',
    'controlFragmentShape', 'workingDirDefaultsShape', 'usesActionsShape', 'quotedPipeShape',
    'mixedToolsShape', 'scheduleShape', 'multiFileShape', 'malformedShape',
  ];
  for (const name of BUILDERS) {
    test(`${name}() returns an existing dir holding .github/workflows`, () => {
      assert.equal(typeof fixtures[name], 'function');
      const root = fixtures[name]();
      try {
        assert.ok(fs.statSync(root).isDirectory());
        assert.ok(fs.readdirSync(`${root}/.github/workflows`).length > 0);
      } finally {
        fixtures.cleanup(root);
      }
    });
  }

  test('cleanup removes the roots and tolerates a missing one', () => {
    const a = fixtures.continuationShape();
    const b = fixtures.echoOnlyShape();
    fixtures.cleanup(a, b, '/nonexistent/df-stack-ci-xyz');
    assert.equal(fs.existsSync(a), false);
    assert.equal(fs.existsSync(b), false);
  });

  test('fixture workflow text is invented: it names svc/app/chart, not a real repo', () => {
    const all = Object.values(fixtures.TEXT).join('\n');
    assert.ok(/\bsvc\b/.test(all));
    assert.ok(!/AO-Cyber|aocyber|github\.com\/[A-Za-z]/i.test(all));
  });
});
