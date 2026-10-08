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
// The ranking, the outcome rule and the window itself are the library's (calibration-inputs.cjs, TRD 64-08): the
// calibrator's `window` option and this tool select objectives with the same code, so a calibration with `window: W`
// equals a calibration over a directory cut here.

/** The numeric prefix of an objective directory name (`12.1-x` is 12.1), or null when it has none. */
const { objectiveNumber, rankObjectives } = ci;

/** Objective directories (ranked) with at least one sample-bearing TRD. A directory of TRDs with no SUMMARY is not one. */
function sampleObjectives(project) {
  return rankObjectives([...new Set(project.trds.filter(ci.hasOutcome).map((trd) => trd.objective_dir))]);
}

/**
 * The last `window` of the ranked objectives; `null` or 'all' keeps all, and a window above the count is all. The cut is
 * the library's `windowObjectives`, applied to a project whose every listed objective has an outcome.
 */
function recentObjectives(ranked, window) {
  const project = { trds: ranked.map((dir) => ({ objective_dir: dir, minutes: 0, summary: null })) };
  return ci.windowObjectives(project, window).kept;
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
  const below = {
    ...proj,
    trds: proj.trds.filter((trd) => {
      const n = objectiveNumber(trd.objective_dir);
      return n !== null && n < before;
    }),
  };
  const sampled = new Set(sampleObjectives(below));
  const kept = ci.windowObjectives(below, window).kept.filter((dir) => sampled.has(dir));
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
        // The cut is already windowed; `window: null` keeps the calibrator's default (10 since TRD 64-10) off the cut.
        const cal = calibrator.buildCalibration({ paths: [dest], transcriptsRoot: null, window: null });
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

// ─── Diagnostic tables ────────────────────────────────────────────────────────

const mean = (values) => (values.length === 0 ? null : sum(values) / values.length);

/**
 * TRD rows (ordered by objective) split into `count` consecutive eras of equal size (sizes differ by at most one; the
 * first eras take the extra rows). No hand-picked boundary. Each era names its first and last objective.
 * @param {{objective:string, actual:number, p50:number}[]} rows
 */
function eraTable(rows, count) {
  const list = rows || [];
  const eras = Math.min(count, list.length);
  const out = [];
  let start = 0;
  for (let e = 0; e < eras; e += 1) {
    const size = Math.floor(list.length / eras) + (e < list.length % eras ? 1 : 0);
    const group = list.slice(start, start + size);
    start += size;
    out.push({
      era: e + 1,
      from: group[0].objective,
      to: group[group.length - 1].objective,
      n: group.length,
      median_actual: median(group.map((r) => r.actual)),
      mean_actual: mean(group.map((r) => r.actual)),
      median_p50: median(group.map((r) => r.p50)),
      median_ratio: median(group.map((r) => r.p50 / r.actual)),
      pooled_ratio: sum(group.map((r) => r.actual)) > 0 ? sum(group.map((r) => r.p50)) / sum(group.map((r) => r.actual)) : null,
    });
  }
  return out;
}

const TASK_COUNT_GROUPS = Object.freeze(['1', '2', '3', '4+']);

/** TRD rows grouped by their auto task count (1, 2, 3, 4+); a group with no rows is omitted. */
function taskCountTable(rows) {
  const groups = new Map(TASK_COUNT_GROUPS.map((g) => [g, []]));
  for (const r of rows || []) {
    if (!(r.k >= 1)) continue;
    groups.get(r.k >= 4 ? '4+' : String(r.k)).push(r);
  }
  return TASK_COUNT_GROUPS.filter((g) => groups.get(g).length > 0).map((group) => {
    const list = groups.get(group);
    return {
      group,
      n: list.length,
      median_actual: median(list.map((r) => r.actual)),
      median_p50: median(list.map((r) => r.p50)),
      median_ratio: median(list.map((r) => r.p50 / r.actual)),
    };
  });
}

function isCheckpointTask(task) {
  return typeof task.type === 'string' && task.type.startsWith('checkpoint');
}

function compareTrds(a, b) {
  const na = objectiveNumber(a.objective_dir);
  const nb = objectiveNumber(b.objective_dir);
  return (na === null ? Infinity : na) - (nb === null ? Infinity : nb)
    || compareStrings(a.objective_dir, b.objective_dir)
    || (Number(a.trd) - Number(b.trd))
    || compareStrings(a.id, b.id);
}

/**
 * Class `other` (tasks with no `<files>`): every such task of an autonomous TRD with minutes as `{id, minutes, k,
 * share}` in TRD order (share = TRD minutes / auto tasks, the calibrator's per-task sample), the class's n, p50 and P90
 * from `cal`, and how many of its samples sit in TRDs of LONG_TRD_MINUTES or more.
 */
function otherClassTable(project, cal) {
  const tasks = [];
  for (const trd of [...project.trds].sort(compareTrds)) {
    if (!trd.autonomous || trd.minutes === null) continue;
    const auto = trd.tasks.filter((task) => !isCheckpointTask(task));
    for (const task of auto) {
      if (ci.classifyTask({ files: task.files, tdd: task.tdd, type: task.type, trdType: trd.trd_type }) !== 'other') continue;
      tasks.push({ id: trd.id, minutes: trd.minutes, k: auto.length, share: trd.minutes / auto.length });
    }
  }
  const block = cal && cal.task_classes && cal.task_classes.other && cal.task_classes.other.minutes;
  return {
    tasks,
    n: block && isNum(block.n) ? block.n : 0,
    p50: block && isNum(block.p50) ? block.p50 : null,
    p90: block && isNum(block.p90) ? block.p90 : null,
    in_long_trds: tasks.filter((t) => t.minutes >= LONG_TRD_MINUTES).length,
    long_trd_minutes: LONG_TRD_MINUTES,
  };
}

/**
 * Autonomous TRDs with minutes by where the minutes came from (`summary` duration or STATE_ARCHIVE `metric` row): count
 * and median minutes. With `rows` (in-sample TRD rows) each source also gets the median p50 / actual ratio.
 */
function durationSourceTable(project, rows = null) {
  const bySource = new Map([['summary', []], ['metric', []]]);
  for (const trd of project.trds) {
    if (!trd.autonomous || trd.minutes === null || !bySource.has(trd.duration_source)) continue;
    bySource.get(trd.duration_source).push(trd);
  }
  const ratioById = rows === null ? null : new Map(rows.map((r) => [r.id, r.p50 / r.actual]));
  return ['summary', 'metric'].filter((source) => bySource.get(source).length > 0).map((source) => {
    const list = bySource.get(source);
    const entry = { source, n: list.length, median_minutes: median(list.map((t) => t.minutes)) };
    if (ratioById !== null) entry.median_ratio = median(list.map((t) => ratioById.get(t.id)));
    return entry;
  });
}

/**
 * How TRDs compose into an objective. For objective rows with the sum of TRD medians P, the composed (correlated sum)
 * median F and the actual A: the median and pooled F / P (inflation of the correlated sum over the sum of medians),
 * P / A and F / A.
 * @param {{sum_p50:number, p50:number, actual:number}[]} objectiveRows
 */
function compositionTable(objectiveRows) {
  const list = (objectiveRows || []).filter((r) => r && isNum(r.sum_p50) && r.sum_p50 > 0 && isNum(r.p50) && isNum(r.actual) && r.actual > 0);
  const pooled = (num, den) => (sum(list.map(den)) > 0 ? sum(list.map(num)) / sum(list.map(den)) : null);
  return {
    n: list.length,
    median_inflation: median(list.map((r) => r.p50 / r.sum_p50)),
    median_sum_over_actual: median(list.map((r) => r.sum_p50 / r.actual)),
    pooled_sum_over_actual: pooled((r) => r.sum_p50, (r) => r.actual),
    median_composed_over_actual: median(list.map((r) => r.p50 / r.actual)),
    pooled_composed_over_actual: pooled((r) => r.p50, (r) => r.actual),
  };
}

/** `{class: minutes.n}` for every task class but `all`, sorted by class name. */
function classCounts(cal) {
  const classes = cal && cal.task_classes ? cal.task_classes : {};
  const out = {};
  for (const name of Object.keys(classes).sort()) {
    if (name === 'all') continue;
    const n = classes[name] && classes[name].minutes ? classes[name].minutes.n : 0;
    out[name] = isNum(n) ? n : 0;
  }
  return out;
}

// ─── The report ───────────────────────────────────────────────────────────────

/** The calibration's class counts for the cut a run at `before` would see with `window`. */
function cutClassCounts({ snapshotRoot, before, window, project }) {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'df-window-cut-'));
  try {
    cutProject({ snapshotRoot, before, window, dest, project });
    return classCounts(calibrator.buildCalibration({ paths: [dest], transcriptsRoot: null, window: null }));
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
}

/**
 * Everything 64-DIAGNOSIS.md quotes, as one plain object (unrounded numbers, no path, no timestamp).
 * @param {{snapshotRoot:string, evalObjectives:number[], windows:number[], label:string}} options
 *   `evalObjectives` are objective numbers; those with an autonomous TRD that has minutes are the selection set.
 */
function report({ snapshotRoot, evalObjectives, windows, label }) {
  const project = ci.collectProject(snapshotRoot);

  // In sample: the whole snapshot's calibration against its own TRDs (suspects S1, S2, S4, S5, S6).
  // `window: null`: the whole snapshot, not the calibrator's default of the latest 10 objectives (TRD 64-10).
  const inCal = calibrator.buildCalibration({ paths: [snapshotRoot], transcriptsRoot: null, window: null });
  const inRows = [];
  const inObjectiveRows = [];
  for (const dir of rankObjectives(project.objectives)) {
    const rows = trdRows(inCal, snapshotRoot, project, dir);
    if (rows.length === 0) continue;
    for (const r of rows) inRows.push({ objective: dir, ...r });
    inObjectiveRows.push(objectiveRow(rows));
  }

  const withMinutes = new Set(project.trds.filter((t) => t.autonomous && t.minutes !== null).map((t) => t.objective_dir));
  const evalDirs = rankObjectives([...withMinutes]).filter((dir) => evalObjectives.includes(objectiveNumber(dir)));
  if (evalDirs.length === 0) throw new Error('no objective of the snapshot with TRD minutes matches the evaluation objectives');

  const candidates = rollingSweep({ snapshotRoot, evalObjectives: evalDirs, windows: ['all', ...windows] });
  const selection = selectWindow(candidates.map((c) => c.summary));
  const ratiosOf = (c) => c.objectives.map((o) => o.row).filter(Boolean).map((r) => r.ratio).filter(isNum);
  const allCandidate = candidates.find((c) => c.window === 'all');
  const chosen = selection.window === null ? null : candidates.find((c) => c.window === selection.window);

  const last = evalDirs[evalDirs.length - 1];
  const before = objectiveNumber(last);
  return {
    label,
    eval: { numbers: [...evalObjectives], objectives: evalDirs },
    grid: [...windows],
    eras: eraTable(inRows, 4),
    task_count: taskCountTable(inRows),
    other_class: otherClassTable(project, inCal),
    duration_source: durationSourceTable(project, inRows),
    composition: {
      in_sample: compositionTable(inObjectiveRows),
      rolling_all: compositionTable(allCandidate.objectives.map((o) => o.row)),
    },
    candidates,
    selection,
    noise_floor: {
      k: SC2_SAMPLE,
      all: noiseFloor(ratiosOf(allCandidate), SC2_SAMPLE),
      chosen: chosen === null ? null : { window: chosen.window, ...noiseFloor(ratiosOf(chosen), SC2_SAMPLE) },
    },
    class_counts: {
      objective: before,
      w10: cutClassCounts({ snapshotRoot, before, window: 10, project }),
      w5: cutClassCounts({ snapshotRoot, before, window: 5, project }),
    },
  };
}

// ─── Markdown ─────────────────────────────────────────────────────────────────

const f1 = (v) => (isNum(v) ? v.toFixed(1) : 'n/a');
const f2 = (v) => (isNum(v) ? v.toFixed(2) : 'n/a');
const f3 = (v) => (isNum(v) ? v.toFixed(3) : 'n/a');
const pct = (v) => (isNum(v) ? `${(v * 100).toFixed(1)}%` : 'n/a');
const objectiveLabel = (dir) => {
  const n = objectiveNumber(dir);
  return n === null ? dir : String(n);
};

function table(headers, rows) {
  if (rows.length === 0) return ['(none)'];
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((cells) => `| ${cells.join(' | ')} |`),
  ];
}

/** The report as markdown: ratios with 2 decimals, S with 3. */
function formatReport(result) {
  const lines = [];
  const section = (title, ...body) => lines.push(`### ${title}`, '', ...body, '');

  section('Eras (S1)',
    'In-sample TRDs (the whole snapshot\'s calibration against its own TRDs), in objective order, in equal-count eras.', '',
    ...table(['Era', 'Objectives', 'TRDs', 'Median actual', 'Mean actual', 'Median p50', 'Median ratio', 'Pooled ratio'],
      result.eras.map((e) => [e.era, e.from === e.to ? objectiveLabel(e.from) : `${objectiveLabel(e.from)} to ${objectiveLabel(e.to)}`,
        e.n, f1(e.median_actual), f1(e.mean_actual), f1(e.median_p50), f2(e.median_ratio), f2(e.pooled_ratio)])));

  section('Task count (S5)',
    ...table(['Tasks per TRD', 'TRDs', 'Median actual', 'Median p50', 'Median ratio'],
      result.task_count.map((g) => [g.group, g.n, f1(g.median_actual), f1(g.median_p50), f2(g.median_ratio)])));

  const other = result.other_class;
  section('Class other (S4)',
    `Class other: n ${other.n}, p50 ${f1(other.p50)}, P90 ${f1(other.p90)} minutes per task; ${other.in_long_trds} of its ${other.tasks.length} tasks sit in TRDs of ${other.long_trd_minutes} minutes or more.`, '',
    ...table(['TRD', 'TRD minutes', 'Tasks (k)', 'Share'], other.tasks.map((t) => [t.id, f1(t.minutes), t.k, f1(t.share)])));

  section('Duration source (S2)',
    ...table(['Source', 'TRDs', 'Median minutes', 'Median ratio'],
      result.duration_source.map((d) => [d.source, d.n, f1(d.median_minutes), f2(d.median_ratio)])));

  const compositionRow = (name, c) => [name, c.n, f2(c.median_inflation), f2(c.median_sum_over_actual), f2(c.pooled_sum_over_actual),
    f2(c.median_composed_over_actual), f2(c.pooled_composed_over_actual)];
  section('Composition (S6)',
    'P is the sum of the TRD medians, F the correlated-sum median of the objective, A the actual.', '',
    ...table(['Basis', 'Objectives', 'Median F/P', 'Median P/A', 'Pooled P/A', 'Median F/A', 'Pooled F/A'],
      [compositionRow('in sample', result.composition.in_sample), compositionRow('rolling, all history', result.composition.rolling_all)]));

  const sel = result.selection;
  section('Selection',
    `Evaluation objectives: ${result.eval.objectives.map(objectiveLabel).join(', ')}.`, '',
    ...table(['Window', 'S', 'In band', 'Obj coverage', 'TRD coverage', 'TRD bias', 'Median ratio', 'Per-objective ratios'],
      result.candidates.map((c) => [c.window, f3(c.summary.s), `${c.summary.in_band} of ${c.summary.n_objectives}`,
        f2(c.summary.obj_coverage), f2(c.summary.trd_coverage), f3(c.summary.trd_bias), f2(c.summary.median_ratio),
        c.objectives.map((o) => `${objectiveLabel(o.objective)}: ${o.row ? f2(o.row.ratio) : 'n/a'}`).join(', ')])), '',
    `decision: ${sel.decision}`,
    ...(sel.decision === 'build_window' ? [`window_objectives: ${sel.window}`] : []), '',
    ...table(['Window', 'Eligible', 'Failed conditions'], sel.reasons.map((r) => [r.window, r.eligible ? 'yes' : 'no', r.failed.join('; ') || 'none'])));

  const nf = result.noise_floor;
  const floorRow = (name, f) => [name, f.subsets, f.in_band === undefined ? 'n/a' : f.in_band, pct(f.share)];
  section('Noise floor',
    `Share of the ${nf.k}-objective subsets of the per-objective ratios whose median lies in the band (the SC2 test on a random sample).`, '',
    ...table(['Ratios of', `${nf.k}-subsets`, 'Median in band', 'Share'],
      [floorRow('all history', nf.all), ...(nf.chosen ? [floorRow(`window ${nf.chosen.window}`, nf.chosen)] : [])]));

  const counts = result.class_counts;
  const names = [...new Set([...Object.keys(counts.w10), ...Object.keys(counts.w5)])].sort();
  const cell = (map, name) => {
    const n = name in map ? map[name] : 0;
    return n < est.MIN_CLASS_SAMPLES ? `${n} (below ${est.MIN_CLASS_SAMPLES})` : String(n);
  };
  section('Class sample counts',
    `Task classes with minutes samples in the calibration at the cut before objective ${counts.objective}.`, '',
    ...table(['Class', 'W=10', 'W=5'], names.map((name) => [name, cell(counts.w10, name), cell(counts.w5, name)])));

  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const USAGE = 'usage: estimate-window-eval.cjs report --snapshot <dir> [--eval 46-58|46,47,...] [--grid 10,15,20,30,40] [--label text] [--json <file>] [--raw]';
const DEFAULT_EVAL = '46-58';
const DEFAULT_GRID = '10,15,20,30,40';
const VALUE_FLAGS = new Set(['--snapshot', '--eval', '--grid', '--label', '--json']);

class UsageError extends Error {}

function realpathOrSelf(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return p; // a path that does not exist yet is compared as written
  }
}

/** True when `p` is `<home>/.claude` or inside it (also through a symlink). `home` defaults to the user's home. */
function isUnderClaudeHome(p, home = os.homedir()) {
  const claudes = new Set([path.join(path.resolve(home), '.claude')]);
  claudes.add(realpathOrSelf([...claudes][0]));
  const resolved = path.resolve(p);
  return [resolved, realpathOrSelf(resolved)].some((candidate) => [...claudes].some((c) => candidate === c || candidate.startsWith(c + path.sep)));
}

function parseNumberList(text, flag) {
  if (!/^\d+(,\d+)*$/.test(text)) throw new UsageError(`${flag} must be a comma-separated list of positive integers, got "${text}"`);
  const values = text.split(',').map(Number);
  if (values.some((v) => v < 1)) throw new UsageError(`${flag} must be positive integers, got "${text}"`);
  return [...new Set(values)].sort((a, b) => a - b);
}

function parseEval(text) {
  const range = /^(\d+)-(\d+)$/.exec(text);
  if (range) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    if (lo > hi) throw new UsageError(`--eval range ${text} runs backwards`);
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }
  return parseNumberList(text, '--eval');
}

function parseArgs(argv) {
  if (argv.length === 0) throw new UsageError('no subcommand');
  const [command, ...rest] = argv;
  if (command !== 'report') throw new UsageError(`unknown subcommand "${command}"`);
  const options = { snapshot: null, eval: DEFAULT_EVAL, grid: DEFAULT_GRID, label: 'snapshot', json: null, raw: false };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--raw') {
      options.raw = true;
    } else if (VALUE_FLAGS.has(arg)) {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`${arg} needs a value`);
      options[arg.slice(2)] = value;
      i += 1;
    } else {
      throw new UsageError(arg.startsWith('--') ? `unknown flag ${arg}` : `unexpected argument "${arg}"`);
    }
  }
  if (options.snapshot === null) throw new UsageError('report needs --snapshot <dir>');
  options.evalList = parseEval(options.eval);
  options.gridList = parseNumberList(options.grid, '--grid');
  return options;
}

function isProjectDir(dir) {
  try {
    return fs.statSync(path.join(dir, '.planning', 'objectives')).isDirectory();
  } catch {
    return false; // absent or unreadable: not a snapshot
  }
}

/** Runs the CLI; returns the exit code (0 ok, 1 usage or run error). `io` may carry stdout and stderr writers. */
function main(argv, io = {}) {
  const out = io.stdout || process.stdout;
  const err = io.stderr || process.stderr;
  try {
    const options = parseArgs(argv);
    for (const [flag, value] of [['--snapshot', options.snapshot], ['--json', options.json]]) {
      if (value !== null && isUnderClaudeHome(value)) throw new UsageError(`${flag} refuses a path under ~/.claude`);
    }
    if (!isProjectDir(options.snapshot)) throw new UsageError('--snapshot must be a directory that holds .planning/objectives');

    const result = report({ snapshotRoot: path.resolve(options.snapshot), evalObjectives: options.evalList, windows: options.gridList, label: options.label });
    const json = `${JSON.stringify(result, null, 2)}\n`;
    if (options.json !== null) fs.writeFileSync(options.json, json);
    out.write(options.raw ? formatReport(result) : json);
    return 0;
  } catch (e) {
    err.write(`estimate-window-eval: ${e.message}\n`);
    if (e instanceof UsageError) err.write(`${USAGE}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
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
  eraTable,
  taskCountTable,
  otherClassTable,
  durationSourceTable,
  compositionTable,
  classCounts,
  report,
  formatReport,
  isUnderClaudeHome,
  parseArgs,
  main,
};
