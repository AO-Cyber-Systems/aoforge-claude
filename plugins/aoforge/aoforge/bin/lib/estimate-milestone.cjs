'use strict';

// The milestone layer of the estimator (TRD 58-07, EST-03). A milestone's scope is the ROADMAP.md bullet this repo and
// templates/roadmap.md write under `## Milestones`:
//
//   - 🚧 **v1.5 — Gate & Plumbing** — Objectives 55–64 (in progress)
//   - ✅ **v1.1 — AOForge Coordination Layer** — Objectives 0–9, 6, 8, 24 (shipped 2026-05-06)
//
// The selection (which objectives the bullet covers) lives in milestone-scope.cjs since TRD 59-04, shared with
// `milestone complete`; this module re-exports it.
//
// A milestone estimate composes what is left of its objectives. Done and cancelled (OBJECTIVE.md `status: cancelled`)
// objectives are counted and left out; a planned or partial objective is estimated from its remaining TRDs
// (estimate-rollup.cjs estimateObjective), an objective with no TRDs, or only a ROADMAP section, from the unplanned
// fallback (estimateUnplanned). Objectives run one after another, so each metric of the total is one correlated sum of
// the objectives' fitted totals plus one integration-checker spawn, in one flat list (estimate-math: nesting a
// correlated sum inside another is not associative). Nothing is rounded here; the CLI (58-08) rounds once, at output.
//
// A milestone estimate is
//   {version, name, range_source, objectives, counts, overhead, total, confidence, weakest, notes, missing, method}
// where each of `objectives` is {number, name, dir, status, trds, total, confidence, weakest} (`total` is null for a
// done or cancelled objective, `trds` also for a cancelled one), `counts` is {done, planned, partial, unplanned,
// cancelled, absent}, `overhead` lists the integration-checker entry (estimate-rollup objectiveOverhead) and `total` is
// {wall_minutes, agent_minutes, tokens_input, tokens_output, cost_usd}, each `{p50, p90}` or null (no data).

const em = require('./estimate-math.cjs');
const est = require('./estimate.cjs');
const rollup = require('./estimate-rollup.cjs');
const { milestoneObjectiveNumbers, selectMilestoneObjectives } = require('./milestone-scope.cjs');
const { loadConfig } = require('./config.cjs');

// ─── The estimate ─────────────────────────────────────────────────────────────

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The note that says an unplanned objective is estimated from history, not from a plan (or that there is no history). */
function unplannedNote(entry, estimate) {
  const where = entry.dir === null ? 'in the ROADMAP but has no directory yet' : 'unplanned (no TRDs)';
  const how = estimate.history === null
    ? 'no objective_level history to estimate from'
    : `estimated from ${plural(estimate.history.objectives, 'objective')} of history, not from a plan`;
  return `${entry.number} (${entry.name}): ${where}; ${how}`;
}

/**
 * Estimates what is left of a milestone: its remaining objectives plus one integration checker (see the header).
 * @param {object} cal  a loaded calibration (estimate.loadCalibration().calibration)
 * @param {string} cwd  project root
 * @param {{version?: string, parallel?: boolean}} [opts]  `version` names the milestone ('v1.0' or '1.0'; the current
 *   one when omitted); `parallel` overrides `parallelization` from `.aoforge/config.json` for every objective
 * @throws {Error} what selectMilestoneObjectives throws
 */
function estimateMilestone(cal, cwd, { version, parallel } = {}) {
  const selection = selectMilestoneObjectives(cwd, { version });
  const isParallel = typeof parallel === 'boolean' ? parallel : loadConfig(cwd).parallelization !== false;

  const counts = { done: 0, planned: 0, partial: 0, unplanned: 0, cancelled: 0, absent: selection.absent.length };
  const objectives = [];
  const remaining = []; // the entries that still cost something, with the estimate behind each
  const notes = [];
  const missing = [];

  for (const o of selection.objectives) {
    if (o.status_hint === 'cancelled') {
      counts.cancelled += 1;
      objectives.push({ number: o.number, name: o.name, dir: o.dir, status: 'cancelled', trds: null, total: null, confidence: 'n/a', weakest: null });
      continue;
    }
    // An objective with no directory is a section only: it has nothing to read TRDs from, so it goes straight to the
    // unplanned fallback (estimateObjective throws for it).
    const estimate = o.status_hint === 'no_dir'
      ? rollup.estimateUnplanned(cal, { objective: o.number, name: o.name, dir: null, parallel: isParallel })
      : rollup.estimateObjective(cal, cwd, o.number, { parallel: isParallel });
    counts[estimate.status] += 1;
    const entry = {
      number: o.number,
      name: estimate.name,
      dir: estimate.dir,
      status: estimate.status,
      trds: estimate.trds,
      total: estimate.status === 'done' ? null : estimate.total,
      confidence: estimate.confidence,
      weakest: estimate.weakest,
    };
    objectives.push(entry);
    if (estimate.status === 'done') continue;

    remaining.push({ entry, estimate });
    if (estimate.status === 'unplanned') notes.push(unplannedNote(entry, estimate));
    for (const m of estimate.missing) missing.push(`${entry.number}: ${m}`);
  }

  let overhead = [];
  let total = rollup.zeroTotals();
  let verdict = { confidence: 'n/a', weakest: null };

  if (remaining.length === 0) {
    notes.unshift('no objectives left');
  } else {
    // One integration checker audits the milestone after its last objective.
    const agent = rollup.objectiveOverhead(cal, ['integration-checker']);
    overhead = agent.entries;
    missing.push(...agent.missing);

    total = {};
    for (const key of rollup.TOTAL_KEYS) {
      const parts = remaining.map(({ entry }) => em.fitQuantiles(entry.total[key]));
      for (const e of overhead) parts.push(rollup.entryDist(e, key));
      total[key] = rollup.stat(em.sumCorrelated(parts));
    }

    const components = remaining.map(({ entry }) => ({
      name: entry.number,
      label: entry.confidence,
      p50: entry.total.wall_minutes === null ? null : entry.total.wall_minutes.p50,
      status: entry.status,
    }));
    for (const e of overhead) components.push(rollup.overheadComponent(e));
    verdict = est.overallConfidence(components);
    if (agent.missing.length > 0) {
      verdict = rollup.capAt(verdict, 'low', { name: 'agent overhead (no data for integration-checker)', label: 'low', p50: null });
    }
  }

  if (selection.absent.length > 0) {
    notes.push(`${plural(selection.absent.length, 'number')} in the milestone range have no objective directory or ROADMAP section (killed or never created): ${selection.absent.join(', ')}`);
  }

  return {
    version: selection.version,
    name: selection.name,
    range_source: selection.range_source,
    objectives,
    counts,
    overhead,
    total,
    confidence: verdict.confidence,
    weakest: verdict.weakest,
    notes,
    missing,
    method: rollup.METHOD,
  };
}

module.exports = {
  milestoneObjectiveNumbers,
  selectMilestoneObjectives,
  estimateMilestone,
};
