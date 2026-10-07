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
// Test list (TRD 64-04, EST-08): the backtest renderers, over results buildBacktest returns for hand-built inputs.
//   8  backtestLine: the exact line for five objectives, `insufficient (2 objectives)`, and the no-estimate form
//   9  backtestReport: the sections in order, an excluded metric, `none recorded` wall time, miscalibrated classes, footer
//   10 roundResult on a backtest result: ratio and median_ratio 3 decimals, coverage 4, actual by its enclosing metric
//
// Pure functions, literal inputs and literal expected strings. Nothing here reads a file or the clock.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const fmt = require('./estimate-format.cjs');
const backtest = require('./estimate-backtest.cjs');
const fx = require('./__fixtures__/backtest-fixtures.cjs');

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

// ─── Backtest renderers (TRD 64-04, EST-08) ───────────────────────────────────

// One TRD per objective, measured at 100 minutes and $1.68 (1,000,000 input of which 600,000 cache read and 200,000 cache
// write, 10,000 output on the fixture model). An objective estimated at `agent` minutes P50 has ratio agent / 100; its
// cost P50 is `cost` x $1.68. The minutes P90 is `p90` (default 400) and the cost P90 four times the cost P50, so every
// actual is covered unless a test lowers it. The TRD's two code_tdd tasks carry half of each estimate.
const PRICED = {
  tokens_input: 1000000, tokens_cache_read: 600000, tokens_cache_write: 200000, tokens_output: 10000, token_model: 'test-model',
};
const TRD_COST = backtest.objectiveActuals(
  fx.projectRecord([fx.trdRecord({ id: '90-01', minutes: 100, tokens: PRICED })]), '90-alpha', fx.testRates(),
).cost_usd.value;

function measured(specs, extra = {}) {
  const trds = [];
  const estimates = specs.map((spec, i) => {
    const num = 90 + i;
    const id = `${num}-01`;
    const dir = `${num}-o${i}`;
    const p90 = spec.p90 === undefined ? 400 : spec.p90;
    const costP50 = TRD_COST * spec.cost;
    trds.push(fx.trdRecord({ id, dir, minutes: spec.noMinutes ? null : 100, tokens: PRICED }));
    const half = fx.taskEstimate({ cls: 'code_tdd', minutes: fx.stat(spec.agent / 2, p90 / 2), cost: fx.stat(costP50 / 2, costP50 * 2) });
    return fx.objectiveEstimate({
      objective: String(num),
      dir,
      execution: { agent_minutes: fx.stat(spec.agent, p90), cost_usd: fx.stat(costP50, costP50 * 4) },
      trds: [fx.trdEstimate({ id, minutes: fx.stat(spec.agent, p90), cost: fx.stat(costP50, costP50 * 4), tasks: [half, half] })],
    });
  });
  return { estimates, project: fx.projectRecord(trds), rates: fx.testRates(), ...extra };
}

const ON_TARGET = { agent: 100, cost: 1 };
const CALIBRATION = {
  path: '/tmp/frozen/calibration.json', version: 2, data_as_of: '2026-10-05',
  samples: { trds: 50, tasks: 120, with_tokens: 40 }, inputs_digest: 'abc123',
};

/** buildBacktest over `specs`, with the `available` flag and calibration the CLI adds. */
function backtestResult(specs, extra) {
  return { available: true, ...backtest.buildBacktest(measured(specs, extra)), calibration: CALIBRATION };
}

// Agent minutes ratios 1.29 1.51 2.11 1.63 0.95 (median 1.51, two in band) and cost on target.
const FIVE = backtestResult([129, 151, 211, 163, 95].map((agent) => ({ agent, cost: 1 })));

describe('8: backtestLine', () => {
  test('five objectives print each primary metric once, the first with its labels in full, and the EST-08 verdict', () => {
    assert.equal(
      fmt.backtestLine(FIVE),
      'Backtest 90, 91, 92, 93, 94: agent minutes median ratio 1.51 (2 of 5 in ±30%, P90 covers 5 of 5 objectives, 5 of 5 TRDs)'
        + ' · cost median ratio 1.00 (5 of 5, P90 5 of 5, 5 of 5) · EST-08 not met',
    );
  });

  test('a metric with fewer than the minimum objectives is `insufficient (2 objectives)`, and one objective is singular', () => {
    assert.equal(
      fmt.backtestLine(backtestResult([ON_TARGET, ON_TARGET])),
      'Backtest 90, 91: agent minutes insufficient (2 objectives) · cost insufficient (2 objectives) · EST-08 not met',
    );
    assert.equal(
      fmt.backtestLine(backtestResult([ON_TARGET])),
      'Backtest 90: agent minutes insufficient (1 objective) · cost insufficient (1 objective) · EST-08 not met',
    );
  });

  test('a metric that does print numbers while the other is insufficient labels itself in full', () => {
    const noMinutes = [ON_TARGET, ON_TARGET, { ...ON_TARGET, noMinutes: true }, { ...ON_TARGET, noMinutes: true }];
    assert.equal(
      fmt.backtestLine(backtestResult(noMinutes)),
      'Backtest 90, 91, 92, 93: agent minutes insufficient (2 objectives)'
        + ' · cost median ratio 1.00 (4 of 4 in ±30%, P90 covers 4 of 4 objectives, 4 of 4 TRDs) · EST-08 not met',
    );
  });

  test('five objectives on target say `EST-08 met`', () => {
    const met = backtestResult([ON_TARGET, ON_TARGET, ON_TARGET, ON_TARGET, ON_TARGET]);
    assert.ok(fmt.backtestLine(met).endsWith(' · EST-08 met'), fmt.backtestLine(met));
  });

  test('a result with no usable calibration is `No estimate: <reason>`', () => {
    assert.equal(fmt.backtestLine({ available: false, reason: 'no calibration file' }), 'No estimate: no calibration file');
  });
});

describe('10: roundResult on a backtest result', () => {
  const RAW = {
    available: true,
    band: 0.3,
    coverage_target: 0.8,
    objectives: [{
      objective: '90',
      trds: 2,
      agent_minutes: {
        p50: 12.3456, p90: 25.5555, actual: 10.04567, ratio: 1.2345678, within_band: true, covered: true, source: 'prospective', excluded: null,
      },
      cost_usd: {
        p50: 2.252340725, p90: 3.63914042, actual: 1.6800004, ratio: 1.340678, within_band: false, covered: true, source: 'reconstructed', excluded: null,
      },
      wall_minutes: {
        source: 'prospective',
        actual: 96.61616,
        prospective: { p50: 96.5, p90: 290.5, actual: 96.61616, ratio: 0.99879, covered: true },
        waves: [{ wave: 1, trds: ['90-01'], p50: 19.738206, p90: 67.316435, actual: 18.572133, ratio: 1.06278 }],
      },
      trd_rows: [{ id: '90-01', minutes: { p50: 6.04, p90: 18.04, actual: 5.55555, ratio: 1.08717 }, cost_usd: { p50: 1.4, actual: 1.68000004, ratio: 0.83333 } }],
    }],
    summary: {
      agent_minutes: {
        compared: 5, median_ratio: 1.51234, pooled_ratio: 1.49812, in_band: 2, coverage: 0.83333333, under_median_share: 0.66666667, trd_compared: 41, trd_coverage: 0.975609, sc2: 'fail',
      },
      cost_usd: { compared: 5, median_ratio: 0.98765, pooled_ratio: 0.98111, in_band: 5, coverage: 1, under_median_share: 0.4, trd_compared: 41, trd_coverage: 1, sc2: 'pass' },
      wall_minutes: { compared: 1, median_ratio: 0.99879, coverage: 1, waves: { compared: 5, coverage: 0.8 } },
    },
    classes: { minutes: [{ class: 'code_tdd', tasks: 10, median_ratio: 1.62345, coverage: 0.99999, under_median_share: 0.1234567, flags: ['biased_high'], verdict: 'miscalibrated' }], cost_usd: [] },
    verdict: { est08: 'not met', miscalibrated: [{ metric: 'agent_minutes', class: 'code_tdd', median_ratio: 1.62345, coverage: 0.99999, tasks: 10 }] },
  };

  test('ratios take 3 decimals and shares 4, each by its own key, wherever they sit', () => {
    const r = fmt.roundResult(RAW);
    const cell = r.objectives[0].agent_minutes;
    assert.equal(cell.ratio, 1.235);
    assert.equal(r.objectives[0].cost_usd.ratio, 1.341);
    assert.equal(r.objectives[0].wall_minutes.prospective.ratio, 0.999);
    assert.equal(r.objectives[0].wall_minutes.waves[0].ratio, 1.063);
    assert.equal(r.objectives[0].trd_rows[0].minutes.ratio, 1.087);
    assert.equal(r.objectives[0].trd_rows[0].cost_usd.ratio, 0.833);

    const s = r.summary.agent_minutes;
    assert.deepEqual([s.median_ratio, s.pooled_ratio], [1.512, 1.498]);
    assert.deepEqual([s.coverage, s.trd_coverage, s.under_median_share], [0.8333, 0.9756, 0.6667]);
    assert.deepEqual([r.summary.cost_usd.median_ratio, r.summary.cost_usd.pooled_ratio], [0.988, 0.981]);
    assert.deepEqual([r.summary.wall_minutes.median_ratio, r.summary.wall_minutes.waves.coverage], [0.999, 0.8]);

    const klass = r.classes.minutes[0];
    assert.deepEqual([klass.median_ratio, klass.coverage, klass.under_median_share], [1.623, 1, 0.1235]);
    assert.deepEqual([r.verdict.miscalibrated[0].median_ratio, r.verdict.miscalibrated[0].coverage], [1.623, 1]);
  });

  test('an actual takes the rule of the metric it sits under: one decimal for minutes, four for dollars', () => {
    const r = fmt.roundResult(RAW);
    const row = r.objectives[0];
    assert.equal(row.agent_minutes.actual, 10);
    assert.equal(row.agent_minutes.p50, 12.3);
    assert.equal(row.cost_usd.actual, 1.68);
    assert.equal(row.cost_usd.p50, 2.2523);
    assert.equal(row.wall_minutes.actual, 96.6);
    assert.equal(row.wall_minutes.prospective.actual, 96.6);
    assert.equal(row.wall_minutes.waves[0].actual, 18.6);
    assert.equal(row.trd_rows[0].minutes.actual, 5.6);
    assert.equal(row.trd_rows[0].cost_usd.actual, 1.68);
  });

  test('counts, booleans, strings and nulls are untouched, and the input is not changed', () => {
    const before = JSON.stringify(RAW);
    const r = fmt.roundResult(RAW);
    assert.equal(JSON.stringify(RAW), before);
    const row = r.objectives[0];
    assert.deepEqual([row.trds, row.wall_minutes.waves[0].wave, r.summary.agent_minutes.compared, r.summary.agent_minutes.in_band, r.classes.minutes[0].tasks], [2, 1, 5, 2, 10]);
    assert.deepEqual([row.agent_minutes.within_band, row.agent_minutes.covered, row.agent_minutes.excluded], [true, true, null]);
    assert.deepEqual([row.agent_minutes.source, r.verdict.est08, r.summary.agent_minutes.sc2], ['prospective', 'not met', 'fail']);
    assert.deepEqual([r.band, r.coverage_target], [0.3, 0.8], 'the thresholds are not rounded');
  });
});

describe('9: backtestReport', () => {
  const HEADINGS = [
    '### Verdict',
    '### Executor estimates against actuals',
    '### Wall time (prospective run states)',
    '### Task classes',
    '### Miscalibrated classes',
    '### Exclusions',
  ];
  const headingsOf = (text) => text.split('\n').filter((line) => line.startsWith('### '));
  const lines = (text) => text.split('\n');
  const section = (text, heading) => {
    const all = lines(text);
    const from = all.indexOf(heading);
    assert.notEqual(from, -1, `no ${heading}`);
    const rest = all.slice(from + 1);
    const next = rest.findIndex((line) => line.startsWith('### ') || line === '---');
    return (next === -1 ? rest : rest.slice(0, next)).join('\n').trim();
  };

  test('starts with the verdict and holds the six sections in order', () => {
    const report = fmt.backtestReport(FIVE);
    assert.ok(report.startsWith('### Verdict\n'), report.slice(0, 40));
    assert.deepEqual(headingsOf(report), HEADINGS);
  });

  test('the verdict names SC2 and SC3 with the numbers behind them, per primary metric, then EST-08', () => {
    assert.equal(section(fmt.backtestReport(FIVE), '### Verdict'), [
      '- Agent minutes: SC2 fail (median ratio 1.51, 2 of 5 objectives in ±30%)'
        + ' · SC3 pass (P90 covers 5 of 5 objectives (100%) and 5 of 5 TRDs (100%); target 80%)',
      '- Cost: SC2 pass (median ratio 1.00, 5 of 5 objectives in ±30%)'
        + ' · SC3 pass (P90 covers 5 of 5 objectives (100%) and 5 of 5 TRDs (100%); target 80%)',
      '',
      'EST-08: not met',
    ].join('\n'));
  });

  test('a metric below the minimum is insufficient and says how many objectives were compared against how many are needed', () => {
    const verdict = section(fmt.backtestReport(backtestResult([ON_TARGET, ON_TARGET])), '### Verdict');
    assert.ok(verdict.includes('- Agent minutes: SC2 insufficient (2 objectives compared, 3 needed) · SC3 insufficient (2 objectives compared, 3 needed)'), verdict);
    assert.ok(verdict.endsWith('EST-08: not met'), verdict);
    const met = section(fmt.backtestReport(backtestResult([ON_TARGET, ON_TARGET, ON_TARGET])), '### Verdict');
    assert.ok(met.endsWith('EST-08: met'), met);
  });

  test('one row per objective with its estimates, actuals, ratios and P90 cover, then a summary row per metric', () => {
    const body = section(fmt.backtestReport(FIVE), '### Executor estimates against actuals');
    const rows = lines(body);
    assert.equal(rows[0], '| Objective | TRDs | Source | Agent min p50 / P90 | Actual | Ratio | <= P90 | Cost p50 / P90 | Actual | Ratio | <= P90 |');
    assert.equal(rows[1], '|---|---|---|---|---|---|---|---|---|---|---|');
    assert.equal(rows[2], '| 90 Alpha | 1 | reconstructed | 2h 09m / 6h 40m | 1h 40m | 1.29 | yes | $1.68 / $6.72 | $1.68 | 1.00 | yes |');
    assert.equal(rows[6], '| 94 Alpha | 1 | reconstructed | 1h 35m / 6h 40m | 1h 40m | 0.95 | yes | $1.68 / $6.72 | $1.68 | 1.00 | yes |');
    assert.deepEqual(rows.slice(7), [
      '',
      '| Metric | Compared | Median ratio | Pooled ratio | In band | P90 covers objectives | P90 covers TRDs | At or under median |',
      '|---|---|---|---|---|---|---|---|',
      '| Agent minutes | 5 | 1.51 | 1.50 | 2 of 5 | 5 of 5 (100%) | 5 of 5 (100%) | 4 of 5 (80%) |',
      '| Cost | 5 | 1.00 | 1.00 | 5 of 5 | 5 of 5 (100%) | 5 of 5 (100%) | 5 of 5 (100%) |',
    ]);
  });

  test('an excluded metric shows its reason and the TRDs behind it in its cells, and is listed under Exclusions', () => {
    const result = backtestResult([ON_TARGET, { ...ON_TARGET, noMinutes: true }, ON_TARGET, ON_TARGET]);
    const report = fmt.backtestReport(result);
    assert.ok(
      report.includes('| 91 Alpha | 1 | reconstructed | 1h 40m / 6h 40m | excluded: incomplete actuals (91-01) | n/a | n/a | $1.68 / $6.72 | $1.68 | 1.00 | yes |'),
      report,
    );
    assert.equal(section(report, '### Exclusions'), '- Agent minutes, objective 91: incomplete actuals (91-01)');
    assert.ok(section(report, '### Verdict').includes('SC2 pass (median ratio 1.00, 3 of 3 objectives in ±30%)'), 'the three compared objectives carry the verdict');
  });

  test('an objective with nothing to estimate is excluded from both metrics with no ids, and no class table has rows', () => {
    const empty = { available: true, calibration: CALIBRATION, ...backtest.buildBacktest({
      estimates: [fx.objectiveEstimate({ objective: '95', dir: '95-empty', execution: null, trds: [] })], project: fx.projectRecord([]), rates: fx.testRates(),
    }) };
    const report = fmt.backtestReport(empty);
    assert.ok(report.includes('| 95 Alpha | 0 | reconstructed | n/a | excluded: no estimate | n/a | n/a | n/a | excluded: no estimate | n/a | n/a |'), report);
    assert.equal(section(report, '### Exclusions'), '- Agent minutes, objective 95: no estimate\n- Cost, objective 95: no estimate');
    assert.equal(section(report, '### Miscalibrated classes'), 'none');
    assert.equal(section(report, '### Task classes'), '**Agent minutes**\n\nnone\n\n**Cost**\n\nnone');
  });

  test('wall time says `none recorded` when no objective has a finished run state, and nothing else', () => {
    assert.equal(section(fmt.backtestReport(FIVE), '### Wall time (prospective run states)'), 'none recorded');
  });

  test('wall time lists each run state against its estimate, says which wall figure it compares, then the waves', () => {
    const set = measured([ON_TARGET, ON_TARGET, ON_TARGET]);
    set.estimates[0].execution.wall_minutes = fx.stat(100, 300);
    set.runs = {
      90: fx.runState({
        objective: '90',
        started_at: '2026-10-06T23:00:00.000Z',
        finished_at: '2026-10-07T00:40:00.000Z',
        wall: fx.stat(100, 300),
        waves: [{ wave: 1, trds: ['90-01'], p50: 50, p90: 150, actual_minutes: 100 }],
      }),
    };
    const result = { available: true, calibration: CALIBRATION, ...backtest.buildBacktest(set) };
    const body = section(fmt.backtestReport(result), '### Wall time (prospective run states)');
    assert.ok(body.includes('`estimate.wall_minutes`'), body);
    assert.ok(body.includes('execution only'), 'the report says the wall estimate excludes the verifier');
    assert.ok(body.includes('Reported, never judged.'), body);
    assert.ok(body.includes([
      '| Objective | Estimate p50 / P90 | Reconstructed p50 / P90 | Actual | Ratio | <= P90 | Reproduced |',
      '|---|---|---|---|---|---|---|',
      '| 90 Alpha | 1h 40m / 5h 00m | 1h 40m / 5h 00m | 1h 40m | 1.00 | yes | yes |',
    ].join('\n')), body);
    assert.ok(body.includes([
      '| Objective | Wave | TRDs | Estimate p50 / P90 | Actual | Ratio | <= P90 |',
      '|---|---|---|---|---|---|---|',
      '| 90 Alpha | 1 | 90-01 | 50 min / 2h 30m | 1h 40m | 0.50 | yes |',
    ].join('\n')), body);
    assert.ok(body.endsWith('No finished run state: 91, 92 (no run state recorded).'), body);
  });

  test('a run state that carries the executor estimate makes the row prospective, one that carries only minutes makes it mixed', () => {
    const run = (execution) => fx.runState({ objective: '90', started_at: '2026-10-06T23:00:00.000Z', finished_at: '2026-10-07T00:40:00.000Z', execution });
    const prospective = backtest.buildBacktest({ ...measured([ON_TARGET, ON_TARGET, ON_TARGET]), runs: {
      90: run({ agent_minutes: fx.stat(200, 500), cost_usd: fx.stat(TRD_COST * 2, TRD_COST * 8) }),
    } });
    assert.ok(
      fmt.backtestReport({ available: true, calibration: CALIBRATION, ...prospective })
        .includes('| 90 Alpha | 1 | prospective | 3h 20m / 8h 20m | 1h 40m | 2.00 | yes | $3.36 / $13.44 | $1.68 | 2.00 | yes |'),
    );
    const mixed = backtest.buildBacktest({ ...measured([ON_TARGET, ON_TARGET, ON_TARGET]), runs: { 90: run({ agent_minutes: fx.stat(200, 500) }) } });
    assert.ok(
      fmt.backtestReport({ available: true, calibration: CALIBRATION, ...mixed })
        .includes('| 90 Alpha | 1 | minutes prospective, cost reconstructed | 3h 20m / 8h 20m |'),
    );
  });

  test('a run state without a wall estimate still prints its measured time, with n/a where there is nothing to compare', () => {
    const set = measured([ON_TARGET, ON_TARGET, ON_TARGET]);
    set.runs = { 90: fx.runState({ objective: '90', started_at: '2026-10-06T23:00:00.000Z', finished_at: '2026-10-07T00:40:00.000Z', wall: null }) };
    const body = section(fmt.backtestReport({ available: true, calibration: CALIBRATION, ...backtest.buildBacktest(set) }), '### Wall time (prospective run states)');
    assert.ok(body.includes('| 90 Alpha | n/a | n/a | 1h 40m | n/a | n/a | n/a |'), body);
  });

  test('class tables give each class its tasks, median ratio, coverage and verdict; miscalibrated ones are listed with their flags', () => {
    const report = fmt.backtestReport(FIVE);
    assert.equal(section(report, '### Task classes'), [
      '**Agent minutes**',
      '',
      '| Class | Tasks | Median ratio | P90 coverage | Verdict |',
      '|---|---|---|---|---|',
      '| code_tdd | 10 | 1.51 | 100% | miscalibrated: biased_high |',
      '',
      '**Cost**',
      '',
      '| Class | Tasks | Median ratio | P90 coverage | Verdict |',
      '|---|---|---|---|---|',
      '| code_tdd | 10 | 1.00 | 100% | ok |',
    ].join('\n'));
    assert.equal(section(report, '### Miscalibrated classes'), '- code_tdd (minutes): biased_high, median ratio 1.51, coverage 100%');
  });

  test('a cost class that is too high and too narrow lists both flags, and none is `none`', () => {
    const high = backtestResult([1, 2, 3, 4].map(() => ({ agent: 100, cost: 2 })));
    assert.equal(section(fmt.backtestReport(high), '### Miscalibrated classes'), '- code_tdd (cost): biased_high, median ratio 2.00, coverage 100%');
    assert.equal(section(fmt.backtestReport(backtestResult([ON_TARGET, ON_TARGET, ON_TARGET])), '### Miscalibrated classes'), 'none');
  });

  test('the footer names the calibration it ran against and the thresholds', () => {
    const report = fmt.backtestReport(FIVE);
    assert.equal(lines(report).pop(), 'Calibration /tmp/frozen/calibration.json, data as of 2026-10-05, samples 50 TRDs / 120 tasks / 40 with tokens, inputs_digest abc123. Band ±30%, coverage target 80%.');
    const noDigest = fmt.backtestReport({ ...FIVE, calibration: { ...CALIBRATION, inputs_digest: null } });
    assert.ok(lines(noDigest).pop().includes('inputs_digest none.'), lines(noDigest).pop());
  });

  test('a result with no usable calibration is `No estimate: <reason>`', () => {
    assert.equal(fmt.backtestReport({ available: false, reason: 'no calibration file' }), 'No estimate: no calibration file');
  });

  test('the report does not change its input', () => {
    const before = JSON.stringify(FIVE);
    fmt.backtestReport(FIVE);
    fmt.backtestLine(FIVE);
    assert.equal(JSON.stringify(FIVE), before);
  });
});
