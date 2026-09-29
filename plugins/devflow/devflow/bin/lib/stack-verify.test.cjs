'use strict';

// stack-verify.test.cjs — Test list (TRD 42-06), outermost (CLI) to innermost (resolver).
//
//  1. CLI `stack verify --raw`: resolved / binary_missing / script_missing per command, exit 1 when
//     any is not resolved, and nothing is written.
//  2. CLI `stack verify --draft`: verifies the in-memory `stack init` preview; STACK.md is never created.
//  3. CLI `stack verify --run`: stub binaries run, `test` needs --include, a failing stub gives exit 1.
//  4. Components: results are tagged with the component path; cwd is what renderCommand returned.
//  5. Deny policy, table-driven: refused with a named reason, never spawned.
// 5b. Deny policy on EXPANDED bodies (runner targets, npm scripts, wrapper scripts), one level deep.
//  6. Key policy: codegen / deps / tidy.apply / format.apply / fix.apply are never run.
//  7. `make -C svc test`: resolved / target_missing / unverifiable (include).
//  8. task / just / pnpm are checked against their runner files; the runner binary must exist too.
//  9. `./bin/test.sh` resolved; not executable -> script_missing; `bash x.sh` needs only existence.
// 10. `HOME=/root ginkgo -r -p` checks ginkgo; `cd svc && go vet ./...` checks go.
// 11. `npx playwright test` with nothing installed -> unverifiable (low).
// 12. `go run ./cmd/tool`: dir present -> resolved, absent -> script_missing.
// 13. resolveBinary finds tools in ~/go/bin (and the other well-known dirs) off PATH.
//
// No test depends on what is installed: binaries are stubs in a temp dir and `which` is injected.
// Tests never run a real command against a repo outside their own mkdtemp fixture.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const fx = require('./__fixtures__/stack-verify-fixtures.cjs');
const { verifyCommand, resolveBinary } = require('./stack-verify.cjs');

const dirs = [];
function track(dir) { dirs.push(dir); return dir; }
afterEach(() => { while (dirs.length) fx.cleanup(dirs.pop()); });

/** A `which` that finds exactly `names` and reports a fake absolute path for each. */
function whichOf(...names) {
  const have = new Set(names);
  return (name) => (have.has(name) ? `/fake/bin/${name}` : null);
}

// ─── 7. make targets ───────────────────────────────────────────────────────────

describe('verifyCommand: make targets (test 7)', () => {
  test('a target that exists resolves', () => {
    const root = track(fx.verifyRepo());
    const r = verifyCommand('make -C svc test', { root, which: whichOf('make') });
    assert.equal(r.status, 'resolved');
    assert.equal(r.tool, 'make');
  });

  test('a target that is absent is target_missing, never resolved', () => {
    const root = track(fx.verifyRepo());
    const r = verifyCommand('make -C svc nope', { root, which: whichOf('make') });
    assert.equal(r.status, 'target_missing');
    assert.match(r.detail, /nope/);
  });

  test('an absent name in an include-expanded Makefile is unverifiable, not target_missing', () => {
    const root = track(fx.verifyRepo());
    const r = verifyCommand('make -C inc nope', { root, which: whichOf('make') });
    assert.equal(r.status, 'unverifiable');
  });

  test('a name the include-Makefile DOES define still resolves', () => {
    const root = track(fx.verifyRepo());
    assert.equal(verifyCommand('make -C inc build', { root, which: whichOf('make') }).status, 'resolved');
  });

  test('make itself missing is binary_missing before the target is looked at', () => {
    const root = track(fx.verifyRepo());
    const r = verifyCommand('make -C svc test', { root, which: whichOf() });
    assert.equal(r.status, 'binary_missing');
    assert.equal(r.tool, 'make');
  });

  test('`cd svc && make test` resolves against svc, not the repo root', () => {
    const root = track(fx.verifyRepo());
    assert.equal(verifyCommand('cd svc && make test', { root, which: whichOf('make') }).status, 'resolved');
    assert.equal(verifyCommand('make test', { root, which: whichOf('make') }).status, 'target_missing');
  });

  test('the `cwd` option seeds the directory the command runs in', () => {
    const root = track(fx.verifyRepo());
    assert.equal(verifyCommand('make lint', { root, cwd: 'svc', which: whichOf('make') }).status, 'resolved');
  });
});

// ─── 8. task / just / npm family ───────────────────────────────────────────────

describe('verifyCommand: task, just and npm-family scripts (test 8)', () => {
  test('task lint:go resolves against the Taskfile; an unknown task is target_missing', () => {
    const root = track(fx.verifyRepo());
    const which = whichOf('task');
    assert.equal(verifyCommand('task lint:go', { root, which }).status, 'resolved');
    assert.equal(verifyCommand('task nope', { root, which }).status, 'target_missing');
  });

  test('just test resolves against the justfile; an unknown recipe is target_missing', () => {
    const root = track(fx.verifyRepo());
    const which = whichOf('just');
    assert.equal(verifyCommand('just test', { root, which }).status, 'resolved');
    assert.equal(verifyCommand('just nope', { root, which }).status, 'target_missing');
  });

  test('pnpm run build resolves against the cwd package.json; an unknown script is script_missing', () => {
    const root = track(fx.verifyRepo());
    const which = whichOf('pnpm');
    assert.equal(verifyCommand('pnpm run build', { root, which }).status, 'resolved');
    const r = verifyCommand('pnpm run nope', { root, which });
    assert.equal(r.status, 'script_missing');
    assert.match(r.detail, /nope/);
  });

  test('`npm test` and the bare `pnpm lint` short forms are script lookups too', () => {
    const root = track(fx.verifyRepo());
    assert.equal(verifyCommand('npm test', { root, which: whichOf('npm') }).status, 'resolved');
    assert.equal(verifyCommand('pnpm lint', { root, which: whichOf('pnpm') }).status, 'resolved');
    assert.equal(verifyCommand('pnpm nope', { root, which: whichOf('pnpm') }).status, 'script_missing');
  });

  test('a non-script npm verb (`npm ci`) only needs the binary', () => {
    const root = track(fx.verifyRepo());
    assert.equal(verifyCommand('npm ci', { root, which: whichOf('npm') }).status, 'resolved');
  });

  test('the runner binary must be on PATH too, else binary_missing', () => {
    const root = track(fx.verifyRepo());
    for (const cmd of ['task lint:go', 'just test', 'pnpm run build']) {
      const r = verifyCommand(cmd, { root, which: whichOf() });
      assert.equal(r.status, 'binary_missing', cmd);
    }
  });

  test('a package.json is looked up in the command cwd, not only the root', () => {
    const root = track(fx.makeRepo({
      'web/package.json': JSON.stringify({ scripts: { build: 'vite build' } }),
    }));
    assert.equal(verifyCommand('npm --prefix web run build', { root, which: whichOf('npm') }).status, 'resolved');
    assert.equal(verifyCommand('cd web && npm run build', { root, which: whichOf('npm') }).status, 'resolved');
    assert.equal(verifyCommand('npm run build', { root, which: whichOf('npm') }).status, 'script_missing');
  });

  test('compound commands: every runner token is checked, and a miss anywhere is a miss', () => {
    const root = track(fx.verifyRepo());
    const which = whichOf('make', 'pnpm');
    const r = verifyCommand('make -C svc test && pnpm run nope', { root, which });
    assert.equal(r.status, 'script_missing');
    assert.equal(verifyCommand('make -C svc test && pnpm run build', { root, which }).status, 'resolved');
  });

  test('a missing target outranks an unverifiable one in the same compound command', () => {
    const root = track(fx.verifyRepo());
    const which = whichOf('make');
    const r = verifyCommand('make -C inc nope && make -C svc gone', { root, which });
    assert.equal(r.status, 'target_missing');
  });
});

// ─── 9. scripts ────────────────────────────────────────────────────────────────

describe('verifyCommand: scripts (test 9)', () => {
  test('./bin/test.sh present and executable resolves', () => {
    const root = track(fx.verifyRepo());
    assert.equal(verifyCommand('./bin/test.sh', { root, which: whichOf() }).status, 'resolved');
  });

  test('present but not executable is script_missing with detail `not executable`', () => {
    const root = track(fx.verifyRepo());
    const r = verifyCommand('./scripts/x.sh', { root, which: whichOf() });
    assert.equal(r.status, 'script_missing');
    assert.match(r.detail, /not executable/);
  });

  test('an absent script is script_missing', () => {
    const root = track(fx.verifyRepo());
    const r = verifyCommand('./scripts/missing.sh', { root, which: whichOf() });
    assert.equal(r.status, 'script_missing');
    assert.match(r.detail, /not found/);
  });

  test('`bash scripts/x.sh` needs only existence, and the interpreter on PATH', () => {
    const root = track(fx.verifyRepo());
    assert.equal(verifyCommand('bash scripts/x.sh', { root, which: whichOf('bash') }).status, 'resolved');
    assert.equal(verifyCommand('sh scripts/x.sh', { root, which: whichOf('sh') }).status, 'resolved');
    assert.equal(verifyCommand('bash scripts/nope.sh', { root, which: whichOf('bash') }).status, 'script_missing');
    assert.equal(verifyCommand('bash scripts/x.sh', { root, which: whichOf() }).status, 'binary_missing');
  });

  test('a path-style executable without .sh (`bin/test.sh` form) is resolved against the cwd, not PATH', () => {
    const root = track(fx.verifyRepo());
    assert.equal(verifyCommand('bin/test.sh', { root, which: whichOf() }).status, 'resolved');
  });

  test('a script cwd follows `cd`', () => {
    const root = track(fx.verifyRepo());
    assert.equal(verifyCommand('cd bin && ./test.sh', { root, which: whichOf() }).status, 'resolved');
  });
});

// ─── 10. env prefix and cd ─────────────────────────────────────────────────────

describe('verifyCommand: env prefixes and cd (test 10)', () => {
  test('`HOME=/root ginkgo -r -p` with ginkgo absent is binary_missing (the env prefix is stripped)', () => {
    const root = track(fx.verifyRepo());
    const r = verifyCommand('HOME=/root ginkgo -r -p', { root, which: whichOf() });
    assert.equal(r.status, 'binary_missing');
    assert.equal(r.tool, 'ginkgo');
    assert.equal(verifyCommand('HOME=/root ginkgo -r -p', { root, which: whichOf('ginkgo') }).status, 'resolved');
  });

  test('`cd svc && go vet ./...` checks go', () => {
    const root = track(fx.verifyRepo());
    const r = verifyCommand('cd svc && go vet ./...', { root, which: whichOf() });
    assert.equal(r.status, 'binary_missing');
    assert.equal(r.tool, 'go');
    assert.equal(verifyCommand('cd svc && go vet ./...', { root, which: whichOf('go') }).status, 'resolved');
  });

  test('a command with nothing checkable (all plumbing) is unverifiable, never resolved', () => {
    const root = track(fx.verifyRepo());
    const r = verifyCommand('echo hello', { root, which: whichOf('echo') });
    assert.equal(r.status, 'unverifiable');
  });

  test('a shell builtin (`test -f x`) is not a missing binary', () => {
    const root = track(fx.verifyRepo());
    const r = verifyCommand('test -z "$(gofmt -l .)"', { root, which: whichOf('gofmt') });
    assert.equal(r.status, 'resolved');
    assert.equal(r.tool, 'gofmt');
    const miss = verifyCommand('test -z "$(gofmt -l .)"', { root, which: whichOf() });
    assert.equal(miss.status, 'binary_missing');
    assert.equal(miss.tool, 'gofmt');
  });
});

// ─── 11. npx ───────────────────────────────────────────────────────────────────

describe('verifyCommand: npx (test 11)', () => {
  test('no node_modules/.bin/<tool> and no dependency -> unverifiable with low confidence', () => {
    const root = track(fx.verifyRepo());
    const r = verifyCommand('npx playwright test', { root, which: whichOf('npx') });
    assert.equal(r.status, 'unverifiable');
    assert.equal(r.confidence, 'low');
  });

  test('an installed node_modules/.bin/<tool> resolves', () => {
    const root = track(fx.makeRepo({ 'node_modules/.bin/playwright': '#!/bin/sh\nexit 0\n' }, {
      modes: { 'node_modules/.bin/playwright': 0o755 },
    }));
    assert.equal(verifyCommand('npx playwright test', { root, which: whichOf('npx') }).status, 'resolved');
  });

  test('a declared (but not installed) dependency resolves, and says so', () => {
    const root = track(fx.makeRepo({
      'package.json': JSON.stringify({ devDependencies: { playwright: '^1.50.0' } }),
    }));
    const r = verifyCommand('npx playwright test', { root, which: whichOf('npx') });
    assert.equal(r.status, 'resolved');
    assert.match(r.detail, /declared/);
  });

  test('npx itself missing is binary_missing', () => {
    const root = track(fx.verifyRepo());
    assert.equal(verifyCommand('npx playwright test', { root, which: whichOf() }).status, 'binary_missing');
  });
});

// ─── 12. go run ────────────────────────────────────────────────────────────────

describe('verifyCommand: go run (test 12)', () => {
  test('`go run ./cmd/tool` with the dir present resolves; absent is script_missing', () => {
    const root = track(fx.verifyRepo());
    const which = whichOf('go');
    assert.equal(verifyCommand('go run ./cmd/tool', { root, which }).status, 'resolved');
    const r = verifyCommand('go run ./cmd/nope', { root, which });
    assert.equal(r.status, 'script_missing');
    assert.match(r.detail, /cmd\/nope/);
  });

  test('`go run .` and a plain `go build ./...` need only go', () => {
    const root = track(fx.verifyRepo());
    const which = whichOf('go');
    assert.equal(verifyCommand('go run .', { root, which }).status, 'resolved');
    assert.equal(verifyCommand('go build ./...', { root, which }).status, 'resolved');
  });
});

// ─── 13. resolveBinary ─────────────────────────────────────────────────────────

describe('resolveBinary (test 13)', () => {
  test('finds a tool in ~/go/bin when it is not on PATH', () => {
    const bin = track(fx.fakeBin(['other']));
    const home = track(fx.fakeHome({ goBin: ['gopls'] }));
    const found = resolveBinary('gopls', { env: { PATH: bin }, home });
    assert.equal(found, path.join(home, 'go', 'bin', 'gopls'));
  });

  test('a tool on PATH wins over the well-known dirs', () => {
    const bin = track(fx.fakeBin(['gopls']));
    const home = track(fx.fakeHome({ goBin: ['gopls'] }));
    assert.equal(resolveBinary('gopls', { env: { PATH: bin }, home }), path.join(bin, 'gopls'));
  });

  test('scans $GOPATH/bin, ~/.local/bin, ~/.maestro/bin and mise shims', () => {
    const home = track(fx.fakeHome({ localBin: ['a'], maestroBin: ['maestro'], miseShims: ['node'] }));
    const gopath = track(fx.fakeBin([]));
    fs.mkdirSync(path.join(gopath, 'bin'));
    fs.writeFileSync(path.join(gopath, 'bin', 'staticcheck'), '#!/bin/sh\nexit 0\n');
    fs.chmodSync(path.join(gopath, 'bin', 'staticcheck'), 0o755);
    const env = { PATH: '', GOPATH: gopath };
    assert.equal(resolveBinary('staticcheck', { env, home }), path.join(gopath, 'bin', 'staticcheck'));
    assert.equal(resolveBinary('a', { env, home }), path.join(home, '.local', 'bin', 'a'));
    assert.equal(resolveBinary('maestro', { env, home }), path.join(home, '.maestro', 'bin', 'maestro'));
    assert.equal(resolveBinary('node', { env, home }), path.join(home, '.local', 'share', 'mise', 'shims', 'node'));
  });

  test('null when nowhere; a non-executable file does not count', () => {
    const bin = track(fx.fakeBin([]));
    fs.writeFileSync(path.join(bin, 'plain'), 'not a binary');
    const home = track(fx.fakeHome({}));
    assert.equal(resolveBinary('plain', { env: { PATH: bin }, home }), null);
    assert.equal(resolveBinary('absent', { env: { PATH: bin }, home }), null);
  });

  test('missing never counts as resolved: verifyCommand falls back to the real resolver', () => {
    const root = track(fx.verifyRepo());
    const bin = track(fx.fakeBin(['ginkgo']));
    const home = track(fx.fakeHome({}));
    const r = verifyCommand('ginkgo -r', { root, env: { PATH: bin }, home });
    assert.equal(r.status, 'resolved');
    const miss = verifyCommand('ginkgo -r', { root, env: { PATH: '' }, home });
    assert.equal(miss.status, 'binary_missing');
  });
});

// (Tasks 2-3 tests are appended below.)
