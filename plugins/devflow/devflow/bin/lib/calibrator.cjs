'use strict';

// calibration.json builder (TRD 57-05). Turns the planning history read by calibration-inputs.cjs into per-task-class
// medians, P90s and dollars. The result depends only on the inputs: no wall-clock value is read anywhere, so a rebuild
// over unchanged inputs is byte-identical (see stableStringify and writeCalibration).

const ci = require('./calibration-inputs.cjs');

const CALIBRATION_VERSION = 1;

const NOTES = Object.freeze([
  "Task values split each TRD's outcome equally across its auto tasks and include the executor's per-TRD overhead pro rata; do not add executor overhead on top.",
  'Minutes exclude autonomous:false TRDs (human wait); their tokens still count.',
  'cost_usd prices cache writes at the 5-minute rate; percentiles are nearest-rank.',
]);

// ─── Statistics ───────────────────────────────────────────────────────────────

/**
 * Nearest-rank percentile of an ascending list: `sorted[ceil(p * n) - 1]`, so the answer is always an observed value.
 * (context-audit.percentile uses floor(n * p), whose p50 is the upper middle; do not substitute it.)
 */
function nearestRank(sorted, p) {
  const n = sorted.length;
  if (n === 0) return null;
  const index = Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1));
  return sorted[index];
}

const identity = (x) => x;

/** `{n, p50, p90, min, max}` over the non-null values. `round` is applied once, to each reported value. */
function statBlock(values, round = identity) {
  const sorted = (Array.isArray(values) ? values : [])
    .filter((v) => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return { n: 0, p50: null, p90: null, min: null, max: null };
  return {
    n: sorted.length,
    p50: round(nearestRank(sorted, 0.5)),
    p90: round(nearestRank(sorted, 0.9)),
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
  };
}

const roundMinutes = (x) => Math.round(x * 10) / 10;
const roundTokens = (x) => Math.round(x);
const roundCost = (x) => Math.round(x * 1e4) / 1e4;
const roundProbability = (x) => Math.round(x * 1e4) / 1e4;

// ─── Dollar cost ──────────────────────────────────────────────────────────────

function numberOrZero(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function hasNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * USD for one sample: fresh input, cache writes (5-minute rate), cache reads and output, from model-rates.json.
 * `tokens_input` includes the cache counts, so fresh input is what is left after them. Null when either token count is
 * missing or the model has no rate; an unpriced sample is never guessed.
 * @param {{tokens_input:?number, tokens_output:?number, tokens_cache_read?:?number, tokens_cache_write?:?number, token_model?:?string}} sample
 */
function sampleCost(sample, rates) {
  const s = sample || {};
  if (!hasNumber(s.tokens_input) || !hasNumber(s.tokens_output)) return null;
  const rate = ci.rateFor(rates, s.token_model);
  if (rate === null) return null;
  const cacheRead = numberOrZero(s.tokens_cache_read);
  const cacheWrite = numberOrZero(s.tokens_cache_write);
  const fresh = Math.max(0, s.tokens_input - cacheRead - cacheWrite);
  return (fresh * rate.input + cacheWrite * rate.cache_write_5m + cacheRead * rate.cache_read
    + s.tokens_output * rate.output) / 1e6;
}

// ─── Samples ──────────────────────────────────────────────────────────────────

function isCheckpoint(task) {
  return typeof task.type === 'string' && task.type.startsWith('checkpoint');
}

function sortedUnique(list) {
  return [...new Set(list)].sort();
}

/** One TRD-level sample, or null when the TRD has neither minutes nor both token counts. */
function trdSample(project, trd, rates, unpricedModels) {
  const summary = trd.summary;
  const hasTokens = summary !== null && hasNumber(summary.tokens_input) && hasNumber(summary.tokens_output);
  if (trd.minutes === null && !hasTokens) return null;

  let cost = null;
  if (hasTokens) {
    cost = sampleCost(summary, rates);
    if (cost === null) {
      const model = ci.normalizeModelId(summary.token_model);
      if (model !== null && ci.rateFor(rates, model) === null) unpricedModels.add(model);
    }
  }
  const auto = trd.tasks.filter((task) => !isCheckpoint(task));
  return {
    project,
    objective_dir: trd.objective_dir,
    id: trd.id,
    autonomous: trd.autonomous,
    gap_closure: trd.gap_closure,
    // A TRD that waited for a human reports wall-clock time that is not work; its tokens still count.
    minutes: trd.autonomous ? trd.minutes : null,
    tokens_input: hasTokens ? summary.tokens_input : null,
    tokens_output: hasTokens ? summary.tokens_output : null,
    cost_usd: cost,
    auto_tasks: auto.map((task) => ({
      files: Array.isArray(task.files) ? task.files.length : 0,
      class: ci.classifyTask({ files: task.files, tdd: task.tdd, type: task.type, trdType: trd.trd_type }),
    })),
    with_tokens: hasTokens,
  };
}

/** Each auto task carries an equal share of its TRD's outcome. Shares that are all null are not samples. */
function taskSamples(sample) {
  const k = sample.auto_tasks.length;
  if (k === 0) return [];
  const share = (v) => (v === null ? null : v / k);
  const out = [];
  for (const task of sample.auto_tasks) {
    const value = {
      class: task.class,
      files: task.files,
      minutes: share(sample.minutes),
      tokens_input: share(sample.tokens_input),
      tokens_output: share(sample.tokens_output),
      cost_usd: share(sample.cost_usd),
    };
    if (value.minutes === null && value.tokens_input === null && value.tokens_output === null && value.cost_usd === null) continue;
    out.push(value);
  }
  return out;
}

function classBlock(values) {
  return {
    samples: values.length,
    minutes: statBlock(values.map((v) => v.minutes), roundMinutes),
    tokens_input: statBlock(values.map((v) => v.tokens_input), roundTokens),
    tokens_output: statBlock(values.map((v) => v.tokens_output), roundTokens),
    cost_usd: statBlock(values.map((v) => v.cost_usd), roundCost),
    files: statBlock(values.map((v) => v.files), roundMinutes),
  };
}

function probability(hits, n) {
  return { value: n === 0 ? null : roundProbability(hits / n), n };
}

function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sourceCounts(project) {
  const trds = project.trds;
  const hasTokens = (t) => t.summary !== null && hasNumber(t.summary.tokens_input) && hasNumber(t.summary.tokens_output);
  return {
    project: project.label,
    trds: trds.length,
    summaries: trds.filter((t) => t.summary !== null).length,
    with_minutes: trds.filter((t) => t.minutes !== null).length,
    with_tokens: trds.filter(hasTokens).length,
    no_outcome: trds.filter((t) => t.minutes === null && !hasTokens(t)).length,
    metric_rows: project.metrics.rows,
    metric_rows_joined: project.metrics.joined,
    metric_rows_ambiguous: project.metrics.ambiguous,
  };
}

function latestCompleted(projectList) {
  let latest = null;
  for (const project of projectList) {
    for (const trd of project.trds) {
      const m = trd.summary && typeof trd.summary.completed === 'string' ? /^(\d{4}-\d{2}-\d{2})/.exec(trd.summary.completed) : null;
      if (m && (latest === null || m[1] > latest)) latest = m[1];
    }
  }
  return latest;
}

// ─── The calibration ──────────────────────────────────────────────────────────

/**
 * Builds the calibration object from the planning history under `paths`, priced from `ratesPath`.
 * Throws an Error naming the rates file when it cannot be read or fails validation.
 * @param {{paths:string[], ratesPath?:string}} options
 */
function buildCalibration({ paths, ratesPath = ci.RATES_PATH } = {}) {
  const rates = ci.loadRates(ratesPath);
  if (!rates.ok) throw new Error(rates.error);

  const projectList = ci.discoverProjects(paths).map((root) => ci.collectProject(root));
  const unpricedModels = new Set();
  const samples = [];
  for (const project of projectList) {
    for (const trd of project.trds) {
      const sample = trdSample(project.label, trd, rates, unpricedModels);
      if (sample !== null) samples.push(sample);
    }
  }

  const tasks = samples.flatMap(taskSamples);
  const byClass = new Map();
  for (const task of tasks) {
    if (!byClass.has(task.class)) byClass.set(task.class, []);
    byClass.get(task.class).push(task);
  }
  const taskClasses = { all: classBlock(tasks) };
  for (const name of [...byClass.keys()].sort()) taskClasses[name] = classBlock(byClass.get(name));

  // Gap closure is judged per objective that produced a sample; a planned gap-closure TRD counts even before it ran.
  const objectiveKey = (project, dir) => `${project}\u0000${dir}`;
  const sampledObjectives = new Set(samples.map((s) => objectiveKey(s.project, s.objective_dir)));
  const gapObjectives = new Set();
  for (const project of projectList) {
    for (const trd of project.trds) {
      const key = objectiveKey(project.label, trd.objective_dir);
      if (trd.gap_closure && sampledObjectives.has(key)) gapObjectives.add(key);
    }
  }

  return {
    version: CALIBRATION_VERSION,
    classifier_version: ci.CLASSIFIER_VERSION,
    data_as_of: latestCompleted(projectList),
    notes: [...NOTES],
    samples: {
      trds: samples.length,
      tasks: tasks.length,
      with_tokens: samples.filter((s) => s.with_tokens).length,
    },
    sources: projectList.map(sourceCounts).sort((a, b) => compareStrings(a.project, b.project)),
    trd_level: {
      samples: samples.length,
      minutes: statBlock(samples.map((s) => s.minutes), roundMinutes),
      tasks: statBlock(samples.map((s) => s.auto_tasks.length), roundMinutes),
      tokens_input: statBlock(samples.map((s) => s.tokens_input), roundTokens),
      tokens_output: statBlock(samples.map((s) => s.tokens_output), roundTokens),
      cost_usd: statBlock(samples.map((s) => s.cost_usd), roundCost),
    },
    task_classes: taskClasses,
    probabilities: {
      gap_closure: probability(gapObjectives.size, sampledObjectives.size),
      checkpoint: probability(samples.filter((s) => !s.autonomous).length, samples.length),
    },
    models: rates.models,
    model_aliases: rates.aliases,
    rates_as_of: rates.as_of,
    unpriced_models: sortedUnique([...unpricedModels]),
  };
}

module.exports = {
  CALIBRATION_VERSION,
  nearestRank,
  statBlock,
  sampleCost,
  buildCalibration,
};
