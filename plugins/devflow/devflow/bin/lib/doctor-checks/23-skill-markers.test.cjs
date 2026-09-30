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
const doctor = require('../doctor.cjs');
const skillActive = require('../skill-active.cjs');
const { makeDoctorProject, PLUGIN_ROOT } = require('../__fixtures__/doctor-fixtures.cjs');
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
  return path.join(root, '.planning', '.skill-active');
}

function overrideMarker(root) {
  return path.join(root, '.planning', '.edit-override');
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
    assert.equal(r.details.stale[0].file, '.planning/.skill-active');
    assert.match(r.details.stale[0].reason, /expired/);

    const res = markers.fix(ctx, r);
    assert.equal(res.applied, true);
    assert.deepEqual(res.changed, ['.planning/.skill-active']);
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
    const res = markers.fix(ctx, { severity: 'warn', fixable: true, details: { stale: [{ file: '.planning/.skill-active', reason: 'expired' }] } });
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
    assert.equal(r.details.stale[0].file, '.planning/.edit-override');

    const res = markers.fix(ctx, r);
    assert.equal(res.applied, true);
    assert.deepEqual(res.changed, ['.planning/.edit-override']);
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
    assert.deepEqual(r.details.stale.map((s) => s.file), ['.planning/.skill-active', '.planning/.edit-override']);
    const res = markers.fix(ctx, r);
    assert.deepEqual(res.changed.sort(), ['.planning/.edit-override', '.planning/.skill-active']);
  });
});
