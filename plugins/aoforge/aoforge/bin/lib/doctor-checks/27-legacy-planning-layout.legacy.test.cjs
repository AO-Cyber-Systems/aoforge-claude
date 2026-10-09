'use strict';

// Tests for doctor check 27-legacy-planning-layout (objective 72, TRD 72-15, INST-03), test 9; check 22's deferral of
// W066/W067, test 10; and check 26's legacy caller workflow, test 11.
//
//   W066  the project is still on the legacy planning directory (fix: migration 0012), or has both directories
//   W067  config.json records its upgrades only under the legacy stamp key (fix: migration 0013)
//
// Check 27 owns both codes in the doctor and is report-only: the move and the rename are migrations with their own
// backups and an index change the user commits. Check 22 lists them under details.deferred and never in its severity.
//
// no_llm_test_data: projects come from legacy-doctor-fixtures (leftoverProject, built on 72-05's planningProject),
// homes from doctor-fixtures, the legacy caller workflow from 72-11's legacy-gh-fixtures. Nothing reads the real
// home; check 22 spawns validate health with HOME set to the fixture's home.

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const AOF_TOOLS = path.join(__dirname, '..', '..', 'aof-tools.cjs');

const check = require('./27-legacy-planning-layout.cjs');
const health = require('./22-validate-health.cjs');
const pinCheck = require('./26-checks-workflow-pin.cjs');
const doctor = require('../doctor.cjs');
const { LEGACY } = require('../legacy-names.cjs');
const F = require('../__fixtures__/legacy-doctor-fixtures.cjs');
const { legacyCaller } = require('../__fixtures__/legacy-gh-fixtures.cjs');
const { makeDoctorHome, makeDoctorProject, makeInstalledPlugin } = require('../__fixtures__/doctor-fixtures.cjs');

const DF_TOOLS = 'node ~/.claude/aoforge/bin/aof-tools.cjs';
const MOVE = `${DF_TOOLS} upgrade --apply --only 0012`;
const RENAME = `${DF_TOOLS} upgrade --apply --only 0013`;
const REBRAND = `${DF_TOOLS} gh rebrand --dry-run`;

const cleanups = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()();
});

function project(opts) {
  const p = F.leftoverProject(opts);
  cleanups.push(p.cleanup);
  return p;
}

function ctxFor(p) {
  return F.doctorCtx({ home: p.home, env: p.env, projectRoot: p.root });
}

const codes = (r) => r.details.findings.map((f) => f.code);

// ─── contract ────────────────────────────────────────────────────────────────

describe('legacy-planning-layout: contract', () => {
  test('a report-only project check; reads only through ctx; no legacy literal', () => {
    assert.equal(check.id, 'legacy-planning-layout');
    assert.equal(check.scope, 'project');
    assert.deepEqual(doctor.contractIssues(check), []);
    assert.equal(check.fix, undefined, 'report-only: no fix');
    const src = fs.readFileSync(require.resolve('./27-legacy-planning-layout.cjs'), 'utf-8');
    assert.equal(/os\.homedir|process\.env/.test(src), false);
    assert.equal(/devflow|\.planning(?![A-Za-z0-9_])/i.test(src), false, 'every legacy name comes from LEGACY');
  });

  test('no project -> ok', () => {
    const p = project({});
    const r = check.run(F.doctorCtx({ home: p.home }));
    assert.equal(r.severity, 'ok');
  });
});

// ─── 9. W066 / W067 ──────────────────────────────────────────────────────────

describe('legacy-planning-layout: W066 and W067 (test 9)', () => {
  test('9. legacy layout -> W066 with --only 0012, report-only', () => {
    const p = project({ layout: 'legacy', configKey: 'aoforge' });
    const r = check.run(ctxFor(p));
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.fixable, false);
    assert.deepEqual(codes(r), ['W066']);
    assert.equal(r.fix_command, MOVE);
    assert.ok(r.finding.startsWith('W066 legacy-planning-dir:'), r.finding);
    assert.ok(r.finding.includes(`${LEGACY.planningDir}/`), r.finding);
    assert.equal(r.finding.includes('\n'), false, 'one line');
  });

  test('9. legacy config key -> W067 with --only 0013', () => {
    const p = project({ layout: 'aoforge', configKey: 'legacy' });
    const r = check.run(ctxFor(p));
    assert.equal(r.severity, 'warn', r.finding);
    assert.deepEqual(codes(r), ['W067']);
    assert.equal(r.fix_command, RENAME);
    assert.ok(r.finding.startsWith('W067 legacy-config-key:'), r.finding);
  });

  test('9. both -> both, the move before the rename', () => {
    const p = project({ layout: 'legacy', configKey: 'legacy' });
    const r = check.run(ctxFor(p));
    assert.deepEqual(codes(r), ['W066', 'W067']);
    assert.equal(r.fix_command, `${MOVE} && ${RENAME}`);
    const [w066, w067] = r.details.findings;
    assert.equal(w066.fix_command, MOVE);
    assert.equal(w067.fix_command, RENAME);
  });

  test('9. AOForge layout and key -> ok; both keys -> ok (W067 is the legacy key alone)', () => {
    for (const configKey of ['aoforge', 'both', 'none']) {
      const p = project({ layout: 'aoforge', configKey });
      const r = check.run(ctxFor(p));
      assert.equal(r.severity, 'ok', `${configKey}: ${r.finding}`);
      assert.deepEqual(r.details.findings, []);
    }
  });

  test('9. both planning directories -> W066 naming the manual move, no migration command', () => {
    const p = project({ layout: 'both', configKey: 'aoforge' });
    const r = check.run(ctxFor(p));
    assert.deepEqual(codes(r), ['W066']);
    assert.equal(r.details.findings[0].layout, 'both');
    assert.equal(r.fix_command, undefined, 'no command: the user decides what to keep');
    assert.ok(r.finding.includes('both exist'), r.finding);
    assert.ok(r.finding.includes('fix:'), 'the manual fix is in the finding');
  });

  test('9. the same messages validate health reports (shared detection, not a re-implementation)', () => {
    const p = project({ layout: 'legacy', configKey: 'legacy' });
    const r = check.run(ctxFor(p));
    const spawned = spawnSync(process.execPath, [AOF_TOOLS, '--cwd', p.root, 'validate', 'health'], {
      env: p.env, encoding: 'utf-8', timeout: 60000,
    });
    let text = String(spawned.stdout || '').trim();
    if (text.startsWith('@file:')) text = fs.readFileSync(text.slice('@file:'.length), 'utf-8');
    const json = JSON.parse(text);
    const byCode = Object.fromEntries(json.warnings.map((i) => [i.code, i]));
    for (const f of r.details.findings) {
      assert.ok(byCode[f.code], `validate health did not report ${f.code}`);
      assert.equal(f.message, byCode[f.code].message, f.code);
      assert.equal(f.fix, byCode[f.code].fix, f.code);
    }
  });

  test('9. --fix applies nothing and leaves both directories and config.json alone', () => {
    const p = project({ layout: 'legacy', configKey: 'legacy' });
    const config = path.join(p.root, LEGACY.planningDir, 'config.json');
    const before = fs.readFileSync(config, 'utf-8');
    const report = doctor.runDoctor({
      projectRoot: p.root, userHome: p.home, env: p.env, now: F.FIXED_NOW, fix: true, checks: [check],
    });
    assert.deepEqual(report.fixes, []);
    assert.equal(fs.readFileSync(config, 'utf-8'), before);
    assert.equal(fs.existsSync(path.join(p.root, '.aoforge')), false);
  });
});

// ─── 10. check 22 defers W066/W067 ───────────────────────────────────────────

describe('validate-health defers W066/W067 to check 27 (test 10)', () => {
  test('10. DEFERRED lists W066 and W067', () => {
    assert.ok(health.DEFERRED.includes('W066'));
    assert.ok(health.DEFERRED.includes('W067'));
  });

  test('10. on a legacy project check 22 lists both under details.deferred, never in its codes or severity', () => {
    const p = project({ layout: 'legacy', configKey: 'legacy' });
    const r = health.run(ctxFor(p));
    assert.ok(r.details, r.finding);
    assert.ok(r.details.deferred.includes('W066'), JSON.stringify(r.details.deferred));
    assert.ok(r.details.deferred.includes('W067'), JSON.stringify(r.details.deferred));
    assert.equal(r.details.codes.includes('W066'), false);
    assert.equal(r.details.codes.includes('W067'), false);
    assert.equal(/W06[67]/.test(r.finding), false, r.finding);
  });
});

// ─── 11. check 26: a legacy managed caller workflow ──────────────────────────

describe('checks-workflow-pin: legacy caller workflow (test 11)', () => {
  function pinSetup(sha) {
    const home = makeDoctorHome();
    cleanups.push(() => fs.rmSync(home, { recursive: true, force: true }));
    makeInstalledPlugin(home, { version: '3.0.0' });
    const { root } = makeDoctorProject({ home, git: false });
    cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));
    const rel = `.github/workflows/${LEGACY.checksCaller}`;
    fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(root, ...rel.split('/')), legacyCaller({ sha }));
    const ctx = doctor.buildContext({ projectRoot: root, userHome: home, env: {}, now: F.FIXED_NOW, pluginVersion: '3.0.0' });
    return { ctx, rel };
  }

  test('11. a stale legacy caller -> legacy caller workflow, the rebrand dry run, no pin fix', () => {
    const { ctx, rel } = pinSetup('v2.13.1');
    const r = pinCheck.run(ctx);
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.fixable, false);
    assert.ok(r.finding.includes('legacy caller workflow'), r.finding);
    assert.ok(r.finding.includes(rel), r.finding);
    assert.equal(r.fix_command, REBRAND);
    assert.equal(/gh setup/.test(r.fix_command), false);
    assert.equal(r.details.legacy, true);
    assert.equal(r.details.path, rel);
    assert.equal(r.details.state, 'stale');
    assert.equal(r.details.code, 'W062');
    assert.equal(r.finding.includes('\n'), false, 'one line');
  });

  test('11. a legacy caller pinned to a SHA (not compared) is still reported as legacy', () => {
    const { ctx, rel } = pinSetup('0123456789abcdef0123456789abcdef01234567');
    const r = pinCheck.run(ctx);
    assert.equal(r.severity, 'warn', r.finding);
    assert.ok(r.finding.includes('legacy caller workflow'), r.finding);
    assert.equal(r.fix_command, REBRAND);
    assert.equal(r.details.path, rel);
    assert.equal(r.details.code, undefined, 'no W062: nothing stale to compare');
  });

  test('11. a legacy caller pinned to the installed release is still reported as legacy', () => {
    const { ctx } = pinSetup('v3.0.0');
    const r = pinCheck.run(ctx);
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.fix_command, REBRAND);
  });
});
