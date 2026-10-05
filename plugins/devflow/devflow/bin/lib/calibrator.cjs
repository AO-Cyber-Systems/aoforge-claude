'use strict';

// calibration.json builder (TRD 57-05). Turns the planning history read by calibration-inputs.cjs into per-task-class
// medians, P90s and dollars. The result depends only on the inputs: no wall-clock value is read anywhere, so a rebuild
// over unchanged inputs is byte-identical (see stableStringify and writeCalibration).

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ci = require('./calibration-inputs.cjs');
const { OVERHEAD_AGENTS, collectOverhead } = require('./agent-overhead.cjs');

const CALIBRATION_VERSION = 2;

const NOTES = Object.freeze([
  "Task values split each TRD's outcome equally across its auto tasks and include the executor's per-TRD overhead pro rata; do not add executor overhead on top.",
  'Minutes exclude autonomous:false TRDs (human wait); their tokens still count.',
  'cost_usd prices cache writes at the 5-minute rate; percentiles are nearest-rank.',
  'agent_overhead is one spawn of a non-executor DevFlow agent, measured from subagent transcripts (minutes from first to last record); quick-plan planner spawns are excluded.',
  'objective_level sums executor outcomes per objective and counts an objective for a metric only when every TRD in it has that metric; its minutes are serial executor time, not wall time.',
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

// ─── Objective level ──────────────────────────────────────────────────────────

const OBJECTIVE_METRICS = Object.freeze(['minutes', 'tokens_input', 'tokens_output', 'cost_usd']);

/**
 * What whole objectives cost, from the TRD samples. An objective is kept when at least one of its TRDs is a sample. It
 * counts for a metric only when EVERY TRD in it has that metric: a TRD with no sample, or a null value, takes the
 * objective out of that metric, because a partial sum would bias the unplanned fallback low. Minutes are serial executor
 * time (the TRDs summed), not wall time.
 */
function objectiveLevelBlock(projectList, samples) {
  const sampleKey = (project, dir, id) => `${project}\u0000${dir}\u0000${id}`;
  const sampleOf = new Map(samples.map((s) => [sampleKey(s.project, s.objective_dir, s.id), s]));

  const kept = [];
  for (const project of projectList) {
    const byDir = new Map();
    for (const trd of project.trds) {
      if (!byDir.has(trd.objective_dir)) byDir.set(trd.objective_dir, []);
      byDir.get(trd.objective_dir).push(trd);
    }
    for (const dir of [...byDir.keys()].sort()) {
      const trds = byDir.get(dir);
      const measured = trds.map((trd) => sampleOf.get(sampleKey(project.label, dir, trd.id)) || null);
      if (measured.every((m) => m === null)) continue;
      const row = { trds: trds.length, tasks: trds.reduce((n, trd) => n + trd.tasks.filter((t) => !isCheckpoint(t)).length, 0) };
      for (const metric of OBJECTIVE_METRICS) {
        const values = measured.map((m) => (m === null ? null : m[metric]));
        row[metric] = values.every(hasNumber) ? values.reduce((a, b) => a + b, 0) : null;
      }
      kept.push(row);
    }
  }
  return {
    samples: kept.length,
    trds: statBlock(kept.map((r) => r.trds), roundMinutes),
    tasks: statBlock(kept.map((r) => r.tasks), roundMinutes),
    minutes: statBlock(kept.map((r) => r.minutes), roundMinutes),
    tokens_input: statBlock(kept.map((r) => r.tokens_input), roundTokens),
    tokens_output: statBlock(kept.map((r) => r.tokens_output), roundTokens),
    cost_usd: statBlock(kept.map((r) => r.cost_usd), roundCost),
  };
}

// ─── Agent overhead ───────────────────────────────────────────────────────────

const NO_OVERHEAD_COUNTS = Object.freeze({ spawns: 0, matched: 0, foreign: 0, quick: 0, unreadable: 0 });

/**
 * USD for one overhead spawn: each model's share is priced at its own rates and summed. Null when the spawn has no
 * token usage or any model in it has no rate (that model is added to `unpricedModels`); a partial price is never reported.
 */
function overheadCost(sample, rates, unpricedModels) {
  const models = Object.keys(sample.by_model || {}).sort();
  if (models.length === 0 || !hasNumber(sample.tokens_input) || !hasNumber(sample.tokens_output)) return null;
  let total = 0;
  let priced = true;
  for (const model of models) {
    const cost = sampleCost({ ...sample.by_model[model], token_model: model }, rates);
    if (cost === null) {
      priced = false;
      const normalized = ci.normalizeModelId(model);
      if (normalized !== null && ci.rateFor(rates, normalized) === null) unpricedModels.add(normalized);
    } else {
      total += cost;
    }
  }
  return priced ? total : null;
}

/** One block per OVERHEAD_AGENTS entry, present even with no samples, so a reader never has to test for a missing key. */
function agentOverheadBlocks(overheadSamples) {
  const blocks = {};
  for (const name of OVERHEAD_AGENTS) {
    const list = overheadSamples.filter((s) => s.agent === name);
    blocks[name] = {
      samples: list.length,
      minutes: statBlock(list.map((s) => s.minutes), roundMinutes),
      tokens_input: statBlock(list.map((s) => s.tokens_input), roundTokens),
      tokens_output: statBlock(list.map((s) => s.tokens_output), roundTokens),
      cost_usd: statBlock(list.map((s) => s.cost_usd), roundCost),
    };
  }
  return blocks;
}

// ─── Canonical text ───────────────────────────────────────────────────────────

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const copy = {};
    for (const key of Object.keys(value).sort()) copy[key] = sortKeysDeep(value[key]);
    return copy;
  }
  return value;
}

/**
 * calibration.json text: a key-sorted deep copy (at every depth, arrays keep their order), 2-space indent and a
 * trailing newline. People read this file, so it is not the one-line form gh-mapping.canonicalJson emits.
 */
function stableStringify(value) {
  return JSON.stringify(sortKeysDeep(value), null, 2) + '\n';
}

// What the digest hashes about one TRD: only values read from the inputs, never a path or an mtime, and only the parts
// that can change the output (a task's name and a duration's spelling cannot, so they are left out).
function normalizedTrd(project, trd) {
  const s = trd.summary;
  return {
    project,
    objective_dir: trd.objective_dir,
    id: trd.id,
    trd_type: trd.trd_type,
    autonomous: trd.autonomous,
    gap_closure: trd.gap_closure,
    tasks: trd.tasks.map((t) => ({ type: t.type, tdd: t.tdd, files: t.files })),
    minutes: trd.minutes,
    duration_source: trd.duration_source,
    summary: s === null ? null : {
      minutes: s.minutes,
      completed: s.completed,
      tokens_input: s.tokens_input,
      tokens_output: s.tokens_output,
      tokens_cache_read: s.tokens_cache_read,
      tokens_cache_write: s.tokens_cache_write,
      token_model: s.token_model,
    },
    metric_minutes: trd.metric === null ? null : trd.metric.minutes,
  };
}

// What the digest hashes about the overhead spawns: the values the blocks are computed from, never a path or an mtime.
// `counts` is hashed too because agent_overhead_sources puts those numbers in the file.
function normalizedOverhead(overheadSamples, counts) {
  return {
    samples: overheadSamples.map((s) => ({
      agent: s.agent, project: s.project, session: s.session, agent_id: s.agent_id, minutes: s.minutes, by_model: s.by_model,
    })),
    counts,
  };
}

function inputsDigest(projectList, rates, sources, overhead) {
  const trds = projectList
    .flatMap((project) => project.trds.map((trd) => normalizedTrd(project.label, trd)))
    .sort((a, b) => compareStrings(a.project, b.project)
      || compareStrings(a.objective_dir, b.objective_dir) || compareStrings(a.id, b.id));
  const payload = {
    classifier_version: ci.CLASSIFIER_VERSION,
    rates: { models: rates.models, aliases: rates.aliases },
    trds,
    sources, // metric rows that joined no TRD change the output, so they belong to the inputs too
    overhead, // null when no transcripts root was scanned
  };
  return `sha256:${crypto.createHash('sha256').update(stableStringify(payload)).digest('hex')}`;
}

// ─── The calibration ──────────────────────────────────────────────────────────

/**
 * Builds the calibration object from the planning history under `paths`, priced from `ratesPath`.
 * Throws an Error naming the rates file when it cannot be read or fails validation.
 *
 * Subagent transcripts are read only when `transcriptsRoot` is a string (the CLI resolves the default root); without it
 * `agent_overhead` is present and empty and `agent_overhead_sources.scanned` is false.
 * @param {{paths:string[], ratesPath?:string, transcriptsRoot?:?string}} options
 */
function buildCalibration({ paths, ratesPath = ci.RATES_PATH, transcriptsRoot = null } = {}) {
  const rates = ci.loadRates(ratesPath);
  if (!rates.ok) throw new Error(rates.error);

  const projectRoots = ci.discoverProjects(paths);
  const projectList = projectRoots.map((root) => ci.collectProject(root));
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

  const sources = projectList.map(sourceCounts).sort((a, b) => compareStrings(a.project, b.project));

  // Overhead is read after, and separately from, the TRD samples above: it must not touch task_classes or trd_level.
  const scanned = typeof transcriptsRoot === 'string' && transcriptsRoot !== '';
  const overhead = scanned
    ? collectOverhead({
      root: transcriptsRoot,
      projects: projectRoots.map((root, i) => ({ root, label: projectList[i].label })),
    })
    : { samples: [], counts: { ...NO_OVERHEAD_COUNTS } };
  const overheadSamples = overhead.samples.map((s) => ({ ...s, cost_usd: overheadCost(s, rates, unpricedModels) }));
  const overheadSources = {
    scanned,
    spawns: overhead.counts.spawns,
    matched: overhead.counts.matched,
    foreign: overhead.counts.foreign,
    quick: overhead.counts.quick,
    unreadable: overhead.counts.unreadable,
  };

  return {
    version: CALIBRATION_VERSION,
    classifier_version: ci.CLASSIFIER_VERSION,
    data_as_of: latestCompleted(projectList),
    inputs_digest: inputsDigest(projectList, rates, sources,
      scanned ? normalizedOverhead(overheadSamples, overheadSources) : null),
    notes: [...NOTES],
    samples: {
      trds: samples.length,
      tasks: tasks.length,
      with_tokens: samples.filter((s) => s.with_tokens).length,
    },
    sources,
    trd_level: {
      samples: samples.length,
      minutes: statBlock(samples.map((s) => s.minutes), roundMinutes),
      tasks: statBlock(samples.map((s) => s.auto_tasks.length), roundMinutes),
      tokens_input: statBlock(samples.map((s) => s.tokens_input), roundTokens),
      tokens_output: statBlock(samples.map((s) => s.tokens_output), roundTokens),
      cost_usd: statBlock(samples.map((s) => s.cost_usd), roundCost),
    },
    task_classes: taskClasses,
    objective_level: objectiveLevelBlock(projectList, samples),
    agent_overhead: agentOverheadBlocks(overheadSamples),
    agent_overhead_sources: overheadSources,
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

// ─── Where it is written ──────────────────────────────────────────────────────

/** `DEVFLOW_CALIBRATION_PATH`, else `<HOME>/.claude/devflow/calibration.json`; HOME is read per call, never at load. */
function defaultCalibrationPath(env = process.env) {
  return env.DEVFLOW_CALIBRATION_PATH || path.join(os.homedir(), '.claude', 'devflow', 'calibration.json');
}

/**
 * Writes `obj` as calibration.json text, but only when the bytes differ from what is already there, so an unchanged
 * history leaves the file (and its mtime) alone. An explicit `outPath` never resolves the home directory.
 * @returns {{path:string, changed:boolean, bytes:number}}
 */
function writeCalibration(outPath, obj) {
  const target = outPath || defaultCalibrationPath();
  const text = stableStringify(obj);
  const bytes = Buffer.byteLength(text);
  let existing = null;
  try {
    existing = fs.readFileSync(target, 'utf-8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`cannot read calibration ${target}: ${err.message}`);
  }
  if (existing === text) return { path: target, changed: false, bytes };

  const tmp = `${target}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, target);
  } catch (err) {
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
    throw new Error(`cannot write calibration ${target}: ${err.message}`);
  }
  return { path: target, changed: true, bytes };
}

module.exports = {
  CALIBRATION_VERSION,
  nearestRank,
  statBlock,
  sampleCost,
  buildCalibration,
  stableStringify,
  writeCalibration,
  defaultCalibrationPath,
};
