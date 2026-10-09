'use strict';

// Tests for doctor check 16-legacy-plugin-runtime (objective 72, TRD 72-15, INST-03), tests 4-8.
//
// What the rename leaves in the user's home, besides df- skills (check 15):
//   plugin-enabled        devflow@aocyber still enabled beside AOForge          report-only: claude plugin disable ...
//   runtime-not-migrated  ~/.claude/devflow/ present, no migration marker      fix: 72-07's migration
//   runtime-leftover      ~/.claude/devflow/ left after the migration          fix: move it whole into backups,
//                                                                              refused while the old plugin is enabled
//   legacy-env            DEVFLOW_* variables in the environment                report-only, names the AOFORGE_* form
//
// no_llm_test_data: homes come from legacy-doctor-fixtures (leftoverHome), built on 72-07's legacyRuntimeHome and
// 72-10's plugin state; env is always injected through ctx.env. The real ~/.claude is never read or written, and
// the doctor never edits Claude Code's settings (the tests compare their bytes before and after).

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const check = require('./16-legacy-plugin-runtime.cjs');
const doctor = require('../doctor.cjs');
const { LEGACY_FILES } = require('../__fixtures__/legacy-runtime-fixtures.cjs');
const F = require('../__fixtures__/legacy-doctor-fixtures.cjs');

const DISABLE = 'claude plugin disable devflow@aocyber';
const MARKER = '.legacy-state-migrated.json';

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

// ─── contract ────────────────────────────────────────────────────────────────

describe('legacy-plugin-runtime: contract', () => {
  test('a global check with a fix; reads the home and env only through ctx; no legacy literal', () => {
    assert.equal(check.id, 'legacy-plugin-runtime');
    assert.equal(check.scope, 'global');
    assert.deepEqual(doctor.contractIssues(check), []);
    const src = fs.readFileSync(require.resolve('./16-legacy-plugin-runtime.cjs'), 'utf-8');
    assert.equal(/os\.homedir|process\.env/.test(src), false, 'never reads os.homedir() or process.env');
    assert.equal(/devflow|DEVFLOW/i.test(src), false, 'every legacy name comes from LEGACY');
    assert.equal(/child_process/.test(src), false, 'never spawns anything: the disable command is reported, not run');
  });

  test('nothing left behind -> ok', () => {
    const h = home({});
    const r = check.run(F.doctorCtx({ home: h.home }));
    assert.equal(r.severity, 'ok', r.finding);
    assert.equal(r.fixable, false);
    assert.deepEqual(r.details.findings, []);
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

// ─── 5. legacy runtime home not yet migrated ─────────────────────────────────

describe('legacy-plugin-runtime: not migrated (test 5)', () => {
  test('5. legacy home, no marker -> warn, fixable; --fix runs the migration and writes the marker', () => {
    const h = home({ legacyRuntime: true });
    const r = check.run(F.doctorCtx({ home: h.home }));
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.fixable, true);
    assert.deepEqual(kinds(r), ['runtime-not-migrated']);
    assert.equal(findingOf(r, 'runtime-not-migrated').fixable, true);

    const report = runFix(h);
    assert.equal(report.fixes.length, 1);
    assert.equal(report.fixes[0].applied, true, report.fixes[0].refused || report.fixes[0].notes);
    const marker = path.join(h.runtimeHome, MARKER);
    assert.ok(fs.existsSync(marker), 'the migration marker is written');
    assert.equal(JSON.parse(fs.readFileSync(marker, 'utf-8')).from, h.legacyHome);
    assert.equal(fs.readFileSync(path.join(h.runtimeHome, 'calibration.json'), 'utf-8'), LEGACY_FILES['calibration.json']);
    assert.ok(fs.existsSync(h.legacyHome), 'one step per run: the old home stays until the next fix');

    // Post-fix: migrated, the old home is now a leftover (fixable: the old plugin is not installed here).
    const post = report.checks[0];
    assert.deepEqual(kinds(post), ['runtime-leftover']);
    assert.equal(post.fixable, true);
  });

  test('5. migration is still offered while the old plugin is enabled (the session hook runs it too)', () => {
    const h = home({ legacyRuntime: true, devflowEnabled: true });
    const r = check.run(F.doctorCtx({ home: h.home }));
    assert.deepEqual(kinds(r), ['plugin-enabled', 'runtime-not-migrated']);
    assert.equal(r.fixable, true);
    assert.equal(r.fix_command, DISABLE, 'the report-only finding keeps its command');
  });
});

// ─── 6. legacy home left after the migration ─────────────────────────────────

describe('legacy-plugin-runtime: leftover after migration (test 6)', () => {
  test('6. marker present, old plugin disabled -> warn, fixable; --fix moves the whole home into backups; re-run ok', () => {
    const h = home({ legacyRuntime: true, migrated: true, devflowEnabled: false });
    const before = settingsBytes(h);
    const r = check.run(F.doctorCtx({ home: h.home }));
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.fixable, true);
    assert.deepEqual(kinds(r), ['runtime-leftover']);

    const report = runFix(h);
    const [outcome] = report.fixes;
    assert.equal(outcome.applied, true, outcome.refused || outcome.notes);
    assert.equal(fs.existsSync(h.legacyHome), false, 'the old home is gone from ~/.claude');
    assert.equal(path.dirname(outcome.backup), path.join(h.runtimeHome, 'backups'));
    assert.equal(path.basename(outcome.backup), 'legacy-devflow-runtime-2026-10-09T03-00-00-000Z');

    // Moved whole: the old mirror and markers are there byte for byte.
    const moved = path.join(outcome.backup, 'devflow');
    for (const rel of ['calibration.json', 'workflows/x.md', 'bin/df-tools.cjs', '.plugin-version', '.devflow-notices.json']) {
      assert.equal(fs.readFileSync(path.join(moved, ...rel.split('/')), 'utf-8'), LEGACY_FILES[rel], rel);
    }
    assert.ok(outcome.changed.every((p) => path.isAbsolute(p)), outcome.changed.join(', '));
    assert.deepEqual(settingsBytes(h), before, 'settings untouched');

    assert.equal(report.checks[0].severity, 'ok', report.checks[0].finding);
    assert.equal(check.run(F.doctorCtx({ home: h.home })).severity, 'ok');
  });

  test('6. old plugin not installed at all -> also fixable', () => {
    const h = home({ legacyRuntime: true, migrated: true });
    const r = check.run(F.doctorCtx({ home: h.home }));
    assert.deepEqual(kinds(r), ['runtime-leftover']);
    assert.equal(r.fixable, true);
  });
});

// ─── 7. leftover while the old plugin is enabled ─────────────────────────────

describe('legacy-plugin-runtime: refused while the old plugin is enabled (test 7)', () => {
  test('7. marker present, old plugin enabled -> not fixable; fix() refuses naming the disable command', () => {
    const h = home({ legacyRuntime: true, migrated: true, devflowEnabled: true });
    const ctx = F.doctorCtx({ home: h.home });
    const r = check.run(ctx);
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.fixable, false);
    assert.deepEqual(kinds(r), ['plugin-enabled', 'runtime-leftover']);
    const leftover = findingOf(r, 'runtime-leftover');
    assert.equal(leftover.fixable, false);
    assert.ok(leftover.fix_command.includes(DISABLE), leftover.fix_command);

    const out = check.fix(ctx, r);
    assert.equal(out.applied, false);
    assert.ok(out.refused && out.refused.includes(DISABLE), out.refused);
    assert.ok(fs.existsSync(path.join(h.legacyHome, 'calibration.json')), 'nothing moved');
  });

  test('7. the engine never calls the fix: no fix entry, the home stays', () => {
    const h = home({ legacyRuntime: true, migrated: true, devflowEnabled: true });
    const report = runFix(h);
    assert.deepEqual(report.fixes, []);
    assert.ok(fs.existsSync(h.legacyHome));
  });
});

// ─── 8. legacy environment variables ─────────────────────────────────────────

describe('legacy-plugin-runtime: environment (test 8)', () => {
  test('8. a legacy-prefixed skip variable -> finding names it and its AOForge form; never fixable', () => {
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
    assert.equal(r.finding.includes('AOFORGE_SKIP_PRUNE'), false, 'new-prefix variables are not findings');
  });

  test('8. several variables are named in sorted order; the bare prefix is ignored', () => {
    const h = home({});
    const env = { DEVFLOW_SKIP_UPGRADE: '1', DEVFLOW_ALLOW_RAW_COMMIT: '1', DEVFLOW_: 'x' };
    const r = check.run(F.doctorCtx({ home: h.home, env }));
    assert.deepEqual(findingOf(r, 'legacy-env').variables.map((v) => v.name), ['DEVFLOW_ALLOW_RAW_COMMIT', 'DEVFLOW_SKIP_UPGRADE']);
  });

  test('8. beside a fixable finding the env finding stays report-only and does not block the fix', () => {
    const h = home({ legacyRuntime: true });
    const r = check.run(F.doctorCtx({ home: h.home, env: { DEVFLOW_SKIP_EDIT_GATE: '1' } }));
    assert.deepEqual(kinds(r), ['runtime-not-migrated', 'legacy-env']);
    assert.equal(findingOf(r, 'legacy-env').fixable, false);
    assert.equal(r.fixable, true);
  });
});
