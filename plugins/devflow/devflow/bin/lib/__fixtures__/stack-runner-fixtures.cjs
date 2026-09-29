'use strict';

// Hand-built fixture builders for stack-runners.cjs tests (TRD 42-04).
// Per TDD playbook habit 4 (`no_llm_test_data`): factory functions, not generated test data.
//
// Every builder writes into a `fs.mkdtemp`-ed directory and returns its absolute path. The
// file text below is INVENTED — modelled on the shapes of real repos (a monorepo Makefile in a
// service subdirectory, a Taskfile with `:` in task names, a subshell fan-out justfile, a
// manifest-less shell-script repo) but never copied from anything under `~/dev`.

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * makeRepo(files, { modes }) -> absolute repo root.
 *
 * `files` maps `relPath -> content`; parent directories are created as needed. `modes` maps
 * `relPath -> octal mode` and is applied with an explicit `chmodSync` so the executable bit
 * does not depend on the temp filesystem's umask.
 */
function makeRepo(files = {}, { modes = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-stack-runners-'));
  for (const [relPath, content] of Object.entries(files)) {
    const full = path.join(root, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
  }
  for (const [relPath, mode] of Object.entries(modes)) {
    fs.chmodSync(path.join(root, relPath), mode);
  }
  return root;
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* best effort */ }
}

// Recipe lines in a Makefile MUST start with a literal tab, so these builders use `\t` escapes
// rather than typing tabs into the template literals.

/**
 * makefileMonorepo() — a root Makefile plus `svc/Makefile`.
 *
 * Root: `all`, `test` (with a `\` continuation), `lint` (with `@` and `-` prefixes), plus the
 * things that must NOT become targets: `.PHONY`, variable assignments and a pattern rule.
 * svc: test / build / vet / lint / generate / drift-check.
 */
function makefileMonorepo() {
  const root = [
    '# Root orchestration',
    '.PHONY: all test lint',
    'BIN := bin/widgetd',
    'GOFLAGS ?= -count=1',
    'PATHS = /a:/b',
    '',
    'all: test lint',
    '',
    'test:',
    '\tgo test -race \\',
    '\t  ./...',
    '',
    'lint:',
    '\t@echo linting',
    '\t-golangci-lint run ./...',
    '',
    '%.o: %.c',
    '\t$(CC) -c $<',
    '',
  ].join('\n');

  const svc = [
    '.PHONY: test build vet lint generate drift-check',
    'VERSION ?= dev',
    '',
    'test:',
    '\t@go test -race -count=1 \\',
    '\t  -coverprofile=cover.out \\',
    '\t  ./...',
    '',
    'build:',
    '\tgo build -o bin/svc ./cmd/svc',
    '',
    'vet:',
    '\tgo vet ./...',
    '',
    'lint:',
    '\t-golangci-lint run',
    '',
    'generate:',
    '\tgo generate ./...',
    '',
    'drift-check: generate',
    '\t@git diff --exit-code -- gen/',
    '',
  ].join('\n');

  return makeRepo({ Makefile: root, 'svc/Makefile': svc });
}

/** makefileWithInclude() — `include common.mk` plus one statically defined target. */
function makefileWithInclude() {
  return makeRepo({
    Makefile: [
      'include common.mk',
      '',
      'build:',
      '\tgo build ./...',
      '',
    ].join('\n'),
  });
}

/**
 * taskfileRepo() — `Taskfile.yml` with `:` in task names, `cmd:` / `cmds:` (flow list, block
 * list, `- cmd:` items, `- task:` references, a block scalar item), `aliases:` (flow and block)
 * and a task-level `dir:`.
 */
function taskfileRepo() {
  const taskfile = [
    "version: '3'",
    '',
    'vars:',
    '  GREETING: hello',
    '',
    'tasks:',
    '  default:',
    '    cmds:',
    '      - task: test',
    '',
    '  lint:go:',
    '    desc: Lint the Go code',
    '    dir: go',
    '    cmds: [golangci-lint run]',
    '',
    '  test:',
    '    aliases: [t]',
    '    cmd: go test ./...',
    '',
    '  ci:',
    '    cmds:',
    '      - cmd: go vet ./...',
    '        silent: true',
    '      - task: lint:go',
    '      - go build ./...',
    '',
    '  gen:',
    '    aliases:',
    '      - g',
    '      - generate',
    '    cmds:',
    '      - |',
    '        buf generate',
    '        sqlc generate',
    '',
  ].join('\n');
  return makeRepo({ 'Taskfile.yml': taskfile });
}

/** taskfileWithIncludes() — a Taskfile whose namespaces come from `includes:` (statically opaque). */
function taskfileWithIncludes() {
  return makeRepo({
    'Taskfile.yaml': [
      "version: '3'",
      '',
      'includes:',
      '  web:',
      '    taskfile: ./web/Taskfile.yml',
      '',
      'tasks:',
      '  build:',
      '    cmds:',
      '      - go build ./...',
      '',
    ].join('\n'),
  });
}

/**
 * justfileFanOut() — the subshell fan-out shape: a mutating `fmt`, `test *args`, a quiet
 * `@lint`, an `alias`, and a `set` line, none of which may be mistaken for recipes.
 */
function justfileFanOut() {
  const justfile = [
    'set shell := ["bash", "-euo", "pipefail", "-c"]',
    '',
    'alias t := test',
    '',
    '# format every module (mutating)',
    'fmt:',
    '  (cd lib-a && dart format .)',
    '  (cd lib-b && dart format .)',
    '',
    'test *args:',
    '  (cd lib-a && dart test {{args}})',
    '  (cd lib-b && dart test {{args}})',
    '',
    '@lint:',
    '  (cd lib-a && dart analyze)',
    '  (cd lib-b && dart analyze)',
    '',
  ].join('\n');
  return makeRepo({ justfile });
}

/** justfileWithImport() — `import` / `mod` make the recipe set statically incomplete. */
function justfileWithImport() {
  return makeRepo({
    justfile: [
      "import 'ci.just'",
      'mod docs',
      '',
      'build:',
      '  cargo build',
      '',
    ].join('\n'),
  });
}

/**
 * npmFamily({ lock, dir, malformed }) — a package.json with test/build/lint scripts.
 *
 * `lock` is the lockfile FILE NAME to drop next to it (`pnpm-lock.yaml`, `yarn.lock`,
 * `bun.lockb`, `bun.lock`, `package-lock.json`) or null for none. `dir` places the package in
 * a subdirectory. `malformed` writes unparseable JSON instead.
 */
function npmFamily({ lock = null, dir = '', malformed = false } = {}) {
  const prefix = dir ? `${dir}/` : '';
  const pkg = malformed
    ? '{ "name": "widget-ui", "scripts": { '
    : JSON.stringify({
      name: 'widget-ui',
      version: '0.0.0',
      scripts: {
        test: 'vitest run',
        build: 'tsc -p .',
        lint: 'eslint .',
      },
    }, null, 2);
  const files = { [`${prefix}package.json`]: pkg };
  if (lock) files[`${prefix}${lock}`] = '';
  return makeRepo(files);
}

/**
 * scriptsOnlyRepo() — manifest-less: `bin/*.sh` and `scripts/*.sh` are the interface.
 *
 * Executable: bin/test.sh, bin/build.sh, scripts/lint.sh, scripts/verify.sh. NOT executable:
 * bin/verify.sh. Not conventional names (never surfaced): bin/deploy.sh, bin/helper.py,
 * bin/test (no `.sh`).
 */
function scriptsOnlyRepo() {
  const sh = (body) => `#!/usr/bin/env bash\n# ${body[0]}\nset -euo pipefail\n${body.slice(1).join('\n')}\n`;
  return makeRepo({
    'bin/test.sh': sh(['run the suite', 'go test ./...']),
    'bin/build.sh': sh(['build the binary', 'go build -o out/widgetd ./cmd/widgetd']),
    'bin/verify.sh': sh(['verify the tree', './bin/test.sh', './bin/build.sh']),
    'bin/deploy.sh': sh(['deploy', 'echo deploying']),
    'bin/helper.py': 'print("helper")\n',
    'bin/test': 'not a script the drafter should list\n',
    'scripts/lint.sh': sh(['lint', 'golangci-lint run']),
    'scripts/verify.sh': sh(['verify', './scripts/lint.sh']),
  }, {
    modes: {
      'bin/test.sh': 0o755,
      'bin/build.sh': 0o755,
      'bin/verify.sh': 0o644,
      'bin/deploy.sh': 0o755,
      'scripts/lint.sh': 0o755,
      'scripts/verify.sh': 0o755,
    },
  });
}

/** emptyRepo() — an empty directory. */
function emptyRepo() {
  return makeRepo({});
}

module.exports = {
  makeRepo,
  cleanup,
  makefileMonorepo,
  makefileWithInclude,
  taskfileRepo,
  taskfileWithIncludes,
  justfileFanOut,
  justfileWithImport,
  npmFamily,
  scriptsOnlyRepo,
  emptyRepo,
};
