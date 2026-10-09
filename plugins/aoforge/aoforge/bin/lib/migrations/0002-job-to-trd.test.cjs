'use strict';

// TRD 36-04a — migration 0002 job-to-trd (test list items 11-16).
//
// no_llm_test_data: projects come from the shared hand-built fixtures (upgrade-fixtures.cjs) plus a
// few literal files written below. Nothing touches the real ~/.claude.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const upgrade = require('../upgrade.cjs');
const fx = require('../__fixtures__/upgrade-fixtures.cjs');

const MIGRATION_PATH = path.join(__dirname, '0002-job-to-trd.cjs');
const STATE_REL = '.aoforge/STATE.md';
const ALPHA_JOB = '.aoforge/objectives/01-alpha/01-01-JOB.md';
const ALPHA_TRD = '.aoforge/objectives/01-alpha/01-01-TRD.md';
const BETA_JOB = '.aoforge/objectives/02-beta/02-01-JOB.md';
const BETA_TRD = '.aoforge/objectives/02-beta/02-01-TRD.md';
const LOG_LINE_RE = /^- (\d{4}-\d{2}-\d{2}): Migrated (\d+) JOB\.md file\(s\) to TRD\.md \(AOForge upgrade, migration 0002\)$/;

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function m0002() {
  return require(MIGRATION_PATH);
}

function track(dir) {
  cleanup.push(dir);
  return dir;
}

function ctxFor(root, { dryRun = false } = {}) {
  const home = track(fx.makeFakeHome());
  return { projectRoot: root, userHome: home, pluginVersion: '2.11.0', dryRun, options: {} };
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf-8');
}

function write(root, rel, content) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content, 'utf-8');
}

function today() {
  return new Date().toISOString().split('T')[0];
}

describe('migration 0002 job-to-trd', () => {
  test('11. contract: id 0002, safety auto, semver since; loadRegistry() (default dir) includes it', () => {
    const m = m0002();
    assert.equal(m.id, '0002');
    assert.equal(m.safety, 'auto');
    assert.match(m.since, /^\d+\.\d+\.\d+$/);
    assert.ok(typeof m.title === 'string' && m.title.trim().length > 0);
    assert.equal(typeof m.detect, 'function');
    assert.equal(typeof m.apply, 'function');
    assert.equal(typeof m.findLegacyJobFiles, 'function');

    const entry = upgrade.loadRegistry().find((r) => r.id === '0002');
    assert.ok(entry, 'registry includes 0002');
    assert.equal(entry.safety, 'auto');
  });

  test('12. v1 fixture -> detect counts 2; apply renames both JOB files and lists old + new paths', () => {
    const m = m0002();
    const root = track(fx.makeV1Project());
    const ctx = ctxFor(root);
    const alphaBody = read(root, ALPHA_JOB);

    const det = m.detect(ctx);
    assert.equal(det.applies, true);
    assert.match(det.reason, /\b2\b/);

    const res = m.apply(ctx);
    assert.deepEqual([...res.changed].sort(), [ALPHA_JOB, ALPHA_TRD, BETA_JOB, BETA_TRD, STATE_REL].sort());
    assert.equal(exists(root, ALPHA_JOB), false);
    assert.equal(exists(root, BETA_JOB), false);
    assert.equal(read(root, ALPHA_TRD), alphaBody, 'renamed, content untouched');
    assert.equal(exists(root, BETA_TRD), true);

    // A bare JOB.md becomes TRD.md.
    const bare = track(fx.makeV1Project({ jobFiles: false }));
    write(bare, '.aoforge/objectives/03-gamma/JOB.md', '# JOB 03: bare\n');
    const bareRes = m.apply(ctxFor(bare));
    assert.ok(bareRes.changed.includes('.aoforge/objectives/03-gamma/TRD.md'));
    assert.equal(read(bare, '.aoforge/objectives/03-gamma/TRD.md'), '# JOB 03: bare\n');
    assert.equal(exists(bare, '.aoforge/objectives/03-gamma/JOB.md'), false);
  });

  test('13. STATE.md gains exactly one Session Log line and nothing else changes', () => {
    const m = m0002();
    const root = track(fx.makeV1Project());
    const before = read(root, STATE_REL);
    const dayBefore = today();
    m.apply(ctxFor(root));
    const dayAfter = today();
    const after = read(root, STATE_REL);

    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
    assert.equal(afterLines.length, beforeLines.length + 1);
    const logIdx = afterLines.indexOf('## Session Log');
    const inserted = afterLines[logIdx + 1];
    const match = LOG_LINE_RE.exec(inserted);
    assert.ok(match, `line after the Session Log heading is the migration note: ${inserted}`);
    assert.equal(match[2], '2');
    assert.ok(match[1] === dayBefore || match[1] === dayAfter, `dated today (${match[1]})`);
    // Removing the inserted line gives back the original bytes: Status and every other field kept.
    const restored = [...afterLines.slice(0, logIdx + 1), ...afterLines.slice(logIdx + 2)].join('\n');
    assert.equal(restored, before);
    assert.match(after, /\*\*Status:\*\* In progress/);

    // No `## Session Log` section -> STATE.md is not written and not listed.
    const noLog = track(fx.makeV1Project());
    const stateNoLog = '# Project State\n\n**Status:** In progress\n';
    write(noLog, STATE_REL, stateNoLog);
    const res = m.apply(ctxFor(noLog));
    assert.equal(read(noLog, STATE_REL), stateNoLog);
    assert.equal(res.changed.includes(STATE_REL), false);
    assert.equal(exists(noLog, ALPHA_TRD), true);
  });

  test('14. a JOB whose TRD already exists is left alone and ignored by detect', () => {
    const m = m0002();

    // Only conflict: nothing applies, and the reason names the conflict.
    const only = track(fx.makeV1Project({ jobFiles: false }));
    const trdBody = read(only, ALPHA_TRD);
    write(only, ALPHA_JOB, '# stale JOB copy\n');
    const det = m.detect(ctxFor(only));
    assert.equal(det.applies, false);
    assert.match(det.reason, /01-01-JOB\.md/);
    assert.match(det.reason, /TRD/);
    assert.deepEqual(
      m.findLegacyJobFiles(only).map((f) => ({ from: f.from, to: f.to, conflict: f.conflict })),
      [{ from: ALPHA_JOB, to: ALPHA_TRD, conflict: true }],
    );

    // Mixed: the conflicting JOB is skipped, the other one is renamed.
    const mixed = track(fx.makeV1Project());
    write(mixed, ALPHA_TRD, '# the real TRD\n');
    const jobBody = read(mixed, ALPHA_JOB);
    const mixedDet = m.detect(ctxFor(mixed));
    assert.equal(mixedDet.applies, true);
    assert.match(mixedDet.reason, /\b1\b/);
    const res = m.apply(ctxFor(mixed));
    assert.equal(read(mixed, ALPHA_JOB), jobBody, 'conflicting JOB not renamed, not deleted');
    assert.equal(read(mixed, ALPHA_TRD), '# the real TRD\n', 'existing TRD untouched');
    assert.equal(exists(mixed, BETA_TRD), true);
    assert.equal(res.changed.includes(ALPHA_JOB), false);
    assert.match(read(mixed, STATE_REL), /Migrated 1 JOB\.md file\(s\)/);
    assert.equal(m.detect(ctxFor(mixed)).applies, false);
    assert.equal(read(only, ALPHA_TRD), trdBody);
  });

  test('15. dryRun renames nothing and still returns changed', () => {
    const m = m0002();
    const root = track(fx.makeV1Project());
    const before = fx.snapshot(root);
    const res = m.apply(ctxFor(root, { dryRun: true }));
    assert.ok(res.changed.includes(ALPHA_TRD));
    assert.ok(res.changed.includes(BETA_JOB));
    assert.deepEqual(fx.diffSnapshots(before, fx.snapshot(root)), []);
  });

  test('16. second apply is a no-op: detect false after the first apply', () => {
    const m = m0002();
    const root = track(fx.makeV1Project());
    const ctx = ctxFor(root);
    m.apply(ctx);
    const snap = fx.snapshot(root);
    const det = m.detect(ctx);
    assert.equal(det.applies, false);
    assert.deepEqual(m.findLegacyJobFiles(root), []);
    assert.deepEqual(fx.diffSnapshots(snap, fx.snapshot(root)), []);
  });
});
