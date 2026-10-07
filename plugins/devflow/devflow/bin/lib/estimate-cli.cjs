'use strict';

/**
 * estimate-cli.cjs — TRD 58-08 (EST-02, EST-03, EST-05)
 *
 * The command-line front end of the estimation engine:
 *
 *   df-tools estimate task (--files <a[,b]> [--tdd] [--trd-type <t>] | --class <name> | --checkpoint)
 *   df-tools estimate trd <trd-id|path>
 *   df-tools estimate objective <N> [--all] [--table|--line]
 *   df-tools estimate milestone [vX.Y] [--table|--line]
 *   df-tools estimate start <N> | wave <N> <wave> (--start|--done) | finish <N>      (the run verbs, below)
 *
 * Every form but `finish` takes `[--calibration <file>]`, and every form `[--raw]`. The calibration is `--calibration` (relative to cwd), else
 * DEVFLOW_CALIBRATION_PATH, else ~/.claude/devflow/calibration.json.
 *
 * Output: the JSON result by default (rounded once, see estimate-format.roundResult; every result carries `line`, the
 * objective and milestone ones also `table`, plus `calibration: {path, version, data_as_of, samples}`). `--raw` prints the
 * text instead: the table for objective and milestone with `--table`, otherwise the one line. The text is what the
 * planner, build and execute-objective prose paste.
 *
 * The run verbs are the only writer of the run state the status line reads (estimate-run-store.cjs, kept outside the
 * repository under DEVFLOW_ESTIMATE_STATE_DIR or ~/.claude/devflow/state/estimates): `start` estimates the objective's
 * remaining TRDs and records its waves, `wave --start|--done` records one wave's timing and prints actual against the
 * estimate, `finish` closes the run and prints the execution time against the execution estimate. They work without a
 * calibration too (the estimates are then null and the text says why), and a verb with nothing to report is exit 0.
 *
 * Run history (TRD 64-02): `finish` archives the run it closes, and `start` (or a `wave --start` that begins a new run)
 * archives a finished previous run before overwriting it, to <state dir>/history/<repo-key>/<objective>-<started_at>.json
 * (estimate-run-store.archiveRunState; idempotent, and an unfinished run is never archived). If the archive cannot be
 * written the verb fails with `could not archive the run history: ...` and the previous run state is left as it was. The
 * `estimate` block of a new run also records the unrounded `execution` and `total` estimates and the `calibration` they
 * came from (`{path, version, data_as_of, samples, inputs_digest}`), all null when there is no usable calibration.
 *
 * Exit 0 for every estimate, including "no estimate": a missing, unreadable or mismatched calibration is
 * `{available: false, reason, calibration_path}` and the text `No estimate: <reason>`, never a number. Exit 1 (an
 * `{ok: false, message}` here) for usage errors and for an objective, TRD or milestone that does not exist.
 *
 * Same shape as calibrate-cli.cjs: `runEstimate` is pure and returns `{ok, result, text, exit}` or `{ok: false,
 * message}`; the dispatcher's `case 'estimate'` maps that onto output() and error(). The clock is the injected `now`
 * (epoch ms), so a test controls it.
 */

const path = require('path');

const ci = require('./calibration-inputs.cjs');
const calibrator = require('./calibrator.cjs');
const est = require('./estimate.cjs');
const fmt = require('./estimate-format.cjs');
const milestone = require('./estimate-milestone.cjs');
const rollup = require('./estimate-rollup.cjs');
const store = require('./estimate-run-store.cjs');

const FORMS = [
  'df-tools estimate task (--files <a[,b]> [--tdd] [--trd-type <t>] | --class <name> | --checkpoint) [--calibration <file>] [--raw]',
  'df-tools estimate trd <trd-id|path> [--calibration <file>] [--raw]',
  'df-tools estimate objective <N> [--all] [--table|--line] [--calibration <file>] [--raw]',
  'df-tools estimate milestone [vX.Y] [--table|--line] [--calibration <file>] [--raw]',
  'df-tools estimate start <N> [--calibration <file>] [--raw]',
  'df-tools estimate wave <N> <wave> (--start|--done) [--calibration <file>] [--raw]',
  'df-tools estimate finish <N> [--raw]',
];
const USAGE = FORMS.join('\n       ');

// What each subcommand accepts: flags that take a value, flags that do not, and how many positionals.
const SPECS = {
  task: { values: ['files', 'class', 'trd-type', 'calibration'], bools: ['tdd', 'checkpoint'], min: 0, max: 0, what: '' },
  trd: { values: ['calibration'], bools: [], min: 1, max: 1, what: 'a TRD id (NN-MM) or the path of a -TRD.md file' },
  objective: { values: ['calibration'], bools: ['all', 'table', 'line'], min: 1, max: 1, what: 'an objective number' },
  milestone: { values: ['calibration'], bools: ['table', 'line'], min: 0, max: 1, what: 'a milestone version like v1.0' },
  start: { values: ['calibration'], bools: [], min: 1, max: 1, what: 'an objective number' },
  wave: { values: ['calibration'], bools: ['start', 'done'], min: 2, max: 2, what: 'an objective number and a wave number' },
  finish: { values: [], bools: [], min: 1, max: 1, what: 'an objective number' },
};

const OBJECTIVE_NUMBER = /^\d+(?:\.\d+)?$/;
const WAVE_NUMBER = /^[1-9]\d*$/;
const MILESTONE_VERSION = /^v?\d+(?:\.\d+)*$/i;

function usageError(message) {
  return { ok: false, message: `${message}\nUsage: ${USAGE}` };
}

/**
 * `argv` is everything after `estimate`. A value flag needs a value that is not itself a flag; an unknown flag, a missing
 * positional and a stray one are usage errors. `--raw` is stripped by the dispatcher before this runs; it is tolerated.
 * @returns {{ok: true, sub: string, flags: Object<string,string>, bools: Object<string,boolean>, positionals: string[]} | {ok: false, message: string}}
 */
function parseArgs(argv) {
  const sub = argv[0];
  if (sub === undefined) return usageError('estimate needs a subcommand');
  const spec = SPECS[sub];
  if (spec === undefined) return usageError(`unknown estimate subcommand ${JSON.stringify(sub)}`);

  const flags = {};
  const bools = {};
  const positionals = [];
  for (let i = 1; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === '--raw') continue;
    if (!tok.startsWith('--')) {
      positionals.push(tok);
      continue;
    }
    const name = tok.slice(2);
    if (spec.bools.includes(name)) {
      bools[name] = true;
      continue;
    }
    if (!spec.values.includes(name)) return usageError(`unknown flag ${tok} for estimate ${sub}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) return usageError(`${tok} needs a value`);
    flags[name] = value;
    i++;
  }
  if (positionals.length < spec.min) return usageError(`estimate ${sub} needs ${spec.what}`);
  if (positionals.length > spec.max) {
    return usageError(`unexpected argument ${JSON.stringify(positionals[spec.max])} for estimate ${sub}`);
  }
  return { ok: true, sub, flags, bools, positionals };
}

/** Checks the values of a parsed command. Returns a usage error, or null when it is fine. */
function validate(parsed) {
  const { sub, flags, bools, positionals } = parsed;
  if (sub === 'task') {
    const chosen = ['files', 'class'].filter((k) => flags[k] !== undefined).length + (bools.checkpoint ? 1 : 0);
    if (chosen !== 1) return usageError('task needs exactly one of --files, --class, --checkpoint');
    if ((bools.tdd || flags['trd-type'] !== undefined) && flags.files === undefined) {
      return usageError('--tdd and --trd-type go with --files');
    }
    if (flags.files !== undefined && splitFiles(flags.files).length === 0) {
      return usageError(`--files ${JSON.stringify(flags.files)} names no file`);
    }
    if (flags.class !== undefined && !ci.TASK_CLASSES.includes(flags.class)) {
      return usageError(`unknown task class "${flags.class}"; valid classes: ${ci.TASK_CLASSES.join(', ')}`);
    }
  }
  if ((sub === 'objective' || sub === 'milestone') && bools.table && bools.line) {
    return usageError('--table and --line cannot be used together');
  }
  if (sub === 'wave') {
    if (bools.start && bools.done) return usageError('--start and --done cannot be used together');
    if (!bools.start && !bools.done) return usageError('wave needs --start or --done');
    if (!WAVE_NUMBER.test(positionals[1])) {
      return usageError(`wave number must be a whole number from 1, got ${JSON.stringify(positionals[1])}`);
    }
  }
  if (['objective', 'start', 'wave', 'finish'].includes(sub) && !OBJECTIVE_NUMBER.test(positionals[0])) {
    return usageError(`objective number must look like 58 or 4.1, got ${JSON.stringify(positionals[0])}`);
  }
  if (sub === 'milestone' && positionals.length === 1 && !MILESTONE_VERSION.test(positionals[0])) {
    return usageError(`milestone version must look like v1.0, got ${JSON.stringify(positionals[0])}`);
  }
  return null;
}

const splitFiles = (text) => String(text).split(',').map((f) => f.trim()).filter((f) => f !== '');

// ─── Calibration ──────────────────────────────────────────────────────────────

/**
 * Loads the calibration once per command: `--calibration` (against cwd), else DEVFLOW_CALIBRATION_PATH, else the home
 * file. `path` is the file looked at, whether or not it was usable.
 * @returns {{ok: true, cal: object, path: string, meta: object} | {ok: false, reason: string, path: string}}
 */
function loadCal(flags, env, base) {
  const file = flags.calibration !== undefined ? path.resolve(base, flags.calibration) : undefined;
  const loaded = est.loadCalibration(file, env);
  if (!loaded.ok) return { ok: false, reason: loaded.reason, path: file || calibrator.defaultCalibrationPath(env) };
  const cal = loaded.calibration;
  return {
    ok: true,
    cal,
    path: loaded.path,
    meta: { path: loaded.path, version: cal.version, data_as_of: cal.data_as_of, samples: cal.samples },
  };
}

/** `No estimate: <reason>`, as a successful result: a missing calibration is an answer, not a failure. */
function noEstimateResult(loaded, withTable) {
  const text = `No estimate: ${loaded.reason}`;
  const result = { available: false, reason: loaded.reason, calibration_path: loaded.path, line: text };
  if (withTable) result.table = text;
  return { ok: true, result, text, exit: 0 };
}

// ─── Estimates ────────────────────────────────────────────────────────────────

function runTask(parsed, env, base) {
  const { flags, bools } = parsed;
  const loaded = loadCal(flags, env, base);
  // A checkpoint is a human wait whatever the calibration says: it never needs one, and never carries a number.
  if (!loaded.ok && !bools.checkpoint) return noEstimateResult(loaded, false);

  let task;
  if (bools.checkpoint) task = { class: 'checkpoint' };
  else if (flags.class !== undefined) task = { class: flags.class };
  else task = { files: splitFiles(flags.files), tdd: bools.tdd === true, trdType: flags['trd-type'] };

  const estimate = est.estimateTask(loaded.ok ? loaded.cal : { task_classes: {} }, task);
  const full = { available: true, ...estimate };
  if (loaded.ok) full.calibration = loaded.meta;
  const text = fmt.taskLine(full);
  return { ok: true, result: { ...fmt.roundResult(full), line: text }, text, exit: 0 };
}

function runTrd(parsed, env, base) {
  const loaded = loadCal(parsed.flags, env, base);
  if (!loaded.ok) return noEstimateResult(loaded, false);
  const full = { available: true, ...est.estimateTrd(loaded.cal, base, parsed.positionals[0]), calibration: loaded.meta };
  const text = fmt.trdLine(full);
  return { ok: true, result: { ...fmt.roundResult(full), line: text }, text, exit: 0 };
}

/** The objective result with the calibration and the `all` flag attached, the JSON, and the texts (see header). */
function objectiveOutput(estimate, loaded, all) {
  const full = { available: true, ...estimate, all, calibration: loaded.meta };
  return { full, line: fmt.objectiveLine(full), table: fmt.objectiveTable(full) };
}

function runObjective(parsed, env, base) {
  const loaded = loadCal(parsed.flags, env, base);
  if (!loaded.ok) return noEstimateResult(loaded, true);
  const all = parsed.bools.all === true;
  const { full, line, table } = objectiveOutput(rollup.estimateObjective(loaded.cal, base, parsed.positionals[0], { all }), loaded, all);
  const text = parsed.bools.table ? table : line;
  return { ok: true, result: { ...fmt.roundResult(full), line, table }, text, exit: 0 };
}

function runMilestone(parsed, env, base) {
  const loaded = loadCal(parsed.flags, env, base);
  if (!loaded.ok) return noEstimateResult(loaded, true);
  const version = parsed.positionals.length === 1 ? parsed.positionals[0] : undefined;
  const full = { available: true, ...milestone.estimateMilestone(loaded.cal, base, { version }), calibration: loaded.meta };
  const line = fmt.milestoneLine(full);
  const table = fmt.milestoneTable(full);
  const text = parsed.bools.table ? table : line;
  return { ok: true, result: { ...fmt.roundResult(full), line, table }, text, exit: 0 };
}

// ─── Run verbs ────────────────────────────────────────────────────────────────

const MS_PER_MINUTE = 60 * 1000;
const isoOf = (ms) => new Date(ms).toISOString();

/** The directory that holds `.planning`, which keys the run state; cwd itself when there is none above it. */
const runRoot = (base) => store.findProjectRoot(base) || base;

function newWave(wave, trds, minutes) {
  return {
    wave,
    trds,
    p50: minutes ? minutes.p50 : null,
    p90: minutes ? minutes.p90 : null,
    started_at: null,
    finished_at: null,
    actual_minutes: null,
  };
}

/** The waves of the objective's remaining TRDs read from their frontmatter, for when there is no estimate to take them from. */
function wavesFromFrontmatter(trds) {
  const byWave = new Map();
  for (const trd of trds) {
    const fm = ci.readTrdTasks(trd.text).frontmatter;
    const wave = parseInt(fm && fm.wave, 10) || 1;
    if (!byWave.has(wave)) byWave.set(wave, []);
    byWave.get(wave).push(trd.id);
  }
  return [...byWave.keys()].sort((a, b) => a - b).map((wave) => newWave(wave, byWave.get(wave), null));
}

/**
 * What a run is made of: the objective's remaining waves with their estimates, the line that says so and the `estimate`
 * block for the run state. With no usable calibration the waves carry null estimates and the line says why.
 * @throws {Error} `objective <N> not found`
 */
function planObjective(base, objective, loaded) {
  if (!loaded.ok) {
    const waves = wavesFromFrontmatter(rollup.remainingTrds(base, objective).trds);
    const line = `No estimate: ${loaded.reason}`;
    const estimate = { line, wall_minutes: null, confidence: 'none', execution: null, total: null, calibration: null };
    return { waves, line, estimate, output: null };
  }
  const result = rollup.estimateObjective(loaded.cal, base, objective);
  const output = objectiveOutput(result, loaded, false);
  return {
    waves: result.waves.map((w) => newWave(w.wave, w.trds, w.wall_minutes)),
    line: output.line,
    estimate: {
      line: output.line,
      wall_minutes: result.execution ? result.execution.wall_minutes : null,
      confidence: result.confidence,
      // Unrounded, so a later accuracy check compares against what the estimator said, not a rounded display.
      execution: result.execution || null,
      total: result.total || null,
      calibration: { ...loaded.meta, inputs_digest: loaded.cal.inputs_digest || null },
    },
    output,
  };
}

/** A new run state at `now` (nothing started). */
function newRunState(objective, plan, now) {
  const stamp = isoOf(now);
  return {
    version: store.STATE_VERSION,
    objective: String(objective),
    started_at: stamp,
    updated_at: stamp,
    finished_at: null,
    estimate: plan.estimate,
    waves: plan.waves,
  };
}

/** A run is live when it is for this objective, not finished and not idle for longer than the status line's staleness limit. */
function isLive(state, objective, now) {
  if (!state || state.objective !== String(objective) || state.finished_at) return false;
  const updated = Date.parse(state.updated_at);
  return Number.isFinite(updated) && now - updated <= store.STALE_MS;
}

/**
 * Archive a finished run into the history (estimate-run-store.archiveRunState), naming the failure when the archive cannot be written.
 * @throws {Error} `could not archive the run history: <cause>`
 */
function archiveFinished(root, state, env) {
  try {
    return store.archiveRunState(root, state, { env });
  } catch (err) {
    throw new Error(`could not archive the run history: ${err.message}`);
  }
}

/**
 * Write `next` as the run state, first archiving `previous` when it is a finished run, so a later run never destroys an
 * earlier outcome. An unfinished previous run (abandoned) is simply overwritten. When the archive fails nothing is written.
 * @throws {Error} `could not archive the run history: <cause>`
 */
function replaceRun(root, previous, next, env) {
  if (previous && previous.finished_at) archiveFinished(root, previous, env);
  return store.writeRunState(root, next, { env });
}

function minutesOrNull(p50, p90) {
  return p50 === null || p50 === undefined ? null : { p50, p90 };
}

function runStart(parsed, env, base, now) {
  const objective = parsed.positionals[0];
  const loaded = loadCal(parsed.flags, env, base);
  const plan = planObjective(base, objective, loaded);
  const state = newRunState(objective, plan, now);
  const root = runRoot(base);
  const written = replaceRun(root, store.readRunState(root, { env }), state, env);
  const runState = { path: written.path, waves: state.waves.length };

  if (!loaded.ok) {
    const none = noEstimateResult(loaded, true);
    return { ...none, result: { ...none.result, run_state: runState } };
  }
  const { full, line, table } = plan.output;
  return { ok: true, result: { ...fmt.roundResult(full), line, table, run_state: runState }, text: line, exit: 0 };
}

function runWave(parsed, env, base, now) {
  const [objective, waveText] = parsed.positionals;
  const waveNo = Number(waveText);
  const root = runRoot(base);
  const state = store.readRunState(root, { env });
  return parsed.bools.start
    ? waveStart({ objective, waveNo, root, state, parsed, env, base, now })
    : waveDone({ objective, waveNo, root, state, env, now });
}

function waveStart({ objective, waveNo, root, state, parsed, env, base, now }) {
  let created = false;
  let run = state;
  if (!isLive(run, objective, now)) {
    run = newRunState(objective, planObjective(base, objective, loadCal(parsed.flags, env, base)), now);
    created = true;
  }
  let wave = run.waves.find((w) => w.wave === waveNo);
  if (!wave) {
    // A wave the run does not hold (a gap-closure wave added after the start): estimated now, or recorded without one.
    try {
      const plan = planObjective(base, objective, loadCal(parsed.flags, env, base));
      wave = plan.waves.find((w) => w.wave === waveNo);
    } catch {
      wave = undefined;
    }
    if (!wave) wave = newWave(waveNo, [], null);
    run.waves.push(wave);
    run.waves.sort((a, b) => a.wave - b.wave);
  }
  if (!wave.started_at) wave.started_at = isoOf(now);
  run.updated_at = isoOf(now);
  // A new run replaces whatever was there (`state`): archive it first if it finished. A continued run just updates.
  const written = created ? replaceRun(root, state, run, env) : store.writeRunState(root, run, { env });

  const text = fmt.waveStartLine({ wave: waveNo, p50: wave.p50, p90: wave.p90 });
  const result = {
    objective: String(objective),
    wave: waveNo,
    minutes: minutesOrNull(wave.p50, wave.p90),
    started_at: wave.started_at,
    run_state: { path: written.path, created },
    line: text,
  };
  return { ok: true, result: fmt.roundResult(result), text, exit: 0 };
}

function waveDone({ objective, waveNo, root, state, env, now }) {
  const unknown = (why) => {
    const text = `Wave ${waveNo}: actual unknown (${why})`;
    return { ok: true, result: { objective: String(objective), wave: waveNo, actual_minutes: null, verdict: null, line: text }, text, exit: 0 };
  };
  if (!state || state.objective !== String(objective) || state.finished_at) return unknown('no run state');
  const wave = state.waves.find((w) => w.wave === waveNo);
  if (!wave || !wave.started_at) return unknown('the wave was not started');

  if (!wave.finished_at) {
    const started = Date.parse(wave.started_at);
    wave.finished_at = isoOf(now);
    wave.actual_minutes = Number.isFinite(started) ? Math.max(0, (now - started) / MS_PER_MINUTE) : null;
    state.updated_at = isoOf(now);
    store.writeRunState(root, state, { env });
  }
  const estimate = minutesOrNull(wave.p50, wave.p90);
  const text = fmt.waveDoneLine({ wave: waveNo, actual: wave.actual_minutes, p50: wave.p50, p90: wave.p90 });
  const result = {
    objective: String(objective),
    wave: waveNo,
    actual_minutes: wave.actual_minutes,
    minutes: estimate,
    verdict: fmt.verdict(wave.actual_minutes, estimate),
    finished_at: wave.finished_at,
    line: text,
  };
  return { ok: true, result: fmt.roundResult(result), text, exit: 0 };
}

function runFinish(parsed, env, base, now) {
  const objective = parsed.positionals[0];
  const root = runRoot(base);
  const state = store.readRunState(root, { env });
  if (!state || state.objective !== String(objective)) {
    const text = `Objective ${objective} execution: actual unknown (no run state)`;
    return { ok: true, result: { objective: String(objective), actual_minutes: null, verdict: null, line: text }, text, exit: 0 };
  }
  if (!state.finished_at) {
    state.finished_at = isoOf(now);
    state.updated_at = isoOf(now);
    store.writeRunState(root, state, { env });
  }
  // Idempotent: a run finished before the history existed is archived by its next finish too.
  archiveFinished(root, state, env);
  const started = Date.parse(state.started_at);
  const finished = Date.parse(state.finished_at);
  const actual = Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, (finished - started) / MS_PER_MINUTE) : null;
  const wall = state.estimate && state.estimate.wall_minutes ? state.estimate.wall_minutes : null;
  const text = fmt.finishLine({ objective, actual, wall });
  const result = {
    objective: String(objective),
    actual_minutes: actual,
    minutes: wall,
    verdict: fmt.verdict(actual, wall),
    started_at: state.started_at,
    finished_at: state.finished_at,
    line: text,
  };
  return { ok: true, result: fmt.roundResult(result), text, exit: 0 };
}

const HANDLERS = {
  task: runTask,
  trd: runTrd,
  objective: runObjective,
  milestone: runMilestone,
  start: runStart,
  wave: runWave,
  finish: runFinish,
};

/**
 * @param {{argv?: string[], cwd?: string, env?: object, now?: number}} opts
 *   argv: everything after `estimate`. cwd: the project root (default process.cwd()). env: the environment (default
 *   process.env), read for DEVFLOW_CALIBRATION_PATH and DEVFLOW_ESTIMATE_STATE_DIR. now: epoch ms.
 * @returns {{ok: true, result: object, text: string, exit: number} | {ok: false, message: string}}
 */
function runEstimate({ argv = [], cwd = process.cwd(), env = process.env, now = Date.now() } = {}) {
  const parsed = parseArgs(argv);
  if (!parsed.ok) return parsed;
  const invalid = validate(parsed);
  if (invalid) return invalid;

  const base = path.resolve(cwd);
  try {
    return HANDLERS[parsed.sub](parsed, env, base, now);
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

module.exports = { runEstimate, parseArgs, USAGE };
