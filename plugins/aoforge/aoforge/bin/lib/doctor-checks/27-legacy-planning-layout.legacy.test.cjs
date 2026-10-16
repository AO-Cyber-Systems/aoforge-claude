'use strict';

// Tests for doctor check 27-legacy-planning-layout (objective 72, TRD 72-15, INST-03; rewritten for 3.1 by objective
// 78, TRD 78-01, SC-3/SC-4), test 9; check 22's deferral of W066/W067/W069, test 10; check 26's legacy caller
// workflow, test 11; and the doctor CLI on a pre-rename project (TRD 78-01 test-list cases 5-6), tests 12-13.
//
//   W066  the project is still on the pre-rename planning directory (legacy only: the doctor resolves no project and
//         prints the one legacy message as a note), or has both directories (the legacy one is ignored)
//   W067  `.aoforge/config.json` carries the pre-rename stamp key: alone (rename it) or beside the new one (delete it)
//   W069  the project CLAUDE.md holds a managed block under the pre-rename markers (rename the two marker comments)
//
// Check 27 owns the three codes in the doctor and stays report-only: every fix is a manual step or AOForge 3.0.x
// (the last release with migrations 0012-0014), so it carries no fix_command. Check 22 lists them under
// details.deferred and never in its severity. No finding names `--only 0012` or `--only 0013` (retired by 78-07).
//
// no_llm_test_data: projects come from legacy-doctor-fixtures (leftoverProject, built on 72-05's planningProject) and
// legacy-layout-fixtures (planningProject with configKey/claudeMd, TRD 78-01), homes from doctor-fixtures, the legacy
// caller workflow from 72-11's legacy-gh-fixtures. Nothing reads the real home; check 22 and the doctor CLI spawn
// aof-tools with HOME set to the fixture's home.

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
const { NAMES, LEGACY } = require('../legacy-names.cjs');
const { legacyLayoutMessage } = require('../planning-layout.cjs');
const F = require('../__fixtures__/legacy-doctor-fixtures.cjs');
const { planningProject } = require('../__fixtures__/legacy-layout-fixtures.cjs');
const { legacyCaller } = require('../__fixtures__/legacy-gh-fixtures.cjs');
const { makeDoctorHome, makeDoctorProject, makeInstalledPlugin } = require('../__fixtures__/doctor-fixtures.cjs');

const DF_TOOLS = 'node ~/.claude/aoforge/bin/aof-tools.cjs';
const REBRAND = `${DF_TOOLS} gh rebrand --dry-run`;
const RETIRED = /--only 001[23]/;

const cleanups = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()();
});

function project(opts) {
  const p = F.leftoverProject(opts);
  cleanups.push(p.cleanup);
  return p;
}

/** A legacy-layout-fixtures project (configKey / claudeMd variants), root as a realpath like leftoverProject's. */
function layoutProject(opts) {
  const p = planningProject({ git: false, ...opts });
  cleanups.push(p.cleanup);
  return { ...p, root: fs.realpathSync(p.root) };
}

function ctxFor(p) {
  return F.doctorCtx({ home: p.home, env: p.env, projectRoot: p.root });
}

const codes = (r) => r.details.findings.map((f) => f.code);

/** Spawn `aof-tools [--cwd dir] doctor --json ...` with the fixture's hermetic env; parse its JSON report. */
function doctorJson(p, { cwd = null, args = [] } = {}) {
  const pre = cwd ? ['--cwd', cwd] : [];
  const r = spawnSync(process.execPath, [AOF_TOOLS, ...pre, 'doctor', '--json', ...args], {
    cwd: path.dirname(p.root), env: p.env, encoding: 'utf-8', timeout: 120000,
  });
  let text = String(r.stdout || '').trim();
  if (text.startsWith('@file:')) text = fs.readFileSync(text.slice('@file:'.length), 'utf-8');
  try {
    return JSON.parse(text);
  } catch (e) {
    assert.fail(`doctor --json did not print JSON (exit ${r.status}): ${e.message}\n${r.stdout}${r.stderr}`);
  }
  return null;
}

// ─── contract ────────────────────────────────────────────────────────────────

describe('legacy-planning-layout: contract', () => {
  test('a report-only project check; reads only through ctx; no legacy literal; no retired migration', () => {
    assert.equal(check.id, 'legacy-planning-layout');
    assert.equal(check.scope, 'project');
    assert.deepEqual(doctor.contractIssues(check), []);
    assert.equal(check.fix, undefined, 'report-only: no fix');
    const src = fs.readFileSync(require.resolve('./27-legacy-planning-layout.cjs'), 'utf-8');
    assert.equal(/os\.homedir|process\.env/.test(src), false);
    assert.equal(/devflow|\.planning(?![A-Za-z0-9_])/i.test(src), false, 'every legacy name comes from LEGACY');
    assert.equal(/--only|MIGRATION_ID|for one release/.test(src), false, 'names no retired migration');
  });

  test('no project -> ok', () => {
    const p = project({});
    const r = check.run(F.doctorCtx({ home: p.home }));
    assert.equal(r.severity, 'ok');
  });
});

// ─── 9. W066 / W067 / W069 ───────────────────────────────────────────────────

/** Every finding is one line, carries its fix in the line, and names no retired migration or command. */
function assertReportOnly(r) {
  assert.equal(r.fixable, false);
  assert.equal(r.fix_command, undefined, 'every fix is manual or AOForge 3.0.x: no single command');
  assert.equal(r.finding.includes('\n'), false, 'one line');
  assert.equal(RETIRED.test(r.finding), false, r.finding);
  for (const f of r.details.findings) {
    assert.equal(f.fix_command, undefined, f.code);
    assert.ok(r.finding.includes(`${f.code} ${f.message} (fix: ${f.fix})`), `${f.code} fix in the line: ${r.finding}`);
  }
}

describe('legacy-planning-layout: W066, W067 and W069 (test 9)', () => {
  test('9. both planning directories -> W066 (both), the manual move in the line', () => {
    const p = project({ layout: 'both', configKey: 'aoforge' });
    const r = check.run(ctxFor(p));
    assert.equal(r.severity, 'warn', r.finding);
    assert.deepEqual(codes(r), ['W066']);
    assert.equal(r.details.findings[0].layout, 'both');
    assert.ok(r.finding.includes('both exist'), r.finding);
    assertReportOnly(r);
  });

  test('9. the pre-rename config key alone -> W067 naming the rename', () => {
    const p = project({ layout: 'aoforge', configKey: 'legacy' });
    const r = check.run(ctxFor(p));
    assert.equal(r.severity, 'warn', r.finding);
    assert.deepEqual(codes(r), ['W067']);
    assert.ok(r.finding.startsWith('W067 legacy-config-key:'), r.finding);
    assert.ok(r.finding.includes(`rename the key to "${NAMES.configKey}"`), r.finding);
    assertReportOnly(r);
  });

  test('9. both config keys -> W067 naming the deletion (3.1 never merges or removes the pre-rename key)', () => {
    const p = project({ layout: 'aoforge', configKey: 'both' });
    const r = check.run(ctxFor(p));
    assert.equal(r.severity, 'warn', r.finding);
    assert.deepEqual(codes(r), ['W067']);
    assert.ok(r.finding.includes('delete the pre-rename key'), r.finding);
    assertReportOnly(r);
  });

  test('9. a CLAUDE.md block under the pre-rename markers -> W069 naming the marker rename and 3.0.x', () => {
    const p = layoutProject({ layout: 'aoforge', claudeMd: 'legacy-block' });
    const r = check.run(ctxFor(p));
    assert.equal(r.severity, 'warn', r.finding);
    assert.deepEqual(codes(r), ['W069']);
    assert.ok(r.finding.startsWith('W069 legacy-claude-md-block: CLAUDE.md '), r.finding);
    assert.ok(r.finding.includes(`<!-- ${LEGACY.blockTag}:START`) && r.finding.includes('3.0.x'), r.finding);
    assertReportOnly(r);
  });

  test('9. all three at once -> W066, W067, W069, each once, in that order', () => {
    const p = layoutProject({ layout: 'both', configKey: 'both', claudeMd: 'legacy-block' });
    const r = check.run(ctxFor(p));
    assert.equal(r.severity, 'warn', r.finding);
    assert.deepEqual(codes(r), ['W066', 'W067', 'W069']);
    assertReportOnly(r);
  });

  test('9. a legacy-only root handed to the check directly -> W066 (legacy) with the 3.0.x / manual fix', () => {
    // The doctor CLI never resolves such a root (test 12); a caller that hands one over still gets the text.
    const p = project({ layout: 'legacy', configKey: 'legacy' });
    const r = check.run(ctxFor(p));
    assert.deepEqual(codes(r), ['W066'], 'the config in the legacy directory is part of the layout problem');
    assert.equal(r.details.findings[0].layout, 'legacy');
    assert.ok(r.finding.includes('3.0.x') && r.finding.includes(`git mv ${LEGACY.planningDir} ${NAMES.planningDir}`), r.finding);
    assertReportOnly(r);
  });

  test('9. AOForge layout, key and block -> ok', () => {
    for (const configKey of ['aoforge', 'none']) {
      const p = project({ layout: 'aoforge', configKey });
      const r = check.run(ctxFor(p));
      assert.equal(r.severity, 'ok', `${configKey}: ${r.finding}`);
      assert.deepEqual(r.details.findings, []);
    }
    const p = layoutProject({ layout: 'aoforge', configKey: 'aoforge', claudeMd: 'aoforge-block' });
    assert.equal(check.run(ctxFor(p)).severity, 'ok');
  });

  test('9. the same messages validate health reports (shared detection, not a re-implementation)', () => {
    const p = layoutProject({ layout: 'both', configKey: 'legacy', claudeMd: 'legacy-block' });
    const r = check.run(ctxFor(p));
    assert.deepEqual(codes(r), ['W066', 'W067', 'W069']);
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

  test('9. --fix applies nothing and leaves both directories, config.json and CLAUDE.md alone', () => {
    const p = layoutProject({ layout: 'both', configKey: 'both', claudeMd: 'legacy-block' });
    const files = [
      path.join(p.root, NAMES.planningDir, 'config.json'),
      path.join(p.root, LEGACY.planningDir, 'config.json'),
      path.join(p.root, 'CLAUDE.md'),
    ];
    const before = files.map((f) => fs.readFileSync(f, 'utf-8'));
    const report = doctor.runDoctor({
      projectRoot: p.root, userHome: p.home, env: p.env, now: F.FIXED_NOW, fix: true, checks: [check],
    });
    assert.deepEqual(report.fixes, []);
    assert.deepEqual(files.map((f) => fs.readFileSync(f, 'utf-8')), before);
  });
});

// ─── 10. check 22 defers W066/W067/W069 ──────────────────────────────────────

describe('validate-health defers W066/W067/W069 to check 27 (test 10)', () => {
  test('10. DEFERRED lists W066, W067 and W069', () => {
    for (const code of ['W066', 'W067', 'W069']) assert.ok(health.DEFERRED.includes(code), code);
  });

  test('10. on a both / W067 / W069 project check 22 lists the three under details.deferred, never in its codes', () => {
    const p = layoutProject({ layout: 'both', configKey: 'both', claudeMd: 'legacy-block' });
    const r = health.run(ctxFor(p));
    assert.ok(r.details, r.finding);
    for (const code of ['W066', 'W067', 'W069']) {
      assert.ok(r.details.deferred.includes(code), `${code}: ${JSON.stringify(r.details.deferred)}`);
      assert.equal(r.details.codes.includes(code), false, code);
    }
    assert.equal(/W06[679]/.test(r.finding), false, r.finding);
  });
});

// ─── 12-13. the doctor CLI on a pre-rename project (TRD 78-01 cases 5-6) ─────

describe('doctor CLI in a legacy-only project (test 12)', () => {
  test('12. at the root: no project checks; the note is legacyLayoutMessage(root)', () => {
    const p = project({ layout: 'legacy', configKey: 'legacy' });
    const report = doctorJson(p, { cwd: p.root });
    assert.equal(report.scope.project, null, JSON.stringify(report.scope));
    assert.deepEqual(report.checks.filter((c) => c.scope === 'project').map((c) => c.id), []);
    assert.ok(report.notes.includes(legacyLayoutMessage(p.root)), JSON.stringify(report.notes));
    assert.equal(fs.existsSync(path.join(p.root, NAMES.planningDir)), false, 'no new directory');
  });

  test('12. from a subdirectory: the same note (the walk finds the legacy root)', () => {
    const p = project({ layout: 'legacy', configKey: 'legacy' });
    const sub = path.join(p.root, 'src', 'deep');
    fs.mkdirSync(sub, { recursive: true });
    const report = doctorJson(p, { cwd: sub });
    assert.equal(report.scope.project, null);
    assert.deepEqual(report.checks.filter((c) => c.scope === 'project').map((c) => c.id), []);
    assert.ok(report.notes.includes(legacyLayoutMessage(p.root)), JSON.stringify(report.notes));
  });

  test('12. with --path <root>: the same note, no project checks', () => {
    const p = project({ layout: 'legacy', configKey: 'legacy' });
    const report = doctorJson(p, { args: ['--path', p.root] });
    assert.equal(report.scope.project, null);
    assert.ok(report.notes.includes(legacyLayoutMessage(p.root)), JSON.stringify(report.notes));
  });
});

describe('doctor CLI in a both / W067 / W069 project (test 13)', () => {
  test('13. check 27 warns with each code once; check 22 repeats none; nothing names a retired migration', () => {
    const p = layoutProject({ layout: 'both', configKey: 'both', claudeMd: 'legacy-block' });
    const report = doctorJson(p, { cwd: p.root });
    assert.equal(report.scope.project, p.root);
    const byId = Object.fromEntries(report.checks.map((c) => [c.id, c]));
    const c27 = byId['legacy-planning-layout'];
    assert.equal(c27.severity, 'warn', c27.finding);
    assert.deepEqual(c27.details.findings.map((f) => f.code), ['W066', 'W067', 'W069']);
    const c22 = byId['validate-health'];
    for (const code of ['W066', 'W067', 'W069']) {
      assert.equal(c22.details.codes.includes(code), false, `check 22 repeats ${code}`);
    }
    for (const c of report.checks) {
      assert.equal(RETIRED.test(`${c.finding} ${c.fix_command || ''}`), false, `${c.id}: ${c.finding}`);
    }
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
