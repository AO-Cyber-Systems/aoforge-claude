#!/usr/bin/env node
'use strict';

// Pre-59 evaluation tool for objective 64 (EST-08, TRD 64-07). It reads a snapshot directory (the repository's
// `.planning` as it stood before objective 59's first commit, extracted with `git archive`), builds calibrations IN
// MEMORY, and writes nothing outside the temporary cut directories it removes in a `finally`. It never touches
// ~/.claude: it does not call `writeCalibration` or `defaultCalibrationPath`, and its CLI refuses any path under
// ~/.claude.
//
// What it does: a rolling-origin sweep of recency windows for `calibrate` (the selection rule is pre-registered in
// 64-DIAGNOSIS.md section 4 and coded here as `selectWindow`), the noise floor of the SC2 test, and the diagnostic
// tables that test the suspects for the minutes bias (eras, task count, class other, duration source, composition).
//
// The statistics are the backtest's: BAND, COVERAGE_TARGET and median come from estimate-backtest.cjs and are never
// redefined here.

const fs = require('fs');
const os = require('os');
const path = require('path');

const ci = require('../plugins/devflow/devflow/bin/lib/calibration-inputs.cjs');
const calibrator = require('../plugins/devflow/devflow/bin/lib/calibrator.cjs');
const est = require('../plugins/devflow/devflow/bin/lib/estimate.cjs');
const em = require('../plugins/devflow/devflow/bin/lib/estimate-math.cjs');
const { BAND, COVERAGE_TARGET, median } = require('../plugins/devflow/devflow/bin/lib/estimate-backtest.cjs');
const { findPlanFiles, trdKey } = require('../plugins/devflow/devflow/bin/lib/helpers.cjs');

// ─── Constants of the pre-registered rule ─────────────────────────────────────

/** Windows whose S differ from the smallest eligible S by at most this resolve to the larger window (section 4). */
const S_TIE = 0.02;
/**
 * `actual <= P90` tolerates floating-point noise of this relative size: a distribution with no spread is rebuilt as
 * exp(log(x)), which can land one ulp below x. The tolerance changes no coverage on real data.
 */
const COVERAGE_EPS = 1e-9;
/** The sample size of the SC2 test (the median of five objectives). */
const SC2_SAMPLE = 5;
/** A TRD of this many minutes or more is "long" in the class-other table (the 45-90 minute adopt-smoke TRDs). */
const LONG_TRD_MINUTES = 45;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const sum = (values) => values.reduce((total, v) => total + v, 0);
const compareStrings = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function covers(actual, p90) {
  return isNum(actual) && isNum(p90) && actual <= p90 * (1 + COVERAGE_EPS);
}

function inBand(ratio) {
  return isNum(ratio) && ratio >= 1 - BAND && ratio <= 1 + BAND;
}

// ─── Ranking and cuts ─────────────────────────────────────────────────────────

/** The numeric prefix of an objective directory name (`12.1-x` is 12.1), or null when it has none. */
function objectiveNumber(name) {
  const m = /^(\d+(?:\.\d+)?)/.exec(String(name));
  return m ? Number(m[1]) : null;
}

/** Directory names ordered by (numeric prefix, name); a name with no number sorts last. The input is not modified. */
function rankObjectives(names) {
  return [...names].sort((a, b) => {
    const na = objectiveNumber(a);
    const nb = objectiveNumber(b);
    if (na === null && nb === null) return compareStrings(a, b);
    if (na === null) return 1;
    if (nb === null) return -1;
    return na - nb || compareStrings(a, b);
  });
}

/** The rule `calibrator.trdSample` returns null on: neither minutes nor both token counts. */
function trdBearsSample(trd) {
  const summary = trd.summary;
  const hasTokens = Boolean(summary) && isNum(summary.tokens_input) && isNum(summary.tokens_output);
  return trd.minutes !== null || hasTokens;
}

/** Objective directories (ranked) with at least one sample-bearing TRD. A directory of TRDs with no SUMMARY is not one. */
function sampleObjectives(project) {
  const dirs = new Set();
  for (const trd of project.trds) {
    if (trdBearsSample(trd)) dirs.add(trd.objective_dir);
  }
  return rankObjectives([...dirs]);
}

/** The last `window` of the ranked objectives; `null` or 'all' keeps all, and a window above the count is all. */
function recentObjectives(ranked, window) {
  if (window === null || window === undefined || window === 'all') return [...ranked];
  if (!Number.isInteger(window) || window < 1) {
    throw new Error(`window must be 'all' or a positive integer, got ${String(window)}`);
  }
  return window >= ranked.length ? [...ranked] : ranked.slice(ranked.length - window);
}

/**
 * Copies into `dest` the objectives a calibration run at `before` would see: sample-bearing objectives numbered below
 * `before`, the last `window` of them (`null` keeps all), plus STATE_ARCHIVE.md and state.json when the snapshot has
 * them (collectProject reads the minutes of a TRD with no SUMMARY duration from there). `dest` always gets a
 * `.planning/objectives` directory so an empty history is still a project. `project` (collectProject of the snapshot) may
 * be passed to avoid reading the snapshot again.
 * @returns {{kept: string[]}}
 */
function cutProject({ snapshotRoot, before, window, dest, project = null }) {
  const proj = project || ci.collectProject(snapshotRoot);
  const below = sampleObjectives(proj).filter((dir) => {
    const n = objectiveNumber(dir);
    return n !== null && n < before;
  });
  const kept = recentObjectives(below, window);
  const planning = path.join(dest, '.planning');
  fs.mkdirSync(path.join(planning, 'objectives'), { recursive: true });
  for (const dir of kept) {
    fs.cpSync(path.join(snapshotRoot, '.planning', 'objectives', dir), path.join(planning, 'objectives', dir), { recursive: true });
  }
  for (const file of ['STATE_ARCHIVE.md', 'state.json']) {
    const src = path.join(snapshotRoot, '.planning', file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(planning, file));
  }
  return { kept };
}

// ─── Rows ─────────────────────────────────────────────────────────────────────

/**
 * One row per autonomous TRD of `dir` that has minutes and a plan file, estimated from its text with `cal`:
 * `{id, k, actual, p50, p90}` (k = non-checkpoint tasks). A TRD whose estimate has no minutes is left out.
 */
function trdRows(cal, snapshotRoot, project, dir) {
  const dirPath = path.join(snapshotRoot, '.planning', 'objectives', dir);
  const planByKey = new Map();
  for (const file of findPlanFiles(fs.readdirSync(dirPath).sort())) {
    const key = trdKey(file);
    if (!planByKey.has(key)) planByKey.set(key, file);
  }
  const rows = [];
  for (const trd of project.trds) {
    if (trd.objective_dir !== dir || !trd.autonomous || trd.minutes === null) continue;
    const file = planByKey.get(trd.id);
    if (file === undefined) continue;
    const estimate = est.estimateTrdText(cal, fs.readFileSync(path.join(dirPath, file), 'utf-8'), { id: trd.id });
    if (estimate.minutes === null) continue;
    rows.push({
      id: trd.id,
      k: estimate.tasks.filter((task) => task.class !== 'checkpoint').length,
      actual: trd.minutes,
      p50: estimate.minutes.p50,
      p90: estimate.minutes.p90,
    });
  }
  return rows;
}

/**
 * The objective row from its TRD rows, composed as estimateObjective composes execution.agent_minutes: a correlated sum
 * (rho 0.5) of the TRD distributions. A TRD row without an estimate is out of the estimate and of the actual alike (the
 * partial-sum rule), so the ratio compares like with like. Null when no TRD row has an estimate.
 */
function objectiveRow(rows) {
  const used = (rows || []).filter((r) => isNum(r.p50));
  if (used.length === 0) return null;
  const stat = em.summarize(em.sumCorrelated(used.map((r) => em.fitQuantiles({ p50: r.p50, p90: r.p90 }))));
  const actual = sum(used.map((r) => r.actual));
  return {
    n_trds: used.length,
    p50: stat.p50,
    p90: stat.p90,
    sum_p50: sum(used.map((r) => r.p50)),
    actual,
    ratio: actual > 0 ? stat.p50 / actual : null,
    covered: covers(actual, stat.p90),
  };
}

function rowCovered(row) {
  return typeof row.covered === 'boolean' ? row.covered : covers(row.actual, row.p90);
}

/**
 * The figures section 4 judges one candidate window on: S = |ln(median objective ratio)|, the objectives in band, the
 * share of objectives and of TRDs whose actual is within P90, and trd_bias = |ln(median TRD ratio)|.
 * @param {{ratio:?number, covered?:boolean}[]} objectiveRows
 * @param {{actual:number, p50:number, p90:number}[]} trds
 */
function summarizeCandidate(objectiveRows, trds) {
  const objs = (objectiveRows || []).filter(Boolean);
  const ratios = objs.map((r) => r.ratio).filter(isNum);
  const medianRatio = median(ratios);
  const usable = (trds || []).filter((r) => isNum(r.p50) && isNum(r.actual) && r.actual > 0);
  const trdMedian = median(usable.map((r) => r.p50 / r.actual));
  const logAbs = (v) => (isNum(v) && v > 0 ? Math.abs(Math.log(v)) : null);
  return {
    n_objectives: objs.length,
    median_ratio: medianRatio,
    s: logAbs(medianRatio),
    in_band: ratios.filter(inBand).length,
    obj_coverage: objs.length === 0 ? null : objs.filter(rowCovered).length / objs.length,
    n_trds: usable.length,
    trd_coverage: usable.length === 0 ? null : usable.filter((r) => covers(r.actual, r.p90)).length / usable.length,
    trd_median_ratio: trdMedian,
    trd_bias: logAbs(trdMedian),
  };
}

// ─── The sweep ────────────────────────────────────────────────────────────────

/**
 * Rolling origin: for every window and every evaluation objective (a directory name), cut the history below the
 * objective, build the calibration in memory (no overhead scan), estimate the objective's TRDs from their text and
 * compare with their minutes. `windows` may contain 'all'. The cut directories are made under `scratchDir` (default the
 * OS temp directory) and removed in a `finally`.
 * @returns {{window:(number|string), objectives:{objective:string, rows:object[], row:?object}[], summary:object}[]}
 */
function rollingSweep({ snapshotRoot, evalObjectives, windows, scratchDir }) {
  const project = ci.collectProject(snapshotRoot);
  const base = scratchDir || os.tmpdir();
  const candidates = [];
  for (const window of windows) {
    const objectives = [];
    for (const objective of evalObjectives) {
      const before = objectiveNumber(objective);
      if (before === null) throw new Error(`evaluation objective "${objective}" has no objective number`);
      const dest = fs.mkdtempSync(path.join(base, 'df-window-cut-'));
      try {
        cutProject({ snapshotRoot, before, window, dest, project });
        const cal = calibrator.buildCalibration({ paths: [dest], transcriptsRoot: null });
        const rows = trdRows(cal, snapshotRoot, project, objective);
        objectives.push({ objective, rows, row: objectiveRow(rows) });
      } finally {
        fs.rmSync(dest, { recursive: true, force: true });
      }
    }
    candidates.push({
      window,
      objectives,
      summary: { window, ...summarizeCandidate(objectives.map((o) => o.row), objectives.flatMap((o) => o.rows)) },
    });
  }
  return candidates;
}

// ─── The selection rule (64-DIAGNOSIS.md section 4) ───────────────────────────

const fixed3 = (v) => (isNum(v) ? v.toFixed(3) : 'n/a');

/**
 * A window other than 'all' is eligible only if obj_coverage >= COVERAGE_TARGET, trd_coverage >= COVERAGE_TARGET,
 * trd_bias <= all's trd_bias, in_band >= all's in_band and S < all's S. The decision is the eligible window with the
 * smallest S; eligible windows whose S is within S_TIE of that smallest S resolve to the larger window. No eligible
 * window is `stop`. Each window carries its `reasons` (what failed), in input order.
 * @param {{window:(number|string), s:?number, in_band:number, obj_coverage:?number, trd_coverage:?number, trd_bias:?number}[]} summaries
 * @returns {{decision:'build_window'|'stop', window:?number, s:?number, reasons:{window:number, eligible:boolean, failed:string[]}[]}}
 */
function selectWindow(summaries) {
  const all = summaries.find((c) => c.window === 'all');
  if (!all) throw new Error("selectWindow needs the 'all' candidate to compare against");
  const reasons = [];
  const eligible = [];
  for (const c of summaries) {
    if (c.window === 'all') continue;
    const failed = [];
    if (!isNum(c.obj_coverage) || c.obj_coverage < COVERAGE_TARGET) {
      failed.push(`objective coverage ${fixed3(c.obj_coverage)} is below ${COVERAGE_TARGET}`);
    }
    if (!isNum(c.trd_coverage) || c.trd_coverage < COVERAGE_TARGET) {
      failed.push(`TRD coverage ${fixed3(c.trd_coverage)} is below ${COVERAGE_TARGET}`);
    }
    if (!isNum(c.trd_bias) || !isNum(all.trd_bias) || c.trd_bias > all.trd_bias) {
      failed.push(`TRD bias ${fixed3(c.trd_bias)} is worse than all's ${fixed3(all.trd_bias)}`);
    }
    if (!isNum(c.in_band) || !isNum(all.in_band) || c.in_band < all.in_band) {
      failed.push(`${c.in_band} objectives in band is fewer than all's ${all.in_band}`);
    }
    if (!isNum(c.s) || !isNum(all.s) || !(c.s < all.s)) {
      failed.push(`S ${fixed3(c.s)} is not below all's ${fixed3(all.s)}`);
    }
    reasons.push({ window: c.window, eligible: failed.length === 0, failed });
    if (failed.length === 0) eligible.push(c);
  }
  if (eligible.length === 0) return { decision: 'stop', window: null, s: null, reasons };
  const smallest = Math.min(...eligible.map((c) => c.s));
  const tied = eligible.filter((c) => c.s - smallest <= S_TIE + 1e-12);
  const chosen = tied.reduce((best, c) => (c.window > best.window ? c : best));
  return { decision: 'build_window', window: chosen.window, s: chosen.s, reasons };
}

// ─── The noise floor ──────────────────────────────────────────────────────────

/**
 * The share of the k-subsets of `ratios` (every one, in index order: no random numbers) whose median lies in
 * [1 - BAND, 1 + BAND]. This is how often an estimator whose per-objective ratios have this spread passes SC2 on a
 * sample of k objectives.
 * @returns {{subsets:number, in_band:number, share:number}|{subsets:0, share:null}}
 */
function noiseFloor(ratios, k) {
  const values = (ratios || []).filter(isNum);
  if (!Number.isInteger(k) || k < 1 || values.length < k) return { subsets: 0, share: null };
  const idx = Array.from({ length: k }, (_, i) => i);
  let subsets = 0;
  let hits = 0;
  for (;;) {
    subsets += 1;
    if (inBand(median(idx.map((i) => values[i])))) hits += 1;
    let i = k - 1;
    while (i >= 0 && idx[i] === values.length - k + i) i -= 1;
    if (i < 0) break;
    idx[i] += 1;
    for (let j = i + 1; j < k; j += 1) idx[j] = idx[j - 1] + 1;
  }
  return { subsets, in_band: hits, share: hits / subsets };
}

module.exports = {
  S_TIE,
  SC2_SAMPLE,
  LONG_TRD_MINUTES,
  objectiveNumber,
  rankObjectives,
  sampleObjectives,
  recentObjectives,
  cutProject,
  trdRows,
  objectiveRow,
  summarizeCandidate,
  rollingSweep,
  selectWindow,
  noiseFloor,
};
