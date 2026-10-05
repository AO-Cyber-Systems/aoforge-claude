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
// A stat is `{p50, p90, n}`; a task estimate is
//   {class, classifier_version, basis, class_samples, minutes, tokens_input, tokens_output, cost_usd, samples,
//    confidence, human_wait, notes, missing}
// where each metric is a stat or null, `samples` is the smallest n among the present metrics, `basis` is 'class' or
// 'all', and a checkpoint task is `{class: 'checkpoint', human_wait: true, every metric {p50: 0, p90: 0}, confidence:
// 'n/a', basis/class_samples/samples null}`.

const fs = require('fs');

const ci = require('./calibration-inputs.cjs');
const calibrator = require('./calibrator.cjs');

const CONFIDENCE_LEVELS = Object.freeze(['none', 'low', 'medium', 'high']);
const MIN_CLASS_SAMPLES = 5;
const MEDIUM_SAMPLES = 10;
const HIGH_SAMPLES = 30;
const SUPPORTED_VERSIONS = Object.freeze([1, 2]);
const METRICS = Object.freeze(['minutes', 'tokens_input', 'tokens_output', 'cost_usd']);

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
  if (missing.length > 0) notes.push(`no samples for ${missing.join(', ')}`);

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

module.exports = {
  CONFIDENCE_LEVELS,
  MIN_CLASS_SAMPLES,
  confidenceFor,
  loadCalibration,
  metricFor,
  estimateTask,
};
