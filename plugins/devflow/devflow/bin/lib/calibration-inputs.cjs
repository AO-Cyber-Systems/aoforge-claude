'use strict';

// Clean, deterministic inputs for `df-tools calibrate` (TRD 57-02, EST-01): model dollar rates, readers for the planning
// history that carries duration and token samples, and the task classifier Objective 58's estimator shares.
//
// Every list returned from this module is explicitly sorted. 57-05 builds a byte-identical calibration.json from it.

const fs = require('fs');
const path = require('path');

// ─── Model rates ──────────────────────────────────────────────────────────────

const RATES_PATH = path.join(__dirname, '..', '..', 'references', 'model-rates.json');

const RATE_FIELDS = ['input', 'output', 'cache_read', 'cache_write_5m', 'cache_write_1h'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validateModel(id, model) {
  if (!isPlainObject(model)) return `model ${id}: entry is not an object`;
  for (const field of RATE_FIELDS) {
    if (typeof model[field] !== 'number' || !Number.isFinite(model[field]) || model[field] < 0) {
      return `model ${id}: ${field} must be a non-negative number`;
    }
  }
  if (typeof model.source !== 'string' || !/^https:\/\//.test(model.source)) {
    return `model ${id}: source must be an https URL`;
  }
  if (typeof model.as_of !== 'string' || !DATE_RE.test(model.as_of)) {
    return `model ${id}: as_of must be a YYYY-MM-DD date`;
  }
  return null;
}

/**
 * Load and validate the model rates file.
 * @returns {{ok:true, models:object, aliases:object, currency:string|null, unit:string|null, as_of:string|null}
 *          |{ok:false, error:string}}
 */
function loadRates(file = RATES_PATH) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    return { ok: false, error: `cannot read model rates ${file}: ${err.message}` };
  }
  if (!isPlainObject(raw) || !isPlainObject(raw.models)) {
    return { ok: false, error: `model rates ${file}: "models" must be an object` };
  }
  const aliasesIn = raw.aliases === undefined ? {} : raw.aliases;
  if (!isPlainObject(aliasesIn)) return { ok: false, error: `model rates ${file}: "aliases" must be an object` };

  const models = {};
  let asOf = null;
  for (const id of Object.keys(raw.models).sort()) {
    const problem = validateModel(id, raw.models[id]);
    if (problem) return { ok: false, error: problem };
    const m = raw.models[id];
    models[id] = {
      input: m.input, output: m.output, cache_read: m.cache_read,
      cache_write_5m: m.cache_write_5m, cache_write_1h: m.cache_write_1h,
      source: m.source, as_of: m.as_of,
    };
    if (asOf === null || m.as_of > asOf) asOf = m.as_of;
  }
  const aliases = {};
  for (const alias of Object.keys(aliasesIn).sort()) {
    const target = aliasesIn[alias];
    if (typeof target !== 'string' || !hasOwn(models, target)) {
      return { ok: false, error: `alias ${alias} points at missing model ${target}` };
    }
    aliases[alias] = target;
  }
  return {
    ok: true,
    models,
    aliases,
    currency: typeof raw.currency === 'string' ? raw.currency : null,
    unit: typeof raw.unit === 'string' ? raw.unit : null,
    as_of: asOf,
  };
}

/** Trim, strip a trailing `[...]` context suffix; `<synthetic>`-style and empty ids are null. */
function normalizeModelId(id) {
  if (typeof id !== 'string') return null;
  const stripped = id.trim().replace(/\[[^\]]*\]$/, '').trim();
  if (stripped === '' || /^<.*>$/.test(stripped)) return null;
  return stripped;
}

/**
 * The rate row for a transcript model id: direct, then alias, then the same two without a trailing `-YYYYMMDD`.
 * @returns {{id:string, input:number, output:number, cache_read:number, cache_write_5m:number, cache_write_1h:number}|null}
 */
function rateFor(rates, id) {
  const norm = normalizeModelId(id);
  if (!norm || !rates || !isPlainObject(rates.models)) return null;
  const aliases = isPlainObject(rates.aliases) ? rates.aliases : {};
  const resolve = (key) => {
    if (hasOwn(rates.models, key)) return key;
    if (hasOwn(aliases, key) && hasOwn(rates.models, aliases[key])) return aliases[key];
    return null;
  };
  let key = resolve(norm);
  if (key === null) {
    const undated = norm.replace(/-\d{8}$/, '');
    if (undated !== norm) key = resolve(undated);
  }
  if (key === null) return null;
  const m = rates.models[key];
  return {
    id: key,
    input: m.input,
    output: m.output,
    cache_read: m.cache_read,
    cache_write_5m: m.cache_write_5m,
    cache_write_1h: m.cache_write_1h,
  };
}

module.exports = {
  RATES_PATH,
  loadRates,
  normalizeModelId,
  rateFor,
};
