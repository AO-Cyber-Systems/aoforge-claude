'use strict';

// estimate-format.test.cjs (TRD 58-08, EST-02/EST-03/EST-05) — the text renderers behind `df-tools estimate`.
//
// Test list (TRD 58-08):
//   12 formatMinutes / formatTokens / formatUsd, with the 59.6 -> `1h 00m` carry
//   13 roundResult: one rounding rule per key, other keys and the input untouched
//   14 verdict: at or under median / within P90 / over P90, null for no estimate
//   15 objectiveTable, objectiveLine, milestoneTable and milestoneLine equal the literal strings
//   plus the task, TRD, unplanned, done, unavailable, wave and finish forms
//
// Pure functions, literal inputs and literal expected strings. Nothing here reads a file or the clock.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const fmt = require('./estimate-format.cjs');

// ─── Literals ─────────────────────────────────────────────────────────────────

const OBJ_RESULT = {
  objective: '80',
  name: 'Alpha',
  status: 'partial',
  trds: { total: 4, done: 1, remaining: 3 },
  waves: [
    { wave: 1, trds: ['80-01', '80-02'], wall_minutes: { p50: 12.2554, p90: 36.0038 } },
    { wave: 2, trds: ['80-03'], wall_minutes: { p50: 6, p90: 18 } },
  ],
  total: {
    wall_minutes: { p50: 25.6464, p90: 69.1577 },
    agent_minutes: { p50: 30.1, p90: 75.2 },
    tokens_input: { p50: 12400000, p90: 21000000 },
    tokens_output: { p50: 98000, p90: 170000 },
    cost_usd: { p50: 6.8, p90: 10.9 },
  },
  overhead: [{ agent: 'verifier', spawns: 1 }],
  gap_closure: {
    probability: 0.1,
    n: 40,
    extra: { wall_minutes: { p50: 31, p90: 70 }, cost_usd: { p50: 5.8, p90: 10 } },
  },
  confidence: 'medium',
  weakest: { name: '80-02', class: 'doc', n: 10 },
  calibration: { data_as_of: '2026-10-05', samples: { trds: 50 } },
};

const OBJ_TABLE = [
  '| Objective 80 (3 TRDs left, 2 waves) | Median | P90 |',
  '|---|---|---|',
  '| Wall time | 26 min | 1h 09m |',
  '| Agent time | 30 min | 1h 15m |',
  '| Tokens in / out | 12.4M / 98K | 21.0M / 170K |',
  '| Cost | $6.80 | $10.90 |',
  '',
  'Includes 1 verifier spawn and gap closure (10% likely, n=40; +31 min, +$5.80 if it happens). Confidence: medium (weakest: 80-02 doc, n=10). Calibration 2026-10-05, 50 TRDs.',
].join('\n');

const OBJ_LINE = 'Objective 80 estimate: 26 min median (P90 1h 09m) wall · $6.80 (P90 $10.90) · 3 TRDs left in 2 waves · confidence medium';

const MS_RESULT = {
  version: 'v1.0',
  name: 'Now',
  objectives: [
    {
      number: '80', name: 'Alpha', status: 'partial', trds: { total: 4, done: 1, remaining: 3 },
      total: { wall_minutes: { p50: 25.6464, p90: 69.1577 }, cost_usd: { p50: 6.8, p90: 10.9 } }, confidence: 'medium',
    },
    {
      number: '81', name: 'Beta', status: 'unplanned', trds: { total: 0, done: 0, remaining: 0 },
      total: { wall_minutes: { p50: 62.2252, p90: 184.6035 }, cost_usd: { p50: 17.9788, p90: 46.9899 } }, confidence: 'low',
    },
    { number: '82', name: 'Gamma', status: 'done', trds: { total: 1, done: 1, remaining: 0 }, total: null, confidence: 'n/a' },
    {
      number: '83', name: 'Delta', status: 'planned', trds: { total: 1, done: 0, remaining: 1 },
      total: { wall_minutes: { p50: 8.9727, p90: 23.5003 }, cost_usd: { p50: 2.1, p90: 4.2 } }, confidence: 'medium',
    },
    { number: '84', name: 'Epsilon', status: 'cancelled', trds: null, total: null, confidence: 'n/a' },
  ],
  overhead: [{ agent: 'integration-checker', spawns: 1 }],
  total: {
    wall_minutes: { p50: 109.2527, p90: 276.3459 },
    cost_usd: { p50: 29.4, p90: 58.1 },
  },
  confidence: 'low',
  weakest: { name: '81', status: 'unplanned' },
};

const MS_TABLE = [
  '| Objective | Status | Wall median | Wall P90 | Cost median | Confidence |',
  '|---|---|---|---|---|---|',
  '| 80 Alpha | partial, 3 of 4 TRDs left | 26 min | 1h 09m | $6.80 | medium |',
  '| 81 Beta | unplanned | 1h 02m | 3h 05m | $17.98 | low |',
  '| 83 Delta | planned, 1 TRD | 9 min | 24 min | $2.10 | medium |',
  '| **v1.0 total (3 objectives left)** | | **1h 49m** | **4h 36m** | **$29.40** | **low** |',
  '',
  'Done: 82. Cancelled: 84. Includes 1 integration-checker spawn. Confidence: low (weakest: 81 unplanned).',
].join('\n');

const MS_LINE = 'Milestone v1.0 estimate: 1h 49m median (P90 4h 36m) · $29.40 (P90 $58.10) · 3 objectives left (1 unplanned) · confidence low';

// ─── 12: scalar formatters ────────────────────────────────────────────────────

describe('12: formatMinutes, formatTokens, formatUsd', () => {
  test('formatMinutes rounds once and carries into the hour', () => {
    assert.equal(fmt.formatMinutes(5.04), '5 min');
    assert.equal(fmt.formatMinutes(0), '0 min');
    assert.equal(fmt.formatMinutes(59.4), '59 min');
    assert.equal(fmt.formatMinutes(59.6), '1h 00m');
    assert.equal(fmt.formatMinutes(75), '1h 15m');
    assert.equal(fmt.formatMinutes(125), '2h 05m');
    assert.equal(fmt.formatMinutes(null), 'n/a');
    assert.equal(fmt.formatMinutes(undefined), 'n/a');
    assert.equal(fmt.formatMinutes(Number.NaN), 'n/a');
  });

  test('formatTokens uses M with one decimal, K whole, and the bare number below 1000', () => {
    assert.equal(fmt.formatTokens(3600000), '3.6M');
    assert.equal(fmt.formatTokens(21000000), '21.0M');
    assert.equal(fmt.formatTokens(29000), '29K');
    assert.equal(fmt.formatTokens(950), '950');
    assert.equal(fmt.formatTokens(999600), '1.0M');
    assert.equal(fmt.formatTokens(null), 'n/a');
  });

  test('formatUsd is dollars and cents', () => {
    assert.equal(fmt.formatUsd(1.4), '$1.40');
    assert.equal(fmt.formatUsd(0), '$0.00');
    assert.equal(fmt.formatUsd(46.9899), '$46.99');
    assert.equal(fmt.formatUsd(null), 'n/a');
  });
});

// ─── 13: roundResult ──────────────────────────────────────────────────────────

describe('13: roundResult', () => {
  test('rounds each key by its rule and leaves every other key alone', () => {
    const input = {
      class: 'code_tdd',
      minutes: { p50: 5.04, p90: 14.96, n: 32 },
      wall_minutes: { p50: 25.6464, p90: 69.1577 },
      agent_minutes: { p50: 30.14, p90: 75.25 },
      tokens_input: { p50: 3600000.4, p90: 6400000.6 },
      tokens_output: { p50: 29000.5, p90: 48000.2 },
      cost_usd: { p50: 1.234567, p90: 2.2 },
      gap_closure: { probability: 0.123456, n: 40 },
      samples: 30.5,
      waves: [{ wave: 1, wall_minutes: { p50: 12.2554, p90: 36.0038 } }],
      calibration: { version: 2, data_as_of: '2026-10-05' },
    };
    const out = fmt.roundResult(input);
    assert.deepEqual(out, {
      class: 'code_tdd',
      minutes: { p50: 5, p90: 15, n: 32 },
      wall_minutes: { p50: 25.6, p90: 69.2 },
      agent_minutes: { p50: 30.1, p90: 75.3 },
      tokens_input: { p50: 3600000, p90: 6400001 },
      tokens_output: { p50: 29001, p90: 48000 },
      cost_usd: { p50: 1.2346, p90: 2.2 },
      gap_closure: { probability: 0.1235, n: 40 },
      samples: 30.5,
      waves: [{ wave: 1, wall_minutes: { p50: 12.3, p90: 36 } }],
      calibration: { version: 2, data_as_of: '2026-10-05' },
    });
  });

  test('does not mutate its input and returns plain data', () => {
    const input = Object.freeze({ minutes: Object.freeze({ p50: 5.04, p90: 9.99 }), tag: 'x' });
    const out = fmt.roundResult(input);
    assert.deepEqual(input, { minutes: { p50: 5.04, p90: 9.99 }, tag: 'x' });
    assert.deepEqual(out, { minutes: { p50: 5, p90: 10 }, tag: 'x' });
    assert.equal(fmt.roundResult(null), null);
    assert.equal(fmt.roundResult('text'), 'text');
  });
});

// ─── 14: verdict ──────────────────────────────────────────────────────────────

describe('14: verdict', () => {
  test('classifies an actual against the median and the P90', () => {
    assert.equal(fmt.verdict(5, { p50: 6, p90: 18 }), 'at or under median');
    assert.equal(fmt.verdict(6, { p50: 6, p90: 18 }), 'at or under median');
    assert.equal(fmt.verdict(14, { p50: 12.26, p90: 36 }), 'within P90');
    assert.equal(fmt.verdict(36, { p50: 12.26, p90: 36 }), 'within P90');
    assert.equal(fmt.verdict(40, { p50: 12, p90: 36 }), 'over P90');
  });

  test('a missing estimate or actual gives null', () => {
    assert.equal(fmt.verdict(5, null), null);
    assert.equal(fmt.verdict(5, { p50: null, p90: null }), null);
    assert.equal(fmt.verdict(null, { p50: 6, p90: 18 }), null);
    assert.equal(fmt.verdict(40, { p50: 12, p90: null }), null);
  });
});

// ─── 15: objective and milestone text ─────────────────────────────────────────

describe('15: objective and milestone renderers', () => {
  test('objectiveTable and objectiveLine equal the literal strings', () => {
    assert.equal(fmt.objectiveTable(OBJ_RESULT), OBJ_TABLE);
    assert.equal(fmt.objectiveLine(OBJ_RESULT), OBJ_LINE);
  });

  test('milestoneTable and milestoneLine equal the literal strings', () => {
    assert.equal(fmt.milestoneTable(MS_RESULT), MS_TABLE);
    assert.equal(fmt.milestoneLine(MS_RESULT), MS_LINE);
  });

  test('singular nouns: 1 TRD left in 1 wave, 1 objective left', () => {
    const one = {
      ...OBJ_RESULT,
      trds: { total: 1, done: 0, remaining: 1 },
      waves: [OBJ_RESULT.waves[0]],
    };
    assert.match(fmt.objectiveLine(one), /· 1 TRD left in 1 wave · /);
    assert.match(fmt.objectiveTable(one), /^\| Objective 80 \(1 TRD left, 1 wave\) \| Median \| P90 \|/);

    const ms = { ...MS_RESULT, objectives: [MS_RESULT.objectives[2], MS_RESULT.objectives[3]] };
    assert.match(fmt.milestoneLine(ms), /· 1 objective left · /);
  });

  test('the footer lists several overhead agents, and gap closure alone, in the stated order', () => {
    const many = {
      ...OBJ_RESULT,
      gap_closure: null,
      overhead: [{ agent: 'planner', spawns: 1 }, { agent: 'job-checker', spawns: 1 }, { agent: 'verifier', spawns: 2 }],
    };
    assert.match(
      fmt.objectiveTable(many),
      /\nIncludes 1 planner spawn, 1 job-checker spawn and 2 verifier spawns\. Confidence: medium/,
    );
    const gapOnly = { ...OBJ_RESULT, overhead: [] };
    assert.match(fmt.objectiveTable(gapOnly), /\nIncludes gap closure \(10% likely, n=40; \+31 min, \+\$5\.80 if it happens\)\. Confidence/);
    const neither = { ...OBJ_RESULT, overhead: [], gap_closure: null, weakest: null };
    assert.match(fmt.objectiveTable(neither), /\nConfidence: medium\. Calibration 2026-10-05, 50 TRDs\.$/);
  });

  test('notes and missing data follow the footer, one `Note: ` line each', () => {
    const noted = {
      ...OBJ_RESULT,
      notes: ['1 checkpoint TRD: human wait not included'],
      missing: ['80-02: cost_usd'],
    };
    const lines = fmt.objectiveTable(noted).split('\n');
    assert.equal(lines[lines.length - 2], 'Note: 1 checkpoint TRD: human wait not included');
    assert.equal(lines[lines.length - 1], 'Note: missing data: 80-02: cost_usd');
  });

  test('a null metric renders n/a, never a number', () => {
    const lacking = { ...OBJ_RESULT, total: { ...OBJ_RESULT.total, cost_usd: null, agent_minutes: null } };
    const table = fmt.objectiveTable(lacking);
    assert.match(table, /\n\| Agent time \| n\/a \| n\/a \|\n/);
    assert.match(table, /\n\| Cost \| n\/a \| n\/a \|\n/);
    const noMinutes = { ...OBJ_RESULT, total: { ...OBJ_RESULT.total, wall_minutes: null } };
    assert.equal(
      fmt.objectiveLine(noMinutes),
      'No estimate: objective 80 has no minutes data in the calibration; run df-tools calibrate',
    );
  });

  test('--all labels the TRDs as estimated, not left', () => {
    const all = { ...OBJ_RESULT, all: true, trds: { total: 4, done: 1, remaining: 4 } };
    assert.match(fmt.objectiveLine(all), /· 4 TRDs estimated in 2 waves · /);
    assert.match(fmt.objectiveTable(all), /^\| Objective 80 \(4 TRDs estimated, 2 waves\) \|/);
  });
});

describe('objective text for the other states', () => {
  const UNPLANNED = {
    objective: '81',
    name: 'Beta',
    status: 'unplanned',
    trds: { total: 0, done: 0, remaining: 0 },
    waves: [],
    total: {
      wall_minutes: { p50: 62.2252, p90: 184.6035 },
      agent_minutes: { p50: 62.2252, p90: 184.6035 },
      tokens_input: { p50: 31000000, p90: 80000000 },
      tokens_output: { p50: 260000, p90: 610000 },
      cost_usd: { p50: 17.9788, p90: 46.9899 },
    },
    overhead: [{ agent: 'planner', spawns: 1 }, { agent: 'job-checker', spawns: 1 }, { agent: 'verifier', spawns: 1 }],
    gap_closure: null,
    history: { objectives: 30 },
    confidence: 'low',
    weakest: { name: 'unplanned (no TRDs)', label: 'low', p50: 62.2252, n: 30 },
    notes: [
      'unplanned: estimated from 30 objectives of history (objective_level), not from a plan',
      'gap closure: not added; the objective history already includes gap-closure cycles',
    ],
    missing: [],
    calibration: { data_as_of: '2026-10-05', samples: { trds: 50 } },
  };

  test('unplanned: the line names the history, the table drops the agent row and notes the basis', () => {
    assert.equal(
      fmt.objectiveLine(UNPLANNED),
      'Objective 81 estimate: 1h 02m median (P90 3h 05m) wall · $17.98 (P90 $46.99) · unplanned, from 30 past objectives · confidence low',
    );
    assert.equal(fmt.objectiveTable(UNPLANNED), [
      '| Objective 81 (unplanned) | Median | P90 |',
      '|---|---|---|',
      '| Wall time (serial, unplanned) | 1h 02m | 3h 05m |',
      '| Tokens in / out | 31.0M / 260K | 80.0M / 610K |',
      '| Cost | $17.98 | $46.99 |',
      '',
      'Includes 1 planner spawn, 1 job-checker spawn and 1 verifier spawn. Confidence: low (weakest: unplanned (no TRDs), n=30). Calibration 2026-10-05, 50 TRDs.',
      'Note: figures come from 30 past objectives because the objective has no TRDs yet.',
      'Note: gap closure: not added; the objective history already includes gap-closure cycles',
    ].join('\n'));
  });

  test('unplanned with no history is a No estimate line', () => {
    const none = { ...UNPLANNED, history: null, total: { wall_minutes: null, agent_minutes: null, tokens_input: null, tokens_output: null, cost_usd: null }, overhead: [] };
    assert.equal(
      fmt.objectiveLine(none),
      'No estimate: objective 81 is unplanned and the calibration has no objective history (objective_level); run df-tools calibrate',
    );
    assert.equal(fmt.objectiveTable(none), fmt.objectiveLine(none));
  });

  test('done: one line, in the table too', () => {
    const done = { objective: '82', status: 'done', trds: { total: 1, done: 1, remaining: 0 } };
    assert.equal(fmt.objectiveLine(done), 'Objective 82: all TRDs done (1 of 1)');
    assert.equal(fmt.objectiveTable(done), 'Objective 82: all TRDs done (1 of 1)');
  });

  test('done with all renders the estimate (line and table); without all it stays the one done line (TRD 64-02)', () => {
    const doneAll = { ...OBJ_RESULT, status: 'done', all: true, trds: { total: 4, done: 4, remaining: 4 } };
    assert.equal(
      fmt.objectiveLine(doneAll),
      fmt.objectiveLine({ ...OBJ_RESULT, all: true, trds: { total: 4, done: 4, remaining: 4 } }),
      'a done objective renders like any other once --all asks for the estimate',
    );
    assert.match(fmt.objectiveLine(doneAll), /^Objective 80 estimate: .* · 4 TRDs estimated in 2 waves · confidence medium$/);
    assert.match(fmt.objectiveTable(doneAll), /^\| Objective 80 \(4 TRDs estimated, 2 waves\) \| Median \| P90 \|\n/);

    for (const off of [{ all: false }, { all: undefined }, {}]) {
      const done = { ...doneAll, ...off };
      if (!('all' in off)) delete done.all;
      assert.equal(fmt.objectiveLine(done), 'Objective 80: all TRDs done (4 of 4)');
      assert.equal(fmt.objectiveTable(done), 'Objective 80: all TRDs done (4 of 4)');
    }
  });

  test('done with all but no minutes in the estimate says so instead of printing a number', () => {
    const doneAll = { objective: '82', status: 'done', all: true, trds: { total: 1, done: 1, remaining: 1 }, total: null };
    assert.equal(
      fmt.objectiveLine(doneAll),
      'No estimate: objective 82 has no minutes data in the calibration; run df-tools calibrate',
    );
    assert.equal(fmt.objectiveTable(doneAll), fmt.objectiveLine(doneAll));
  });

  test('unavailable calibration: No estimate with the reason', () => {
    const r = { available: false, reason: 'no calibration file at /x/calibration.json; run df-tools calibrate to build it' };
    const text = 'No estimate: no calibration file at /x/calibration.json; run df-tools calibrate to build it';
    assert.equal(fmt.objectiveLine(r), text);
    assert.equal(fmt.objectiveTable(r), text);
    assert.equal(fmt.milestoneLine(r), text);
    assert.equal(fmt.milestoneTable(r), text);
    assert.equal(fmt.taskLine(r), text);
    assert.equal(fmt.trdLine(r), text);
  });
});

describe('milestone text for the other states', () => {
  test('no objectives left: no number', () => {
    const empty = {
      version: 'v0.9',
      name: 'Old',
      objectives: [{ number: '70', name: 'x', status: 'done', trds: { total: 1, done: 1, remaining: 0 }, total: null, confidence: 'n/a' }],
      overhead: [],
      total: { wall_minutes: { p50: 0, p90: 0 }, cost_usd: { p50: 0, p90: 0 } },
      confidence: 'n/a',
      weakest: null,
      notes: ['no objectives left'],
    };
    assert.equal(fmt.milestoneLine(empty), 'Milestone v0.9 estimate: no objectives left');
    assert.equal(fmt.milestoneTable(empty), 'Milestone v0.9: no objectives left. Done: 70.');
  });

  test('a milestone with no minutes total is a No estimate line', () => {
    const lacking = { ...MS_RESULT, total: { wall_minutes: null, cost_usd: null } };
    assert.equal(
      fmt.milestoneLine(lacking),
      'No estimate: milestone v1.0 has no minutes data in the calibration; run df-tools calibrate',
    );
  });

  test('a calibration piece is added to the table footer when present', () => {
    const withCal = { ...MS_RESULT, calibration: { data_as_of: '2026-10-05', samples: { trds: 50 } } };
    assert.match(fmt.milestoneTable(withCal), /\(weakest: 81 unplanned\)\. Calibration 2026-10-05, 50 TRDs\.$/);
  });
});

// ─── task and TRD lines ───────────────────────────────────────────────────────

describe('task and TRD lines', () => {
  const stat = (p50, p90, n) => ({ p50, p90, n });

  test('taskLine: the full form', () => {
    const task = {
      class: 'code_tdd',
      basis: 'class',
      class_samples: 40,
      minutes: stat(6, 18, 32),
      tokens_input: stat(3600000, 6400000, 30),
      tokens_output: stat(29000, 48000, 30),
      cost_usd: stat(1.4, 2.2, 30),
      samples: 30,
      confidence: 'high',
      human_wait: false,
    };
    assert.equal(
      fmt.taskLine(task),
      'Task code_tdd: 6 min (P90 18 min) · tokens 3.6M in / 29K out · $1.40 (P90 $2.20) · n=30, confidence high',
    );
  });

  test('taskLine: the all-tasks fallback names the class and its sample count', () => {
    const task = {
      class: 'config',
      basis: 'all',
      class_samples: 2,
      minutes: stat(5, 15, 120),
      tokens_input: stat(3000000, 6000000, 90),
      tokens_output: stat(30000, 60000, 90),
      cost_usd: stat(1.5, 3, 90),
      samples: 90,
      confidence: 'low',
      human_wait: false,
    };
    assert.equal(
      fmt.taskLine(task),
      'Task config: 5 min (P90 15 min) · tokens 3.0M in / 30K out · $1.50 (P90 $3.00) · n=90, confidence low (config has 2 samples; using all tasks)',
    );
    assert.match(fmt.taskLine({ ...task, class_samples: 1 }), /\(config has 1 sample; using all tasks\)$/);
  });

  test('taskLine: a checkpoint is a human wait, and a class with no data is No estimate', () => {
    assert.equal(fmt.taskLine({ class: 'checkpoint', human_wait: true }), 'Task checkpoint: human wait, not estimated');
    assert.equal(
      fmt.taskLine({ class: 'doc', basis: 'all', class_samples: 0, minutes: null, tokens_input: null, tokens_output: null, cost_usd: null, samples: 0, confidence: 'none' }),
      'No estimate: the calibration has no data for task class doc; run df-tools calibrate',
    );
  });

  test('taskLine: a missing token figure reads n/a', () => {
    const task = {
      class: 'doc', basis: 'class', class_samples: 12, minutes: stat(4, 8, 12), tokens_input: null, tokens_output: null,
      cost_usd: null, samples: 12, confidence: 'medium',
    };
    assert.equal(fmt.taskLine(task), 'Task doc: 4 min (P90 8 min) · tokens n/a in / n/a out · cost n/a · n=12, confidence medium');
  });

  test('trdLine', () => {
    const trd = {
      id: '80-01',
      tasks: [{}, {}],
      minutes: { p50: 12, p90: 36 },
      cost_usd: { p50: 2.8, p90: 4.4 },
      confidence: 'high',
      human_wait: false,
      notes: [],
    };
    assert.equal(fmt.trdLine(trd), 'TRD 80-01: 12 min (P90 36 min) · $2.80 (P90 $4.40) · 2 tasks · confidence high');
    assert.equal(
      fmt.trdLine({ ...trd, tasks: [{}], human_wait: true }),
      'TRD 80-01: 12 min (P90 36 min) · $2.80 (P90 $4.40) · 1 task · human wait not included · confidence high',
    );
    assert.equal(
      fmt.trdLine({ ...trd, minutes: null, cost_usd: null, tasks: [{ class: 'checkpoint' }], notes: ['no auto tasks'] }),
      'No estimate: TRD 80-01 has no auto tasks',
    );
    assert.equal(
      fmt.trdLine({ ...trd, minutes: null, cost_usd: null, tasks: [{ class: 'doc' }] }),
      'No estimate: TRD 80-01 has no minutes data in the calibration; run df-tools calibrate',
    );
  });
});

// ─── run verbs ────────────────────────────────────────────────────────────────

describe('wave and finish lines', () => {
  test('waveStartLine', () => {
    assert.equal(fmt.waveStartLine({ wave: 1, p50: 12.2554, p90: 36.0038 }), 'Wave 1 estimate: 12 min median, P90 36 min');
    assert.equal(fmt.waveStartLine({ wave: 1, p50: null, p90: null }), 'Wave 1: no estimate');
  });

  test('waveDoneLine', () => {
    assert.equal(
      fmt.waveDoneLine({ wave: 1, actual: 14, p50: 12.2554, p90: 36.0038 }),
      'Wave 1: actual 14 min · estimate 12 min median, P90 36 min · within P90',
    );
    assert.equal(
      fmt.waveDoneLine({ wave: 2, actual: 40, p50: 12, p90: 36 }),
      'Wave 2: actual 40 min · estimate 12 min median, P90 36 min · over P90',
    );
    assert.equal(fmt.waveDoneLine({ wave: 3, actual: 5, p50: null, p90: null }), 'Wave 3: actual 5 min · no estimate');
  });

  test('finishLine', () => {
    assert.equal(
      fmt.finishLine({ objective: '80', actual: 30, wall: { p50: 19.3982, p90: 52.1221 } }),
      'Objective 80 execution: actual 30 min · estimate 19 min median, P90 52 min · within P90',
    );
    assert.equal(
      fmt.finishLine({ objective: '80', actual: 30, wall: null }),
      'Objective 80 execution: actual 30 min · no estimate',
    );
  });
});
