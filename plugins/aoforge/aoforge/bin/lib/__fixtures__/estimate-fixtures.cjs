'use strict';

// Fixtures for the estimator tests (TRD 58-05; 58-06 and 58-07 extend them). Everything is a hand-built literal: a
// calibration object, TRD text and `.planning` trees written into mkdtemp directories. No generated data, no real
// repository, and never the real ~/.claude/aoforge/calibration.json.
//
// makeEstimateProject(spec), spec = {
//   name,                                   // project directory name
//   objectives: [{ dir, objectiveMd, trds: [{
//     nn, slug,                             // TRD number ('01') and file slug
//     frontmatter: { type, wave, depends_on, autonomous, gap_closure },   // type 'standard', wave 1, depends_on [] by default
//     tasks: [{ name, type, tdd, files }],  // type defaults to 'auto'; tdd true|false|undefined; files array|string
//     summary: 'complete' | 'checkpoint' | null,   // 'complete' carries `## Self-Check: PASSED`; 'checkpoint' only `## Progress`
//   }] }],
//   config,                                 // object written to .planning/config.json; omit for none
//   roadmap,                                // text written to .planning/ROADMAP.md; omit for none
// }

const fs = require('fs');
const os = require('os');
const path = require('path');

// ─── Calibration ──────────────────────────────────────────────────────────────

/** A calibrator stat block: n samples, nearest-rank median and P90, min and max. */
function stat(n, p50, p90, min, max) {
  return { n, p50, p90, min, max };
}

/** What the calibrator writes for a metric with no samples. */
const EMPTY_STAT = Object.freeze({ n: 0, p50: null, p90: null, min: null, max: null });

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

function emptyBlock() {
  return {
    samples: 0,
    minutes: { ...EMPTY_STAT },
    tokens_input: { ...EMPTY_STAT },
    tokens_output: { ...EMPTY_STAT },
    cost_usd: { ...EMPTY_STAT },
  };
}

/**
 * A version 2 calibration.json as buildCalibration writes it, with literal values. Task classes: `code_tdd` is
 * well-sampled (every metric n >= 30), `doc` has 10-12, `prompt` has 6, `config` has 2 (below MIN_CLASS_SAMPLES, so it
 * falls back to `all`). Frozen; use makeCalibration for a copy that can be changed.
 */
const CAL_V2 = deepFreeze({
  version: 2,
  classifier_version: 1,
  data_as_of: '2026-10-05',
  samples: { trds: 50, tasks: 120, with_tokens: 40 },
  probabilities: {
    gap_closure: { value: 0.1, n: 40 },
    checkpoint: { value: 0.02, n: 50 },
  },
  trd_level: {
    samples: 40,
    minutes: stat(40, 12, 45, 2, 120),
    tasks: stat(50, 2, 4, 1, 8),
    tokens_input: stat(40, 8000000, 15000000, 900000, 30000000),
    tokens_output: stat(40, 60000, 110000, 8000, 300000),
    cost_usd: stat(40, 2.9, 5.6, 0.3, 14),
  },
  task_classes: {
    all: {
      samples: 120,
      minutes: stat(120, 5, 15, 0.5, 60),
      tokens_input: stat(90, 3000000, 6000000, 200000, 20000000),
      tokens_output: stat(90, 30000, 60000, 2000, 200000),
      cost_usd: stat(90, 1.5, 3, 0.1, 12),
    },
    code_tdd: {
      samples: 40,
      minutes: stat(32, 6, 18, 1, 40),
      tokens_input: stat(30, 3600000, 6400000, 500000, 12000000),
      tokens_output: stat(30, 29000, 48000, 3000, 90000),
      cost_usd: stat(30, 1.4, 2.2, 0.2, 6),
    },
    doc: {
      samples: 12,
      minutes: stat(12, 4, 8, 1, 15),
      tokens_input: stat(10, 2000000, 4000000, 500000, 5000000),
      tokens_output: stat(10, 15000, 30000, 4000, 40000),
      cost_usd: stat(10, 0.8, 1.6, 0.2, 2.5),
    },
    prompt: {
      samples: 6,
      minutes: stat(6, 3, 12, 1, 14),
      tokens_input: stat(6, 2500000, 5000000, 900000, 6000000),
      tokens_output: stat(6, 20000, 45000, 6000, 50000),
      cost_usd: stat(6, 0.9, 2, 0.3, 2.4),
    },
    config: {
      samples: 2,
      minutes: stat(2, 1, 2.5, 1, 2.5),
      tokens_input: stat(2, 900000, 1200000, 900000, 1200000),
      tokens_output: stat(2, 8000, 9000, 8000, 9000),
      cost_usd: stat(2, 0.3, 0.4, 0.3, 0.4),
    },
  },
  agent_overhead: {
    planner: {
      samples: 25,
      minutes: stat(25, 8, 20, 2, 40),
      tokens_input: stat(25, 4000000, 9000000, 800000, 15000000),
      tokens_output: stat(25, 40000, 90000, 9000, 150000),
      cost_usd: stat(25, 2, 4.5, 0.4, 8),
    },
    'job-checker': {
      samples: 20,
      minutes: stat(20, 3, 7, 1, 12),
      tokens_input: stat(20, 1500000, 3000000, 300000, 5000000),
      tokens_output: stat(20, 12000, 25000, 3000, 40000),
      cost_usd: stat(20, 0.6, 1.2, 0.1, 2),
    },
    verifier: {
      samples: 31,
      minutes: stat(31, 4, 10, 1, 18),
      tokens_input: stat(31, 2000000, 5000000, 400000, 8000000),
      tokens_output: stat(31, 15000, 35000, 4000, 60000),
      cost_usd: stat(31, 0.9, 2, 0.2, 3.5),
    },
    'integration-checker': {
      samples: 4,
      minutes: stat(4, 6, 9, 4, 9),
      tokens_input: stat(4, 2500000, 3000000, 2000000, 3000000),
      tokens_output: stat(4, 20000, 25000, 15000, 25000),
      cost_usd: stat(4, 1.1, 1.5, 0.8, 1.5),
    },
    'objective-researcher': emptyBlock(),
    roadmapper: emptyBlock(),
  },
  agent_overhead_sources: { scanned: true, spawns: 90, matched: 80, foreign: 8, quick: 2, unreadable: 0 },
  objective_level: {
    samples: 40,
    trds: stat(40, 5, 10, 1, 14),
    tasks: stat(40, 12, 28, 3, 50),
    minutes: stat(30, 45, 150, 8, 400),
    tokens_input: stat(25, 30000000, 80000000, 4000000, 200000000),
    tokens_output: stat(25, 250000, 600000, 40000, 1500000),
    cost_usd: stat(25, 14, 40, 2, 100),
  },
});

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Objects merge key by key; arrays and scalars replace; an `undefined` value deletes the key.
function mergeInto(target, overrides) {
  for (const key of Object.keys(overrides)) {
    const value = overrides[key];
    if (value === undefined) {
      delete target[key];
    } else if (isPlainObject(value) && isPlainObject(target[key])) {
      mergeInto(target[key], value);
    } else {
      target[key] = JSON.parse(JSON.stringify(value));
    }
  }
  return target;
}

/** A deep, unfrozen copy of CAL_V2 with `overrides` merged in. `{key: undefined}` removes `key`. */
function makeCalibration(overrides = {}) {
  return mergeInto(JSON.parse(JSON.stringify(CAL_V2)), overrides);
}

/**
 * A hand-built version 3 calibration (TRD 67-03): CAL_V2 with `version: 3` and the `method` block that 67-02's
 * calibrator writes, `{minutes, window_objectives: 10, through_objective: 66}`. `minutes` is 'task_sum' or 'trd_level'.
 * `trdMinutes` (a stat, e.g. `{n: 7, p50: 12, p90: 45}`) is merged into `trd_level.minutes`; a full stat such as
 * EMPTY_STAT replaces the samples. Returns an unfrozen copy.
 */
function makeCalibrationV3({ minutes = 'trd_level', trdMinutes } = {}) {
  const overrides = {
    version: 3,
    method: { minutes, window_objectives: 10, through_objective: 66 },
  };
  if (trdMinutes !== undefined) overrides.trd_level = { minutes: trdMinutes };
  return makeCalibration(overrides);
}

/** Writes `obj` as JSON to `<dir>/calibration.json` and returns the path. */
function writeCalibrationFile(dir, obj) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'calibration.json');
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
  return file;
}

// ─── Projects ─────────────────────────────────────────────────────────────────

function objectiveNumber(dir) {
  const m = /^(\d+(?:\.\d+)?)/.exec(dir);
  return m ? m[1] : dir;
}

function taskElement(task) {
  const type = task.type || 'auto';
  const tdd = task.tdd === true ? ' tdd="true"' : task.tdd === false ? ' tdd="false"' : '';
  const files = Array.isArray(task.files) ? task.files.join(', ') : (task.files || '');
  return [
    `<task type="${type}"${tdd}>`,
    `  <name>${task.name}</name>`,
    `  <files>${files}</files>`,
    '  <action>Do the work described by this task.</action>',
    '  <verify>node --test</verify>',
    '  <done>Tests pass.</done>',
    '</task>',
  ].join('\n');
}

function trdText(dir, trd) {
  const fm = trd.frontmatter || {};
  const lines = ['---', `objective: ${dir}`, `trd: "${trd.nn}"`, `type: ${fm.type || 'standard'}`,
    `wave: ${fm.wave === undefined ? 1 : fm.wave}`, `depends_on: ${JSON.stringify(fm.depends_on || [])}`];
  for (const key of ['autonomous', 'gap_closure']) {
    if (fm[key] !== undefined) lines.push(`${key}: ${fm[key]}`);
  }
  lines.push('---', '', `# TRD ${dir}-${trd.nn}: ${trd.slug}`, '', '<tasks>', '');
  for (const task of trd.tasks || []) lines.push(taskElement(task), '');
  lines.push('</tasks>', '');
  return lines.join('\n');
}

function summaryText(dir, trd, kind) {
  const lines = ['---', `objective: ${dir}`, `job: "${trd.nn}"`, '---', '',
    `# Objective ${dir} TRD ${trd.nn} Summary`, '', '## Progress'];
  for (const [i, task] of (trd.tasks || []).entries()) lines.push(`- [x] ${task.name || `Task ${i + 1}`}`);
  lines.push('');
  if (kind === 'complete') lines.push('## Self-Check: PASSED', '');
  return lines.join('\n');
}

/** Writes the spec into `<mkdtemp>/<name>` and returns that realpath'd root. Pair with removeEstimateProject. */
function makeEstimateProject(spec) {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-estimate-')));
  const root = path.join(parent, spec.name || 'project');
  const planning = path.join(root, '.planning');
  const objectivesDir = path.join(planning, 'objectives');
  fs.mkdirSync(objectivesDir, { recursive: true });
  for (const objective of spec.objectives || []) {
    const dirPath = path.join(objectivesDir, objective.dir);
    fs.mkdirSync(dirPath, { recursive: true });
    const num = objectiveNumber(objective.dir);
    if (typeof objective.objectiveMd === 'string') {
      fs.writeFileSync(path.join(dirPath, 'OBJECTIVE.md'), objective.objectiveMd);
    }
    for (const trd of objective.trds || []) {
      fs.writeFileSync(path.join(dirPath, `${num}-${trd.nn}-${trd.slug || 'work'}-TRD.md`), trdText(objective.dir, trd));
      if (trd.summary === 'complete' || trd.summary === 'checkpoint') {
        fs.writeFileSync(path.join(dirPath, `${num}-${trd.nn}-SUMMARY.md`), summaryText(objective.dir, trd, trd.summary));
      }
    }
  }
  if (spec.config) fs.writeFileSync(path.join(planning, 'config.json'), JSON.stringify(spec.config, null, 2) + '\n');
  if (typeof spec.roadmap === 'string') fs.writeFileSync(path.join(planning, 'ROADMAP.md'), spec.roadmap);
  return fs.realpathSync(root);
}

/** Removes the mkdtemp parent that makeEstimateProject created for `root`. */
function removeEstimateProject(root) {
  fs.rmSync(path.dirname(root), { recursive: true, force: true });
}

// ─── Objective rollup project (TRD 58-06) ─────────────────────────────────────

/**
 * The project the objective-rollup tests (estimate-rollup.test.cjs) estimate, and 58-07 extends for milestones.
 *   80-alpha  four TRDs: 80-01 and 80-02 in wave 1 (code_tdd x2, doc), 80-03 in wave 2 (code_tdd, depends on 80-01) and
 *             80-04 in wave 2 (config) already complete -> partial, three TRDs remaining
 *   81-beta   OBJECTIVE.md only -> unplanned
 *   82-gamma  one TRD, complete -> done
 *   83-delta  one TRD whose SUMMARY is checkpoint-only (`## Progress`, no `## Self-Check`) -> planned, not done
 * Parallelization is on in its config.json.
 */
const ROLLUP_SPEC = Object.freeze({
  name: 'rollup',
  config: { parallelization: { enabled: true } },
  objectives: [
    {
      dir: '80-alpha',
      objectiveMd: '# Objective 80: alpha\n',
      trds: [
        {
          nn: '01',
          slug: 'core',
          frontmatter: { type: 'standard', wave: 1, depends_on: [] },
          tasks: [
            { name: 'Task 1: a', tdd: true, files: ['lib/a.cjs', 'lib/a.test.cjs'] },
            { name: 'Task 2: b', tdd: true, files: ['lib/b.cjs'] },
          ],
          summary: null,
        },
        {
          nn: '02',
          slug: 'docs',
          frontmatter: { type: 'standard', wave: 1, depends_on: [] },
          tasks: [{ name: 'Task 1: x', files: ['docs/x.md'] }],
          summary: null,
        },
        {
          nn: '03',
          slug: 'more',
          frontmatter: { type: 'standard', wave: 2, depends_on: ['80-01'] },
          tasks: [{ name: 'Task 1: c', tdd: true, files: ['lib/c.cjs'] }],
          summary: null,
        },
        {
          nn: '04',
          slug: 'pkg',
          frontmatter: { type: 'standard', wave: 2, depends_on: [] },
          tasks: [{ name: 'Task 1: package', files: ['package.json'] }],
          summary: 'complete',
        },
      ],
    },
    { dir: '81-beta', objectiveMd: '# Objective 81: beta\n', trds: [] },
    {
      dir: '82-gamma',
      objectiveMd: '# Objective 82: gamma\n',
      trds: [
        {
          nn: '01',
          slug: 'only',
          frontmatter: { type: 'standard', wave: 1, depends_on: [] },
          tasks: [{ name: 'Task 1: g', tdd: true, files: ['lib/g.cjs'] }],
          summary: 'complete',
        },
      ],
    },
    {
      dir: '83-delta',
      objectiveMd: '# Objective 83: delta\n',
      trds: [
        {
          nn: '01',
          slug: 'wip',
          frontmatter: { type: 'standard', wave: 1, depends_on: [] },
          tasks: [{ name: 'Task 1: d', files: ['docs/d.md'] }],
          summary: 'checkpoint',
        },
      ],
    },
  ],
});

// ─── Milestone rollup project (TRD 58-07) ─────────────────────────────────────

/**
 * The ROADMAP.md of MILESTONE_SPEC: two milestone bullets in the shapes this repo writes (a shipped one whose objectives
 * 70-79 have neither a directory nor a section, and the current one covering 80-84) and a section for every objective
 * 80-85. Objective 85 lies outside the current bullet's range.
 */
const MILESTONE_ROADMAP = [
  '# Roadmap: Fixture',
  '',
  '## Milestones',
  '',
  '- ✅ **v0.9 — Old** — Objectives 70–79 (shipped 2026-09-01)',
  '- 🚧 **v1.0 — Now** — Objectives 80–84 (in progress)',
  '',
  '## Objectives',
  '',
  '### Objective 80: Alpha',
  '**Goal**: Alpha goal.',
  '### Objective 81: Beta',
  '**Goal**: Beta goal.',
  '### Objective 82: Gamma',
  '**Goal**: Gamma goal.',
  '### Objective 83: Delta',
  '**Goal**: Delta goal.',
  '### Objective 84: Epsilon',
  '**Goal**: Epsilon goal.',
  '### Objective 85: Later',
  '**Goal**: Later goal.',
  '',
].join('\n');

/**
 * The project the milestone tests (estimate-milestone.test.cjs) estimate: ROLLUP_SPEC (80 partial, 81 unplanned, 82
 * done, 83 planned) plus 84-epsilon, whose OBJECTIVE.md carries `status: cancelled` and which has no TRDs, and the
 * ROADMAP above. Objective 85 has a section but no directory.
 */
const MILESTONE_SPEC = Object.freeze({
  ...ROLLUP_SPEC,
  name: 'milestone',
  objectives: [
    ...ROLLUP_SPEC.objectives,
    { dir: '84-epsilon', objectiveMd: '---\nstatus: cancelled\n---\n# Objective 84: epsilon\n', trds: [] },
  ],
  roadmap: MILESTONE_ROADMAP,
});

module.exports = {
  EMPTY_STAT,
  CAL_V2,
  makeCalibration,
  makeCalibrationV3,
  writeCalibrationFile,
  taskElement,
  trdText,
  makeEstimateProject,
  removeEstimateProject,
  ROLLUP_SPEC,
  MILESTONE_ROADMAP,
  MILESTONE_SPEC,
};
