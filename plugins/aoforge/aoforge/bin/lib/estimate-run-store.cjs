'use strict';

/**
 * estimate-run-store.cjs — objective 58, TRD 58-04 (EST-05)
 *
 * The cached run state behind "the status line shows estimated time remaining while an
 * objective builds". The status line renders on every turn, so it computes nothing: it reads
 * the one small JSON file defined here and turns it into one segment.
 *
 * WRITER RULE: only `aof-tools estimate start|wave|finish` (TRD 58-08) writes this file and the
 * run history below. The status line and everything else only reads them. A corrupt or
 * half-written file must look like "no run", so reading never throws.
 *
 * Location: $AOFORGE_ESTIMATE_STATE_DIR, else <home>/.claude/aoforge/state/estimates/, then one
 * file per project named `<upgrade.repoKey(<dir that contains .aoforge>)>.json`
 * (`<slug>-<hash8>` of the realpath, the same key backups and the hook markers use). Never
 * inside the project: runtime state in `.aoforge/` shows up as a dirty repo (see
 * hook-marker-store.cjs, same lineage). The file is written atomically (`<file>.tmp` then
 * rename), so a render never sees half a file.
 *
 * Run history (objective 64, TRD 64-02): the run file holds ONE run, and the next `estimate
 * start` overwrites it, which used to destroy an earlier objective's prospective estimate. A
 * FINISHED run is therefore archived (archiveRunState) to
 *
 *   <state dir>/history/<repo-key>/<objective>-<started_at>.json
 *
 * with both name parts through sanitize (only [A-Za-z0-9_-] survives, so Objective 63's run is
 * `63-2026-10-06T23_55_36_062Z.json`). Same bytes as the run file, written atomically, and
 * idempotent: archiving the same state twice writes once. Unfinished runs are never archived.
 * listRunHistory and latestRun read it; neither throws, and a malformed, wrong-version or
 * `.tmp` file is skipped. The status line never touches the history: readRunState and
 * formatStatusSegment read only the one run file above.
 *
 * Run state, schema version 1:
 *
 *   {
 *     "version": 1,
 *     "objective": "58",                         // non-empty string
 *     "started_at": "2026-10-05T18:00:00.000Z",
 *     "updated_at": "2026-10-05T18:15:00.000Z",  // bumped on every write; stale after STALE_MS
 *     "finished_at": null,                       // set when the objective is done
 *     "estimate": { "line": "Objective 58 estimate: ...",
 *                   "wall_minutes": { "p50": 70, "p90": 145 }, "confidence": "medium" },
 *     "waves": [
 *       { "wave": 1, "trds": ["58-01", "58-02"], "p50": 12, "p90": 36,
 *         "started_at": "2026-10-05T18:00:00.000Z", "finished_at": "2026-10-05T18:14:00.000Z",
 *         "actual_minutes": 14 },
 *       { "wave": 2, "trds": ["58-03"], "p50": 20, "p90": 50,
 *         "started_at": "2026-10-05T18:15:00.000Z", "finished_at": null, "actual_minutes": null },
 *       { "wave": 3, "trds": ["58-04"], "p50": 8, "p90": 20,
 *         "started_at": null, "finished_at": null, "actual_minutes": null }
 *     ]
 *   }
 *
 * `estimate` and a wave's `p50`/`p90` may be null (no calibration yet): the run still records
 * timings, and the segment shows the wave without a time.
 *
 * A run started after TRD 64-02 also records, inside `estimate` (all optional, the schema
 * version stays 1, old states still read and the status line ignores them):
 *   "execution", "total"  the estimate's `{wall_minutes, agent_minutes, tokens_input,
 *                         tokens_output, cost_usd}` blocks, each `{p50, p90}` or null, unrounded
 *   "calibration"         `{path, version, data_as_of, samples, inputs_digest}` of the calibration
 *                         the estimate came from
 * so the next accuracy check compares against a prospective executor estimate.
 *
 * Loaded from a hook, so node builtins plus ./upgrade.cjs only (which itself loads only
 * fs/path/crypto and reads nothing at module load). os.homedir() is read when a path is
 * built, never at module load, and nothing is cached between calls.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const compat = require('./compat.cjs');

const STATE_VERSION = 1;
/** A run not updated for this long is treated as abandoned and shows nothing. */
const STALE_MS = 12 * 60 * 60 * 1000;
/** How far up from the workspace directory findProjectRoot looks for a planning directory. */
const MAX_UP = 8;
const MS_PER_MINUTE = 60 * 1000;
const MAX_NAME_LENGTH = 200;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [home] defaults to os.homedir(); injected by tests
 */
function stateRoot(env = process.env, home) {
  const override = env && env.AOFORGE_ESTIMATE_STATE_DIR;
  if (override) return override;
  return path.join(home || os.homedir(), '.claude', 'aoforge', 'state', 'estimates');
}

/** Allowlist sanitizer: only [A-Za-z0-9_-] survives, so a name can never carry a path out of the state dir. */
function sanitize(name) {
  if (name === undefined || name === null) return 'unknown';
  const cleaned = String(name).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, MAX_NAME_LENGTH);
  return cleaned || 'unknown';
}

/** upgrade.repoKey, falling back to the sanitized directory name when the path cannot be resolved. */
function repoKeyOf(projectRoot) {
  try {
    return require('./upgrade.cjs').repoKey(projectRoot);
  } catch {
    return sanitize(path.basename(String(projectRoot)));
  }
}

/**
 * <stateRoot>/<repo-key>.json, never inside the project.
 * @param {string} projectRoot the directory that CONTAINS `.aoforge/`
 * @param {{env?: NodeJS.ProcessEnv, home?: string}} [opts]
 */
function statePath(projectRoot, opts) {
  const { env, home } = opts || {};
  return path.join(stateRoot(env, home), `${repoKeyOf(projectRoot)}.json`);
}

/**
 * <stateRoot>/history/<repo-key>, where finished runs are archived. Same repo key as statePath.
 * @param {string} projectRoot the directory that CONTAINS `.aoforge/`
 * @param {{env?: NodeJS.ProcessEnv, home?: string}} [opts]
 */
function historyDir(projectRoot, opts) {
  const { env, home } = opts || {};
  return path.join(stateRoot(env, home), 'history', repoKeyOf(projectRoot));
}

/**
 * The archive file for a run: `<objective>-<started_at>.json` inside historyDir, both parts
 * through sanitize, so an objective such as `../x` cannot leave the directory.
 * @param {string} projectRoot
 * @param {{objective: string, started_at: string}} state
 * @param {{env?: NodeJS.ProcessEnv, home?: string}} [opts]
 */
function historyPath(projectRoot, state, opts) {
  const name = `${sanitize(state && state.objective)}-${sanitize(state && state.started_at)}.json`;
  return path.join(historyDir(projectRoot, opts), name);
}

/**
 * The directory that contains a planning directory (`.aoforge/`, or a legacy one), found by walking up
 * from `start` (inclusive), at most `maxUp` levels (compat.findProjectRoot). Null when there is none.
 * Never throws: an ancestor that cannot be examined ends the search with no project.
 * @param {string} start e.g. the status line's workspace.current_dir
 * @param {number} [maxUp]
 * @returns {string|null}
 */
function findProjectRoot(start, maxUp = MAX_UP) {
  if (typeof start !== 'string' || start === '') return null;
  try {
    return compat.findProjectRoot(start, { maxUp });
  } catch {
    return null;
  }
}

function isRunState(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.version === STATE_VERSION &&
    typeof value.objective === 'string' &&
    value.objective !== '' &&
    Array.isArray(value.waves)
  );
}

/**
 * The run state for a project, or null for a missing, unreadable, malformed or
 * wrong-version file. Never throws: a broken file must look like "no run".
 * @param {string} projectRoot
 * @param {{env?: NodeJS.ProcessEnv, home?: string}} [opts]
 */
function readRunState(projectRoot, opts) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(projectRoot, opts), 'utf8'));
    return isRunState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Write the run state atomically. Only `aof-tools estimate` calls this (TRD 58-08).
 * Throws on a genuine filesystem error; the half-written temp file is removed first.
 * @returns {{path: string}}
 */
function writeRunState(projectRoot, state, opts) {
  const file = statePath(projectRoot, opts);
  const tmp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  return { path: file };
}

/**
 * Archive a FINISHED run to historyPath, atomically and idempotently. Only `aof-tools estimate`
 * calls this. An unfinished run is never archived (its partial waves are not an outcome); a
 * file already holding the same bytes is not rewritten. Throws on a genuine filesystem error,
 * after removing the half-written temp file.
 * @returns {{path: string|null, written: boolean, reason?: string}}
 */
function archiveRunState(projectRoot, state, opts) {
  if (!isRunState(state)) return { path: null, written: false, reason: 'not a run state' };
  if (!state.finished_at) return { path: null, written: false, reason: 'not finished' };
  const file = historyPath(projectRoot, state, opts);
  const text = `${JSON.stringify(state, null, 2)}\n`;
  try {
    if (fs.readFileSync(file, 'utf8') === text) return { path: file, written: false };
  } catch {
    // no archive yet (or an unreadable one): write it below
  }
  const tmp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  return { path: file, written: true };
}

/**
 * Every archived run for a project, oldest `started_at` first (file name breaks a tie). A
 * missing or unreadable directory gives []; a malformed, wrong-version or non-run file, a
 * `.tmp` file and anything not ending in `.json` is skipped. Never throws.
 * @returns {object[]}
 */
function listRunHistory(projectRoot, opts) {
  let dir;
  let names;
  try {
    dir = historyDir(projectRoot, opts);
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const runs = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      if (isRunState(parsed)) runs.push({ name, state: parsed });
    } catch {
      // a broken archive file must look like "not there"
    }
  }
  runs.sort((a, b) => {
    const left = String(a.state.started_at);
    const right = String(b.state.started_at);
    if (left !== right) return left < right ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  return runs.map((r) => r.state);
}

/**
 * The newest FINISHED run for an objective, from the archive and the current run file
 * together. The current file wins a tie on `started_at` (it is the same run, possibly updated
 * after it was archived). An unfinished run is ignored. Null when there is none. Never throws.
 * @param {string} projectRoot
 * @param {string|number} objective compared as a string with the run's `objective`
 * @param {{env?: NodeJS.ProcessEnv, home?: string}} [opts]
 * @returns {object|null}
 */
function latestRun(projectRoot, objective, opts) {
  const wanted = String(objective);
  // the current file goes last so `>=` below lets it win an equal started_at
  const candidates = [...listRunHistory(projectRoot, opts), readRunState(projectRoot, opts)];
  let best = null;
  for (const run of candidates) {
    if (!run || run.objective !== wanted || !run.finished_at) continue;
    if (best === null || String(run.started_at) >= String(best.started_at)) best = run;
  }
  return best;
}

/** Remove the run state (and a stranded temp file). A missing file is not an error. */
function clearRunState(projectRoot, opts) {
  const file = statePath(projectRoot, opts);
  fs.rmSync(file, { force: true });
  fs.rmSync(`${file}.tmp`, { force: true });
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Epoch ms of an ISO timestamp, or null for anything that is not a parsable string. */
function parseTime(value) {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * How long a live run has left.
 *
 * Null when there is nothing to show: no state, `finished_at` set, `updated_at` missing,
 * unparsable or more than STALE_MS before `now`, or no waves.
 * Otherwise `{minutes, wave, waves, done, over}`:
 *   - `waves`  the highest wave number in the state (a resumed run may hold only 6 and 7, and
 *              then the denominator is 7, not 2);
 *   - `done`   how many waves have finished;
 *   - `wave`   the first wave without `finished_at`, or null when every wave has finished
 *              (then `minutes` is 0);
 *   - `minutes` the median (p50) of every unfinished wave, less the time the current wave has
 *              already run (floored at 0), rounded up so a live wave never reads 0 while time
 *              remains; null when any unfinished wave has no p50;
 *   - `over`   the current wave has started and run past a non-null p90.
 *
 * @param {object|null} state
 * @param {number|Date} [now] epoch ms
 */
function remainingMinutes(state, now = Date.now()) {
  if (!state || typeof state !== 'object' || state.finished_at) return null;
  const nowMs = now instanceof Date ? now.getTime() : now;
  const updated = parseTime(state.updated_at);
  if (updated === null || !Number.isFinite(nowMs) || nowMs - updated > STALE_MS) return null;

  const waves = (Array.isArray(state.waves) ? state.waves : [])
    .filter((w) => w && typeof w === 'object' && isNumber(w.wave))
    .sort((a, b) => a.wave - b.wave);
  if (waves.length === 0) return null;

  const total = waves[waves.length - 1].wave;
  const done = waves.filter((w) => w.finished_at).length;
  const unfinished = waves.filter((w) => !w.finished_at);
  if (unfinished.length === 0) return { minutes: 0, wave: null, waves: total, done, over: false };

  const current = unfinished[0];
  const startedAt = parseTime(current.started_at);
  const elapsed = startedAt === null ? 0 : Math.max(0, (nowMs - startedAt) / MS_PER_MINUTE);
  const over = startedAt !== null && isNumber(current.p90) && elapsed > current.p90;

  let minutes = null;
  if (unfinished.every((w) => isNumber(w.p50))) {
    const left = unfinished.reduce(
      (sum, w) => sum + (w === current ? Math.max(0, w.p50 - elapsed) : w.p50),
      0
    );
    minutes = Math.ceil(left);
  }
  return { minutes, wave: current.wave, waves: total, done, over };
}

/** `18m`, `59m`, `1h 00m`, `1h 15m`, `2h 05m`. */
function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h ${String(rest).padStart(2, '0')}m`;
}

/**
 * The status line text for a run, without colour (the hook adds it):
 *   `⏱ 58 W2/3 ~18m left` | `⏱ 58 W2/3 over P90` | `⏱ 58 W2/3` (no estimate)
 * Empty string whenever there is nothing live to show, every wave included.
 * @param {object|null} state
 * @param {number|Date} [now] epoch ms
 */
function formatStatusSegment(state, now = Date.now()) {
  const r = remainingMinutes(state, now);
  if (!r || r.wave === null) return '';
  // eslint-disable-next-line no-control-regex
  const objective = String(state.objective).replace(/[\x00-\x1f\x7f]/g, '');
  const head = `⏱ ${objective} W${r.wave}/${r.waves}`;
  if (r.over) return `${head} over P90`;
  if (r.minutes === null) return head;
  return `${head} ~${formatDuration(r.minutes)} left`;
}

module.exports = {
  STATE_VERSION,
  STALE_MS,
  stateRoot,
  statePath,
  historyDir,
  historyPath,
  findProjectRoot,
  readRunState,
  writeRunState,
  archiveRunState,
  listRunHistory,
  latestRun,
  clearRunState,
  remainingMinutes,
  formatStatusSegment,
};
