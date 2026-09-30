'use strict';

/**
 * 10-runtime-mirror.test.cjs — TRD 45-05 task 1 (DOC-05): the runtime-mirror doctor check.
 *
 * Every userHome is a doctor-fixtures temp home; the fix spawns the REAL sync-runtime.js copied
 * into the fixture install, with HOME pointed at that temp home. A read-only snapshot of the real
 * `~/.claude/devflow` markers is taken around the fix and must not change (nothing may leak there).
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const doctor = require('../doctor.cjs');
const { digestTree } = require('../runtime-digest.cjs');
const {
  makeDoctorHome, makeInstalledPlugin, copyRealRuntimeFiles, makeMirror,
} = require('../__fixtures__/doctor-fixtures.cjs');

const check = require('./10-runtime-mirror.cjs');

const RUNTIME_FILES = ['hooks/sync-runtime.js', 'devflow/bin/lib/runtime-digest.cjs'];
const ENV = { DEVFLOW_SKIP_GLOBAL_UPGRADE: '1' };
const SUBDIRS = ['workflows', 'references', 'templates', 'bin', 'schemas', 'stack-profiles'];

function ctxFor(home) {
  return doctor.buildContext({ userHome: home, env: { ...ENV }, now: new Date('2026-09-30T12:00:00Z') });
}

/** Copy every mirrored subdir of `<installPath>/devflow` into the mirror (same bytes => same digest). */
function copyInstallIntoMirror(installPath, mirrorDir) {
  for (const sub of SUBDIRS) {
    const src = path.join(installPath, 'devflow', sub);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(mirrorDir, sub), { recursive: true });
  }
}

/** A home with installed `installedVer` (real sync-runtime + digest module) and a mirror at `mirrorVer`. */
function scenario({ installedVer = '2.11.0', mirrorVer = '2.10.1', identical = false } = {}) {
  const home = makeDoctorHome();
  const { installPath } = makeInstalledPlugin(home, { version: installedVer });
  copyRealRuntimeFiles(installPath, RUNTIME_FILES);
  let mirrorDir = path.join(home, '.claude', 'devflow');
  if (mirrorVer) {
    ({ mirrorDir } = makeMirror(home, { version: mirrorVer }));
    if (identical) copyInstallIntoMirror(installPath, mirrorDir);
  }
  return { home, installPath, mirrorDir };
}

/** Snapshot of the REAL home's mirror markers (read-only) to prove the fix never leaks there. */
function realMirrorSnapshot() {
  const dir = path.join(os.homedir(), '.claude', 'devflow');
  const snap = {};
  for (const name of ['.plugin-version', '.plugin-digest']) {
    const p = path.join(dir, name);
    try {
      snap[name] = { content: fs.readFileSync(p, 'utf-8'), mtimeMs: fs.statSync(p).mtimeMs };
    } catch {
      snap[name] = null;
    }
  }
  return snap;
}

describe('10-runtime-mirror check', () => {
  test('exports a global check with a fix', () => {
    assert.equal(check.id, 'runtime-mirror');
    assert.equal(check.scope, 'global');
    assert.equal(typeof check.title, 'string');
    assert.equal(typeof check.run, 'function');
    assert.equal(typeof check.fix, 'function');
  });

  test('1. mirror 2.10.1 behind installed 2.11.0 is an error naming both versions, fixable', () => {
    const { home } = scenario({ installedVer: '2.11.0', mirrorVer: '2.10.1' });
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'error');
    assert.ok(r.finding.includes('2.10.1'), r.finding);
    assert.ok(r.finding.includes('2.11.0'), r.finding);
    assert.equal(r.fixable, true);
    assert.equal(r.details.installed, '2.11.0');
    assert.equal(r.details.mirror, '2.10.1');
  });

  test('2. same version and identical content is ok; details carry both digests', () => {
    const { home, installPath, mirrorDir } = scenario({ installedVer: '2.11.0', mirrorVer: '2.11.0', identical: true });
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'ok', r.finding);
    assert.equal(r.fixable, false);
    assert.equal(r.details.installed_digest, digestTree(path.join(installPath, 'devflow')));
    assert.equal(r.details.mirror_digest, digestTree(mirrorDir));
    assert.equal(r.details.installed_digest, r.details.mirror_digest);
    assert.equal(r.details.installPath, installPath);
    assert.ok('marker_digest' in r.details);
  });

  test('3. same version with one drifted mirror file is a content-drift error, fixable', () => {
    const { home, mirrorDir } = scenario({ installedVer: '2.11.0', mirrorVer: '2.11.0', identical: true });
    fs.writeFileSync(path.join(mirrorDir, 'workflows', 'a.md'), '# Workflow A\n\nlocally edited\n', 'utf-8');
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'error');
    assert.match(r.finding, /content drift/);
    assert.equal(r.fixable, true);
    assert.notEqual(r.details.installed_digest, r.details.mirror_digest);
  });

  test('4. mirror 2.12.0 ahead of installed 2.11.0 warns (dev checkout?) and is not fixable', () => {
    const { home } = scenario({ installedVer: '2.11.0', mirrorVer: '2.12.0' });
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'warn');
    assert.match(r.finding, /mirror ahead \(dev checkout\?\)/);
    assert.equal(r.fixable, false);
    assert.ok(r.fix_command.includes('/plugin update devflow@aocyber'), r.fix_command);
  });

  test('5a. no installed_plugins.json entry warns and is not fixable', () => {
    const home = makeDoctorHome();
    makeMirror(home, { version: '2.11.0' });
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, false);
    assert.match(r.finding, /no installed/i);
  });

  test('5b. no mirror at all is an error, fixable when an installed plugin exists', () => {
    const { home, mirrorDir } = scenario({ installedVer: '2.11.0', mirrorVer: null });
    assert.equal(fs.existsSync(path.join(mirrorDir, '.plugin-version')), false);
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'error');
    assert.equal(r.fixable, true);
    assert.match(r.finding, /mirror/i);
  });

  test('5c. no mirror dir at all (dir removed) is still an error, fixable', () => {
    const { home, mirrorDir } = scenario({ installedVer: '2.11.0', mirrorVer: null });
    fs.rmSync(mirrorDir, { recursive: true, force: true });
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'error');
    assert.equal(r.fixable, true);
  });

  test('5d. an installed plugin without sync-runtime.js is not fixable (a fix could never run)', () => {
    const home = makeDoctorHome();
    makeInstalledPlugin(home, { version: '2.11.0' }); // no copyRealRuntimeFiles
    makeMirror(home, { version: '2.10.1' });
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'error');
    assert.equal(r.fixable, false);
    assert.ok(r.fix_command.includes('/plugin update devflow@aocyber'), r.fix_command);
  });

  test('6. fix on a stale mirror re-mirrors via sync-runtime under the fake HOME; re-run is ok', () => {
    const { home, installPath, mirrorDir } = scenario({ installedVer: '2.11.0', mirrorVer: '2.10.1' });
    const before = realMirrorSnapshot();
    const ctx = ctxFor(home);
    const result = check.run(ctx);
    assert.equal(result.fixable, true);

    const out = check.fix(ctx, result);
    assert.equal(out.applied, true, JSON.stringify(out));
    assert.deepEqual(out.changed, ['~/.claude/devflow']);

    assert.equal(fs.readFileSync(path.join(mirrorDir, '.plugin-version'), 'utf-8').trim(), '2.11.0');
    assert.equal(digestTree(mirrorDir), digestTree(path.join(installPath, 'devflow')));

    const again = check.run(ctxFor(home));
    assert.equal(again.severity, 'ok', again.finding);

    assert.deepEqual(realMirrorSnapshot(), before, 'the fix must never touch the real ~/.claude/devflow');
  });

  test('6b. runs end to end through runDoctor({fix:true}) and ends ok', () => {
    const { home } = scenario({ installedVer: '2.11.0', mirrorVer: '2.10.1' });
    const report = doctor.runDoctor({
      userHome: home, env: { ...ENV }, scope: 'global', fix: true, checks: [check],
    });
    assert.equal(report.fixes.length, 1);
    assert.equal(report.fixes[0].id, 'runtime-mirror');
    assert.equal(report.fixes[0].applied, true);
    assert.equal(report.checks[0].severity, 'ok', report.checks[0].finding);
  });

  test('7. fix on same-version content drift also resolves it', () => {
    const { home, installPath, mirrorDir } = scenario({ installedVer: '2.11.0', mirrorVer: '2.11.0', identical: true });
    fs.writeFileSync(path.join(mirrorDir, 'workflows', 'a.md'), 'drifted\n', 'utf-8');
    const ctx = ctxFor(home);
    const result = check.run(ctx);
    assert.equal(result.severity, 'error');
    const out = check.fix(ctx, result);
    assert.equal(out.applied, true, JSON.stringify(out));
    assert.equal(digestTree(mirrorDir), digestTree(path.join(installPath, 'devflow')));
    assert.equal(check.run(ctxFor(home)).severity, 'ok');
  });

  test('7b. fix when no mirror exists creates one', () => {
    const { home, installPath, mirrorDir } = scenario({ installedVer: '2.11.0', mirrorVer: null });
    const ctx = ctxFor(home);
    const out = check.fix(ctx, check.run(ctx));
    assert.equal(out.applied, true, JSON.stringify(out));
    assert.equal(fs.readFileSync(path.join(mirrorDir, '.plugin-version'), 'utf-8').trim(), '2.11.0');
    assert.equal(digestTree(mirrorDir), digestTree(path.join(installPath, 'devflow')));
  });

  test('8. a mirror ahead of installed is never fixed: fixable false, direct fix() refuses and changes nothing', () => {
    const { home, mirrorDir } = scenario({ installedVer: '2.11.0', mirrorVer: '2.12.0' });
    const ctx = ctxFor(home);
    const result = check.run(ctx);
    assert.equal(result.fixable, false);

    const out = check.fix(ctx, result);
    assert.equal(out.applied, false);
    assert.equal(typeof out.refused, 'string');
    assert.ok(out.refused.length > 0);
    assert.equal(fs.readFileSync(path.join(mirrorDir, '.plugin-version'), 'utf-8').trim(), '2.12.0');
  });

  test('8b. a fix that cannot converge reports applied:false with the reason', () => {
    // Installed plugin whose sync-runtime.js exits 0 without mirroring anything.
    const home = makeDoctorHome();
    const { installPath } = makeInstalledPlugin(home, {
      version: '2.11.0',
      files: { 'hooks/sync-runtime.js': "process.stderr.write('boom: nothing mirrored\\n');\n" },
    });
    assert.ok(fs.existsSync(path.join(installPath, 'hooks', 'sync-runtime.js')));
    makeMirror(home, { version: '2.10.1' });
    const ctx = ctxFor(home);
    const result = check.run(ctx);
    assert.equal(result.fixable, true);
    const out = check.fix(ctx, result);
    assert.equal(out.applied, false);
    assert.match(out.refused, /sync-runtime did not converge/);
    assert.match(out.refused, /boom/);
  });
});
