'use strict';

// TRD 45-07 (DOC-05, state hygiene) — guard-state (30) and awareness-state (31) doctor checks.
//
// no_llm_test_data: every fixture is a hand-written JSON body in an `fs.mkdtemp` fake home (via
// the shared doctor fixtures). Ages are set with fs.utimesSync against a fixed `now`. Nothing here
// reads or writes the real ~/.claude: `userHome` and both state-dir env overrides always point
// inside the fake home.

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const doctor = require('../doctor.cjs');
const { makeDoctorHome } = require('../__fixtures__/doctor-fixtures.cjs');
const guardState = require('./30-guard-state.cjs');
const awarenessState = require('./31-awareness-state.cjs');
const hook = require('../../../../hooks/guard-no-progress.js');

const MIB = 1024 * 1024;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date('2026-09-30T12:00:00.000Z');

const homes = [];
after(() => {
  for (const h of homes) fs.rmSync(h, { recursive: true, force: true });
});

function newHome() {
  const home = makeDoctorHome();
  assert.ok(fs.realpathSync(home).startsWith(fs.realpathSync(os.tmpdir()) + path.sep), 'fake home must be under the OS temp dir');
  homes.push(home);
  return home;
}

const guardDirOf = (home) => path.join(home, '.claude', 'devflow', 'state', 'progress-guard');
const awarenessDirOf = (home) => path.join(home, '.claude', 'devflow', 'state', 'awareness');

function envFor(home) {
  return { DEVFLOW_PROGRESS_GUARD_DIR: guardDirOf(home), DEVFLOW_AWARENESS_DIR: awarenessDirOf(home) };
}

function makeCtx(home) {
  return doctor.buildContext({ userHome: home, env: envFor(home), now: NOW, pluginVersion: '0.0.0-test' });
}

function write(file, body, ageMs) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, 'utf8');
  const t = new Date(NOW.getTime() - ageMs);
  fs.utimesSync(file, t, t);
}

function realProject(home, name) {
  const dir = path.join(home, 'work', name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── guard-state ──────────────────────────────────────────────────────────────

function guardBody(project) {
  return JSON.stringify({ guard: { last: 'Read', count: 1 }, updated: '2026-09-28T09:00:00.000Z', project });
}

test('1. guard-state: 2 stale + 1 fresh session file -> warn fixable; fix removes the stale two; re-run ok', () => {
  const home = newHome();
  const dir = guardDirOf(home);
  write(path.join(dir, 'sess-old-1.json'), guardBody('/p/one'), 2 * DAY);
  write(path.join(dir, 'sess-old-2.json'), guardBody('/p/two'), 2 * DAY);
  write(path.join(dir, 'sess-fresh.json'), guardBody('/p/three'), HOUR);

  const ctx = makeCtx(home);
  assert.equal(guardState.id, 'guard-state');
  assert.equal(guardState.scope, 'global');

  const res = guardState.run(ctx);
  assert.equal(res.severity, 'warn');
  assert.match(res.finding, /2 stale guard session files/);
  assert.equal(res.fixable, true);

  const out = guardState.fix(ctx, res);
  assert.equal(out.applied, true);
  assert.equal(out.changed.length, 2);
  assert.ok(!fs.existsSync(path.join(dir, 'sess-old-1.json')));
  assert.ok(!fs.existsSync(path.join(dir, 'sess-old-2.json')));
  assert.ok(fs.existsSync(path.join(dir, 'sess-fresh.json')), 'the fresh session file survives');

  const again = guardState.run(ctx);
  assert.equal(again.severity, 'ok');
  assert.equal(again.fixable, false);
});

test('1b. guard-state: a single stale file is worded in the singular', () => {
  const home = newHome();
  write(path.join(guardDirOf(home), 'sess-old.json'), guardBody('/p/one'), 3 * DAY);
  const res = guardState.run(makeCtx(home));
  assert.equal(res.severity, 'warn');
  assert.match(res.finding, /1 stale guard session file\b(?!s)/);
});

test('1c. guard-state through the engine: report leaves state alone, --fix prunes it and reports ok', () => {
  const home = newHome();
  const dir = guardDirOf(home);
  write(path.join(dir, 'sess-old.json'), guardBody('/p/one'), 2 * DAY);
  write(path.join(dir, 'sess-fresh.json'), guardBody('/p/two'), HOUR);
  const base = { userHome: home, env: envFor(home), now: NOW, pluginVersion: '0.0.0-test', checks: [guardState] };

  const report = doctor.runDoctor(base);
  assert.equal(report.checks[0].id, 'guard-state');
  assert.equal(report.checks[0].severity, 'warn');
  assert.equal(report.checks[0].fixable, true);
  assert.ok(fs.existsSync(path.join(dir, 'sess-old.json')), 'a report run never deletes');

  const fixed = doctor.runDoctor({ ...base, fix: true });
  assert.equal(fixed.fixes.length, 1);
  assert.equal(fixed.fixes[0].applied, true);
  assert.equal(fixed.checks[0].severity, 'ok');
  assert.ok(!fs.existsSync(path.join(dir, 'sess-old.json')));
  assert.ok(fs.existsSync(path.join(dir, 'sess-fresh.json')));
});

test('2. guard-state: missing dir -> ok "no guard state"; non-json files and subdirs are never touched', () => {
  const missingHome = newHome();
  const missing = guardState.run(makeCtx(missingHome));
  assert.equal(missing.severity, 'ok');
  assert.match(missing.finding, /no guard state/);
  assert.equal(missing.fixable, false);
  assert.ok(!fs.existsSync(guardDirOf(missingHome)), 'the check must not create the state dir');

  const home = newHome();
  const dir = guardDirOf(home);
  write(path.join(dir, 'sess-old.json'), guardBody('/p/one'), 2 * DAY);
  write(path.join(dir, 'notes.txt'), 'keep me', 5 * DAY);
  write(path.join(dir, 'nested', 'deep-old.json'), guardBody('/p/two'), 5 * DAY);

  const ctx = makeCtx(home);
  const res = guardState.run(ctx);
  assert.equal(res.severity, 'warn');
  assert.match(res.finding, /1 stale guard session file\b(?!s)/, 'only the top-level *.json counts');

  guardState.fix(ctx, res);
  assert.ok(!fs.existsSync(path.join(dir, 'sess-old.json')));
  assert.equal(fs.readFileSync(path.join(dir, 'notes.txt'), 'utf8'), 'keep me');
  assert.ok(fs.existsSync(path.join(dir, 'nested', 'deep-old.json')), 'no recursion into subdirectories');
});

test('3. guard-state: the TTL is the hook\'s SESSION_TTL_MS', () => {
  assert.equal(typeof hook.SESSION_TTL_MS, 'number');
  assert.equal(guardState.SESSION_TTL_MS, hook.SESSION_TTL_MS);
});

// ─── awareness-state ──────────────────────────────────────────────────────────

function awarenessBody(project, padBytes = 0) {
  const body = { project, updated: '2026-09-28T09:00:00.000Z' };
  if (padBytes > 0) body.peer = { blob: 'x'.repeat(padBytes) };
  return JSON.stringify(body);
}

test('4. awareness-state: orphan, stale and oversized entries -> warn listing each with a reason; fix keeps only the healthy one', () => {
  const home = newHome();
  const dir = awarenessDirOf(home);
  const projA = realProject(home, 'proj-a');
  const projC = realProject(home, 'proj-c');
  const projD = realProject(home, 'proj-d');
  const gone = path.join(home, 'work', 'vanished-project');

  write(path.join(dir, 'proj-a-aaaaaaaa.json'), awarenessBody(projA), HOUR);
  write(path.join(dir, 'vanished-bbbbbbbb.json'), awarenessBody(gone), HOUR);
  write(path.join(dir, 'proj-c-cccccccc.json'), awarenessBody(projC), 10 * DAY);
  write(path.join(dir, 'proj-d-dddddddd.json'), awarenessBody(projD, 2 * MIB), HOUR);

  const ctx = makeCtx(home);
  assert.equal(awarenessState.id, 'awareness-state');
  assert.equal(awarenessState.scope, 'global');

  const res = awarenessState.run(ctx);
  assert.equal(res.severity, 'warn');
  assert.match(res.finding, /3 awareness cache entries/);
  assert.equal(res.fixable, true);

  const byFile = Object.fromEntries(res.details.entries.map((e) => [e.file, e.reasons]));
  assert.deepEqual(Object.keys(byFile).sort(), ['proj-c-cccccccc.json', 'proj-d-dddddddd.json', 'vanished-bbbbbbbb.json']);
  assert.deepEqual(byFile['vanished-bbbbbbbb.json'], ['orphaned']);
  assert.deepEqual(byFile['proj-c-cccccccc.json'], ['stale']);
  assert.deepEqual(byFile['proj-d-dddddddd.json'], ['oversized']);

  const out = awarenessState.fix(ctx, res);
  assert.equal(out.applied, true);
  assert.equal(out.changed.length, 3);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['proj-a-aaaaaaaa.json'], 'only the healthy entry remains');

  const again = awarenessState.run(ctx);
  assert.equal(again.severity, 'ok');
  assert.equal(again.fixable, false);
});

test('4b. awareness-state: an entry that is stale AND oversized lists both reasons', () => {
  const home = newHome();
  const dir = awarenessDirOf(home);
  const proj = realProject(home, 'proj-e');
  write(path.join(dir, 'proj-e-eeeeeeee.json'), awarenessBody(proj, 2 * MIB), 9 * DAY);
  const res = awarenessState.run(makeCtx(home));
  assert.equal(res.severity, 'warn');
  assert.deepEqual(res.details.entries[0].reasons, ['stale', 'oversized']);
});

test('4c. awareness-state: non-json files, subdirectories and an entry with no `project` field are never removed', () => {
  const home = newHome();
  const dir = awarenessDirOf(home);
  write(path.join(dir, 'README.txt'), 'keep me', 30 * DAY);
  write(path.join(dir, 'sub', 'old-ffffffff.json'), awarenessBody('/nowhere'), 30 * DAY);
  write(path.join(dir, 'noproject-99999999.json'), JSON.stringify({ updated: '2026-09-29T00:00:00.000Z' }), HOUR);

  const ctx = makeCtx(home);
  const res = awarenessState.run(ctx);
  assert.equal(res.severity, 'ok', 'an entry with no project path is not provably orphaned');
  assert.ok(fs.existsSync(path.join(dir, 'README.txt')));
  assert.ok(fs.existsSync(path.join(dir, 'sub', 'old-ffffffff.json')));
  assert.ok(fs.existsSync(path.join(dir, 'noproject-99999999.json')));
});

test('5. awareness-state: the legacy-shaped 640KB entry for a live fresh project is ok; details report totalSize', () => {
  const home = newHome();
  const dir = awarenessDirOf(home);
  const proj = realProject(home, 'proj-legacy');
  const file = path.join(dir, 'proj-legacy-11111111.json');
  write(file, awarenessBody(proj, 640 * 1024), 2 * HOUR);
  const size = fs.statSync(file).size;
  assert.ok(size > 640 * 1024 && size < MIB, 'fixture sits between 640KB and the 1 MiB cap');

  const res = awarenessState.run(makeCtx(home));
  assert.equal(res.severity, 'ok');
  assert.equal(res.fixable, false);
  assert.equal(res.details.totalSize, size);
  assert.equal(res.details.entries, 1);
});

test('5b. awareness-state: a large dir of live, fresh, individually-small entries warns without a fix and never deletes them', () => {
  const home = newHome();
  const dir = awarenessDirOf(home);
  const proj = realProject(home, 'proj-shared');
  for (let i = 0; i < 21; i++) {
    write(path.join(dir, `proj-shared-${String(i).padStart(8, '0')}.json`), awarenessBody(proj, MIB - 2048), HOUR);
  }
  const ctx = makeCtx(home);
  const res = awarenessState.run(ctx);
  assert.equal(res.severity, 'warn');
  assert.equal(res.fixable, false, 'nothing is provably removable');
  assert.match(res.finding, /over the 20 MiB cap/);
  assert.equal(typeof res.fix_command, 'string');
  assert.ok(res.fix_command.includes(dir), 'fix_command names the awareness dir');
  assert.equal(fs.readdirSync(dir).length, 21, 'no entry was removed');
});

test('5c. awareness-state: a dir over the cap that also holds removable entries stays fixable, then re-runs as an unfixable warn', () => {
  const home = newHome();
  const dir = awarenessDirOf(home);
  const proj = realProject(home, 'proj-shared');
  for (let i = 0; i < 21; i++) {
    write(path.join(dir, `proj-shared-${String(i).padStart(8, '0')}.json`), awarenessBody(proj, MIB - 2048), HOUR);
  }
  write(path.join(dir, 'vanished-22222222.json'), awarenessBody(path.join(home, 'work', 'gone')), HOUR);

  const ctx = makeCtx(home);
  const res = awarenessState.run(ctx);
  assert.equal(res.severity, 'warn');
  assert.equal(res.fixable, true);

  const out = awarenessState.fix(ctx, res);
  assert.equal(out.applied, true);
  assert.equal(out.changed.length, 1);
  assert.equal(fs.readdirSync(dir).length, 21);

  const again = awarenessState.run(ctx);
  assert.equal(again.severity, 'warn');
  assert.equal(again.fixable, false);
});

test('6. awareness-state: missing dir -> ok and nothing is created', () => {
  const home = newHome();
  const res = awarenessState.run(makeCtx(home));
  assert.equal(res.severity, 'ok');
  assert.equal(res.fixable, false);
  assert.ok(!fs.existsSync(awarenessDirOf(home)));
});

test('6b. awareness-state through the engine: --fix prunes and the post-fix report is ok', () => {
  const home = newHome();
  const dir = awarenessDirOf(home);
  write(path.join(dir, 'vanished-33333333.json'), awarenessBody(path.join(home, 'work', 'gone')), HOUR);
  const base = { userHome: home, env: envFor(home), now: NOW, pluginVersion: '0.0.0-test', checks: [awarenessState] };

  assert.equal(doctor.runDoctor(base).checks[0].severity, 'warn');
  const fixed = doctor.runDoctor({ ...base, fix: true });
  assert.equal(fixed.fixes[0].applied, true);
  assert.equal(fixed.checks[0].severity, 'ok');
  assert.deepEqual(fs.readdirSync(dir), []);
});
