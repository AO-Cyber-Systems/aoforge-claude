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

// The calibration block behind each total, for agent overhead and for trd_level / objective_level history. Overhead
// agents and a gap-closure TRD run one after the other, so their minutes add to wall time and to agent minutes alike.
const CAL_METRIC = Object.freeze({
  wall_minutes: 'minutes',
  agent_minutes: 'minutes',
  tokens_input: 'tokens_input',
  tokens_output: 'tokens_output',
  cost_usd: 'cost_usd',
});

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** `{p50, p90}` of a distribution, null for null. */
const stat = (dist) => (dist === null ? null : em.summarize(dist));

/** `{p50, p90}` of a calibrator stat block's metric when it holds at least one sample, else null. */
function usable(block, metric) {
  const s = isPlainObject(block) ? block[metric] : undefined;
  if (!isPlainObject(s) || !Number.isInteger(s.n) || s.n < 1 || !isNum(s.p50) || !isNum(s.p90)) return null;
  return { p50: s.p50, p90: s.p90 };
}

/** The fitted distribution of total `key` in a calibration block (agent overhead, trd_level, objective_level); null when it has no data. */
const calDist = (block, key) => em.fitQuantiles(usable(block, CAL_METRIC[key]));

/** The fitted distribution of total `key` for an `objectiveOverhead` entry; null when the entry lacks that metric. */
const entryDist = (entry, key) => em.fitQuantiles(entry[CAL_METRIC[key]]);

const levelOf = (label) => est.CONFIDENCE_LEVELS.indexOf(label);

/** `verdict` lowered to `cap` (with `component` as the reason) when it is above it; 'n/a' and lower verdicts are kept. */
function capAt(verdict, cap, component) {
  if (levelOf(verdict.confidence) <= levelOf(cap)) return verdict;
  return { confidence: cap, weakest: component };
}

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

// ─── Agent overhead ───────────────────────────────────────────────────────────

/**
 * What one spawn of each named agent costs, from `cal.agent_overhead`. An agent with no samples (absent from the
 * calibration, or a block of zeros) is not estimated at 0: it is left out of `entries` and named in `missing`
 * (`agent_overhead.<agent>`), so the caller can say what the figure leaves out.
 * @returns {{entries: {agent:string, spawns:1, samples:number, minutes:{p50:number,p90:number},
 *   tokens_input:?object, tokens_output:?object, cost_usd:?object, confidence:string}[], missing: string[]}}
 */
function objectiveOverhead(cal, agents) {
  const table = cal && isPlainObject(cal.agent_overhead) ? cal.agent_overhead : {};
  const entries = [];
  const missing = [];
  for (const agent of agents) {
    const block = table[agent];
    const minutes = usable(block, 'minutes');
    const samples = isPlainObject(block) && Number.isInteger(block.samples) ? block.samples : 0;
    if (minutes === null || samples < 1) {
      missing.push(`agent_overhead.${agent}`);
      continue;
    }
    entries.push({
      agent,
      spawns: 1,
      samples,
      minutes,
      tokens_input: usable(block, 'tokens_input'),
      tokens_output: usable(block, 'tokens_output'),
      cost_usd: usable(block, 'cost_usd'),
      confidence: est.confidenceFor(block.minutes.n),
    });
  }
  return { entries, missing };
}

const agentNames = (missing) => missing.map((m) => m.replace(/^agent_overhead\./, ''));

/** The confidence component of an overhead entry (see estimate.overallConfidence). */
const overheadComponent = (entry) => ({ name: entry.agent, label: entry.confidence, p50: entry.minutes.p50, n: entry.samples });

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

// The calibrated chance that an objective needs a gap-closure cycle, `{probability, n}`, or null when there is none.
function gapProbability(cal) {
  const g = cal && isPlainObject(cal.probabilities) ? cal.probabilities.gap_closure : undefined;
  if (!isPlainObject(g) || !isNum(g.value) || g.value < 0 || g.value > 1 || !Number.isInteger(g.n) || g.n < 1) return null;
  return { probability: g.value, n: g.n };
}

// ─── Unplanned objectives ─────────────────────────────────────────────────────

/**
 * The estimate for an objective with no TRDs (also for a roadmap objective with no directory at all): the
 * `objective_level` history, then a planner, a plan checker and a verifier. Its minutes are serial executor time, so
 * the wall basis is serial. There is no gap-closure mixture: the history already contains the objectives that needed a
 * gap-closure TRD. Confidence is capped at low whatever the sample counts, because nothing has been planned.
 * @param {object} cal  a loaded calibration
 * @param {{objective:string|number, name?:string, dir?:?string, parallel?:?boolean}} where
 */
function estimateUnplanned(cal, { objective, name, dir = null, parallel = null } = {}) {
  const result = {
    objective: String(objective),
    name: name === undefined || name === null ? String(objective) : name,
    dir,
    status: 'unplanned',
    parallel,
    trds: { total: 0, done: 0, remaining: 0 },
    waves: [],
    trd_estimates: [],
    execution: null,
    overhead: [],
    spent: [],
    gap_closure: null,
    total: nullTotals(),
    history: null,
    wall_basis: 'serial (unplanned)',
    confidence: 'none',
    weakest: null,
    notes: [],
    missing: [],
    method: METHOD,
  };

  const level = cal && isPlainObject(cal.objective_level) ? cal.objective_level : null;
  if (usable(level, 'minutes') === null) {
    result.missing.push('objective_level');
    result.notes.push('unplanned: no objective_level history in the calibration; run df-tools calibrate to build it');
    return result;
  }

  const overhead = objectiveOverhead(cal, ['planner', 'job-checker', 'verifier']);
  result.overhead = overhead.entries;
  result.missing.push(...overhead.missing);
  for (const key of TOTAL_KEYS) {
    result.total[key] = stat(em.sumCorrelated([calDist(level, key), ...overhead.entries.map((e) => entryDist(e, key))]));
  }

  const n = level.minutes.n;
  result.history = { objectives: n };
  result.notes.push(`unplanned: estimated from ${plural(n, 'objective')} of history (objective_level), not from a plan`);
  result.notes.push('gap closure: not added; the objective history already includes gap-closure cycles');

  const components = [
    { name: 'objective history', label: est.confidenceFor(n), p50: level.minutes.p50, n },
    ...overhead.entries.map(overheadComponent),
  ];
  let verdict = est.overallConfidence(components);
  verdict = capAt(verdict, 'low', {
    name: 'unplanned (no TRDs)',
    label: 'low',
    p50: result.total.wall_minutes === null ? null : result.total.wall_minutes.p50,
    n,
  });
  result.confidence = verdict.confidence;
  result.weakest = verdict.weakest;
  return result;
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

  if (found.total === 0) return estimateUnplanned(cal, { objective, name, dir: result.dir, parallel: isParallel });

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

  for (const trd of trdEstimates) {
    if (trd.missing.length > 0) result.missing.push(`${trd.id}: ${trd.missing.join(', ')}`);
  }
  if (all && found.done > 0) result.notes.push(`all: true estimates the done TRDs too (a backtest of ${plural(found.done, 'done TRD')})`);
  const human = trdEstimates.filter((trd) => trd.human_wait).length;
  if (human > 0) result.notes.push(`${plural(human, 'checkpoint TRD')}: human wait not included`);

  // Agent overhead. Planning already ran (planner, job-checker): reported as spent, never added. One verifier is still
  // to come. With probability p a gap-closure cycle follows: one more planner, one TRD and one more verifier.
  const gap = gapProbability(cal);
  const overhead = objectiveOverhead(cal, gap === null ? ['verifier'] : ['planner', 'verifier']);
  const verifier = overhead.entries.find((e) => e.agent === 'verifier');
  const planner = overhead.entries.find((e) => e.agent === 'planner');
  result.overhead = verifier ? [verifier] : [];
  result.spent = ['planner', 'job-checker'];
  result.missing.push(...overhead.missing);

  const gapNotes = [];
  if (gap === null) {
    result.notes.push('gap closure: no data');
  } else {
    if (overhead.missing.length > 0) {
      gapNotes.push(`extra cost leaves out agent overhead for ${agentNames(overhead.missing).join(', ')} (no agent_overhead data)`);
    }
    if (usable(cal.trd_level, 'minutes') === null) {
      result.missing.push('trd_level');
      gapNotes.push('extra cost has no trd_level data: the gap-closure TRD is not costed');
    }
  }

  // One flat list per metric: the execution components, then the verifier. The alternative outcome adds the planner,
  // one TRD and a second verifier to that same list.
  const total = {};
  const extra = {};
  for (const key of TOTAL_KEYS) {
    const base = [...parts.lists[key]];
    const cycle = [];
    if (planner) cycle.push(entryDist(planner, key));
    cycle.push(calDist(cal.trd_level, key));
    if (verifier) {
      base.push(entryDist(verifier, key));
      cycle.push(entryDist(verifier, key));
    }
    const baseDist = em.sumCorrelated(base);
    const mixed = baseDist === null ? null : em.mixtureQuantiles(baseDist, em.sumCorrelated([...base, ...cycle]), gap === null ? null : gap.probability);
    total[key] = mixed === null ? null : { p50: mixed.p50, p90: mixed.p90 };
    extra[key] = stat(em.sumCorrelated(cycle));
  }
  result.total = total;
  if (gap !== null) result.gap_closure = { probability: gap.probability, n: gap.n, extra, notes: gapNotes };

  const components = trdEstimates.map((trd) => ({
    name: trd.id,
    label: trd.confidence,
    p50: trd.minutes === null ? null : trd.minutes.p50,
    class: trd.weakest ? trd.weakest.class : undefined,
    n: trd.weakest ? trd.weakest.n : undefined,
  }));
  for (const entry of result.overhead) components.push(overheadComponent(entry));
  if (gap !== null) {
    components.push({
      name: 'gap closure',
      label: est.confidenceFor(gap.n),
      p50: extra.wall_minutes === null ? null : gap.probability * extra.wall_minutes.p50,
      n: gap.n,
    });
  }
  let verdict = est.overallConfidence(components);
  if (overhead.missing.length > 0) {
    verdict = capAt(verdict, 'low', { name: `agent overhead (no data for ${agentNames(overhead.missing).join(', ')})`, label: 'low', p50: null });
  }
  result.confidence = verdict.confidence;
  result.weakest = verdict.weakest;
  return result;
}

module.exports = {
  METHOD,
  objectiveOverhead,
  remainingTrds,
  estimateObjective,
  estimateUnplanned,
};
