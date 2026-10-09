'use strict';

/**
 * Tests for validate health Check 17: a stale AOForge checks workflow pin, W062 (TRD 61-01, STOR-03).
 *
 * Check 17 only renders what checks-pin.collectPinFindings returns, so these tests prove the rendering and the version
 * it compares against: W062 is a warning that is never repairable, it fires only for a managed workflow pinned to a
 * release older than the installed plugin, and with no installed plugin the running engine version is used.
 *
 * Hermetic: a temp project and a temp homeDir per test, mainVersionFn stubbed (no git fetch), workflow text from the
 * real template through gh-setup's renderTemplates or written literally here.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { cmdValidateHealth } = require('./validate.cjs');
const { renderTemplates } = require('./gh-setup.cjs');
const { pluginVersion } = require('./helpers.cjs');

const INSTALLED = () => ({ version: '2.14.0', installPath: '/fake' });

let root = null;
let home = null;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-validate-pin-'));
  fs.mkdirSync(path.join(root, '.aoforge', 'objectives'), { recursive: true });
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-validate-pin-home-'));
});

afterEach(() => {
  for (const dir of [root, home]) if (dir) fs.rmSync(dir, { recursive: true, force: true });
  root = null;
  home = null;
});

function writeWorkflow(text) {
  const abs = path.join(root, '.github', 'workflows', 'aoforge.yml');
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, 'utf-8');
}

/** cmdValidateHealth ends in output(), which prints and exits: capture the JSON and swallow the exit. */
function runHealth({ installedPluginFn = INSTALLED } = {}) {
  const chunks = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { chunks.push(chunk); return true; };
  const origExit = process.exit.bind(process);
  process.exit = (code) => { throw new Error(`process.exit(${code})`); };
  try {
    cmdValidateHealth(root, { homeDir: home, mainVersionFn: () => null, installedPluginFn }, true);
  } catch (e) {
    if (!e.message.startsWith('process.exit')) throw e;
  } finally {
    process.stdout.write = origWrite;
    process.exit = origExit;
  }
  return JSON.parse(chunks[chunks.length - 1]);
}

const w062 = (json) => [...json.errors, ...json.warnings, ...json.info].filter((i) => i.code === 'W062');

describe('Check 17: W062 stale checks workflow pin', () => {
  test('9. a managed workflow rendered at 2.13.1, installed 2.14.0 -> one W062 warning, never repairable', () => {
    writeWorkflow(renderTemplates({}, '2.13.1').workflow);
    const json = runHealth();
    const found = w062(json);
    assert.equal(found.length, 1, JSON.stringify(found));
    assert.equal(json.warnings.filter((i) => i.code === 'W062').length, 1, 'reported as a warning, not an error or info');
    const [issue] = found;
    assert.equal(issue.repairable, false);
    assert.match(issue.message, /^checks-pin-stale: \.github\/workflows\/aoforge\.yml pins AOForge v2\.13\.1 /);
    assert.match(issue.message, /installed plugin 2\.14\.0$/);
    assert.ok(issue.fix.includes('aof-tools gh setup --apply'), issue.fix);
  });

  test('10. rendered at 2.14.0 -> no W062', () => {
    writeWorkflow(renderTemplates({}, '2.14.0').workflow);
    assert.deepEqual(w062(runHealth()), []);
  });

  test('10. no workflow file -> no W062', () => {
    assert.deepEqual(w062(runHealth()), []);
  });

  test('10. an unmanaged file at an old ref -> no W062', () => {
    const managed = renderTemplates({}, '2.13.1').workflow;
    writeWorkflow(managed.split('\n').filter((l) => !/aoforge:managed/.test(l)).join('\n'));
    assert.deepEqual(w062(runHealth()), []);
  });

  test('11. no installed plugin -> the running engine version is compared: a workflow at 0.0.1 gives W062', () => {
    const running = pluginVersion();
    assert.notEqual(running, '0.0.1');
    writeWorkflow(renderTemplates({}, '0.0.1').workflow);
    const found = w062(runHealth({ installedPluginFn: () => null }));
    assert.equal(found.length, 1, JSON.stringify(found));
    assert.match(found[0].message, /pins AOForge v0\.0\.1 /);
    assert.ok(found[0].message.endsWith(`installed plugin ${running.replace(/^v/, '')}`), found[0].message);
  });

  test('a check that cannot run is never silent: an unreadable workflow path is one W062 check-failed warning', () => {
    fs.mkdirSync(path.join(root, '.github', 'workflows', 'aoforge.yml'), { recursive: true });
    const found = w062(runHealth());
    assert.equal(found.length, 1, JSON.stringify(found));
    assert.match(found[0].message, /^checks-pin-check-failed: /);
    assert.equal(found[0].repairable, false);
  });
});
