'use strict';

// Tests for doctor checks 21-pending-migrations and 22-validate-health (TRD 45-06, tests 10-14).
//
// no_llm_test_data: every project is a hand-built fixture under the OS temp dir. `userHome` is a
// fake home, so upgrade backups land under <fake home>/.claude/devflow/backups, and the spawned
// `df-tools validate health` runs with HOME=<fake home>. Every test git call uses gitEnv(home).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const pending = require('./21-pending-migrations.cjs');
const health = require('./22-validate-health.cjs');
const legacy = require('./20-legacy-runtime-state.cjs');
const doctor = require('../doctor.cjs');
const upgrade = require('../upgrade.cjs');
const helpers = require('../helpers.cjs');
const { makeDoctorProject, makeDoctorHome } = require('../__fixtures__/doctor-fixtures.cjs');
const {
  gitEnv, makeTrackedRuntimeStateProject, snapshot, diffSnapshots,
} = require('../__fixtures__/upgrade-fixtures.cjs');

const NOW = new Date('2026-09-30T12:00:00.000Z');
const KIND_COMMAND = 'node ~/.claude/devflow/bin/df-tools.cjs upgrade --apply --only 0006 --confirm --kind <kind>';

function git(root, home, ...args) {
  return execFileSync('git', ['-C', root, ...args], {
    env: gitEnv(home),
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function lines(text) {
  return text.split('\n').filter(Boolean);
}

function staged(root, home) {
  return lines(git(root, home, 'diff', '--cached', '--name-only'));
}

function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

function ctxFor(root, home) {
  return doctor.buildContext({ projectRoot: root, userHome: home, env: gitEnv(home), now: NOW });
}

function backupsDir(home) {
  return path.join(home, '.claude', 'devflow', 'backups');
}

function pluginVersionFor(home) {
  return helpers.pluginVersion({ homeDir: home });
}

function commitAll(root, home, message) {
  git(root, home, 'add', '-A');
  git(root, home, 'commit', '-q', '-m', message);
}

/** A stamped git project behind the engine with 0003 (seed state.json) applicable. */
function behindWithAutoMigration() {
  const home = makeDoctorHome();
  const { root } = makeDoctorProject({ home, version: '2.0.0' });
  git(root, home, 'rm', '-q', '--', '.planning/state.json');
  git(root, home, 'commit', '-q', '-m', 'drop state.json');
  return { root, home };
}

function aodexBehind(home) {
  const { root } = makeTrackedRuntimeStateProject({
    home,
    tracked: ['.planning/.progress-guard.json', 'flutter/.planning/.progress-guard.json'],
    untrackedPresent: ['.planning/.awareness-cache.json'],
    version: '2.0.0',
  });
  // A hook rewrote the tracked copy: modified in the working tree, which is routine and not user work.
  fs.appendFileSync(path.join(root, '.planning', '.progress-guard.json'), '\n', 'utf-8');
  return root;
}

// ─── pending-migrations ──────────────────────────────────────────────────────

describe('pending-migrations: contract', () => {
  test('is a project check with a fix', () => {
    assert.equal(pending.id, 'pending-migrations');
    assert.equal(pending.scope, 'project');
    assert.deepEqual(doctor.contractIssues(pending), []);
    assert.equal(typeof pending.fix, 'function');
  });

  test('an up-to-date project → ok', () => {
    const home = makeDoctorHome();
    const { root } = makeDoctorProject({ home, version: pluginVersionFor(home) });
    const r = pending.run(ctxFor(root, home));
    assert.equal(r.severity, 'ok', r.finding);
    assert.equal(r.fixable, false);
  });
});

describe('pending-migrations: auto migrations (test 10)', () => {
  test('10. stamped 2.0.0 with an applicable auto migration → warn fixable; fix applies; re-run ok', () => {
    const { root, home } = behindWithAutoMigration();
    const ctx = ctxFor(root, home);
    const pre = upgrade.check({ projectRoot: root, userHome: home, pluginVersion: ctx.pluginVersion });
    assert.ok(pre.pending.some((p) => p.id === '0003'), JSON.stringify(pre.pending));

    const r = pending.run(ctx);
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, true, r.finding);
    assert.match(r.finding, /0003/);

    const res = pending.fix(ctx, r);
    assert.equal(res.applied, true, JSON.stringify(res));
    assert.ok(res.changed.includes('.planning/state.json'), JSON.stringify(res.changed));
    assert.ok(res.changed.includes('.planning/config.json'), JSON.stringify(res.changed));
    assert.ok(res.backup.startsWith(backupsDir(home) + path.sep), res.backup);

    const again = pending.run(ctxFor(root, home));
    assert.equal(again.severity, 'ok', again.finding);
    assert.equal(again.details.up_to_date, true);
  });

  test('a failed migration check (unparseable config.json) → error, not fixable', () => {
    const home = makeDoctorHome();
    const { root } = makeDoctorProject({ home, git: false, version: '2.0.0' });
    write(root, '.planning/config.json', '{ not json\n');
    const r = pending.run(ctxFor(root, home));
    assert.equal(r.severity, 'error');
    assert.equal(r.fixable, false);
  });
});

describe('pending-migrations: confirm migrations (test 11)', () => {
  test('11. pending_confirm 0006 (no kind) → warn, not fixable, with the exact --kind command', () => {
    const home = makeDoctorHome();
    const { root } = makeDoctorProject({ home, version: pluginVersionFor(home) });
    const projectMd = path.join(root, '.planning', 'PROJECT.md');
    fs.writeFileSync(projectMd, fs.readFileSync(projectMd, 'utf-8').replace('kind: app\n', ''), 'utf-8');
    commitAll(root, home, 'drop kind');

    const r = pending.run(ctxFor(root, home));
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, false);
    assert.equal(r.fix_command, KIND_COMMAND);
    assert.match(r.finding, /0006/);
  });
});

describe('pending-migrations: worktree guard (test 12)', () => {
  test('12. .planning/ROADMAP.md modified → not fixable, reason in the finding, nothing written', () => {
    const { root, home } = behindWithAutoMigration();
    fs.appendFileSync(path.join(root, '.planning', 'ROADMAP.md'), '\nUser edit in progress.\n', 'utf-8');
    const before = snapshot(root);
    const ctx = ctxFor(root, home);

    const r = pending.run(ctx);
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, false);
    assert.match(r.finding, /uncommitted changes/);
    assert.match(r.finding, /\.planning\/ROADMAP\.md/);
    assert.match(r.fix_command, /upgrade --apply/);

    const res = pending.fix(ctx, r);
    assert.equal(res.applied, false);
    assert.match(res.refused, /uncommitted changes/);
    assert.deepEqual(diffSnapshots(before, snapshot(root)), []);
    assert.equal(fs.existsSync(backupsDir(home)), false);
  });

  test('the fix re-checks the guard: a change made after run() refuses it', () => {
    const { root, home } = behindWithAutoMigration();
    const ctx = ctxFor(root, home);
    const r = pending.run(ctx);
    assert.equal(r.fixable, true);
    fs.appendFileSync(path.join(root, 'CLAUDE.md'), '\nUser edit.\n', 'utf-8');
    const res = pending.fix(ctx, r);
    assert.equal(res.applied, false);
    assert.match(res.refused, /CLAUDE\.md/);
  });

  test('a modified tracked runtime-state file is not user work and does not block', () => {
    const home = makeDoctorHome();
    const root = aodexBehind(home);
    const r = pending.run(ctxFor(root, home));
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, true, r.finding);
    assert.match(r.finding, /0008/);
  });

  test('0008 pending with an unrelated staged file → not fixable (same DOC-06 guard as the legacy check)', () => {
    const home = makeDoctorHome();
    const root = aodexBehind(home);
    write(root, 'src/app.txt', 'unrelated user work\n');
    git(root, home, 'add', '--', 'src/app.txt');

    const r = pending.run(ctxFor(root, home));
    assert.equal(r.fixable, false);
    assert.match(r.finding, /staged changes present: src\/app\.txt/);

    const report = doctor.runDoctor({
      projectRoot: root, userHome: home, env: gitEnv(home), now: NOW, fix: true, checks: [legacy, pending],
    });
    assert.deepEqual(report.fixes, []);
    assert.deepEqual(staged(root, home), ['src/app.txt']);
    const tracked = lines(git(root, home, 'ls-files'));
    assert.ok(tracked.includes('.planning/.progress-guard.json'));
    assert.ok(tracked.includes('flutter/.planning/.progress-guard.json'));
  });

  test('one --fix run converges: the legacy fix\'s own changes do not block pending-migrations', () => {
    const home = makeDoctorHome();
    const root = aodexBehind(home);
    const opts = { projectRoot: root, userHome: home, env: gitEnv(home), now: NOW, checks: [legacy, pending] };

    const first = doctor.runDoctor(opts);
    assert.deepEqual(first.checks.map((c) => [c.id, c.fixable]),
      [['legacy-runtime-state', true], ['pending-migrations', true]]);

    const fixed = doctor.runDoctor({ ...opts, fix: true });
    assert.deepEqual(fixed.fixes.map((f) => [f.id, f.applied, f.refused]),
      [['legacy-runtime-state', true, undefined], ['pending-migrations', true, undefined]]);
    assert.deepEqual(fixed.checks.map((c) => [c.id, c.severity]),
      [['legacy-runtime-state', 'ok'], ['pending-migrations', 'ok']]);
    assert.deepEqual(staged(root, home), ['.planning/.progress-guard.json', 'flutter/.planning/.progress-guard.json']);
    const config = JSON.parse(fs.readFileSync(path.join(root, '.planning', 'config.json'), 'utf-8'));
    assert.equal(config.devflow.version, pluginVersionFor(home));
  });
});

// ─── validate-health ─────────────────────────────────────────────────────────

function healthJson(overrides = {}) {
  return JSON.stringify({
    engine_version: '2.11.0',
    schema_version: 1,
    status: 'healthy',
    errors: [],
    warnings: [],
    info: [],
    repairable_count: 0,
    ...overrides,
  });
}

describe('validate-health: contract', () => {
  test('is a project check with a fix, deferring codes owned by other checks', () => {
    assert.equal(health.id, 'validate-health');
    assert.equal(health.scope, 'project');
    assert.deepEqual(doctor.contractIssues(health), []);
    // W057-W061 belong to 25-gh-store-sync (TRD 50-07), so the validate-health check defers them.
    assert.deepEqual(health.DEFERRED, ['E020', 'I022', 'W040', 'W057', 'W058', 'W059', 'W060', 'W061']);
  });
});

describe('validate-health: real spawn (test 13)', () => {
  test('13. a health warning (W001: PROJECT.md missing ## Requirements) → warn with the codes in details', () => {
    const home = makeDoctorHome();
    const { root } = makeDoctorProject({ home, git: false, version: pluginVersionFor(home) });
    const r = health.run(ctxFor(root, home));
    assert.equal(r.severity, 'warn', r.finding);
    assert.ok(r.details.codes.includes('W001'), JSON.stringify(r.details));
    assert.match(r.finding, /W001/);
    assert.equal(r.fixable, false, 'W001 is not repairable');
    assert.deepEqual(r.details.deferred, []);
  });

  test('13. only W040 (project behind) → ok, deferred:[W040]', () => {
    const home = makeDoctorHome();
    const { root } = makeDoctorProject({ home, git: false, version: '2.0.0' });
    fs.appendFileSync(path.join(root, '.planning', 'PROJECT.md'), '\n## Requirements\n\n- one\n', 'utf-8');
    const r = health.run(ctxFor(root, home));
    assert.equal(r.severity, 'ok', r.finding);
    assert.deepEqual(r.details.deferred, ['W040']);
    assert.deepEqual(r.details.codes, []);
  });

  test('a repairable error (E004: STATE.md missing) → error, fixable; the fix repairs it', () => {
    const home = makeDoctorHome();
    const { root } = makeDoctorProject({ home, git: false, version: pluginVersionFor(home) });
    fs.unlinkSync(path.join(root, '.planning', 'STATE.md'));
    const ctx = ctxFor(root, home);

    const r = health.run(ctx);
    assert.equal(r.severity, 'error', r.finding);
    assert.ok(r.details.codes.includes('E004'));
    assert.equal(r.fixable, true);

    const res = health.fix(ctx, r);
    assert.equal(res.applied, true, JSON.stringify(res));
    assert.ok(res.changed.includes('.planning/STATE.md'), JSON.stringify(res.changed));
    assert.equal(fs.existsSync(path.join(root, '.planning', 'STATE.md')), true);
    assert.ok(!health.run(ctxFor(root, home)).details.codes.includes('E004'));
  });

  test('repairable but .planning/ has uncommitted changes → not fixable, with the --repair command', () => {
    const home = makeDoctorHome();
    const { root } = makeDoctorProject({ home, version: pluginVersionFor(home) });
    fs.unlinkSync(path.join(root, '.planning', 'STATE.md'));
    const r = health.run(ctxFor(root, home));
    assert.equal(r.severity, 'error');
    assert.equal(r.fixable, false);
    assert.match(r.fix_command, /validate health --repair/);
  });
});

describe('validate-health: spawn contract (test 14)', () => {
  test('14. spawns node <dfToolsPath> --cwd <root> validate health with HOME=ctx.userHome', () => {
    const home = makeDoctorHome();
    const { root } = makeDoctorProject({ home, git: false });
    const ctx = ctxFor(root, home);
    const calls = [];
    ctx.exec = (cmd, args, opts) => {
      calls.push({ cmd, args, opts });
      return { status: 0, stdout: healthJson(), stderr: '' };
    };

    const r = health.run(ctx);
    assert.equal(r.severity, 'ok');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].cmd, process.execPath);
    assert.deepEqual(calls[0].args, [ctx.dfToolsPath, '--cwd', ctx.projectRoot, 'validate', 'health']);
    assert.equal(calls[0].opts.env.HOME, home);
  });

  test('the @file: large-output prefix is followed', () => {
    const home = makeDoctorHome();
    const { root } = makeDoctorProject({ home, git: false });
    const ctx = ctxFor(root, home);
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'df-health-out-')), 'health.json');
    fs.writeFileSync(out, healthJson({
      status: 'degraded',
      warnings: [{ code: 'W007', message: 'Objective 03 exists on disk but not in ROADMAP.md', fix: 'x', repairable: false }],
    }), 'utf-8');
    ctx.exec = () => ({ status: 0, stdout: `@file:${out}`, stderr: '' });

    const r = health.run(ctx);
    assert.equal(r.severity, 'warn');
    assert.deepEqual(r.details.codes, ['W007']);
  });

  test('deferred codes never set severity: E020 + I022 + W040 only → ok', () => {
    const home = makeDoctorHome();
    const { root } = makeDoctorProject({ home, git: false });
    const ctx = ctxFor(root, home);
    ctx.exec = () => ({
      status: 0,
      stdout: healthJson({
        status: 'broken',
        errors: [{ code: 'E020', message: 'mirror-stale', fix: 'x', repairable: false }],
        warnings: [{ code: 'W040', message: 'project-behind', fix: 'x', repairable: false }],
        info: [{ code: 'I022', message: 'mirror-ahead', fix: '', repairable: false }],
      }),
      stderr: '',
    });
    const r = health.run(ctx);
    assert.equal(r.severity, 'ok');
    assert.deepEqual(r.details.deferred, ['E020', 'I022', 'W040']);
  });

  test('a failing or unparseable spawn → error result, not a throw', () => {
    const home = makeDoctorHome();
    const { root } = makeDoctorProject({ home, git: false });
    const ctx = ctxFor(root, home);
    ctx.exec = () => ({ status: 1, stdout: 'not json', stderr: 'boom' });
    const r = health.run(ctx);
    assert.equal(r.severity, 'error');
    assert.match(r.finding, /validate health/);
    assert.equal(r.fixable, false);
  });
});
