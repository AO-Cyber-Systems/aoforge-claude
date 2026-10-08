'use strict';

/**
 * Tests for validate health Check 19: the `.planning/.skill-active` marker, E006 and W064 (TRD 69-02, TOOL-09).
 *
 * Check 19 renders what skill-marker-health returns: E006 `skill-marker-tracked` (an error) when the marker is in the
 * git index, W064 `skill-marker-stale` (a warning) when an untracked marker is expired, unparseable or empty, or has no
 * expires_at and is older than the 8h TTL. `--repair` untracks and/or removes that one file behind the DOC-06 index
 * guard and touches nothing else.
 *
 * Hermetic: every project is makeMarkerProject (a temp git repo with literal marker JSON and a fake HOME). In-process
 * runs inject `homeDir`, `mainVersionFn` (no git fetch in Check 11), `installedPluginFn` and `nowMs`; the process
 * environment points git at the fake HOME for the duration of a run. Test 1 spawns the real CLI.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { cmdValidateHealth } = require('./validate.cjs');
const { makeMarkerProject, MARKER_REL } = require('./__fixtures__/skill-marker-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');
const INSTALLED = () => ({ version: '2.14.0', installPath: '/fake' });
const MARKER_NAME = '.skill-active';
const created = [];

function project(opts) {
  const p = makeMarkerProject(opts);
  created.push(p);
  return p;
}

afterEach(() => {
  while (created.length) created.pop().cleanup();
});

/** cmdValidateHealth ends in output(), which prints and exits: capture the JSON and swallow the exit. */
function runHealth(p, { repair = false, ...extra } = {}) {
  const chunks = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  const origExit = process.exit.bind(process);
  const gitConfigEnv = { HOME: p.env.HOME, XDG_CONFIG_HOME: p.env.XDG_CONFIG_HOME, GIT_CONFIG_NOSYSTEM: '1' };
  const savedEnv = {};
  for (const key of Object.keys(gitConfigEnv)) savedEnv[key] = process.env[key];
  Object.assign(process.env, gitConfigEnv);
  process.stdout.write = (chunk) => { chunks.push(chunk); return true; };
  process.exit = (code) => { throw new Error(`process.exit(${code})`); };
  try {
    cmdValidateHealth(p.root, {
      repair, homeDir: p.home, mainVersionFn: () => null, installedPluginFn: INSTALLED, nowMs: p.nowMs, ...extra,
    }, true);
  } catch (e) {
    if (!e.message.startsWith('process.exit')) throw e;
  } finally {
    process.stdout.write = origWrite;
    process.exit = origExit;
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  return JSON.parse(chunks[chunks.length - 1]);
}

const all = (json) => [...json.errors, ...json.warnings, ...json.info];
const byCode = (json, code) => all(json).filter((i) => i.code === code);

/** The project's files after a repair: the before-snapshot with the marker (and only the marker) taken out. */
function withoutMarker(snapshot) {
  const copy = new Map(snapshot);
  copy.delete(MARKER_REL);
  return [...copy];
}

describe('Check 19: the spawned CLI (test 1)', () => {
  test('1. a tracked expired marker is E006 (broken); --repair leaves exactly one staged deletion', () => {
    const p = project({ marker: 'expired', tracked: true });
    const before = p.snapshot();
    const head = p.git(['rev-parse', 'HEAD']).stdout;
    const run = (...args) => {
      const r = spawnSync('node', [DF_TOOLS, '--cwd', p.root, 'validate', 'health', ...args], {
        env: p.env, encoding: 'utf-8', input: '',
      });
      assert.equal(r.status, 0, r.stderr);
      return JSON.parse(r.stdout);
    };

    const report = run();
    const e006 = byCode(report, 'E006');
    assert.equal(e006.length, 1, JSON.stringify(report.errors));
    assert.equal(report.errors.filter((i) => i.code === 'E006').length, 1, 'an error, not a warning');
    assert.equal(e006[0].repairable, true);
    assert.equal(report.status, 'broken');
    assert.equal(byCode(report, 'W064').length, 0, 'E006 carries the stale reason; W064 is not also reported');
    assert.equal(p.porcelain(), '', 'a report-only run changes nothing');

    const repaired = run('--repair');
    const done = repaired.repairs_performed || [];
    assert.deepEqual(done.filter((r) => r.action === 'untrackSkillMarker'),
      [{ action: 'untrackSkillMarker', success: true, path: MARKER_NAME }]);
    assert.deepEqual(done.filter((r) => r.action === 'removeStaleSkillMarker'),
      [{ action: 'removeStaleSkillMarker', success: true, path: MARKER_NAME }]);
    assert.equal(p.porcelain(), 'D  .planning/.skill-active\n');
    assert.equal(fs.existsSync(p.markerPath), false);
    assert.equal(p.git(['rev-parse', 'HEAD']).stdout, head, 'HEAD has not moved');
    assert.deepEqual([...p.snapshot()], withoutMarker(before), 'every other file is byte-identical');
  });
});

describe('Check 19: stale and live markers', () => {
  test('2. an untracked expired marker is a repairable W064; --repair removes only the marker', () => {
    const p = project({ marker: 'expired' });
    const before = p.snapshot();
    const report = runHealth(p);
    const w064 = byCode(report, 'W064');
    assert.equal(w064.length, 1, JSON.stringify(report.warnings));
    assert.equal(report.warnings.filter((i) => i.code === 'W064').length, 1, 'a warning');
    assert.equal(w064[0].repairable, true);
    assert.equal(byCode(report, 'E006').length, 0);
    assert.match(w064[0].message, /^skill-marker-stale: \.planning\/\.skill-active \(expired at /);

    const repaired = runHealth(p, { repair: true });
    assert.deepEqual((repaired.repairs_performed || []).filter((r) => r.action.endsWith('SkillMarker')),
      [{ action: 'removeStaleSkillMarker', success: true, path: MARKER_NAME }]);
    assert.equal(fs.existsSync(p.markerPath), false);
    assert.equal(p.porcelain(), '', 'untracked file removed, nothing staged');
    assert.deepEqual([...p.snapshot()], withoutMarker(before));
  });

  test('3. an untracked live marker produces neither E006 nor W064', () => {
    const p = project({ marker: 'live' });
    const report = runHealth(p);
    assert.deepEqual(byCode(report, 'E006'), []);
    assert.deepEqual(byCode(report, 'W064'), []);
  });

  test('3. no marker at all produces neither code', () => {
    const report = runHealth(project({ marker: null }));
    assert.deepEqual([...byCode(report, 'E006'), ...byCode(report, 'W064')], []);
  });

  for (const marker of ['garbage', 'empty']) {
    test(`4. a ${marker} marker is a W064 whose message says unparseable`, () => {
      const report = runHealth(project({ marker }));
      const w064 = byCode(report, 'W064');
      assert.equal(w064.length, 1, JSON.stringify(report.warnings));
      assert.ok(w064[0].message.includes('unparseable'), w064[0].message);
      assert.equal(w064[0].repairable, true);
    });
  }

  test('5. no expires_at and started 9h ago is a W064 "no expires_at"; started 1h ago is not', () => {
    const old = byCode(runHealth(project({ marker: 'legacyOld' })), 'W064');
    assert.equal(old.length, 1);
    assert.ok(old[0].message.includes('no expires_at'), old[0].message);
    assert.deepEqual(byCode(runHealth(project({ marker: 'legacyFresh' })), 'W064'), []);
  });
});

describe('Check 19: tracked markers and the repair guard', () => {
  test('6. tracked, live and ignored: a repairable E006; --repair untracks it and keeps the file byte-identical', () => {
    const p = project({ marker: 'live', tracked: true, ignored: true });
    const bytes = fs.readFileSync(p.markerPath);
    const before = p.snapshot();

    const report = runHealth(p);
    const e006 = byCode(report, 'E006');
    assert.equal(e006.length, 1);
    assert.equal(e006[0].repairable, true);
    assert.doesNotMatch(e006[0].message, /stale/);

    const repaired = runHealth(p, { repair: true });
    const done = (repaired.repairs_performed || []).filter((r) => r.action.endsWith('SkillMarker'));
    assert.deepEqual(done, [{ action: 'untrackSkillMarker', success: true, path: MARKER_NAME }]);
    assert.deepEqual(fs.readFileSync(p.markerPath), bytes);
    assert.equal(p.porcelain(), 'D  .planning/.skill-active\n');
    assert.deepEqual([...p.snapshot()], [...before]);
  });

  test('7. tracked, live, NOT ignored: E006 repairable:false, the fix names .gitignore; --repair changes nothing', () => {
    const p = project({ marker: 'live', tracked: true });
    const before = p.snapshot();

    const report = runHealth(p);
    const e006 = byCode(report, 'E006');
    assert.equal(e006.length, 1);
    assert.equal(e006[0].repairable, false);
    assert.ok(e006[0].fix.includes('.gitignore'), e006[0].fix);

    const repaired = runHealth(p, { repair: true });
    assert.equal(repaired.repairs_performed, undefined);
    assert.equal(p.porcelain(), '');
    assert.deepEqual(p.tracked(), [MARKER_REL]);
    assert.deepEqual([...p.snapshot()], [...before]);
  });

  test('8. tracked and expired with an unrelated file staged: E006 repairable:false; --repair changes nothing', () => {
    const p = project({ marker: 'expired', tracked: true, stagedOther: true });
    const before = p.snapshot();

    const report = runHealth(p);
    const e006 = byCode(report, 'E006');
    assert.equal(e006.length, 1);
    assert.equal(e006[0].repairable, false);
    assert.ok(e006[0].fix.includes('staged changes present'), e006[0].fix);

    const repaired = runHealth(p, { repair: true });
    assert.equal(repaired.repairs_performed, undefined);
    assert.equal(p.porcelain(), 'A  notes.txt\n', 'the DOC-06 guard removed nothing');
    assert.equal(fs.existsSync(p.markerPath), true);
    assert.deepEqual([...p.snapshot()], [...before]);
  });

  test('9. not a git repository: an expired marker is W064 only; --repair removes it', () => {
    const p = project({ git: false, marker: 'expired' });
    const report = runHealth(p);
    assert.equal(byCode(report, 'W064').length, 1);
    assert.deepEqual(byCode(report, 'E006'), []);

    const repaired = runHealth(p, { repair: true });
    assert.deepEqual((repaired.repairs_performed || []).filter((r) => r.action.endsWith('SkillMarker')),
      [{ action: 'removeStaleSkillMarker', success: true, path: MARKER_NAME }]);
    assert.equal(fs.existsSync(p.markerPath), false);
  });
});

describe('Check 19: a failing check is reported, never silent (test 10)', () => {
  test('10. an inspector that throws -> W064 skill-marker-check-failed, not repairable', () => {
    const p = project({ marker: 'expired' });
    const report = runHealth(p, { skillMarkerHealth: { inspect() { throw new Error('boom'); } } });
    const w064 = byCode(report, 'W064');
    assert.equal(w064.length, 1, JSON.stringify(report.warnings));
    assert.equal(w064[0].message, 'skill-marker-check-failed: boom');
    assert.equal(w064[0].repairable, false);
    assert.equal(fs.existsSync(p.markerPath), true, 'a check that could not run repairs nothing');
  });

  test('a repair the module refuses is reported as a failed repairSkillMarker action', () => {
    const p = project({ marker: 'expired' });
    const stub = {
      inspect: () => ({}),
      planRepair: () => ({ actions: ['remove'], fixable: true, refused: null }),
      findings: () => [{ severity: 'warning', code: 'W064', message: 'skill-marker-stale: x', fix: 'y', repairable: true }],
      repair: () => ({ applied: false, untracked: [], removed: [], refused: 'staged changes present: notes.txt', notes: '' }),
    };
    const report = runHealth(p, { repair: true, skillMarkerHealth: stub });
    assert.deepEqual(report.repairs_performed,
      [{ action: 'repairSkillMarker', success: false, error: 'staged changes present: notes.txt' }]);
  });

  test('repairSkillMarker is queued at most once per run', () => {
    const p = project({ marker: 'expired' });
    let calls = 0;
    const stub = {
      inspect: () => ({}),
      planRepair: () => ({ actions: ['remove'], fixable: true, refused: null }),
      findings: () => [
        { severity: 'error', code: 'E006', message: 'a', fix: 'f', repairable: true },
        { severity: 'warning', code: 'W064', message: 'b', fix: 'f', repairable: true },
      ],
      repair: () => { calls += 1; return { applied: true, untracked: [], removed: [MARKER_REL], refused: null, notes: '' }; },
    };
    runHealth(p, { repair: true, skillMarkerHealth: stub });
    assert.equal(calls, 1);
  });
});
