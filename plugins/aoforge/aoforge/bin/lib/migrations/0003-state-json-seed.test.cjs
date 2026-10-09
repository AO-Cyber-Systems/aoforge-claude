'use strict';

// TRD 36-04a — migration 0003 state-json-seed (test list items 17-21).
//
// no_llm_test_data: projects come from the shared hand-built fixtures (upgrade-fixtures.cjs).
// Nothing touches the real ~/.claude.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const upgrade = require('../upgrade.cjs');
const fx = require('../__fixtures__/upgrade-fixtures.cjs');

const MIGRATION_PATH = path.join(__dirname, '0003-state-json-seed.cjs');
const STATE_JSON_REL = '.aoforge/state.json';

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function m0003() {
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

describe('migration 0003 state-json-seed', () => {
  test('17. contract: id 0003, safety auto, semver since; loadRegistry() (default dir) includes it', () => {
    const m = m0003();
    assert.equal(m.id, '0003');
    assert.equal(m.safety, 'auto');
    assert.match(m.since, /^\d+\.\d+\.\d+$/);
    assert.ok(typeof m.title === 'string' && m.title.trim().length > 0);
    assert.equal(typeof m.detect, 'function');
    assert.equal(typeof m.apply, 'function');
    assert.equal(typeof m.seedFromStateMd, 'function');

    const entry = upgrade.loadRegistry().find((r) => r.id === '0003');
    assert.ok(entry, 'registry includes 0003');
    assert.equal(entry.safety, 'auto');
  });

  test('18. v1 fixture -> detect applies; apply seeds state.json from STATE.md', () => {
    const m = m0003();
    const root = track(fx.makeV1Project());
    const ctx = ctxFor(root);

    const det = m.detect(ctx);
    assert.equal(det.applies, true);

    const res = m.apply(ctx);
    assert.deepEqual(res.changed, [STATE_JSON_REL]);
    const seeded = JSON.parse(fs.readFileSync(path.join(root, STATE_JSON_REL), 'utf-8'));
    assert.equal(seeded.current_objective, '01');
    assert.equal(seeded.status, 'In progress');
    assert.deepEqual(seeded.blockers, ['one']);
    assert.equal(seeded.current_job, 1);
    assert.equal(seeded.last_activity, '2026-01-15');

    // The exported extractor is the same one apply used.
    const fromMd = m.seedFromStateMd(fs.readFileSync(path.join(root, '.aoforge/STATE.md'), 'utf-8'));
    assert.equal(fromMd.current_objective, '01');
    assert.deepEqual(fromMd.blockers, ['one']);

    // Idempotent: once seeded, detect no longer applies.
    assert.equal(m.detect(ctx).applies, false);
  });

  test('19. state.json already present -> detect false', () => {
    const m = m0003();
    const root = track(fx.makeV1Project({ stateJson: true }));
    const det = m.detect(ctxFor(root));
    assert.equal(det.applies, false);
    assert.match(det.reason, /state\.json/);
  });

  test('20. no STATE.md -> detect false', () => {
    const m = m0003();
    const root = track(fx.makeV1Project());
    fs.rmSync(path.join(root, '.aoforge', 'STATE.md'));
    const det = m.detect(ctxFor(root));
    assert.equal(det.applies, false);
    assert.match(det.reason, /STATE\.md/);
  });

  test('21. dryRun writes nothing and still returns changed', () => {
    const m = m0003();
    const root = track(fx.makeV1Project());
    const before = fx.snapshot(root);
    const res = m.apply(ctxFor(root, { dryRun: true }));
    assert.deepEqual(res.changed, [STATE_JSON_REL]);
    assert.deepEqual(fx.diffSnapshots(before, fx.snapshot(root)), []);
    assert.equal(fs.existsSync(path.join(root, STATE_JSON_REL)), false);
  });
});
