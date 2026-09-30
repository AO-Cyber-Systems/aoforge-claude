'use strict';

/**
 * 11-12-install.test.cjs — TRD 45-05 task 2 (DOC-05): the plugin-cache and hooks-registry checks.
 *
 * Both are report-only. Every userHome is a doctor-fixtures temp home; the real-plugin regression
 * (test 11) works on a COPY of this repo's hooks/ and plugin.json in a temp dir.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const doctor = require('../doctor.cjs');
const {
  makeDoctorHome, makeInstalledPlugin, makePluginCacheDirs, makeMirror, copyRealRuntimeFiles,
  PLUGIN_ROOT,
} = require('../__fixtures__/doctor-fixtures.cjs');

const pluginCache = require('./11-plugin-cache.cjs');
const hooksRegistry = require('./12-hooks-registry.cjs');
const runtimeMirror = require('./10-runtime-mirror.cjs');

function ctxFor(home, env = {}) {
  return doctor.buildContext({ userHome: home, env: { ...env }, now: new Date('2026-09-30T12:00:00Z') });
}

function writeFile(root, rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  return full;
}

/** Recursive byte sum, independent of the check's own implementation. */
function bytesOf(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? bytesOf(p) : fs.statSync(p).size;
  }
  return total;
}

// ─── plugin-cache (test 9) ────────────────────────────────────────────────────

describe('11-plugin-cache check', () => {
  test('exports a report-only global check', () => {
    assert.equal(pluginCache.id, 'plugin-cache');
    assert.equal(pluginCache.scope, 'global');
    assert.equal(typeof pluginCache.run, 'function');
    assert.equal(pluginCache.fix, undefined);
  });

  test('9a. stale cache dirs are warned with byte sizes, never fixable, fix_command is an rm -rf line per dir', () => {
    const home = makeDoctorHome();
    makeInstalledPlugin(home, { version: '2.11.0' });
    const [d271, d2101, d2110] = makePluginCacheDirs(home, ['2.7.1', '2.10.1', '2.11.0']);
    writeFile(d271, 'devflow/payload.bin', 'x'.repeat(1000));
    writeFile(d2101, 'devflow/nested/payload.bin', 'y'.repeat(250));

    const r = pluginCache.run(ctxFor(home));
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, false);
    assert.ok(r.finding.includes('2.7.1'), r.finding);
    assert.ok(r.finding.includes('2.10.1'), r.finding);
    assert.ok(!r.finding.includes('2.11.0 ('), 'the installed dir must not be listed as stale: ' + r.finding);

    const stale = r.details.stale;
    assert.deepEqual(stale.map(s => s.version), ['2.7.1', '2.10.1']);
    assert.equal(stale[0].path, d271);
    assert.equal(stale[0].bytes, bytesOf(d271));
    assert.equal(stale[1].bytes, bytesOf(d2101));
    assert.ok(stale[0].bytes >= 1000);
    assert.ok(r.finding.includes(`${bytesOf(d271)} bytes`), r.finding);
    assert.equal(r.details.installed, '2.11.0');

    const lines = r.fix_command.split('\n');
    assert.ok(lines[0].includes('after quitting sessions that use them'), lines[0]);
    assert.ok(lines.includes(`rm -rf ${d271}`), r.fix_command);
    assert.ok(lines.includes(`rm -rf ${d2101}`), r.fix_command);
    assert.ok(!r.fix_command.includes(d2110), 'never suggests removing the installed dir');
  });

  test('9b. only the installed dir present is ok', () => {
    const home = makeDoctorHome();
    makeInstalledPlugin(home, { version: '2.11.0' });
    const r = pluginCache.run(ctxFor(home));
    assert.equal(r.severity, 'ok', r.finding);
    assert.equal(r.fixable, false);
    assert.equal(r.fix_command, undefined);
  });

  test('9c. no cache root at all is ok', () => {
    const home = makeDoctorHome();
    const r = pluginCache.run(ctxFor(home));
    assert.equal(r.severity, 'ok', r.finding);
  });

  test('9d. cache dirs but no installed registry entry: warns without advising any rm', () => {
    const home = makeDoctorHome();
    makePluginCacheDirs(home, ['2.7.1', '2.10.1']);
    const r = pluginCache.run(ctxFor(home));
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, false);
    assert.match(r.finding, /no installed/i);
    assert.equal(r.fix_command, undefined);
  });

  test('9e. plain files next to the version dirs are not treated as cache dirs', () => {
    const home = makeDoctorHome();
    const { installPath } = makeInstalledPlugin(home, { version: '2.11.0' });
    writeFile(path.dirname(installPath), 'README.txt', 'not a version dir');
    const r = pluginCache.run(ctxFor(home));
    assert.equal(r.severity, 'ok', r.finding);
  });
});

// ─── hooks-registry (tests 10, 11) ────────────────────────────────────────────

function hooksJson(commandFiles) {
  return JSON.stringify({
    hooks: {
      SessionStart: [
        { hooks: commandFiles.slice(0, 1).map(f => ({ type: 'command', command: `node \${CLAUDE_PLUGIN_ROOT}/hooks/${f}` })) },
      ],
      PreToolUse: [
        { matcher: 'Bash', hooks: commandFiles.slice(1).map(f => ({ type: 'command', command: `node \${CLAUDE_PLUGIN_ROOT}/hooks/${f}` })) },
      ],
    },
  }, null, 2);
}

function pluginJson({ statusLine } = {}) {
  const base = { name: 'devflow', version: '2.11.0' };
  if (statusLine) base.statusLine = { type: 'command', command: `node \${CLAUDE_PLUGIN_ROOT}/hooks/${statusLine}` };
  return JSON.stringify(base, null, 2);
}

function installWith(files) {
  const home = makeDoctorHome();
  const { installPath } = makeInstalledPlugin(home, { version: '2.11.0', files });
  return { home, installPath };
}

describe('12-hooks-registry check', () => {
  test('exports a report-only global check', () => {
    assert.equal(hooksRegistry.id, 'hooks-registry');
    assert.equal(hooksRegistry.scope, 'global');
    assert.equal(typeof hooksRegistry.run, 'function');
    assert.equal(hooksRegistry.fix, undefined);
  });

  test('10a. a registered hook whose file is missing warns and names it', () => {
    const { home } = installWith({
      'hooks/hooks.json': hooksJson(['a.js', 'b.js']),
      'hooks/a.js': '// hook a\n',
    });
    const r = hooksRegistry.run(ctxFor(home));
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, false);
    assert.ok(r.finding.includes('hooks/b.js'), r.finding);
    assert.ok(!r.finding.includes('hooks/a.js'), r.finding);
    assert.deepEqual(r.details.missing, ['hooks/b.js']);
  });

  test('10b. an unregistered hook without a DRAFT header warns and names it', () => {
    const { home } = installWith({
      'hooks/hooks.json': hooksJson(['a.js']),
      'hooks/a.js': '// hook a\n',
      'hooks/c.js': '// a real hook nobody registered\n',
    });
    const r = hooksRegistry.run(ctxFor(home));
    assert.equal(r.severity, 'warn');
    assert.ok(r.finding.includes('hooks/c.js'), r.finding);
    assert.deepEqual(r.details.unregistered, ['hooks/c.js']);
  });

  test('10c. an unregistered DRAFT hook, *.test.js and hooks/lib/*.js are all ignored: ok', () => {
    const { home } = installWith({
      'hooks/hooks.json': hooksJson(['a.js']),
      'hooks/a.js': '// hook a\n',
      'hooks/d.js': '// DRAFT: v1.1 coordination-layer work, intentionally unregistered\n',
      'hooks/x.test.js': '// test for a\n',
      'hooks/lib/helper.js': '// helper, not a hook\n',
    });
    const r = hooksRegistry.run(ctxFor(home));
    assert.equal(r.severity, 'ok', r.finding);
    assert.equal(r.fixable, false);
    assert.deepEqual(r.details.registered, ['hooks/a.js']);
    assert.deepEqual(r.details.drafts, ['hooks/d.js']);
  });

  test('10d. a DRAFT marker deeper than the first 40 lines does not count', () => {
    const body = '// filler\n'.repeat(45) + '// DRAFT way too late\n';
    const { home } = installWith({
      'hooks/hooks.json': hooksJson(['a.js']),
      'hooks/a.js': '// hook a\n',
      'hooks/e.js': body,
    });
    const r = hooksRegistry.run(ctxFor(home));
    assert.equal(r.severity, 'warn');
    assert.ok(r.finding.includes('hooks/e.js'), r.finding);
  });

  test('10e. a statusLine pointing at a missing file warns; an existing one is ok', () => {
    const missing = installWith({
      '.claude-plugin/plugin.json': pluginJson({ statusLine: 'statusline.js' }),
      'hooks/hooks.json': hooksJson(['a.js']),
      'hooks/a.js': '// hook a\n',
    });
    const bad = hooksRegistry.run(ctxFor(missing.home));
    assert.equal(bad.severity, 'warn');
    assert.ok(bad.finding.includes('hooks/statusline.js'), bad.finding);
    assert.ok(bad.finding.toLowerCase().includes('statusline'), bad.finding);

    const present = installWith({
      '.claude-plugin/plugin.json': pluginJson({ statusLine: 'statusline.js' }),
      'hooks/hooks.json': hooksJson(['a.js']),
      'hooks/a.js': '// hook a\n',
      'hooks/statusline.js': '// statusline\n',
    });
    const good = hooksRegistry.run(ctxFor(present.home));
    assert.equal(good.severity, 'ok', good.finding);
    assert.ok(good.details.registered.includes('hooks/statusline.js'));
  });

  test('10f. a statusline-only hook file is registered through plugin.json, not "unregistered"', () => {
    const { home } = installWith({
      '.claude-plugin/plugin.json': pluginJson({ statusLine: 'statusline.js' }),
      'hooks/hooks.json': hooksJson(['a.js']),
      'hooks/a.js': '// hook a\n',
      'hooks/statusline.js': '// statusline\n',
    });
    const r = hooksRegistry.run(ctxFor(home));
    assert.deepEqual(r.details.unregistered, []);
  });

  test('10g. no installed plugin and no override warns "no installed plugin to check"', () => {
    const home = makeDoctorHome();
    const r = hooksRegistry.run(ctxFor(home));
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, false);
    assert.match(r.finding, /no installed plugin to check/);
  });

  test('10h. DEVFLOW_DOCTOR_PLUGIN_ROOT is used when no plugin is registered', () => {
    const home = makeDoctorHome();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-hooks-root-'));
    writeFile(root, 'hooks/hooks.json', hooksJson(['a.js']));
    writeFile(root, 'hooks/a.js', '// hook a\n');
    const r = hooksRegistry.run(ctxFor(home, { DEVFLOW_DOCTOR_PLUGIN_ROOT: root }));
    assert.equal(r.severity, 'ok', r.finding);
  });

  test('10i. missing or unparseable hooks.json warns instead of throwing', () => {
    const missing = installWith({ 'hooks/a.js': '// hook a\n' });
    fs.rmSync(path.join(missing.installPath, 'hooks', 'hooks.json'));
    const r1 = hooksRegistry.run(ctxFor(missing.home));
    assert.equal(r1.severity, 'warn');
    assert.match(r1.finding, /hooks\.json/);

    const garbage = installWith({ 'hooks/hooks.json': '{ not json' });
    const r2 = hooksRegistry.run(ctxFor(garbage.home));
    assert.equal(r2.severity, 'warn');
    assert.match(r2.finding, /hooks\.json/);
  });

  test('11. the SHIPPED plugin hooks/ + plugin.json are consistent (regression guard)', () => {
    const home = makeDoctorHome();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-real-plugin-'));
    fs.cpSync(path.join(PLUGIN_ROOT, 'hooks'), path.join(root, 'hooks'), { recursive: true });
    fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
    fs.copyFileSync(
      path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'),
      path.join(root, '.claude-plugin', 'plugin.json'),
    );
    const r = hooksRegistry.run(ctxFor(home, { DEVFLOW_DOCTOR_PLUGIN_ROOT: root }));
    assert.equal(r.severity, 'ok', r.finding);
    assert.ok(r.details.registered.includes('hooks/sync-runtime.js'));
    assert.ok(r.details.registered.includes('hooks/statusline.js'), 'the plugin.json statusLine counts as registered');
  });
});

// ─── TRD verification scenario across checks 10 + 11 ─────────────────────────

describe('verification scenario: mirror 2.10.1 / installed 2.11.0 / caches 2.7.1 + 2.10.1', () => {
  test('runtime-mirror is error+fixable, plugin-cache warns; after --fix runtime-mirror is ok', () => {
    const home = makeDoctorHome();
    const { installPath } = makeInstalledPlugin(home, { version: '2.11.0' });
    copyRealRuntimeFiles(installPath, ['hooks/sync-runtime.js', 'devflow/bin/lib/runtime-digest.cjs']);
    makePluginCacheDirs(home, ['2.7.1', '2.10.1']);
    makeMirror(home, { version: '2.10.1' });

    const env = { DEVFLOW_SKIP_GLOBAL_UPGRADE: '1' };
    const before = doctor.runDoctor({ userHome: home, env, scope: 'global', checks: [runtimeMirror, pluginCache] });
    const byId = Object.fromEntries(before.checks.map(c => [c.id, c]));
    assert.equal(byId['runtime-mirror'].severity, 'error');
    assert.equal(byId['runtime-mirror'].fixable, true);
    assert.equal(byId['plugin-cache'].severity, 'warn');
    assert.equal(byId['plugin-cache'].fixable, false);

    const after = doctor.runDoctor({ userHome: home, env, scope: 'global', fix: true, checks: [runtimeMirror, pluginCache] });
    const byIdAfter = Object.fromEntries(after.checks.map(c => [c.id, c]));
    assert.equal(byIdAfter['runtime-mirror'].severity, 'ok', byIdAfter['runtime-mirror'].finding);
    assert.equal(byIdAfter['plugin-cache'].severity, 'warn', 'stale caches are never removed by --fix');
    assert.deepEqual(after.fixes.map(f => f.id), ['runtime-mirror']);
  });
});
