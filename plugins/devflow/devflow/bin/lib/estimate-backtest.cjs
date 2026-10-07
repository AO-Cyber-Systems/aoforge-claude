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

module.exports = {
  BAND,
  COVERAGE_TARGET,
  MIN_OBJECTIVES,
  MIN_CLASS_TASKS,
  PRIMARY_METRICS,
  REPRODUCE_TOLERANCE,
  median,
};
