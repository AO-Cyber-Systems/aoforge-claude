'use strict';

// stack-verify-services.test.cjs — `stack verify --run` never reaches a service silently (TRD 71-03, SDR-10).
//
// In the objective 43 follow-up run, trades' `test` (`npx vitest --run`) ran against whatever was listening on
// 127.0.0.1:5432. The effect guard snapshots only the work tree, so it cannot see database writes. The policy
// now is: a gate with a service signal is skipped `env_required`; `--allow-services` (only with `--run`) runs
// it anyway and the result says so. Signals are STATIC (text, CI, env files): nothing probes a port.
//
// Every command here is a stub `svc-suite` (a `#!/bin/sh` script in a temp dir) whose calls are counted, so
// nothing real ever runs. The whole file is skipped without git on PATH.
//
// CLI (spawned `df-tools stack verify` on a scratch git repo with a CI job that declares `services:`)
//  1. `--run --include test --raw` -> `test resolved skipped=env_required`; the stub is never called.
//  2. JSON: `skipped: 'env_required'`; the detail names the workflow file, the job, the service and the flag.
//  3. `--allow-services`: the stub runs once; `test resolved run=0 services=allowed`; JSON `services_allowed`.
//  4. `--allow-services` without `--run` -> exit 1, stderr names `--run`; nothing is spawned.
//  5. Without `--include test` -> `skipped=not-included` (the key policy decides first).
// In-process `runCommands`
//  6. A service URL in the command: env_required, naming the variable, never the URL or password.
//  7. A runner body (Makefile) that assigns a service DSN variable: env_required, naming `make test`.
//  8. A wrapper script that uses `$TEST_DATABASE_URL`: env_required, naming the script.
//  9. A loopback host:port in a body line: env_required, naming `127.0.0.1:6379`.
// 10. A CI job env name (`DATABASE_URL: ${{ secrets.DB }}`, no services) running the same command: env_required.
// 11. The services job runs a DIFFERENT command: no signal, the gate runs.
// 12. The CI cwd must match: a job default `api` signals an item in `api`, not one at the root.
// 13. `.env.test` naming a service variable: env_required for `test`; a `lint` item with it runs.
// 14. A deny in the body still wins over env_required.
// 15. `allowServices: true` runs case 7, lists the signal, and the effect guard still brackets the run.
// 16. No signal anywhere: it runs, with no `services_allowed` key.
// 17. `RUN_POLICY.services` is frozen and states the policy.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

const fx = require('./__fixtures__/stack-verify-fixtures.cjs');
const profileFx = require('./__fixtures__/stack-profile-fixtures.cjs');
const { runCommands, parseVerifyArgs, RUN_POLICY } = require('./stack-verify.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');
const SKIP = fx.gitAvailable() ? false : 'git is not on PATH';

const dirs = [];
const track = (dir) => { dirs.push(dir); return dir; };
afterEach(() => { while (dirs.length) fx.cleanup(dirs.pop()); });

const item = (key, command, extra = {}) => ({ component: null, key, command, cwd: '', ...extra });
const envWith = (bin) => ({ ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` });
const calls = (bin) => fx.stubCalls(bin, 'svc-suite');
const HINT = '--allow-services';

/** A scratch repo (a git work tree only when `git`), a counting `svc-suite` stub, and the runCommands options. */
function setup({ files = {}, git = false, extra = {} } = {}) {
  const root = track(git ? fx.gitRepo({ files }) : fx.makeRepo(files));
  const bin = track(fx.mutatingToolBin('svc-suite', ':'));
  return { root, bin, opts: { root, spawn: spawnSync, env: envWith(bin), include: ['test'], ...extra } };
}

const MAKE_DSN = 'test:\n\tMIGRATIONS_TEST_DSN="postgres://u:p@localhost:5436/x" svc-suite --all\n';

describe('CLI: stack verify --run skips a service-backed gate (cases 1-5)', { skip: SKIP }, () => {
  const STACK = profileFx.profileMd({
    yaml: ['schema: 1', 'extends: general', 'commands:', '  test: { run: "svc-suite --all" }'].join('\n'),
  });

  /** A git repo whose CI job `suite` declares a postgres service and runs the same command STACK.md names. */
  function verify(extra) {
    const root = track(fx.gitRepo({ files: {
      '.planning/STACK.md': STACK,
      '.github/workflows/ci.yml': fx.serviceWorkflow({ job: 'suite', services: ['postgres'], runs: ['svc-suite --all'] }),
    } }));
    const bin = track(fx.mutatingToolBin('svc-suite', ':'));
    const home = track(fx.fakeHome({}));
    const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', root, 'stack', 'verify', ...extra], {
      encoding: 'utf-8',
      env: { ...envWith(bin), HOME: home },
      timeout: 60000,
    });
    return { r, bin };
  }
  const testResult = (r) => JSON.parse(r.stdout).results.find((x) => x.key === 'test');

  test('1. --run --include test --raw: `test resolved skipped=env_required`, and the stub is never called', () => {
    const { r, bin } = verify(['--run', '--include', 'test', '--raw']);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.ok(r.stdout.split('\n').includes('test resolved skipped=env_required'), r.stdout);
    assert.deepEqual(calls(bin), []);
  });

  test('2. the JSON names the workflow file, the job, the service and the opt-in flag', () => {
    const { r } = verify(['--run', '--include', 'test']);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const t = testResult(r);
    assert.equal(t.skipped, 'env_required');
    for (const needle of ['.github/workflows/ci.yml', 'suite', 'postgres', HINT]) {
      assert.ok(t.run.detail.includes(needle), `${needle} not in: ${t.run.detail}`);
    }
  });

  test('3. --allow-services runs it once and marks it: `run=0 services=allowed`, `run.services_allowed` lists the CI signal', () => {
    const raw = verify(['--run', '--include', 'test', '--allow-services', '--raw']);
    assert.equal(raw.r.status, 0, raw.r.stderr || raw.r.stdout);
    assert.ok(raw.r.stdout.split('\n').includes('test resolved run=0 services=allowed'), raw.r.stdout);
    assert.deepEqual(calls(raw.bin), ['--all']);

    const json = verify(['--run', '--include', 'test', '--allow-services']);
    const allowed = testResult(json.r).run.services_allowed;
    assert.ok(Array.isArray(allowed) && allowed.length > 0, JSON.stringify(allowed));
    assert.ok(allowed.some((s) => s.includes('.github/workflows/ci.yml')), JSON.stringify(allowed));
  });

  test('4. --allow-services without --run is a usage error naming --run, and nothing is spawned', () => {
    const { r, bin } = verify(['--allow-services']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--allow-services needs --run/);
    assert.deepEqual(calls(bin), []);
  });

  test('5. without --include test the key policy decides first: not-included, never env_required', () => {
    const { r, bin } = verify(['--run', '--raw']);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.ok(r.stdout.split('\n').includes('test resolved skipped=not-included'), r.stdout);
    assert.deepEqual(calls(bin), []);
  });
});

describe('parseVerifyArgs: --allow-services', () => {
  test('4b. the flag parses with --run and is a usage error without it', () => {
    assert.equal(parseVerifyArgs(['--run', '--allow-services']).allowServices, true);
    assert.equal(parseVerifyArgs(['--run']).allowServices, false);
    assert.throws(() => parseVerifyArgs(['--allow-services']), /--allow-services needs --run/);
    assert.throws(() => parseVerifyArgs(['--nope']), /--allow-services/);
  });
});

describe('runCommands: the three signal layers (cases 6-14)', { skip: SKIP }, () => {
  test('6. a service URL in the command: env_required, naming the variable and never the URL or the password', () => {
    const { bin, opts } = setup();
    const [out] = runCommands([item('test', 'DATABASE_URL=postgresql://app:s3cret@db.invalid:5432/app svc-suite --all')], opts);
    assert.equal(out.skipped, 'env_required');
    assert.match(out.run.detail, /DATABASE_URL/);
    assert.ok(out.run.detail.includes(HINT), out.run.detail);
    assert.doesNotMatch(out.run.detail, /s3cret/);
    assert.doesNotMatch(out.run.detail, /postgresql:\/\/app/);
    assert.deepEqual(calls(bin), []);
  });

  test('6b. a bare scheme names the scheme only; a bracketed loopback names host:port; neither echoes the URL', () => {
    const { bin, opts } = setup();
    const out = runCommands([
      item('test', 'svc-suite --url redis://:hunter2@cache.invalid/0'),
      item('test', 'svc-suite --addr [::1]:6379'),
    ], opts);
    assert.equal(out[0].skipped, 'env_required');
    assert.match(out[0].run.detail, /a redis:\/\/ URL/);
    assert.doesNotMatch(out[0].run.detail, /hunter2/);
    assert.equal(out[1].skipped, 'env_required');
    assert.match(out[1].run.detail, /\[::1\]:6379/);
    assert.deepEqual(calls(bin), []);
  });

  test('7. a runner body that assigns a service DSN variable: env_required, naming `make test` and the variable', () => {
    const { bin, opts } = setup({ files: { Makefile: MAKE_DSN } });
    const [out] = runCommands([item('test', 'make test')], opts);
    assert.equal(out.skipped, 'env_required');
    assert.match(out.run.detail, /make test/);
    assert.match(out.run.detail, /MIGRATIONS_TEST_DSN/);
    assert.doesNotMatch(out.run.detail, /postgres:\/\/u:p/);
    assert.deepEqual(calls(bin), []);
  });

  test('8. a wrapper script that uses $TEST_DATABASE_URL: env_required, naming the script and the variable', () => {
    const { bin, opts } = setup({ files: { 'scripts/it.sh': '#!/bin/sh\nsvc-suite --it "$TEST_DATABASE_URL"\n' } });
    const [out] = runCommands([item('test', 'bash scripts/it.sh')], opts);
    assert.equal(out.skipped, 'env_required');
    assert.match(out.run.detail, /scripts\/it\.sh/);
    assert.match(out.run.detail, /TEST_DATABASE_URL/);
    assert.deepEqual(calls(bin), []);
  });

  test('9. a loopback host:port in a body line: env_required, naming 127.0.0.1:6379', () => {
    const { bin, opts } = setup({ files: { Makefile: 'test:\n\tsvc-suite --redis 127.0.0.1:6379\n' } });
    const [out] = runCommands([item('test', 'make test')], opts);
    assert.equal(out.skipped, 'env_required');
    assert.match(out.run.detail, /127\.0\.0\.1:6379/);
    assert.deepEqual(calls(bin), []);
  });

  test('10. a CI job env name with no services, running the same command: env_required, naming the variable', () => {
    const { bin, opts } = setup({ files: {
      '.github/workflows/ci.yml': fx.serviceWorkflow({ env: { DATABASE_URL: '${{ secrets.DB }}' }, runs: ['svc-suite --all'] }),
    } });
    const [out] = runCommands([item('test', 'svc-suite --all')], opts);
    assert.equal(out.skipped, 'env_required');
    assert.match(out.run.detail, /DATABASE_URL/);
    assert.match(out.run.detail, /ci\.yml/);
    assert.deepEqual(calls(bin), []);
  });

  test('11. CI negative: the services job runs a DIFFERENT command, so the gate runs', () => {
    const { bin, opts } = setup({ files: {
      '.github/workflows/ci.yml': fx.serviceWorkflow({ services: ['postgres'], runs: ['svc-suite --unit'] }),
    } });
    const [out] = runCommands([item('test', 'svc-suite --all')], opts);
    assert.equal(out.skipped, undefined);
    assert.equal(out.run.exit_code, 0);
    assert.equal('services_allowed' in out.run, false);
    assert.deepEqual(calls(bin), ['--all']);
  });

  test('12. CI cwd: a job default of `api` signals an item in `api`, not one at the root', () => {
    const { bin, opts } = setup({ files: {
      'api/.keep': '',
      '.github/workflows/ci.yml': fx.serviceWorkflow({ services: ['postgres'], defaultsCwd: 'api', runs: ['svc-suite --all'] }),
    } });
    const [atRoot, inApi] = runCommands([
      item('test', 'svc-suite --all'),
      item('test', 'svc-suite --all', { cwd: 'api' }),
    ], opts);
    assert.equal(atRoot.skipped, undefined);
    assert.equal(atRoot.run.exit_code, 0);
    assert.equal(inApi.skipped, 'env_required');
    assert.deepEqual(calls(bin), ['--all']);
  });

  test('13. .env.test naming a service variable: env_required for test, never echoing the value; a lint item runs', () => {
    const { bin, opts } = setup({ files: {
      '.env.test': '# test env\nDATABASE_URL=postgres://app:s3cret@db.invalid:5432/app\nLOG_LEVEL=debug\n',
    } });
    const [t, l] = runCommands([item('test', 'svc-suite --all'), item('lint', 'svc-suite --all')], opts);
    assert.equal(t.skipped, 'env_required');
    assert.ok(t.run.detail.includes('.env.test sets DATABASE_URL'), t.run.detail);
    assert.doesNotMatch(t.run.detail, /s3cret/);
    assert.equal(l.skipped, undefined);
    assert.equal(l.run.exit_code, 0);
    assert.deepEqual(calls(bin), ['--all']);
  });

  test('14. precedence: a deny in the body still wins over env_required', () => {
    const { bin, opts } = setup({ files: { Makefile: 'test:\n\tgit push origin main\n\tDATABASE_URL=x svc-suite --all\n' } });
    const [out] = runCommands([item('test', 'make test')], opts);
    assert.equal(out.skipped, 'body:git-push');
    assert.deepEqual(calls(bin), []);
  });
});

describe('runCommands: --allow-services and the policy (cases 15-17)', { skip: SKIP }, () => {
  test('15. allowServices runs case 7 and lists the signal, and the effect guard still brackets the run', () => {
    const { bin, opts } = setup({ files: { Makefile: MAKE_DSN }, git: true, extra: { allowServices: true } });
    const [out] = runCommands([item('test', 'make test')], opts);
    assert.equal(out.skipped, undefined);
    assert.equal(out.run.exit_code, 0, JSON.stringify(out.run));
    assert.ok(Array.isArray(out.run.services_allowed), JSON.stringify(out.run));
    assert.ok(out.run.services_allowed.some((s) => s.includes('MIGRATIONS_TEST_DSN')), JSON.stringify(out.run.services_allowed));
    assert.equal('mutated' in out.run, false);
    assert.deepEqual(calls(bin), ['--all']);
  });

  test('16. no signal anywhere: it runs, with no services_allowed key', () => {
    const { bin, opts } = setup({ extra: { allowServices: true } });
    const [out] = runCommands([item('test', 'svc-suite --all')], opts);
    assert.equal(out.skipped, undefined);
    assert.equal(out.run.exit_code, 0);
    assert.equal('services_allowed' in out.run, false);
    assert.deepEqual(calls(bin), ['--all']);
  });

  test('17. RUN_POLICY.services is frozen and states the policy', () => {
    const s = RUN_POLICY.services;
    assert.ok(Object.isFrozen(s));
    assert.equal(s.reason, 'env_required');
    assert.equal(s.optIn, '--allow-services');
    assert.deepEqual([...s.envFileKeys], ['test', 'e2e']);
    assert.deepEqual([...s.envFiles], ['.env.test', '.env.test.local', '.env.testing']);
    assert.ok(Object.isFrozen(s.schemes) && s.schemes.includes('postgres'));
    assert.ok(s.envName.test('TEST_DATABASE_URL') && s.envName.test('MIGRATIONS_TEST_DSN') && !s.envName.test('LOG_LEVEL'));
  });
});
