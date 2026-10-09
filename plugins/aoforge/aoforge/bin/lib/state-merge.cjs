'use strict';

/**
 * state-merge.cjs: the pure 3-way merge of `.aoforge/state.json` (TRD 59-01, PLMB-02).
 *
 * Parallel wave branches each append to state.json (`state add-decision` adds a `decisions` entry,
 * `state record-metric` bumps counters). Two branches appending at the same place is a textual
 * conflict, so the merge is done on the parsed document instead, by these rules:
 *
 *   arrays      keep every entry either side added (base entries, then ours' additions, then theirs'
 *               additions, in that order); drop an entry one side removed. Entries compare by canonical
 *               JSON (keys sorted). Only theirs' additions are deduplicated, and only against ours:
 *               repeats inside one side are legitimate and kept.
 *   metrics.*   counters sum both deltas onto the base: base + (ours - base) + (theirs - base), also when
 *               both sides ended at the same value (two parallel jobs each adding 1 make base + 2).
 *   numbers     elsewhere, changed on both sides: the max.
 *   ISO dates   changed on both sides: the later (string comparison).
 *   objects     merged key by key; ours' key order first, then keys only theirs has. A key one side
 *               deleted and the other left unchanged is deleted; a key one side added is kept.
 *   anything    else changed on both sides: ours, with a note naming the path.
 *
 * An empty or whitespace base (the file was added on both sides) is `{}`. An unparsable base is `{}`
 * with a note. An unparsable ours/theirs, or a top level that is not a plain object, is
 * `{ok: false, reason}`: the function never throws.
 *
 * The output text is `JSON.stringify(merged, null, 2)` with no trailing newline, byte-identical to
 * what `writeStateJson` (lib/state.cjs) writes. No I/O happens here; merge-driver-cli.cjs owns that.
 */

function isPlain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isPlain(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
  }
  return value;
}

/** JSON with every object's keys sorted, so equal values compare equal whatever their key order. */
function canonicalJson(value) {
  if (value === undefined) return 'undefined';
  return JSON.stringify(sortKeys(value));
}

function equal(a, b) {
  return canonicalJson(a) === canonicalJson(b);
}

function tryParse(text) {
  if (typeof text !== 'string') return { ok: false, error: 'not a string' };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

function mergeArray(base, ours, theirs) {
  const baseKeys = new Set(base.map(canonicalJson));
  const theirsKeys = new Set(theirs.map(canonicalJson));
  const removedByTheirs = new Set([...baseKeys].filter((k) => !theirsKeys.has(k)));

  const out = ours.filter((x) => !removedByTheirs.has(canonicalJson(x)));
  const oursKeys = new Set(out.map(canonicalJson));
  for (const x of theirs) {
    const k = canonicalJson(x);
    if (!baseKeys.has(k) && !oursKeys.has(k)) out.push(x);
  }
  return out;
}

function mergeObject(base, ours, theirs, keyPath, notes) {
  const entries = [];
  for (const k of Object.keys(ours)) {
    if (hasOwn(theirs, k)) {
      const b = hasOwn(base, k) ? base[k] : undefined;
      entries.push([k, mergeValue(b, ours[k], theirs[k], keyPath.concat(k), notes)]);
    } else if (!(hasOwn(base, k) && equal(base[k], ours[k]))) {
      entries.push([k, ours[k]]); // only ours has it, and theirs did not delete an unchanged copy
    }
  }
  for (const k of Object.keys(theirs)) {
    if (hasOwn(ours, k)) continue;
    if (hasOwn(base, k) && equal(base[k], theirs[k])) continue; // ours deleted an unchanged key
    entries.push([k, theirs[k]]);
  }
  return Object.fromEntries(entries);
}

/**
 * True while the merge is on the way to, or at, a `metrics` counter whose base exists. There the
 * equal-values shortcut must not fire when both sides moved away from base: two parallel jobs each
 * adding 1 leave the counter equal on both sides (base + 1), and keeping "ours" would lose a delta.
 * A counter absent from the base has no delta to sum, so equal values are kept once.
 */
function summingCounters(base, ours, keyPath) {
  const onCounterPath = keyPath.length === 0 || keyPath[0] === 'metrics';
  const baseCounts = isPlain(base) || typeof base === 'number';
  return onCounterPath && baseCounts && !equal(base, ours);
}

function mergeValue(base, ours, theirs, keyPath, notes) {
  if (!summingCounters(base, ours, keyPath) && equal(ours, theirs)) return ours;
  if (equal(base, ours)) return theirs; // only theirs changed
  if (equal(base, theirs)) return ours; // only ours changed

  if (Array.isArray(ours) && Array.isArray(theirs)) {
    return mergeArray(Array.isArray(base) ? base : [], ours, theirs);
  }
  if (isPlain(ours) && isPlain(theirs)) {
    return mergeObject(isPlain(base) ? base : {}, ours, theirs, keyPath, notes);
  }
  if (typeof ours === 'number' && typeof theirs === 'number') {
    if (keyPath[0] === 'metrics') {
      const b = typeof base === 'number' ? base : 0;
      return ours + theirs - b;
    }
    return Math.max(ours, theirs);
  }
  if (typeof ours === 'string' && typeof theirs === 'string' && ISO_DATE.test(ours) && ISO_DATE.test(theirs)) {
    return ours >= theirs ? ours : theirs;
  }
  notes.push(`${keyPath.join('.') || '(root)'}: changed on both sides; kept ours`);
  return ours;
}

/**
 * mergeStateJson(baseText, oursText, theirsText) -> {ok: true, text, notes} | {ok: false, reason}
 */
function mergeStateJson(baseText, oursText, theirsText) {
  const notes = [];

  let base = {};
  if (typeof baseText === 'string' && baseText.trim() !== '') {
    const parsed = tryParse(baseText);
    if (parsed.ok && isPlain(parsed.value)) base = parsed.value;
    else notes.push('base: unparsable or not a JSON object; treated as {}');
  }

  const ours = tryParse(oursText);
  if (!ours.ok) return { ok: false, reason: `ours is not valid JSON: ${ours.error}` };
  if (!isPlain(ours.value)) return { ok: false, reason: 'ours is not a JSON object' };

  const theirs = tryParse(theirsText);
  if (!theirs.ok) return { ok: false, reason: `theirs is not valid JSON: ${theirs.error}` };
  if (!isPlain(theirs.value)) return { ok: false, reason: 'theirs is not a JSON object' };

  const merged = mergeValue(base, ours.value, theirs.value, [], notes);
  return { ok: true, text: JSON.stringify(merged, null, 2), notes };
}

module.exports = { mergeStateJson, canonicalJson };
