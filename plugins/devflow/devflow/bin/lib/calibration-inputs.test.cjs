'use strict';

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ci = require('./calibration-inputs.cjs');

const MODEL_FIELDS = ['input', 'output', 'cache_read', 'cache_write_5m', 'cache_write_1h'];

const tmpDirs = [];
function tmpDir() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-calibration-inputs-')));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

function writeRates(obj) {
  const file = path.join(tmpDir(), 'rates.json');
  fs.writeFileSync(file, JSON.stringify(obj));
  return file;
}

const GOOD_ENTRY = {
  input: 1, output: 5, cache_read: 0.1, cache_write_5m: 1.25, cache_write_1h: 2,
  source: 'https://example.com/pricing', as_of: '2026-10-05',
};

describe('57-02 model rates', () => {
  test('10: the shipped file carries every field, an https source and a date on every model', () => {
    const rates = ci.loadRates();
    assert.equal(rates.ok, true);
    assert.equal(rates.currency, 'USD');
    assert.equal(rates.unit, 'per_million_tokens');
    assert.ok(Object.keys(rates.models).length >= 7);
    for (const [id, model] of Object.entries(rates.models)) {
      for (const field of MODEL_FIELDS) {
        assert.equal(typeof model[field], 'number', `${id}.${field} is a number`);
      }
      assert.match(model.source, /^https:\/\//, `${id}.source`);
      assert.match(model.as_of, /^\d{4}-\d{2}-\d{2}$/, `${id}.as_of`);
    }
    assert.match(rates.as_of, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(ci.RATES_PATH, path.join(__dirname, '..', '..', 'references', 'model-rates.json'));
  });

  test('10: rateFor resolves the four current ids, a [1m] suffix and the short Haiku alias', () => {
    const rates = ci.loadRates();
    for (const id of ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5-20251001', 'claude-fable-5-1']) {
      const rate = ci.rateFor(rates, id);
      assert.ok(rate, id);
      assert.equal(rate.id, id);
      for (const field of MODEL_FIELDS) assert.equal(typeof rate[field], 'number');
    }
    assert.deepEqual(ci.rateFor(rates, 'claude-opus-5-5'),
      { id: 'claude-opus-5-5', input: 4, output: 20, cache_read: 0.2, cache_write_5m: 5, cache_write_1h: 8 });
    assert.equal(ci.rateFor(rates, 'claude-opus-5[1m]').id, 'claude-opus-5');
    assert.equal(ci.rateFor(rates, 'claude-haiku-4-5').id, 'claude-haiku-4-5-20251001');
    // A different dated snapshot of the same model resolves through the date-stripped alias.
    assert.equal(ci.rateFor(rates, 'claude-haiku-4-5-20260101').id, 'claude-haiku-4-5-20251001');
  });

  test('10: rateFor returns null for <synthetic>, the empty string and an unknown id', () => {
    const rates = ci.loadRates();
    assert.equal(ci.rateFor(rates, '<synthetic>'), null);
    assert.equal(ci.rateFor(rates, ''), null);
    assert.equal(ci.rateFor(rates, undefined), null);
    assert.equal(ci.rateFor(rates, 'claude-unknown-9'), null);
    assert.equal(ci.rateFor({ ok: false, error: 'x' }, 'claude-opus-5-5'), null);
  });

  test('10: normalizeModelId trims, strips a trailing [..] and nulls synthetic or empty ids', () => {
    assert.equal(ci.normalizeModelId('  claude-opus-5[1m] '), 'claude-opus-5');
    assert.equal(ci.normalizeModelId('claude-opus-5-5'), 'claude-opus-5-5');
    assert.equal(ci.normalizeModelId('<synthetic>'), null);
    assert.equal(ci.normalizeModelId(''), null);
    assert.equal(ci.normalizeModelId(null), null);
  });

  test('11: a model missing its source is an error that names the model', () => {
    const { source, ...noSource } = GOOD_ENTRY;
    void source;
    const result = ci.loadRates(writeRates({
      currency: 'USD', unit: 'per_million_tokens',
      models: { 'claude-ok': GOOD_ENTRY, 'claude-no-source': noSource }, aliases: {},
    }));
    assert.equal(result.ok, false);
    assert.match(result.error, /claude-no-source/);
    assert.match(result.error, /source/);
  });

  test('11: a non-numeric rate, an http source and a malformed as_of are errors that name the model', () => {
    for (const [patch, field] of [
      [{ input: '4' }, /input/],
      [{ source: 'http://example.com' }, /source/],
      [{ as_of: 'yesterday' }, /as_of/],
    ]) {
      const result = ci.loadRates(writeRates({ models: { 'claude-bad': { ...GOOD_ENTRY, ...patch } }, aliases: {} }));
      assert.equal(result.ok, false);
      assert.match(result.error, /claude-bad/);
      assert.match(result.error, field);
    }
  });

  test('11: an alias pointing at a missing model is an error', () => {
    const result = ci.loadRates(writeRates({
      models: { 'claude-ok': GOOD_ENTRY }, aliases: { 'claude-short': 'claude-missing' },
    }));
    assert.equal(result.ok, false);
    assert.match(result.error, /claude-short/);
    assert.match(result.error, /claude-missing/);
  });

  test('11: a missing file and invalid JSON are {ok:false}, never a throw', () => {
    assert.equal(ci.loadRates(path.join(tmpDir(), 'absent.json')).ok, false);
    const file = path.join(tmpDir(), 'bad.json');
    fs.writeFileSync(file, '{ not json');
    assert.equal(ci.loadRates(file).ok, false);
  });

  test('11: as_of is the latest entry date', () => {
    const result = ci.loadRates(writeRates({
      models: { a: { ...GOOD_ENTRY, as_of: '2026-09-01' }, b: { ...GOOD_ENTRY, as_of: '2026-10-05' } }, aliases: {},
    }));
    assert.equal(result.ok, true);
    assert.equal(result.as_of, '2026-10-05');
  });
});
