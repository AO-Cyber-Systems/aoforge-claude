'use strict';

/**
 * calibrate-cli.cjs — TRD 57-06 (EST-01)
 *
 * Thin CLI front end for the calibrator (lib/calibrator.cjs, TRD 57-05):
 *
 *   df-tools calibrate [--paths <dir[,dir]>] [--out <file>] [--rates <file>] [--root <dir> | --no-overhead] [--dry-run] [--raw]
 *       Builds the per-task-class medians and P90s (minutes, tokens, dollars) from SUMMARY frontmatter, STATE_ARCHIVE
 *       metrics and model-rates.json, and writes calibration.json. Version 2 also measures what one spawn of each
 *       non-executor agent costs (planner, verifier, ...) from subagent transcripts.
 *
 *   paths   --paths (comma separated), else DEVFLOW_CALIBRATE_PATHS (path.delimiter separated), else the checkout
 *           holding cwd. A path is a project (has .planning/objectives) or a directory of projects. Relative paths
 *           resolve against cwd.
 *   out     --out (relative to cwd), else DEVFLOW_CALIBRATION_PATH, else ~/.claude/devflow/calibration.json.
 *   rates   --rates, else the shipped references/model-rates.json.
 *   root    --root (relative to cwd), else ~/.claude/projects resolved when the command runs: the Claude Code projects
 *           directory the agent-overhead spawns are read from. `--no-overhead` skips the scan (agent_overhead is then
 *           empty and says `scanned: false`). The two flags are exclusive.
 *
 * Deterministic: unchanged inputs give a byte-identical file and `changed: false`; the file is then not rewritten.
 * `--dry-run` builds and reports but writes nothing. stdout is a summary, never the calibration object: the file is
 * the artifact.
 *
 * Refuses to write when no project is found under the paths: an empty history must not overwrite a good file.
 *
 * Same shape as tokens-cli.cjs: `runCalibrate` is pure and returns `{ok, result, text, exit}` or `{ok:false, message}`;
 * the dispatcher's `case 'calibrate'` maps that onto output()/error().
 */

const fs = require('fs');
const path = require('path');
const calibrator = require('./calibrator.cjs');
const planningMode = require('./planning-mode.cjs');

const USAGE = 'df-tools calibrate [--paths <dir[,dir]>] [--out <file>] [--rates <file>] [--root <dir> | --no-overhead] [--dry-run] [--raw]';

const VALUE_FLAGS = ['paths', 'out', 'rates', 'root'];
const BOOL_FLAGS = ['dry-run', 'no-overhead'];

function usageError(message) {
  return { ok: false, message: `${message}\nUsage: ${USAGE}` };
}

/**
 * `argv` is everything after `calibrate`. A value flag needs a value that is not itself a flag; unknown flags and stray
 * positionals are usage errors. `--raw` is stripped by the dispatcher before this runs; it is tolerated here.
 *
 * @returns {{ok:true, flags: Object<string,string>, dryRun: boolean, noOverhead: boolean} | {ok:false, message:string}}
 */
function parseArgs(argv) {
  const flags = {};
  const bools = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === '--raw') continue;
    if (!tok.startsWith('--')) return usageError(`unexpected argument ${JSON.stringify(tok)}; calibrate takes only flags`);
    const name = tok.slice(2);
    if (BOOL_FLAGS.includes(name)) {
      bools[name] = true;
      continue;
    }
    if (!VALUE_FLAGS.includes(name)) return usageError(`unknown flag ${tok} for calibrate`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) return usageError(`${tok} needs a value`);
    flags[name] = value;
    i++;
  }
  if (flags.root !== undefined && bools['no-overhead']) {
    return usageError('--root and --no-overhead cannot be used together: --no-overhead reads no transcripts');
  }
  return { ok: true, flags, dryRun: bools['dry-run'] === true, noOverhead: bools['no-overhead'] === true };
}

/** Non-empty trimmed pieces of `text` split on `sep`, each resolved against `base`. */
function splitPaths(text, sep, base) {
  return String(text).split(sep).map((p) => p.trim()).filter((p) => p !== '').map((p) => path.resolve(base, p));
}

/**
 * The directories to calibrate: `--paths`, else `DEVFLOW_CALIBRATE_PATHS`, else the checkout holding cwd.
 * @returns {{paths: string[]} | {error: string}}
 */
function resolvePaths(flags, env, base) {
  if (flags.paths !== undefined) {
    const paths = splitPaths(flags.paths, ',', base);
    return paths.length > 0 ? { paths } : { error: `--paths ${JSON.stringify(flags.paths)} names no directory` };
  }
  if (typeof env.DEVFLOW_CALIBRATE_PATHS === 'string' && env.DEVFLOW_CALIBRATE_PATHS.trim() !== '') {
    const paths = splitPaths(env.DEVFLOW_CALIBRATE_PATHS, path.delimiter, base);
    if (paths.length > 0) return { paths };
  }
  const checkout = planningMode.resolveCheckoutRoot(base);
  if (checkout) return { paths: [checkout] };
  return { error: `no DevFlow project at ${base}; pass --paths <dir[,dir]> (or set DEVFLOW_CALIBRATE_PATHS)` };
}

/** `{name: samples}` for every task class but `all` (that is `samples.tasks`). */
function classSamples(taskClasses) {
  const out = {};
  for (const name of Object.keys(taskClasses).sort()) {
    if (name !== 'all') out[name] = taskClasses[name].samples;
  }
  return out;
}

/** `code_tdd 5, doc 1, prompt 1` (also `planner 1, verifier 1`): by samples descending, then name. `none` when empty. */
function classList(classes) {
  const names = Object.keys(classes).sort((a, b) => classes[b] - classes[a] || (a < b ? -1 : a > b ? 1 : 0));
  return names.length > 0 ? names.map((n) => `${n} ${classes[n]}`).join(', ') : 'none';
}

/** `{agent: samples}` for every overhead agent with at least one sample. */
function overheadAgents(agentOverhead) {
  const out = {};
  for (const name of Object.keys(agentOverhead).sort()) {
    if (agentOverhead[name].samples > 0) out[name] = agentOverhead[name].samples;
  }
  return out;
}

/** Would writing `obj` to `file` change it? True when the file is absent or its bytes differ. */
function wouldChange(file, obj) {
  try {
    return fs.readFileSync(file, 'utf-8') !== calibrator.stableStringify(obj);
  } catch {
    return true;
  }
}

/**
 * @param {{argv?: string[], cwd?: string, env?: object}} opts
 *   argv: everything after `calibrate`. cwd: the project cwd (default process.cwd()). env: the environment
 *   (default process.env); read for DEVFLOW_CALIBRATE_PATHS and DEVFLOW_CALIBRATION_PATH.
 * @returns {{ok: true, result: object, text: string, exit: number} | {ok: false, message: string}}
 */
function runCalibrate({ argv = [], cwd = process.cwd(), env = process.env } = {}) {
  const parsed = parseArgs(argv);
  if (!parsed.ok) return parsed;
  const { flags, dryRun, noOverhead } = parsed;

  const base = path.resolve(cwd);
  const where = resolvePaths(flags, env, base);
  if (where.error) return { ok: false, message: where.error };

  const out = path.resolve(base, flags.out !== undefined ? flags.out : calibrator.defaultCalibrationPath(env));
  const ratesPath = flags.rates !== undefined ? path.resolve(base, flags.rates) : undefined;

  // The default transcripts root is resolved here, per call, so HOME-isolated runs never reach the real one.
  let transcriptsRoot = null;
  if (!noOverhead) {
    transcriptsRoot = flags.root !== undefined
      ? path.resolve(base, flags.root)
      : require('./token-usage.cjs').defaultTranscriptRoot();
  }

  let calibration;
  try {
    calibration = calibrator.buildCalibration({ paths: where.paths, ratesPath, transcriptsRoot });
  } catch (err) {
    return { ok: false, message: err.message };
  }
  if (calibration.sources.length === 0) {
    return {
      ok: false,
      message: `no DevFlow project (a directory with .planning/objectives) found under ${where.paths.join(', ')}; nothing written`,
    };
  }

  let changed;
  if (dryRun) {
    changed = wouldChange(out, calibration);
  } else {
    try {
      changed = calibrator.writeCalibration(out, calibration).changed;
    } catch (err) {
      return { ok: false, message: err.message };
    }
  }

  const classes = classSamples(calibration.task_classes);
  const agents = overheadAgents(calibration.agent_overhead);
  const src = calibration.agent_overhead_sources;
  const overhead = {
    scanned: src.scanned,
    spawns: src.spawns,
    matched: src.matched,
    foreign: src.foreign,
    quick: src.quick,
    unreadable: src.unreadable,
    agents,
  };
  const result = {
    out,
    dry_run: dryRun,
    changed,
    samples: calibration.samples,
    classes,
    sources: calibration.sources,
    data_as_of: calibration.data_as_of,
    inputs_digest: calibration.inputs_digest,
    unpriced_models: calibration.unpriced_models,
    overhead,
  };
  const slot = dryRun ? 'dry run' : changed ? 'changed' : 'unchanged';
  const s = calibration.samples;
  const text = `calibration ${out}: ${slot} · ${s.trds} TRDs, ${s.tasks} tasks, ${s.with_tokens} with tokens · classes ${classList(classes)} · overhead ${src.scanned ? classList(agents) : 'skipped'}`;
  return { ok: true, result, text, exit: 0 };
}

module.exports = { runCalibrate, parseArgs, USAGE };
