'use strict';

// The objective layer of the estimator (TRD 58-06, EST-03). Composes the TRD estimates of an objective's remaining TRDs
// (estimate.cjs) with the composition rules of estimate-math.cjs:
//
//   - A wave's wall time is the max of its TRDs (independent) when parallelization is on, their correlated sum when it
//     is off. The execution wall time is the correlated sum of the waves. Agent minutes, tokens and dollars are the
//     correlated sum of the TRDs, whatever the wave structure. Every sum is one flat list (estimate-math: nesting a
//     correlated sum inside another is not associative).
//   - "Remaining" means no paired SUMMARY, or a SUMMARY that is only a `## Progress` checkpoint: the same rule
//     objective-job-index (misc.cjs, TRD 44-08) uses, so an estimate and execute-objective agree on what is left.
//
// Nothing is rounded here; the CLI (58-08) rounds once, at output. A metric with no data is null and the TRD that lacks
// it is listed in `missing`, never dropped.
//
// An objective estimate is
//   {objective, name, dir, status, parallel, trds: {total, done, remaining}, waves: [{wave, trds, wall_minutes}],
//    trd_estimates, execution, overhead, spent, gap_closure, total, history, wall_basis, confidence, weakest, notes,
//    missing, method}
// where `execution` and `total` are `{wall_minutes, agent_minutes, tokens_input, tokens_output, cost_usd}` with each
// metric `{p50, p90}` or null, `status` is 'done' | 'planned' | 'partial' | 'unplanned' and `trds.remaining` is the
// number of TRDs estimated (every TRD when `all` is set).

const fs = require('fs');
const path = require('path');

const em = require('./estimate-math.cjs');
const est = require('./estimate.cjs');
const { findObjectiveInternal } = require('./objective.cjs');
const { getRoadmapObjectiveInternal } = require('./roadmap.cjs');
const { loadConfig } = require('./config.cjs');
const { trdKey } = require('./helpers.cjs');
const { isCheckpointOnlySummary } = require('./misc.cjs');

const METHOD = Object.freeze({
  within_trd: 'quantiles add (tasks move together)',
  across: 'correlated sum, rho 0.5 (Fenton-Wilkinson)',
  parallel_wave: 'max of independent TRDs',
  gap_closure: 'mixture with calibrated probability',
});

const TOTAL_KEYS = Object.freeze(['wall_minutes', 'agent_minutes', 'tokens_input', 'tokens_output', 'cost_usd']);
// The TRD estimate's metric behind each total, wall time excepted (it comes from the waves).
const TRD_METRIC = Object.freeze({
  agent_minutes: 'minutes',
  tokens_input: 'tokens_input',
  tokens_output: 'tokens_output',
  cost_usd: 'cost_usd',
});

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** `{p50, p90}` of a distribution, null for null. */
const stat = (dist) => (dist === null ? null : em.summarize(dist));

/** A `{wall_minutes, ...}` block with every metric exactly zero (nothing left to do). */
function zeroTotals() {
  const totals = {};
  for (const key of TOTAL_KEYS) totals[key] = { p50: 0, p90: 0 };
  return totals;
}

/** A `{wall_minutes, ...}` block with every metric null (no data). */
function nullTotals() {
  const totals = {};
  for (const key of TOTAL_KEYS) totals[key] = null;
  return totals;
}

// ─── Remaining TRDs ───────────────────────────────────────────────────────────

/**
 * The objective's TRDs that still have work to do, with their text. A TRD is done when a SUMMARY with the same `NN-MM`
 * key exists and is more than a `## Progress` checkpoint (an unreadable SUMMARY counts as complete, as in
 * objective-job-index). With `all` every TRD is returned.
 * @returns {{info:object, trds:{file:string, id:string, text:string}[], done:number, total:number}}
 * @throws {Error} `objective <N> not found`
 */
function remainingTrds(cwd, objective, { all = false } = {}) {
  const info = findObjectiveInternal(cwd, objective);
  if (!info || !info.found) throw new Error(`objective ${objective} not found`);

  const dir = path.resolve(cwd, info.directory);
  const doneKeys = new Set();
  for (const summary of info.summaries) {
    let complete = true;
    try {
      complete = !isCheckpointOnlySummary(fs.readFileSync(path.join(dir, summary), 'utf-8'));
    } catch {
      // unreadable: a SUMMARY file means done, the rule objective-job-index follows
    }
    if (complete) doneKeys.add(trdKey(summary));
  }

  const trds = [];
  let done = 0;
  for (const file of info.jobs) {
    const id = trdKey(file);
    const isDone = doneKeys.has(id);
    if (isDone) done += 1;
    if (isDone && !all) continue;
    const full = path.join(dir, file);
    let text;
    try {
      text = fs.readFileSync(full, 'utf-8');
    } catch (err) {
      throw new Error(`cannot read TRD ${full}: ${err.message}`);
    }
    trds.push({ file: full, id, text });
  }
  return { info, trds, done, total: info.jobs.length };
}

// ─── Execution ────────────────────────────────────────────────────────────────

// Waves in ascending order. A wave with any TRD that lacks the metric has a null wall time.
function groupWaves(trdEstimates, parallel) {
  const byWave = new Map();
  for (const trd of trdEstimates) {
    if (!byWave.has(trd.wave)) byWave.set(trd.wave, []);
    byWave.get(trd.wave).push(trd);
  }
  return [...byWave.keys()].sort((a, b) => a - b).map((wave) => {
    const members = byWave.get(wave);
    const dists = members.map((trd) => em.fitQuantiles(trd.minutes));
    const dist = parallel ? em.maxIndependent(dists) : em.sumCorrelated(dists);
    return { wave, trds: members.map((trd) => trd.id), dist };
  });
}

/**
 * The execution part of an estimate: the waves and, as distributions the caller can compose further, the flat lists
 * behind each total. `wave` lists carry wall time, `trd` lists carry the other metrics.
 */
function executionParts(trdEstimates, parallel) {
  const waves = groupWaves(trdEstimates, parallel);
  const lists = { wall_minutes: waves.map((w) => w.dist) };
  for (const [key, metric] of Object.entries(TRD_METRIC)) {
    lists[key] = trdEstimates.map((trd) => em.fitQuantiles(trd[metric]));
  }
  return { waves, lists };
}

/**
 * Estimates what is left of an objective: its remaining TRDs grouped by wave (see the header).
 * @param {object} cal  a loaded calibration (estimate.loadCalibration().calibration)
 * @param {string} cwd  project root
 * @param {string|number} objective  objective number, as `find-objective` takes it
 * @param {{all?:boolean, parallel?:boolean}} [opts]  `all` also estimates the done TRDs (a backtest); `parallel`
 *   overrides `parallelization` from `.planning/config.json` (true when the file says nothing)
 */
function estimateObjective(cal, cwd, objective, { all = false, parallel } = {}) {
  const found = remainingTrds(cwd, objective, { all });
  const { info } = found;
  const isParallel = typeof parallel === 'boolean' ? parallel : loadConfig(cwd).parallelization !== false;
  const roadmap = getRoadmapObjectiveInternal(cwd, info.objective_number);
  const name = (roadmap && roadmap.objective_name) || info.objective_slug || info.objective_name || String(objective);

  let status;
  if (found.total === 0) status = 'unplanned';
  else if (found.done === found.total) status = 'done';
  else if (found.done > 0) status = 'partial';
  else status = 'planned';

  const result = {
    objective: String(objective),
    name,
    dir: info.directory.split(path.sep).join('/'),
    status,
    parallel: isParallel,
    trds: { total: found.total, done: found.done, remaining: found.trds.length },
    waves: [],
    trd_estimates: [],
    execution: null,
    overhead: [],
    spent: [],
    gap_closure: null,
    total: nullTotals(),
    history: null,
    wall_basis: isParallel ? 'parallel waves' : 'serial waves',
    confidence: 'none',
    weakest: null,
    notes: [],
    missing: [],
    method: METHOD,
  };

  if (found.total === 0) {
    // Estimated from history in Task 2 of this TRD; until then there is no number to give.
    result.wall_basis = 'serial (unplanned)';
    result.notes.push('unplanned: the objective has no TRDs');
    return result;
  }

  if (found.trds.length === 0) {
    result.execution = zeroTotals();
    result.total = zeroTotals();
    result.confidence = 'n/a';
    return result;
  }

  const trdEstimates = found.trds.map((trd) => est.estimateTrdText(cal, trd.text, { id: trd.id, path: trd.file }));
  const parts = executionParts(trdEstimates, isParallel);

  result.waves = parts.waves.map((w) => ({ wave: w.wave, trds: w.trds, wall_minutes: stat(w.dist) }));
  result.trd_estimates = trdEstimates;

  const execution = {};
  for (const key of TOTAL_KEYS) execution[key] = stat(em.sumCorrelated(parts.lists[key]));
  result.execution = execution;
  result.total = { ...execution };

  for (const trd of trdEstimates) {
    if (trd.missing.length > 0) result.missing.push(`${trd.id}: ${trd.missing.join(', ')}`);
  }
  if (all && found.done > 0) result.notes.push(`all: true estimates the done TRDs too (a backtest of ${plural(found.done, 'done TRD')})`);
  const human = trdEstimates.filter((trd) => trd.human_wait).length;
  if (human > 0) result.notes.push(`${plural(human, 'checkpoint TRD')}: human wait not included`);

  const verdict = est.overallConfidence(trdEstimates.map((trd) => ({
    name: trd.id,
    label: trd.confidence,
    p50: trd.minutes === null ? null : trd.minutes.p50,
    class: trd.weakest ? trd.weakest.class : undefined,
    n: trd.weakest ? trd.weakest.n : undefined,
  })));
  result.confidence = verdict.confidence;
  result.weakest = verdict.weakest;
  return result;
}

module.exports = {
  METHOD,
  remainingTrds,
  estimateObjective,
};
