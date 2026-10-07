'use strict';

// The estimate backtest (TRD 64-01, EST-08): were the estimates accurate against real executions? A pure comparison of
// objective estimates with what the planning history recorded. It reads no file, no environment variable and no clock;
// 64-04 wires it into `df-tools estimate backtest` and 64-05 runs it on real objectives.
//
// Inputs are objects the existing modules already produce:
//   estimates  estimate-rollup.estimateObjective(cal, cwd, N, {all: true}) per objective (every TRD, done or not)
//   project    calibration-inputs.collectProject(root): TRDs with SUMMARY minutes (metric-row fallback), tokens and tasks
//   rates      calibration-inputs.loadRates()
//   runs       optional finished run states keyed by the objective string as the estimate carries it ('63'): the
//              out-of-repo file `estimate start|wave|finish` writes, with the estimate as it was made before execution
//
// Everywhere, `ratio` is p50 / actual: above 1.0 the estimate was high, below 1.0 it was low. Nothing is rounded here;
// 64-04 rounds once at output, so every boolean (`within_band`, `covered`, the verdicts) is decided on unrounded values.
//
// The verdict rules are the constants below, fixed before any live data was looked at. They are exports, not parameters:
// a caller cannot loosen them.
//   SC2 (per primary metric): the median of the per-objective ratios is within BAND of 1.
//   SC3 (per primary metric): P90 covers at least COVERAGE_TARGET of the compared objectives AND of the compared TRDs.
//   EST-08 is `met` only when SC2 and SC3 both pass for agent_minutes and for cost_usd. Wall time is reported, never
//   judged: only a run state measured it prospectively, so it can never reach MIN_OBJECTIVES.
//
// Honesty rules, the same as the estimator's: an actual that cannot be fully measured is null and names the TRDs that
// lack it (no SUMMARY, no minutes, human wait, no tokens, an unpriced model), never an undercounted sum; an excluded
// comparison carries a reason and is never given a number. A TRD with no SUMMARY has no recorded outcome, so its minutes
// are missing even when a STATE_ARCHIVE metric row exists. The metric-row fallback applies to a SUMMARY with no duration.

const calibrator = require('./calibrator.cjs');

// ─── The fixed verdict rules ──────────────────────────────────────────────────

/** A median is in band when 1 - BAND <= p50 / actual <= 1 + BAND (within ±30% of actual). */
const BAND = 0.3;
/** P90 must cover at least this share of the outcomes. */
const COVERAGE_TARGET = 0.8;
/** Fewer compared objectives than this for a metric gives the verdict `insufficient`. */
const MIN_OBJECTIVES = 3;
/** A task class with fewer tasks than this is `too_few` and never judged. */
const MIN_CLASS_TASKS = 3;
/** The like-for-like executor metrics EST-08 is judged on. */
const PRIMARY_METRICS = Object.freeze(['agent_minutes', 'cost_usd']);
/** Minutes: a reconstructed wall estimate reproduces the persisted one when both p50 and p90 differ by at most this. */
const REPRODUCE_TOLERANCE = 0.05;

// ─── Statistics ───────────────────────────────────────────────────────────────

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * The conventional median of the finite values: the middle value of an odd count, the mean of the two middle values of
 * an even one. Not the calibrator's nearest-rank percentile (which is always an observed value). Null when no value is
 * finite. The input is not modified.
 * @param {unknown[]} values
 * @returns {number|null}
 */
function median(values) {
  const sorted = (Array.isArray(values) ? values : []).filter(isFiniteNumber).sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ─── Actuals ──────────────────────────────────────────────────────────────────

function isCheckpoint(task) {
  return Boolean(task) && typeof task.type === 'string' && task.type.startsWith('checkpoint');
}

/**
 * What one TRD's SUMMARY recorded, with the reason for each metric it lacks. Minutes follow the calibrator's rule: a TRD
 * that waited for a human reports wall-clock time that is not work, so it has none ('human_wait'); its tokens still count.
 * Minutes are `trd.minutes` exactly as collectProject resolved them (SUMMARY duration, else the STATE_ARCHIVE metric row)
 * but only for a TRD that has a SUMMARY: without one there is no recorded outcome ('no_summary').
 */
function trdActual(trd, rates) {
  const summary = trd.summary || null;
  const autonomous = Boolean(trd.autonomous);

  let minutesReason = null;
  if (!autonomous) minutesReason = 'human_wait';
  else if (summary === null) minutesReason = 'no_summary';
  else if (!isFiniteNumber(trd.minutes)) minutesReason = 'no_minutes';

  let cost = null;
  let costReason = null;
  if (summary === null) costReason = 'no_summary';
  else if (!isFiniteNumber(summary.tokens_input) || !isFiniteNumber(summary.tokens_output)) costReason = 'no_tokens';
  else {
    cost = calibrator.sampleCost(summary, rates);
    if (cost === null) costReason = 'unpriced';
  }

  const minutes = minutesReason === null ? trd.minutes : null;
  return {
    id: trd.id,
    autonomous,
    minutes,
    duration_source: minutes === null ? null : trd.duration_source || null,
    cost_usd: cost,
    auto_tasks: (Array.isArray(trd.tasks) ? trd.tasks : []).filter((task) => !isCheckpoint(task)).length,
    minutes_reason: minutesReason,
    cost_reason: costReason,
  };
}

function idsWhere(records, key, reasons) {
  return records.filter((r) => reasons.includes(r[key])).map((r) => r.id);
}

function sumOf(values) {
  return values.reduce((total, v) => total + v, 0);
}

/**
 * The executor minutes and dollars an objective's SUMMARYs recorded, from the project record collectProject returns.
 * A metric is the sum over every TRD of the objective or null, never a partial sum: the TRDs that lack it are named.
 *   minutes   {value, complete, trds, with, missing, human_wait, sources}  missing = no SUMMARY or no minutes
 *   cost_usd  {value, complete, trds, with, missing, unpriced}             missing = no SUMMARY or no tokens
 *   trds      [{id, autonomous, minutes, duration_source, cost_usd, auto_tasks, minutes_reason, cost_reason}]
 * Cost is priced with calibrator.sampleCost, the same pricing `calibrate` uses; a model with no rate is `unpriced`.
 * @param {{trds: object[]}} project
 * @param {string} dir the objective directory name
 * @param {object} rates calibration-inputs.loadRates()
 */
function objectiveActuals(project, dir, rates) {
  const records = ((project && project.trds) || []).filter((trd) => trd.objective_dir === dir).map((trd) => trdActual(trd, rates));

  const minuteMissing = idsWhere(records, 'minutes_reason', ['no_summary', 'no_minutes']);
  const humanWait = idsWhere(records, 'minutes_reason', ['human_wait']);
  const withMinutes = records.filter((r) => r.minutes !== null);
  const minutesComplete = records.length > 0 && minuteMissing.length === 0 && humanWait.length === 0;

  const costMissing = idsWhere(records, 'cost_reason', ['no_summary', 'no_tokens']);
  const unpriced = idsWhere(records, 'cost_reason', ['unpriced']);
  const withCost = records.filter((r) => r.cost_usd !== null);
  const costComplete = records.length > 0 && costMissing.length === 0 && unpriced.length === 0;

  return {
    minutes: {
      value: minutesComplete ? sumOf(withMinutes.map((r) => r.minutes)) : null,
      complete: minutesComplete,
      trds: records.length,
      with: withMinutes.length,
      missing: minuteMissing,
      human_wait: humanWait,
      sources: {
        summary: withMinutes.filter((r) => r.duration_source === 'summary').length,
        metric: withMinutes.filter((r) => r.duration_source === 'metric').length,
      },
    },
    cost_usd: {
      value: costComplete ? sumOf(withCost.map((r) => r.cost_usd)) : null,
      complete: costComplete,
      trds: records.length,
      with: withCost.length,
      missing: costMissing,
      unpriced,
    },
    trds: records,
  };
}

// ─── One comparison ───────────────────────────────────────────────────────────

/**
 * Compares one estimate with one actual. `ratio` is p50 / actual. The comparison is excluded, with a reason and no
 * number, when the estimate has no p50 ('no estimate', checked first) or the actual is missing, zero or negative
 * ('no actual'); a ratio over a zero actual would be infinite and over a missing one a guess.
 * @param {?{p50:?number, p90:?number}} stat the estimate
 * @param {?number} actual
 */
function compareMetric(stat, actual) {
  const known = isFiniteNumber(actual) ? actual : null;
  if (!stat || !isFiniteNumber(stat.p50)) return { estimate: null, actual: known, excluded: 'no estimate' };
  const p50 = stat.p50;
  const p90 = isFiniteNumber(stat.p90) ? stat.p90 : null;
  if (known === null || known <= 0) return { p50, p90, actual: known, excluded: 'no actual' };
  const ratio = p50 / known;
  return {
    p50,
    p90,
    actual: known,
    ratio,
    within_band: ratio >= 1 - BAND && ratio <= 1 + BAND,
    covered: p90 === null ? null : known <= p90,
    at_or_under_median: known <= p50,
    excluded: null,
  };
}

module.exports = {
  BAND,
  COVERAGE_TARGET,
  MIN_OBJECTIVES,
  MIN_CLASS_TASKS,
  PRIMARY_METRICS,
  REPRODUCE_TOLERANCE,
  median,
  objectiveActuals,
  compareMetric,
};
