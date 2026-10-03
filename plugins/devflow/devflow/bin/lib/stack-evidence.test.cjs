'use strict';

// stack-evidence.test.cjs — Test list (TRD 35-04, E group)
//
// - E1 CI `run: make test` (no Makefile to read) → {key:'test', command:'make test', source:'ci',
//   sourceFile:'.github/workflows/ci.yml', confidence:'low'} — the key comes from the target NAME only
//   because there is no body to read (TRD 42-07 changed `source` from the file to the evidence kind).
// - E2 `run: |` block → each indented line considered.
// - E3 Makefile targets → `make <t>`; `.PHONY:` and `X := y` ignored.
// - E4 justfile recipes → `just <r>`.
// - E5 package.json scripts: test → `npm test`, lint → `npm run lint`; malformed JSON → no
//   evidence, no throw.
// - E6 codebase/STACK.md Commands table beats CI for the same key.
// - E7 `from:'research'` reads `.planning/research/STACK.md`, not codebase.
// - E8 same key in a Makefile, CI and package.json → all three present, in preference order
//   runner > ci > manifest (TRD 42-07 truth 2; it was CI-first under the 35-04 scraper).
// - E9 `echo hi` → unclassified, dropped.
// - E10 empty repo → [].
// - E11 (42-07 test 16) CI steps and runner targets compose: items carry source, sourceFile, cwd,
//   area, form, runner, confidence and weak; comments, echo and continuations yield no fragment.
// - E12 TESTING.md fenced blocks are read for from=codebase only, as source 'docs'.
//
// Fixtures are hand-built (`makeRepo` below), never generated — per `no_llm_test_data`.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { STANDARD_KEYS, classifyCommand, collectEvidence } = require('./stack-evidence.cjs');

/** makeRepo({ files }) -> absolute repo root, writing each `relPath: content` under it. */
function makeRepo(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-stack-evidence-'));
  for (const [relPath, content] of Object.entries(files)) {
    const full = path.join(root, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
  }
  return root;
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* best effort */ }
}

describe('stack-evidence classifyCommand', () => {
  test('classifies by hint first, then by command tokens', () => {
    assert.equal(classifyCommand('anything', 'test'), 'test');
    assert.equal(classifyCommand('go vet ./...', null), null);
    assert.equal(classifyCommand('run the lint suite', null), 'lint');
  });

  test('STANDARD_KEYS carries the documented eight keys', () => {
    assert.deepStrictEqual(STANDARD_KEYS, [
      'build', 'test', 'lint', 'format', 'fix', 'typecheck', 'audit', 'codegen', 'deps',
    ]);
  });
});

describe('stack-evidence collectEvidence (E group)', () => {
  test('E1: CI `run: make test` classifies as test, keeps the raw command and relative source', () => {
    const root = makeRepo({
      '.github/workflows/ci.yml': [
        'jobs:',
        '  t:',
        '    steps:',
        '      - run: make test',
      ].join('\n'),
    });
    try {
      const evidence = collectEvidence(root, { from: 'codebase' });
      const item = evidence.find((e) => e.key === 'test');
      assert.ok(item, JSON.stringify(evidence));
      assert.equal(item.command, 'make test');
      assert.equal(item.source, 'ci');
      assert.equal(item.sourceFile, '.github/workflows/ci.yml');
      assert.equal(item.cwd, null);
      assert.equal(item.area, '');
      assert.equal(item.runner, 'make');
      assert.equal(item.confidence, 'low', 'no Makefile to read: the key is only the target name');
    } finally {
      cleanup(root);
    }
  });

  test('E2: `run: |` block considers every indented line', () => {
    const root = makeRepo({
      '.github/workflows/ci.yml': [
        'jobs:',
        '  t:',
        '    steps:',
        '      - name: checks',
        '        run: |',
        '          make lint',
        '          make test',
      ].join('\n'),
    });
    try {
      const evidence = collectEvidence(root, { from: 'codebase' });
      assert.ok(evidence.some((e) => e.key === 'lint' && e.command === 'make lint'));
      assert.ok(evidence.some((e) => e.key === 'test' && e.command === 'make test'));
    } finally {
      cleanup(root);
    }
  });

  test('E3: Makefile targets become `make <t>`; .PHONY and `X := y` are ignored', () => {
    const root = makeRepo({
      Makefile: [
        '.PHONY: test lint',
        'X := y',
        'test:',
        '\tgo test ./...',
        'lint:',
        '\tgo vet ./...',
      ].join('\n'),
    });
    try {
      const evidence = collectEvidence(root, { from: 'codebase' });
      assert.ok(evidence.some((e) => e.key === 'test' && e.command === 'make test'));
      assert.ok(evidence.some((e) => e.key === 'lint' && e.command === 'make lint'));
      assert.ok(!evidence.some((e) => e.command.includes('.PHONY')));
      assert.ok(!evidence.some((e) => e.command.includes('X')));
    } finally {
      cleanup(root);
    }
  });

  test('E4: justfile recipes become `just <r>`', () => {
    const root = makeRepo({
      justfile: [
        'test:',
        '    go test ./...',
        'fmt:',
        '    go fmt ./...',
      ].join('\n'),
    });
    try {
      const evidence = collectEvidence(root, { from: 'codebase' });
      assert.ok(evidence.some((e) => e.key === 'test' && e.command === 'just test'));
      assert.ok(evidence.some((e) => e.key === 'format' && e.command === 'just fmt'));
    } finally {
      cleanup(root);
    }
  });

  test('E5: package.json scripts — test -> npm test, lint -> npm run lint; malformed JSON is silent', () => {
    const root = makeRepo({
      'package.json': JSON.stringify({
        scripts: { test: 'jest', lint: 'eslint .', irrelevant: 'echo hi' },
      }),
    });
    try {
      const evidence = collectEvidence(root, { from: 'codebase' });
      assert.ok(evidence.some((e) => e.key === 'test' && e.command === 'npm test'));
      assert.ok(evidence.some((e) => e.key === 'lint' && e.command === 'npm run lint'));
    } finally {
      cleanup(root);
    }

    const badRoot = makeRepo({ 'package.json': '{ not valid json' });
    try {
      assert.doesNotThrow(() => collectEvidence(badRoot, { from: 'codebase' }));
      assert.deepStrictEqual(collectEvidence(badRoot, { from: 'codebase' }), []);
    } finally {
      cleanup(badRoot);
    }
  });

  test('E6: codebase/STACK.md Commands table beats CI for the same key', () => {
    const root = makeRepo({
      '.planning/codebase/STACK.md': [
        '# Technology Stack',
        '',
        '## Commands',
        '',
        '| Key | Command | Evidence |',
        '|-----|---------|----------|',
        '| test | `go test -race ./...` | Makefile |',
      ].join('\n'),
      '.github/workflows/ci.yml': [
        'jobs:',
        '  t:',
        '    steps:',
        '      - run: go test ./...',
      ].join('\n'),
    });
    try {
      const evidence = collectEvidence(root, { from: 'codebase' });
      const testEntries = evidence.filter((e) => e.key === 'test');
      assert.equal(testEntries.length, 2);
      assert.equal(testEntries[0].command, 'go test -race ./...');
      assert.equal(testEntries[0].source, 'declared');
      assert.equal(testEntries[0].sourceFile, '.planning/codebase/STACK.md');
    } finally {
      cleanup(root);
    }
  });

  test('E7: from:"research" reads .planning/research/STACK.md, not codebase', () => {
    const root = makeRepo({
      '.planning/codebase/STACK.md': [
        '## Commands',
        '',
        '| Key | Command | Evidence |',
        '|-----|---------|----------|',
        '| test | `codebase test` | x |',
      ].join('\n'),
      '.planning/research/STACK.md': [
        '## Commands',
        '',
        '| Key | Command | Evidence |',
        '|-----|---------|----------|',
        '| test | `research test` | x |',
      ].join('\n'),
    });
    try {
      const evidence = collectEvidence(root, { from: 'research' });
      const testEntries = evidence.filter((e) => e.key === 'test');
      assert.equal(testEntries.length, 1);
      assert.equal(testEntries[0].command, 'research test');
      assert.equal(testEntries[0].sourceFile, '.planning/research/STACK.md');
    } finally {
      cleanup(root);
    }
  });

  test('E8: same key in a Makefile, CI and package.json — all three present, runner > ci > manifest', () => {
    // 35-04 used `ci test` / `maketool test`, which only classified through the English token
    // `test`; tool semantics (42-03) read the tool, so the fixture now names real test runners.
    const root = makeRepo({
      '.github/workflows/ci.yml': [
        'jobs:',
        '  t:',
        '    steps:',
        '      - run: go test ./...',
      ].join('\n'),
      Makefile: ['test:', '\tgo test -race ./...'].join('\n'),
      'package.json': JSON.stringify({ scripts: { test: 'jest' } }),
    });
    try {
      const evidence = collectEvidence(root, { from: 'codebase' });
      const testEntries = evidence.filter((e) => e.key === 'test');
      assert.equal(testEntries.length, 3, JSON.stringify(testEntries));
      assert.deepStrictEqual(testEntries.map((e) => [e.source, e.command]), [
        ['runner', 'make test'],
        ['ci', 'go test ./...'],
        ['manifest', 'npm test'],
      ]);
      assert.ok(testEntries.every((e) => e.confidence === 'high'), 'every body names a real test tool');
    } finally {
      cleanup(root);
    }
  });

  test('E9: an unclassifiable command is dropped', () => {
    const root = makeRepo({
      '.github/workflows/ci.yml': [
        'jobs:',
        '  t:',
        '    steps:',
        '      - run: echo hi',
      ].join('\n'),
    });
    try {
      const evidence = collectEvidence(root, { from: 'codebase' });
      assert.deepStrictEqual(evidence, []);
    } finally {
      cleanup(root);
    }
  });

  test('E10: an empty repo yields no evidence', () => {
    const root = makeRepo({});
    try {
      assert.deepStrictEqual(collectEvidence(root, { from: 'codebase' }), []);
    } finally {
      cleanup(root);
    }
  });
});

// ─── E11 / E12: structured composition (TRD 42-07 test 16) ──────────────────────

const drafterFx = require('./__fixtures__/stack-drafter-fixtures.cjs');

const FRAGMENT = /^\s*(#|-|\$\{\{|echo\b|printf\b|test -f|\[|if\b|then\b|fi\b|\{|\})|\\\s*$/;

describe('stack-evidence collectEvidence composition (E11-E12, TRD 42-07)', () => {
  test('E11: CI steps and runner targets compose into structured items with cwd, area, form, source', () => {
    const root = drafterFx.evidenceShape();
    try {
      const evidence = collectEvidence(root, { from: 'codebase' });
      for (const item of evidence) {
        for (const field of ['key', 'command', 'form', 'source', 'sourceFile', 'cwd', 'area', 'runner', 'confidence', 'weak']) {
          assert.ok(field in item, `item lacks ${field}: ${JSON.stringify(item)}`);
        }
        assert.ok(!FRAGMENT.test(item.command), `fragment item: ${JSON.stringify(item)}`);
        assert.ok(Array.isArray(item.weak));
      }

      // The continued CI go test is ONE item, in svc (workflow default), in the svc/ area.
      const ciTest = evidence.find((e) => e.source === 'ci' && e.command.startsWith('go test'));
      assert.ok(ciTest, JSON.stringify(evidence));
      assert.equal(ciTest.command, 'go test -count=1 ./...');
      assert.equal(ciTest.key, 'test');
      assert.equal(ciTest.form, 'check');
      assert.equal(ciTest.cwd, 'svc');
      assert.equal(ciTest.area, 'svc/');
      assert.equal(ciTest.runner, null);
      assert.equal(ciTest.confidence, 'high');
      assert.equal(ciTest.sourceFile, '.github/workflows/ci.yml');

      // The CI `make test` (run in svc) reads svc/Makefile's body: a high-confidence test.
      const ciMake = evidence.find((e) => e.source === 'ci' && e.command === 'make test');
      assert.ok(ciMake, JSON.stringify(evidence));
      assert.equal(ciMake.key, 'test');
      assert.equal(ciMake.cwd, 'svc');
      assert.equal(ciMake.runner, 'make');
      assert.equal(ciMake.confidence, 'high');

      // Runner targets are invoked from their own dir: `make test` with cwd svc, not `make -C svc test`.
      const runnerTest = evidence.find((e) => e.source === 'runner' && e.key === 'test');
      assert.ok(runnerTest, JSON.stringify(evidence));
      assert.equal(runnerTest.command, 'make test');
      assert.equal(runnerTest.cwd, 'svc');
      assert.equal(runnerTest.area, 'svc/');
      assert.equal(runnerTest.runner, 'make');
      assert.equal(runnerTest.sourceFile, 'svc/Makefile');
      assert.equal(runnerTest.confidence, 'high');

      // `fmt: gofmt -w .` is the APPLY form of format; `announce: @echo done` is not evidence.
      const fmt = evidence.find((e) => e.key === 'format');
      assert.ok(fmt, JSON.stringify(evidence));
      assert.equal(fmt.command, 'make fmt');
      assert.equal(fmt.form, 'apply');
      assert.ok(!evidence.some((e) => e.command.includes('announce')), 'an echo-only target is not evidence');

      // The root package.json script is a manifest item at the root.
      const lint = evidence.find((e) => e.key === 'lint');
      assert.ok(lint, JSON.stringify(evidence));
      assert.equal(lint.command, 'npm run lint');
      assert.equal(lint.source, 'manifest');
      assert.equal(lint.cwd, null);
      assert.equal(lint.area, '');

      // Nothing from the comment or the echo.
      assert.ok(!evidence.some((e) => /^#|echo/.test(e.command)));
    } finally {
      drafterFx.cleanup(root);
    }
  });

  test('E12: TESTING.md fenced commands are docs evidence for from=codebase only', () => {
    const root = makeRepo({
      '.planning/codebase/TESTING.md': [
        '# Testing',
        '',
        '```bash',
        '# unit tests',
        'go test -race \\',
        '  ./...',
        '```',
        '',
        '```yaml',
        'test: not-a-command',
        '```',
      ].join('\n'),
    });
    try {
      const evidence = collectEvidence(root, { from: 'codebase' });
      assert.deepStrictEqual(evidence.map((e) => [e.key, e.command, e.source, e.sourceFile]), [
        ['test', 'go test -race ./...', 'docs', '.planning/codebase/TESTING.md'],
      ]);
      assert.deepStrictEqual(collectEvidence(root, { from: 'research' }), []);
    } finally {
      cleanup(root);
    }
  });
});

// ─── E13: runner target metadata + body invocations (TRD 42-13 test 13) ─────────

const runnerFx = require('./__fixtures__/stack-runner-fixtures.cjs');

describe('stack-evidence target metadata and bodyInvocations (E13, TRD 42-13)', () => {
  const guardWorkflow = [
    'name: guard',
    'on: [push]',
    'jobs:',
    '  guard:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - run: go test -c -o /tmp/guard.test ./tests/guard/',
    '      - run: task build:macos',
    '',
  ].join('\n');

  test('E13: runner items carry target {name, deps, isDefault, dependedOn, order} and bodyInvocations', () => {
    const root = runnerFx.taskfileDepsShape({ '.github/workflows/guard.yml': guardWorkflow });
    try {
      const evidence = collectEvidence(root, { from: 'codebase', areas: [] });
      const runner = (name) => evidence.find((e) => e.source === 'runner' && e.target && e.target.name === name);

      const bundle = runner('build:bundle');
      assert.ok(bundle, JSON.stringify(evidence));
      assert.equal(bundle.key, 'build');
      assert.deepStrictEqual(
        { ...bundle.target, order: typeof bundle.target.order },
        { name: 'build:bundle', deps: ['gen', 'tidy'], isDefault: false, dependedOn: true, order: 'number' },
        'the `default` task depends on build:bundle',
      );
      assert.deepStrictEqual(bundle.bodyInvocations, ['task build:daemon', 'task build:relay:internal']);

      // TRD 43-01 D5: `build:relay:internal` is `internal: true` in this fixture, so `task
      // build:relay:internal` is not invocable and was never a candidate worth proposing. This
      // test used it as the "called from cmds, not listed in deps" leaf; `build:relay:quickdev`
      // is that same leaf shape without the internal flag.
      assert.equal(runner('build:relay:internal'), undefined, 'an internal task is never a candidate');
      const leaf = runner('build:relay:quickdev');
      assert.ok(leaf, JSON.stringify(evidence));
      assert.equal(leaf.target.dependedOn, false, 'not listed in any deps');
      assert.deepStrictEqual(leaf.bodyInvocations, ['go build -o out/relay ./cmd/relay']);

      const gen = runner('gen');
      assert.ok(gen, JSON.stringify(evidence));
      assert.equal(gen.target.dependedOn, true);
      assert.equal(gen.target.isDefault, false);
      // quickdev is listed BEFORE build:bundle in the file but sorts AFTER it by name.
      assert.ok(leaf.target.order < bundle.target.order, 'file order survives the sorted target list');

      // A direct CI command carries itself as its one body invocation, and no target.
      const guard = evidence.find((e) => e.source === 'ci' && e.key === 'test');
      assert.ok(guard, JSON.stringify(evidence));
      assert.deepStrictEqual(guard.bodyInvocations, ['go test -c -o /tmp/guard.test ./tests/guard/']);
      assert.equal(guard.target, undefined);

      // A CI step that runs a runner target carries that target's body invocations.
      const ciTask = evidence.find((e) => e.source === 'ci' && e.command === 'task build:macos');
      assert.ok(ciTask, JSON.stringify(evidence));
      assert.deepStrictEqual(ciTask.bodyInvocations, ['go build -o out/daemon-darwin ./cmd/daemon']);
      assert.equal(ciTask.target, undefined, 'only runner/manifest items carry a target');
    } finally {
      runnerFx.cleanup(root);
    }
  });

  test('E13b: every item carries a non-empty bodyInvocations array; manifest items carry a target', () => {
    const root = makeRepo({
      'package.json': JSON.stringify({ scripts: { test: 'vitest run', lint: 'eslint .' } }),
      '.planning/codebase/STACK.md': '# Stack\n\n## Commands\n\n| Key | Command |\n|---|---|\n| build | `go build ./...` |\n',
    });
    try {
      const evidence = collectEvidence(root, { from: 'codebase', areas: [] });
      assert.ok(evidence.length >= 3, JSON.stringify(evidence));
      for (const e of evidence) {
        assert.ok(Array.isArray(e.bodyInvocations) && e.bodyInvocations.length > 0, JSON.stringify(e));
      }
      const declared = evidence.find((e) => e.source === 'declared');
      assert.deepStrictEqual(declared.bodyInvocations, ['go build ./...']);
      const test_ = evidence.find((e) => e.source === 'manifest' && e.key === 'test');
      assert.deepStrictEqual(test_.bodyInvocations, ['vitest run']);
      assert.equal(test_.target.name, 'test');
      assert.equal(test_.target.isDefault, false);
    } finally {
      cleanup(root);
    }
  });
});

// ─── TRD 43-01 test 13: internal Taskfile tasks are never candidates ────────────

describe('stack-evidence internal Taskfile tasks (E13c, TRD 43-01 D5)', () => {
  test('E13c: no candidate for an `internal: true` task, but a public caller still expands its body', () => {
    const root = runnerFx.taskfileInternalShape();
    try {
      const evidence = collectEvidence(root, { from: 'codebase', areas: [] });
      const commands = evidence.map((e) => e.command);
      for (const hidden of ['task lint', 'task l', 'task go:mod:tidy', 'task npm:install']) {
        assert.ok(!commands.includes(hidden), `${hidden} is internal, so never proposed: ${JSON.stringify(commands)}`);
      }
      // The public tasks remain candidates.
      assert.ok(commands.includes('task check'), JSON.stringify(commands));
      assert.ok(commands.includes('task test'), JSON.stringify(commands));
      assert.ok(commands.includes('task build'), JSON.stringify(commands));
      // `check` runs `task: lint` (internal, `eslint .`) then `go vet ./...`: the internal task's
      // body is still in the index, so it expands and the node stack shows up in the body.
      const check = evidence.find((e) => e.command === 'task check');
      assert.ok(check.bodyStacks.includes('node'), `the internal body was expanded: ${JSON.stringify(check)}`);
      assert.ok(check.bodyStacks.includes('go'), JSON.stringify(check));
    } finally {
      runnerFx.cleanup(root);
    }
  });

  test('E13d: a public task that only DEPENDS on an internal one still runs its body', () => {
    const root = makeRepo({
      'Taskfile.yml': [
        "version: '3'",
        'tasks:',
        '  prep:',
        '    internal: true',
        '    cmd: eslint .',
        '  lint:',
        '    deps: [prep]',
        '',
      ].join('\n'),
    });
    try {
      const evidence = collectEvidence(root, { from: 'codebase', areas: [] });
      assert.ok(!evidence.some((e) => e.command === 'task prep'), JSON.stringify(evidence));
      const lint = evidence.find((e) => e.command === 'task lint');
      assert.ok(lint, JSON.stringify(evidence));
      assert.deepStrictEqual(lint.bodyStacks, ['node'], 'a prerequisites-only target runs its internal dep');
    } finally {
      cleanup(root);
    }
  });
});

// ─── TRD 42-14 test 8: items carry cwdStatus ──────────────────────────────────

const ciFx = require('./__fixtures__/stack-ci-fixtures.cjs');

const HYGIENE_WF = [
  'name: ci',
  'on: [push]',
  'jobs:',
  '  t:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - name: Root vet',
  '        run: go vet ./...',
  '      - name: Svc test',
  '        working-directory: svc',
  '        run: go test ./...',
  '      - name: Vendored test',
  '        working-directory: vendored-sdk',
  '        run: go test ./...',
  '      - name: Gone build',
  '        working-directory: nope',
  '        run: go build ./...',
  '',
].join('\n');

describe('stack-evidence cwdStatus (E14, TRD 42-14 test 8)', () => {
  test('E14a: the default hygiene (no git): root ok, real dir ok, nested repo nested_repo, absent dir missing', () => {
    const root = makeRepo({
      '.github/workflows/ci.yml': HYGIENE_WF,
      'svc/go.mod': 'module example.com/svc\n',
      'vendored-sdk/go.mod': 'module example.com/vendoredsdk\n',
      'vendored-sdk/.git/HEAD': 'ref: refs/heads/main\n',
    });
    try {
      const evidence = collectEvidence(root, { areas: [] });
      assert.ok(evidence.length >= 4, JSON.stringify(evidence));
      for (const item of evidence) assert.ok(typeof item.cwdStatus === 'string', `no cwdStatus: ${JSON.stringify(item)}`);
      const at = (cwd, command) => evidence.find((e) => e.cwd === cwd && e.command === command);
      assert.equal(at(null, 'go vet ./...').cwdStatus, 'ok');
      assert.equal(at('svc', 'go test ./...').cwdStatus, 'ok');
      assert.equal(at('vendored-sdk', 'go test ./...').cwdStatus, 'nested_repo');
      assert.equal(at('nope', 'go build ./...').cwdStatus, 'missing');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('E14b: an injected hygiene is primed ONCE with every distinct cwd; an external CI step is external', () => {
    const root = ciFx.selfCheckoutPathShape();
    try {
      const primed = [];
      const hygiene = (cwd) => (cwd === 'go' ? 'untracked' : 'ok');
      hygiene.prime = (cwds) => { primed.push([...cwds]); };
      const evidence = collectEvidence(root, { areas: [], hygiene });
      assert.equal(primed.length, 1, JSON.stringify(primed));
      assert.ok(primed[0].includes('go'), JSON.stringify(primed));
      const unit = evidence.find((e) => e.command === 'go test ./...');
      assert.ok(unit, JSON.stringify(evidence));
      assert.equal(unit.cwd, 'go', 'svcrepo/go is normalised to go');
      assert.equal(unit.cwdStatus, 'untracked');
      const lib = evidence.find((e) => e.command === 'flutter analyze');
      assert.ok(lib, JSON.stringify(evidence));
      assert.equal(lib.cwd, 'libs/pkg-a');
      assert.equal(lib.cwdStatus, 'external');
    } finally {
      ciFx.cleanup(root);
    }
  });
});

// ─── TRD 42-15 test 12: items carry bodyStacks and effectiveArea ──────────────
//
// bodyStacks: stack-classify.toolStack of each body invocation that classifies to the item's key
// (a nested runner call is followed to the body it runs); with none, the tools alone (recovery).
// effectiveArea: the longest area containing where that body runs (a `cd x &&`, a Taskfile
// `dir:`, `make -C` / `npm --prefix`, a CI working-directory), else the item's own area.

const EFFECTIVE_TASKFILE = [
  "version: '3'",
  '',
  'tasks:',
  '  docs:npm:install:',
  '    cmds:',
  '      - cd site && npm install',
  '',
  '  site:deps:',
  '    dir: site',
  '    cmd: npm ci',
  '',
  '  build:backend:',
  '    cmds:',
  '      - task: build:daemon',
  '',
  '  build:daemon:',
  '    cmd: go build -o dist/bin/daemon ./cmd/daemon',
  '',
  '  test:',
  '    cmds:',
  '      - go test ./...',
  '      - npm --prefix ui test',
  '',
  '  generate:',
  '    cmds:',
  '      - ./tools/regen.sh',
  '',
].join('\n');

const EFFECTIVE_WF = [
  'name: ci',
  'on: [push]',
  'jobs:',
  '  t:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - run: go test -race ./...',
  '      - name: ui unit',
  '        working-directory: ui',
  '        run: npm test',
  '',
].join('\n');

const EFFECTIVE_AREAS = [
  { dir: '', kinds: ['go'], tier: 'go', flags: [] },
  { dir: 'site/', kinds: ['node'], tier: null, unsupported: 'node', flags: ['unsupported'] },
  { dir: 'ui/', kinds: ['node'], tier: null, unsupported: 'node', flags: ['unsupported'] },
];

describe('stack-evidence bodyStacks / effectiveArea (E15, TRD 42-15 test 12)', () => {
  function effectiveRepo() {
    return makeRepo({
      'go.mod': 'module example.com/termrepo\n',
      'Taskfile.yml': EFFECTIVE_TASKFILE,
      Makefile: 'lint-ui:\n\tmake -C ui lint\n',
      'ui/Makefile': 'lint:\n\tnpx eslint .\n',
      'ui/package.json': JSON.stringify({ name: 'ui', private: true, scripts: { test: 'vitest run' } }),
      'site/package.json': JSON.stringify({ name: 'site', private: true, scripts: { build: 'docusaurus build' } }),
      '.github/workflows/ci.yml': EFFECTIVE_WF,
    });
  }

  test('E15a: a `cd x &&` body and a Taskfile `dir:` run in that sub-area', () => {
    const root = effectiveRepo();
    try {
      const evidence = collectEvidence(root, { areas: EFFECTIVE_AREAS, hygiene: () => 'ok' });
      const cdInstall = evidence.find((e) => e.command === 'task docs:npm:install');
      assert.ok(cdInstall, JSON.stringify(evidence.map((e) => e.command)));
      assert.equal(cdInstall.key, 'deps');
      assert.equal(cdInstall.area, '', 'the item itself is invoked from the root');
      assert.equal(cdInstall.effectiveArea, 'site/');
      assert.deepStrictEqual(cdInstall.bodyStacks, ['node']);
      const dirDeps = evidence.find((e) => e.command === 'task site:deps');
      assert.ok(dirDeps);
      assert.equal(dirDeps.effectiveArea, 'site/');
      assert.deepStrictEqual(dirDeps.bodyStacks, ['node']);
    } finally {
      cleanup(root);
    }
  });

  test('E15b: a nested runner call is followed (task: -> go build; make -C ui -> eslint)', () => {
    const root = effectiveRepo();
    try {
      const evidence = collectEvidence(root, { areas: EFFECTIVE_AREAS, hygiene: () => 'ok' });
      const backend = evidence.find((e) => e.command === 'task build:backend');
      assert.ok(backend, JSON.stringify(evidence.map((e) => e.command)));
      assert.equal(backend.effectiveArea, '');
      assert.deepStrictEqual(backend.bodyStacks, ['go'], 'the BODY decides the stack, not the runner');
      const lintUi = evidence.find((e) => e.command === 'make lint-ui');
      assert.ok(lintUi);
      assert.equal(lintUi.key, 'lint');
      assert.equal(lintUi.effectiveArea, 'ui/', 'make -C ui');
      assert.deepStrictEqual(lintUi.bodyStacks, ['node']);
    } finally {
      cleanup(root);
    }
  });

  test('E15c: a mixed body keeps both stacks; with one invocation at the root it stays a root item', () => {
    const root = effectiveRepo();
    try {
      const evidence = collectEvidence(root, { areas: EFFECTIVE_AREAS, hygiene: () => 'ok' });
      const mixed = evidence.find((e) => e.command === 'task test');
      assert.ok(mixed, JSON.stringify(evidence.map((e) => e.command)));
      assert.deepStrictEqual([...mixed.bodyStacks].sort(), ['go', 'node']);
      assert.equal(mixed.effectiveArea, '');
      assert.deepStrictEqual(
        [...mixed.bodyScopes].sort((a, b) => a.stack.localeCompare(b.stack)),
        [{ stack: 'go', area: '' }, { stack: 'node', area: 'ui/' }],
      );
    } finally {
      cleanup(root);
    }
  });

  test('E15d: CI items: the step cwd is the effective area; a plain root step is go at the root', () => {
    const root = effectiveRepo();
    try {
      const evidence = collectEvidence(root, { areas: EFFECTIVE_AREAS, hygiene: () => 'ok' });
      const rootTest = evidence.find((e) => e.source === 'ci' && e.command === 'go test -race ./...');
      assert.ok(rootTest);
      assert.equal(rootTest.effectiveArea, '');
      assert.deepStrictEqual(rootTest.bodyStacks, ['go']);
      const uiTest = evidence.find((e) => e.source === 'ci' && e.command === 'npm test');
      assert.ok(uiTest, JSON.stringify(evidence.map((e) => [e.source, e.command, e.cwd])));
      assert.equal(uiTest.area, 'ui/');
      assert.equal(uiTest.effectiveArea, 'ui/');
      assert.deepStrictEqual(uiTest.bodyStacks, ['node'], 'npm test is followed to its script body (vitest)');
    } finally {
      cleanup(root);
    }
  });

  test('E15e: fallback: an opaque body (a missing wrapper script) keeps the item area and has no stack', () => {
    const root = effectiveRepo();
    try {
      const evidence = collectEvidence(root, { areas: EFFECTIVE_AREAS, hygiene: () => 'ok' });
      const gen = evidence.find((e) => e.command === 'task generate');
      assert.ok(gen, JSON.stringify(evidence.map((e) => e.command)));
      assert.equal(gen.key, 'codegen', 'classified by its NAME only (low confidence)');
      assert.equal(gen.effectiveArea, '');
      assert.deepStrictEqual(gen.bodyStacks, [], 'a name never gives a stack');
      for (const item of evidence) {
        assert.ok(Array.isArray(item.bodyStacks), `no bodyStacks: ${JSON.stringify(item)}`);
        assert.equal(typeof item.effectiveArea, 'string', `no effectiveArea: ${JSON.stringify(item)}`);
      }
    } finally {
      cleanup(root);
    }
  });
});

// TRD 43-04 (D4): a NAME that carries a scenario-class key (e2e, e2e_env) keeps it, so the first
// classified line of a wrapper's body cannot re-key it; the body still supplies tool and scope. A
// neutral name keeps today's body-first-line behaviour. A single-purpose script is flagged for the
// drafter (`singlePurpose`), which only reads the flag.
describe('stack-evidence name-carried scenario keys (E16, TRD 43-04 tests 6-7)', () => {
  const ciRun = (...cmds) => ['jobs:', '  j:', '    steps:', ...cmds.map((c) => `      - run: ${c}`)].join('\n');
  const BUILD_FIRST = '#!/bin/sh\nset -eu\ngo build -o /tmp/docsvc ./cmd/docsvc\n./scripts/scenario.sh\n';

  function scriptRepo(name, body = BUILD_FIRST) {
    return makeRepo({
      [`scripts/${name}`]: body,
      '.github/workflows/ci.yml': ciRun(`./scripts/${name}`),
    });
  }

  test('E16a: a script named docs-e2e.sh with a go build first line is e2e, keeping the body tool and stack', () => {
    const root = scriptRepo('docs-e2e.sh');
    try {
      const item = collectEvidence(root, { areas: [], hygiene: () => 'ok' }).find((e) => e.command === './scripts/docs-e2e.sh');
      assert.ok(item);
      assert.equal(item.key, 'e2e');
      assert.equal(item.source, 'ci');
      assert.equal(item.tool, 'go', 'the body tool is kept for scope');
      assert.ok(item.bodyStacks.includes('go'), JSON.stringify(item.bodyStacks));
      assert.equal(item.confidence, 'low', 'the key came from the name');
    } finally {
      cleanup(root);
    }
  });

  test('E16b: a script named integration-env-up.sh with a go build first line is e2e_env', () => {
    const root = scriptRepo('integration-env-up.sh');
    try {
      const item = collectEvidence(root, { areas: [], hygiene: () => 'ok' }).find((e) => e.command === './scripts/integration-env-up.sh');
      assert.ok(item);
      assert.equal(item.key, 'e2e_env');
      assert.equal(item.tool, 'go');
    } finally {
      cleanup(root);
    }
  });

  test('E16c: a neutral name (run.sh) keeps the body first line: go build is build', () => {
    const root = scriptRepo('run.sh');
    try {
      const item = collectEvidence(root, { areas: [], hygiene: () => 'ok' }).find((e) => e.command === './scripts/run.sh');
      assert.ok(item);
      assert.equal(item.key, 'build');
      assert.equal(item.confidence, 'high');
      assert.equal(item.resolvesTo, 'go build -o /tmp/docsvc ./cmd/docsvc');
    } finally {
      cleanup(root);
    }
  });

  test('E16d: a body that already agrees with the name is kept as is (high confidence, its own form)', () => {
    const root = scriptRepo('smoke-e2e.sh', '#!/bin/sh\nset -eu\nnpx playwright test\n');
    try {
      const item = collectEvidence(root, { areas: [], hygiene: () => 'ok' }).find((e) => e.command === './scripts/smoke-e2e.sh');
      assert.ok(item);
      assert.equal(item.key, 'e2e');
      assert.equal(item.confidence, 'high');
      assert.equal(item.tool, 'playwright');
    } finally {
      cleanup(root);
    }
  });

  test('E16e: runner targets: e2e-stack-up (compose up body) is e2e_env; e2e (playwright) is e2e; a named e2e target keeps e2e over a go test body', () => {
    const root = makeRepo({
      Makefile: [
        '.PHONY: e2e-stack-up e2e test-e2e',
        'e2e-stack-up:',
        '\tdocker compose -f e2e/compose.yml up -d',
        'e2e:',
        '\tnpx playwright test',
        'test-e2e:',
        '\tgo test -tags=e2e ./...',
        '',
      ].join('\n'),
    });
    try {
      const evidence = collectEvidence(root, { areas: [], hygiene: () => 'ok' });
      const keyOf = (cmd) => (evidence.find((e) => e.command === cmd) || {}).key;
      assert.equal(keyOf('make e2e-stack-up'), 'e2e_env');
      assert.equal(keyOf('make e2e'), 'e2e');
      assert.equal(keyOf('make test-e2e'), 'e2e');
    } finally {
      cleanup(root);
    }
  });

  test('E16f: a CI step `docker compose up -d` is e2e_env (body signal), never build or test', () => {
    const root = makeRepo({ '.github/workflows/ci.yml': ciRun('docker compose -f e2e/compose.yml up -d') });
    try {
      const item = collectEvidence(root, { areas: [], hygiene: () => 'ok' })[0];
      assert.ok(item);
      assert.equal(item.key, 'e2e_env');
      assert.equal(item.form, 'mutate');
    } finally {
      cleanup(root);
    }
  });

  test('E16g: singlePurpose is set for check-*, verify-* and *_test.sh scripts, and for bash <script>', () => {
    const root = makeRepo({
      'scripts/check-migrations_test.sh': '#!/bin/sh\ngo run ./cmd/migrate verify\n',
      'scripts/verify-tests.sh': '#!/bin/sh\ngo run ./cmd/schema verify\n',
      'scripts/api_test.sh': '#!/bin/sh\ngo run ./cmd/apitest\n',
      '.github/workflows/ci.yml': ciRun('./scripts/check-migrations_test.sh', 'bash scripts/verify-tests.sh', './scripts/api_test.sh'),
    });
    try {
      const evidence = collectEvidence(root, { areas: [], hygiene: () => 'ok' });
      for (const cmd of ['./scripts/check-migrations_test.sh', 'bash scripts/verify-tests.sh', './scripts/api_test.sh']) {
        const item = evidence.find((e) => e.command === cmd);
        assert.ok(item, `${cmd}: ${JSON.stringify(evidence.map((e) => e.command))}`);
        assert.equal(item.singlePurpose, true, cmd);
      }
    } finally {
      cleanup(root);
    }
  });

  test('E16h: test.sh, run-tests.sh, check.sh and a make target named check-x are not singlePurpose', () => {
    const root = makeRepo({
      'scripts/test.sh': '#!/bin/sh\ngo test ./...\n',
      'scripts/run-tests.sh': '#!/bin/sh\ngo test ./...\n',
      'scripts/check.sh': '#!/bin/sh\ngo vet ./...\n',
      Makefile: '.PHONY: check-x\ncheck-x:\n\tgo vet ./...\n',
      '.github/workflows/ci.yml': ciRun('./scripts/test.sh', './scripts/run-tests.sh', './scripts/check.sh', 'make check-x'),
    });
    try {
      const evidence = collectEvidence(root, { areas: [], hygiene: () => 'ok' });
      assert.ok(evidence.length >= 4, JSON.stringify(evidence.map((e) => e.command)));
      for (const item of evidence) assert.ok(!item.singlePurpose, `${item.command} must not be singlePurpose`);
    } finally {
      cleanup(root);
    }
  });
});

// TRD 43-04 (D4, spot-check recovery): an item whose key was carried by a scenario NAME is flagged
// `scenarioNamed`, so stack-draft can prefer it over a body-only e2e_env. Present only when true.
describe('stack-evidence scenarioNamed (E17, TRD 43-04)', () => {
  test('E17: make e2e-stack-up and a docs-e2e.sh wrapper are scenarioNamed; make infra-up (body only) is not', () => {
    const root = makeRepo({
      Makefile: [
        '.PHONY: infra-up e2e-stack-up',
        'infra-up:',
        '\tdocker compose up -d',
        'e2e-stack-up:',
        '\tbash scripts/e2e-stack-up.sh',
        '',
      ].join('\n'),
      'scripts/e2e-stack-up.sh': '#!/bin/sh\ndocker compose -f e2e/compose.yml up -d\n',
      'scripts/docs-e2e.sh': '#!/bin/sh\ngo build -o /tmp/x ./cmd/x\n',
      '.github/workflows/ci.yml': ['jobs:', '  j:', '    steps:', '      - run: ./scripts/docs-e2e.sh'].join('\n'),
    });
    try {
      const evidence = collectEvidence(root, { areas: [], hygiene: () => 'ok' });
      const byCmd = (c) => evidence.find((e) => e.command === c);
      assert.equal(byCmd('make e2e-stack-up').key, 'e2e_env');
      assert.equal(byCmd('make e2e-stack-up').scenarioNamed, true);
      assert.equal(byCmd('make infra-up').key, 'e2e_env');
      assert.ok(!('scenarioNamed' in byCmd('make infra-up')), 'a body-only bring-up is not named');
      assert.equal(byCmd('./scripts/docs-e2e.sh').key, 'e2e');
      assert.equal(byCmd('./scripts/docs-e2e.sh').scenarioNamed, true);
    } finally {
      cleanup(root);
    }
  });

  test('E17b: a plain build target and a neutral script are never scenarioNamed', () => {
    const root = makeRepo({
      Makefile: '.PHONY: build\nbuild:\n\tgo build ./...\n',
      'scripts/run.sh': '#!/bin/sh\ngo build ./...\n',
      '.github/workflows/ci.yml': ['jobs:', '  j:', '    steps:', '      - run: ./scripts/run.sh', '      - run: make build'].join('\n'),
    });
    try {
      const evidence = collectEvidence(root, { areas: [], hygiene: () => 'ok' });
      assert.ok(evidence.length >= 2);
      for (const item of evidence) assert.ok(!('scenarioNamed' in item), item.command);
    } finally {
      cleanup(root);
    }
  });
});

// ─── TRD 43-05 tests 14-15: where a body RUNS, for dirs that are in no language area (D2) ───────────
//
// (a) A unit whose cwd is non-root and in NO language area is its own pseudo-area (`infra/tiles/`), so
// stack-draft files it as a `sub_area` note, never a root key. (b) A script invoked from the root with
// no `cd` takes the language area of the script's own directory (`bash portal/build.sh` runs in the
// flutter component `portal/`). A script in a root-level helper dir that is in no language area keeps
// '' (EdenDocs `./scripts/eden/build.sh`, devcluster `bash t0-conformance/selftest.sh` are root keys).

describe('stack-evidence pseudo-area and script-dir area (E18, TRD 43-05 tests 14-15)', () => {
  const ciSteps = (...steps) => ['jobs:', '  j:', '    steps:', ...steps].join('\n');
  const run = (cmd) => `      - run: ${cmd}`;
  const AREAS = [
    { dir: '', kinds: ['go'], tier: 'go', flags: [] },
    { dir: 'portal/', kinds: ['dart', 'flutter'], tier: 'flutter', flags: [] },
  ];
  const find = (evidence, command, source) => evidence.find((e) => e.command === command && (!source || e.source === source));

  test('E18a (test 14): a CI step in `infra/tiles` (no language area) has the pseudo-area `infra/tiles/`', () => {
    const root = makeRepo({
      'infra/tiles/build.sh': '#!/bin/sh\nset -eu\n./gen-tiles\n',
      '.github/workflows/tiles.yml': ciSteps('      - name: tiles', '        working-directory: infra/tiles', '        run: ./build.sh'),
    });
    try {
      const item = find(collectEvidence(root, { areas: AREAS, hygiene: () => 'ok' }), './build.sh', 'ci');
      assert.ok(item);
      assert.equal(item.cwd, 'infra/tiles');
      assert.equal(item.area, '', 'the item area is the language area of the cwd: none');
      assert.equal(item.effectiveArea, 'infra/tiles/');
    } finally {
      cleanup(root);
    }
  });

  test('E18b: a sub-dir Makefile target (`make -C docs`) runs in the pseudo-area `docs/`; a root target stays at the root', () => {
    const root = makeRepo({
      Makefile: 'build:\n\tgo build ./...\n',
      'docs/Makefile': 'build:\n\tmkdocs build\n',
      '.github/workflows/ci.yml': ciSteps(run('make -C docs build'), run('go test ./...')),
    });
    try {
      const evidence = collectEvidence(root, { areas: AREAS, hygiene: () => 'ok' });
      const docs = evidence.find((e) => e.source === 'runner' && e.cwd === 'docs' && e.key === 'build');
      assert.ok(docs, JSON.stringify(evidence.map((e) => [e.source, e.command, e.cwd])));
      assert.equal(docs.effectiveArea, 'docs/');
      const rootMake = evidence.find((e) => e.source === 'runner' && e.command === 'make build' && !e.cwd);
      assert.ok(rootMake);
      assert.equal(rootMake.effectiveArea, '');
      assert.equal(find(evidence, 'go test ./...', 'ci').effectiveArea, '');
    } finally {
      cleanup(root);
    }
  });

  test('E18b2: a sub-dir target with NO recipe of its own (prerequisites only) still runs in that dir: the item cwd is the pseudo-area', () => {
    const root = makeRepo({
      'engine/plugins/Makefile': 'all: build\nbuild: plugins\n',
      '.github/workflows/ci.yml': ciSteps(run('go test ./...')),
    });
    try {
      const item = collectEvidence(root, { areas: AREAS, hygiene: () => 'ok' }).find((e) => e.source === 'runner' && e.cwd === 'engine/plugins');
      assert.ok(item);
      assert.deepStrictEqual(item.bodyScopes, [], 'no unit, so no stack');
      assert.equal(item.effectiveArea, 'engine/plugins/');
    } finally {
      cleanup(root);
    }
  });

  test('E18c (test 15): `bash portal/build.sh` from the root runs in the language area `portal/`, whether the script is readable or not', () => {
    const readable = makeRepo({
      'portal/build.sh': '#!/bin/sh\nflutter pub get\nflutter pub run build_runner build\n',
      '.github/workflows/ci.yml': ciSteps(run('bash portal/build.sh')),
    });
    const missing = makeRepo({ '.github/workflows/ci.yml': ciSteps(run('bash portal/build.sh')) });
    try {
      for (const root of [readable, missing]) {
        const item = find(collectEvidence(root, { areas: AREAS, hygiene: () => 'ok' }), 'bash portal/build.sh', 'ci');
        assert.ok(item, root);
        assert.equal(item.area, '', 'invoked from the root');
        assert.equal(item.effectiveArea, 'portal/');
      }
    } finally {
      cleanup(readable);
      cleanup(missing);
    }
  });

  test('E18d (test 15): a script in a root-level helper dir that is no language area, or at the root, keeps the root', () => {
    const root = makeRepo({
      'scripts/build.sh': '#!/bin/sh\ngo build ./...\n',
      'build.sh': '#!/bin/sh\ngo build ./...\n',
      'scripts/eden/build.sh': '#!/bin/sh\n./run-build\n',
      '.github/workflows/ci.yml': ciSteps(run('./scripts/build.sh'), run('./build.sh'), run('./scripts/eden/build.sh')),
    });
    try {
      const evidence = collectEvidence(root, { areas: AREAS, hygiene: () => 'ok' });
      for (const cmd of ['./scripts/build.sh', './build.sh', './scripts/eden/build.sh']) {
        const item = find(evidence, cmd, 'ci');
        assert.ok(item, cmd);
        assert.equal(item.effectiveArea, '', `${cmd}: a helper dir that is no language area runs root commands`);
      }
    } finally {
      cleanup(root);
    }
  });

  test('E18f: a cwd that does not exist is no pseudo-area: the item keeps its own area and stays a cwd_missing candidate', () => {
    const root = makeRepo({
      '.github/workflows/ci.yml': ciSteps('      - name: gone', '        working-directory: nope/gone', '        run: go test ./...'),
    });
    try {
      const item = find(collectEvidence(root, { areas: AREAS }), 'go test ./...', 'ci');
      assert.ok(item);
      assert.equal(item.cwdStatus, 'missing');
      assert.equal(item.effectiveArea, '');
    } finally {
      cleanup(root);
    }
  });

  test('E18e: a `cd` before the script wins: `cd portal && ./build.sh` is portal/, `cd infra/tiles && ./build.sh` is the pseudo-area', () => {
    const root = makeRepo({
      'portal/build.sh': '#!/bin/sh\nflutter build web\n',
      'infra/tiles/build.sh': '#!/bin/sh\n./gen-tiles\n',
      '.github/workflows/ci.yml': ciSteps(run('cd portal && ./build.sh'), run('cd infra/tiles && ./build.sh')),
    });
    try {
      const builds = collectEvidence(root, { areas: AREAS, hygiene: () => 'ok' }).filter((e) => e.source === 'ci' && e.key === 'build');
      assert.deepStrictEqual(builds.map((e) => e.effectiveArea).sort(), ['infra/tiles/', 'portal/']);
    } finally {
      cleanup(root);
    }
  });
});

// TRD 43-06 (devflowops / aodex goldens): check / apply target pairs.
// - E19a a target whose recipe is a drift check (`git diff --exit-code`) after a prerequisite that
//   WRITES key K (fmt, tidy, a generator) is K's check form, high confidence: `fmt-check: fmt`,
//   `tidy-check: tidy`, `openapi-verify: openapi-regen`. Also a body that regenerates then diffs.
// - E19b a target's prerequisites run before its recipe, so they are part of its units: the check
//   target's stack is the prerequisite's (gofmt at the root), not unknown.
// - E19c a prerequisites-only `lint-fix` is lint's apply form (its name says so).
describe('check / apply target pairs (E19, TRD 43-06)', () => {
  const MAKEFILE = [
    'fmt:',
    '\tgofmt -w .',
    '',
    'fmt-check: fmt',
    '\tgit diff --exit-code',
    '',
    'tidy:',
    '\tgo mod tidy',
    '',
    'tidy-check: tidy',
    '\tgit diff --exit-code go.mod go.sum',
    '',
    'openapi-regen:',
    '\tgo generate ./api/...',
    '',
    'openapi-verify: openapi-regen',
    '\tgit diff --exit-code -- api/',
    '',
    'proto-check:',
    '\tbuf generate',
    '\tgit diff --quiet',
    '',
    'lint-fix: lint-go-fix',
    '',
    'lint-go-fix:',
    '\tgolangci-lint run --fix',
    '',
    'notes:',
    '\tgit diff --exit-code',
    '',
  ].join('\n');

  function items() {
    const root = makeRepo({ 'go.mod': 'module example.invalid/pairs\n\ngo 1.23\n', Makefile: MAKEFILE });
    try {
      return collectEvidence(root, { hygiene: () => 'ok' });
    } finally {
      cleanup(root);
    }
  }
  const byCmd = (list, cmd) => list.find((e) => e.command === cmd) || null;

  test('E19a: a drift check after a writing prerequisite is that key\'s check form, high confidence', () => {
    const list = items();
    const want = { 'make fmt-check': 'format', 'make tidy-check': 'tidy', 'make openapi-verify': 'codegen', 'make proto-check': 'codegen' };
    for (const [cmd, key] of Object.entries(want)) {
      const it = byCmd(list, cmd);
      assert.ok(it, `${cmd} is evidence`);
      assert.equal(it.key, key, cmd);
      assert.equal(it.form, 'check', cmd);
      assert.equal(it.confidence, 'high', cmd);
    }
    assert.equal(byCmd(list, 'make notes'), null, 'a bare drift check with no writer is not evidence');
    assert.equal(byCmd(list, 'make openapi-regen').form, 'mutate', 'the generator itself keeps its form');
  });

  test('E19b: the prerequisite is part of the check target\'s units: its stack runs at the root', () => {
    const list = items();
    for (const cmd of ['make fmt-check', 'make tidy-check', 'make openapi-verify']) {
      const it = byCmd(list, cmd);
      assert.ok(it.bodyScopes.some((s) => s.stack === 'go' && s.area === ''), `${cmd}: ${JSON.stringify(it.bodyScopes)}`);
    }
  });

  test('E19c: a prerequisites-only `lint-fix` is lint apply', () => {
    const it = byCmd(items(), 'make lint-fix');
    assert.ok(it);
    assert.equal(it.key, 'lint');
    assert.equal(it.form, 'apply');
  });
});

// TRD 43-06 (EdenDocs golden): an item that goes through a runner target or a script FILE carries the
// name it goes through (`invokedName`), so stack-draft can rank a step named exactly the key (`build.sh`)
// above a qualified one (`build-deps.sh`). Runner items keep `target.name`; a raw command has none.
describe('invokedName (E20, TRD 43-06)', () => {
  test('E20: CI steps through a script or a runner target carry the name; raw commands do not', () => {
    const steps = ['jobs:', '  j:', '    steps:', ...[
      './scripts/eden/build.sh',
      'bash tools/smoke-test.sh',
      'make lint-backend',
      'go test ./...',
    ].map((c) => `      - run: ${c}`)].join('\n');
    const root = makeRepo({
      'scripts/eden/build.sh': '#!/bin/sh\nmake -j4\n',
      'tools/smoke-test.sh': '#!/bin/sh\n./bin/server --selftest\n',
      Makefile: 'lint-backend:\n\tgolangci-lint run\n',
      '.github/workflows/ci.yml': steps,
    });
    try {
      const ci = collectEvidence(root, { areas: [], hygiene: () => 'ok' }).filter((e) => e.source === 'ci');
      const nameOf = (cmd) => (ci.find((e) => e.command === cmd) || {}).invokedName;
      assert.equal(nameOf('./scripts/eden/build.sh'), 'build');
      assert.equal(nameOf('bash tools/smoke-test.sh'), 'smoke-test');
      assert.equal(nameOf('make lint-backend'), 'lint-backend');
      assert.equal(nameOf('go test ./...'), undefined);
    } finally {
      cleanup(root);
    }
  });
});

// TRD 43-06 (EdenDocs golden): a smoke test checks a built artifact quickly; it is one check, not the
// repo's suite, so a script whose name carries the whole token `smoke` is single-purpose.
describe('smoke scripts are single-purpose (E21, TRD 43-06)', () => {
  test('E21: smoke-test.sh, smoke_tests.sh and api-smoke-test.sh are singlePurpose; smokey-test.sh and test.sh are not', () => {
    // Names that carry the `test` token, so each step is test evidence and the flag is what differs.
    const names = ['smoke-test.sh', 'smoke_tests.sh', 'api-smoke-test.sh', 'smokey-test.sh', 'test.sh'];
    const files = { '.github/workflows/ci.yml': ['jobs:', '  j:', '    steps:', ...names.map((n) => `      - run: ./ci/${n}`)].join('\n') };
    for (const n of names) files[`ci/${n}`] = '#!/bin/sh\n./bin/server --selftest\n';
    const root = makeRepo(files);
    try {
      const ev = collectEvidence(root, { areas: [], hygiene: () => 'ok' });
      const sp = (n) => (ev.find((e) => e.command === `./ci/${n}`) || {}).singlePurpose === true;
      for (const n of names) assert.ok(ev.some((e) => e.command === `./ci/${n}` && e.key === 'test'), `${n} is test evidence`);
      assert.equal(sp('smoke-test.sh'), true);
      assert.equal(sp('smoke_tests.sh'), true);
      assert.equal(sp('api-smoke-test.sh'), true);
      assert.equal(sp('smokey-test.sh'), false);
      assert.equal(sp('test.sh'), false);
    } finally {
      cleanup(root);
    }
  });
});
