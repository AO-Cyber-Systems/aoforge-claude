'use strict';

// Tests for estimate-milestone.cjs (TRD 58-07, EST-03 milestone layer). The calibration is the literal CAL_V2, the
// project is the literal MILESTONE_SPEC written into an mkdtemp directory: nothing here reads or writes the real
// ~/.claude/devflow/calibration.json or this repository's .planning.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const milestone = require('./estimate-milestone.cjs');
const roadmap = require('./roadmap.cjs');
const {
  MILESTONE_ROADMAP,
  MILESTONE_SPEC,
  makeEstimateProject,
  removeEstimateProject,
} = require('./__fixtures__/estimate-fixtures.cjs');

let root;
before(() => {
  root = makeEstimateProject(MILESTONE_SPEC);
});
after(() => {
  removeEstimateProject(root);
});

const numbers = (sel) => sel.objectives.map((o) => o.number);

// ─── Task 1: milestone scope from the ROADMAP bullet ──────────────────────────

test('4. milestoneObjectiveNumbers reads the ranges and singles of a bullet\'s "Objectives ..." text', () => {
  assert.deepEqual(milestone.milestoneObjectiveNumbers(' — Objectives 55–64 (in progress)'), {
    ranges: [[55, 64]],
    singles: [],
  });
  assert.deepEqual(milestone.milestoneObjectiveNumbers(' — Objectives 0–9, 6, 8, 24 (shipped 2026-05-06)'), {
    ranges: [[0, 9]],
    singles: [6, 8, 24],
  });
  assert.deepEqual(milestone.milestoneObjectiveNumbers(' - Objectives 1-4 (shipped YYYY-MM-DD)'), {
    ranges: [[1, 4]],
    singles: [],
  });
  assert.deepEqual(milestone.milestoneObjectiveNumbers(' — Objective 3'), { ranges: [], singles: [3] });
  assert.equal(milestone.milestoneObjectiveNumbers(' (2026-01-01, current): no objectives yet.'), null);
});

test('4b. milestoneObjectiveNumbers: decimals, an em dash range, a stop at the first parenthesis, and nothing parseable', () => {
  assert.deepEqual(milestone.milestoneObjectiveNumbers(' — Objectives 4.1–4.3, 7 (completed 2026-10-05; 12 TRDs)'), {
    ranges: [[4.1, 4.3]],
    singles: [7],
  });
  assert.deepEqual(milestone.milestoneObjectiveNumbers(' — Objectives 5—8 — in progress'), { ranges: [[5, 8]], singles: [] });
  assert.equal(milestone.milestoneObjectiveNumbers(''), null);
  assert.equal(milestone.milestoneObjectiveNumbers(' — (in progress)'), null);
});

test('1 (scope). selectMilestoneObjectives: the current milestone takes its objectives from the bullet, in order', () => {
  const sel = milestone.selectMilestoneObjectives(root);

  assert.equal(sel.version, 'v1.0');
  assert.equal(sel.name, 'Now');
  assert.equal(sel.range_source, 'milestone bullet');
  // 85 lies outside 80–84 and is not listed.
  assert.deepEqual(numbers(sel), ['80', '81', '82', '83', '84']);
  assert.deepEqual(sel.objectives.map((o) => o.name), ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon']);
  assert.deepEqual(sel.objectives.map((o) => o.status_hint), ['dir', 'dir', 'dir', 'dir', 'cancelled']);
  assert.equal(sel.objectives[0].dir, '.planning/objectives/80-alpha');
  assert.deepEqual(sel.absent, []);
});

test('3 (scope). a named milestone, with or without the v, and an unknown one', () => {
  const old = milestone.selectMilestoneObjectives(root, { version: 'v0.9' });
  assert.equal(old.version, 'v0.9');
  assert.equal(old.name, 'Old');
  assert.equal(old.range_source, 'milestone bullet');
  // 70–79 have neither a directory nor a ROADMAP section.
  assert.deepEqual(old.objectives, []);
  assert.deepEqual(old.absent, ['70', '71', '72', '73', '74', '75', '76', '77', '78', '79']);

  assert.deepEqual(milestone.selectMilestoneObjectives(root, { version: '0.9' }), old);

  assert.throws(() => milestone.selectMilestoneObjectives(root, { version: 'v3.0' }), /milestone v3\.0 not in ROADMAP\.md/);
  assert.throws(() => milestone.selectMilestoneObjectives(root, { version: '3.0' }), /milestone v3\.0 not in ROADMAP\.md/);
});

test('5 (scope). a bullet with no objective text falls back to every ### Objective section and says so', () => {
  const bare = makeEstimateProject({
    ...MILESTONE_SPEC,
    roadmap: MILESTONE_ROADMAP.replace(/- ✅[^\n]*\n- 🚧[^\n]*\n/u, '- 🚧 **v2.0 — Next** (in progress)\n'),
  });
  try {
    const sel = milestone.selectMilestoneObjectives(bare);
    assert.equal(sel.version, 'v2.0');
    assert.equal(sel.name, 'Next');
    assert.equal(sel.range_source, 'roadmap sections');
    assert.deepEqual(numbers(sel), ['80', '81', '82', '83', '84', '85']);
    // 85 has a section but no directory.
    assert.equal(sel.objectives[5].name, 'Later');
    assert.equal(sel.objectives[5].dir, null);
    assert.equal(sel.objectives[5].status_hint, 'no_dir');
    assert.equal(sel.objectives[4].status_hint, 'cancelled');
    assert.deepEqual(sel.absent, []);
  } finally {
    removeEstimateProject(bare);
  }
});

test('5b. singles join the ranges; a single with neither a directory nor a section is absent', () => {
  const mixed = makeEstimateProject({
    ...MILESTONE_SPEC,
    roadmap: MILESTONE_ROADMAP.replace('Objectives 80–84 (in progress)', 'Objectives 80–81, 85, 90 (in progress)'),
  });
  try {
    const sel = milestone.selectMilestoneObjectives(mixed);
    // 80 and 81 by range, 85 as a single (section, no directory); 90 has neither, so it is absent.
    assert.deepEqual(numbers(sel), ['80', '81', '85']);
    assert.deepEqual(sel.objectives.map((o) => o.status_hint), ['dir', 'dir', 'no_dir']);
    assert.deepEqual(sel.absent, ['90']);
  } finally {
    removeEstimateProject(mixed);
  }
});

test('5c. an archived objective directory counts as the objective\'s directory, a current one wins', () => {
  const archived = makeEstimateProject(MILESTONE_SPEC);
  try {
    const archive = path.join(archived, '.planning', 'milestones', 'v0.9-objectives');
    fs.mkdirSync(path.join(archive, '70-legacy'), { recursive: true });
    fs.mkdirSync(path.join(archive, '80-stale'), { recursive: true });
    const sel = milestone.selectMilestoneObjectives(archived, { version: 'v0.9' });
    assert.deepEqual(numbers(sel), ['70']);
    assert.equal(sel.objectives[0].name, 'legacy');
    assert.equal(sel.objectives[0].dir, '.planning/milestones/v0.9-objectives/70-legacy');
    assert.deepEqual(sel.absent, ['71', '72', '73', '74', '75', '76', '77', '78', '79']);
    // 80 exists in the current objectives too; the current directory is the one listed.
    const now = milestone.selectMilestoneObjectives(archived);
    assert.equal(now.objectives[0].dir, '.planning/objectives/80-alpha');
  } finally {
    removeEstimateProject(archived);
  }
});

test('5d. a ROADMAP.md that is missing, or has no milestone bullet, is an error that names the problem', () => {
  const none = makeEstimateProject({ ...MILESTONE_SPEC, roadmap: undefined });
  try {
    assert.throws(() => milestone.selectMilestoneObjectives(none), /ROADMAP\.md not found/);
  } finally {
    removeEstimateProject(none);
  }
  const bare = makeEstimateProject({ ...MILESTONE_SPEC, roadmap: '# Roadmap\n\n### Objective 80: Alpha\n' });
  try {
    assert.throws(() => milestone.selectMilestoneObjectives(bare), /no milestone in ROADMAP\.md/);
  } finally {
    removeEstimateProject(bare);
  }
});

test('6. roadmap.cjs exports parseMilestoneBullets and pickMilestone, and getMilestoneInfo is unchanged', () => {
  assert.equal(typeof roadmap.parseMilestoneBullets, 'function');
  assert.equal(typeof roadmap.pickMilestone, 'function');

  const bullets = roadmap.parseMilestoneBullets(MILESTONE_ROADMAP);
  assert.deepEqual(bullets.map((b) => b.digits), ['0.9', '1.0']);
  assert.equal(roadmap.pickMilestone(bullets).digits, '1.0');
  assert.equal(bullets[1].rest, ' — Objectives 80–84 (in progress)');

  assert.deepEqual(roadmap.getMilestoneInfo(root), { version: 'v1.0', name: 'Now' });
});
