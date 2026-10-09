'use strict';

/**
 * `objective remove` leaves dates and metadata alone (TRD 68-04, TOOL-03).
 *
 * The renumber pass rewrote `${oldPad}-NN` wherever it appeared, so removing objective 1 turned a progress row's
 * `2026-03-15` into `2025-02-15` (59-05 Deferred Issues) and any objective numbered 26 rewrote every `2026-` date. The
 * TRD-reference rule is now bounded: no word character, `.` or `-` before it, and not followed by a digit or `-<digit>`.
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

const { datedRoadmap, datedProject, isoDates } = require('./__fixtures__/objective-renumber-fixtures.cjs');
const objective = require('./objective.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');

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
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-objective-renumber-home-'));
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

function lines(text) {
  return text.split('\n');
}

/** `all` minus `remove`, one occurrence per removed token (the multiset difference). */
function minusMultiset(all, remove) {
  const out = [...all];
  for (const t of remove) {
    const i = out.indexOf(t);
    assert.notEqual(i, -1, `${t} was removed but is not in the original`);
    out.splice(i, 1);
  }
  return out.sort();
}

/** The checkbox line, progress row and section of objective `num` in a ROADMAP text: what `objective remove` deletes. */
function fragmentsOf(text, num) {
  const checkbox = lines(text).find((l) => l.startsWith(`- [`) && l.includes(`Objective ${num}:`)) || '';
  const row = lines(text).find((l) => l.startsWith(`| ${num}. `)) || '';
  const start = text.indexOf(`### Objective ${num}:`);
  const next = text.indexOf('\n### Objective ', start + 1);
  const section = text.slice(start, next === -1 ? text.length : next);
  return [checkbox, row, section].join('\n');
}

describe('objective remove --confirm: dates and metadata survive the renumber (TOOL-03)', () => {
  test('1: 59-05 reproduction: removing objective 1 leaves objective 2 (now 1) with its 2026-03-15 date byte for byte', () => {
    const roadmap = datedRoadmap([
      { num: 1, name: 'A' },
      { num: 2, name: 'B', done: true, completed: '2026-03-15', plans: '2/2' },
      { num: 3, name: 'C' },
    ]);
    const p = project({ roadmap, dirs: [{ dir: '01-a' }, { dir: '02-b' }, { dir: '03-c' }] });

    const r = run(['objective', 'remove', '1', '--confirm'], p.root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.roadmap_updated, true);

    const after = p.read('ROADMAP.md');
    assert.ok(after.includes('\n| 1. B | v1.0 | 2/2 | Complete | 2026-03-15 |\n'), after);
    assert.ok(after.includes('\n- [x] Objective 1: B (completed 2026-03-15)\n'), after);
    assert.ok(!after.includes('2025-02-15'), 'the date must not be rewritten to 2025-02-15');
  });

  test('2: the 2026 collision: removing 24 renumbers 25 and 26 and keeps every 2026-10-08', () => {
    const roadmap = datedRoadmap([
      { num: 24, name: 'A', done: true, completed: '2026-10-08' },
      { num: 25, name: 'B', done: true, completed: '2026-10-08' },
      { num: 26, name: 'C', done: true, completed: '2026-10-08', trds: ['01'] },
    ]);
    const p = project({ roadmap, dirs: [{ dir: '24-a' }, { dir: '25-b' }, { dir: '26-c' }] });

    const r = run(['objective', 'remove', '24', '--confirm'], p.root);
    assert.equal(r.status, 0, r.stderr);

    const after = p.read('ROADMAP.md');
    assert.ok(after.includes('### Objective 24: B'), after);
    assert.ok(after.includes('### Objective 25: C'), after);
    assert.ok(!after.includes('Objective 26'), after);
    assert.ok(after.includes('- [x] 25-01-c-TRD.md — text (25-01\'s note)'), `26-01 reference becomes 25-01:\n${after}`);
    // Objectives 25 and 26 kept their checkbox and row; objective 24's own two tokens went with it.
    assert.deepEqual(isoDates(after), ['2026-10-08', '2026-10-08', '2026-10-08', '2026-10-08']);
    assert.ok(!/2025-\d\d-\d\d/.test(after), `no 2025- date appears:\n${after}`);
  });

  test('3: the ISO date and timestamp multiset after is the multiset before minus the removed objective\'s tokens', () => {
    const roadmap = datedRoadmap(
      [
        { num: 1, name: 'A', done: true, completed: '2026-01-20' },
        { num: 2, name: 'B', done: true, completed: '2026-02-11', extras: ['stamped 2026-10-08T12:30:00Z'] },
        { num: 3, name: 'C', done: true, completed: '2026-03-15', extras: ['Shipped: 2026-10-05', 'stamped 2026-10-08T12:30:00Z'] },
        { num: 4, name: 'D', done: true, completed: '2026-10-08' },
      ],
      ['Last reviewed 2026-09-30']
    );
    const before = roadmap;
    const p = project({ roadmap, dirs: [{ dir: '01-a' }, { dir: '02-b' }, { dir: '03-c' }, { dir: '04-d' }] });

    const r = run(['objective', 'remove', '2', '--confirm'], p.root);
    assert.equal(r.status, 0, r.stderr);

    const after = p.read('ROADMAP.md');
    const removed = isoDates(fragmentsOf(before, 2));
    assert.ok(removed.includes('2026-10-08T12:30:00Z'), 'the removed section carries a timestamp token');
    assert.deepEqual(isoDates(after), minusMultiset(isoDates(before), removed));
  });

  test('4: status, plans, milestone, requirements and stray NN-NN tokens of a renumbered objective are byte-identical', () => {
    const roadmap = datedRoadmap([
      { num: 1, name: 'A' },
      { num: 2, name: 'B' },
      {
        num: 3,
        name: 'C',
        done: true,
        completed: '2026-03-12',
        milestone: 'v1.1',
        plans: '2/2',
        requirements: 'AUTH-01, AUTH-02',
        extras: ['Shipped: 2026-10-05', 'US style 03-15-2026 stays', 'Ticket AUTH-03-01 stays'],
      },
    ]);
    const p = project({ roadmap, dirs: [{ dir: '01-a' }, { dir: '02-b' }, { dir: '03-c' }] });

    const r = run(['objective', 'remove', '2', '--confirm'], p.root);
    assert.equal(r.status, 0, r.stderr);

    const after = lines(p.read('ROADMAP.md'));
    for (const line of [
      '| 2. C | v1.1 | 2/2 | Complete | 2026-03-12 |',
      '- [x] Objective 2: C (completed 2026-03-12)',
      '**Requirements**: AUTH-01, AUTH-02',
      'Shipped: 2026-10-05',
      'US style 03-15-2026 stays',
      'Ticket AUTH-03-01 stays',
    ]) {
      assert.ok(after.includes(line), `missing byte-identical line: ${line}\n${after.join('\n')}`);
    }
  });

  test('5: headings, checkboxes, table numbers, Depends-on lines and 03-01 TRD references still renumber', () => {
    const roadmap = datedRoadmap([
      { num: 1, name: 'A' },
      { num: 2, name: 'B' },
      {
        num: 3,
        name: 'C',
        trds: ['01'],
        extras: [
          'See 03-01 for details.',
          'Read `03-01-c-TRD.md` first.',
          'Done (03-01) already.',
          'Path: .aoforge/objectives/x/03-01-c-TRD.md',
        ],
      },
      { num: 4, name: 'D', dependsOn: 3 },
    ]);
    const p = project({ roadmap, dirs: [{ dir: '01-a' }, { dir: '02-b' }, { dir: '03-c' }, { dir: '04-d' }] });

    const r = run(['objective', 'remove', '2', '--confirm'], p.root);
    assert.equal(r.status, 0, r.stderr);

    const after = lines(p.read('ROADMAP.md'));
    for (const line of [
      '### Objective 2: C',
      '### Objective 3: D',
      '- [ ] Objective 2: C',
      '- [ ] Objective 3: D',
      '| 2. C | v1.0 | 0/1 | Planned | — |',
      '| 3. D | v1.0 | 0/1 | Planned | — |',
      '**Depends on**: Objective 2',
      '- [x] 02-01-c-TRD.md — text (02-01\'s note)',
      'See 02-01 for details.',
      'Read `02-01-c-TRD.md` first.',
      'Done (02-01) already.',
      'Path: .aoforge/objectives/x/02-01-c-TRD.md',
    ]) {
      assert.ok(after.includes(line), `missing renumbered line: ${line}\n${after.join('\n')}`);
    }
  });
});

describe('renumberRoadmapText(text, removedInt): the pure renumber pass', () => {
  const { renumberRoadmapText } = objective;

  test('6: exported; renumbers objectives above the removed one and leaves dates and metadata alone (no fs)', () => {
    assert.equal(typeof renumberRoadmapText, 'function');

    const text = datedRoadmap(
      [
        { num: 2, name: 'B', done: true, completed: '2026-03-15', milestone: 'v1.2', plans: '2/2', requirements: 'AUTH-01, AUTH-02' },
        {
          num: 3,
          name: 'C',
          trds: ['01'],
          dependsOn: 2,
          extras: [
            'Shipped: 2026-10-05',
            'stamped 2026-10-08T12:30:00Z',
            'US style 03-15-2026 stays',
            'Ticket AUTH-03-01 stays',
            'Version v1.03-01 stays',
            'Glued abc03-01 stays',
            'Longer 03-0123 stays',
            'Chained 03-01-02 stays',
            'Prose 03-01, `03-01-c-TRD.md`, (03-01) and 03-01\'s move',
          ],
        },
      ],
      ['Dated 2026-02-15 and 2026-03-15 stay']
    );

    const out = renumberRoadmapText(text, 1);
    assert.equal(typeof out, 'string');

    const outLines = lines(out);
    for (const line of [
      '### Objective 1: B',
      '### Objective 2: C',
      '| 1. B | v1.2 | 2/2 | Complete | 2026-03-15 |',
      '- [x] Objective 1: B (completed 2026-03-15)',
      '**Requirements**: AUTH-01, AUTH-02',
      '**Depends on**: Objective 1',
      '- [x] 02-01-c-TRD.md — text (02-01\'s note)',
      'Prose 02-01, `02-01-c-TRD.md`, (02-01) and 02-01\'s move',
      // Not TRD references: a date, a US-style date, a version, a ticket id, a glued token, a longer number, a chain.
      'Shipped: 2026-10-05',
      'stamped 2026-10-08T12:30:00Z',
      'US style 03-15-2026 stays',
      'Ticket AUTH-03-01 stays',
      'Version v1.03-01 stays',
      'Glued abc03-01 stays',
      'Longer 03-0123 stays',
      'Chained 03-01-02 stays',
      'Dated 2026-02-15 and 2026-03-15 stay',
    ]) {
      assert.ok(outLines.includes(line), `missing line: ${line}\n${out}`);
    }
    assert.deepEqual(isoDates(out), isoDates(text));
  });

  test('6b: a 26 above the removed objective renumbers while every 2026- date keeps its bytes', () => {
    const text = datedRoadmap([
      { num: 26, name: 'Z', done: true, completed: '2026-10-08', trds: ['01'] },
    ]);
    const out = renumberRoadmapText(text, 25);
    assert.ok(out.includes('### Objective 25: Z'), out);
    assert.ok(out.includes('| 25. Z | v1.0 | 0/1 | Complete | 2026-10-08 |'), out);
    assert.ok(out.includes('- [x] 25-01-z-TRD.md — text (25-01\'s note)'), out);
    assert.deepEqual(isoDates(out), isoDates(text));
  });
});

describe('objective remove without --confirm (control)', () => {
  test('7: a dry run writes nothing', () => {
    const roadmap = datedRoadmap([
      { num: 1, name: 'A' },
      { num: 2, name: 'B', done: true, completed: '2026-03-15' },
    ]);
    const p = project({ roadmap, dirs: [{ dir: '01-a' }, { dir: '02-b' }] });

    const r = run(['objective', 'remove', '1'], p.root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.dry_run, true);
    assert.equal(r.json.mutated, false);
    assert.equal(p.read('ROADMAP.md'), roadmap);
    assert.deepEqual(fs.readdirSync(path.join(p.root, '.aoforge', 'objectives')).sort(), ['01-a', '02-b']);
  });
});
