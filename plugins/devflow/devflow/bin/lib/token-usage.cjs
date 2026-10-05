'use strict';

/**
 * token-usage.cjs (TRD 57-01, EST-06 / EST-07) — how many tokens did the executor for TRD `NN-MM` of this repo spend,
 * read from Claude Code session transcripts.
 *
 * The forward stamp (57-03) and the historical backfill (57-04) both call this module, so they agree by construction.
 *
 * Counting rule: Claude Code writes one transcript record per content block, and every record of one API message
 * repeats the same `message.usage` (only the last carries the final output_tokens). A per-record sum double or triple
 * counts, so usage is keyed by `message.id` and each API message counts once. Transcripts are parsed through
 * context-audit.forEachRecord, the same reader `df-tools context` uses.
 */

const { forEachRecord } = require('./context-audit.cjs');

const SYNTHETIC_MODEL = '<synthetic>';

/** A non-negative finite token count, else 0. */
function count(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

function zeroTotals() {
  return { messages: 0, input: 0, cache_creation: 0, cache_read: 0, output: 0 };
}

function addUsage(totals, usage) {
  totals.messages += 1;
  totals.input += count(usage.input_tokens);
  totals.cache_creation += count(usage.cache_creation_input_tokens);
  totals.cache_read += count(usage.cache_read_input_tokens);
  totals.output += count(usage.output_tokens);
}

/**
 * Usage of one transcript, each API message counted once.
 *
 * Only `type:'assistant'` rows with an object `message.usage` and a model other than `<synthetic>` count. The dedupe key
 * is `message.id`, else the row's `uuid` (a row with neither counts on its own). Per key the record with the largest
 * output_tokens wins; on a tie the first one seen stays.
 *
 * @param {string} file  a transcript .jsonl path
 * @returns {{readable: boolean, messages: number, input: number, cache_creation: number, cache_read: number,
 *   output: number, by_model: Object<string, {messages, input, cache_creation, cache_read, output}>}}
 */
function sumUsage(file) {
  const perMessage = new Map(); // key -> { model, usage }
  let anonymous = 0;
  const readable = forEachRecord(file, (row) => {
    if (!row || typeof row !== 'object' || row.type !== 'assistant') return;
    const msg = row.message;
    if (!msg || typeof msg !== 'object') return;
    const usage = msg.usage;
    if (!usage || typeof usage !== 'object') return;
    const model = typeof msg.model === 'string' && msg.model ? msg.model : 'unknown';
    if (model === SYNTHETIC_MODEL) return;

    let k;
    if (typeof msg.id === 'string' && msg.id) k = `id:${msg.id}`;
    else if (typeof row.uuid === 'string' && row.uuid) k = `uuid:${row.uuid}`;
    else k = `row:${anonymous++}`;

    const prev = perMessage.get(k);
    if (!prev || count(usage.output_tokens) > count(prev.usage.output_tokens)) perMessage.set(k, { model, usage });
  });

  const out = { readable, ...zeroTotals(), by_model: {} };
  for (const { model, usage } of perMessage.values()) {
    addUsage(out, usage);
    if (!out.by_model[model]) out.by_model[model] = zeroTotals();
    addUsage(out.by_model[model], usage);
  }
  return out;
}

/**
 * The raw model id with the largest output total; a tie picks the lexicographically smaller id. Null when empty.
 * Model ids are NOT normalised here (`claude-opus-5[1m]` stays as written); 57-02 owns the pricing normaliser.
 *
 * @param {Object<string, {output: number}>} byModel
 * @returns {string|null}
 */
function pickModel(byModel) {
  let best = null;
  let bestOut = -1;
  for (const model of Object.keys(byModel || {}).sort()) {
    const out = count(byModel[model] && byModel[model].output);
    if (out > bestOut) { best = model; bestOut = out; }
  }
  return best;
}

module.exports = {
  sumUsage,
  pickModel,
};
