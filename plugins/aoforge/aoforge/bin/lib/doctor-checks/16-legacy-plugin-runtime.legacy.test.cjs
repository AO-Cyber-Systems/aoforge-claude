'use strict';

// Tests for doctor check 16-legacy-plugin-runtime (objective 72, TRD 72-15, INST-03; report-only since objective 78,
// TRD 78-06, SC-3/SC-4), tests 4-8.
//
// What the rename leaves in the user's home, besides df- skills (check 15). Every finding is report-only in 3.1:
//   plugin-enabled        devflow@aocyber still enabled beside AOForge          fix_command: claude plugin disable ...
//   runtime-not-migrated  ~/.claude/devflow/ present, no migration marker      AOForge 3.0.x once, or copy by hand
//   runtime-leftover      ~/.claude/devflow/ left after a 3.0.x migration      a manual mv into backups/legacy-...-<date>/
//                                                                              (disable the old plugin first)
//   legacy-env            DEVFLOW_* variables in the environment                no longer read: rename each where set
//
// 8. Each of the four findings with its 3.1 text; no `fix` export; `doctor --global --fix` leaves the pre-rename
//    runtime home in place (in process and through the CLI).
//
// no_llm_test_data: homes come from legacy-doctor-fixtures (leftoverHome), built on 72-07's legacyRuntimeHome and
// 72-10's plugin state; env is always injected through ctx.env. The real ~/.claude is never read or written, and
// the doctor never edits Claude Code's settings (the tests compare their bytes before and after).

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const check = require('./16-legacy-plugin-runtime.cjs');
const doctor = require('../doctor.cjs');
const coexistence = require('../coexistence.cjs');
const { NAMES, LEGACY } = require('../legacy-names.cjs');
const F = require('../__fixtures__/legacy-doctor-fixtures.cjs');

const AOF_TOOLS = path.join(__dirname, '..', '..', 'aof-tools.cjs');
const DISABLE = 'claude plugin disable devflow@aocyber';
const MARKER = '.legacy-state-migrated.json';
const DATE = F.FIXED_NOW.toISOString().slice(0, 10);

const made = [];
afterEach(() => {
  while (made.length) made.pop().cleanup();
});

function home(opts) {
  const h = F.leftoverHome(opts);
  made.push(h);
  return h;
}

const kinds = (r) => r.details.findings.map((f) => f.kind);
const findingOf = (r, kind) => r.details.findings.find((f) => f.kind === kind);

function settingsBytes(h) {
  const out = {};
  for (const name of ['settings.json', 'settings.local.json', 'plugins/installed_plugins.json']) {
    const file = path.join(h.claudeDir, ...name.split('/'));
    out[name] = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
  }
  return out;
}

/** Every file under `dir` -> its content (relative, posix). */
function snapshot(dir) {
  const out = {};
  (function walk(cur, rel) {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(cur, entry.name), childRel);
      else out[childRel] = fs.readFileSync(path.join(cur, entry.name), 'utf-8');
    }
  })(dir, '');
  return out;
}

function runFix(h, env = {}) {
  return doctor.runDoctor({
    userHome: h.home,
    env,
    now: F.FIXED_NOW,
    pluginVersion: F.PLUGIN_VERSION,
    scope: 'global',
    fix: true,
    checks: [check],
  });
}

/** No text of 3.0's one-release wording. */
function assertNo30Wording(text) {
  assert.doesNotMatch(text, /for one release/i, text);
  assert.doesNotMatch(text, /\bhonou?rs?\b/i, text);
}

// ─── contract ────────────────────────────────────────────────────────────────

describe('legacy-plugin-runtime: contract', () => {
  test('8. a global, report-only check: no fix export; reads the home and env only through ctx; no legacy literal', () => {
    assert.equal(check.id, 'legacy-plugin-runtime');
    assert.equal(check.scope, 'global');
    assert.deepEqual(doctor.contractIssues(check), []);
    assert.equal(check.fix, undefined, 'report-only in 3.1');
    const src = fs.readFileSync(require.resolve('./16-legacy-plugin-runtime.cjs'), 'utf-8');
    assert.equal(/os\.homedir|process\.env/.test(src), false, 'never reads os.homedir() or process.env');
    assert.equal(/devflow|DEVFLOW/i.test(src), false, 'every legacy name comes from LEGACY');
    assert.equal(/child_process/.test(src), false, 'never spawns anything: the disable command is reported, not run');
    assert.equal(/runtime-state-migrate|moveLegacy|FIX_KINDS/.test(src), false, 'no migration and no mover');
  });

  test('nothing left behind -> ok', () => {
    const h = home({});
    const r = check.run(F.doctorCtx({ home: h.home }));
    assert.equal(r.severity, 'ok', r.finding);
    assert.equal(r.fixable, false);
    assert.deepEqual(r.details.findings, []);
  });

  test('the detection is coexistence.cjs\'s (one module for global pre-rename detection)', () => {
    const h = home({ legacyRuntime: true, migrated: true });
    const r = check.run(F.doctorCtx({ home: h.home, env: { DEVFLOW_SKIP_EDIT_GATE: '1' } }));
    assert.equal(r.details.legacy_home, coexistence.legacyRuntimeHome(h.home));
    assert.deepEqual(
      { present: r.details.legacy_home_present, migrated: r.details.migrated },
      coexistence.legacyRuntimeState(h.home)
    );
    assert.deepEqual(findingOf(r, 'legacy-env').variables, coexistence.legacyEnvVariables({ DEVFLOW_SKIP_EDIT_GATE: '1' }));
  });
});

// ─── 4. the old plugin still enabled ─────────────────────────────────────────

describe('legacy-plugin-runtime: old plugin enabled (test 4)', () => {
  test('4. enabled -> warn, report-only, fix_command is the disable command', () => {
    const h = home({ devflowEnabled: true });
    const r = check.run(F.doctorCtx({ home: h.home }));
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.fixable, false);
    assert.deepEqual(kinds(r), ['plugin-enabled']);
    const f = findingOf(r, 'plugin-enabled');
    assert.equal(f.fixable, false);
    assert.equal(f.fix_command, DISABLE);
    assert.equal(r.fix_command, DISABLE);
    assert.ok(r.finding.includes('devflow@aocyber v2.15.0'), r.finding);
    assert.equal(r.finding.includes('\n'), false, 'one line');
  });

  test('4. installed but disabled, or not installed -> no plugin finding', () => {
    for (const devflowEnabled of [false, null]) {
      const h = home({ devflowEnabled });
      const r = check.run(F.doctorCtx({ home: h.home }));
      assert.equal(r.severity, 'ok', `${devflowEnabled}: ${r.finding}`);
    }
  });

  test('4. a --fix run never touches Claude Code settings', () => {
    const h = home({ devflowEnabled: true });
    const before = settingsBytes(h);
    const report = runFix(h);
    assert.deepEqual(report.fixes, [], 'report-only: no fix attempted');
    assert.deepEqual(settingsBytes(h), before);
  });
});

// ─── 5. legacy runtime home never migrated ───────────────────────────────────

describe('legacy-plugin-runtime: not migrated (test 5)', () => {
  test('5. legacy home, no marker -> warn, report-only, names the 3.0.x path and the manual copy', () => {
    const h = home({ legacyRuntime: true });
    const r = check.run(F.doctorCtx({ home: h.home }));
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.fixable, false);
    assert.deepEqual(kinds(r), ['runtime-not-migrated']);
    const f = findingOf(r, 'runtime-not-migrated');
    assert.equal(f.fixable, false);
    assert.ok(f.message.includes(h.legacyHome), f.message);
    assert.match(f.message, /no longer migrates it/);
    assert.ok(f.message.includes('AOForge 3.0.x'), f.message);
    assert.match(f.message, /by hand/);
    assert.ok(f.message.includes('docs/MIGRATING-TO-AOFORGE.md'), f.message);
    assertNo30Wording(r.finding);
  });

  test('8. --fix copies nothing, writes no marker and leaves the old home byte for byte', () => {
    const h = home({ legacyRuntime: true });
    const before = snapshot(h.legacyHome);
    const report = runFix(h);
    assert.deepEqual(report.fixes, []);
    assert.deepEqual(snapshot(h.legacyHome), before);
    assert.equal(fs.existsSync(path.join(h.runtimeHome, MARKER)), false, 'no marker');
    assert.equal(fs.existsSync(path.join(h.runtimeHome, 'calibration.json')), false, 'nothing copied');
    assert.deepEqual(kinds(report.checks[0]), ['runtime-not-migrated']);
  });

  test('5. beside the enabled old plugin both are reported; the disable command is the check\'s command', () => {
    const h = home({ legacyRuntime: true, devflowEnabled: true });
    const r = check.run(F.doctorCtx({ home: h.home }));
    assert.deepEqual(kinds(r), ['plugin-enabled', 'runtime-not-migrated']);
    assert.equal(r.fixable, false);
    assert.equal(r.fix_command, DISABLE);
  });
});

// ─── 6. legacy home left after a 3.0.x migration ─────────────────────────────

describe('legacy-plugin-runtime: leftover after a 3.0.x migration (test 6)', () => {
  test('6. marker present -> warn, report-only; fix_command is the manual move into backups', () => {
    const h = home({ legacyRuntime: true, migrated: true, devflowEnabled: false });
    const r = check.run(F.doctorCtx({ home: h.home }));
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.fixable, false);
    assert.deepEqual(kinds(r), ['runtime-leftover']);
    const f = findingOf(r, 'runtime-leftover');
    assert.equal(f.fixable, false);
    assert.ok(f.message.includes(h.legacyHome), f.message);
    assert.match(f.message, /move it yourself/);
    const target = path.join(h.runtimeHome, 'backups', `legacy-devflow-runtime-${DATE}`);
    assert.equal(f.fix_command, `mkdir -p ${target} && mv ${h.legacyHome} ${target}/`);
    assert.equal(r.fix_command, f.fix_command);
    assertNo30Wording(r.finding);
  });

  test('8. --fix leaves the leftover home in place and Claude Code settings untouched', () => {
    const h = home({ legacyRuntime: true, migrated: true, devflowEnabled: false });
    const before = settingsBytes(h);
    const files = snapshot(h.legacyHome);
    const report = runFix(h);
    assert.deepEqual(report.fixes, []);
    assert.deepEqual(snapshot(h.legacyHome), files);
    assert.equal(fs.existsSync(path.join(h.runtimeHome, 'backups')), false, 'nothing moved into backups');
    assert.deepEqual(settingsBytes(h), before);
  });

  test('7. leftover while the old plugin is enabled: disable it first, then the move', () => {
    const h = home({ legacyRuntime: true, migrated: true, devflowEnabled: true });
    const r = check.run(F.doctorCtx({ home: h.home }));
    assert.deepEqual(kinds(r), ['plugin-enabled', 'runtime-leftover']);
    assert.equal(r.fixable, false);
    const leftover = findingOf(r, 'runtime-leftover');
    assert.match(leftover.message, /keeps writing there/);
    assert.ok(leftover.fix_command.startsWith(`${DISABLE} && mkdir -p `), leftover.fix_command);
    assert.ok(r.fix_command.includes(DISABLE), r.fix_command);
    assert.ok(r.fix_command.includes(' mv '), r.fix_command);
  });

  test('a home path with a space is quoted in the move command', () => {
    const h = home({ legacyRuntime: true, migrated: true });
    const spaced = path.join(path.dirname(h.home), `${path.basename(h.home)} spaced`);
    fs.renameSync(h.home, spaced);
    made.push({ cleanup: () => fs.rmSync(spaced, { recursive: true, force: true }) });
    const r = check.run(F.doctorCtx({ home: spaced }));
    const cmd = findingOf(r, 'runtime-leftover').fix_command;
    assert.ok(cmd.includes(`'${path.join(spaced, '.claude', 'devflow')}'`), cmd);
  });
});

// ─── 8. legacy environment variables ─────────────────────────────────────────

describe('legacy-plugin-runtime: environment (test 8)', () => {
  test('8. a legacy-prefixed skip variable -> names it and its AOForge form, no longer read; never fixable', () => {
    const h = home({});
    const env = { DEVFLOW_SKIP_EDIT_GATE: '1', AOFORGE_SKIP_PRUNE: '1', PATH: '/usr/bin' };
    const r = check.run(F.doctorCtx({ home: h.home, env }));
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.fixable, false);
    assert.deepEqual(kinds(r), ['legacy-env']);
    const f = findingOf(r, 'legacy-env');
    assert.equal(f.fixable, false);
    assert.deepEqual(f.variables, [{ name: 'DEVFLOW_SKIP_EDIT_GATE', aoforge: 'AOFORGE_SKIP_EDIT_GATE' }]);
    assert.ok(r.finding.includes('DEVFLOW_SKIP_EDIT_GATE'), r.finding);
    assert.ok(r.finding.includes('AOFORGE_SKIP_EDIT_GATE'), r.finding);
    assert.ok(r.finding.includes('no longer read since 3.1.0'), r.finding);
    assert.match(r.finding, /rename each where it is set/);
    assert.equal(r.finding.includes('AOFORGE_SKIP_PRUNE'), false, 'new-prefix variables are not findings');
    assertNo30Wording(r.finding);
  });

  test('8. several variables are named in sorted order; the bare prefix is ignored', () => {
    const h = home({});
    const env = { DEVFLOW_SKIP_UPGRADE: '1', DEVFLOW_ALLOW_RAW_COMMIT: '1', DEVFLOW_: 'x' };
    const r = check.run(F.doctorCtx({ home: h.home, env }));
    assert.deepEqual(findingOf(r, 'legacy-env').variables.map((v) => v.name), ['DEVFLOW_ALLOW_RAW_COMMIT', 'DEVFLOW_SKIP_UPGRADE']);
  });

  test('8. beside another finding the env finding is listed after it; nothing is fixable', () => {
    const h = home({ legacyRuntime: true });
    const r = check.run(F.doctorCtx({ home: h.home, env: { DEVFLOW_SKIP_EDIT_GATE: '1' } }));
    assert.deepEqual(kinds(r), ['runtime-not-migrated', 'legacy-env']);
    assert.equal(r.fixable, false);
  });
});

// ─── 8. through the CLI ──────────────────────────────────────────────────────

describe('legacy-plugin-runtime: CLI (test 8)', () => {
  test('8. aof-tools doctor --global --fix --json leaves the pre-rename runtime home in place', () => {
    const h = home({ legacyRuntime: true });
    const before = snapshot(h.legacyHome);
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(NAMES.envPrefix) || key.startsWith(LEGACY.envPrefix)) continue;
      env[key] = value;
    }
    env.HOME = h.home;
    env.USERPROFILE = h.home;
    const r = spawnSync(process.execPath, [AOF_TOOLS, 'doctor', '--global', '--fix', '--json'], {
      cwd: h.home, env, encoding: 'utf-8', timeout: 60000,
    });
    assert.equal(r.status, 0, r.stderr);
    let text = String(r.stdout || '').trim();
    if (text.startsWith('@file:')) {
      const file = text.slice('@file:'.length);
      text = fs.readFileSync(file, 'utf-8');
      fs.rmSync(file, { force: true });
    }
    const report = JSON.parse(text);
    const found = report.checks.find((c) => c.id === 'legacy-plugin-runtime');
    assert.ok(found, report.checks.map((c) => c.id).join(', '));
    assert.equal(found.severity, 'warn');
    assert.equal(found.fixable, false);
    assert.equal(report.fixes.some((f) => f.id === 'legacy-plugin-runtime'), false, JSON.stringify(report.fixes));
    assert.deepEqual(snapshot(h.legacyHome), before, 'the pre-rename runtime home is untouched');
    assert.equal(fs.existsSync(path.join(h.runtimeHome, MARKER)), false, 'no marker');
  });
});
