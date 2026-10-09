'use strict';

// Tests for scripts/estimate-rolling-backtest.cjs (TRD 64-08, EST-08 gap closure). Hand-built fixtures only: a
// backtest project written into an mkdtemp directory, three calibrations from makeCalibration whose code_tdd and `all`
// minutes differ, and literal verdict objects for the ship rule. No git, no network, no ~/.claude, and nothing here
// scores objectives 59-63.
//
// Test list (TRD 64-08, items 16-21), outermost first:
//   20 the CLI: --old N=<file> (repeatable) prints the verdict; with --new the before/after table and `Ship default:`;
//      exit 1 for no --old, `--old 90`, a missing file, an unreadable calibration and an unknown flag
//   16 each objective is estimated from its OWN calibration
//   17 the verdict is buildBacktest's over the same estimates
//   18 a missing calibration is an exclusion, never a fallback
//   19 shipRule, table driven
//   21 isolation: an empty HOME stays empty, the source never names the calibration writer or the default path

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const rolling = require('./estimate-rolling-backtest.cjs');
const lib = path.join(__dirname, '..', 'plugins', 'aoforge', 'aoforge', 'bin', 'lib');
const { cloneSpec } = require(path.join(lib, '__fixtures__', 'calibration-fixtures.cjs'));
const { BACKTEST_SPEC, makeBacktestProject, removeBacktestProject } = require(path.join(lib, '__fixtures__', 'backtest-fixtures.cjs'));
const { makeCalibration, writeCalibrationFile } = require(path.join(lib, '__fixtures__', 'estimate-fixtures.cjs'));
const backtest = require(path.join(lib, 'estimate-backtest.cjs'));
const ci = require(path.join(lib, 'calibration-inputs.cjs'));
const rollup = require(path.join(lib, 'estimate-rollup.cjs'));

const SCRIPT = path.join(__dirname, 'estimate-rolling-backtest.cjs');

// ─── fixtures ─────────────────────────────────────────────────────────────────

const TOKENS = {
  tokens_input: 500000, tokens_output: 5000, tokens_cache_read: 300000, tokens_cache_write: 100000, token_model: 'claude-opus-5-5',
};

/** BACKTEST_SPEC with 91-beta TRD 02 given a duration, and a third measured objective 92-gamma. */
function fixtureSpec() {
  const spec = cloneSpec(BACKTEST_SPEC);
  spec.objectives[1].trds[1].summary.duration = '12min';
  spec.objectives.push({
    dir: '92-gamma',
    trds: [
      {
        nn: '01', slug: 'one', frontmatter: { type: 'standard' },
        tasks: [{ name: 'Task 1: code', type: 'auto', tdd: true, files: ['lib/g.cjs', 'lib/g.test.cjs'] }],
        summary: { duration: '9min', completed: '2026-10-06', ...TOKENS },
      },
      {
        nn: '02', slug: 'two', frontmatter: { type: 'standard' },
        tasks: [{ name: 'Task 1: docs', type: 'auto', files: ['docs/g.md'] }],
        summary: { duration: '11min', completed: '2026-10-06', ...TOKENS },
      },
    ],
  });
  return spec;
}

/** A calibration whose code_tdd and `all` minutes are as given: the only thing that differs between the three. */
function calWith(label, codeP50, codeP90, allP50, allP90, extra = {}) {
  return makeCalibration({
    data_as_of: `2026-10-0${label.length}`,
    inputs_digest: `sha256:${label.repeat(64).slice(0, 64)}`,
    task_classes: {
      code_tdd: { minutes: { p50: codeP50, p90: codeP90 } },
      all: { minutes: { p50: allP50, p90: allP90 } },
    },
    ...extra,
  });
}

const calA = () => calWith('a', 6, 18, 5, 15);
const calB = () => calWith('bb', 12, 30, 8, 24, { window: { objectives: 10, projects: [] } });
const calC = () => calWith('ccc', 3, 9, 2.5, 8);
// "New" calibrations: the same shape, with minutes that land nearer the actuals.
const newA = () => calWith('d', 4, 12, 4, 12);
const newB = () => calWith('ee', 5, 15, 4, 12);
const newC = () => calWith('fff', 4, 12, 4, 12);

const minutesP50 = (cal, base, objective) => rollup.estimateObjective(cal, base, objective, { all: true }).execution.agent_minutes.p50;

let project;
let scratch;
let emptyHome;
before(() => {
  project = makeBacktestProject(fixtureSpec());
  scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-rolling-')));
  emptyHome = path.join(scratch, 'home');
  fs.mkdirSync(emptyHome);
});
after(() => {
  removeBacktestProject(project);
  fs.rmSync(scratch, { recursive: true, force: true });
});

let fileCounter = 0;
/** Writes `cal` to its own directory in the scratch dir and returns the file path. */
function calFile(cal) {
  fileCounter += 1;
  return writeCalibrationFile(path.join(scratch, `cal-${fileCounter}`), cal);
}

function runCli(args, { cwd = scratch, home = emptyHome } = {}) {
  const env = { ...process.env, HOME: home };
  delete env.AOFORGE_CALIBRATION_PATH;
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, env, encoding: 'utf-8', timeout: 120000 });
}

// ─── Item 20: the CLI ─────────────────────────────────────────────────────────

describe('20. the CLI', () => {
  let oldFiles;
  let newFiles;
  before(() => {
    oldFiles = { 90: calFile(calA()), 91: calFile(calB()), 92: calFile(calC()) };
    newFiles = { 90: calFile(newA()), 91: calFile(newB()), 92: calFile(newC()) };
  });
  const oldArgs = () => Object.entries(oldFiles).flatMap(([n, f]) => ['--old', `${n}=${f}`]);
  const newArgs = () => Object.entries(newFiles).flatMap(([n, f]) => ['--new', `${n}=${f}`]);

  test('20a. --old for three objectives with --raw exits 0 and prints the verdict', () => {
    const r = runCli([...oldArgs(), '--repo', project, '--raw']);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes('### Verdict'), r.stdout);
    assert.match(r.stdout, /EST-08: (met|not met)/);
    assert.equal(r.stdout.includes('Ship default'), false, 'no --new, no ship rule');
    assert.equal(r.stderr, '');
  });

  test('20b. the default output is JSON: the old result with one row per objective, no ship rule', () => {
    const r = runCli([...oldArgs(), '--repo', project]);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(out), ['old']);
    assert.deepEqual(out.old.objectives.map((o) => o.objective), ['90', '91', '92']);
    assert.ok(['met', 'not met'].includes(out.old.verdict.est08));
    assert.deepEqual(out.old.excluded_inputs, []);
    assert.deepEqual(out.old.calibrations.map((c) => c.objective), ['90', '91', '92']);
    assert.equal(out.old.calibrations[1].window, 10);
    assert.equal(out.old.calibrations[0].window, null);
    assert.match(out.old.calibrations[0].inputs_digest, /^sha256:a+$/);
  });

  test('20c. with --new it prints the before/after table and a Ship default line, and the JSON carries ship', () => {
    const raw = runCli([...oldArgs(), ...newArgs(), '--repo', project, '--raw']);
    assert.equal(raw.status, 0, raw.stderr);
    assert.match(raw.stdout, /\| Objective \| Minutes ratio old \| Minutes ratio new \| Cost ratio old \| Cost ratio new \|/);
    assert.match(raw.stdout, /^Ship default: (true|false) \(.+\)$/m);
    assert.equal((raw.stdout.match(/### Verdict/g) || []).length, 2, 'a verdict for each set');
    for (const n of ['90', '91', '92']) assert.match(raw.stdout, new RegExp(`^\\| ${n} \\|`, 'm'));

    const json = runCli([...oldArgs(), ...newArgs(), '--repo', project]);
    assert.equal(json.status, 0, json.stderr);
    const out = JSON.parse(json.stdout);
    assert.deepEqual(Object.keys(out), ['old', 'new', 'ship']);

    // The decision is shipRule's over the UNROUNDED library results; only the output is rounded, once.
    const oldResult = rolling.rollingBacktest({ base: project, old: { 90: calA(), 91: calB(), 92: calC() } });
    const newResult = rolling.rollingBacktest({ base: project, old: { 90: newA(), 91: newB(), 92: newC() } });
    const expected = rolling.shipRule(oldResult, newResult);
    assert.equal(out.ship.ship_default, expected.ship_default);
    assert.equal(out.ship.improved, expected.improved);
    assert.deepEqual(out.ship.regressions, expected.regressions);
    assert.equal(out.ship.minutes_median_old, Number(expected.minutes_median_old.toFixed(3)));
    assert.equal(out.ship.minutes_median_new, Number(expected.minutes_median_new.toFixed(3)));
    assert.match(raw.stdout, new RegExp(`^Ship default: ${expected.ship_default}`, 'm'));
  });

  test('20d. the repository defaults to cwd and --json also writes the JSON to a file', () => {
    const jsonFile = path.join(scratch, 'out-20d.json');
    const r = runCli([...oldArgs(), '--json', jsonFile], { cwd: project });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(jsonFile, 'utf-8')), JSON.parse(r.stdout));
  });

  test('20e. usage errors exit 1 with the usage line and print no result', () => {
    const oneOld = ['--old', `90=${oldFiles[90]}`];
    const cases = [
      { name: 'no --old', args: ['--repo', project], message: /needs at least one --old/ },
      { name: 'no flags at all', args: [], message: /usage:/ },
      { name: '--old without =file', args: ['--old', '90', '--repo', project], message: /--old 90.*N=<file>/ },
      { name: '--old with an empty file', args: ['--old', '90=', '--repo', project], message: /N=<file>/ },
      { name: '--old with a bad objective', args: ['--old', `abc=${oldFiles[90]}`, '--repo', project], message: /objective number/ },
      { name: 'the same objective twice', args: [...oneOld, ...oneOld, '--repo', project], message: /objective 90 is listed twice/ },
      { name: '--new for other objectives', args: [...oneOld, '--new', `91=${newFiles[91]}`, '--repo', project], message: /same objectives/ },
      { name: 'an unknown flag', args: [...oneOld, '--bogus'], message: /unknown flag --bogus/ },
      { name: 'a flag without its value', args: [...oneOld, '--repo'], message: /--repo needs a value/ },
      { name: 'a stray argument', args: [...oneOld, 'extra'], message: /unexpected argument "extra"/ },
    ];
    for (const c of cases) {
      const r = runCli(c.args);
      assert.equal(r.status, 1, `${c.name}: ${r.stdout}`);
      assert.match(r.stderr, c.message, c.name);
      assert.match(r.stderr, /usage: /, c.name);
      assert.equal(r.stdout, '', `${c.name} printed a result`);
    }
  });

  test('20f. a missing calibration file and an unreadable one exit 1 and print the loader reason', () => {
    const missing = path.join(scratch, 'no-such-dir', 'calibration.json');
    const r = runCli(['--old', `90=${missing}`, '--repo', project]);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes(`no calibration file at ${missing}`), r.stderr);
    assert.equal(r.stdout, '');

    const garbage = path.join(scratch, 'garbage.json');
    fs.writeFileSync(garbage, '{not json');
    const g = runCli(['--old', `90=${garbage}`, '--repo', project]);
    assert.equal(g.status, 1);
    assert.ok(g.stderr.includes(`calibration file ${garbage} is unreadable`), g.stderr);

    const wrongVersion = calFile(makeCalibration({ version: 99 }));
    const v = runCli(['--old', `90=${wrongVersion}`, '--repo', project]);
    assert.equal(v.status, 1);
    assert.match(v.stderr, /calibration version 99/);
  });

  test('20g. an objective the repository does not have exits 1 naming it, with no usage line', () => {
    const r = runCli(['--old', `99=${oldFiles[90]}`, '--repo', project]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /objective 99 not found/);
    assert.equal(r.stdout, '');
  });

  test('20h. --json refuses a path under ~/.claude', () => {
    const r = runCli([...oldArgs(), '--repo', project, '--json', path.join(emptyHome, '.claude', 'aoforge', 'out.json')]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /refuses a path under ~\/\.claude/);
    assert.equal(fs.existsSync(path.join(emptyHome, '.claude')), false);
  });

  test('20i. --help exits 0 with the usage line', () => {
    const r = runCli(['--help']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /usage: estimate-rolling-backtest\.cjs/);
  });
});

// ─── Items 16-18: rollingBacktest ─────────────────────────────────────────────

describe('rollingBacktest', () => {
  const old = () => ({ 90: calA(), 91: calB(), 92: calC() });

  test('16. each objective is estimated from its own calibration, and the three differ', () => {
    const result = rolling.rollingBacktest({ base: project, old: old() });
    assert.deepEqual(result.objectives.map((o) => o.objective), ['90', '91', '92']);
    const got = Object.fromEntries(result.objectives.map((o) => [o.objective, o.agent_minutes.p50]));
    assert.equal(got['90'], minutesP50(calA(), project, '90'));
    assert.equal(got['91'], minutesP50(calB(), project, '91'));
    assert.equal(got['92'], minutesP50(calC(), project, '92'));
    assert.equal(new Set(Object.values(got)).size, 3, `three different estimates: ${JSON.stringify(got)}`);
    // The fixture discriminates: under another objective's calibration 91 would not give the same number.
    assert.notEqual(got['91'], minutesP50(calA(), project, '91'));
    assert.notEqual(got['92'], minutesP50(calB(), project, '92'));
  });

  test('17. the verdict is buildBacktest over the same three estimates', () => {
    const result = rolling.rollingBacktest({ base: project, old: old() });
    const estimates = [
      rollup.estimateObjective(calA(), project, '90', { all: true }),
      rollup.estimateObjective(calB(), project, '91', { all: true }),
      rollup.estimateObjective(calC(), project, '92', { all: true }),
    ];
    const expected = backtest.buildBacktest({ estimates, project: ci.collectProject(project), rates: ci.loadRates(), runs: {} });
    assert.deepEqual(result.verdict, expected.verdict);
    assert.deepEqual(result.summary, expected.summary);
    assert.deepEqual(result.objectives, expected.objectives);
    assert.deepEqual(result.classes, expected.classes);
    for (const status of ['agent_minutes', 'cost_usd']) {
      assert.notEqual(result.verdict.sc2[status], 'insufficient', `three measured objectives are enough for ${status}`);
    }
    assert.deepEqual(result.excluded_inputs, []);
  });

  test('17b. the calibrations block names each calibration that was used', () => {
    const result = rolling.rollingBacktest({ base: project, old: old() });
    assert.deepEqual(result.calibrations, [
      { objective: '90', data_as_of: calA().data_as_of, samples: calA().samples, inputs_digest: calA().inputs_digest, window: null },
      { objective: '91', data_as_of: calB().data_as_of, samples: calB().samples, inputs_digest: calB().inputs_digest, window: 10 },
      { objective: '92', data_as_of: calC().data_as_of, samples: calC().samples, inputs_digest: calC().inputs_digest, window: null },
    ]);
  });

  test('17c. the order of the keys of `old` does not matter: objectives are estimated in numeric order', () => {
    const reversed = rolling.rollingBacktest({ base: project, old: { 92: calC(), 91: calB(), 90: calA() } });
    assert.deepEqual(reversed.objectives.map((o) => o.objective), ['90', '91', '92']);
    assert.deepEqual(reversed.verdict, rolling.rollingBacktest({ base: project, old: old() }).verdict);
  });

  test('18. a missing calibration is an exclusion: no fallback, and two objectives left are insufficient', () => {
    for (const input of [
      { old: { 90: calA(), 92: calC() }, objectives: ['90', '91', '92'] },
      { old: { 90: calA(), 91: null, 92: calC() } },
    ]) {
      const result = rolling.rollingBacktest({ base: project, ...input });
      assert.deepEqual(result.excluded_inputs, [{ objective: '91', reason: 'no calibration' }]);
      assert.deepEqual(result.objectives.map((o) => o.objective), ['90', '92'], '91 is not estimated at all');
      const got = Object.fromEntries(result.objectives.map((o) => [o.objective, o.agent_minutes.p50]));
      assert.equal(got['90'], minutesP50(calA(), project, '90'));
      assert.equal(got['92'], minutesP50(calC(), project, '92'));
      assert.deepEqual(result.verdict.sc2, { agent_minutes: 'insufficient', cost_usd: 'insufficient' });
      assert.deepEqual(result.verdict.sc3, { agent_minutes: 'insufficient', cost_usd: 'insufficient' });
      assert.equal(result.verdict.est08, 'not met');
      assert.deepEqual(result.calibrations.map((c) => c.objective), ['90', '92']);
    }
  });

  test('18b. a key that is not an objective number is an error, and an unreadable rates file is an error', () => {
    assert.throws(() => rolling.rollingBacktest({ base: project, old: { abc: calA() } }), /objective number/);
    assert.throws(() => rolling.rollingBacktest({ base: project, old: old(), ratesFile: path.join(scratch, 'no-such-rates.json') }), /cannot read model rates/);
    assert.throws(() => rolling.rollingBacktest({ base: project, old: { 99: calA() } }), /objective 99 not found/);
  });

  test('18c. the inputs are not modified', () => {
    const input = old();
    const before = JSON.stringify(input);
    rolling.rollingBacktest({ base: project, old: input });
    assert.equal(JSON.stringify(input), before);
  });
});

// ─── Item 19: shipRule ────────────────────────────────────────────────────────

describe('19. shipRule', () => {
  /** A backtest result trimmed to what the rule reads. Statuses default to the passing side except sc2 of minutes. */
  function res({ est08 = 'not met', ratio, sc2m = 'fail', sc3m = 'pass', sc2c = 'pass', sc3c = 'pass' }) {
    return {
      verdict: { est08, sc2: { agent_minutes: sc2m, cost_usd: sc2c }, sc3: { agent_minutes: sc3m, cost_usd: sc3c } },
      summary: { agent_minutes: { median_ratio: ratio } },
    };
  }

  const cases = [
    {
      name: '(a) the new method meets EST-08', old: res({ ratio: 1.51 }), next: res({ est08: 'met', ratio: 1.05, sc2m: 'pass' }),
      ship: true, improved: true, regressions: [], reason: /EST-08/,
    },
    {
      name: '(a2) met ships even if the median is no closer to 1', old: res({ ratio: 1.01, sc2m: 'pass' }), next: res({ est08: 'met', ratio: 1.2, sc2m: 'pass' }),
      ship: true, improved: false, regressions: [], reason: /EST-08/,
    },
    {
      name: '(b) not met, median closer to 1, nothing regresses', old: res({ ratio: 1.51 }), next: res({ ratio: 1.2 }),
      ship: true, improved: true, regressions: [], reason: /closer to 1/,
    },
    {
      name: '(b2) closer to 1 from the other side (0.5 to 1.6)', old: res({ ratio: 0.5 }), next: res({ ratio: 1.6 }),
      ship: true, improved: true, regressions: [], reason: /closer to 1/,
    },
    {
      name: '(c) improved but cost SC2 passed under old and fails under new', old: res({ ratio: 1.51 }), next: res({ ratio: 1.2, sc2c: 'fail' }),
      ship: false, improved: true, regressions: [{ metric: 'cost_usd', sc: 'sc2' }], reason: /regress/,
    },
    {
      name: '(c2) several regressions are listed minutes first, sc2 before sc3',
      old: res({ ratio: 1.51, sc2m: 'pass' }), next: res({ ratio: 1.1, sc2m: 'fail', sc3c: 'fail', sc3m: 'fail' }),
      ship: false, improved: true,
      regressions: [{ metric: 'agent_minutes', sc: 'sc2' }, { metric: 'agent_minutes', sc: 'sc3' }, { metric: 'cost_usd', sc: 'sc3' }],
      reason: /regress/,
    },
    {
      name: '(d) the new median is farther from 1', old: res({ ratio: 1.2 }), next: res({ ratio: 1.51 }),
      ship: false, improved: false, regressions: [], reason: /not closer to 1/,
    },
    {
      name: '(d2) farther on the other side (1.5 to 0.5)', old: res({ ratio: 1.5 }), next: res({ ratio: 0.5 }),
      ship: false, improved: false, regressions: [], reason: /not closer to 1/,
    },
    {
      name: '(d3) an equal median is not closer', old: res({ ratio: 1.3 }), next: res({ ratio: 1.3 }),
      ship: false, improved: false, regressions: [], reason: /not closer to 1/,
    },
    {
      name: '(e) insufficient is not a pass on the old side: nothing regressed', old: res({ ratio: 1.51, sc3c: 'insufficient' }),
      next: res({ ratio: 1.2, sc3c: 'fail' }), ship: true, improved: true, regressions: [], reason: /closer to 1/,
    },
    {
      name: '(e2) insufficient is not a pass on the new side: a passing status regressed', old: res({ ratio: 1.51 }),
      next: res({ ratio: 1.2, sc3c: 'insufficient' }), ship: false, improved: true, regressions: [{ metric: 'cost_usd', sc: 'sc3' }], reason: /regress/,
    },
    {
      name: '(f) a median that cannot be computed is not an improvement', old: res({ ratio: null }), next: res({ ratio: 1.2 }),
      ship: false, improved: false, regressions: [], reason: /no agent-minutes median/,
    },
  ];

  for (const c of cases) {
    test(c.name, () => {
      const oldBefore = JSON.stringify(c.old);
      const nextBefore = JSON.stringify(c.next);
      const r = rolling.shipRule(c.old, c.next);
      assert.equal(r.ship_default, c.ship, JSON.stringify(r));
      assert.equal(r.improved, c.improved);
      assert.deepEqual(r.regressions, c.regressions);
      assert.equal(r.est08_old, c.old.verdict.est08);
      assert.equal(r.est08_new, c.next.verdict.est08);
      assert.equal(r.minutes_median_old, c.old.summary.agent_minutes.median_ratio);
      assert.equal(r.minutes_median_new, c.next.summary.agent_minutes.median_ratio);
      assert.match(r.reason, c.reason);
      assert.equal(JSON.stringify(c.old), oldBefore, 'old is not modified');
      assert.equal(JSON.stringify(c.next), nextBefore, 'new is not modified');
    });
  }

  test('the rule decides on unrounded medians: 1.3004 against 1.3 is not an improvement', () => {
    const r = rolling.shipRule(res({ ratio: 1.3 }), res({ ratio: 1.3004 }));
    assert.equal(r.improved, false);
    assert.equal(rolling.shipRule(res({ ratio: 1.3004 }), res({ ratio: 1.3 })).improved, true);
  });
});

// ─── Item 21: isolation ───────────────────────────────────────────────────────

describe('21. isolation', () => {
  test('the CLI leaves an empty HOME empty and never names a default calibration', () => {
    const home = path.join(scratch, 'home-21');
    fs.mkdirSync(home);
    const files = [calFile(calA()), calFile(calB()), calFile(calC())];
    const args = ['90', '91', '92'].flatMap((n, i) => ['--old', `${n}=${files[i]}`]);
    const r = runCli([...args, '--repo', project], { home });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(fs.readdirSync(home), [], 'nothing was created under HOME');
    assert.equal(fs.existsSync(path.join(home, '.claude')), false);
  });

  test('a calibration named by AOFORGE_CALIBRATION_PATH is never read', () => {
    const decoy = calFile(makeCalibration({ data_as_of: '1999-01-01' }));
    const files = [calFile(calA()), calFile(calB()), calFile(calC())];
    const args = ['90', '91', '92'].flatMap((n, i) => ['--old', `${n}=${files[i]}`]);
    const env = { ...process.env, HOME: emptyHome, AOFORGE_CALIBRATION_PATH: decoy };
    const r = spawnSync(process.execPath, [SCRIPT, ...args, '--repo', project], { cwd: scratch, env, encoding: 'utf-8', timeout: 120000 });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.includes('1999-01-01'), false);
  });

  test('the script source names neither the calibration writer nor the default path', () => {
    const source = fs.readFileSync(SCRIPT, 'utf-8');
    assert.equal(source.includes('writeCalibration'), false);
    assert.equal(source.includes('defaultCalibrationPath'), false);
  });

  test('the constants of the backtest are untouched', () => {
    assert.equal(backtest.BAND, 0.3);
    assert.equal(backtest.COVERAGE_TARGET, 0.8);
    assert.equal(backtest.MIN_OBJECTIVES, 3);
  });
});
