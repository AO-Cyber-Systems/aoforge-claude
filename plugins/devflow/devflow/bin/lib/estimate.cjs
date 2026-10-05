'use strict';

// The estimator's core (TRD 58-05, EST-02 and the TRD layer of EST-03). Reads calibration.json, classifies a task with
// the calibrator's own classifier (calibration-inputs.classifyTask, so a calibrate/estimate class can never drift
// apart) and returns its median and P90 minutes, tokens and dollars with a sample count and a confidence label.
//
// Honesty rules:
//   - Confidence comes from sample counts: high >= 30, medium 10-29, low 1-9, none 0.
//   - A class with fewer than MIN_CLASS_SAMPLES samples for a metric uses the all-tasks figures for that metric. The
//     result says so (`basis: 'all'`, `class_samples`, a note) and is capped at low, however large `all` is.
//   - No data, no number: a missing or unusable calibration is `{ok: false, reason}` and a metric with no samples
//     anywhere is null and listed in `missing`. Nothing defaults to 0 or to another metric.
//   - Nothing is rounded here; the CLI rounds once, at output.
//
//   - Tasks inside one TRD add quantile by quantile (estimate-math.sumComonotonic): calibration split each TRD's
//     outcome equally across its tasks, so they move together by construction.
//
// A stat is `{p50, p90, n}`; a task estimate is
//   {class, classifier_version, basis, class_samples, minutes, tokens_input, tokens_output, cost_usd, samples,
//    confidence, human_wait, notes, missing}
// where each metric is a stat or null, `samples` is the smallest n among the present metrics, `basis` is 'class' or
// 'all', and a checkpoint task is `{class: 'checkpoint', human_wait: true, every metric {p50: 0, p90: 0}, confidence:
// 'n/a', basis/class_samples/samples null}`.
//
// A TRD estimate is
//   {id, path, wave, depends_on, autonomous, gap_closure, trd_type, tasks: [{name, ...task estimate}], minutes,
//    tokens_input, tokens_output, cost_usd, confidence, weakest, human_wait, notes, missing}
// where each metric is `{p50, p90}` (no n) or null and `missing` lists the null ones. A TRD's confidence is the lowest
// label among the tasks worth at least 10% of its median minutes (overallConfidence) and `weakest` is that task's
// component `{name, label, p50, class, n}`. 58-06 and 58-07 build on both shapes, and on the component shape
// `{name, label, p50, class?, n?, status?}` that overallConfidence takes.

const fs = require('fs');
const path = require('path');

const ci = require('./calibration-inputs.cjs');
const calibrator = require('./calibrator.cjs');
const em = require('./estimate-math.cjs');
const { findObjectiveInternal } = require('./objective.cjs');
const { trdKey } = require('./helpers.cjs');

const CONFIDENCE_LEVELS = Object.freeze(['none', 'low', 'medium', 'high']);
const MIN_CLASS_SAMPLES = 5;
const MEDIUM_SAMPLES = 10;
const HIGH_SAMPLES = 30;
const SUPPORTED_VERSIONS = Object.freeze([1, 2]);
const METRICS = Object.freeze(['minutes', 'tokens_input', 'tokens_output', 'cost_usd']);
const SHARE_FLOOR = 0.1; // a component must carry this share of the median minutes to lower an overall confidence
const NO_SAMPLES = 'no samples for ';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isCount = (x) => Number.isInteger(x) && x >= 0;

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// ─── Confidence ───────────────────────────────────────────────────────────────

/** 'none' for 0 (or no) samples, 'low' for 1-9, 'medium' for 10-29, 'high' for 30 and more. */
function confidenceFor(n) {
  if (!isCount(n) || n < 1) return 'none';
  if (n >= HIGH_SAMPLES) return 'high';
  if (n >= MEDIUM_SAMPLES) return 'medium';
  return 'low';
}

// ─── Loading ──────────────────────────────────────────────────────────────────

/**
 * Reads and checks a calibration file: `file`, else DEVFLOW_CALIBRATION_PATH, else ~/.claude/devflow/calibration.json.
 * Never throws; every way it can be unusable is a `reason` that names the fix.
 * @returns {{ok:true, calibration:object, path:string} | {ok:false, reason:string}}
 */
function loadCalibration(file, env = process.env) {
  const target = file || calibrator.defaultCalibrationPath(env);
  const unreadable = (why) => ({ ok: false, reason: `calibration file ${target} is unreadable (${why}); run df-tools calibrate to rebuild it` });

  let text;
  try {
    text = fs.readFileSync(target, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { ok: false, reason: `no calibration file at ${target}; run df-tools calibrate to build it` };
    }
    return unreadable(err.message);
  }

  let calibration;
  try {
    calibration = JSON.parse(text);
  } catch (err) {
    return unreadable(err.message);
  }
  if (!isPlainObject(calibration)) return unreadable('not a JSON object');

  if (!SUPPORTED_VERSIONS.includes(calibration.version)) {
    return {
      ok: false,
      reason: `calibration file ${target} is calibration version ${String(calibration.version)}, but this estimator reads versions ${SUPPORTED_VERSIONS.join(' and ')}; update DevFlow or run df-tools calibrate`,
    };
  }
  if (calibration.classifier_version !== ci.CLASSIFIER_VERSION) {
    return {
      ok: false,
      reason: `calibration file ${target} was built with classifier version ${String(calibration.classifier_version)}, but this estimator classifies tasks with version ${ci.CLASSIFIER_VERSION}; run df-tools calibrate to rebuild it`,
    };
  }
  if (!isPlainObject(calibration.task_classes) || !isPlainObject(calibration.task_classes.all)) {
    return unreadable('no task_classes.all block');
  }
  return { ok: true, calibration, path: target };
}

// ─── Task estimates ───────────────────────────────────────────────────────────

// The stat of one metric when it holds at least one sample, else null.
function usableStat(block, metric) {
  const s = isPlainObject(block) ? block[metric] : undefined;
  if (!isPlainObject(s) || !isCount(s.n) || s.n < 1 || !isNum(s.p50) || !isNum(s.p90)) return null;
  return { p50: s.p50, p90: s.p90, n: s.n };
}

/**
 * One metric of one class: the class's own stat when it has at least MIN_CLASS_SAMPLES, else the all-tasks stat
 * (`basis: 'all'`), else null when `all` has no samples either. `class_n` is the class's own count, whatever was used.
 * @returns {{stat: ?{p50:number,p90:number,n:number}, basis: 'class'|'all', class_n: number}}
 */
function metricFor(cal, cls, metric) {
  const own = usableStat(cal.task_classes[cls], metric);
  const classN = own === null ? 0 : own.n;
  if (own !== null && own.n >= MIN_CLASS_SAMPLES) return { stat: own, basis: 'class', class_n: classN };
  return { stat: usableStat(cal.task_classes.all, metric), basis: 'all', class_n: classN };
}

function checkpointEstimate() {
  const zero = () => ({ p50: 0, p90: 0 });
  return {
    class: 'checkpoint',
    classifier_version: ci.CLASSIFIER_VERSION,
    basis: null,
    class_samples: null,
    minutes: zero(),
    tokens_input: zero(),
    tokens_output: zero(),
    cost_usd: zero(),
    samples: null,
    confidence: 'n/a',
    human_wait: true,
    notes: [],
    missing: [],
  };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The estimate for one task. `task` is `{files, tdd, type, trdType}` (classified with the calibrator's classifier) or
 * `{class}` (one of TASK_CLASSES). Throws on an unknown class. A `checkpoint:*` task is a human wait and adds nothing.
 */
function estimateTask(cal, task) {
  if (!cal || !isPlainObject(cal.task_classes)) {
    throw new Error('estimateTask needs a calibration loaded with loadCalibration');
  }
  const t = task || {};
  let cls;
  if (t.class !== undefined) {
    if (!ci.TASK_CLASSES.includes(t.class)) {
      throw new Error(`unknown task class "${t.class}"; valid classes: ${ci.TASK_CLASSES.join(', ')}`);
    }
    cls = t.class;
  } else {
    cls = ci.classifyTask(t);
  }
  if (cls === 'checkpoint') return checkpointEstimate();

  const block = cal.task_classes[cls];
  const classSamples = isPlainObject(block) && isCount(block.samples) ? block.samples : 0;

  const result = {
    class: cls,
    classifier_version: ci.CLASSIFIER_VERSION,
    basis: 'class',
    class_samples: classSamples,
  };
  const fellBack = new Map(); // the class's own sample count -> metrics that fell back at that count
  const missing = [];
  let smallest = null;
  for (const metric of METRICS) {
    const m = metricFor(cal, cls, metric);
    result[metric] = m.stat;
    if (m.stat === null) {
      missing.push(metric);
      continue;
    }
    smallest = smallest === null ? m.stat.n : Math.min(smallest, m.stat.n);
    if (m.basis === 'all') {
      result.basis = 'all';
      if (!fellBack.has(m.class_n)) fellBack.set(m.class_n, []);
      fellBack.get(m.class_n).push(metric);
    }
  }

  const notes = [];
  for (const [n, metrics] of fellBack) {
    notes.push(`class ${cls} has ${plural(n, 'sample')} for ${metrics.join(', ')} (fewer than ${MIN_CLASS_SAMPLES}); used the all-task figures`);
  }
  if (missing.length > 0) notes.push(`${NO_SAMPLES}${missing.join(', ')}`);

  const samples = smallest === null ? 0 : smallest;
  let level = CONFIDENCE_LEVELS.indexOf(confidenceFor(samples));
  if (result.basis === 'all') level = Math.min(level, CONFIDENCE_LEVELS.indexOf('low'));

  result.samples = samples;
  result.confidence = CONFIDENCE_LEVELS[level];
  result.human_wait = false;
  result.notes = notes;
  result.missing = missing;
  return result;
}

// ─── Overall confidence ───────────────────────────────────────────────────────

/**
 * The confidence of a whole built from `components` (`{name, label, p50, class?, n?, status?}`): the lowest label among
 * the components that carry at least SHARE_FLOOR of the summed median minutes, with that component as `weakest` (the
 * object itself). A component with no p50 has an unknown share, so it always counts; when the total is zero or null
 * every component counts. 'n/a' components (checkpoints) are ignored. A tie goes to the larger p50, then to the earlier
 * component. With nothing to judge the answer is `{confidence: 'n/a', weakest: null}`.
 */
function overallConfidence(components) {
  const list = (Array.isArray(components) ? components : []).filter((c) => c && CONFIDENCE_LEVELS.includes(c.label));
  if (list.length === 0) return { confidence: 'n/a', weakest: null };

  const total = list.reduce((sum, c) => (isNum(c.p50) && c.p50 > 0 ? sum + c.p50 : sum), 0);
  const counted = total > 0 ? list.filter((c) => !isNum(c.p50) || c.p50 / total >= SHARE_FLOOR) : list;

  let weakest = null;
  let weakestLevel = Infinity;
  let weakestWeight = -Infinity;
  for (const c of counted) {
    const level = CONFIDENCE_LEVELS.indexOf(c.label);
    const weight = isNum(c.p50) ? c.p50 : -1;
    if (level < weakestLevel || (level === weakestLevel && weight > weakestWeight)) {
      weakest = c;
      weakestLevel = level;
      weakestWeight = weight;
    }
  }
  return { confidence: CONFIDENCE_LEVELS[weakestLevel], weakest };
}

// ─── TRD estimates ────────────────────────────────────────────────────────────

// readTrdTasks hands back the frontmatter's raw values, which may be strings ('false', '1').
function normalizeFrontmatter(raw) {
  const fm = isPlainObject(raw) ? raw : {};
  return {
    type: typeof fm.type === 'string' && fm.type !== '' ? fm.type : null,
    wave: parseInt(fm.wave, 10) || 1,
    depends_on: Array.isArray(fm.depends_on) ? fm.depends_on.map(String) : [],
    autonomous: !(fm.autonomous === false || fm.autonomous === 'false'),
    gap_closure: fm.gap_closure === true || fm.gap_closure === 'true',
  };
}

/**
 * The estimate for a TRD's text: each task through estimateTask, then the auto tasks added quantile by quantile.
 * Checkpoint tasks add nothing and mark the TRD as excluding human wait. A metric any auto task lacks is null and
 * listed in `missing`; a TRD with no auto tasks has every metric null and confidence 'none'.
 * @param {object} cal  a loaded calibration (loadCalibration().calibration)
 * @param {string} text  the TRD file's text
 * @param {{id?:string, path?:string}} [where]  carried into the result so callers can name the TRD
 */
function estimateTrdText(cal, text, where = {}) {
  const parsed = ci.readTrdTasks(text);
  const fm = normalizeFrontmatter(parsed.frontmatter);
  const notes = [];
  if (parsed.task_files_misaligned) {
    notes.push('task <files> elements do not line up with the tasks; every task is classed from no files');
  }

  const tasks = parsed.tasks.map((task) => ({
    name: task.name,
    ...estimateTask(cal, { files: task.files, tdd: task.tdd, type: task.type, trdType: fm.type || undefined }),
  }));
  const auto = tasks.filter((t) => t.class !== 'checkpoint');
  const humanWait = !fm.autonomous || tasks.some((t) => t.human_wait);

  const totals = {};
  const missing = [];
  for (const metric of METRICS) {
    totals[metric] = auto.length === 0
      ? null
      : em.summarize(em.sumComonotonic(auto.map((t) => em.fitQuantiles(t[metric]))));
    if (totals[metric] === null) missing.push(metric);
  }

  // A missing metric is reported once for the TRD, not once per task.
  for (const t of tasks) {
    for (const note of t.notes) if (!note.startsWith(NO_SAMPLES)) notes.push(`${t.name}: ${note}`);
  }
  if (auto.length === 0) notes.push('no auto tasks');
  else if (missing.length > 0) notes.push(`${NO_SAMPLES}${missing.join(', ')}`);
  if (humanWait) notes.push('human wait not included');

  let verdict = { confidence: 'none', weakest: null };
  if (auto.length > 0) {
    verdict = overallConfidence(tasks.map((t) => ({
      name: t.name,
      label: t.confidence,
      p50: t.minutes === null ? null : t.minutes.p50,
      class: t.class,
      n: t.samples,
    })));
  }

  return {
    id: where.id || null,
    path: where.path || null,
    wave: fm.wave,
    depends_on: fm.depends_on,
    autonomous: fm.autonomous,
    gap_closure: fm.gap_closure,
    trd_type: fm.type,
    tasks,
    ...totals,
    confidence: verdict.confidence,
    weakest: verdict.weakest,
    human_wait: humanWait,
    notes,
    missing,
  };
}

const TRD_FILE_RE = /-(?:TRD|JOB)\.md$/i;
const TRD_REF_RE = /^(\d+(?:\.\d+)?)-(\d+)$/;

/**
 * Finds a TRD: a ref ending in `-TRD.md` or `-JOB.md` is a path (relative to `cwd`), otherwise `NN-MM` is looked up in
 * the objective's plan files, current or archived. Throws `TRD <ref> not found`.
 * @returns {{id:string, path:string}}  `path` is absolute
 */
function resolveTrd(cwd, ref) {
  const token = String(ref === undefined || ref === null ? '' : ref).trim();
  if (TRD_FILE_RE.test(token)) {
    const file = path.resolve(cwd, token);
    if (!fs.existsSync(file)) throw new Error(`TRD ${token} not found`);
    return { id: trdKey(path.basename(file)), path: file };
  }
  const m = TRD_REF_RE.exec(token);
  if (m === null) throw new Error(`TRD reference "${token}" must be NN-MM (for example 58-05) or the path of a -TRD.md file`);
  const wanted = `${m[1]}-${m[2].padStart(2, '0')}`;
  const objective = findObjectiveInternal(cwd, m[1]);
  const plan = objective && objective.found ? objective.jobs.find((file) => trdKey(file) === wanted) : undefined;
  if (plan === undefined) throw new Error(`TRD ${token} not found`);
  return { id: wanted, path: path.resolve(cwd, objective.directory, plan) };
}

/** `estimateTrdText` for the TRD that `ref` names (see resolveTrd), read from disk. */
function estimateTrd(cal, cwd, ref) {
  const found = resolveTrd(cwd, ref);
  let text;
  try {
    text = fs.readFileSync(found.path, 'utf-8');
  } catch (err) {
    throw new Error(`cannot read TRD ${found.path}: ${err.message}`);
  }
  return estimateTrdText(cal, text, found);
}

module.exports = {
  CONFIDENCE_LEVELS,
  MIN_CLASS_SAMPLES,
  confidenceFor,
  overallConfidence,
  loadCalibration,
  metricFor,
  estimateTask,
  estimateTrdText,
  resolveTrd,
  estimateTrd,
};
