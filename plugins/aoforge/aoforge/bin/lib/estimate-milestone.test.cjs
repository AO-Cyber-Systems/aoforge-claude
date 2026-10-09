'use strict';

// Tests for estimate-milestone.cjs (TRD 58-07, EST-03 milestone layer). The calibration is the literal CAL_V2, the
// project is the literal MILESTONE_SPEC written into an mkdtemp directory: nothing here reads or writes the real
// ~/.claude/aoforge/calibration.json or this repository's .aoforge.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const milestone = require('./estimate-milestone.cjs');
const roadmap = require('./roadmap.cjs');
const {
  CAL_V2,
  EMPTY_STAT,
  MILESTONE_ROADMAP,
  MILESTONE_SPEC,
  makeCalibration,
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
  assert.equal(sel.objectives[0].dir, '.aoforge/objectives/80-alpha');
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
    const archive = path.join(archived, '.aoforge', 'milestones', 'v0.9-objectives');
    fs.mkdirSync(path.join(archive, '70-legacy'), { recursive: true });
    fs.mkdirSync(path.join(archive, '80-stale'), { recursive: true });
    const sel = milestone.selectMilestoneObjectives(archived, { version: 'v0.9' });
    assert.deepEqual(numbers(sel), ['70']);
    assert.equal(sel.objectives[0].name, 'legacy');
    assert.equal(sel.objectives[0].dir, '.aoforge/milestones/v0.9-objectives/70-legacy');
    assert.deepEqual(sel.absent, ['71', '72', '73', '74', '75', '76', '77', '78', '79']);
    // 80 exists in the current objectives too; the current directory is the one listed.
    const now = milestone.selectMilestoneObjectives(archived);
    assert.equal(now.objectives[0].dir, '.aoforge/objectives/80-alpha');
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

// ─── Task 2: milestone totals, overhead and confidence ────────────────────────
//
// The wall-time anchors were recomputed independently (Python, math.erf, the Fenton-Wilkinson rule of estimate-math.cjs)
// from the objective totals of estimate-rollup.test.cjs (80: 25.6464/69.1577, 81 and 85: 62.2252/184.6035, 83:
// 8.9727/23.5003) and the integration checker's literal 6/9 in CAL_V2. They hold within an absolute 0.1.

const TOL = 0.1;

function near(actual, expected, label) {
  assert.ok(
    typeof actual === 'number' && Math.abs(actual - expected) <= TOL,
    `${label}: expected ${expected} within ${TOL}, got ${actual}`,
  );
}

function nearPair(stat, p50, p90, label) {
  assert.notEqual(stat, null, `${label} is null`);
  near(stat.p50, p50, `${label} p50`);
  near(stat.p90, p90, `${label} p90`);
}

const entry = (result, number) => result.objectives.find((o) => o.number === number);

test('1. estimateMilestone: the current milestone composes its remaining objectives plus one integration checker', () => {
  const r = milestone.estimateMilestone(CAL_V2, root);

  assert.equal(r.version, 'v1.0');
  assert.equal(r.name, 'Now');
  assert.equal(r.range_source, 'milestone bullet');
  assert.deepEqual(r.objectives.map((o) => [o.number, o.status]), [
    ['80', 'partial'],
    ['81', 'unplanned'],
    ['82', 'done'],
    ['83', 'planned'],
    ['84', 'cancelled'],
  ]);
  assert.deepEqual(r.counts, { done: 1, planned: 1, partial: 1, unplanned: 1, cancelled: 1, absent: 0 });

  assert.equal(r.overhead.length, 1);
  assert.equal(r.overhead[0].agent, 'integration-checker');
  assert.equal(r.overhead[0].samples, 4);
  assert.equal(r.overhead[0].confidence, 'low');

  nearPair(r.total.wall_minutes, 109.2527, 276.3459, 'milestone wall');
  for (const key of ['agent_minutes', 'tokens_input', 'tokens_output', 'cost_usd']) {
    assert.notEqual(r.total[key], null, `${key} total`);
    assert.ok(r.total[key].p90 > r.total[key].p50, `${key}: p90 above p50`);
  }

  assert.equal(r.confidence, 'low');
  assert.equal(r.weakest.name, '81');
  assert.equal(r.weakest.status, 'unplanned');
  assert.equal(r.method.across, 'correlated sum, rho 0.5 (Fenton-Wilkinson)');
  assert.deepEqual(r.missing, []);
});

test('2. each objective entry carries its status, TRD counts, total and confidence; done and cancelled ones carry no total', () => {
  const r = milestone.estimateMilestone(CAL_V2, root);

  const alpha = entry(r, '80');
  assert.equal(alpha.name, 'Alpha');
  assert.equal(alpha.dir, '.aoforge/objectives/80-alpha');
  assert.deepEqual(alpha.trds, { total: 4, done: 1, remaining: 3 });
  nearPair(alpha.total.wall_minutes, 25.6464, 69.1577, '80 wall');
  assert.ok(['low', 'medium', 'high'].includes(alpha.confidence), `80 confidence: ${alpha.confidence}`);

  const beta = entry(r, '81');
  assert.deepEqual(beta.trds, { total: 0, done: 0, remaining: 0 });
  nearPair(beta.total.wall_minutes, 62.2252, 184.6035, '81 wall');
  assert.equal(beta.confidence, 'low');

  nearPair(entry(r, '83').total.wall_minutes, 8.9727, 23.5003, '83 wall');

  const gamma = entry(r, '82');
  assert.equal(gamma.total, null);
  assert.deepEqual(gamma.trds, { total: 1, done: 1, remaining: 0 });
  assert.equal(gamma.confidence, 'n/a');

  const epsilon = entry(r, '84');
  assert.equal(epsilon.total, null);
  assert.equal(epsilon.confidence, 'n/a');
  assert.equal(epsilon.status, 'cancelled');
});

test('2b. one note per unplanned objective; nothing else is noted when every objective is planned or done', () => {
  const r = milestone.estimateMilestone(CAL_V2, root);
  assert.equal(r.notes.filter((n) => /unplanned/.test(n)).length, 1);
  assert.ok(r.notes.some((n) => n.startsWith('81')), `the note names objective 81: ${JSON.stringify(r.notes)}`);
  assert.ok(!r.notes.includes('no objectives left'));
});

test('3. a milestone whose objectives all lie outside the project has nothing left', () => {
  const r = milestone.estimateMilestone(CAL_V2, root, { version: 'v0.9' });

  assert.equal(r.version, 'v0.9');
  assert.equal(r.name, 'Old');
  assert.deepEqual(r.objectives, []);
  assert.deepEqual(r.counts, { done: 0, planned: 0, partial: 0, unplanned: 0, cancelled: 0, absent: 10 });
  assert.deepEqual(r.overhead, []);
  for (const key of ['wall_minutes', 'agent_minutes', 'tokens_input', 'tokens_output', 'cost_usd']) {
    assert.deepEqual(r.total[key], { p50: 0, p90: 0 }, `${key} total`);
  }
  assert.equal(r.confidence, 'n/a');
  assert.equal(r.weakest, null);
  assert.ok(r.notes.includes('no objectives left'), JSON.stringify(r.notes));

  assert.deepEqual(milestone.estimateMilestone(CAL_V2, root, { version: '0.9' }), r);
  assert.throws(() => milestone.estimateMilestone(CAL_V2, root, { version: 'v3.0' }), /milestone v3\.0 not in ROADMAP\.md/);
});

test('5. a bullet without objective text estimates every ROADMAP section, a directory-less one as unplanned', () => {
  const bare = makeEstimateProject({
    ...MILESTONE_SPEC,
    roadmap: MILESTONE_ROADMAP.replace(/- ✅[^\n]*\n- 🚧[^\n]*\n/u, '- 🚧 **v2.0 — Next** (in progress)\n'),
  });
  try {
    const r = milestone.estimateMilestone(CAL_V2, bare);
    assert.equal(r.range_source, 'roadmap sections');
    assert.deepEqual(r.objectives.map((o) => o.number), ['80', '81', '82', '83', '84', '85']);
    assert.deepEqual(r.counts, { done: 1, planned: 1, partial: 1, unplanned: 2, cancelled: 1, absent: 0 });

    const later = entry(r, '85');
    assert.equal(later.status, 'unplanned');
    assert.equal(later.dir, null);
    assert.deepEqual(later.trds, { total: 0, done: 0, remaining: 0 });
    nearPair(later.total.wall_minutes, 62.2252, 184.6035, '85 wall');
    assert.ok(r.notes.some((n) => n.startsWith('85') && /no directory/.test(n)), JSON.stringify(r.notes));

    nearPair(r.total.wall_minutes, 180.0413, 445.6294, 'milestone wall with 85');
    assert.equal(r.confidence, 'low');
  } finally {
    removeEstimateProject(bare);
  }
});

test('7. a missing integration-checker history is named in `missing`, adds nothing and caps the confidence at low', () => {
  const cal = makeCalibration({
    agent_overhead: {
      'integration-checker': {
        samples: 0,
        minutes: { ...EMPTY_STAT },
        tokens_input: { ...EMPTY_STAT },
        tokens_output: { ...EMPTY_STAT },
        cost_usd: { ...EMPTY_STAT },
      },
    },
  });
  const r = milestone.estimateMilestone(cal, root);
  assert.deepEqual(r.overhead, []);
  assert.deepEqual(r.missing, ['agent_overhead.integration-checker']);
  nearPair(r.total.wall_minutes, 102.8722, 266.988, 'milestone wall without the integration checker');
  assert.equal(r.confidence, 'low');
});

test('8. an unplanned objective with no objective_level history leaves the milestone total unknown and says why', () => {
  const cal = makeCalibration({ objective_level: undefined });
  const r = milestone.estimateMilestone(cal, root);
  assert.equal(entry(r, '81').total.wall_minutes, null);
  assert.equal(r.total.wall_minutes, null);
  assert.ok(r.missing.includes('81: objective_level'), JSON.stringify(r.missing));
  assert.equal(r.confidence, 'none');
  assert.equal(r.weakest.name, '81');
});
