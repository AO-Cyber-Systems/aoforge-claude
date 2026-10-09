'use strict';

/**
 * `roadmap_updated` on `objective remove --confirm` and `objective complete` (TRD 59-05, PLMB-05).
 *
 * Both used to report that ROADMAP.md exists, not that it changed: `remove` always wrote and returned `true`,
 * `complete` returned `fs.existsSync(roadmapPath)`. A caller could not tell a no-op from an edit. They now follow the
 * TOOL-02 rule already used for `state_updated`: compare the text before and after, write only when it differs, and
 * report that.
 *
 * Spawns the real binary against temp projects under a fake HOME. `objective remove` cascade-renumbers everything above
 * the removed objective, so nothing here ever points at this repository's own `.aoforge/`.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { roadmapFor, flagsProject } = require('./__fixtures__/objective-flags-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const fn = cleanup.pop();
    fn();
  }
});

function project(opts) {
  const p = flagsProject(opts);
  cleanup.push(p.cleanup);
  return p;
}

function fakeHomeEnv() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-objective-flags-home-'));
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

/** Pin the file's mtime to a fixed past instant so a later rewrite is visible even within one clock tick. */
function pinMtime(p, rel) {
  const when = new Date('2020-01-01T00:00:00Z');
  fs.utimesSync(path.join(p.root, '.aoforge', rel), when, when);
  return p.mtime(rel);
}

const THREE = [
  { num: 1, name: 'A' },
  { num: 2, name: 'B' },
  { num: 3, name: 'C' },
];
const THREE_DIRS = [{ dir: '01-a' }, { dir: '02-b' }, { dir: '03-c' }];

describe('objective remove --confirm: roadmap_updated follows a real change (PLMB-05)', () => {
  test('1: ROADMAP mentions the objective: roadmap_updated true, section gone, later objective renumbered', () => {
    const p = project({ roadmap: roadmapFor(THREE), objectives: THREE_DIRS });

    const r = run(['objective', 'remove', '2', '--confirm'], p.root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.mutated, true);
    assert.equal(r.json.roadmap_updated, true);

    const roadmap = p.read('ROADMAP.md');
    assert.doesNotMatch(roadmap, /Objective 2: B/, 'the removed objective is gone');
    assert.match(roadmap, /### Objective 2: C/, 'objective 3 became 2');
    assert.doesNotMatch(roadmap, /Objective 3:/);
  });

  test('2: ROADMAP never mentions the objective: roadmap_updated false, ROADMAP bytes and mtime untouched', () => {
    const roadmap = roadmapFor([
      { num: 1, name: 'A' },
      { num: 2, name: 'B' },
    ]);
    const p = project({ roadmap, objectives: THREE_DIRS });
    const mtimeBefore = pinMtime(p, 'ROADMAP.md');

    const r = run(['objective', 'remove', '3', '--confirm'], p.root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.mutated, true, 'the directory removal still happened');
    assert.equal(r.json.directory_deleted, '03-c');
    assert.equal(r.json.roadmap_updated, false);

    assert.equal(p.read('ROADMAP.md'), roadmap, 'ROADMAP.md bytes unchanged');
    assert.equal(p.mtime('ROADMAP.md'), mtimeBefore, 'ROADMAP.md was not rewritten');
    assert.equal(fs.existsSync(path.join(p.root, '.aoforge', 'objectives', '03-c')), false);
  });

  test('3: a dry run (no --confirm) reports roadmap_updated false and writes nothing', () => {
    const roadmap = roadmapFor(THREE);
    const p = project({ roadmap, objectives: THREE_DIRS });
    const mtimeBefore = pinMtime(p, 'ROADMAP.md');

    const r = run(['objective', 'remove', '2'], p.root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.dry_run, true);
    assert.equal(r.json.roadmap_updated, false);

    assert.equal(p.read('ROADMAP.md'), roadmap);
    assert.equal(p.mtime('ROADMAP.md'), mtimeBefore);
    assert.equal(fs.existsSync(path.join(p.root, '.aoforge', 'objectives', '02-b')), true);
  });
});

describe('objective complete: roadmap_updated follows a real change (PLMB-05)', () => {
  const ONE = [{ dir: '01-a', trds: ['01'], summaries: ['01'] }];

  test('4: first run ticks the checkbox and reports roadmap_updated true', () => {
    const p = project({ roadmap: roadmapFor([{ num: 1, name: 'A' }]), objectives: ONE });
    assert.match(p.read('ROADMAP.md'), /- \[ \] Objective 1: A/);

    const r = run(['objective', 'complete', '1'], p.root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.roadmap_updated, true);
    assert.match(p.read('ROADMAP.md'), /- \[x\] Objective 1: A \(completed \d{4}-\d{2}-\d{2}\)/);
  });

  test('5: a second run changes nothing: roadmap_updated false, ROADMAP bytes and mtime untouched', () => {
    const p = project({ roadmap: roadmapFor([{ num: 1, name: 'A' }]), objectives: ONE });

    const first = run(['objective', 'complete', '1'], p.root);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.json.roadmap_updated, true);

    const afterFirst = p.read('ROADMAP.md');
    const mtimeBefore = pinMtime(p, 'ROADMAP.md');

    const second = run(['objective', 'complete', '1'], p.root);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(second.json.roadmap_updated, false);
    assert.equal(p.read('ROADMAP.md'), afterFirst, 'ROADMAP.md bytes unchanged');
    assert.equal(p.mtime('ROADMAP.md'), mtimeBefore, 'ROADMAP.md was not rewritten');
  });

  test('6: no ROADMAP.md at all reports roadmap_updated false', () => {
    const p = project({ roadmap: null, objectives: ONE });
    assert.equal(fs.existsSync(path.join(p.root, '.aoforge', 'ROADMAP.md')), false);

    const r = run(['objective', 'complete', '1'], p.root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.roadmap_updated, false);
    assert.equal(fs.existsSync(path.join(p.root, '.aoforge', 'ROADMAP.md')), false, 'no ROADMAP.md was created');
  });
});

// TRD test 7 (objective.test.cjs passes without edits) is a gate, not a case in this file: that suite already runs in
// `npm test` and in the scoped gate, and a nested copy here would only fail twice for the same reason. Its one failure,
// 48-14 case 1d, is a stale pin and is reported in the SUMMARY (see 59-05-SUMMARY.md).
