'use strict';

// Tests for doctor checks 21-pending-migrations and 22-validate-health (TRD 45-06, tests 10-14).
// TRD 52-01 test 9: the fix's commit follow-up in store mode (the commit-steps builder) vs local mode.
//
// no_llm_test_data: every project is a hand-built fixture under the OS temp dir. `userHome` is a
// fake home, so upgrade backups land under <fake home>/.claude/aoforge/backups, and the spawned
// `aof-tools validate health` runs with HOME=<fake home>. Every test git call uses gitEnv(home).

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
const steps = require('../commit-steps.cjs');
const { makeDoctorProject, makeDoctorHome } = require('../__fixtures__/doctor-fixtures.cjs');
const {
  gitEnv, makeTrackedRuntimeStateProject, snapshot, diffSnapshots,
} = require('../__fixtures__/upgrade-fixtures.cjs');

const NOW = new Date('2026-09-30T12:00:00.000Z');
const KIND_COMMAND = 'node ~/.claude/aoforge/bin/aof-tools.cjs upgrade --apply --only 0006 --confirm --kind <kind>';

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
  return path.join(home, '.claude', 'aoforge', 'backups');
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
  git(root, home, 'rm', '-q', '--', '.aoforge/state.json');
  git(root, home, 'commit', '-q', '-m', 'drop state.json');
  return { root, home };
}

function aodexBehind(home) {
  const { root } = makeTrackedRuntimeStateProject({
    home,
    tracked: ['.aoforge/.progress-guard.json', 'flutter/.aoforge/.progress-guard.json'],
    untrackedPresent: ['.aoforge/.awareness-cache.json'],
    version: '2.0.0',
  });
  // A hook rewrote the tracked copy: modified in the working tree, which is routine and not user work.
  fs.appendFileSync(path.join(root, '.aoforge', '.progress-guard.json'), '\n', 'utf-8');
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
    assert.ok(res.changed.includes('.aoforge/state.json'), JSON.stringify(res.changed));
    assert.ok(res.changed.includes('.aoforge/config.json'), JSON.stringify(res.changed));
    assert.ok(res.backup.startsWith(backupsDir(home) + path.sep), res.backup);

    const again = pending.run(ctxFor(root, home));
    assert.equal(again.severity, 'ok', again.finding);
    assert.equal(again.details.up_to_date, true);
  });

  test('a failed migration check (unparseable config.json) → error, not fixable', () => {
    const home = makeDoctorHome();
    const { root } = makeDoctorProject({ home, git: false, version: '2.0.0' });
    write(root, '.aoforge/config.json', '{ not json\n');
    const r = pending.run(ctxFor(root, home));
    assert.equal(r.severity, 'error');
    assert.equal(r.fixable, false);
  });
});

describe('pending-migrations: confirm migrations (test 11)', () => {
  test('11. pending_confirm 0006 (no kind) → warn, not fixable, with the exact --kind command', () => {
    const home = makeDoctorHome();
    const { root } = makeDoctorProject({ home, version: pluginVersionFor(home) });
    const projectMd = path.join(root, '.aoforge', 'PROJECT.md');
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
  test('12. .aoforge/ROADMAP.md modified → not fixable, reason in the finding, nothing written', () => {
    const { root, home } = behindWithAutoMigration();
    fs.appendFileSync(path.join(root, '.aoforge', 'ROADMAP.md'), '\nUser edit in progress.\n', 'utf-8');
    const before = snapshot(root);
    const ctx = ctxFor(root, home);

    const r = pending.run(ctx);
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, false);
    assert.match(r.finding, /uncommitted changes/);
    assert.match(r.finding, /\.aoforge\/ROADMAP\.md/);
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
    assert.ok(tracked.includes('.aoforge/.progress-guard.json'));
    assert.ok(tracked.includes('flutter/.aoforge/.progress-guard.json'));
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
    assert.deepEqual(staged(root, home), ['.aoforge/.progress-guard.json', 'flutter/.aoforge/.progress-guard.json']);
    const config = JSON.parse(fs.readFileSync(path.join(root, '.aoforge', 'config.json'), 'utf-8'));
    assert.equal(config.aoforge.version, pluginVersionFor(home));
  });
});

describe('pending-migrations: the commit follow-up by planning mode (TRD 52-01 test 9)', () => {
  const upgradeMessage = (version) => `chore: upgrade AOForge project to v${version}`;
  const localNote = (version, files) =>
    `commit with: node ~/.claude/aoforge/bin/aof-tools.cjs commit "${upgradeMessage(version)}" --files ${files.join(' ')}`;
  const storeNote = (version, files) => steps.branchCommitSteps({
    branch: 'aoforge-upgrade', reason: 'AOForge upgrade', command: steps.commitCommand(upgradeMessage(version), files),
  });

  /** GitHub store mode on in config.json (no repo, so nothing reaches GitHub), committed so the worktree guard passes. */
  function storeOn(root, home) {
    const file = path.join(root, '.aoforge', 'config.json');
    const cfg = JSON.parse(fs.readFileSync(file, 'utf-8'));
    cfg.github = { ...(cfg.github || {}), enabled: true, store: true };
    fs.writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`, 'utf-8');
    commitAll(root, home, 'store mode on');
  }

  test('9a. local mode → the commit with: note is byte-identical to before 52-01, appended last', () => {
    const { root, home } = behindWithAutoMigration();
    const ctx = ctxFor(root, home);
    const res = pending.fix(ctx, pending.run(ctx));
    assert.equal(res.applied, true, JSON.stringify(res));
    assert.ok(res.changed.length > 0, JSON.stringify(res.changed));
    assert.ok(res.notes.endsWith(`; ${localNote(ctx.pluginVersion, res.changed)}`), res.notes);
    assert.doesNotMatch(res.notes, /AOFORGE_SKIP_GH_GATE|git switch -c|gh pr start/);
  });

  test('9b. store mode → the builder\'s store form for branch aoforge-upgrade, appended last; no bare commit with:', () => {
    const { root, home } = behindWithAutoMigration();
    storeOn(root, home);
    const ctx = ctxFor(root, home);
    const r = pending.run(ctx);
    assert.equal(r.fixable, true, r.finding);
    const res = pending.fix(ctx, r);
    assert.equal(res.applied, true, JSON.stringify(res));
    assert.ok(res.changed.length > 0, JSON.stringify(res.changed));
    assert.ok(res.notes.endsWith(`; ${storeNote(ctx.pluginVersion, res.changed)}`), res.notes);
    assert.doesNotMatch(res.notes, /commit with: /, 'the bare command store mode refuses is gone');
    assert.match(res.notes, /AOFORGE_SKIP_GH_GATE=1 AOFORGE_SKIP_GH_GATE_REASON="AOForge upgrade" /);
    assert.match(res.notes, /aof-tools gh pr start <objective>/);
  });

  test('9c. commitNote(root, version, files) is exported: local text in local mode, the store form in store mode', () => {
    const local = fs.mkdtempSync(path.join(os.tmpdir(), 'df-doctor21-local-'));
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'df-doctor21-store-'));
    try {
      write(local, '.aoforge/config.json', `${JSON.stringify({ github: { enabled: true, store: false } })}\n`);
      write(store, '.aoforge/config.json', `${JSON.stringify({ github: { enabled: true, store: true } })}\n`);
      const files = ['.aoforge/config.json', 'CLAUDE.md'];
      assert.equal(pending.commitNote(local, '9.9.9', files), localNote('9.9.9', files));
      assert.equal(pending.commitNote(store, '9.9.9', files), storeNote('9.9.9', files));
    } finally {
      fs.rmSync(local, { recursive: true, force: true });
      fs.rmSync(store, { recursive: true, force: true });
    }
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
    // Codes another check owns, so the validate-health check defers them: E020/I022 (10-runtime-mirror),
    // W040 (21-pending-migrations), W057-W061 (25-gh-store-sync, TRD 50-07), W062 (26-checks-workflow-pin, TRD 61-01),
    // W063 (13-model-profiles, TRD 61-07), E006 / W064 (23-skill-markers, TRD 69-04),
    // W066 / W067 (27-legacy-planning-layout, TRD 72-15).
    assert.deepEqual(
      health.DEFERRED,
      ['E006', 'E020', 'I022', 'W040', 'W057', 'W058', 'W059', 'W060', 'W061', 'W062', 'W063', 'W064', 'W066', 'W067'],
    );
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
    fs.appendFileSync(path.join(root, '.aoforge', 'PROJECT.md'), '\n## Requirements\n\n- one\n', 'utf-8');
    const r = health.run(ctxFor(root, home));
    assert.equal(r.severity, 'ok', r.finding);
    assert.deepEqual(r.details.deferred, ['W040']);
    assert.deepEqual(r.details.codes, []);
  });

  test('a repairable error (E004: STATE.md missing) → error, fixable; the fix repairs it', () => {
    const home = makeDoctorHome();
    const { root } = makeDoctorProject({ home, git: false, version: pluginVersionFor(home) });
    fs.unlinkSync(path.join(root, '.aoforge', 'STATE.md'));
    const ctx = ctxFor(root, home);

    const r = health.run(ctx);
    assert.equal(r.severity, 'error', r.finding);
    assert.ok(r.details.codes.includes('E004'));
    assert.equal(r.fixable, true);

    const res = health.fix(ctx, r);
    assert.equal(res.applied, true, JSON.stringify(res));
    assert.ok(res.changed.includes('.aoforge/STATE.md'), JSON.stringify(res.changed));
    assert.equal(fs.existsSync(path.join(root, '.aoforge', 'STATE.md')), true);
    assert.ok(!health.run(ctxFor(root, home)).details.codes.includes('E004'));
  });

  test('repairable but .aoforge/ has uncommitted changes → not fixable, with the --repair command', () => {
    const home = makeDoctorHome();
    const { root } = makeDoctorProject({ home, version: pluginVersionFor(home) });
    fs.unlinkSync(path.join(root, '.aoforge', 'STATE.md'));
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

  test('16. a stale checks workflow pin (W062) alone -> ok, deferred:[W062]: check 26 reports it, once', () => {
    const home = makeDoctorHome();
    const { root } = makeDoctorProject({ home, git: false });
    const ctx = ctxFor(root, home);
    ctx.exec = () => ({
      status: 0,
      stdout: healthJson({
        status: 'degraded',
        warnings: [{
          code: 'W062',
          message: 'checks-pin-stale: .github/workflows/aoforge.yml pins AOForge v2.13.1 (aoforge-ref, uses), older than the installed plugin 2.14.0',
          fix: 'Run `aof-tools gh setup --apply` to re-pin it',
          repairable: false,
        }],
      }),
      stderr: '',
    });
    const r = health.run(ctx);
    assert.equal(r.severity, 'ok', r.finding);
    assert.deepEqual(r.details.deferred, ['W062']);
    assert.deepEqual(r.details.codes, []);
  });

  test('16. a stale pinned model id (W063) alone -> ok, deferred:[W063]: check 13 reports it, once', () => {
    const home = makeDoctorHome();
    const { root } = makeDoctorProject({ home, git: false });
    const ctx = ctxFor(root, home);
    ctx.exec = () => ({
      status: 0,
      stdout: healthJson({
        status: 'degraded',
        warnings: [{
          code: 'W063',
          message: 'model-id-stale: models.opus = claude-opus-5 is superseded by claude-opus-5-5 (model-rates.json)',
          fix: 'Update the plugin (`/plugin update aoforge@aocyber`); in the AOForge source, update models in references/model-profiles.json',
          repairable: false,
        }],
      }),
      stderr: '',
    });
    const r = health.run(ctx);
    assert.equal(r.severity, 'ok', r.finding);
    assert.deepEqual(r.details.deferred, ['W063']);
    assert.deepEqual(r.details.codes, []);
  });

  test('10. only E006 (a tracked skill marker, repairable) -> ok, not fixable: check 23 owns it and check 22 does not count its repair', () => {
    const home = makeDoctorHome();
    const { root } = makeDoctorProject({ home, git: false });
    const ctx = ctxFor(root, home);
    ctx.exec = () => ({
      status: 0,
      stdout: healthJson({
        status: 'broken',
        errors: [{
          code: 'E006',
          message: 'skill-marker-tracked: .aoforge/.skill-active is tracked in git',
          fix: 'Run `aof-tools doctor --fix`',
          repairable: true,
        }],
        repairable_count: 1,
      }),
      stderr: '',
    });
    const r = health.run(ctx);
    assert.equal(r.severity, 'ok', r.finding);
    assert.equal(r.fixable, false);
    assert.deepEqual(r.details.deferred, ['E006']);
    assert.deepEqual(r.details.codes, []);
    assert.equal(r.details.repairable_count, 0);
  });

  test('11. a repairable W003 next to a deferred repairable W064 -> fixable, counting only the W003', () => {
    const home = makeDoctorHome();
    const { root } = makeDoctorProject({ home, git: false });
    const ctx = ctxFor(root, home);
    ctx.exec = () => ({
      status: 0,
      stdout: healthJson({
        status: 'degraded',
        warnings: [
          { code: 'W003', message: 'config.json missing', fix: 'x', repairable: true },
          { code: 'W064', message: 'skill-marker-stale: .aoforge/.skill-active', fix: 'x', repairable: true },
        ],
        repairable_count: 2,
      }),
      stderr: '',
    });
    const r = health.run(ctx);
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.fixable, true, r.finding);
    assert.deepEqual(r.details.codes, ['W003']);
    assert.deepEqual(r.details.deferred, ['W064']);
    assert.equal(r.details.repairable_count, 1);
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
