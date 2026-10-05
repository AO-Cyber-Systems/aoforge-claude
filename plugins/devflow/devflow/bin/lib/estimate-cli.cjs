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
 *
 * Every form takes `[--calibration <file>] [--raw]`. The calibration is `--calibration` (relative to cwd), else
 * DEVFLOW_CALIBRATION_PATH, else ~/.claude/devflow/calibration.json.
 *
 * Output: the JSON result by default (rounded once, see estimate-format.roundResult; every result carries `line`, the
 * objective and milestone ones also `table`, plus `calibration: {path, version, data_as_of, samples}`). `--raw` prints the
 * text instead: the table for objective and milestone with `--table`, otherwise the one line. The text is what the
 * planner, build and execute-objective prose paste.
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
};

const OBJECTIVE_NUMBER = /^\d+(?:\.\d+)?$/;
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
  if (sub === 'objective' && !OBJECTIVE_NUMBER.test(positionals[0])) {
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

const HANDLERS = {
  task: runTask,
  trd: runTrd,
  objective: runObjective,
  milestone: runMilestone,
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
