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
//     8-11 (start, wave, finish) are in the second half of this file
//
// Hermetic: the project is MILESTONE_SPEC written into an mkdtemp directory, the calibration is the literal CAL_V2 written
// to a temp file, the run-state directory is a temp directory (DEVFLOW_ESTIMATE_STATE_DIR) and every spawned process gets
// HOME=<temp dir>. Nothing here reads or writes the real ~/.claude.

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { runEstimate, USAGE } = require('./estimate-cli.cjs');
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
    assert.equal(
      r.result.line,
      'Objective 80 estimate: 26 min median (P90 1h 09m) wall · $6.80 (P90 $10.90) · 3 TRDs left in 2 waves · confidence medium',
    );
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
    assert.ok(lines[2].startsWith('| 80 Alpha | partial, 3 of 4 TRDs left | 26 min | 1h 09m | $6.80 | medium |'), lines[2]);
    assert.ok(lines[3].startsWith('| 81 Beta | unplanned | 1h 02m | 3h 05m | $17.98 | low |'), lines[3]);
    assert.ok(lines[4].startsWith('| 83 Delta | planned, 1 TRD | 9 min | 24 min | '), lines[4]);
    assert.ok(lines[5].startsWith('| **v1.0 total (3 objectives left)** | | **1h 49m** | **4h 36m** | **$29.40** | **low** |'), lines[5]);
    assert.ok(r.text.includes('Done: 82. Cancelled: 84.'), r.text);
    assert.equal(r.result.version, 'v1.0');
    assert.deepEqual(r.result.total.wall_minutes, { p50: 109.3, p90: 276.3 });
    assert.equal(r.result.table, r.text);
    assert.equal(r.result.calibration.data_as_of, '2026-10-05');
  });

  test('milestone --line, with the version named or implied', () => {
    const line = ok(run(['milestone', '--line']));
    assert.equal(
      line.text,
      'Milestone v1.0 estimate: 1h 49m median (P90 4h 36m) · $29.40 (P90 $58.10) · 3 objectives left (1 unplanned) · confidence low',
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
