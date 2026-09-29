'use strict';

// Hand-built fixtures for stack-verify.cjs tests (TRD 42-06).
//
// Nothing here depends on what is installed on the machine running the tests. A "binary" is a
// hand-written `#!/bin/sh` stub in a temp dir that the test puts on a fake PATH; a "home" is a temp
// dir with the tool directories `resolveBinary` scans. File text is INVENTED, never copied from a
// repo under `~/dev`. Recipe lines in a Makefile need a literal tab, hence the `\t` escapes.

const fs = require('fs');
const path = require('path');
const os = require('os');

const runnerFx = require('./stack-runner-fixtures.cjs');

const { makeRepo, cleanup } = runnerFx;

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeStub(dir, name, exitCode) {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `#!/bin/sh\nexit ${exitCode}\n`, 'utf-8');
  fs.chmodSync(file, 0o755);
  return file;
}

/**
 * fakeBin(names, { failing = [] }) -> dir of `#!/bin/sh` stubs, chmod 755. Names in `failing`
 * exit 3; the rest exit 0. Put the dir (plus the node dir) on PATH to test resolution and `--run`
 * without any real tool.
 */
function fakeBin(names = [], { failing = [] } = {}) {
  const dir = mkTmp('df-verify-bin-');
  for (const name of names) writeStub(dir, name, 0);
  for (const name of failing) writeStub(dir, name, 3);
  return dir;
}

/**
 * fakeHome({ goBin, localBin, maestroBin, miseShims }) -> fake home dir with executable stubs in
 * the directories resolveBinary scans below `~`.
 */
function fakeHome({ goBin = [], localBin = [], maestroBin = [], miseShims = [] } = {}) {
  const home = mkTmp('df-verify-home-');
  const spec = [
    ['go/bin', goBin],
    ['.local/bin', localBin],
    ['.maestro/bin', maestroBin],
    ['.local/share/mise/shims', miseShims],
  ];
  for (const [rel, names] of spec) {
    for (const name of names) writeStub(path.join(home, rel), name, 0);
  }
  return home;
}

/**
 * verifyRepo() — the static-resolver fixture.
 *
 *   svc/Makefile     test, lint            (no include)
 *   inc/Makefile     build, plus `include common.mk` (a name it does not define is undecidable)
 *   Taskfile.yml     lint:go, build
 *   justfile         test
 *   package.json     scripts build, lint, test; pnpm-lock.yaml beside it
 *   bin/test.sh      executable
 *   scripts/x.sh     NOT executable
 *   cmd/tool/main.go an empty placeholder
 */
function verifyRepo() {
  return makeRepo({
    'svc/Makefile': [
      '.PHONY: test lint',
      'test:',
      '\tgo test ./...',
      '',
      'lint:',
      '\tgolangci-lint run',
      '',
    ].join('\n'),
    'inc/Makefile': [
      'include common.mk',
      '',
      'build:',
      '\t@echo build',
      '',
    ].join('\n'),
    'Taskfile.yml': [
      "version: '3'",
      'tasks:',
      '  lint:go:',
      '    cmds:',
      '      - golangci-lint run',
      '  build:',
      '    cmds:',
      '      - go build ./...',
      '',
    ].join('\n'),
    justfile: [
      'test:',
      '    go test ./...',
      '',
    ].join('\n'),
    'package.json': JSON.stringify({
      name: 'fixture-app',
      scripts: { build: 'tsc', lint: 'eslint .', test: 'vitest run' },
    }, null, 2),
    'pnpm-lock.yaml': 'lockfileVersion: 9\n',
    'bin/test.sh': '#!/bin/sh\ngo test ./...\n',
    'scripts/x.sh': '#!/bin/sh\necho x\n',
    'cmd/tool/main.go': '',
  }, {
    modes: { 'bin/test.sh': 0o755, 'scripts/x.sh': 0o644 },
  });
}

/**
 * bodyRepo() — the deny-policy-on-bodies fixture (Test list 5b). Every target/script below is
 * invented; a "dangerous" body is only ever SCANNED by the tests, never executed.
 */
function bodyRepo() {
  return makeRepo({
    Makefile: [
      'build:',
      '\tdocker push registry/x:tag',
      '',
      'lint:',
      '\tgolangci-lint run',
      '',
      'chain:',
      '\t$(MAKE) push',
      '',
      'push:',
      '\tdocker push registry/x:tag',
      '',
      'deploy-check:',
      '\t./scripts/deploy.sh',
      '',
      'wrapped-ok:',
      '\t./scripts/lint.sh',
      '',
      'needs-dep: lint',
      '\tgolangci-lint run',
      '',
      'pushes-quoted:',
      '\tsh -c "git push origin main"',
      '',
    ].join('\n'),
    'Taskfile.yml': [
      "version: '3'",
      'tasks:',
      '  ship:',
      '    cmds:',
      '      - kubectl apply -f k8s/',
      '  fine:',
      '    cmds:',
      '      - golangci-lint run',
      '',
    ].join('\n'),
    justfile: [
      'release:',
      '    gh release create v1',
      '',
      'fine:',
      '    golangci-lint run',
      '',
    ].join('\n'),
    'package.json': JSON.stringify({
      name: 'body-app',
      scripts: {
        build: 'tsc && npm publish',
        lint: 'eslint . && git push',
        check: 'tsc --noEmit',
        chained: 'npm run check && tsc',
        hooked: 'tsc',
        posthooked: 'npm publish',
      },
    }, null, 2),
    'pnpm-lock.yaml': 'lockfileVersion: 9\n',
    'scripts/release.sh': '#!/bin/sh\ngit push origin main\n',
    'scripts/ci.sh': '#!/bin/sh\ndocker push x\n',
    'scripts/deploy.sh': '#!/bin/sh\nkubectl apply -f k8s/\n',
    'scripts/lint.sh': '#!/bin/sh\ngolangci-lint run ./...\n',
    'scripts/outer.sh': '#!/bin/sh\n./scripts/inner.sh\n',
    'scripts/outer-make.sh': '#!/bin/sh\nmake push\n',
    'scripts/inner.sh': '#!/bin/sh\ngolangci-lint run\n',
    'scripts/continued.sh': '#!/bin/sh\ndocker \\\n  push x\n',
    'scripts/sourced.sh': '#!/bin/sh\n. ./scripts/inner.sh\n',
    'scripts/binary.dat': 'ELF\u0000\u0001\u0002',
    'bin/check': '#!/bin/sh\nnpm publish\n',
  }, {
    modes: {
      'scripts/release.sh': 0o755,
      'scripts/ci.sh': 0o755,
      'scripts/deploy.sh': 0o755,
      'scripts/lint.sh': 0o755,
      'scripts/outer.sh': 0o755,
      'scripts/outer-make.sh': 0o755,
      'scripts/inner.sh': 0o755,
      'scripts/continued.sh': 0o755,
      'scripts/sourced.sh': 0o755,
      'scripts/binary.dat': 0o755,
      'bin/check': 0o755,
    },
  });
}

module.exports = {
  makeRepo,
  cleanup,
  fakeBin,
  fakeHome,
  verifyRepo,
  bodyRepo,
};
