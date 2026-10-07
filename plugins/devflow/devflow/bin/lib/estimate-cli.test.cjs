'use strict';

// estimate-cli.test.cjs (TRD 58-08, EST-02/EST-03/EST-05) — `df-tools estimate`.
//
// Test list (TRD 58-08), outermost first.
//   Spawned (the real df-tools, `--cwd <fixture>`):
//     1  no subcommand exits 1 with the usage line; `estimate --help` exits 0 and prints it
//     2  with DEVFLOW_CALIBRATION_PATH=<CAL_V2 file>: `objective 80 --table --raw` and `task --class code_tdd --raw`
//     3  fake HOME and no calibration file: `objective 80 --raw` exits 0 with `No estimate:` naming df-tools calibrate
//   Direct `runEstimate` (T0 = 2026-10-05T18:00:00.000Z):
//     4  task: --files/--tdd, --class (with the all-tasks fallback), --checkpoint, and the usage errors
//     5  trd 80-01
//     6  objective: JSON, the unplanned, done and missing objectives
//     7  milestone: the table, a milestone with nothing left
//     8  start 80 writes the run state: objective '80', two waves with their estimates; the text is `objective 80 --line`
//     9  wave 1 --start / --done print actual against the estimate; wave 2 --start leaves about a minute (remainingMinutes)
//     10 no run state: wave --start creates one, wave --done says `actual unknown`; --start with --done is a usage error
//     11 finish prints the execution actual against the estimate, again idempotently; the status segment is then empty
//     plus: a spawned `start` (the dispatcher passes the real clock), no calibration, stale state, double --start/--done
//
// Hermetic: the project is MILESTONE_SPEC written into an mkdtemp directory, the calibration is the literal CAL_V2 written
// to a temp file, the run-state directory is a temp directory (DEVFLOW_ESTIMATE_STATE_DIR) and every spawned process gets
// HOME=<temp dir>. Nothing here reads or writes the real ~/.claude.

const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { runEstimate, USAGE } = require('./estimate-cli.cjs');
const store = require('./estimate-run-store.cjs');
const { finishedRun } = require('./__fixtures__/estimate-run-fixtures.cjs');
const {
  CAL_V2,
  MILESTONE_SPEC,
  makeEstimateProject,
  removeEstimateProject,
  writeCalibrationFile,
} = require('./__fixtures__/estimate-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');
const T0 = Date.parse('2026-10-05T18:00:00.000Z');

let root;
let scratch;
let calFile;
let stateDir;
let fakeHome;

before(() => {
  root = makeEstimateProject(MILESTONE_SPEC);
  scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-estimate-cli-')));
  calFile = writeCalibrationFile(path.join(scratch, 'cal'), CAL_V2);
  stateDir = path.join(scratch, 'state');
  fakeHome = path.join(scratch, 'home');
  fs.mkdirSync(fakeHome, { recursive: true });
});

after(() => {
  removeEstimateProject(root);
  fs.rmSync(scratch, { recursive: true, force: true });
});

/** The real df-tools. `calibration` sets DEVFLOW_CALIBRATION_PATH; it is otherwise removed from the child's environment. */
function spawnEstimate(argv, { calibration } = {}) {
  const env = { ...process.env, HOME: fakeHome, DEVFLOW_ESTIMATE_STATE_DIR: stateDir };
  delete env.DEVFLOW_CALIBRATION_PATH;
  if (calibration) env.DEVFLOW_CALIBRATION_PATH = calibration;
  return spawnSync(process.execPath, [DF_TOOLS, '--cwd', root, 'estimate', ...argv], {
    encoding: 'utf-8',
    env,
    timeout: 30000,
  });
}

/** `runEstimate` against the fixture, with the calibration reachable only through the temp file. */
function run(argv, extra = {}) {
  return runEstimate({
    argv,
    cwd: root,
    env: { DEVFLOW_CALIBRATION_PATH: calFile, DEVFLOW_ESTIMATE_STATE_DIR: stateDir },
    now: T0,
    ...extra,
  });
}

function ok(r) {
  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
  return r;
}

// ─── 1-3: spawned ─────────────────────────────────────────────────────────────

describe('spawned df-tools estimate', () => {
  test('1: no subcommand exits 1 with the usage line; --help exits 0 and prints it', () => {
    const bare = spawnEstimate([]);
    assert.equal(bare.status, 1, bare.stderr);
    assert.match(bare.stderr, /Usage: df-tools estimate /);

    const help = spawnEstimate(['--help']);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /^Usage: df-tools estimate /m);
  });

  test('2: objective --table --raw and task --class --raw print the text', () => {
    const table = spawnEstimate(['objective', '80', '--table', '--raw'], { calibration: calFile });
    assert.equal(table.status, 0, table.stderr);
    assert.equal(table.stdout.split('\n')[0], '| Objective 80 (3 TRDs left, 2 waves) | Median | P90 |');

    const task = spawnEstimate(['task', '--class', 'code_tdd', '--raw'], { calibration: calFile });
    assert.equal(task.status, 0, task.stderr);
    const lines = task.stdout.split('\n').filter((l) => l !== '');
    assert.equal(lines.length, 1, task.stdout);
    assert.ok(lines[0].startsWith('Task code_tdd: 6 min (P90 18 min)'), lines[0]);
  });

  test('3: no calibration file is `No estimate:` naming df-tools calibrate, exit 0', () => {
    const r = spawnEstimate(['objective', '80', '--raw']);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.startsWith('No estimate:'), r.stdout);
    assert.ok(r.stdout.includes('df-tools calibrate'), r.stdout);
    assert.ok(r.stdout.includes(fakeHome), `the reason names the file it looked for: ${r.stdout}`);
  });

  test('3b: the JSON form of a missing calibration says available: false and never carries a number', () => {
    const r = spawnEstimate(['objective', '80']);
    assert.equal(r.status, 0, r.stderr);
    const json = JSON.parse(r.stdout);
    assert.equal(json.available, false);
    assert.match(json.reason, /df-tools calibrate/);
    assert.equal(json.calibration_path, path.join(fakeHome, '.claude', 'devflow', 'calibration.json'));
    assert.equal(json.total, undefined);
  });

  test('3c: a usage error exits 1 and prints the usage on stderr', () => {
    const r = spawnEstimate(['objective']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^Error: .*\nUsage: df-tools estimate /s);
  });

  test('3d: an objective that does not exist exits 1', () => {
    const r = spawnEstimate(['objective', '99'], { calibration: calFile });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /objective 99 not found/);
  });
});

// ─── 4: task ──────────────────────────────────────────────────────────────────

describe('4: estimate task', () => {
  test('--files with --tdd classifies like the calibrator and prints the full line', () => {
    const r = ok(run(['task', '--files', 'lib/a.cjs,lib/a.test.cjs', '--tdd']));
    assert.equal(r.exit, 0);
    assert.equal(r.result.class, 'code_tdd');
    assert.deepEqual(r.result.minutes, { p50: 6, p90: 18, n: 32 });
    assert.equal(r.result.samples, 30);
    assert.equal(r.result.confidence, 'high');
    assert.equal(r.result.available, true);
    assert.equal(
      r.text,
      'Task code_tdd: 6 min (P90 18 min) · tokens 3.6M in / 29K out · $1.40 (P90 $2.20) · n=30, confidence high',
    );
    assert.equal(r.result.line, r.text);
  });

  test('--files without --tdd is the plain class; --trd-type reaches the classifier', () => {
    assert.equal(ok(run(['task', '--files', 'lib/a.cjs'])).result.class, 'code');
    assert.equal(ok(run(['task', '--files', 'docs/x.md'])).result.class, 'doc');
    // A `.dart` file is code, unless the TRD is a ui TRD (calibration-inputs.fileKind).
    assert.equal(ok(run(['task', '--files', 'lib/x.dart'])).result.class, 'code');
    assert.equal(ok(run(['task', '--files', 'lib/x.dart', '--trd-type', 'ui'])).result.class, 'ui');
  });

  test('--class config names the fallback to all tasks', () => {
    const r = ok(run(['task', '--class', 'config']));
    assert.equal(r.result.class, 'config');
    assert.equal(r.result.basis, 'all');
    assert.ok(r.text.endsWith('(config has 2 samples; using all tasks)'), r.text);
  });

  test('--checkpoint is a human wait', () => {
    const r = ok(run(['task', '--checkpoint']));
    assert.equal(r.text, 'Task checkpoint: human wait, not estimated');
    assert.equal(r.result.class, 'checkpoint');
    assert.equal(r.result.human_wait, true);
  });

  test('the JSON is rounded once and carries the calibration', () => {
    const r = ok(run(['task', '--class', 'code_tdd']));
    assert.deepEqual(r.result.cost_usd, { p50: 1.4, p90: 2.2, n: 30 });
    assert.equal(r.result.calibration.path, calFile);
    assert.equal(r.result.calibration.version, 2);
    assert.equal(r.result.calibration.data_as_of, '2026-10-05');
    assert.deepEqual(r.result.calibration.samples, { trds: 50, tasks: 120, with_tokens: 40 });
  });

  test('usage errors: no selector, two selectors, an unknown class, a stray flag or positional', () => {
    const none = run(['task']);
    assert.equal(none.ok, false);
    assert.match(none.message, /Usage: df-tools estimate /);

    const both = run(['task', '--files', 'a.cjs', '--class', 'doc']);
    assert.equal(both.ok, false);
    assert.match(both.message, /exactly one of --files, --class, --checkpoint/);

    const nope = run(['task', '--class', 'nope']);
    assert.equal(nope.ok, false);
    assert.match(nope.message, /unknown task class "nope"; valid classes: checkpoint, code, code_tdd, /);
    assert.match(nope.message, /Usage: df-tools estimate /);

    const tdd = run(['task', '--class', 'doc', '--tdd']);
    assert.equal(tdd.ok, false);
    assert.match(tdd.message, /--tdd and --trd-type go with --files/);

    assert.equal(run(['task', '--files', 'a.cjs', '--bogus']).ok, false);
    assert.equal(run(['task', '--files', 'a.cjs', 'extra']).ok, false);
    assert.equal(run(['task', '--files']).ok, false);
    assert.equal(run(['task', '--files', ' , ']).ok, false);
  });
});

// ─── 5: trd ───────────────────────────────────────────────────────────────────

describe('5: estimate trd', () => {
  test('trd 80-01 prints the composed line', () => {
    const r = ok(run(['trd', '80-01']));
    assert.equal(r.text, 'TRD 80-01: 12 min (P90 36 min) · $2.80 (P90 $4.40) · 2 tasks · confidence high');
    assert.equal(r.result.id, '80-01');
    assert.equal(r.result.line, r.text);
    assert.equal(r.result.minutes.p50, 12);
  });

  test('a path works, a missing TRD and a malformed ref exit 1', () => {
    const file = path.join(root, '.planning', 'objectives', '80-alpha', '80-02-docs-TRD.md');
    const byPath = ok(run(['trd', file]));
    assert.equal(byPath.result.id, '80-02');
    assert.match(byPath.text, /^TRD 80-02: 4 min \(P90 8 min\)/);

    const missing = run(['trd', '80-09']);
    assert.deepEqual(missing, { ok: false, message: 'TRD 80-09 not found' });
    assert.equal(run(['trd', 'banana']).ok, false);
    assert.equal(run(['trd']).ok, false);
  });
});

// ─── 6: objective ─────────────────────────────────────────────────────────────

describe('6: estimate objective', () => {
  test('objective 80: rounded JSON with line, table and calibration', () => {
    const r = ok(run(['objective', '80']));
    assert.equal(r.result.available, true);
    assert.deepEqual(r.result.total.wall_minutes, { p50: 25.6, p90: 69.2 });
    assert.equal(r.result.status, 'partial');
    const cost = r.result.total.cost_usd;
    assert.equal(
      r.result.line,
      `Objective 80 estimate: 26 min median (P90 1h 09m) wall · $${cost.p50.toFixed(2)} (P90 $${cost.p90.toFixed(2)}) · 3 TRDs left in 2 waves · confidence medium`,
    );
    // The three TRD medians (2.8 + 0.8 + 1.4) and the verifier (0.9) sum to 5.9; the gap-closure mixture only adds to
    // that. The line must quote the JSON's figures.
    assert.ok(cost.p50 > 5.9 && cost.p50 < 7.5 && cost.p90 > cost.p50, JSON.stringify(cost));
    assert.ok(r.result.table.startsWith('| Objective 80 (3 TRDs left, 2 waves) | Median | P90 |\n'), r.result.table);
    assert.equal(r.result.calibration.path, calFile);
    assert.equal(r.result.calibration.version, 2);
    assert.equal(r.result.calibration.data_as_of, '2026-10-05');
    assert.equal(r.text, r.result.line, 'with neither --table nor --line the text is the line');
  });

  test('--table selects the table text, --line the line; both together are a usage error', () => {
    const table = ok(run(['objective', '80', '--table']));
    assert.equal(table.text, table.result.table);
    assert.match(table.text, /\| Tokens in \/ out \| /);
    assert.match(table.text, /Calibration 2026-10-05, 50 TRDs\.$/m);

    const line = ok(run(['objective', '80', '--line']));
    assert.equal(line.text, line.result.line);

    const both = run(['objective', '80', '--table', '--line']);
    assert.equal(both.ok, false);
    assert.match(both.message, /--table and --line cannot be used together/);
  });

  test('--all estimates the done TRDs too and says so', () => {
    const r = ok(run(['objective', '80', '--all']));
    assert.equal(r.result.trds.remaining, 4);
    assert.equal(r.result.all, true);
    assert.match(r.text, /· 4 TRDs estimated in 2 waves · /);
  });

  test('objective 81 is unplanned and low confidence', () => {
    const r = ok(run(['objective', '81', '--line']));
    assert.ok(r.text.includes('unplanned, from 30 past objectives'), r.text);
    assert.ok(r.text.includes('confidence low'), r.text);
    const table = ok(run(['objective', '81', '--table']));
    assert.match(table.text, /^\| Objective 81 \(unplanned\) \| Median \| P90 \|\n\|---\|---\|---\|\n\| Wall time \(serial, unplanned\) \| /);
    assert.match(table.text, /\nNote: figures come from 30 past objectives because the objective has no TRDs yet\./);
  });

  test('objective 82 is done, 99 does not exist', () => {
    assert.equal(ok(run(['objective', '82', '--line'])).text, 'Objective 82: all TRDs done (1 of 1)');
    assert.deepEqual(run(['objective', '99']), { ok: false, message: 'objective 99 not found' });
  });

  test('a calibration with no objective history says so instead of printing a number for an unplanned objective', () => {
    const lacking = writeCalibrationFile(path.join(scratch, 'no-history'), { ...CAL_V2, objective_level: undefined });
    const r = ok(run(['objective', '81', '--calibration', lacking]));
    assert.equal(
      r.text,
      'No estimate: objective 81 is unplanned and the calibration has no objective history (objective_level); run df-tools calibrate',
    );
  });

  test('a bad objective number is a usage error', () => {
    assert.equal(run(['objective', 'eighty']).ok, false);
    assert.equal(run(['objective', '80', '81']).ok, false);
  });
});

// ─── 7: milestone ─────────────────────────────────────────────────────────────

describe('7: estimate milestone', () => {
  test('milestone --table: rows for 80, 81 and 83, a bold total, Done and Cancelled', () => {
    const r = ok(run(['milestone', '--table']));
    const lines = r.text.split('\n');
    assert.equal(lines[0], '| Objective | Status | Wall median | Wall P90 | Cost median | Confidence |');
    const total = r.result.total.cost_usd;
    assert.ok(lines[2].startsWith('| 80 Alpha | partial, 3 of 4 TRDs left | 26 min | 1h 09m | $'), lines[2]);
    assert.ok(lines[2].endsWith(' | medium |'), lines[2]);
    assert.ok(lines[3].startsWith('| 81 Beta | unplanned | 1h 02m | 3h 05m | $17.98 | low |'), lines[3]);
    assert.ok(lines[4].startsWith('| 83 Delta | planned, 1 TRD | 9 min | 24 min | $'), lines[4]);
    assert.equal(
      lines[5],
      `| **v1.0 total (3 objectives left)** | | **1h 49m** | **4h 36m** | **$${total.p50.toFixed(2)}** | **low** |`,
    );
    assert.ok(r.text.includes('Done: 82. Cancelled: 84.'), r.text);
    assert.equal(r.result.version, 'v1.0');
    assert.deepEqual(r.result.total.wall_minutes, { p50: 109.3, p90: 276.3 });
    assert.equal(r.result.table, r.text);
    assert.equal(r.result.calibration.data_as_of, '2026-10-05');
  });

  test('milestone --line, with the version named or implied', () => {
    const line = ok(run(['milestone', '--line']));
    const cost = line.result.total.cost_usd;
    assert.equal(
      line.text,
      `Milestone v1.0 estimate: 1h 49m median (P90 4h 36m) · $${cost.p50.toFixed(2)} (P90 $${cost.p90.toFixed(2)}) · 3 objectives left (1 unplanned) · confidence low`,
    );
    assert.equal(ok(run(['milestone', 'v1.0', '--line'])).text, line.text);
    assert.equal(ok(run(['milestone', '1.0', '--line'])).text, line.text);
  });

  test('milestone v0.9 --line: nothing left', () => {
    const r = ok(run(['milestone', 'v0.9', '--line']));
    assert.ok(r.text.includes('no objectives left'), r.text);
  });

  test('an unknown milestone exits 1; a missing calibration is No estimate', () => {
    assert.deepEqual(run(['milestone', 'v9.9']), { ok: false, message: 'milestone v9.9 not in ROADMAP.md' });
    const none = ok(run(['milestone', '--calibration', path.join(scratch, 'absent.json')]));
    assert.equal(none.exit, 0);
    assert.equal(none.result.available, false);
    assert.ok(none.text.startsWith('No estimate: '), none.text);
  });
});

// ─── usage and calibration resolution ─────────────────────────────────────────

describe('usage and calibration resolution', () => {
  test('USAGE names all seven forms', () => {
    for (const form of ['task', 'trd', 'objective', 'milestone', 'start', 'wave', 'finish']) {
      assert.ok(USAGE.includes(`df-tools estimate ${form} `), `USAGE lacks ${form}`);
    }
  });

  test('no subcommand, an unknown one, an unknown flag and a flag with no value are usage errors', () => {
    for (const argv of [[], ['bogus'], ['objective', '80', '--bogus'], ['objective', '80', '--calibration']]) {
      const r = run(argv);
      assert.equal(r.ok, false, JSON.stringify(argv));
      assert.match(r.message, /\nUsage: df-tools estimate /, JSON.stringify(argv));
    }
  });

  test('--calibration beats DEVFLOW_CALIBRATION_PATH, and a relative path resolves against cwd', () => {
    const other = writeCalibrationFile(path.join(scratch, 'other'), { ...CAL_V2, data_as_of: '2026-01-01' });
    const rel = path.relative(root, other);
    const r = ok(run(['task', '--class', 'doc', '--calibration', rel]));
    assert.equal(r.result.calibration.data_as_of, '2026-01-01');
    assert.equal(r.result.calibration.path, other);
  });

  test('an unusable calibration file is No estimate with the reason, exit 0', () => {
    const bad = path.join(scratch, 'bad.json');
    fs.writeFileSync(bad, '{ not json');
    const r = ok(run(['trd', '80-01', '--calibration', bad]));
    assert.equal(r.exit, 0);
    assert.equal(r.result.available, false);
    assert.equal(r.result.calibration_path, bad);
    assert.ok(r.text.startsWith('No estimate: '), r.text);
    assert.ok(r.text.includes('df-tools calibrate'), r.text);
  });

  test('every estimate verb reads the clock only from the injected now', () => {
    const src = fs.readFileSync(path.join(__dirname, 'estimate-cli.cjs'), 'utf-8');
    assert.equal(/Date\.now\(\)|new Date\(\)/.test(src.replace(/now = Date\.now\(\)/, '')), false);
  });
});

// ─── 8-11: start, wave, finish ────────────────────────────────────────────────

const MIN = 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();

/** Every path under `dir`, relative and sorted: the project tree must be the same after the run verbs as before. */
function listTree(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      out.push(path.relative(dir, full));
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(dir);
  return out.sort();
}

function near(actual, expected, label, tolerance = 0.05) {
  assert.ok(
    typeof actual === 'number' && Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} within ${tolerance}, got ${actual}`,
  );
}

describe('8-11: estimate start, wave, finish (one run, one state dir)', () => {
  let runDir;
  let treeBefore;
  const opts = () => ({ env: { DEVFLOW_CALIBRATION_PATH: calFile, DEVFLOW_ESTIMATE_STATE_DIR: runDir } });
  const step = (argv, at) => ok(run(argv, { ...opts(), now: at }));
  const readState = () => store.readRunState(root, { env: opts().env });

  before(() => {
    runDir = path.join(scratch, 'run-state');
    treeBefore = listTree(root);
  });

  test('8: start 80 records the objective, its waves and their estimates', () => {
    const r = step(['start', '80'], T0);
    const line = ok(run(['objective', '80', '--line'], { now: T0 })).text;
    assert.equal(r.text, line);
    assert.equal(r.result.line, line);

    const file = store.statePath(root, { env: opts().env });
    assert.ok(file.startsWith(runDir + path.sep), file);
    assert.equal(r.result.run_state.path, file);
    assert.ok(fs.existsSync(file));

    const state = readState();
    assert.equal(state.version, 1);
    assert.equal(state.objective, '80');
    assert.equal(state.started_at, iso(T0));
    assert.equal(state.updated_at, iso(T0));
    assert.equal(state.finished_at, null);
    assert.equal(state.estimate.line, line);
    assert.equal(state.estimate.confidence, 'medium');
    near(state.estimate.wall_minutes.p50, 19.3982, 'execution wall p50');
    near(state.estimate.wall_minutes.p90, 52.1221, 'execution wall p90');

    assert.equal(state.waves.length, 2);
    assert.deepEqual(state.waves.map((w) => w.wave), [1, 2]);
    assert.deepEqual(state.waves[0].trds, ['80-01', '80-02']);
    assert.deepEqual(state.waves[1].trds, ['80-03']);
    near(state.waves[0].p50, 12.2554, 'wave 1 p50');
    near(state.waves[0].p90, 36.0038, 'wave 1 p90');
    near(state.waves[1].p50, 6, 'wave 2 p50');
    for (const w of state.waves) {
      assert.equal(w.started_at, null);
      assert.equal(w.finished_at, null);
      assert.equal(w.actual_minutes, null);
    }
  });

  test('9: wave 1 --start then --done prints actual against the estimate; wave 2 --start leaves about a minute', () => {
    const started = step(['wave', '80', '1', '--start'], T0);
    assert.equal(started.text, 'Wave 1 estimate: 12 min median, P90 36 min');
    assert.equal(readState().waves[0].started_at, iso(T0));

    const done = step(['wave', '80', '1', '--done'], T0 + 14 * MIN);
    assert.equal(done.text, 'Wave 1: actual 14 min · estimate 12 min median, P90 36 min · within P90');
    assert.equal(done.result.verdict, 'within P90');
    assert.equal(done.result.actual_minutes, 14);
    const afterDone = readState();
    assert.equal(afterDone.waves[0].finished_at, iso(T0 + 14 * MIN));
    assert.equal(afterDone.waves[0].actual_minutes, 14);
    assert.equal(afterDone.updated_at, iso(T0 + 14 * MIN));

    const second = step(['wave', '80', '2', '--start'], T0 + 15 * MIN);
    assert.equal(second.text, 'Wave 2 estimate: 6 min median, P90 18 min');
    const state = readState();
    assert.equal(state.waves[1].started_at, iso(T0 + 15 * MIN));
    assert.equal(state.updated_at, iso(T0 + 15 * MIN));

    const left = store.remainingMinutes(state, T0 + 20 * MIN);
    assert.equal(left.wave, 2);
    assert.equal(left.waves, 2);
    assert.equal(left.done, 1);
    assert.ok(left.minutes >= 1 && left.minutes <= 2, `wave 2's 6 minutes less 5 elapsed leaves about 1: ${JSON.stringify(left)}`);
    assert.equal(left.over, false);
  });

  test('9b: a second --start keeps started_at and bumps updated_at; a second --done changes nothing', () => {
    step(['wave', '80', '2', '--start'], T0 + 16 * MIN);
    const restarted = readState();
    assert.equal(restarted.waves[1].started_at, iso(T0 + 15 * MIN));
    assert.equal(restarted.updated_at, iso(T0 + 16 * MIN));

    const again = step(['wave', '80', '1', '--done'], T0 + 17 * MIN);
    assert.equal(again.text, 'Wave 1: actual 14 min · estimate 12 min median, P90 36 min · within P90');
    const state = readState();
    assert.equal(state.waves[0].finished_at, iso(T0 + 14 * MIN));
    assert.equal(state.updated_at, iso(T0 + 16 * MIN));
  });

  test('9c: a wave the state does not hold (a gap-closure wave) is added with null estimates', () => {
    const r = step(['wave', '80', '3', '--start'], T0 + 18 * MIN);
    assert.equal(r.text, 'Wave 3: no estimate');
    const w3 = readState().waves.find((w) => w.wave === 3);
    assert.deepEqual(w3, {
      wave: 3, trds: [], p50: null, p90: null, started_at: iso(T0 + 18 * MIN), finished_at: null, actual_minutes: null,
    });
  });

  test('11: finish 80 prints the execution actual against the execution estimate, and again on a second call', () => {
    const first = step(['finish', '80'], T0 + 30 * MIN);
    assert.equal(first.text, 'Objective 80 execution: actual 30 min · estimate 19 min median, P90 52 min · within P90');
    assert.equal(first.result.actual_minutes, 30);
    assert.equal(first.result.verdict, 'within P90');
    assert.equal(readState().finished_at, iso(T0 + 30 * MIN));

    const second = step(['finish', '80'], T0 + 60 * MIN);
    assert.equal(second.text, first.text);
    assert.equal(readState().finished_at, iso(T0 + 30 * MIN));
    assert.equal(readState().updated_at, iso(T0 + 30 * MIN), 'a second finish does not write');

    assert.equal(store.formatStatusSegment(readState(), T0 + 31 * MIN), '');
  });

  test('11b: after finish a new --start begins a new run; wave --done on a finished run is unknown', () => {
    const unknown = step(['wave', '80', '2', '--done'], T0 + 61 * MIN);
    assert.equal(unknown.text, 'Wave 2: actual unknown (no run state)');
    assert.equal(readState().finished_at, iso(T0 + 30 * MIN), 'nothing was written');

    const fresh = step(['wave', '80', '1', '--start'], T0 + 62 * MIN);
    assert.equal(fresh.text, 'Wave 1 estimate: 12 min median, P90 36 min');
    const state = readState();
    assert.equal(state.started_at, iso(T0 + 62 * MIN));
    assert.equal(state.finished_at, null);
    assert.equal(state.waves.length, 2);
  });

  test('the run verbs wrote only under the state directory', () => {
    assert.deepEqual(listTree(root), treeBefore);
    assert.deepEqual(fs.readdirSync(runDir).filter((f) => f.endsWith('.tmp')), []);
  });
});

describe('10: no run state', () => {
  let dir;
  const env = () => ({ DEVFLOW_CALIBRATION_PATH: calFile, DEVFLOW_ESTIMATE_STATE_DIR: dir });
  const step = (argv, at) => run(argv, { env: env(), now: at });
  const readState = () => store.readRunState(root, { env: env() });

  before(() => {
    dir = path.join(scratch, 'run-state-10');
  });

  test('wave --done with no state says so, exits 0 and writes nothing', () => {
    const r = ok(step(['wave', '80', '1', '--done'], T0));
    assert.equal(r.text, 'Wave 1: actual unknown (no run state)');
    assert.equal(r.exit, 0);
    assert.equal(fs.existsSync(dir), false);
  });

  test('finish with no state says so, exits 0 and writes nothing', () => {
    const r = ok(step(['finish', '80'], T0));
    assert.equal(r.text, 'Objective 80 execution: actual unknown (no run state)');
    assert.equal(r.exit, 0);
    assert.equal(fs.existsSync(dir), false);
  });

  test('wave 81 1 --start creates a run: the unplanned objective gets wave 1 with null estimates', () => {
    const r = ok(step(['wave', '81', '1', '--start'], T0));
    assert.equal(r.text, 'Wave 1: no estimate');
    const state = readState();
    assert.equal(state.objective, '81');
    assert.equal(state.started_at, iso(T0));
    assert.equal(state.estimate.wall_minutes, null);
    assert.deepEqual(state.waves, [
      { wave: 1, trds: [], p50: null, p90: null, started_at: iso(T0), finished_at: null, actual_minutes: null },
    ]);
    assert.equal(store.formatStatusSegment(state, T0 + MIN), '⏱ 81 W1/1');
  });

  test('a state for another objective is not the run: wave 80 1 --done is unknown, --start begins a new run', () => {
    const unknown = ok(step(['wave', '80', '1', '--done'], T0 + MIN));
    assert.equal(unknown.text, 'Wave 1: actual unknown (no run state)');
    assert.equal(readState().objective, '81');

    const begun = ok(step(['wave', '80', '1', '--start'], T0 + 2 * MIN));
    assert.equal(begun.text, 'Wave 1 estimate: 12 min median, P90 36 min');
    assert.equal(readState().objective, '80');
  });

  test('a stale run (idle for more than 12 hours) is replaced by --start, not continued', () => {
    const later = T0 + 13 * 60 * MIN;
    const r = ok(step(['wave', '80', '2', '--start'], later));
    assert.equal(r.text, 'Wave 2 estimate: 6 min median, P90 18 min');
    const state = readState();
    assert.equal(state.started_at, iso(later));
    assert.equal(state.waves[0].started_at, null, 'wave 1 of the old run is not carried over');
  });

  test('start with no usable calibration records the waves with null estimates and says why', () => {
    const r = ok(step(['start', '80', '--calibration', path.join(scratch, 'absent.json')], T0));
    assert.ok(r.text.startsWith('No estimate: '), r.text);
    assert.ok(r.text.includes('df-tools calibrate'), r.text);
    assert.equal(r.exit, 0);
    const state = readState();
    assert.equal(state.estimate.wall_minutes, null);
    assert.deepEqual(state.waves.map((w) => [w.wave, w.trds, w.p50, w.p90]), [
      [1, ['80-01', '80-02'], null, null],
      [2, ['80-03'], null, null],
    ]);
    assert.equal(store.formatStatusSegment(state, T0 + MIN), '⏱ 80 W1/2');
  });

  test('start for an objective that does not exist exits 1 and writes nothing new', () => {
    const prior = readState();
    assert.deepEqual(step(['start', '99'], T0), { ok: false, message: 'objective 99 not found' });
    assert.deepEqual(readState(), prior);
  });

  test('usage errors: --start with --done, neither, a bad wave number, a missing argument', () => {
    for (const argv of [
      ['wave', '80', '1', '--start', '--done'],
      ['wave', '80', '1'],
      ['wave', '80', 'one', '--start'],
      ['wave', '80', '--start'],
      ['start'],
      ['finish'],
      ['finish', '80', '--table'],
      ['start', 'eighty'],
    ]) {
      const r = step(argv, T0);
      assert.equal(r.ok, false, JSON.stringify(argv));
      assert.match(r.message, /\nUsage: df-tools estimate /, JSON.stringify(argv));
    }
  });
});

// ─── 12: run history (TRD 64-02, EST-08) ──────────────────────────────────────

/** The sanitized form of an ISO stamp, as the run store names a history file. */
const sane = (text) => text.replace(/[^A-Za-z0-9_-]/g, '_');

describe('12: run history (TRD 64-02, EST-08)', () => {
  let dir;
  let counter = 0;
  const env = () => ({ DEVFLOW_CALIBRATION_PATH: calFile, DEVFLOW_ESTIMATE_STATE_DIR: dir });
  const step = (argv, at, extra = {}) => ok(run(argv, { env: env(), now: at, ...extra }));
  const live = () => store.readRunState(root, { env: env() });
  const historyDir = () => store.historyDir(root, { env: env() });
  const historyFiles = () => {
    try {
      return fs.readdirSync(historyDir()).sort();
    } catch {
      return [];
    }
  };
  const historyFile = (objective, startedAt) => path.join(historyDir(), `${objective}-${sane(iso(startedAt))}.json`);

  beforeEach(() => {
    dir = path.join(scratch, `run-state-history-${counter++}`);
  });

  test('1: finish 80 archives the finished run, and a second finish does not rewrite it', () => {
    step(['start', '80'], T0);
    step(['wave', '80', '1', '--start'], T0 + MIN);
    step(['wave', '80', '1', '--done'], T0 + 14 * MIN);
    assert.deepEqual(historyFiles(), [], 'an unfinished run is not archived');

    const first = step(['finish', '80'], T0 + 30 * MIN);
    assert.deepEqual(historyFiles(), [`80-${sane(iso(T0))}.json`]);
    const file = historyFile('80', T0);
    const bytes = fs.readFileSync(file, 'utf8');
    assert.deepEqual(JSON.parse(bytes), live());
    assert.equal(bytes, fs.readFileSync(store.statePath(root, { env: env() }), 'utf8'));

    const old = new Date('2020-01-01T00:00:00Z');
    fs.utimesSync(file, old, old);
    const second = step(['finish', '80'], T0 + 60 * MIN);
    assert.equal(second.text, first.text);
    assert.equal(fs.statSync(file).mtimeMs, old.getTime(), 'the archive was not rewritten');
    assert.equal(fs.readFileSync(file, 'utf8'), bytes);
    assert.deepEqual(historyFiles(), [`80-${sane(iso(T0))}.json`]);
  });

  test('2: start after finish leaves the archive alone; start archives a finished run that never was (a pre-64 run)', () => {
    step(['start', '80'], T0);
    step(['finish', '80'], T0 + 30 * MIN);
    const archived = historyFile('80', T0);
    const bytes = fs.readFileSync(archived, 'utf8');

    step(['start', '80'], T0 + 40 * MIN);
    assert.deepEqual(historyFiles(), [`80-${sane(iso(T0))}.json`], 'a new run adds nothing until it finishes');
    assert.equal(fs.readFileSync(archived, 'utf8'), bytes);
    assert.equal(live().started_at, iso(T0 + 40 * MIN));
    assert.equal(live().finished_at, null);

    // A finished state written straight through the store, as a run from before the history existed.
    const pre = finishedRun({ objective: '80', started_at: iso(T0 + 100 * MIN), finished_at: iso(T0 + 130 * MIN) });
    store.writeRunState(root, pre, { env: env() });
    step(['start', '81'], T0 + 200 * MIN);
    assert.deepEqual(historyFiles(), [`80-${sane(iso(T0))}.json`, `80-${sane(iso(T0 + 100 * MIN))}.json`]);
    assert.deepEqual(JSON.parse(fs.readFileSync(historyFile('80', T0 + 100 * MIN), 'utf8')), pre);
    assert.equal(live().objective, '81');
    assert.equal(live().started_at, iso(T0 + 200 * MIN));
  });

  test('3: an unfinished run for another objective is overwritten by start without being archived', () => {
    step(['start', '81'], T0);
    step(['start', '80'], T0 + MIN);
    assert.deepEqual(historyFiles(), []);
    assert.equal(live().objective, '80');
    assert.equal(fs.existsSync(historyDir()), false);
  });

  test('4: wave --start that begins a new run archives the finished previous run like start', () => {
    const pre = finishedRun({ objective: '80', started_at: iso(T0), finished_at: iso(T0 + 30 * MIN) });
    store.writeRunState(root, pre, { env: env() });

    const begun = step(['wave', '80', '1', '--start'], T0 + 40 * MIN);
    assert.equal(begun.result.run_state.created, true);
    assert.deepEqual(historyFiles(), [`80-${sane(iso(T0))}.json`]);
    assert.deepEqual(JSON.parse(fs.readFileSync(historyFile('80', T0), 'utf8')), pre);
    assert.equal(live().started_at, iso(T0 + 40 * MIN));
    assert.equal(live().finished_at, null);
  });

  test('4b: wave --start on a live run archives nothing; a stale unfinished run is replaced without archiving', () => {
    step(['start', '80'], T0);
    step(['wave', '80', '1', '--start'], T0 + MIN);
    assert.deepEqual(historyFiles(), []);

    step(['wave', '80', '2', '--start'], T0 + 13 * 60 * MIN);
    assert.equal(live().started_at, iso(T0 + 13 * 60 * MIN));
    assert.deepEqual(historyFiles(), []);
  });

  test('4c: a run that cannot be archived is reported and the previous run is not overwritten', () => {
    const pre = finishedRun({ objective: '80', started_at: iso(T0), finished_at: iso(T0 + 30 * MIN) });
    store.writeRunState(root, pre, { env: env() });
    // a regular file where the history directory belongs: the archive cannot be written
    fs.mkdirSync(path.dirname(historyDir()), { recursive: true });
    fs.writeFileSync(historyDir(), 'not a directory');

    const failed = run(['start', '81'], { env: env(), now: T0 + 40 * MIN });
    assert.equal(failed.ok, false);
    assert.match(failed.message, /could not archive the run history/);
    assert.deepEqual(live(), pre);
  });
});

describe('spawned run verbs', () => {
  test('start through the dispatcher stamps the run with the real clock', () => {
    const dir = path.join(scratch, 'run-state-spawn');
    const env = { ...process.env, HOME: fakeHome, DEVFLOW_ESTIMATE_STATE_DIR: dir, DEVFLOW_CALIBRATION_PATH: calFile };
    const sentAt = Date.now();
    const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', root, 'estimate', 'start', '80', '--raw'], {
      encoding: 'utf-8', env, timeout: 30000,
    });
    const doneAt = Date.now();
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^Objective 80 estimate: 26 min median/);

    const state = store.readRunState(root, { env: { DEVFLOW_ESTIMATE_STATE_DIR: dir } });
    assert.equal(state.objective, '80');
    const stamped = Date.parse(state.started_at);
    assert.ok(stamped >= sentAt - 1000 && stamped <= doneAt + 1000, `${state.started_at} vs ${sentAt}..${doneAt}`);
  });

  test('wave --done through the dispatcher with no state prints the unknown line', () => {
    const dir = path.join(scratch, 'run-state-spawn-empty');
    const env = { ...process.env, HOME: fakeHome, DEVFLOW_ESTIMATE_STATE_DIR: dir, DEVFLOW_CALIBRATION_PATH: calFile };
    const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', root, 'estimate', 'wave', '80', '1', '--done', '--raw'], {
      encoding: 'utf-8', env, timeout: 30000,
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'Wave 1: actual unknown (no run state)');
  });
});
