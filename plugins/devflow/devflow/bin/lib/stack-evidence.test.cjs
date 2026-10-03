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
