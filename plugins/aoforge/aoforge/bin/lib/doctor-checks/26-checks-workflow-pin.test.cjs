'use strict';

// Tests for doctor check 26-checks-workflow-pin (TRD 61-01, STOR-03, tests 12-15).
//
// no_llm_test_data: homes and projects come from doctor-fixtures' builders under the OS temp dir (never the real
// ~/.claude); workflow text is the real template rendered by gh-setup's renderTemplates, or a literal in this file. The
// check composes checks-pin.collectPinFindings, so this file proves the doctor rendering and which version it compares
// against; the decision itself is proved in checks-pin.test.cjs.

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const check = require('./26-checks-workflow-pin.cjs');
const doctor = require('../doctor.cjs');
const { renderTemplates } = require('../gh-setup.cjs');
const { makeDoctorHome, makeDoctorProject, makeInstalledPlugin } = require('../__fixtures__/doctor-fixtures.cjs');

const NOW = new Date('2026-10-06T12:00:00.000Z');
const FIX_COMMAND = 'node ~/.claude/aoforge/bin/aof-tools.cjs gh setup --apply';

const made = [];
afterEach(() => {
  while (made.length) fs.rmSync(made.pop(), { recursive: true, force: true });
});

/** A doctor home + project; `installed` registers an installed plugin at that version, `running` is ctx.pluginVersion. */
function setup({ installed = '2.14.0', running = '2.13.1' } = {}) {
  const home = makeDoctorHome();
  made.push(home);
  if (installed) makeInstalledPlugin(home, { version: installed });
  const { root } = makeDoctorProject({ home, git: false });
  made.push(root);
  const ctx = doctor.buildContext({ projectRoot: root, userHome: home, env: {}, now: NOW, pluginVersion: running });
  return { root, home, ctx };
}

function writeWorkflow(root, text) {
  const abs = path.join(root, '.github', 'workflows', 'aoforge.yml');
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, 'utf-8');
}

const unmanaged = (text) => text.split('\n').filter((l) => !/aoforge:managed/.test(l)).join('\n');

// ─── 12. stale ───────────────────────────────────────────────────────────────

describe('checks-workflow-pin: stale (test 12)', () => {
  test('12. a managed workflow at v2.13.1 with 2.14.0 installed -> warn, report-only, gh setup --apply', () => {
    const { root, ctx } = setup();
    writeWorkflow(root, renderTemplates({}, '2.13.1').workflow);
    const r = check.run(ctx);
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.fixable, false);
    assert.ok(r.finding.includes('v2.13.1'), r.finding);
    assert.ok(r.finding.includes('2.14.0'), r.finding);
    assert.ok(r.finding.includes('github.checks_workflow'), 'the finding warns that a configured @ref re-pins itself');
    assert.equal(r.finding.includes('\n'), false, 'one line');
    assert.equal(r.fix_command, FIX_COMMAND);
    assert.ok(r.details && r.details.pins, 'details.pins');
    assert.equal(r.details.pins.aoforge_ref, 'v2.13.1');
    assert.equal(r.details.installed, '2.14.0');
    assert.equal(r.details.version_source, 'installed-plugin', 'the installed plugin wins over ctx.pluginVersion');
    assert.equal(r.details.code, 'W062');
  });
});

// ─── 13. ok states ───────────────────────────────────────────────────────────

describe('checks-workflow-pin: ok states (test 13)', () => {
  const cases = {
    current: (root) => writeWorkflow(root, renderTemplates({}, '2.14.0').workflow),
    ahead: (root) => writeWorkflow(root, renderTemplates({}, '2.15.0').workflow),
    branch: (root) => writeWorkflow(root,
      renderTemplates({ checks_workflow: 'AO-Cyber-Systems/aoforge-claude/.github/workflows/aoforge-checks.yml@main' }, '2.14.0').workflow),
    unmanaged: (root) => writeWorkflow(root, unmanaged(renderTemplates({}, '2.13.1').workflow)),
    absent: () => {},
  };

  test('13. current, ahead, branch pin, unmanaged and absent -> ok, each with its own one-line finding', () => {
    const findings = {};
    for (const [name, arrange] of Object.entries(cases)) {
      const { root, ctx } = setup();
      arrange(root);
      const r = check.run(ctx);
      assert.equal(r.severity, 'ok', `${name}: ${r.finding}`);
      assert.equal(r.fixable, false, name);
      assert.equal(r.fix_command, undefined, `${name}: an ok result names no command`);
      assert.equal(typeof r.finding, 'string', name);
      assert.ok(r.finding.length > 0, name);
      assert.equal(r.finding.includes('\n'), false, `${name}: one line`);
      findings[name] = r.finding;
    }
    assert.equal(new Set(Object.values(findings)).size, Object.keys(findings).length, JSON.stringify(findings, null, 2));
    assert.match(findings.branch, /main/);
    assert.match(findings.branch, /not compared/);
    assert.match(findings.current, /v2\.14\.0/);
    assert.match(findings.ahead, /v2\.15\.0/);
    assert.match(findings.unmanaged, /not managed/);
  });

  test('no project -> ok', () => {
    const home = makeDoctorHome();
    made.push(home);
    const ctx = doctor.buildContext({ projectRoot: null, userHome: home, env: {}, now: NOW, pluginVersion: '2.14.0' });
    assert.equal(check.run(ctx).severity, 'ok');
  });

  test('an unreadable workflow path is a warning that says why, never a throw', () => {
    const { root, ctx } = setup();
    fs.mkdirSync(path.join(root, '.github', 'workflows', 'aoforge.yml'), { recursive: true });
    const r = check.run(ctx);
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, false);
    assert.match(r.finding, /could not be read/);
  });
});

// ─── 14. the comparison version ──────────────────────────────────────────────

describe('checks-workflow-pin: no installed plugin (test 14)', () => {
  test('14. no installed plugin registered -> ctx.pluginVersion is the comparison version', () => {
    const stale = setup({ installed: null, running: '2.14.0' });
    writeWorkflow(stale.root, renderTemplates({}, '2.13.1').workflow);
    const r = check.run(stale.ctx);
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.details.installed, '2.14.0');
    assert.equal(r.details.version_source, 'running-engine');

    const same = setup({ installed: null, running: '2.13.1' });
    writeWorkflow(same.root, renderTemplates({}, '2.13.1').workflow);
    assert.equal(check.run(same.ctx).severity, 'ok', 'pinned to the running version is current');
  });

  test('a running version that is not a release is not compared, and says so', () => {
    const { root, ctx } = setup({ installed: null, running: 'dev' });
    writeWorkflow(root, renderTemplates({}, '2.13.1').workflow);
    const r = check.run(ctx);
    assert.equal(r.severity, 'ok');
    assert.match(r.finding, /not compared/);
  });
});

// ─── 15. contract ────────────────────────────────────────────────────────────

describe('checks-workflow-pin: contract (test 15)', () => {
  test('15. a report-only project check with an id and a title', () => {
    assert.equal(check.id, 'checks-workflow-pin');
    assert.equal(check.scope, 'project');
    assert.equal(typeof check.title, 'string');
    assert.ok(check.title.trim().length > 0);
    assert.equal('fix' in check, false, 're-pinning needs gh setup --apply and a pull request: never a doctor fix');
    assert.deepEqual(doctor.contractIssues(check), []);
  });
});
