'use strict';

/**
 * model-currency — is a pinned model id current? (TRD 61-07, OBS-01)
 *
 * There is no hard-coded "latest model" list here, because a list goes stale itself. Currency comes from
 * `references/model-rates.json`, the priced table 57-02 keeps current from the pricing page: within each family
 * (opus, sonnet, haiku, fable, ...) the newest version that table prices is the current id. A pinned id is
 *
 *   superseded  its family has a newer version in the table
 *   unpriced    the table does not price it (rateFor is null), so its currency cannot be judged and estimates
 *               cannot price it either
 *
 * and current otherwise, including an alias, a dated snapshot or a `[1m]` id of the current version. Ids are compared
 * as numeric version arrays, never as strings, and a date snapshot is not a version.
 *
 * Normalisation and rate lookup are calibration-inputs' (normalizeModelId/rateFor), the same ones estimates use.
 * Consumers: doctor check 13 (model-profiles) and validate health Check 18 (W063).
 */

const { normalizeModelId, rateFor } = require('./calibration-inputs.cjs');

const ID_RE = /^claude-([a-z]+)-(\d+(?:-\d+)*)$/;
const SNAPSHOT_RE = /^\d{8}$/;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * `claude-<family>-<n>[-<n>...][-YYYYMMDD][[1m]]` -> { family, version: number[], snapshot: string|null }, else null.
 * A last segment of exactly eight digits is the snapshot; the rest is the version.
 */
function parseModelId(id) {
  const norm = normalizeModelId(id);
  if (!norm) return null;
  const m = ID_RE.exec(norm);
  if (!m) return null;
  const parts = m[2].split('-');
  let snapshot = null;
  if (parts.length > 1 && SNAPSHOT_RE.test(parts[parts.length - 1])) snapshot = parts.pop();
  if (parts.some((p) => SNAPSHOT_RE.test(p))) return null;
  return { family: m[1], version: parts.map(Number), snapshot };
}

/** -1 | 0 | 1, element by element, a missing element counting as zero ([5] equals [5, 0]). */
function compareModelVersions(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/** True when candidate `c` should replace `best` as a family's current entry. */
function newer(c, best) {
  const cmp = compareModelVersions(c.parsed.version, best.parsed.version);
  if (cmp !== 0) return cmp > 0;
  const cs = c.parsed.snapshot;
  const bs = best.parsed.snapshot;
  if (cs === null || bs === null) return cs === null && bs !== null; // the undated id wins a tie
  return cs > bs;
}

/**
 * family -> current id, over the real `rates.models` entries only (an alias never becomes the current id). Keys are
 * sorted; families come from the data. Accepts a loadRates() result or the raw file shape; junk is {}.
 */
function currentByFamily(rates) {
  if (!isPlainObject(rates) || !isPlainObject(rates.models)) return {};
  const best = {};
  for (const id of Object.keys(rates.models).sort()) {
    const parsed = parseModelId(id);
    if (!parsed) continue;
    const c = { id, parsed };
    if (!best[parsed.family] || newer(c, best[parsed.family])) best[parsed.family] = c;
  }
  const out = {};
  for (const family of Object.keys(best).sort()) out[family] = best[family].id;
  return out;
}

/**
 * The pinned ids in `models` (tier -> id) that are not current against `rates`, sorted by tier:
 * [{ tier, id, reason: 'superseded'|'unpriced', current: string|null }]. Never throws; non-string ids are skipped
 * (structure is doctor check 13's job), and a non-object models or rates value is [].
 */
function staleModelIds(models, rates) {
  if (!isPlainObject(models) || !isPlainObject(rates) || !isPlainObject(rates.models)) return [];
  const current = currentByFamily(rates);
  const out = [];
  for (const tier of Object.keys(models).sort()) {
    const id = models[tier];
    if (typeof id !== 'string') continue;
    const rate = rateFor(rates, id);
    const parsed = parseModelId(id) || (rate ? parseModelId(rate.id) : null);
    const cur = parsed && current[parsed.family] ? current[parsed.family] : null;
    if (!rate) {
      out.push({ tier, id, reason: 'unpriced', current: cur });
      continue;
    }
    if (!parsed || !cur) continue;
    if (compareModelVersions(parsed.version, parseModelId(cur).version) < 0) {
      out.push({ tier, id, reason: 'superseded', current: cur });
    }
  }
  return out;
}

module.exports = { parseModelId, compareModelVersions, currentByFamily, staleModelIds };
