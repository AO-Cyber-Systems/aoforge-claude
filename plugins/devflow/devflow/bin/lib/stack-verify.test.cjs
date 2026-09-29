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

// ─── Task 2: --run policy and executor (tests 5, 5b, 6, 3-unit) ────────────────

const { runCommands, RUN_POLICY } = require('./stack-verify.cjs');

/** A spawn spy: records every call, answers with `reply` (a fixed object or a function of the call). */
function spySpawn(reply = { status: 0, stdout: 'ok\n', stderr: '' }) {
  const calls = [];
  const spawn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    return typeof reply === 'function' ? reply({ cmd, args, opts }) : reply;
  };
  spawn.calls = calls;
  return spawn;
}

const item = (command, key = 'build', extra = {}) => ({ component: null, key, command, cwd: '', ...extra });

describe('RUN_POLICY shape', () => {
  test('key sets match the TRD', () => {
    assert.deepEqual(RUN_POLICY.defaultKeys, ['format', 'lint', 'typecheck', 'build']);
    assert.deepEqual(RUN_POLICY.optInKeys, ['test', 'e2e', 'audit', 'sast', 'lint_helm', 'lint_docker']);
    assert.deepEqual(RUN_POLICY.neverKeys, ['codegen', 'deps']);
    assert.ok(RUN_POLICY.deny.length >= 15);
    for (const d of RUN_POLICY.deny) {
      assert.ok(d.re instanceof RegExp && !d.re.global && !d.re.sticky, `deny regex must be stateless: ${d.reason}`);
      assert.equal(typeof d.reason, 'string');
    }
    assert.ok(RUN_POLICY.skip.some((s) => s.reason === 'container-build'));
  });
});

describe('runCommands: deny policy on the command (test 5)', () => {
  const DENY_ROWS = [
    ['make deploy', 'deploy-target'],
    ['npm publish', 'npm-publish'],
    ['dart pub publish', 'pub-publish'],
    ['flutter pub publish', 'pub-publish'],
    ['gh release create', 'gh-release'],
    ['goreleaser release', 'goreleaser'],
    ['docker push x', 'docker-push'],
    ['docker buildx build --push .', 'docker-push'],
    ['docker build --push .', 'docker-push'],
    ['kubectl apply -f k8s/', 'kubectl-apply'],
    ['kubectl delete ns x', 'kubectl-delete'],
    ['helm upgrade --install x', 'helm-deploy'],
    ['helm install x ./chart', 'helm-deploy'],
    ['terraform apply', 'terraform-apply'],
    ['terraform destroy -auto-approve', 'terraform-apply'],
    ['npm run dev', 'server-or-watch'],
    ['pnpm run test:watch', 'server-or-watch'],
    ['jest --watch', 'server-or-watch'],
    ['flutter run', 'flutter-run'],
    ['go run ./cmd/server --port 8080', 'port-8080-forbidden'],
    ['curl localhost:8080/health', 'port-8080-forbidden'],
    ['task release:tag', 'deploy-target'],
    ['git push origin main', 'git-push'],
    ['go test ./... && git push', 'git-push'],
    ['cargo publish', 'cargo-publish'],
    ['twine upload dist/*', 'python-publish'],
    ['docker compose up', 'container-run'],
    ['fly deploy', 'deploy-cli'],
    ['sh -c "git push origin main"', 'git-push'],
  ];

  test('at least 15 refused commands, each with its named reason and never spawned', () => {
    assert.ok(DENY_ROWS.length >= 15);
    const root = track(fx.makeRepo({}));
    for (const [command, reason] of DENY_ROWS) {
      const spawn = spySpawn();
      const [r] = runCommands([item(command)], { root, spawn });
      assert.equal(spawn.calls.length, 0, `${command} must not spawn`);
      assert.equal(r.run.skipped, reason, command);
      assert.equal(r.skipped, reason, command);
      assert.equal(r.run.exit_code, undefined, command);
    }
  });

  test('`docker build .` is skipped with reason container-build, and not spawned', () => {
    const root = track(fx.makeRepo({}));
    for (const command of ['docker build .', 'docker buildx build -t x .', 'docker compose build']) {
      const spawn = spySpawn();
      const [r] = runCommands([item(command)], { root, spawn });
      assert.equal(spawn.calls.length, 0, command);
      assert.equal(r.run.skipped, 'container-build', command);
    }
  });

  test('a denied command does not lose to a skip in the same command line', () => {
    const root = track(fx.makeRepo({}));
    const spawn = spySpawn();
    const [r] = runCommands([item('docker build . && docker push x')], { root, spawn });
    assert.equal(r.run.skipped, 'docker-push');
    assert.equal(spawn.calls.length, 0);
  });

  test('safe commands are not caught by the deny set', () => {
    const root = track(fx.makeRepo({}));
    for (const command of ['go build ./...', 'golangci-lint run ./...', 'tsc --noEmit', 'gofmt -l .', 'cargo clippy', 'helm lint chart/', 'kubectl version --client', 'terraform validate', 'git diff --exit-code', 'dart analyze', 'flutter analyze', 'go vet ./...']) {
      const spawn = spySpawn();
      const [r] = runCommands([item(command)], { root, spawn });
      assert.equal(r.run.skipped, undefined, `${command} was wrongly refused: ${r.run.skipped}`);
      assert.equal(spawn.calls.length, 1, command);
    }
  });
});

describe('runCommands: key policy (test 6)', () => {
  test('codegen, deps, tidy.apply, format.apply and fix.apply are never run, even with --include', () => {
    const root = track(fx.makeRepo({}));
    const rows = [
      ['codegen', 'go generate ./...'],
      ['deps', 'go mod download'],
      ['tidy.apply', 'go mod tidy'],
      ['format.apply', 'gofmt -w .'],
      ['fix.apply', 'golangci-lint run --fix'],
    ];
    for (const [key, command] of rows) {
      const spawn = spySpawn();
      const [r] = runCommands([item(command, key)], { root, spawn, include: ['codegen', 'deps', 'tidy', 'fix', 'format', key] });
      assert.equal(spawn.calls.length, 0, key);
      assert.equal(r.run.skipped, 'never-run-key', key);
    }
  });

  test('a command that came from the apply form is never run, whatever its key', () => {
    const root = track(fx.makeRepo({}));
    const spawn = spySpawn();
    const [r] = runCommands([item('gofmt -w .', 'format', { form: 'apply' })], { root, spawn });
    assert.equal(spawn.calls.length, 0);
    assert.equal(r.run.skipped, 'mutating-form');
  });

  test('default keys run; test needs --include; other keys are not runnable at all', () => {
    const root = track(fx.makeRepo({}));
    const spawn = spySpawn();
    const items = [
      item('gofmt -l .', 'format'), item('golangci-lint run', 'lint'), item('go vet ./...', 'typecheck'),
      item('go build ./...', 'build'), item('go test ./...', 'test'), item('golangci-lint run --fix', 'fix'),
      item('govulncheck ./...', 'audit'),
    ];
    const out = runCommands(items, { root, spawn });
    const byKey = Object.fromEntries(out.map((r) => [r.key, r]));
    for (const k of ['format', 'lint', 'typecheck', 'build']) assert.equal(byKey[k].run.exit_code, 0, k);
    assert.equal(byKey.test.run.skipped, 'not-included');
    assert.equal(byKey.audit.run.skipped, 'not-included');
    assert.equal(byKey.fix.run.skipped, 'key-not-runnable');
    assert.equal(spawn.calls.length, 4);
  });

  test('--include test runs test; --include cannot promote a non-opt-in key', () => {
    const root = track(fx.makeRepo({}));
    const spawn = spySpawn();
    const out = runCommands([item('go test ./...', 'test'), item('golangci-lint run --fix', 'fix')], { root, spawn, include: ['test', 'fix'] });
    assert.equal(out[0].run.exit_code, 0);
    assert.equal(out[1].run.skipped, 'key-not-runnable');
    assert.equal(spawn.calls.length, 1);
  });

  test('--keys narrows the selection; everything else is skipped not-selected', () => {
    const root = track(fx.makeRepo({}));
    const spawn = spySpawn();
    const out = runCommands([item('gofmt -l .', 'format'), item('golangci-lint run', 'lint')], { root, spawn, keys: ['lint'] });
    assert.equal(out[0].run.skipped, 'not-selected');
    assert.equal(out[1].run.exit_code, 0);
    assert.equal(spawn.calls.length, 1);
  });

  test('items with no command (discover/none) or already-missing resolution are skipped, never spawned', () => {
    const root = track(fx.makeRepo({}));
    const spawn = spySpawn();
    const out = runCommands([
      { component: null, key: 'lint', command: null, cwd: '', resolve: { status: 'discover' } },
      item('nosuchtool --x', 'build', { resolve: { status: 'binary_missing' } }),
    ], { root, spawn });
    assert.equal(out[0].run.skipped, 'no-command');
    assert.equal(out[1].run.skipped, 'not-resolved');
    assert.equal(spawn.calls.length, 0);
  });
});

describe('runCommands: deny policy on expanded bodies (test 5b)', () => {
  const REFUSED = [
    ['make build', 'body:docker-push'],
    ['task ship', 'body:kubectl-apply'],
    ['just release', 'body:gh-release'],
    ['npm run build', 'body:npm-publish'],
    ['pnpm run lint', 'body:git-push'],
    ['make chain', 'unverifiable-body'],
    ['make needs-dep', 'unverifiable-body'],
    ['make pushes-quoted', 'body:git-push'],
    ['npm run chained', 'unverifiable-body'],
    ['npm run hooked', 'body:npm-publish'],
    ['./scripts/release.sh', 'body:git-push'],
    ['bash scripts/ci.sh', 'body:docker-push'],
    ['sh scripts/ci.sh', 'body:docker-push'],
    ['make deploy-check', 'body:kubectl-apply'],
    ['bin/check', 'body:npm-publish'],
    ['./scripts/missing.sh', 'unverifiable-body'],
    ['./scripts/outer.sh', 'unverifiable-body'],
    ['./scripts/outer-make.sh', 'unverifiable-body'],
    ['./scripts/sourced.sh', 'unverifiable-body'],
    ['./scripts/continued.sh', 'body:docker-push'],
    ['./scripts/binary.dat', 'unverifiable-body'],
    ['make -C nowhere test', 'unverifiable-body'],
    ['make', 'unverifiable-body'],
    ['npm run lint && ./scripts/release.sh', 'body:git-push'],
    ['make lint && ./scripts/ci.sh', 'body:docker-push'],
  ];

  test('every dangerous or unprovable body is refused and never spawned', () => {
    const root = track(fx.bodyRepo());
    for (const [command, reason] of REFUSED) {
      const spawn = spySpawn();
      const [r] = runCommands([item(command)], { root, spawn });
      assert.equal(spawn.calls.length, 0, `${command} must not spawn`);
      assert.equal(r.run.skipped, reason, command);
      assert.equal(r.skipped, reason, command);
      assert.ok(typeof r.run.detail === 'string' && r.run.detail.length > 0, `${command} needs a detail`);
    }
  });

  test('a body refusal names the runner, target and offending line', () => {
    const root = track(fx.bodyRepo());
    const [r] = runCommands([item('make build')], { root, spawn: spySpawn() });
    assert.match(r.run.detail, /make build/);
    assert.match(r.run.detail, /docker push registry\/x:tag/);
  });

  test('clean targets and clean wrapper scripts run', () => {
    const root = track(fx.bodyRepo());
    for (const command of ['make lint', 'make wrapped-ok', './scripts/lint.sh', 'bash scripts/lint.sh', 'task fine', 'just fine', 'npm run check']) {
      const spawn = spySpawn();
      const [r] = runCommands([item(command)], { root, spawn });
      assert.equal(r.run.skipped, undefined, `${command} was refused: ${r.run.skipped} ${r.run.detail}`);
      assert.equal(spawn.calls.length, 1, command);
      assert.equal(r.run.exit_code, 0, command);
    }
  });

  test('an include-expanded Makefile target that is not defined statically is refused unverifiable-body', () => {
    const root = track(fx.verifyRepo());
    const spawn = spySpawn();
    const [r] = runCommands([item('make -C inc nope')], { root, spawn });
    assert.equal(r.run.skipped, 'unverifiable-body');
    assert.equal(spawn.calls.length, 0);
  });

  test('a script cwd follows `cd` in the command and the item cwd', () => {
    const root = track(fx.makeRepo({ 'svc/scripts/lint.sh': '#!/bin/sh\ngolangci-lint run\n', 'svc/scripts/bad.sh': '#!/bin/sh\ngit push\n' }, {
      modes: { 'svc/scripts/lint.sh': 0o755, 'svc/scripts/bad.sh': 0o755 },
    }));
    const spawn = spySpawn();
    assert.equal(runCommands([item('cd svc && ./scripts/lint.sh')], { root, spawn })[0].run.exit_code, 0);
    assert.equal(runCommands([item('./scripts/lint.sh', 'lint', { cwd: 'svc' })], { root, spawn })[0].run.exit_code, 0);
    const bad = runCommands([item('./scripts/bad.sh', 'lint', { cwd: 'svc' })], { root, spawn: spySpawn() })[0];
    assert.equal(bad.run.skipped, 'body:git-push');
  });

  test('a command that starts with a variable expansion cannot be proved safe', () => {
    const root = track(fx.makeRepo({ Makefile: 'build:\n\t$(DOCKER) push registry/x\n\t@echo done\n', 'ok.mk': '' }));
    const spawn = spySpawn();
    const [r] = runCommands([item('make build')], { root, spawn });
    assert.equal(r.run.skipped, 'unverifiable-body');
    assert.equal(spawn.calls.length, 0);
  });

  test('a heredoc body inside a wrapper script is scanned too', () => {
    const root = track(fx.makeRepo({ 'scripts/h.sh': '#!/bin/sh\nkubectl apply -f - <<EOF\nkind: X\nEOF\n' }, { modes: { 'scripts/h.sh': 0o755 } }));
    const spawn = spySpawn();
    const [r] = runCommands([item('./scripts/h.sh')], { root, spawn });
    assert.equal(r.run.skipped, 'body:kubectl-apply');
    assert.equal(spawn.calls.length, 0);
  });

  test('a Taskfile defer: line is scanned even though it is not part of the parsed body', () => {
    const root = track(fx.makeRepo({
      'Taskfile.yml': ["version: '3'", 'tasks:', '  build:', '    cmds:', '      - go build ./...', '      - defer: docker push x', ''].join('\n'),
    }));
    const spawn = spySpawn();
    const [r] = runCommands([item('task build')], { root, spawn });
    assert.match(r.run.skipped, /^body:docker-push$/);
    assert.equal(spawn.calls.length, 0);
  });

  test('a task with deps: is refused unverifiable-body (the dependency is not expanded)', () => {
    const root = track(fx.makeRepo({
      'Taskfile.yml': ["version: '3'", 'tasks:', '  build:', '    deps: [gen]', '    cmds:', '      - go build ./...', '  gen:', '    cmds:', '      - go generate ./...', ''].join('\n'),
    }));
    const spawn = spySpawn();
    const [r] = runCommands([item('task build')], { root, spawn });
    assert.equal(r.run.skipped, 'unverifiable-body');
    assert.equal(spawn.calls.length, 0);
  });

  test('a just recipe with a dependency is refused unverifiable-body', () => {
    const root = track(fx.makeRepo({ justfile: 'build: gen\n    go build ./...\n\ngen:\n    go generate ./...\n' }));
    const spawn = spySpawn();
    const [r] = runCommands([item('just build')], { root, spawn });
    assert.equal(r.run.skipped, 'unverifiable-body');
    assert.equal(spawn.calls.length, 0);
  });

  test('installed tools under node_modules/.bin in a body are plain binaries, not wrapper scripts', () => {
    const root = track(fx.makeRepo({ Makefile: 'lint:\n\t./node_modules/.bin/eslint .\n', 'node_modules/.bin/eslint': '#!/usr/bin/env node\nconsole.log(1)\n' }, {
      modes: { 'node_modules/.bin/eslint': 0o755 },
    }));
    const spawn = spySpawn();
    const [r] = runCommands([item('make lint')], { root, spawn });
    assert.equal(r.run.skipped, undefined);
    assert.equal(spawn.calls.length, 1);
  });
});

describe('runCommands: launcher wrappers do not hide what they run', () => {
  const ROWS = [
    ['timeout 60 ./scripts/release.sh', 'body:git-push'],
    ['nice -n 5 make build', 'body:docker-push'],
    ['timeout 30 bash scripts/ci.sh', 'body:docker-push'],
    ['xargs -n1 ./scripts/release.sh', 'body:git-push'],
    ['doppler run -- ./scripts/deploy.sh', 'body:kubectl-apply'],
    ['timeout 30 make chain', 'unverifiable-body'],
    ['sh -c "./scripts/deploy.sh"', 'body:kubectl-apply'],
    ['bash -c "make chain"', 'unverifiable-body'],
  ];

  test('each wrapped script or target is expanded and refused', () => {
    const root = track(fx.bodyRepo());
    for (const [command, reason] of ROWS) {
      const spawn = spySpawn();
      const [r] = runCommands([item(command)], { root, spawn });
      assert.equal(r.run.skipped, reason, command);
      assert.equal(spawn.calls.length, 0, command);
    }
  });

  test('a wrapped clean script still runs', () => {
    const root = track(fx.bodyRepo());
    const spawn = spySpawn();
    const [r] = runCommands([item('timeout 60 ./scripts/lint.sh')], { root, spawn });
    assert.equal(r.run.skipped, undefined);
    assert.equal(spawn.calls.length, 1);
  });
});

describe('runCommands: executor (test 3, unit level)', () => {
  test('spawns `sh -c <command>` in root/cwd with a timeout in ms and records the result', () => {
    const root = track(fx.makeRepo({ 'svc/.keep': '' }));
    const spawn = spySpawn({ status: 0, stdout: 'line1\nline2\n', stderr: 'warn\n' });
    const [r] = runCommands([item('golangci-lint run', 'lint', { cwd: 'svc', timeout_s: 45 })], { root, spawn });
    assert.equal(spawn.calls.length, 1);
    const call = spawn.calls[0];
    assert.equal(call.cmd, 'sh');
    assert.deepEqual(call.args, ['-c', 'golangci-lint run']);
    assert.equal(call.opts.cwd, path.join(root, 'svc'));
    assert.equal(call.opts.timeout, 45000);
    assert.equal(r.run.exit_code, 0);
    assert.equal(r.run.timed_out, false);
    assert.equal(typeof r.run.duration_ms, 'number');
    assert.match(r.run.tail, /line1/);
    assert.match(r.run.tail, /warn/);
  });

  test('timeoutS from the options overrides the item and the default; the default is 300s', () => {
    const root = track(fx.makeRepo({}));
    const a = spySpawn();
    runCommands([item('go build ./...', 'build', { timeout_s: 45 })], { root, spawn: a, timeoutS: 7 });
    assert.equal(a.calls[0].opts.timeout, 7000);
    const b = spySpawn();
    runCommands([item('go build ./...')], { root, spawn: b });
    assert.equal(b.calls[0].opts.timeout, 300000);
  });

  test('a failing command records its exit code; the batch keeps going', () => {
    const root = track(fx.makeRepo({}));
    const spawn = spySpawn(({ args }) => (/fail/.test(args[1]) ? { status: 3, stdout: '', stderr: 'boom\n' } : { status: 0, stdout: 'fine\n', stderr: '' }));
    const out = runCommands([item('run-fail', 'lint'), item('run-ok', 'build')], { root, spawn });
    assert.equal(out[0].run.exit_code, 3);
    assert.match(out[0].run.tail, /boom/);
    assert.equal(out[1].run.exit_code, 0);
  });

  test('a timeout records { exit_code: null, timed_out: true } and moves on', () => {
    const root = track(fx.makeRepo({}));
    const spawn = spySpawn(({ args }) => (/slow/.test(args[1])
      ? { status: null, signal: 'SIGTERM', error: Object.assign(new Error('spawnSync sh ETIMEDOUT'), { code: 'ETIMEDOUT' }), stdout: 'partial\n', stderr: '' }
      : { status: 0, stdout: '', stderr: '' }));
    const out = runCommands([item('slow-build', 'build'), item('quick', 'lint')], { root, spawn });
    assert.equal(out[0].run.exit_code, null);
    assert.equal(out[0].run.timed_out, true);
    assert.equal(out[1].run.exit_code, 0);
    assert.equal(spawn.calls.length, 2);
  });

  test('only the last 40 lines of output are kept', () => {
    const root = track(fx.makeRepo({}));
    const lines = Array.from({ length: 100 }, (_, i) => `row${i}`).join('\n');
    const [r] = runCommands([item('noisy')], { root, spawn: spySpawn({ status: 0, stdout: lines, stderr: '' }) });
    const tail = r.run.tail.split('\n');
    assert.ok(tail.length <= 40);
    assert.ok(tail.includes('row99'));
    assert.ok(!tail.includes('row10'));
  });

  test('a spawn error (ENOENT) is recorded as a failure, not a throw', () => {
    const root = track(fx.makeRepo({}));
    const spawn = spySpawn({ status: null, error: Object.assign(new Error('spawnSync sh ENOENT'), { code: 'ENOENT' }), stdout: '', stderr: '' });
    const [r] = runCommands([item('x')], { root, spawn });
    assert.equal(r.run.exit_code, null);
    assert.equal(r.run.timed_out, false);
    assert.match(r.run.error, /ENOENT/);
  });

  test('a cwd that escapes the repo is refused', () => {
    const root = track(fx.makeRepo({}));
    const spawn = spySpawn();
    const [r] = runCommands([item('go build ./...', 'build', { cwd: '../elsewhere' })], { root, spawn });
    assert.equal(r.run.skipped, 'cwd-outside-repo');
    assert.equal(spawn.calls.length, 0);
  });

  test('the input items are not mutated', () => {
    const root = track(fx.makeRepo({}));
    const items = [item('go build ./...')];
    runCommands(items, { root, spawn: spySpawn() });
    assert.equal(items[0].run, undefined);
  });

  test('the default spawn is child_process.spawnSync (a real stub binary, no real tool needed)', () => {
    const root = track(fx.makeRepo({}));
    const bin = track(fx.fakeBin(['stubtool'], { failing: ['failtool'] }));
    const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
    const out = runCommands([item('stubtool --go', 'lint'), item('failtool', 'build')], { root, env });
    assert.equal(out[0].run.exit_code, 0);
    assert.equal(out[1].run.exit_code, 3);
  });
});

// ─── Task 3: the `stack verify` CLI (tests 1-4, through the real df-tools) ─────

const { spawnSync } = require('child_process');
const profileFx = require('./__fixtures__/stack-profile-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

/** Every file and directory under `dir` with its mtime and size — a snapshot to prove nothing was written. */
function snapshot(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      const st = fs.statSync(full);
      out.push(`${path.relative(dir, full)}|${st.mtimeMs}|${st.size}`);
      if (e.isDirectory()) walk(full);
    }
  };
  walk(dir);
  out.push(`.|${fs.statSync(dir).mtimeMs}`);
  return out.sort();
}

/**
 * runVerify(repo, args, { bin, home }) — spawns THIS checkout's df-tools with PATH = the stub dir ONLY and
 * HOME = a fake home. `sh` (needed by `--run`) is symlinked into the stub dir, so no real make/go/npm can
 * leak in through a system dir. df-tools itself is started by absolute path, so node needs no PATH entry.
 */
function runVerify(repo, args, { bin, home } = {}) {
  const fakeHome = home || track(fx.fakeHome({}));
  if (!fs.existsSync(path.join(bin, 'sh'))) fs.symlinkSync('/bin/sh', path.join(bin, 'sh'));
  const env = { PATH: bin, HOME: fakeHome };
  const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', repo, 'stack', 'verify', ...args], { encoding: 'utf-8', env, timeout: 60000 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) { /* raw mode */ }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

const gateYaml = (lines) => ['schema: 1', 'extends: general', 'commands:', ...lines].join('\n');

function projectWith(yamlLines, files = {}, extra = {}) {
  return track(profileFx.makeProject({
    stackMd: profileFx.profileMd({ yaml: gateYaml(yamlLines) }),
    files,
    ...extra,
  }));
}

const resultFor = (json, key, component = null) => json.results.find((r) => r.key === key && r.component === component);

describe('CLI: stack verify, static (test 1)', () => {
  test('resolved / binary_missing / script_missing per command; exit 1; nothing written', () => {
    const repo = projectWith([
      '  test: { run: "make test" }',
      '  lint: { run: "golint-x ./..." }',
      '  format: { run: "./scripts/fmt-check.sh" }',
    ], { Makefile: 'test:\n\tgo test ./...\n' });
    const bin = track(fx.fakeBin(['make']));
    const before = snapshot(repo);
    const r = runVerify(repo, [], { bin });
    assert.equal(r.status, 1, r.stderr);
    assert.equal(r.json.profile_source, 'file');
    assert.equal(resultFor(r.json, 'test').resolve.status, 'resolved');
    assert.equal(resultFor(r.json, 'lint').resolve.status, 'binary_missing');
    assert.equal(resultFor(r.json, 'format').resolve.status, 'script_missing');
    assert.equal(resultFor(r.json, 'test').command, 'make test');
    assert.equal(r.json.summary.resolved, 1);
    assert.equal(r.json.summary.missing, 2);
    assert.deepEqual(snapshot(repo), before, 'stack verify must not write anything');
  });

  test('exit 0 when everything resolves; discover and none are reported as-is and are not failures', () => {
    const repo = projectWith([
      '  test: { run: "make test" }',
      '  lint: { run: none }',
      '  build: { run: discover }',
    ], { Makefile: 'test:\n\tgo test ./...\n' });
    const bin = track(fx.fakeBin(['make']));
    const r = runVerify(repo, [], { bin });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(resultFor(r.json, 'lint').resolve.status, 'none');
    assert.equal(resultFor(r.json, 'lint').command, null);
    assert.equal(resultFor(r.json, 'build').resolve.status, 'discover');
    assert.ok(r.json.summary.discover >= 1);
    assert.equal(r.json.summary.missing, 0);
  });

  test('an unverifiable command does not fail the run', () => {
    const repo = projectWith(['  test: { run: "make -C inc nope" }'], { 'inc/Makefile': 'include common.mk\n\nbuild:\n\t@echo build\n' });
    const bin = track(fx.fakeBin(['make']));
    const r = runVerify(repo, [], { bin });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(resultFor(r.json, 'test').resolve.status, 'unverifiable');
    assert.equal(r.json.summary.unverifiable, 1);
  });

  test('--raw prints a compact `key status` table', () => {
    const repo = projectWith(['  test: { run: "make test" }', '  lint: { run: "golint-x ./..." }'], { Makefile: 'test:\n\tgo test ./...\n' });
    const bin = track(fx.fakeBin(['make']));
    const r = runVerify(repo, ['--raw'], { bin });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /^test resolved$/m);
    assert.match(r.stdout, /^lint binary_missing$/m);
  });

  test('a repo with no STACK.md resolves the bundled profile: everything is discover, exit 0', () => {
    const repo = track(profileFx.makeProject({}));
    const r = runVerify(repo, [], { bin: track(fx.fakeBin([])) });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.json.results.length > 0);
    assert.ok(r.json.results.every((x) => x.resolve.status === 'discover'));
  });

  test('bad flags are errors, not silent', () => {
    const repo = projectWith(['  test: { run: "make test" }']);
    const bin = track(fx.fakeBin([]));
    assert.equal(runVerify(repo, ['--bogus'], { bin }).status, 1);
    assert.equal(runVerify(repo, ['--timeout', 'soon'], { bin }).status, 1);
    assert.equal(runVerify(repo, ['positional'], { bin }).status, 1);
  });
});

describe('CLI: stack verify --draft (test 2)', () => {
  test('verifies the stack init preview and never creates .planning/STACK.md', () => {
    const repo = track(fx.makeRepo({
      // A stack with no bundled profile, so the draft extends `general` and keeps the
      // Makefile targets (a go.mod would pull in the bundled go profile since 42-02).
      'Cargo.toml': '[package]\nname = "x"\nversion = "0.1.0"\n',
      Makefile: 'test:\n\tgo test ./...\n\nlint:\n\tgolangci-lint run\n\nbuild:\n\tgo build ./...\n',
    }));
    const bin = track(fx.fakeBin(['make']));
    const before = snapshot(repo);
    const r = runVerify(repo, ['--draft'], { bin });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.profile_source, 'draft');
    for (const key of ['test', 'lint', 'build']) {
      assert.equal(resultFor(r.json, key).resolve.status, 'resolved', key);
      assert.equal(resultFor(r.json, key).command, `make ${key}`);
    }
    assert.equal(fs.existsSync(path.join(repo, '.planning', 'STACK.md')), false);
    assert.deepEqual(snapshot(repo), before);
  });

  test('a draft command whose target is missing is reported missing (exit 1)', () => {
    const repo = track(fx.makeRepo({
      // A stack with no bundled profile, so the draft extends `general` and keeps the
      // Makefile targets (a go.mod would pull in the bundled go profile since 42-02).
      'Cargo.toml': '[package]\nname = "x"\nversion = "0.1.0"\n',
      Makefile: 'test:\n\tgo test ./...\n',
    }));
    const bin = track(fx.fakeBin([]));
    const r = runVerify(repo, ['--draft'], { bin });
    assert.equal(r.status, 1);
    assert.equal(resultFor(r.json, 'test').resolve.status, 'binary_missing');
  });
});

describe('CLI: stack verify --run (test 3)', () => {
  test('format and lint run; test is skipped not-included; --include test runs it', () => {
    const repo = projectWith([
      '  format: { run: "fmt-stub" }',
      '  lint: { run: "lint-stub" }',
      '  test: { run: "test-stub" }',
    ]);
    const bin = track(fx.fakeBin(['fmt-stub', 'lint-stub', 'test-stub']));
    const before = snapshot(repo);
    const r = runVerify(repo, ['--run'], { bin });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(resultFor(r.json, 'format').run.exit_code, 0);
    assert.equal(resultFor(r.json, 'lint').run.exit_code, 0);
    assert.equal(resultFor(r.json, 'test').run.skipped, 'not-included');
    assert.equal(r.json.summary.ran, 2);
    assert.equal(r.json.summary.failed, 0);
    assert.ok(r.json.summary.skipped >= 1);
    assert.deepEqual(snapshot(repo), before);

    const withTest = runVerify(repo, ['--run', '--include', 'test'], { bin });
    assert.equal(withTest.status, 0, withTest.stderr);
    assert.equal(resultFor(withTest.json, 'test').run.exit_code, 0);
    assert.equal(withTest.json.summary.ran, 3);
  });

  test('a failing stub records run.exit_code 3 and the CLI exits 1', () => {
    const repo = projectWith(['  lint: { run: "fail-stub" }', '  format: { run: "fmt-stub" }']);
    const bin = track(fx.fakeBin(['fmt-stub'], { failing: ['fail-stub'] }));
    const r = runVerify(repo, ['--run'], { bin });
    assert.equal(r.status, 1, r.stderr);
    assert.equal(resultFor(r.json, 'lint').run.exit_code, 3);
    assert.equal(resultFor(r.json, 'format').run.exit_code, 0);
    assert.equal(r.json.summary.failed, 1);
  });

  test('a command that is not resolved is not run', () => {
    const repo = projectWith(['  lint: { run: "no-such-tool-xyz" }']);
    const r = runVerify(repo, ['--run'], { bin: track(fx.fakeBin([])) });
    assert.equal(r.status, 1);
    assert.equal(resultFor(r.json, 'lint').run.skipped, 'not-resolved');
    assert.equal(r.json.summary.ran, 0);
  });

  test('--keys narrows what runs; a denied command is refused end to end', () => {
    const repo = projectWith(['  format: { run: "fmt-stub" }', '  lint: { run: "lint-stub" }', '  build: { run: "git push origin main" }']);
    const bin = track(fx.fakeBin(['fmt-stub', 'lint-stub', 'git']));
    const only = runVerify(repo, ['--run', '--keys', 'lint'], { bin });
    assert.equal(resultFor(only.json, 'lint').run.exit_code, 0);
    assert.equal(resultFor(only.json, 'format').run.skipped, 'not-selected');
    const denied = runVerify(repo, ['--run'], { bin });
    assert.equal(resultFor(denied.json, 'build').run.skipped, 'git-push');
    assert.equal(denied.json.summary.ran, 2);
  });

  test('--timeout bounds a slow command and the batch continues', () => {
    const repo = projectWith(['  format: { run: "slow-stub" }', '  lint: { run: "lint-stub" }']);
    const bin = track(fx.fakeBin(['lint-stub']));
    // A shell-builtin busy loop: the restricted PATH has no `sleep`.
    fs.writeFileSync(path.join(bin, 'slow-stub'), '#!/bin/sh\nwhile :; do :; done\n');
    fs.chmodSync(path.join(bin, 'slow-stub'), 0o755);
    const r = runVerify(repo, ['--run', '--timeout', '1'], { bin });
    assert.equal(r.status, 1);
    assert.equal(resultFor(r.json, 'format').run.timed_out, true);
    assert.equal(resultFor(r.json, 'format').run.exit_code, null);
    assert.equal(resultFor(r.json, 'lint').run.exit_code, 0);
  });

  test('--run --draft runs the safe commands of the draft, and still writes no STACK.md', () => {
    const repo = track(fx.makeRepo({
      // A stack with no bundled profile, so the draft extends `general` and keeps the
      // Makefile targets (a go.mod would pull in the bundled go profile since 42-02).
      'Cargo.toml': '[package]\nname = "x"\nversion = "0.1.0"\n',
      Makefile: 'build:\n\tgo build ./...\n',
    }));
    const bin = track(fx.fakeBin(['make', 'go']));
    const r = runVerify(repo, ['--draft', '--run'], { bin });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(resultFor(r.json, 'build').run.exit_code, 0);
    assert.equal(fs.existsSync(path.join(repo, '.planning', 'STACK.md')), false);
  });
});

describe('CLI: stack verify with components (test 4)', () => {
  function componentRepo() {
    const stackMd = profileFx.profileMd({
      yaml: [
        'schema: 1',
        'extends: general',
        'commands:',
        '  lint: { run: "lint-stub" }',
        'components:',
        '  - { path: "svc/", profile: ".planning/stacks/svc.md" }',
      ].join('\n'),
    });
    // Since 42-05 a component command already runs in its component dir, so it names its own
    // Makefile plainly (`make -C svc` from inside svc/ would look for svc/svc/Makefile).
    const svc = profileFx.profileMd({ yaml: ['schema: 1', 'commands:', '  test: { run: "make test" }'].join('\n') });
    return track(profileFx.makeProject({ stackMd, stacks: { svc }, files: { 'svc/Makefile': 'test:\n\tgo test ./...\n' } }));
  }

  test('component results are tagged with the component path and carry the rendered cwd as-is', () => {
    const repo = componentRepo();
    const bin = track(fx.fakeBin(['make', 'lint-stub']));
    const r = runVerify(repo, [], { bin });
    assert.equal(r.status, 0, r.stderr);
    const t = resultFor(r.json, 'test', 'svc/');
    assert.ok(t, 'a result tagged component svc/');
    assert.equal(t.resolve.status, 'resolved');
    assert.equal(t.command, 'make test');
    // cwd is exactly what renderCommand returned for the component view: since 42-05 renderCommand
    // joins the component path, so a command without its own cwd runs in 'svc'. It is NEVER 'svc/svc'
    // (stack-verify must not join a second time).
    assert.equal(t.cwd, 'svc');
    assert.notEqual(t.cwd, 'svc/svc');
    for (const x of r.json.results) assert.notEqual(x.cwd, 'svc/svc');
  });

  test('the root view is still reported, with component null, and inherited commands are not repeated', () => {
    const repo = componentRepo();
    const bin = track(fx.fakeBin(['make', 'lint-stub']));
    const r = runVerify(repo, [], { bin });
    assert.equal(resultFor(r.json, 'lint').resolve.status, 'resolved');
    assert.equal(resultFor(r.json, 'lint', 'svc/'), undefined);
    assert.equal(r.json.results.filter((x) => x.key === 'lint').length, 1);
  });

  test('a component command whose binary is missing fails the run and names the component', () => {
    const repo = componentRepo();
    const bin = track(fx.fakeBin(['lint-stub']));
    const r = runVerify(repo, [], { bin });
    assert.equal(r.status, 1);
    assert.equal(resultFor(r.json, 'test', 'svc/').resolve.status, 'binary_missing');
  });
});

describe('CLI: this repo (the build gate)', () => {
  // The one real-binary test (TRD 42 binding rules): it needs the real `npm` to resolve `npm test`.
  test('stack verify against the checkout runs, reports test via npm, and writes nothing', (t) => {
    const repoRoot = path.join(__dirname, '..', '..', '..', '..', '..');
    if (!fs.existsSync(path.join(repoRoot, '.planning', 'STACK.md'))) return t.skip('no .planning/STACK.md in this checkout');
    if (!resolveBinary('npm')) return t.skip('npm is not installed');
    const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', repoRoot, 'stack', 'verify'], { encoding: 'utf-8', timeout: 60000 });
    assert.equal(r.status, 0, r.stderr);
    const json = JSON.parse(r.stdout);
    assert.equal(resultFor(json, 'test').command, 'npm test');
    assert.equal(resultFor(json, 'test').resolve.status, 'resolved');
    assert.equal(resultFor(json, 'build').resolve.status, 'none');
  });
});
