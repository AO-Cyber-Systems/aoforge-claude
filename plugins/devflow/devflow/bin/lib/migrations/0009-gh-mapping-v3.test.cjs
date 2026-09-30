'use strict';

// TRD 46-02 — migration 0009 gh-mapping-v3 (test list items 16-20).
//
// no_llm_test_data: every project is a disposable temp directory from upgrade-fixtures.cjs
// (makeStampedProject) plus hand-written `.gh-*.json` files, with a fake HOME from makeFakeHome.
// Nothing here touches this repository's .planning/, the real ~/.claude, git or the network.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const upgrade = require('../upgrade.cjs');
const fx = require('../__fixtures__/upgrade-fixtures.cjs');

const MIGRATION_PATH = path.join(__dirname, '0009-gh-mapping-v3.cjs');
const MAPPING = '.planning/.gh-mapping.json';
const SYNC_STATE = '.planning/.gh-sync-state.json';
const PLUGIN_VERSION = '2.13.0';

// This repository's real v2 file, hand-copied.
const REAL_V2 = { milestone_id: null, objectives: { 0: { issue_id: 20, state_comment_id: 4374249280 } } };
const V1 = { milestone_id: 5, objectives: { 1: 11, 2: 12 } };
const V3 = {
  version: 3,
  milestones: { 'v1.4': 7 },
  objectives: { 46: { issue_id: 123, state_comment_id: 456, verified_at: null } },
  trds: {},
};
const SYNC_CANONICAL = { version: 1, objectives: { 46: { issue_ref: 'o/r#123', last_synced_at: '2026-09-01T00:00:00Z' } } };
const SYNC_DIRNAME = { version: 1, objectives: { '46-github-sync-foundations': { issue_ref: 'o/r#123', last_synced_at: '2026-09-01T00:00:00Z' } } };

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function m0009() {
  return require(MIGRATION_PATH);
}

function write(root, rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`, 'utf-8');
  return full;
}

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf-8');
}

// A current-shape project (nothing else pending) plus the gh files under test.
function project({ mapping, sync, objectives = [] } = {}) {
  const root = fx.makeStampedProject('2.12.0');
  const home = fx.makeFakeHome();
  cleanup.push(root, home);
  if (mapping !== undefined) write(root, MAPPING, mapping);
  if (sync !== undefined) write(root, SYNC_STATE, sync);
  for (const [dir, githubIssue] of objectives) {
    write(root, `.planning/objectives/${dir}/OBJECTIVE.md`, `---\nobjective: ${dir}\ngithub_issue: ${githubIssue}\n---\n\n# ${dir}\n`);
  }
  return { root, home };
}

function ctxFor({ root, home }, { dryRun = false } = {}) {
  return { projectRoot: root, userHome: home, pluginVersion: PLUGIN_VERSION, dryRun, options: {} };
}

describe('migration 0009 gh-mapping-v3', () => {
  // ─── 16. contract ───────────────────────────────────────────────────────────

  test('16. contract: id 0009, safety auto, since 2.13.0, a title, detect and apply exported', () => {
    const m = m0009();
    assert.equal(m.id, '0009');
    assert.equal(m.safety, 'auto');
    assert.equal(m.since, '2.13.0');
    assert.equal(typeof m.title, 'string');
    assert.ok(m.title.trim().length > 0);
    assert.equal(typeof m.detect, 'function');
    assert.equal(typeof m.apply, 'function');
  });

  // ─── 17. detect ─────────────────────────────────────────────────────────────

  test('17a. no mapping file -> applies:false', () => {
    const p = project();
    const det = m0009().detect(ctxFor(p));
    assert.equal(det.applies, false);
    assert.equal(typeof det.reason, 'string');
  });

  test('17b. a v3 mapping with normalised sync-state -> applies:false', () => {
    const p = project({ mapping: V3, sync: SYNC_CANONICAL });
    assert.equal(m0009().detect(ctxFor(p)).applies, false);
  });

  test('17b2. a v3 mapping and no sync-state file at all -> applies:false', () => {
    const p = project({ mapping: V3 });
    assert.equal(m0009().detect(ctxFor(p)).applies, false);
  });

  test('17c. a v1 mapping -> applies:true', () => {
    const det = m0009().detect(ctxFor(project({ mapping: V1 })));
    assert.equal(det.applies, true);
    assert.match(det.reason, /v1/);
    assert.match(det.reason, /v3/);
  });

  test('17d. this repository\'s real v2 mapping -> applies:true', () => {
    const det = m0009().detect(ctxFor(project({ mapping: REAL_V2 })));
    assert.equal(det.applies, true);
    assert.match(det.reason, /v2/);
  });

  test('17e. a v3 mapping whose sync-state has a dir-name key -> applies:true', () => {
    const det = m0009().detect(ctxFor(project({ mapping: V3, sync: SYNC_DIRNAME })));
    assert.equal(det.applies, true);
    assert.match(det.reason, /sync-state/);
  });

  test('17f. an unparseable mapping -> applies:false, left untouched', () => {
    const p = project({ mapping: '{not json', sync: SYNC_DIRNAME });
    const det = m0009().detect(ctxFor(p));
    assert.equal(det.applies, false);
    assert.equal(det.reason, 'unparseable mapping — left untouched');
  });

  test('17g. a mapping from a NEWER DevFlow (version 4) -> applies:false, never downgraded', () => {
    const p = project({ mapping: { version: 4, objectives: {} } });
    const det = m0009().detect(ctxFor(p));
    assert.equal(det.applies, false);
    assert.match(det.reason, /version 4/);
  });

  test('17h. an unparseable sync-state next to a v3 mapping -> applies:false (nothing to convert, no crash)', () => {
    const p = project({ mapping: V3, sync: '{broken' });
    assert.equal(m0009().detect(ctxFor(p)).applies, false);
  });

  test('17i. detect never writes', () => {
    const p = project({ mapping: REAL_V2, sync: SYNC_DIRNAME });
    const before = fx.snapshot(p.root);
    m0009().detect(ctxFor(p));
    assert.deepEqual(fx.diffSnapshots(before, fx.snapshot(p.root)), []);
  });

  // ─── 18. apply ──────────────────────────────────────────────────────────────

  test('18a. apply on the real v2 fixture writes v3 and reports exactly the mapping file', () => {
    const p = project({ mapping: REAL_V2 });
    const res = m0009().apply(ctxFor(p));
    assert.deepEqual(res.changed, [MAPPING]);
    const after = JSON.parse(read(p.root, MAPPING));
    assert.equal(after.version, 3);
    assert.deepEqual(after.objectives, { 0: { issue_id: 20, state_comment_id: 4374249280, verified_at: null } });
    assert.deepEqual(after.milestones, {});
    assert.deepEqual(after.trds, {});
    assert.ok(read(p.root, MAPPING).endsWith('\n'));
  });

  test('18b. apply also normalises sync-state keys to ids, keeping it version 1, and reports both files', () => {
    const p = project({
      mapping: REAL_V2,
      sync: {
        version: 1,
        objectives: {
          '02-beta': { status: 'open', last_synced_at: '2026-01-01T00:00:00Z' },
          2: { status: 'done', last_synced_at: '2026-02-01T00:00:00Z' },
          '02.1-foo': { status: 'open', last_synced_at: '2026-01-15T00:00:00Z' },
        },
      },
    });
    const res = m0009().apply(ctxFor(p));
    assert.deepEqual(res.changed, [MAPPING, SYNC_STATE]);
    const sync = JSON.parse(read(p.root, SYNC_STATE));
    assert.equal(sync.version, 1);
    assert.deepEqual(Object.keys(sync.objectives).sort(), ['2', '2.1']);
    assert.equal(sync.objectives['2'].status, 'done', 'the newest last_synced_at wins');
  });

  test('18c. a sync-state-only change leaves the (already v3) mapping bytes alone', () => {
    const p = project({ mapping: V3, sync: SYNC_DIRNAME });
    const mappingBefore = read(p.root, MAPPING);
    const res = m0009().apply(ctxFor(p));
    assert.deepEqual(res.changed, [SYNC_STATE]);
    assert.equal(read(p.root, MAPPING), mappingBefore);
    assert.deepEqual(Object.keys(JSON.parse(read(p.root, SYNC_STATE)).objectives), ['46']);
  });

  test('18d. the written mapping is numerically sorted (2, 2.1, 10), not JSON.stringify order', () => {
    const p = project({ mapping: { objectives: { 10: 110, '2.1': 21, 2: 20 } } });
    m0009().apply(ctxFor(p));
    const text = read(p.root, MAPPING);
    const pos = (k) => text.indexOf(`"${k}": {`);
    assert.ok(pos('2') > -1 && pos('2') < pos('2.1') && pos('2.1') < pos('10'), text);
  });

  test('18e. a parseInt-collapsed key is re-keyed from the project\'s own OBJECTIVE.md github_issue', () => {
    const p = project({
      mapping: { objectives: { 2: { issue_id: 31, state_comment_id: null } } },
      objectives: [['02.1-foo', 'o/r#31']],
    });
    m0009().apply(ctxFor(p));
    assert.deepEqual(Object.keys(JSON.parse(read(p.root, MAPPING)).objectives), ['2.1']);
  });

  test('18f. conflicts are preserved in the file and summarised in notes; no winner is picked', () => {
    const p = project({ mapping: { objectives: { '02-a': 11, 2: 12 } } });
    const res = m0009().apply(ctxFor(p));
    const after = JSON.parse(read(p.root, MAPPING));
    assert.equal(after.objectives['2'], undefined);
    assert.deepEqual(after.conflicts['2'].map((c) => c.issue_id), [11, 12]);
    assert.match(String(res.notes), /conflict/);
  });

  test('18g. dryRun writes nothing and reports the same changed files as a real run', () => {
    const fixture = { mapping: REAL_V2, sync: SYNC_DIRNAME };
    const dry = project(fixture);
    const before = fx.snapshot(dry.root);
    const dryRes = m0009().apply(ctxFor(dry, { dryRun: true }));
    assert.deepEqual(fx.diffSnapshots(before, fx.snapshot(dry.root)), [], 'no file written');

    const real = project(fixture);
    const realRes = m0009().apply(ctxFor(real));
    assert.deepEqual(dryRes.changed, realRes.changed);
    assert.deepEqual(dryRes.changed, [MAPPING, SYNC_STATE]);
  });

  test('18h. apply never touches a mapping it cannot parse, nor a newer one', () => {
    const bad = project({ mapping: '{not json', sync: SYNC_DIRNAME });
    const before = fx.snapshot(bad.root);
    const res = m0009().apply(ctxFor(bad));
    assert.deepEqual(res.changed, []);
    assert.deepEqual(fx.diffSnapshots(before, fx.snapshot(bad.root)), []);

    const newer = project({ mapping: { version: 4, objectives: {} } });
    const before2 = fx.snapshot(newer.root);
    assert.deepEqual(m0009().apply(ctxFor(newer)).changed, []);
    assert.deepEqual(fx.diffSnapshots(before2, fx.snapshot(newer.root)), []);
  });

  // ─── 19. idempotency ────────────────────────────────────────────────────────

  test('19. apply, then detect -> applies:false; a second apply -> changed []', () => {
    for (const fixture of [
      { mapping: REAL_V2 },
      { mapping: V1, sync: SYNC_DIRNAME },
      { mapping: { objectives: { '02-a': 11, 2: 12 } } },
      { mapping: { objectives: { 2: { issue_id: 31 } } }, objectives: [['02.1-foo', 'o/r#31']] },
    ]) {
      const p = project(fixture);
      const first = m0009().apply(ctxFor(p));
      assert.ok(first.changed.length > 0, JSON.stringify(fixture));
      assert.equal(m0009().detect(ctxFor(p)).applies, false, `detect after apply: ${JSON.stringify(fixture)}`);
      const bytes = fx.snapshot(p.root);
      assert.deepEqual(m0009().apply(ctxFor(p)).changed, []);
      assert.deepEqual(fx.diffSnapshots(bytes, fx.snapshot(p.root)), [], 'second apply writes nothing');
    }
  });

  // ─── 20. registry ───────────────────────────────────────────────────────────

  test('20. upgrade.loadRegistry includes 0009 after 0008, in id order, as an auto migration', () => {
    const registry = upgrade.loadRegistry();
    const ids = registry.map((r) => r.id);
    assert.deepEqual(ids, [...ids].sort(), 'registry is in id order');
    assert.ok(ids.includes('0008') && ids.includes('0009'));
    assert.ok(ids.indexOf('0009') > ids.indexOf('0008'), '0009 sorts after 0008');
    assert.equal(registry.find((r) => r.id === '0009').safety, 'auto');
  });

  test('20b. through the real runner: check lists 0009 pending, apply converts, check then skips it', () => {
    const p = project({ mapping: REAL_V2 });
    const opts = { projectRoot: p.root, userHome: p.home, pluginVersion: PLUGIN_VERSION, only: ['0009'] };

    const pending = upgrade.check(opts);
    assert.deepEqual(pending.pending.map((x) => x.id), ['0009']);

    const report = upgrade.apply(opts);
    assert.deepEqual(report.failed, []);
    assert.deepEqual(report.applied.map((a) => a.id), ['0009']);
    assert.ok(report.changed_files.includes(MAPPING));
    assert.equal(JSON.parse(read(p.root, MAPPING)).version, 3);
    assert.ok(report.backup, 'the runner backed the project up (outside the repo) before writing');

    const after = upgrade.check(opts);
    assert.deepEqual(after.pending, []);
    assert.ok(after.skipped.some((s) => s.id === '0009'));
  });

  test('20c. a project without GitHub sync is untouched by the runner (0009 does not apply)', () => {
    const p = project();
    const before = fx.snapshot(p.root);
    const report = upgrade.check({ projectRoot: p.root, userHome: p.home, pluginVersion: PLUGIN_VERSION, only: ['0009'] });
    assert.deepEqual(report.pending, []);
    assert.deepEqual(fx.diffSnapshots(before, fx.snapshot(p.root)), []);
  });
});
