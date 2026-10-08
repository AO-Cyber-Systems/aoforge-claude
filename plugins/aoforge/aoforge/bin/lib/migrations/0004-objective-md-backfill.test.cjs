'use strict';

// TRD 36-04b — migration 0004 objective-md-backfill (test list items 4-8).
//
// no_llm_test_data: projects come from the shared hand-built fixtures (upgrade-fixtures.cjs).
// Nothing touches the real ~/.claude.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const upgrade = require('../upgrade.cjs');
const fx = require('../__fixtures__/upgrade-fixtures.cjs');
const { extractFrontmatter } = require('../frontmatter.cjs');

const MIGRATION_PATH = path.join(__dirname, '0004-objective-md-backfill.cjs');
const BETA_REL = '.planning/objectives/02-beta/OBJECTIVE.md';

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function m0004() {
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

describe('migration 0004 objective-md-backfill', () => {
  test('4. contract: id 0004, safety auto, semver since; loadRegistry() (default dir) includes it', () => {
    const m = m0004();
    assert.equal(m.id, '0004');
    assert.equal(m.safety, 'auto');
    assert.match(m.since, /^\d+\.\d+\.\d+$/);
    assert.ok(typeof m.title === 'string' && m.title.trim().length > 0);
    assert.equal(typeof m.detect, 'function');
    assert.equal(typeof m.apply, 'function');

    const entry = upgrade.loadRegistry().find((r) => r.id === '0004');
    assert.ok(entry, 'registry includes 0004');
    assert.equal(entry.safety, 'auto');
  });

  test('5. v1 fixture -> detect names 02-beta; apply creates its OBJECTIVE.md from ROADMAP', () => {
    const m = m0004();
    const root = track(fx.makeV1Project());
    const ctx = ctxFor(root);

    const det = m.detect(ctx);
    assert.equal(det.applies, true);
    assert.match(det.reason, /02-beta/);

    const res = m.apply(ctx);
    assert.deepEqual(res.changed, [BETA_REL]);

    // bootstrapObjectiveMd stamps today's date — compare frontmatter keys and the goal line only.
    const content = fs.readFileSync(path.join(root, BETA_REL), 'utf-8');
    const fm = extractFrontmatter(content) || {};
    assert.ok(fm.work, 'frontmatter has work');
    assert.match(content, /^## Goal\n\nBeta goal$/m);

    // 01-alpha already had one and is untouched.
    const alpha = fs.readFileSync(path.join(root, '.planning/objectives/01-alpha/OBJECTIVE.md'), 'utf-8');
    assert.match(alpha, /^objective: 01-alpha$/m);
  });

  test('6. only a non-NN dir lacks OBJECTIVE.md -> detect false, and apply never touches it', () => {
    const m = m0004();
    const root = track(fx.makeV1Project({ missingObjectiveMd: false }));
    const scratch = path.join(root, '.planning', 'objectives', 'UI-VISUAL-EVAL-CALLOUT');
    fs.mkdirSync(scratch, { recursive: true });

    const det = m.detect(ctxFor(root));
    assert.deepEqual({ applies: det.applies }, { applies: false });

    const res = m.apply(ctxFor(root));
    assert.deepEqual(res.changed, []);
    assert.deepEqual(fs.readdirSync(scratch), []);
  });

  test('7. dryRun writes nothing and still returns changed', () => {
    const m = m0004();
    const root = track(fx.makeV1Project());
    const before = fx.snapshot(root);
    const res = m.apply(ctxFor(root, { dryRun: true }));
    assert.deepEqual(res.changed, [BETA_REL]);
    assert.deepEqual(fx.diffSnapshots(before, fx.snapshot(root)), []);
    assert.equal(fs.existsSync(path.join(root, BETA_REL)), false);
  });

  test('8. second apply -> detect false', () => {
    const m = m0004();
    const root = track(fx.makeV1Project());
    const ctx = ctxFor(root);
    m.apply(ctx);
    assert.equal(m.detect(ctx).applies, false);
    const again = m.apply(ctx);
    assert.deepEqual(again.changed, []);
  });
});
