'use strict';

// stack-runners.test.cjs — Test list (TRD 42-04), outermost (readRunners over a repo) to
// innermost (per-format parsers).
//
//  1. Root Makefile + svc/Makefile: targets from both; svc targets carry dir 'svc' and
//     invocation `make -C svc test`.
//  2. Makefile bodies: `\` continuations joined, `@`/`-` prefixes stripped; variables, .PHONY and
//     pattern rules are not targets. Recipes REQUIRE a leading tab (space-indented lines are not
//     recipe lines).
//  3. `include`: hasTarget is 'unknown' for a name not defined statically, true for a defined
//     one; a Makefile with no include gives false.
//  4. Taskfile: `:` in names, `cmd:` / `cmds:` flow list, `aliases:`; hasTarget resolves an alias.
//  5. Taskfile `cmds:` items in `- cmd:` and `- task:` form (`task: other` -> body `task other`).
//  6. justfile: params, `@` quiet prefix, `alias t := test`, `set shell := [...]`; bodies verbatim.
//  7. package.json + lockfile: pnpm / yarn / bun / npm manager; `test` -> `<mgr> test`.
//  8. Conventional scripts: bin/ + scripts/ *.sh; a non-executable one is listed executable:false.
//  9. Depth limit (default 1) and skip-dirs.
// 10. Exec enrichment through an injected exec; ENOENT leaves the static result unchanged.
// 11. Empty repo -> [] and no throw.
// 12. (TRD 43-01 D1) Makefile `$(VAR)` / `${VAR}` expansion from `?=` `:=` `::=` `=`, depth <= 3.
// 13. (TRD 43-01 D5) Taskfile `internal: true` is flagged, not invocable (hasTarget false), and
//     stays in the parsed index.
//
// Fixtures are hand-built (`__fixtures__/stack-runner-fixtures.cjs`), never generated.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const fx = require('./__fixtures__/stack-runner-fixtures.cjs');
const {
  readRunners,
  hasTarget,
  RUNNER_FILES,
  SKIP_DIRS,
  _parseMakefile,
  _parseTaskfile,
  _parseJustfile,
} = require('./stack-runners.cjs');

const roots = [];
function track(root) { roots.push(root); return root; }
afterEach(() => { while (roots.length) fx.cleanup(roots.pop()); });

function find(targets, runner, dir, name) {
  return targets.find((t) => t.runner === runner && t.dir === dir && t.name === name);
}

describe('readRunners — Makefile (root and one level down)', () => {
  test('1. root and svc Makefiles are both read; svc targets use `make -C svc`', () => {
    const root = track(fx.makefileMonorepo());
    const targets = readRunners(root);

    const rootTest = find(targets, 'make', '', 'test');
    assert.ok(rootTest, 'root test target');
    assert.equal(rootTest.file, 'Makefile');
    assert.equal(rootTest.invocation, 'make test');

    const svcTest = find(targets, 'make', 'svc', 'test');
    assert.ok(svcTest, 'svc test target');
    assert.equal(svcTest.file, 'svc/Makefile');
    assert.equal(svcTest.invocation, 'make -C svc test');

    const svcNames = targets.filter((t) => t.dir === 'svc').map((t) => t.name);
    assert.deepEqual(
      svcNames.sort(),
      ['build', 'drift-check', 'generate', 'lint', 'test', 'vet'],
    );
    assert.equal(find(targets, 'make', 'svc', 'drift-check').invocation, 'make -C svc drift-check');
    assert.deepEqual(find(targets, 'make', 'svc', 'test').aliases, []);
  });

  test('1b. targets are sorted by (dir, runner, name)', () => {
    const root = track(fx.makefileMonorepo());
    const keys = readRunners(root).map((t) => [t.dir, t.runner, t.name]);
    const sorted = [...keys].sort((a, b) => {
      for (let i = 0; i < 3; i++) {
        if (a[i] < b[i]) return -1;
        if (a[i] > b[i]) return 1;
      }
      return 0;
    });
    assert.deepEqual(keys, sorted);
    assert.equal(keys[0][0], '', 'root targets come first');
  });

  test('2. bodies: continuations joined, @ and - prefixes stripped', () => {
    const root = track(fx.makefileMonorepo());
    const targets = readRunners(root);

    assert.deepEqual(find(targets, 'make', '', 'test').body, ['go test -race ./...']);
    assert.deepEqual(
      find(targets, 'make', '', 'lint').body,
      ['echo linting', 'golangci-lint run ./...'],
    );
    assert.deepEqual(
      find(targets, 'make', 'svc', 'test').body,
      ['go test -race -count=1 -coverprofile=cover.out ./...'],
    );
    assert.deepEqual(find(targets, 'make', 'svc', 'lint').body, ['golangci-lint run']);
    assert.deepEqual(
      find(targets, 'make', 'svc', 'drift-check').body,
      ['git diff --exit-code -- gen/'],
    );
    // A rule with prerequisites but no recipe is still a target, with an empty body.
    assert.deepEqual(find(targets, 'make', '', 'all').body, []);
  });

  test('2b. .PHONY, variable assignments and pattern rules are not targets', () => {
    const root = track(fx.makefileMonorepo());
    const names = readRunners(root).filter((t) => t.dir === '').map((t) => t.name).sort();
    assert.deepEqual(names, ['all', 'lint', 'test']);
  });

  test('2c. _parseMakefile: recipes REQUIRE a leading tab (space-indented lines are not recipe lines)', () => {
    const spaced = 'test:\n    go test ./...\n';
    const tabbed = 'test:\n\tgo test ./...\n';
    assert.deepEqual(_parseMakefile(spaced).targets, [{ name: 'test', body: [] }]);
    assert.deepEqual(_parseMakefile(tabbed).targets, [{ name: 'test', body: ['go test ./...'] }]);
  });

  test('2d. _parseMakefile: inline `; recipe`, several targets on one line, and merged rules', () => {
    const text = [
      'a b: dep ; echo shared',
      'test: build',
      'test:',
      '\tgo test ./...',
      '',
    ].join('\n');
    const byName = Object.fromEntries(_parseMakefile(text).targets.map((t) => [t.name, t.body]));
    assert.deepEqual(byName.a, ['echo shared']);
    assert.deepEqual(byName.b, ['echo shared']);
    assert.deepEqual(byName.test, ['go test ./...'], 'a repeated target accumulates its recipe');
  });

  test('2e. _parseMakefile: ::= / ?= / += / = assignments, define blocks, special targets, comments', () => {
    const text = [
      'A ::= 1',
      'B ?= 2',
      'C += 3',
      'D = x:y',
      '.SUFFIXES:',
      '.DEFAULT_GOAL := all',
      '# lint: not a target',
      'define BLOCK',
      'hidden:',
      '\techo hidden',
      'endef',
      'real:',
      '\t# a shell comment line',
      '',
      '\techo real',
      '',
    ].join('\n');
    assert.deepEqual(_parseMakefile(text).targets, [{ name: 'real', body: ['echo real'] }]);
  });

  test('2f. _parseMakefile: include / -include / sinclude set hasInclude', () => {
    assert.equal(_parseMakefile('include a.mk\nx:\n').hasInclude, true);
    assert.equal(_parseMakefile('-include a.mk\nx:\n').hasInclude, true);
    assert.equal(_parseMakefile('sinclude a.mk\nx:\n').hasInclude, true);
    assert.equal(_parseMakefile('x:\n\techo include y\n').hasInclude, false);
  });

  // ─── TRD 43-01 D1: simple variable references in recipe lines ────────────────

  const bodyOf = (text, name) => _parseMakefile(text).targets.find((t) => t.name === name).body;

  test('2g. `GO ?= go` expands $(GO) in a recipe line, through readRunners too', () => {
    assert.deepEqual(bodyOf('GO ?= go\nbuild:\n\t$(GO) build ./...\n', 'build'), ['go build ./...']);
    const root = track(fx.makeRepo({ Makefile: 'GO ?= go\nbuild:\n\t$(GO) build ./...\n' }));
    assert.deepEqual(find(readRunners(root), 'make', '', 'build').body, ['go build ./...']);
  });

  test('2h. the brace form ${GO}, `export`, `override`, an inline `; recipe` and a trailing comment expand too', () => {
    assert.deepEqual(bodyOf('GO := go\nbuild:\n\t${GO} build ./...\n', 'build'), ['go build ./...']);
    assert.deepEqual(bodyOf('export GO ::= go # the toolchain\nbuild:\n\t$(GO) vet ./...\n', 'build'), ['go vet ./...']);
    assert.deepEqual(bodyOf('override GO = go\nbuild: ; $(GO) build\n', 'build'), ['go build']);
  });

  test('2i. `?=` keeps the first definition; `:=` and `=` override; `+=` defines nothing', () => {
    assert.deepEqual(bodyOf('GO ?= go\nGO ?= gccgo\nb:\n\t$(GO) x\n', 'b'), ['go x']);
    assert.deepEqual(bodyOf('GO := go\nGO ?= gccgo\nb:\n\t$(GO) x\n', 'b'), ['go x']);
    assert.deepEqual(bodyOf('GO ?= go\nGO := gccgo\nb:\n\t$(GO) x\n', 'b'), ['gccgo x']);
    assert.deepEqual(bodyOf('GO = go\nGO = gccgo\nb:\n\t$(GO) x\n', 'b'), ['gccgo x']);
    assert.deepEqual(bodyOf('GO += go\nb:\n\t$(GO) x\n', 'b'), ['$(GO) x'], '+= is not a definition');
  });

  test('2j. a variable defined BELOW the rule still applies (make expands recipes lazily)', () => {
    assert.deepEqual(bodyOf('build:\n\t$(GO) build\nGO ?= go\n', 'build'), ['go build']);
  });

  test('2k. chains resolve through depth 3; a longer chain and a self-reference stay verbatim', () => {
    const chain = 'A := go\nB := $(A)\nC := $(B)\nD := $(C)\nb:\n\t$(C) x\nc:\n\t$(D) x\n';
    assert.deepEqual(bodyOf(chain, 'b'), ['go x'], 'three levels deep');
    assert.deepEqual(bodyOf(chain, 'c'), ['$(D) x'], 'four levels is past the bound');
    assert.deepEqual(bodyOf('A = $(A) x\nb:\n\t$(A) go\n', 'b'), ['$(A) go'], 'no infinite loop');
    assert.deepEqual(bodyOf('A = $(B)\nB = $(A)\nb:\n\t$(A) go\n', 'b'), ['$(A) go'], 'mutual recursion');
  });

  test('2l. `$(shell ...)`, function calls and undefined variables stay verbatim', () => {
    const text = 'GO ?= go\nb:\n\techo $(shell go env GOPATH) $(call f,x) $(FOO) $(GO:go=x) $(wildcard *.go)\n';
    assert.deepEqual(
      bodyOf(text, 'b'),
      ['echo $(shell go env GOPATH) $(call f,x) $(FOO) $(GO:go=x) $(wildcard *.go)'],
    );
  });

  test('2m. a make-escaped dollar ($$HOME, $$(GO)) is not expanded; `$$$(GO)` is `$$` plus a reference', () => {
    assert.deepEqual(bodyOf('GO := go\nb:\n\techo $$HOME $$(GO) $${GO}\n', 'b'), ['echo $$HOME $$(GO) $${GO}']);
    assert.deepEqual(bodyOf('GO := go\nb:\n\techo $$$(GO)\n', 'b'), ['echo $$go']);
  });

  test('2n. assignments inside define ... endef are ignored', () => {
    const text = [
      'define BLOCK',
      'GO := gccgo',
      'X := y',
      'endef',
      'GO ?= go',
      'b:',
      '\techo $(GO) $(X)',
      '',
    ].join('\n');
    assert.deepEqual(bodyOf(text, 'b'), ['echo go $(X)']);
  });

  test('2o. an assignment is never a rule, and the return shape is unchanged', () => {
    const parsed = _parseMakefile('GO := go\nGOFLAGS ::= -v\nOUT=bin/x\nb:\n\t$(GO) x\n');
    assert.deepEqual(Object.keys(parsed).sort(), ['defaultGoal', 'deps', 'hasInclude', 'targets']);
    assert.deepEqual(parsed.targets.map((t) => t.name), ['b']);
    assert.deepEqual(parsed.deps, { b: [] });
  });
});

describe('hasTarget — Makefile', () => {
  test('3. include-expanded Makefile: unknown when not static, true when defined', () => {
    const root = track(fx.makefileWithInclude());
    assert.equal(hasTarget(root, { runner: 'make', dir: '', name: 'build' }), true);
    assert.equal(hasTarget(root, { runner: 'make', dir: '', name: 'lint' }), 'unknown');
  });

  test('3b. a Makefile with no include gives false for a missing target', () => {
    const root = track(fx.makefileMonorepo());
    assert.equal(hasTarget(root, { runner: 'make', dir: '', name: 'lint' }), true);
    assert.equal(hasTarget(root, { runner: 'make', dir: '', name: 'nope' }), false);
    assert.equal(hasTarget(root, { runner: 'make', dir: 'svc', name: 'vet' }), true);
    assert.equal(hasTarget(root, { runner: 'make', dir: 'svc', name: 'nope' }), false);
  });

  test('3c. a directory with no Makefile, an escaping dir, and an unrecognised runner', () => {
    const root = track(fx.makefileMonorepo());
    assert.equal(hasTarget(root, { runner: 'make', dir: 'nowhere', name: 'test' }), false);
    assert.equal(hasTarget(root, { runner: 'make', dir: '../..', name: 'test' }), false);
    assert.equal(hasTarget(root, { runner: 'bazel', dir: '', name: 'test' }), 'unknown');
  });

  test('3d. dir spellings "", ".", "./svc" and "svc/" are normalised', () => {
    const root = track(fx.makefileMonorepo());
    assert.equal(hasTarget(root, { runner: 'make', dir: '.', name: 'test' }), true);
    assert.equal(hasTarget(root, { runner: 'make', dir: './svc', name: 'vet' }), true);
    assert.equal(hasTarget(root, { runner: 'make', dir: 'svc/', name: 'vet' }), true);
  });
});

describe('readRunners — walk limits', () => {
  test('9. runner files deeper than maxDepth (default 1) are ignored', () => {
    const root = track(fx.makeRepo({
      'Makefile': 'top:\n\techo top\n',
      'one/Makefile': 'mid:\n\techo mid\n',
      'one/two/Makefile': 'deep:\n\techo deep\n',
    }));
    const names = (opts) => readRunners(root, opts).map((t) => t.name).sort();
    assert.deepEqual(names(), ['mid', 'top']);
    assert.deepEqual(names({ maxDepth: 0 }), ['top']);
    assert.deepEqual(names({ maxDepth: 2 }), ['deep', 'mid', 'top']);
  });

  test('9b. skip-dirs are never read, however deep maxDepth allows', () => {
    const files = { 'Makefile': 'top:\n\techo top\n' };
    for (const dir of ['node_modules', '.git', 'vendor', 'third_party', '.worktrees', '.dart_tool', 'build']) {
      files[`${dir}/Makefile`] = `skipped_${dir.replace(/\W/g, '_')}:\n\techo x\n`;
    }
    const root = track(fx.makeRepo(files));
    assert.deepEqual(readRunners(root, { maxDepth: 3 }).map((t) => t.name), ['top']);
  });

  test('9c. SKIP_DIRS and RUNNER_FILES are exported and cover the documented names', () => {
    for (const dir of ['node_modules', '.git', 'vendor', 'third_party', '.worktrees', '.dart_tool', 'build']) {
      assert.ok(SKIP_DIRS.has(dir), `${dir} skipped`);
    }
    assert.ok(RUNNER_FILES.make.includes('Makefile'));
    assert.ok(RUNNER_FILES.task.includes('Taskfile.yml'));
    assert.ok(RUNNER_FILES.task.includes('Taskfile.yaml'));
    assert.ok(RUNNER_FILES.just.includes('justfile'));
    assert.ok(RUNNER_FILES.npm.includes('package.json'));
  });

  test('11. an empty repo gives [] and never throws; neither does a missing root', () => {
    const root = track(fx.emptyRepo());
    assert.deepEqual(readRunners(root), []);
    assert.deepEqual(readRunners(`${root}/does-not-exist`), []);
  });
});

describe('readRunners — Taskfile', () => {
  test('4. names with `:`, cmd / cmds (flow list), aliases; hasTarget resolves an alias', () => {
    const root = track(fx.taskfileRepo());
    const targets = readRunners(root);
    const tasks = targets.filter((t) => t.runner === 'task');
    assert.deepEqual(
      tasks.map((t) => t.name).sort(),
      ['ci', 'default', 'gen', 'lint:go', 'test'],
    );

    const lint = find(targets, 'task', '', 'lint:go');
    assert.deepEqual(lint.body, ['golangci-lint run']);
    assert.equal(lint.invocation, 'task lint:go');
    assert.equal(lint.file, 'Taskfile.yml');
    assert.equal(lint.cwd, 'go', 'a task-level `dir:` becomes the target cwd');

    const t = find(targets, 'task', '', 'test');
    assert.deepEqual(t.body, ['go test ./...']);
    assert.deepEqual(t.aliases, ['t']);
    assert.equal(t.invocation, 'task test');
    assert.equal(t.cwd, undefined);

    assert.equal(hasTarget(root, { runner: 'task', dir: '', name: 'test' }), true);
    assert.equal(hasTarget(root, { runner: 'task', dir: '', name: 't' }), true, 'alias');
    assert.equal(hasTarget(root, { runner: 'task', dir: '', name: 'lint:go' }), true);
    assert.equal(hasTarget(root, { runner: 'task', dir: '', name: 'nope' }), false);
  });

  test('5. cmds items in `- cmd:`, `- task:` and bare forms, plus a block-scalar item', () => {
    const root = track(fx.taskfileRepo());
    const targets = readRunners(root);
    assert.deepEqual(
      find(targets, 'task', '', 'ci').body,
      ['go vet ./...', 'task lint:go', 'go build ./...'],
    );
    assert.deepEqual(find(targets, 'task', '', 'default').body, ['task test']);
    const gen = find(targets, 'task', '', 'gen');
    assert.deepEqual(gen.body, ['buf generate', 'sqlc generate']);
    assert.deepEqual(gen.aliases, ['g', 'generate'], 'block-list aliases');
  });

  test('5b. a Taskfile below the root is invoked with `task -d <dir>`', () => {
    const root = track(fx.makeRepo({
      'svc/Taskfile.yaml': 'version: "3"\ntasks:\n  build:\n    cmd: go build ./...\n',
    }));
    const t = find(readRunners(root), 'task', 'svc', 'build');
    assert.equal(t.invocation, 'task -d svc build');
    assert.equal(t.file, 'svc/Taskfile.yaml');
    assert.equal(hasTarget(root, { runner: 'task', dir: 'svc', name: 'build' }), true);
    assert.equal(hasTarget(root, { runner: 'task', dir: '', name: 'build' }), false);
  });

  test('5c. `includes:` makes an unmatched name unknown; a defined one is still true', () => {
    const root = track(fx.taskfileWithIncludes());
    assert.equal(hasTarget(root, { runner: 'task', dir: '', name: 'build' }), true);
    assert.equal(hasTarget(root, { runner: 'task', dir: '', name: 'web:build' }), 'unknown');
  });

  test('5d. _parseTaskfile: string shorthand, quoted names, anchors, comments, unknown shapes', () => {
    const text = [
      'version: "3"',
      '# a comment',
      'tasks:',
      '  build: go build ./...   # trailing comment',
      '  "quoted:name":',
      '    cmds:',
      '      - "echo \\"hi\\""',
      "      - 'it''s'",
      '  anchored: &anchored',
      '    cmd: make all',
      '  merged:',
      '    <<: *anchored',
      '  folded:',
      '    cmd: >',
      '      go test',
      '      ./...',
      '  compact:',
      '    cmds:',
      '    - go vet ./...',
      '    - defer: rm -f x',
      '  flow: [a, "b, c"]',
      '',
    ].join('\n');
    const byName = Object.fromEntries(_parseTaskfile(text).tasks.map((t) => [t.name, t]));
    assert.deepEqual(byName.build.body, ['go build ./...']);
    assert.deepEqual(byName['quoted:name'].body, ['echo "hi"', "it's"]);
    assert.deepEqual(byName.anchored.body, ['make all']);
    assert.deepEqual(byName.merged.body, [], 'a merge key is an unknown shape, skipped');
    assert.deepEqual(byName.folded.body, ['go test ./...']);
    assert.deepEqual(byName.compact.body, ['go vet ./...'], 'same-indent list items; defer is skipped');
    assert.deepEqual(byName.flow.body, ['a', 'b, c']);
  });

  test('5e. _parseTaskfile: no `tasks:` -> no tasks, and hasIncludes only from a top-level includes key', () => {
    assert.deepEqual(_parseTaskfile("version: '3'\n").tasks, []);
    assert.equal(_parseTaskfile("version: '3'\nincludes:\n  a: ./a\n").hasIncludes, true);
    assert.equal(_parseTaskfile("version: '3'\ntasks:\n  includes:\n    cmd: x\n").hasIncludes, false);
  });

  test('5f. a templated or escaping `dir:` never becomes a cwd', () => {
    const text = [
      'tasks:',
      '  a:',
      '    dir: "{{.ROOT_DIR}}/go"',
      '    cmd: x',
      '  b:',
      '    dir: "{{.SOMETHING_ELSE}}/go"',
      '    cmd: x',
      '  c:',
      '    dir: ../../etc',
      '    cmd: x',
      '',
    ].join('\n');
    const root = track(fx.makeRepo({ 'Taskfile.yml': text }));
    const targets = readRunners(root);
    assert.equal(find(targets, 'task', '', 'a').cwd, 'go');
    assert.equal(find(targets, 'task', '', 'b').cwd, undefined);
    assert.equal(find(targets, 'task', '', 'c').cwd, undefined);
  });
});

describe('readRunners — justfile', () => {
  test('6. recipes with params and @ quiet prefix, alias, set; bodies keep their subshell fan-out', () => {
    const root = track(fx.justfileFanOut());
    const targets = readRunners(root);
    const recipes = targets.filter((t) => t.runner === 'just');
    assert.deepEqual(recipes.map((t) => t.name).sort(), ['fmt', 'lint', 'test']);

    assert.deepEqual(find(targets, 'just', '', 'fmt').body, [
      '(cd lib-a && dart format .)',
      '(cd lib-b && dart format .)',
    ]);
    const test_ = find(targets, 'just', '', 'test');
    assert.deepEqual(test_.body, [
      '(cd lib-a && dart test {{args}})',
      '(cd lib-b && dart test {{args}})',
    ]);
    assert.deepEqual(test_.aliases, ['t']);
    assert.equal(test_.invocation, 'just test');
    assert.equal(test_.file, 'justfile');
    assert.deepEqual(find(targets, 'just', '', 'lint').body, [
      '(cd lib-a && dart analyze)',
      '(cd lib-b && dart analyze)',
    ]);

    assert.equal(hasTarget(root, { runner: 'just', dir: '', name: 'lint' }), true);
    assert.equal(hasTarget(root, { runner: 'just', dir: '', name: 't' }), true, 'alias');
    assert.equal(hasTarget(root, { runner: 'just', dir: '', name: 'shell' }), false, '`set shell` is not a recipe');
    assert.equal(hasTarget(root, { runner: 'just', dir: '', name: 'nope' }), false);
  });

  test('6b. import / mod make an unmatched recipe unknown', () => {
    const root = track(fx.justfileWithImport());
    assert.equal(hasTarget(root, { runner: 'just', dir: '', name: 'build' }), true);
    assert.equal(hasTarget(root, { runner: 'just', dir: '', name: 'docs::build' }), 'unknown');
    assert.deepEqual(readRunners(root).map((t) => t.name), ['build'], 'import/mod lines are not recipes');
  });

  test('6c. a justfile below the root is invoked with --justfile', () => {
    const root = track(fx.makeRepo({ 'lib/justfile': 'test:\n  dart test\n' }));
    const t = find(readRunners(root), 'just', 'lib', 'test');
    assert.equal(t.invocation, 'just --justfile lib/justfile test');
    assert.equal(hasTarget(root, { runner: 'just', dir: 'lib', name: 'test' }), true);
  });

  test('6d. _parseJustfile: dependencies, defaulted params, attributes, continuations, shebang, prefixes', () => {
    const text = [
      'export RUST_LOG := "debug"',
      'alias b := build',
      '',
      '[private]',
      'helper:',
      '  echo helper',
      '',
      '# build it',
      'build target="release" *flags: helper',
      '  @cargo build --profile {{target}} \\',
      '    {{flags}}',
      '',
      '  -cargo doc',
      '# a comment at column 0 does not end the recipe',
      '  echo done',
      '',
      'script:',
      '  #!/usr/bin/env bash',
      '  set -eu',
      '  echo from-script',
      '',
    ].join('\n');
    const parsed = _parseJustfile(text);
    const byName = Object.fromEntries(parsed.recipes.map((r) => [r.name, r.body]));
    assert.deepEqual(Object.keys(byName).sort(), ['build', 'helper', 'script']);
    assert.deepEqual(byName.helper, ['echo helper']);
    assert.deepEqual(byName.build, ['cargo build --profile {{target}} {{flags}}', 'cargo doc', 'echo done']);
    assert.deepEqual(byName.script, ['set -eu', 'echo from-script'], 'the shebang line is not a command');
    assert.deepEqual(parsed.aliases, { b: 'build' });
    assert.equal(parsed.hasImport, false);
  });
});

describe('readRunners — exec enrichment (injected exec only)', () => {
  test('10. task --list-all --json adds tasks missed statically; static entries are kept', () => {
    const root = track(fx.makeRepo({
      'Taskfile.yml': 'version: "3"\nincludes:\n  web: ./web\ntasks:\n  build:\n    cmd: go build ./...\n',
    }));
    const calls = [];
    const exec = (cmd, args, opts) => {
      calls.push([cmd, args, opts.cwd]);
      return JSON.stringify({
        tasks: [
          { name: 'build', aliases: ['b'] },
          { name: 'web:build', aliases: ['wb'] },
        ],
      });
    };
    const targets = readRunners(root, { exec });
    assert.deepEqual(calls, [['task', ['--list-all', '--json'], root]]);

    const build = find(targets, 'task', '', 'build');
    assert.deepEqual(build.body, ['go build ./...'], 'the static body wins');
    assert.deepEqual(build.aliases, ['b'], 'aliases from exec are merged in');
    const web = find(targets, 'task', '', 'web:build');
    assert.ok(web, 'a task only exec knows about is added');
    assert.deepEqual(web.body, []);
    assert.deepEqual(web.aliases, ['wb']);
    assert.equal(web.invocation, 'task web:build');
    assert.equal(web.file, 'Taskfile.yml');
    assert.equal(web.via, 'exec');
    assert.equal(build.via, undefined);
  });

  test('10b. just --dump --dump-format json adds recipes with bodies; private recipes are skipped', () => {
    const root = track(fx.makeRepo({ justfile: 'build:\n  cargo build\n' }));
    const calls = [];
    const exec = (cmd, args, opts) => {
      calls.push([cmd, args, opts.cwd]);
      return JSON.stringify({
        aliases: { d: { name: 'd', target: 'deploy' }, b: { name: 'b', target: 'build' } },
        recipes: {
          build: { name: 'build', body: [['cargo build']], private: false },
          deploy: {
            name: 'deploy',
            body: [['cargo publish'], ['echo ', ['variable', 'target']]],
            private: false,
          },
          _helper: { name: '_helper', body: [['true']], private: true },
        },
      });
    };
    const targets = readRunners(root, { exec });
    assert.deepEqual(calls, [['just', ['--dump', '--dump-format', 'json'], root]]);
    const deploy = find(targets, 'just', '', 'deploy');
    assert.ok(deploy);
    assert.deepEqual(deploy.body, ['cargo publish', 'echo {{target}}']);
    assert.deepEqual(deploy.aliases, ['d']);
    assert.equal(deploy.via, 'exec');
    assert.deepEqual(find(targets, 'just', '', 'build').aliases, ['b']);
    assert.equal(find(targets, 'just', '', 'build').via, undefined);
    assert.equal(find(targets, 'just', '', '_helper'), undefined);
  });

  test('10c. exec is only consulted where a Taskfile / justfile exists', () => {
    const root = track(fx.makefileMonorepo());
    let called = 0;
    readRunners(root, { exec: () => { called += 1; return '{}'; } });
    assert.equal(called, 0);
  });

  test('10d. ENOENT, a bad payload or a non-function exec leave the static result unchanged', () => {
    const root = track(fx.taskfileRepo());
    const baseline = readRunners(root);
    const enoent = () => { const e = new Error('spawn task ENOENT'); e.code = 'ENOENT'; throw e; };
    assert.deepEqual(readRunners(root, { exec: enoent }), baseline);
    assert.deepEqual(readRunners(root, { exec: () => 'not json' }), baseline);
    assert.deepEqual(readRunners(root, { exec: () => undefined }), baseline);
    assert.deepEqual(readRunners(root, { exec: () => '{"tasks":"nope"}' }), baseline);
    assert.deepEqual(readRunners(root, { exec: 'task' }), baseline);
    assert.deepEqual(readRunners(root, { exec: null }), baseline);
  });

  test('10e. exec may return a Buffer or { stdout }', () => {
    const root = track(fx.makeRepo({ 'Taskfile.yml': 'version: "3"\ntasks:\n  a:\n    cmd: x\n' }));
    const payload = JSON.stringify({ tasks: [{ name: 'extra', aliases: [] }] });
    const viaBuffer = readRunners(root, { exec: () => Buffer.from(payload) });
    const viaObject = readRunners(root, { exec: () => ({ stdout: payload }) });
    assert.ok(find(viaBuffer, 'task', '', 'extra'));
    assert.ok(find(viaObject, 'task', '', 'extra'));
  });
});

describe('readRunners — package.json scripts (npm family)', () => {
  const npmTargets = (root) => readRunners(root).filter((t) => t.runner === 'npm');
  const invocations = (root) => Object.fromEntries(npmTargets(root).map((t) => [t.name, t.invocation]));

  test('7. pnpm-lock.yaml -> pnpm: `pnpm test`, `pnpm run build`', () => {
    const root = track(fx.npmFamily({ lock: 'pnpm-lock.yaml' }));
    assert.deepEqual(invocations(root), {
      build: 'pnpm run build',
      lint: 'pnpm run lint',
      test: 'pnpm test',
    });
    const t = find(readRunners(root), 'npm', '', 'test');
    assert.equal(t.manager, 'pnpm');
    assert.deepEqual(t.body, ['vitest run'], 'the body is the script string');
    assert.equal(t.file, 'package.json');
    assert.deepEqual(t.aliases, []);
  });

  test('7b. yarn.lock -> yarn; no lockfile or package-lock.json -> npm', () => {
    const yarn = track(fx.npmFamily({ lock: 'yarn.lock' }));
    assert.equal(invocations(yarn).test, 'yarn test');
    assert.equal(invocations(yarn).build, 'yarn run build');
    assert.equal(npmTargets(yarn)[0].manager, 'yarn');

    const none = track(fx.npmFamily({ lock: null }));
    assert.equal(invocations(none).test, 'npm test');
    assert.equal(invocations(none).build, 'npm run build');
    assert.equal(npmTargets(none)[0].manager, 'npm');

    const lock = track(fx.npmFamily({ lock: 'package-lock.json' }));
    assert.equal(invocations(lock).test, 'npm test');
  });

  test('7c. bun.lockb and bun.lock -> bun; `bun test` is bun\'s own runner, so test runs as `bun run test`', () => {
    for (const lock of ['bun.lockb', 'bun.lock']) {
      const root = track(fx.npmFamily({ lock }));
      assert.equal(invocations(root).test, 'bun run test', lock);
      assert.equal(invocations(root).build, 'bun run build', lock);
      assert.equal(npmTargets(root)[0].manager, 'bun', lock);
    }
  });

  test('7d. lockfile precedence: pnpm > yarn > bun > npm', () => {
    const managerWith = (...locks) => {
      const files = { 'package.json': '{"scripts":{"test":"x"}}' };
      for (const l of locks) files[l] = '';
      const root = track(fx.makeRepo(files));
      return npmTargets(root)[0].manager;
    };
    assert.equal(managerWith('package-lock.json', 'bun.lockb', 'yarn.lock', 'pnpm-lock.yaml'), 'pnpm');
    assert.equal(managerWith('package-lock.json', 'bun.lockb', 'yarn.lock'), 'yarn');
    assert.equal(managerWith('package-lock.json', 'bun.lock'), 'bun');
    assert.equal(managerWith('package-lock.json'), 'npm');
  });

  test('7e. the manager comes from the lockfile in the same directory; a subdirectory package gets a dir prefix', () => {
    const root = track(fx.makeRepo({
      'pnpm-lock.yaml': '',
      'package.json': '{"scripts":{"test":"a"}}',
      'web/package.json': '{"scripts":{"test":"b","build":"c"}}',
      'ui/package.json': '{"scripts":{"build":"d"}}',
      'ui/yarn.lock': '',
      'app/package.json': '{"scripts":{"build":"e"}}',
      'app/bun.lockb': '',
    }));
    const targets = readRunners(root);
    assert.equal(find(targets, 'npm', '', 'test').invocation, 'pnpm test');
    assert.equal(find(targets, 'npm', 'web', 'test').invocation, 'npm --prefix web test', 'no lockfile in web/: npm');
    assert.equal(find(targets, 'npm', 'web', 'build').invocation, 'npm --prefix web run build');
    assert.equal(find(targets, 'npm', 'ui', 'build').invocation, 'yarn --cwd ui run build');
    assert.equal(find(targets, 'npm', 'app', 'build').invocation, 'bun --cwd app run build');

    const pnpmSub = track(fx.npmFamily({ lock: 'pnpm-lock.yaml', dir: 'web' }));
    assert.equal(find(readRunners(pnpmSub), 'npm', 'web', 'test').invocation, 'pnpm -C web test');
    assert.equal(find(readRunners(pnpmSub), 'npm', 'web', 'build').invocation, 'pnpm -C web run build');
  });

  test('7f. malformed JSON, no scripts, non-object scripts and non-string scripts: quietly nothing', () => {
    assert.deepEqual(npmTargets(track(fx.npmFamily({ malformed: true }))), []);
    const cases = ['{}', '{"scripts":[]}', '{"scripts":null}', '[]', '"str"', 'null', '{"scripts":{"a":1,"b":null,"c":{"x":1}}}'];
    for (const json of cases) {
      const root = track(fx.makeRepo({ 'package.json': json }));
      assert.deepEqual(npmTargets(root), [], json);
    }
  });

  test('7g. hasTarget over package.json scripts, whichever manager spelling the caller uses', () => {
    const root = track(fx.npmFamily({ lock: 'pnpm-lock.yaml' }));
    for (const runner of ['npm', 'pnpm', 'yarn', 'bun']) {
      assert.equal(hasTarget(root, { runner, dir: '', name: 'build' }), true, runner);
      assert.equal(hasTarget(root, { runner, dir: '', name: 'nope' }), false, runner);
    }
    assert.equal(hasTarget(root, { runner: 'npm', dir: '', name: 'constructor' }), false, 'own properties only');
    assert.equal(hasTarget(track(fx.npmFamily({ malformed: true })), { runner: 'npm', dir: '', name: 'test' }), false);
    assert.equal(hasTarget(track(fx.emptyRepo()), { runner: 'npm', dir: '', name: 'test' }), false);
  });
});

describe('readRunners — conventional scripts', () => {
  const scriptTargets = (root, opts) => readRunners(root, opts).filter((t) => t.runner === 'script');

  test('8. bin/ and scripts/ test|build|lint|verify|... .sh files become ./<path> targets', () => {
    const root = track(fx.scriptsOnlyRepo());
    const targets = scriptTargets(root);
    assert.deepEqual(
      targets.map((t) => t.name),
      ['bin/build.sh', 'bin/test.sh', 'bin/verify.sh', 'scripts/lint.sh', 'scripts/verify.sh'],
    );

    const test_ = find(targets, 'script', '', 'bin/test.sh');
    assert.equal(test_.invocation, './bin/test.sh');
    assert.equal(test_.file, 'bin/test.sh');
    assert.equal(test_.executable, true);
    assert.deepEqual(test_.aliases, []);
    assert.equal(find(targets, 'script', '', 'scripts/verify.sh').invocation, './scripts/verify.sh');
    assert.equal(find(targets, 'script', '', 'bin/build.sh').executable, true);
  });

  test('8b. a non-executable .sh is still listed, with executable: false', () => {
    const root = track(fx.scriptsOnlyRepo());
    const verify = find(readRunners(root), 'script', '', 'bin/verify.sh');
    assert.ok(verify, 'listed');
    assert.equal(verify.executable, false);
  });

  test('8c. body is the non-comment lines (shebang and comments dropped), first 40 only', () => {
    const root = track(fx.scriptsOnlyRepo());
    assert.deepEqual(
      find(readRunners(root), 'script', '', 'bin/test.sh').body,
      ['set -euo pipefail', 'go test ./...'],
    );
    const long = ['#!/bin/sh', '# header', ''];
    for (let i = 0; i < 60; i++) long.push(`echo line-${i}`);
    const big = track(fx.makeRepo({ 'scripts/build.sh': `${long.join('\n')}\n` }));
    const body = scriptTargets(big)[0].body;
    assert.equal(body.length, 40);
    assert.equal(body[0], 'echo line-0');
    assert.equal(body[39], 'echo line-39');
  });

  test('8d. only the conventional basenames; a directory named like one is not a script', () => {
    const files = {};
    for (const n of ['test', 'build', 'lint', 'verify', 'check', 'fmt', 'format', 'e2e']) files[`bin/${n}.sh`] = 'echo x\n';
    for (const n of ['deploy', 'up', 'doctor', 'testing', 'build-all']) files[`bin/${n}.sh`] = 'echo x\n';
    files['bin/test.bash'] = 'echo x\n';
    files['scripts/test.sh/inner.txt'] = 'a directory that happens to be called test.sh\n';
    const root = track(fx.makeRepo(files));
    assert.deepEqual(
      scriptTargets(root).map((t) => t.name),
      ['bin/build.sh', 'bin/check.sh', 'bin/e2e.sh', 'bin/fmt.sh', 'bin/format.sh', 'bin/lint.sh', 'bin/test.sh', 'bin/verify.sh'],
    );
  });

  test('8e. one level down: dir names the base directory, invocation is runnable from the root', () => {
    const root = track(fx.makeRepo({
      'svc/bin/test.sh': 'go test ./...\n',
      'a/b/bin/test.sh': 'too deep\n',
    }));
    const targets = scriptTargets(root);
    assert.equal(targets.length, 1);
    assert.equal(targets[0].dir, 'svc');
    assert.equal(targets[0].name, 'bin/test.sh');
    assert.equal(targets[0].file, 'svc/bin/test.sh');
    assert.equal(targets[0].invocation, './svc/bin/test.sh');
    assert.equal(scriptTargets(root, { maxDepth: 2 }).length, 2);
  });

  test('8f. hasTarget for scripts is file existence, confined to the repo', () => {
    const root = track(fx.scriptsOnlyRepo());
    assert.equal(hasTarget(root, { runner: 'script', dir: '', name: 'bin/test.sh' }), true);
    assert.equal(hasTarget(root, { runner: 'script', dir: '', name: 'bin/deploy.sh' }), true, 'any file, not only conventional names');
    assert.equal(hasTarget(root, { runner: 'script', dir: '', name: 'bin/nope.sh' }), false);
    assert.equal(hasTarget(root, { runner: 'script', dir: '', name: 'bin' }), false, 'a directory is not a script');
    assert.equal(hasTarget(root, { runner: 'script', dir: '', name: '../outside.sh' }), false);
    assert.equal(hasTarget(root, { runner: 'script', dir: 'bin', name: 'test.sh' }), true);
  });

  test('8g. every runner kind is read together and sorted by (dir, runner, name)', () => {
    const root = track(fx.makeRepo({
      'Makefile': 'build:\n\tgo build ./...\n',
      'justfile': 'lint:\n  golangci-lint run\n',
      'Taskfile.yml': 'version: "3"\ntasks:\n  test:\n    cmd: go test ./...\n',
      'package.json': '{"scripts":{"e2e":"playwright test"}}',
      'bin/verify.sh': 'make build\n',
    }));
    assert.deepEqual(
      readRunners(root).map((t) => `${t.runner}:${t.name}`),
      ['just:lint', 'make:build', 'npm:e2e', 'script:bin/verify.sh', 'task:test'],
    );
  });
});

// ─── deps / isDefault / order (TRD 42-13 tests 10-12) ─────────────────────────

describe('readRunners — deps, isDefault and source order (TRD 42-13)', () => {
  test('42-13/10. Make: prerequisites become deps; the first real target is the default', () => {
    const root = track(fx.makeDepsShape());
    const targets = readRunners(root);
    const build = find(targets, 'make', '', 'build');
    assert.deepEqual(build.deps, ['gen', 'fmt']);
    assert.equal(build.isDefault, true, 'no .DEFAULT_GOAL: the first real target is the default');
    assert.deepEqual(find(targets, 'make', '', 'package').deps, ['build', 'out'], 'order-only prerequisites are deps too');
    assert.deepEqual(find(targets, 'make', '', 'test').deps, [], 'a target-specific variable line is not a prerequisite list');
    assert.deepEqual(find(targets, 'make', '', 'gen').deps, []);
    for (const name of ['gen', 'fmt', 'package', 'test', 'out']) {
      assert.equal(find(targets, 'make', '', name).isDefault, false, name);
    }
  });

  test('42-13/10b. Make: `.DEFAULT_GOAL := all` makes `all` the default even when it is not first', () => {
    const root = track(fx.makeDepsShape());
    const targets = readRunners(root);
    assert.equal(find(targets, 'make', 'svc', 'all').isDefault, true);
    assert.equal(find(targets, 'make', 'svc', 'lint').isDefault, false, 'first, but .DEFAULT_GOAL names another');
    assert.deepEqual(find(targets, 'make', 'svc', 'all').deps, ['lint', 'build-dev']);
    assert.deepEqual(find(targets, 'make', 'svc', 'build-dev').deps, ['gen']);
  });

  test('42-13/10c. _parseMakefile keeps its target shape; deps and the default goal ride alongside', () => {
    const parsed = _parseMakefile('.DEFAULT_GOAL ?= b\na: x y\n\techo a\nb:\n\techo b\n');
    assert.deepEqual(parsed.targets, [{ name: 'a', body: ['echo a'] }, { name: 'b', body: ['echo b'] }]);
    assert.deepEqual(parsed.deps, { a: ['x', 'y'], b: [] });
    assert.equal(parsed.defaultGoal, 'b');
  });

  test('42-13/11. Taskfile: flow and block `deps:` (bare and `- task:` items); `default` is the default', () => {
    const root = track(fx.taskfileDepsShape());
    const targets = readRunners(root);
    assert.deepEqual(find(targets, 'task', '', 'default').deps, ['build:bundle'], 'flow list');
    assert.deepEqual(find(targets, 'task', '', 'build:bundle').deps, ['gen', 'tidy'], 'block list: bare and `- task:` items');
    assert.deepEqual(find(targets, 'task', '', 'dev').deps, ['gen', 'tidy'], 'quoted flow items are unquoted');
    assert.deepEqual(find(targets, 'task', '', 'build:macos').deps, []);
    assert.equal(find(targets, 'task', '', 'default').isDefault, true);
    for (const t of targets.filter((x) => x.name !== 'default')) assert.equal(t.isDefault, false, t.name);
    // `deps:` never leaks into the body.
    assert.deepEqual(find(targets, 'task', '', 'build:bundle').body, ['task build:daemon', 'task build:relay:internal']);
  });

  test('42-13/11b. targets carry their source order in the file, whatever the sorted output order', () => {
    const root = track(fx.taskfileDepsShape());
    const targets = readRunners(root);
    const order = (name) => find(targets, 'task', '', name).order;
    assert.equal(order('default'), 0);
    assert.ok(order('build:relay:quickdev') < order('build:bundle'), 'file order, not alphabetical');
    assert.ok(order('build:bundle') < order('build:relay:internal'));
    assert.ok(order('build:relay:internal') < order('dev'));
  });

  test('42-13/11c. _parseTaskfile tasks carry deps', () => {
    const text = 'tasks:\n  a:\n    deps: [b, {task: c}]\n    cmd: x\n  b:\n    cmd: y\n';
    const byName = Object.fromEntries(_parseTaskfile(text).tasks.map((t) => [t.name, t]));
    assert.deepEqual(byName.a.deps, ['b', 'c'], 'a flow map item names its task');
    assert.deepEqual(byName.b.deps, []);
  });

  test('42-13/12. justfile: recipe deps (plain, parameterised, post); the first recipe is the default', () => {
    const root = track(fx.justDepsShape());
    const targets = readRunners(root);
    assert.deepEqual(find(targets, 'just', '', 'build').deps, ['gen']);
    assert.deepEqual(find(targets, 'just', '', 'check').deps, ['build', 'lint'], 'a (recipe "arg") dependency names its recipe');
    assert.deepEqual(find(targets, 'just', '', 'release').deps, ['build', 'notify'], 'post-dependencies after && count');
    assert.deepEqual(find(targets, 'just', '', 'lint').deps, [], 'a parameter default is not a dependency');
    assert.equal(find(targets, 'just', '', 'build').isDefault, true, 'first recipe');
    assert.equal(find(targets, 'just', '', 'gen').isDefault, false);
  });

  test('42-13/12b. justfile: a recipe named `default` is the default even when it is not first', () => {
    const root = track(fx.justDepsShape());
    const targets = readRunners(root);
    assert.equal(find(targets, 'just', 'lib', 'default').isDefault, true);
    assert.deepEqual(find(targets, 'just', 'lib', 'default').deps, ['test']);
    assert.equal(find(targets, 'just', 'lib', 'test').isDefault, false);
  });

  test('42-13/12c. every target carries deps (an array) and isDefault (a boolean), npm and scripts included', () => {
    const root = track(fx.makeRepo({
      'package.json': '{"scripts":{"test":"vitest run","build":"tsc"}}',
      'bin/test.sh': 'go test ./...\n',
    }));
    for (const t of readRunners(root)) {
      assert.ok(Array.isArray(t.deps), `${t.runner}:${t.name} deps`);
      assert.equal(typeof t.isDefault, 'boolean', `${t.runner}:${t.name} isDefault`);
      assert.equal(typeof t.order, 'number', `${t.runner}:${t.name} order`);
      assert.equal(t.isDefault, false, 'no npm script or script file is a runner default');
    }
  });
});

describe('stack-runners module surface', () => {
  test('requires only fs and path', () => {
    const src = require('node:fs').readFileSync(require.resolve('./stack-runners.cjs'), 'utf-8');
    const required = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]).sort();
    assert.deepEqual(required, ['fs', 'path'], 'no stack-shell / stack-classify: those are built in parallel by 42-03');
  });
});
