'use strict';

// Tests for doctor check 24-store-cache-tracked (TRD 48-10 test 15, GWP-04).
//
// no_llm_test_data: every project is a hand-built fixture under the OS temp dir (doctor-fixtures /
// upgrade-fixtures: local git identity, signing off, fake HOME). The check only reads; nothing here runs against
// this repository, the real ~/.claude, GitHub, the network or any port.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const check = require('./24-store-cache-tracked.cjs');
const doctor = require('../doctor.cjs');
const { makeDoctorProject, makeDoctorHome } = require('../__fixtures__/doctor-fixtures.cjs');
const { gitEnv, initGitFixture } = require('../__fixtures__/upgrade-fixtures.cjs');

const NOW = new Date('2026-10-01T12:00:00.000Z');
const FIX_COMMAND = 'aof-tools upgrade --apply --only 0010 --confirm';
const BLOCK = '# >>> aoforge store (0010) >>>\n.planning/*\n!.planning/config.json\n!.planning/STACK.md\n# <<< aoforge store (0010) <<<\n';

function ctxFor(root, home) {
  return doctor.buildContext({ projectRoot: root, userHome: home, env: gitEnv(home), now: NOW });
}

function setStore(root, store) {
  const file = path.join(root, '.planning', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(file, 'utf-8'));
  cfg.github = { enabled: true, store, repo: 'acme/widgets' };
  fs.writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`, 'utf-8');
}

function trackedPlanning(root, home) {
  return execFileSync('git', ['-C', root, 'ls-files', '--', '.planning'], { env: gitEnv(home), encoding: 'utf-8' })
    .split('\n').filter(Boolean);
}

describe('store-cache-tracked: contract', () => {
  test('a project check in the 20-29 range, report-only (no fix)', () => {
    assert.equal(check.id, 'store-cache-tracked');
    assert.equal(check.scope, 'project');
    assert.equal(typeof check.title, 'string');
    assert.equal(typeof check.run, 'function');
    assert.equal(check.fix, undefined, 'never fixable by doctor --fix');
    assert.deepEqual(doctor.contractIssues(check), []);
  });
});

describe('store-cache-tracked: test 15', () => {
  test('15a. store mode + 0010 applicable → warn, exact fix_command, fixable false; nothing changes', () => {
    const { root, home } = makeDoctorProject();
    setStore(root, true);
    const before = trackedPlanning(root, home);
    assert.ok(before.length > 1, 'precondition: the fixture tracks several .planning/ files');

    const r = check.run(ctxFor(root, home));
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, false);
    assert.equal(r.fix_command, FIX_COMMAND);
    assert.match(r.finding, new RegExp(`^store mode is on but ${before.length - 1} \\.planning/ path\\(s\\) are still tracked`));
    assert.deepEqual(trackedPlanning(root, home), before, 'run() is read-only');

    const report = doctor.runDoctor({ projectRoot: root, userHome: home, env: gitEnv(home), now: NOW, checks: [check] });
    assert.equal(report.checks[0].id, 'store-cache-tracked');
    assert.equal(report.checks[0].severity, 'warn');
    assert.equal(report.checks[0].fixable, false);
    assert.equal(report.checks[0].fix_command, FIX_COMMAND);
  });

  test('15b. local mode (store off, or no github block) → ok', () => {
    const { root, home } = makeDoctorProject();
    assert.equal(check.run(ctxFor(root, home)).severity, 'ok');
    setStore(root, false);
    const r = check.run(ctxFor(root, home));
    assert.equal(r.severity, 'ok');
    assert.equal(r.fixable, false);
  });

  test('15c. no project / no .planning / not a git repo → ok', () => {
    const home = makeDoctorHome();
    const none = doctor.buildContext({ projectRoot: null, userHome: home, env: gitEnv(home), now: NOW });
    assert.equal(check.run(none).severity, 'ok');

    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'df-doctor-24-'));
    fs.writeFileSync(path.join(bare, 'README.md'), '# x\n');
    initGitFixture(bare, home);
    assert.equal(check.run(ctxFor(bare, home)).severity, 'ok');

    const { root } = makeDoctorProject({ home, git: false });
    setStore(root, true);
    assert.equal(check.run(ctxFor(root, home)).severity, 'ok');
  });

  test('15d. store mode with only config.json tracked and the block current → ok', () => {
    const home = makeDoctorHome();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-doctor-24-'));
    fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(root, '.planning', 'config.json'), '{"github":{"enabled":true,"store":true}}\n');
    fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'), '# Roadmap (ignored cache)\n');
    fs.writeFileSync(path.join(root, '.gitignore'), BLOCK);
    initGitFixture(root, home);
    assert.deepEqual(trackedPlanning(root, home), ['.planning/config.json']);

    const r = check.run(ctxFor(root, home));
    assert.equal(r.severity, 'ok', r.finding);
  });

  test('15e. store mode, nothing extra tracked but the block missing → warn naming the block', () => {
    const home = makeDoctorHome();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-doctor-24-'));
    fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(root, '.planning', 'config.json'), '{"github":{"enabled":true,"store":true}}\n');
    initGitFixture(root, home);

    const r = check.run(ctxFor(root, home));
    assert.equal(r.severity, 'warn');
    assert.match(r.finding, /\.gitignore block/);
    assert.equal(r.fix_command, FIX_COMMAND);
  });
});
