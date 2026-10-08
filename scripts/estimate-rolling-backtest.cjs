#!/usr/bin/env node
'use strict';

// Rolling-origin (leave-future-out) backtest harness for objective 64 (EST-08, TRD 64-08).
//
// `df-tools estimate backtest` judges EST-08 with ONE calibration. A leave-future-out validation needs one calibration
// per objective, each built from the history that came before it: this harness loads one calibration file per
// objective, estimates each objective with its OWN file (`estimateObjective(cal, repo, N, {all: true})`, every TRD as
// before execution) and sends the estimates through `buildBacktest`, the code that issued the 64-05 verdict. Given a
// second set (`--new`) it prints the before/after table and applies `shipRule`, the ship rule frozen in
// 64-DIAGNOSIS.md section 7, written here as tested code before any score exists.
//
// Calibrations are read only from the files named on the command line (`--old N=<file>`, `--new N=<file>`). There is no
// fallback: an objective without a calibration is an exclusion, never estimated with another objective's file, and no
// default location is consulted. The harness never writes any calibration (its only write is the optional `--json`
// file, refused under ~/.claude), and it changes none of the constants, thresholds, inputs or actuals of the backtest.
//
// Usage: see USAGE below. JSON by default (rounded once, at output); `--raw` prints markdown.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ci = require('../plugins/devflow/devflow/bin/lib/calibration-inputs.cjs');
const est = require('../plugins/devflow/devflow/bin/lib/estimate.cjs');
const rollup = require('../plugins/devflow/devflow/bin/lib/estimate-rollup.cjs');
const backtest = require('../plugins/devflow/devflow/bin/lib/estimate-backtest.cjs');
const fmt = require('../plugins/devflow/devflow/bin/lib/estimate-format.cjs');
const store = require('../plugins/devflow/devflow/bin/lib/estimate-run-store.cjs');
const { isUnderClaudeHome } = require('./estimate-window-eval.cjs');

const OBJECTIVE_RE = /^\d+(?:\.\d+)?$/;
const METRICS = Object.freeze(['agent_minutes', 'cost_usd']);
const SCS = Object.freeze(['sc2', 'sc3']);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const compareStrings = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ─── The rolling backtest ─────────────────────────────────────────────────────

function isCalibration(cal) {
  return cal !== null && typeof cal === 'object' && !Array.isArray(cal);
}

/**
 * Estimates each objective from its own calibration and judges EST-08 over the lot.
 *   base        the repository (the directory `estimate backtest` would run in); the project root is chosen as
 *               estimate-cli's runRoot does: the nearest directory above `base` holding `.planning`, else `base`
 *   old         { '59': <loaded calibration object>, ... } keyed by objective number
 *   objectives  the objectives to estimate (default: the keys of `old`); one without a calibration is excluded
 *   ratesFile   test seam: the model rates (default: the shipped file)
 * @returns {object} buildBacktest's result plus `excluded_inputs: [{objective, reason}]` and
 *   `calibrations: [{objective, data_as_of, samples, inputs_digest, window}]`
 * @throws {Error} a key that is not an objective number, unreadable rates, `objective <N> not found`
 */
function rollingBacktest({ base, old, objectives, ratesFile }) {
  const sets = old || {};
  const listed = (objectives || Object.keys(sets)).map(String);
  for (const objective of listed) {
    if (!OBJECTIVE_RE.test(objective)) throw new Error(`"${objective}" is not an objective number`);
  }
  const ranked = [...new Set(listed)].sort((a, b) => Number(a) - Number(b) || compareStrings(a, b));

  const rates = ci.loadRates(ratesFile);
  if (!rates.ok) throw new Error(rates.error);
  const project = ci.collectProject(store.findProjectRoot(base) || base);

  const estimates = [];
  const excluded = [];
  const calibrations = [];
  for (const objective of ranked) {
    const cal = Object.prototype.hasOwnProperty.call(sets, objective) ? sets[objective] : null;
    if (!isCalibration(cal)) {
      excluded.push({ objective, reason: 'no calibration' });
      continue;
    }
    estimates.push(rollup.estimateObjective(cal, base, objective, { all: true }));
    calibrations.push({
      objective,
      data_as_of: cal.data_as_of === undefined ? null : cal.data_as_of,
      samples: cal.samples === undefined ? null : { ...cal.samples },
      inputs_digest: cal.inputs_digest === undefined ? null : cal.inputs_digest,
      window: cal.window && Number.isInteger(cal.window.objectives) ? cal.window.objectives : null,
    });
  }

  return {
    ...backtest.buildBacktest({ estimates, project, rates, runs: {} }),
    excluded_inputs: excluded,
    calibrations,
  };
}

// ─── The ship rule (64-DIAGNOSIS.md section 7) ────────────────────────────────

const lnAbs = (ratio) => (isNum(ratio) && ratio > 0 ? Math.abs(Math.log(ratio)) : null);

const status = (result, sc, metric) => (result && result.verdict && result.verdict[sc] ? result.verdict[sc][metric] : undefined);

const medianRatio = (result) => {
  const cell = result && result.summary ? result.summary.agent_minutes : null;
  return cell && isNum(cell.median_ratio) ? cell.median_ratio : null;
};

const fixed3 = (v) => (isNum(v) ? v.toFixed(3) : 'n/a');

/**
 * ship_default is true when the new method's rolling verdict is `met`, or when its agent-minutes median ratio is closer
 * to 1 than the old method's (smaller |ln ratio|) and none of the four verdict statuses (SC2 and SC3, agent minutes and
 * cost) that passes under the old method fails under the new. `insufficient` is not a pass on either side. Decided on the
 * unrounded results.
 * @returns {{est08_old:string, est08_new:string, minutes_median_old:?number, minutes_median_new:?number, improved:boolean,
 *   regressions:{metric:string, sc:string}[], ship_default:boolean, reason:string}}
 */
function shipRule(oldResult, newResult) {
  const minutesOld = medianRatio(oldResult);
  const minutesNew = medianRatio(newResult);
  const lnOld = lnAbs(minutesOld);
  const lnNew = lnAbs(minutesNew);
  const improved = lnOld !== null && lnNew !== null && lnNew < lnOld;

  const regressions = [];
  for (const metric of METRICS) {
    for (const sc of SCS) {
      if (status(oldResult, sc, metric) === 'pass' && status(newResult, sc, metric) !== 'pass') regressions.push({ metric, sc });
    }
  }

  const est08Old = oldResult.verdict.est08;
  const est08New = newResult.verdict.est08;
  const met = est08New === 'met';
  const shipDefault = met || (improved && regressions.length === 0);

  const medians = `new ${fixed3(minutesNew)}, old ${fixed3(minutesOld)}`;
  let reason;
  if (met) {
    reason = 'the new method meets EST-08';
  } else if (lnOld === null || lnNew === null) {
    reason = `no agent-minutes median ratio to compare (${medians})`;
  } else if (!improved) {
    reason = `the agent-minutes median ratio is not closer to 1 (${medians})`;
  } else if (regressions.length > 0) {
    const names = regressions.map((r) => `${r.sc} ${r.metric}`).join(', ');
    reason = `the agent-minutes median ratio is closer to 1 (${medians}) but ${names} passed under the old method and regress under the new`;
  } else {
    reason = `the agent-minutes median ratio is closer to 1 (${medians}) and no passing status regresses`;
  }

  return {
    est08_old: est08Old,
    est08_new: est08New,
    minutes_median_old: minutesOld,
    minutes_median_new: minutesNew,
    improved,
    regressions,
    ship_default: shipDefault,
    reason,
  };
}

// ─── Output ───────────────────────────────────────────────────────────────────

const f2 = (v) => (isNum(v) ? v.toFixed(2) : 'n/a');
const round3 = (v) => (isNum(v) ? Number(v.toFixed(3)) : v);

function table(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((cells) => `| ${cells.join(' | ')} |`),
  ];
}

/** One digest standing for the whole set: the per-objective digests in objective order. Null with no calibration. */
function setDigest(calibrations) {
  if (calibrations.length === 0) return null;
  const text = calibrations.map((c) => `${c.objective}\t${c.inputs_digest || 'none'}\n`).join('');
  return `sha256:${crypto.createHash('sha256').update(text).digest('hex')}`;
}

/** The calibration identity the markdown footer prints: no single path or sample count applies to a rolling set. */
function calibrationMeta(result) {
  const dates = result.calibrations.map((c) => c.data_as_of).filter((d) => typeof d === 'string');
  return {
    path: 'rolling: one calibration per objective',
    data_as_of: dates.length === 0 ? null : dates.sort()[dates.length - 1],
    samples: {},
    inputs_digest: setDigest(result.calibrations),
  };
}

/** The markdown of one set: the backtest report, then the calibrations it ran against. */
function setReport(result) {
  const full = { available: true, ...result, calibration: calibrationMeta(result) };
  const rows = result.calibrations.map((c) => [
    c.objective, c.data_as_of || 'n/a', c.samples && isNum(c.samples.trds) ? c.samples.trds : 'n/a',
    c.window === null ? 'all' : c.window, c.inputs_digest || 'none',
  ]);
  const lines = [fmt.backtestReport(full), '', '### Calibrations', '',
    ...(rows.length === 0 ? ['(none)'] : table(['Objective', 'Data as of', 'Samples (TRDs)', 'Window', 'inputs_digest'], rows))];
  if (result.excluded_inputs.length > 0) {
    lines.push('', 'Excluded inputs: ' + result.excluded_inputs.map((e) => `${e.objective} (${e.reason})`).join(', '));
  }
  return lines.join('\n');
}

function ratioOf(result, objective, metric) {
  const row = result.objectives.find((o) => o.objective === objective);
  const cell = row ? row[metric] : null;
  return cell && !cell.excluded ? cell.ratio : null;
}

function beforeAfter(oldResult, newResult) {
  const objectives = [...new Set([...oldResult.objectives, ...newResult.objectives].map((o) => o.objective))]
    .sort((a, b) => Number(a) - Number(b) || compareStrings(a, b));
  return table(['Objective', 'Minutes ratio old', 'Minutes ratio new', 'Cost ratio old', 'Cost ratio new'],
    objectives.map((n) => [n, f2(ratioOf(oldResult, n, 'agent_minutes')), f2(ratioOf(newResult, n, 'agent_minutes')),
      f2(ratioOf(oldResult, n, 'cost_usd')), f2(ratioOf(newResult, n, 'cost_usd'))]));
}

function markdown(oldResult, newResult, ship) {
  if (!newResult) return `${setReport(oldResult)}\n`;
  return [
    '## Old method (--old)', '', setReport(oldResult), '',
    '## New method (--new)', '', setReport(newResult), '',
    '## Before and after', '', ...beforeAfter(oldResult, newResult), '',
    `EST-08 old: ${ship.est08_old}; new: ${ship.est08_new}`, '',
    `Ship default: ${ship.ship_default} (${ship.reason})`,
  ].join('\n') + '\n';
}

/** The JSON document: each set rounded once with the estimate formatter, the ship rule's medians to 3 decimals. */
function jsonOutput(oldResult, newResult, ship) {
  const out = { old: fmt.roundResult(oldResult) };
  if (newResult) {
    out.new = fmt.roundResult(newResult);
    out.ship = { ...ship, minutes_median_old: round3(ship.minutes_median_old), minutes_median_new: round3(ship.minutes_median_new) };
  }
  return `${JSON.stringify(out, null, 2)}\n`;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const USAGE = 'usage: estimate-rolling-backtest.cjs --old N=<file> [--old N=<file> ...] [--new N=<file> ...] [--repo <dir>] [--json <file>] [--raw]';
const VALUE_FLAGS = new Set(['--old', '--new', '--repo', '--json']);

class UsageError extends Error {}

function parseSet(flag, value) {
  const eq = value.indexOf('=');
  if (eq <= 0 || eq === value.length - 1) throw new UsageError(`${flag} ${value} must be N=<file>`);
  const objective = value.slice(0, eq);
  if (!OBJECTIVE_RE.test(objective)) throw new UsageError(`${flag} ${value}: "${objective}" is not an objective number`);
  return { objective, file: value.slice(eq + 1) };
}

function parseArgs(argv) {
  const options = { old: [], new: [], repo: null, json: null, raw: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--raw') {
      options.raw = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (VALUE_FLAGS.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`${arg} needs a value`);
      i += 1;
      if (arg === '--old' || arg === '--new') {
        const entry = parseSet(arg, value);
        if (options[arg.slice(2)].some((e) => e.objective === entry.objective)) {
          throw new UsageError(`objective ${entry.objective} is listed twice in ${arg}`);
        }
        options[arg.slice(2)].push(entry);
      } else {
        options[arg.slice(2)] = value;
      }
    } else {
      throw new UsageError(arg.startsWith('-') ? `unknown flag ${arg}` : `unexpected argument "${arg}"`);
    }
  }
  if (options.help) return options;
  if (options.old.length === 0) throw new UsageError('needs at least one --old N=<file>');
  if (options.new.length > 0) {
    const same = (a, b) => a.length === b.length && a.every((e) => b.some((o) => o.objective === e.objective));
    if (!same(options.old, options.new)) throw new UsageError('the --new set must name the same objectives as --old');
  }
  return options;
}

/** Loads `{ N: <calibration> }` from the named files; an unusable file stops the run with the loader's reason. */
function loadSet(entries, cwd) {
  const calibrations = {};
  for (const { objective, file } of entries) {
    const loaded = est.loadCalibration(path.resolve(cwd, file), {});
    if (!loaded.ok) throw new Error(loaded.reason);
    calibrations[objective] = loaded.calibration;
  }
  return calibrations;
}

function isDirectory(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false; // absent or unreadable
  }
}

/** Runs the CLI; returns the exit code (0 ok, 1 usage or run error). `io` may carry stdout, stderr and cwd. */
function main(argv, io = {}) {
  const out = io.stdout || process.stdout;
  const err = io.stderr || process.stderr;
  const cwd = io.cwd || process.cwd();
  try {
    const options = parseArgs(argv);
    if (options.help) {
      out.write(`${USAGE}\n`);
      return 0;
    }
    const jsonFile = options.json === null ? null : path.resolve(cwd, options.json);
    if (jsonFile !== null && isUnderClaudeHome(jsonFile)) throw new UsageError('--json refuses a path under ~/.claude');
    const base = path.resolve(cwd, options.repo === null ? '.' : options.repo);
    if (!isDirectory(base)) throw new UsageError(`--repo ${options.repo} is not a directory`);

    const oldCalibrations = loadSet(options.old, cwd);
    const newCalibrations = options.new.length > 0 ? loadSet(options.new, cwd) : null;

    const oldResult = rollingBacktest({ base, old: oldCalibrations });
    const newResult = newCalibrations ? rollingBacktest({ base, old: newCalibrations }) : null;
    const ship = newResult ? shipRule(oldResult, newResult) : null;

    const json = jsonOutput(oldResult, newResult, ship);
    if (jsonFile !== null) fs.writeFileSync(jsonFile, json);
    out.write(options.raw ? markdown(oldResult, newResult, ship) : json);
    return 0;
  } catch (e) {
    err.write(`estimate-rolling-backtest: ${e.message}\n`);
    if (e instanceof UsageError) err.write(`${USAGE}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  rollingBacktest,
  shipRule,
  parseArgs,
  main,
  USAGE,
};
