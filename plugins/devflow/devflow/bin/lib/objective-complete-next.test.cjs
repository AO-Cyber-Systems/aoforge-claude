'use strict';

/**
 * The next objective reported by `objective complete` (TRD 68-04, TOOL-04).
 *
 * It used to scan `.planning/objectives/` only, so when the later objectives existed in ROADMAP.md but had no directory
 * yet it reported `next_objective: null, is_last_objective: true` and left STATE.md at "Milestone complete" (pending todo
 * objective-complete-next-objective, seen on objectives 56 and 57). The scan also took the first directory in
 * lexicographic order (`100-z` before `99-y`). `nextObjective` reads directories and ROADMAP sections in number order,
 * skips a cancelled objective, and serves local and store mode alike.
 *
 * Spawns the real binary against temp projects under a fake HOME.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { datedRoadmap, datedProject, LEGACY_STATE } = require('./__fixtures__/objective-renumber-fixtures.cjs');
const objective = require('./objective.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const fn = cleanup.pop();
    fn();
  }
});

function project(opts) {
  const p = datedProject(opts);
  cleanup.push(p.cleanup);
  return p;
}

function fakeHomeEnv() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-objective-next-home-'));
  cleanup.push(() => fs.rmSync(home, { recursive: true, force: true }));
  return Object.assign({}, process.env, { HOME: home });
}

function run(args, cwd) {
  const r = spawnSync(process.execPath, [DF_TOOLS, ...args], {
    cwd,
    env: fakeHomeEnv(),
    encoding: 'utf-8',
    timeout: 30000,
  });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* not JSON */ }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

const A = { num: 1, name: 'Alpha' };
const B = { num: 2, name: 'Bravo' };
const C = { num: 3, name: 'Gamma Ray' };
const D = { num: 4, name: 'Delta' };

describe('objective complete: next_objective comes from directories and ROADMAP sections (TOOL-04)', () => {
  test('8: later objectives only in ROADMAP.md: next_objective is the section number, not last', () => {
    const p = project({ roadmap: datedRoadmap([A, B, C, D]), dirs: [{ dir: '01-a' }, { dir: '02-b' }] });

    const r = run(['objective', 'complete', '2'], p.root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.next_objective, '3');
    assert.equal(r.json.next_objective_name, 'gamma-ray');
    assert.equal(r.json.is_last_objective, false);
  });

  test('9: no later directory and no later section: still the last objective (control)', () => {
    const p = project({ roadmap: datedRoadmap([A, B, C]), dirs: [{ dir: '01-a' }, { dir: '02-b' }, { dir: '03-c' }] });

    const r = run(['objective', 'complete', '3'], p.root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.next_objective, null);
    assert.equal(r.json.next_objective_name, null);
    assert.equal(r.json.is_last_objective, true);
  });

  test('10: a directory and a section for the same number: the directory form wins (control)', () => {
    const p = project({ roadmap: datedRoadmap([A, B, C]), dirs: [{ dir: '01-a' }, { dir: '02-b' }, { dir: '03-c' }] });

    const r = run(['objective', 'complete', '2'], p.root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.next_objective, '03');
    assert.equal(r.json.next_objective_name, 'c');
    assert.equal(r.json.is_last_objective, false);
  });

  test('11: a cancelled directory is skipped even when its section exists; the next section is reported', () => {
    const p = project({
      roadmap: datedRoadmap([A, B, C, D]),
      dirs: [{ dir: '01-a' }, { dir: '02-b' }, { dir: '03-c', cancelled: true }],
    });

    const r = run(['objective', 'complete', '2'], p.root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.next_objective, '4');
    assert.equal(r.json.next_objective_name, 'delta');
    assert.equal(r.json.is_last_objective, false);
  });

  test('12: a decimal section only in ROADMAP.md follows its parent', () => {
    const p = project({
      roadmap: datedRoadmap([A, B, { num: '2.1', name: 'Inserted Fix' }, C]),
      dirs: [{ dir: '01-a' }, { dir: '02-b' }],
    });

    const r = run(['objective', 'complete', '2'], p.root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.next_objective, '2.1');
    assert.equal(r.json.next_objective_name, 'inserted-fix');
    assert.equal(r.json.is_last_objective, false);
  });

  test('13: the numerically smallest later directory wins: 99 before 100', () => {
    const p = project({ roadmap: null, dirs: [{ dir: '98-x' }, { dir: '99-y' }, { dir: '100-z' }] });

    const r = run(['objective', 'complete', '98'], p.root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.next_objective, '99');
    assert.equal(r.json.next_objective_name, 'y');
    assert.equal(r.json.is_last_objective, false);
  });

  test('14: a legacy STATE.md moves to the ROADMAP-only next objective with Status "Ready to plan"', () => {
    const p = project({ roadmap: datedRoadmap([A, B, C]), dirs: [{ dir: '01-a' }, { dir: '02-b' }], state: LEGACY_STATE });

    const r = run(['objective', 'complete', '2'], p.root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.state_updated, true);

    const state = p.read('STATE.md');
    assert.ok(state.includes('**Current Objective:** 3'), state);
    assert.ok(state.includes('**Status:** Ready to plan'), state);
    assert.ok(!state.includes('Milestone complete'), state);
  });
});

describe('nextObjective(root, objectiveNum)', () => {
  test('15: returns {num, name} from directories and sections; store mode shares it and nextObjectiveDir is gone', () => {
    assert.equal(typeof objective.nextObjective, 'function');

    const p = project({ roadmap: datedRoadmap([A, B, C]), dirs: [{ dir: '01-a' }, { dir: '02-b' }] });
    assert.deepEqual(objective.nextObjective(p.root, '2'), { num: '3', name: 'gamma-ray' });
    assert.equal(objective.nextObjective(p.root, '3'), null);

    const source = fs.readFileSync(path.join(__dirname, 'objective.cjs'), 'utf-8');
    assert.ok(!source.includes('nextObjectiveDir'), 'the store-mode scan is replaced, not kept beside the new lookup');
    const start = source.indexOf('function storeObjectiveComplete');
    const end = source.indexOf('\nfunction ', start + 1);
    assert.ok(start !== -1 && source.slice(start, end).includes('nextObjective('), 'storeObjectiveComplete calls nextObjective(');
  });
});
