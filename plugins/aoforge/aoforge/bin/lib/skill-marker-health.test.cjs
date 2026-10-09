'use strict';

// Tests for lib/skill-marker-health.cjs (TRD 69-02, TOOL-09, tests 11-16): the shared inspection and
// repair of `.aoforge/.skill-active` that validate health Check 19 and doctor check 23 (69-04) use.
//
// no_llm_test_data: every project is makeMarkerProject, a hand-built temp git repo with literal marker
// JSON whose times are offsets from an injected `now`; git runs with a fake HOME and no signing.

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const smh = require('./skill-marker-health.cjs');
const { makeMarkerProject, HOUR_MS } = require('./__fixtures__/skill-marker-fixtures.cjs');

const DF = 'node ~/.claude/aoforge/bin/aof-tools.cjs';
const created = [];

function project(opts) {
  const p = makeMarkerProject(opts);
  created.push(p);
  return p;
}

afterEach(() => {
  while (created.length) created.pop().cleanup();
});

function inspectOf(p) {
  return smh.inspect(p.root, { nowMs: p.nowMs, env: p.env });
}

function planOf(p, extra = {}) {
  return smh.planRepair(p.root, inspectOf(p), { env: p.env, ...extra });
}

describe('inspect (test 11)', () => {
  const shape = (s) => ({
    present: s.present, tracked: s.tracked, ignored: s.ignored, stale: s.stale !== null, live: s.live, git: s.git,
  });

  test('exports the marker path and the two codes', () => {
    assert.equal(smh.MARKER_REL, '.aoforge/.skill-active');
    assert.deepEqual({ ...smh.CODES }, { TRACKED: 'E006', STALE: 'W064' });
    assert.equal(Object.isFrozen(smh.CODES), true);
  });

  test('no marker at all', () => {
    const s = inspectOf(project({ marker: null }));
    assert.deepEqual(shape(s), { present: false, tracked: false, ignored: false, stale: false, live: false, git: true });
    assert.equal(s.rel, '.aoforge/.skill-active');
  });

  test('untracked, live', () => {
    assert.deepEqual(shape(inspectOf(project({ marker: 'live' }))),
      { present: true, tracked: false, ignored: false, stale: false, live: true, git: true });
  });

  test('untracked, stale (expired)', () => {
    const s = inspectOf(project({ marker: 'expired' }));
    assert.deepEqual(shape(s), { present: true, tracked: false, ignored: false, stale: true, live: false, git: true });
    assert.match(s.stale, /^expired at /);
  });

  test('tracked, stale', () => {
    assert.deepEqual(shape(inspectOf(project({ marker: 'expired', tracked: true }))),
      { present: true, tracked: true, ignored: false, stale: true, live: false, git: true });
  });

  test('tracked, missing from the working tree', () => {
    const p = project({ marker: 'live', tracked: true });
    fs.unlinkSync(p.markerPath);
    assert.deepEqual(shape(inspectOf(p)),
      { present: false, tracked: true, ignored: false, stale: false, live: false, git: true });
  });

  test('tracked, live, ignored', () => {
    assert.deepEqual(shape(inspectOf(project({ marker: 'live', tracked: true, ignored: true }))),
      { present: true, tracked: true, ignored: true, stale: false, live: true, git: true });
  });

  test('tracked, live, not ignored', () => {
    assert.deepEqual(shape(inspectOf(project({ marker: 'live', tracked: true }))),
      { present: true, tracked: true, ignored: false, stale: false, live: true, git: true });
  });

  test('not a git repository: tracked is false and ignored is unknown (null)', () => {
    assert.deepEqual(shape(inspectOf(project({ git: false, marker: 'expired' }))),
      { present: true, tracked: false, ignored: null, stale: true, live: false, git: false });
  });
});

describe('classifySkillActive (test 12)', () => {
  const classify = (p) => smh.classifySkillActive(p.root, p.nowMs);

  test('an absent marker is not stale', () => {
    assert.equal(classify(project({ marker: null })), null);
  });

  test('expired and live by expires_at', () => {
    assert.match(classify(project({ marker: 'expired' })), /^expired at 2026-10-08T11:00:00\.000Z$/);
    assert.equal(classify(project({ marker: 'live' })), null);
  });

  test('garbage and empty files are unparseable (the gate would treat them as live forever)', () => {
    assert.match(classify(project({ marker: 'garbage' })), /^unparseable marker \(the edit gate treats it as live forever\)$/);
    assert.match(classify(project({ marker: 'empty' })), /^unparseable marker/);
  });

  test('JSON that is not an object is unparseable', () => {
    const p = project({ marker: null });
    fs.mkdirSync(require('path').dirname(p.markerPath), { recursive: true });
    fs.writeFileSync(p.markerPath, '[]\n');
    assert.equal(classify(p), 'unparseable marker (not a JSON object)');
    fs.writeFileSync(p.markerPath, 'null\n');
    assert.equal(classify(p), 'unparseable marker (not a JSON object)');
  });

  test('no expires_at: aged by started_at against the 8h TTL', () => {
    assert.match(classify(project({ marker: 'legacyOld' })),
      /^no expires_at and started 9h ago \(older than the 8h TTL\)$/);
    assert.equal(classify(project({ marker: 'legacyFresh' })), null);
  });

  test('no expires_at and no started_at: aged by the file mtime', () => {
    const p = project({ marker: { skill: 'build', pid: 4242 } });
    const at = (hoursAgo) => new Date(p.nowMs - hoursAgo * HOUR_MS);
    fs.utimesSync(p.markerPath, at(9), at(9));
    assert.match(classify(p), /^no expires_at and file 9h old \(older than the 8h TTL\)$/);
    fs.utimesSync(p.markerPath, at(1), at(1));
    assert.equal(classify(p), null);
  });

  test('an unusable expires_at falls back to the started_at age', () => {
    const old = project({ marker: { skill: 'build', started_at: new Date(Date.UTC(2026, 9, 8, 3)).toISOString(), expires_at: 'soon' } });
    assert.match(classify(old), /^no expires_at and started 9h ago/);
  });
});

describe('planRepair (test 13)', () => {
  test('untracked, live: nothing to do', () => {
    assert.deepEqual(planOf(project({ marker: 'live' })), { actions: [], fixable: false, refused: null });
  });

  test('no marker: nothing to do', () => {
    assert.deepEqual(planOf(project({ marker: null })), { actions: [], fixable: false, refused: null });
  });

  test('untracked, stale: unlink, no guard needed (even with unrelated work staged)', () => {
    assert.deepEqual(planOf(project({ marker: 'expired', stagedOther: true })),
      { actions: ['remove'], fixable: true, refused: null });
  });

  test('tracked, stale: untrack then remove', () => {
    assert.deepEqual(planOf(project({ marker: 'expired', tracked: true })),
      { actions: ['untrack', 'remove'], fixable: true, refused: null });
  });

  test('tracked, missing from the working tree: untrack only', () => {
    const p = project({ marker: 'live', tracked: true });
    fs.unlinkSync(p.markerPath);
    assert.deepEqual(planOf(p), { actions: ['untrack'], fixable: true, refused: null });
  });

  test('tracked, live, ignored: untrack, keep the file', () => {
    assert.deepEqual(planOf(project({ marker: 'live', tracked: true, ignored: true })),
      { actions: ['untrack'], fixable: true, refused: null });
  });

  test('tracked, live, not ignored: refused, the reason names .gitignore', () => {
    const plan = planOf(project({ marker: 'live', tracked: true }));
    assert.deepEqual(plan.actions, []);
    assert.equal(plan.fixable, false);
    assert.match(plan.refused, /\.gitignore/);
  });

  test('tracked with an unrelated staged file: refused with the guard reason', () => {
    const plan = planOf(project({ marker: 'expired', tracked: true, stagedOther: true }));
    assert.deepEqual(plan, { actions: [], fixable: false, refused: 'staged changes present: notes.txt' });
  });

  test('tracked with a dirty .gitignore: refused', () => {
    const p = project({ marker: 'live', tracked: true, ignored: true });
    fs.appendFileSync(require('path').join(p.root, '.gitignore'), '# uncommitted\n');
    assert.deepEqual(planOf(p), { actions: [], fixable: false, refused: '.gitignore has uncommitted changes' });
  });

  test('exclude: a staged path listed in exclude does not block the guard', () => {
    const p = project({ marker: 'expired', tracked: true, stagedOther: true });
    assert.deepEqual(planOf(p, { exclude: ['notes.txt'] }),
      { actions: ['untrack', 'remove'], fixable: true, refused: null });
  });
});

describe('repair (tests 14, 15)', () => {
  test('14. re-inspects first: a marker that became live between inspect and repair is not unlinked', () => {
    const p = project({ marker: 'expired' });
    assert.equal(inspectOf(p).stale !== null, true);
    fs.writeFileSync(p.markerPath, JSON.stringify({
      skill: 'build', started_at: new Date(p.nowMs).toISOString(), pid: 1,
      expires_at: new Date(p.nowMs + 8 * HOUR_MS).toISOString(),
    }) + '\n');
    const r = smh.repair(p.root, { nowMs: p.nowMs, env: p.env });
    assert.equal(r.applied, false);
    assert.deepEqual(r.untracked, []);
    assert.deepEqual(r.removed, []);
    assert.equal(fs.existsSync(p.markerPath), true);
  });

  test('untracked stale: removes exactly the marker', () => {
    const p = project({ marker: 'expired' });
    const before = p.snapshot();
    const r = smh.repair(p.root, { nowMs: p.nowMs, env: p.env });
    assert.equal(r.applied, true);
    assert.deepEqual(r.untracked, []);
    assert.deepEqual(r.removed, ['.aoforge/.skill-active']);
    assert.equal(r.refused, null);
    const after = p.snapshot();
    before.delete('.aoforge/.skill-active');
    assert.deepEqual([...after], [...before]);
  });

  test('tracked stale: untracks and removes, leaving only a staged deletion', () => {
    const p = project({ marker: 'expired', tracked: true });
    const head = p.git(['rev-parse', 'HEAD']).stdout;
    const r = smh.repair(p.root, { nowMs: p.nowMs, env: p.env });
    assert.equal(r.applied, true);
    assert.deepEqual(r.untracked, ['.aoforge/.skill-active']);
    assert.deepEqual(r.removed, ['.aoforge/.skill-active']);
    assert.equal(p.porcelain(), 'D  .aoforge/.skill-active\n');
    assert.equal(p.git(['rev-parse', 'HEAD']).stdout, head);
  });

  test('tracked live ignored: untracks and keeps the working file byte-identical', () => {
    const p = project({ marker: 'live', tracked: true, ignored: true });
    const bytes = fs.readFileSync(p.markerPath);
    const r = smh.repair(p.root, { nowMs: p.nowMs, env: p.env });
    assert.equal(r.applied, true);
    assert.deepEqual(r.untracked, ['.aoforge/.skill-active']);
    assert.deepEqual(r.removed, []);
    assert.deepEqual(fs.readFileSync(p.markerPath), bytes);
    assert.equal(p.porcelain(), 'D  .aoforge/.skill-active\n');
  });

  test('tracked live not ignored: changes nothing', () => {
    const p = project({ marker: 'live', tracked: true });
    const before = p.snapshot();
    const r = smh.repair(p.root, { nowMs: p.nowMs, env: p.env });
    assert.equal(r.applied, false);
    assert.match(r.refused, /\.gitignore/);
    assert.equal(p.porcelain(), '');
    assert.deepEqual([...p.snapshot()], [...before]);
  });

  test('15. never unlinks a tracked marker when the guard refuses (no " D" in git status)', () => {
    const p = project({ marker: 'expired', tracked: true, stagedOther: true });
    const r = smh.repair(p.root, { nowMs: p.nowMs, env: p.env });
    assert.equal(r.applied, false);
    assert.match(r.refused, /^staged changes present: notes\.txt$/);
    assert.equal(fs.existsSync(p.markerPath), true);
    assert.equal(p.porcelain(), 'A  notes.txt\n');
    assert.doesNotMatch(p.porcelain(), / D /);
    assert.deepEqual(p.tracked(), ['.aoforge/.skill-active']);
  });

  test('a stale marker outside a git repository is simply removed', () => {
    const p = project({ git: false, marker: 'garbage' });
    const r = smh.repair(p.root, { nowMs: p.nowMs, env: p.env });
    assert.equal(r.applied, true);
    assert.deepEqual(r.removed, ['.aoforge/.skill-active']);
    assert.equal(fs.existsSync(p.markerPath), false);
  });
});

describe('findings (test 16)', () => {
  const findingsOf = (p, extra = {}) => {
    const state = inspectOf(p);
    return smh.findings(state, smh.planRepair(p.root, state, { env: p.env, ...extra }));
  };

  test('a live untracked marker, or none, has no findings', () => {
    assert.deepEqual(findingsOf(project({ marker: 'live' })), []);
    assert.deepEqual(findingsOf(project({ marker: null })), []);
  });

  test('a tracked stale marker is ONE E006 error carrying the stale reason, never also W064', () => {
    const list = findingsOf(project({ marker: 'expired', tracked: true }));
    assert.equal(list.length, 1);
    const [f] = list;
    assert.equal(f.severity, 'error');
    assert.equal(f.code, 'E006');
    assert.equal(f.repairable, true);
    assert.ok(f.message.startsWith('skill-marker-tracked: '), f.message);
    assert.match(f.message, /\(it is also stale: expired at 2026-10-08T11:00:00\.000Z\)$/);
    assert.ok(f.fix.includes(`${DF} commit "chore: untrack .aoforge/.skill-active" --files .aoforge/.skill-active`), f.fix);
    assert.ok(f.fix.includes(`${DF} validate health --repair`), f.fix);
    assert.ok(f.fix.includes('Add .aoforge/.skill-active to .gitignore'), 'not ignored: say so');
  });

  test('a tracked live ignored marker is a repairable E006 without a stale clause or a .gitignore hint', () => {
    const [f] = findingsOf(project({ marker: 'live', tracked: true, ignored: true }));
    assert.equal(f.code, 'E006');
    assert.equal(f.repairable, true);
    assert.doesNotMatch(f.message, /stale/);
    assert.doesNotMatch(f.fix, /Add \.aoforge\/\.skill-active to \.gitignore/);
  });

  test('a tracked live marker that is not ignored is a non-repairable E006 whose fix names .gitignore', () => {
    const [f] = findingsOf(project({ marker: 'live', tracked: true }));
    assert.equal(f.code, 'E006');
    assert.equal(f.repairable, false);
    assert.match(f.fix, /\.gitignore/);
    assert.ok(f.fix.endsWith(`; then run \`${DF} validate health --repair\``), f.fix);
  });

  test('a refused guard puts its reason in the E006 fix', () => {
    const [f] = findingsOf(project({ marker: 'expired', tracked: true, stagedOther: true }));
    assert.equal(f.repairable, false);
    assert.ok(f.fix.startsWith('staged changes present: notes.txt; then run'), f.fix);
  });

  test('an untracked stale marker is a repairable W064 warning', () => {
    const list = findingsOf(project({ marker: 'garbage' }));
    assert.equal(list.length, 1);
    const [f] = list;
    assert.equal(f.severity, 'warning');
    assert.equal(f.code, 'W064');
    assert.equal(f.repairable, true);
    assert.ok(f.message.startsWith('skill-marker-stale: .aoforge/.skill-active (unparseable marker'), f.message);
    assert.ok(f.message.endsWith('the edit gate stays open until it is removed'), f.message);
    assert.equal(f.fix, `Run \`${DF} validate health --repair\` or \`${DF} doctor --fix\` (removes only this file)`);
  });
});
