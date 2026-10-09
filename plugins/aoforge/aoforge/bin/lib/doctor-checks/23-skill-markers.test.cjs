'use strict';

// Tests for doctor check 23-skill-markers (TRD 45-06, tests 15-18).
//
// no_llm_test_data: markers are literal JSON with ISO times written relative to the injected
// ctx.now; `.edit-override` age is set through its mtime (what the edit gate reads). Every project is
// a temp-dir fixture; the fake home is never the real ~/.claude.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const markers = require('./23-skill-markers.cjs');
const health = require('./22-validate-health.cjs');
const doctor = require('../doctor.cjs');
const skillActive = require('../skill-active.cjs');
const { makeDoctorProject, PLUGIN_ROOT } = require('../__fixtures__/doctor-fixtures.cjs');
const { makeMarkerProject, MARKER_REL } = require('../__fixtures__/skill-marker-fixtures.cjs');
const { gitEnv } = require('../__fixtures__/upgrade-fixtures.cjs');

const NOW = new Date('2026-09-30T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

function iso(offsetMs) {
  return new Date(NOW.getTime() + offsetMs).toISOString();
}

function project() {
  const { root, home } = makeDoctorProject({ git: false });
  return { root, home };
}

function ctxFor(root, home) {
  return doctor.buildContext({ projectRoot: root, userHome: home, env: gitEnv(home), now: NOW });
}

function skillMarker(root) {
  return path.join(root, '.aoforge', '.skill-active');
}

function overrideMarker(root) {
  return path.join(root, '.aoforge', '.edit-override');
}

function writeSkill(root, value) {
  const body = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
  fs.writeFileSync(skillMarker(root), body, 'utf-8');
}

function writeOverride(root, ageMs) {
  const p = overrideMarker(root);
  fs.writeFileSync(p, JSON.stringify({ created_at: iso(-ageMs) }), 'utf-8');
  const t = new Date(NOW.getTime() - ageMs);
  fs.utimesSync(p, t, t);
}

describe('skill-markers: contract', () => {
  test('is a project check with a fix', () => {
    assert.equal(markers.id, 'skill-markers');
    assert.equal(markers.scope, 'project');
    assert.deepEqual(doctor.contractIssues(markers), []);
    assert.equal(typeof markers.fix, 'function');
  });

  test('mirrors the edit gate TTL exactly (hooks/lib/edit-override.js is not in the runtime mirror)', () => {
    const editOverride = require(path.join(PLUGIN_ROOT, 'hooks', 'lib', 'edit-override.js'));
    assert.equal(markers.EDIT_OVERRIDE_TTL_MS, editOverride.EDIT_OVERRIDE_TTL_MS);
  });

  test('no markers → ok', () => {
    const { root, home } = project();
    const r = markers.run(ctxFor(root, home));
    assert.equal(r.severity, 'ok');
    assert.equal(r.fixable, false);
  });
});

describe('skill-markers: .skill-active (tests 15-17)', () => {
  test('15. an expired marker → warn fixable; the fix removes it; re-run ok', () => {
    const { root, home } = project();
    writeSkill(root, { skill: 'build', started_at: iso(-10 * HOUR), pid: 4242, expires_at: iso(-2 * HOUR) });
    const ctx = ctxFor(root, home);
    assert.equal(skillActive.isExpired(JSON.parse(fs.readFileSync(skillMarker(root), 'utf-8')), NOW.getTime()), true);

    const r = markers.run(ctx);
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, true);
    assert.equal(r.details.stale.length, 1);
    assert.equal(r.details.stale[0].file, '.aoforge/.skill-active');
    assert.match(r.details.stale[0].reason, /expired/);

    const res = markers.fix(ctx, r);
    assert.equal(res.applied, true);
    assert.deepEqual(res.changed, ['.aoforge/.skill-active']);
    assert.equal(fs.existsSync(skillMarker(root)), false);
    assert.equal(markers.run(ctxFor(root, home)).severity, 'ok');
  });

  test('16. a live marker (expires_at in the future) → ok and never removed', () => {
    const { root, home } = project();
    writeSkill(root, { skill: 'build', started_at: iso(-1 * HOUR), pid: 4242, expires_at: iso(7 * HOUR) });
    const ctx = ctxFor(root, home);

    const r = markers.run(ctx);
    assert.equal(r.severity, 'ok');
    assert.equal(r.fixable, false);

    // Even handed a stale-looking result, fix() re-checks and leaves a live marker alone.
    const res = markers.fix(ctx, { severity: 'warn', fixable: true, details: { stale: [{ file: '.aoforge/.skill-active', reason: 'expired' }] } });
    assert.notEqual(res.applied, true);
    assert.equal(fs.existsSync(skillMarker(root)), true);
  });

  test('16. race: a marker that became live between run() and fix() is skipped', () => {
    const { root, home } = project();
    writeSkill(root, { skill: 'build', started_at: iso(-10 * HOUR), pid: 1, expires_at: iso(-2 * HOUR) });
    const ctx = ctxFor(root, home);
    const r = markers.run(ctx);
    assert.equal(r.fixable, true);

    writeSkill(root, { skill: 'plan', started_at: iso(0), pid: 2, expires_at: iso(8 * HOUR) });
    const res = markers.fix(ctx, r);
    assert.notEqual(res.applied, true);
    assert.equal(fs.existsSync(skillMarker(root)), true);
    assert.equal(JSON.parse(fs.readFileSync(skillMarker(root), 'utf-8')).skill, 'plan');
  });

  test('17. a garbage marker → warn fixable (unparseable)', () => {
    const { root, home } = project();
    writeSkill(root, 'not json {');
    const r = markers.run(ctxFor(root, home));
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, true);
    assert.match(r.details.stale[0].reason, /unparseable/);
  });

  test('17. no expires_at and started_at older than DEFAULT_TTL_MS → warn fixable', () => {
    const { root, home } = project();
    const age = skillActive.DEFAULT_TTL_MS + HOUR;
    writeSkill(root, { skill: 'build', started_at: iso(-age), pid: 4242 });
    const ctx = ctxFor(root, home);
    const r = markers.run(ctx);
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, true);
    assert.match(r.details.stale[0].reason, /no expires_at/);

    const res = markers.fix(ctx, r);
    assert.equal(res.applied, true);
    assert.equal(fs.existsSync(skillMarker(root)), false);
  });

  test('17. no expires_at but started 1h ago → ok (a legacy marker within the TTL)', () => {
    const { root, home } = project();
    writeSkill(root, { skill: 'build', started_at: iso(-1 * HOUR), pid: 4242 });
    assert.equal(markers.run(ctxFor(root, home)).severity, 'ok');
  });
});

describe('skill-markers: .edit-override (test 18)', () => {
  test('18. 10 minutes old → warn fixable; the fix removes it', () => {
    const { root, home } = project();
    writeOverride(root, 10 * MINUTE);
    const ctx = ctxFor(root, home);

    const r = markers.run(ctx);
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, true);
    assert.equal(r.details.stale[0].file, '.aoforge/.edit-override');

    const res = markers.fix(ctx, r);
    assert.equal(res.applied, true);
    assert.deepEqual(res.changed, ['.aoforge/.edit-override']);
    assert.equal(fs.existsSync(overrideMarker(root)), false);
    assert.equal(markers.run(ctxFor(root, home)).severity, 'ok');
  });

  test('18. 1 minute old → ok', () => {
    const { root, home } = project();
    writeOverride(root, 1 * MINUTE);
    const r = markers.run(ctxFor(root, home));
    assert.equal(r.severity, 'ok');
    assert.equal(fs.existsSync(overrideMarker(root)), true);
  });

  test('both stale → one warn listing both; the fix removes only those', () => {
    const { root, home } = project();
    writeOverride(root, 10 * MINUTE);
    writeSkill(root, 'garbage');
    const ctx = ctxFor(root, home);
    const r = markers.run(ctx);
    assert.equal(r.severity, 'warn');
    assert.deepEqual(r.details.stale.map((s) => s.file), ['.aoforge/.skill-active', '.aoforge/.edit-override']);
    const res = markers.fix(ctx, r);
    assert.deepEqual(res.changed.sort(), ['.aoforge/.edit-override', '.aoforge/.skill-active']);
  });
});

// ─── TRD 69-04: tracked markers (TOOL-09, doctor side) ────────────────────────
//
// Projects come from makeMarkerProject (a stamped git project with a hand-built marker). Every git call
// runs under its fake home; this repository's own live marker is never read.

function markerCtx(p, extra = {}) {
  return Object.assign(doctor.buildContext({ projectRoot: p.root, userHome: p.home, env: p.env, now: p.now }), extra);
}

function findById(list, id) {
  return (list || []).find((item) => item.id === id);
}

describe('skill-markers: tracked and git markers (69-04 tests 1-6, 8)', () => {
  test('1. whole engine: a tracked expired marker is reported once (check 23); --fix untracks and removes only it', () => {
    const p = makeMarkerProject({ marker: 'expired', tracked: true });
    try {
      const base = { projectRoot: p.root, userHome: p.home, env: p.env, now: p.now, checks: [health, markers] };

      const before = doctor.runDoctor(base);
      const c23 = findById(before.checks, 'skill-markers');
      const c22 = findById(before.checks, 'validate-health');
      assert.equal(c23.severity, 'error', c23.finding);
      assert.deepEqual(c23.details.codes, ['E006']);
      assert.deepEqual(c23.details.tracked, [MARKER_REL]);
      assert.equal(c23.fixable, true, c23.finding);
      assert.ok(c22.details.deferred.includes('E006'), JSON.stringify(c22.details));
      assert.doesNotMatch(c22.finding, /E006/);
      assert.deepEqual(c22.details.codes.filter((code) => code === 'E006' || code === 'W064'), []);

      const after = doctor.runDoctor({ ...base, fix: true });
      assert.equal(findById(after.checks, 'skill-markers').severity, 'ok', findById(after.checks, 'skill-markers').finding);
      assert.equal(p.porcelain(), `D  ${MARKER_REL}\n`);
      const fixEntry = findById(after.fixes, 'skill-markers');
      assert.equal(fixEntry.applied, true, JSON.stringify(fixEntry));
      assert.deepEqual(fixEntry.changed, [MARKER_REL]);
      assert.match(fixEntry.notes, /--files \.aoforge\/\.skill-active/);
    } finally {
      p.cleanup();
    }
  });

  test('2. a tracked live ignored marker → error, fixable; the fix untracks it and the file is byte-identical', () => {
    const p = makeMarkerProject({ marker: 'live', tracked: true, ignored: true });
    try {
      const ctx = markerCtx(p);
      const bytes = fs.readFileSync(p.markerPath);

      const r = markers.run(ctx);
      assert.equal(r.severity, 'error', r.finding);
      assert.equal(r.fixable, true, r.finding);
      assert.deepEqual(r.details.codes, ['E006']);
      assert.match(r.finding, /E006/);
      assert.deepEqual(r.details.stale, []);

      const res = markers.fix(ctx, r);
      assert.equal(res.applied, true, JSON.stringify(res));
      assert.deepEqual(res.changed, [MARKER_REL]);
      assert.deepEqual(p.tracked(), []);
      assert.deepEqual(fs.readFileSync(p.markerPath), bytes);
      assert.equal(markers.run(markerCtx(p)).severity, 'ok');
    } finally {
      p.cleanup();
    }
  });

  test('3. a tracked live marker that is not ignored → error, not fixable, names .gitignore; fix() applies nothing', () => {
    const p = makeMarkerProject({ marker: 'live', tracked: true });
    try {
      const ctx = markerCtx(p);
      const bytes = fs.readFileSync(p.markerPath);

      const r = markers.run(ctx);
      assert.equal(r.severity, 'error', r.finding);
      assert.equal(r.fixable, false);
      assert.match(r.fix_command, /\.gitignore/);
      assert.match(r.finding, /skill marker fix refused/);

      const res = markers.fix(ctx, r);
      assert.equal(res.applied, false);
      assert.deepEqual(p.tracked(), [MARKER_REL]);
      assert.deepEqual(fs.readFileSync(p.markerPath), bytes);
      assert.equal(p.porcelain(), '');
    } finally {
      p.cleanup();
    }
  });

  test('4. a tracked expired marker with an unrelated staged file is refused; the doctor\'s own change lifts it', () => {
    const p = makeMarkerProject({ marker: 'expired', tracked: true, stagedOther: true });
    try {
      const refused = markers.run(markerCtx(p));
      assert.equal(refused.severity, 'error', refused.finding);
      assert.equal(refused.fixable, false);
      assert.match(refused.finding, /staged changes present/);
      assert.match(refused.fix_command, /commit or unstage your changes/);
      assert.match(refused.fix_command, /doctor --fix/);

      const own = markers.run(markerCtx(p, { changedThisRun: new Set(['notes.txt']) }));
      assert.equal(own.fixable, true, own.finding);
    } finally {
      p.cleanup();
    }
  });

  test('5. guard refused: fix() never unlinks the tracked marker', () => {
    const p = makeMarkerProject({ marker: 'expired', tracked: true, stagedOther: true });
    try {
      const ctx = markerCtx(p);
      const res = markers.fix(ctx, markers.run(ctx));
      assert.equal(res.applied, false);
      assert.match(res.refused, /staged changes present/);
      assert.equal(fs.existsSync(p.markerPath), true, 'the tracked marker must still be on disk');
      assert.doesNotMatch(p.porcelain(), /^.D /m, 'no working-tree deletion of a tracked file');
      assert.deepEqual(p.tracked(), [MARKER_REL]);
    } finally {
      p.cleanup();
    }
  });

  test('6. an untracked stale marker in a git project → warn W064; the fix removes only it', () => {
    const p = makeMarkerProject({ marker: 'expired' });
    try {
      const ctx = markerCtx(p);
      const before = p.snapshot();

      const r = markers.run(ctx);
      assert.equal(r.severity, 'warn', r.finding);
      assert.equal(r.fixable, true);
      assert.deepEqual(r.details.codes, ['W064']);
      assert.deepEqual(r.details.tracked, []);
      assert.match(r.finding, /^stale edit-gate marker\(s\) holding the gate open: \.aoforge\/\.skill-active \(expired at /);

      const res = markers.fix(ctx, r);
      assert.equal(res.applied, true, JSON.stringify(res));
      assert.deepEqual(res.changed, [MARKER_REL]);
      const after = p.snapshot();
      before.delete(MARKER_REL);
      assert.deepEqual([...after].sort(), [...before].sort(), 'only the marker file changed');
    } finally {
      p.cleanup();
    }
  });

  test('8. check 23 keeps no local copy of the skill-active classification', () => {
    const src = fs.readFileSync(path.join(__dirname, '23-skill-markers.cjs'), 'utf-8');
    assert.doesNotMatch(src, /function classifySkillActive/);
    assert.match(src, /skill-marker-health\.cjs/);
  });
});
