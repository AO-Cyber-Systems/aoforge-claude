'use strict';

/**
 * model-currency.test.cjs — TRD 61-07 (OBS-01): whether a pinned model id is current, derived from model-rates.json.
 *
 * Hand-built literal rates and profiles throughout. Only the repo guard (test 6) reads the shipped files, on purpose:
 * it fails CI the day model-rates.json gains a newer model while model-profiles.json still pins the older one.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const mc = require('./model-currency.cjs');
const { loadRates } = require('./calibration-inputs.cjs');
const { MODEL_PROFILES_PATH } = require('./helpers.cjs');

const SRC = 'https://platform.claude.com/docs/en/about-claude/pricing';
const row = (input, output) => ({
  input, output, cache_read: input / 10, cache_write_5m: input * 1.25, cache_write_1h: input * 2,
  source: SRC, as_of: '2026-10-05',
});

// The real file's shape, with the ids test 3 names.
const RATES = {
  models: {
    'claude-opus-4-8': row(5, 25),
    'claude-opus-5': row(5, 25),
    'claude-opus-5-5': row(4, 20),
    'claude-sonnet-5': row(2, 10),
    'claude-sonnet-5-5': row(2, 10),
    'claude-haiku-4-5-20251001': row(1, 5),
    'claude-fable-5-1': row(10, 50),
  },
  aliases: { 'claude-haiku-4-5': 'claude-haiku-4-5-20251001' },
};

describe('parseModelId', () => {
  test('1. family, numeric version and an optional date snapshot', () => {
    assert.deepEqual(mc.parseModelId('claude-opus-5-5'), { family: 'opus', version: [5, 5], snapshot: null });
    assert.deepEqual(mc.parseModelId('claude-opus-5'), { family: 'opus', version: [5], snapshot: null });
    assert.deepEqual(
      mc.parseModelId('claude-haiku-4-5-20251001'),
      { family: 'haiku', version: [4, 5], snapshot: '20251001' },
    );
    assert.deepEqual(mc.parseModelId('claude-opus-4-7[1m]'), { family: 'opus', version: [4, 7], snapshot: null });
    assert.deepEqual(mc.parseModelId('claude-fable-5-1'), { family: 'fable', version: [5, 1], snapshot: null });
  });

  test('1. ids it cannot parse are null, never a throw', () => {
    for (const bad of ['opus-latest', 'claude-3-5-sonnet-20241022', '', null, undefined, 42, {}]) {
      assert.equal(mc.parseModelId(bad), null, JSON.stringify(bad));
    }
  });
});

describe('compareModelVersions', () => {
  test('2. numeric, element by element, with missing parts as zero', () => {
    assert.equal(mc.compareModelVersions([5, 5], [5]), 1);
    assert.equal(mc.compareModelVersions([5], [5, 5]), -1);
    assert.equal(mc.compareModelVersions([5], [5, 0]), 0);
    assert.equal(mc.compareModelVersions([4, 8], [5]), -1);
    assert.equal(mc.compareModelVersions([4, 5], [4, 5]), 0);
    assert.equal(mc.compareModelVersions([4, 10], [4, 9]), 1, 'numbers, not strings');
  });
});

describe('currentByFamily', () => {
  test('3. the newest real entry per family; an alias never becomes the current id', () => {
    assert.deepEqual(mc.currentByFamily(RATES), {
      fable: 'claude-fable-5-1',
      haiku: 'claude-haiku-4-5-20251001',
      opus: 'claude-opus-5-5',
      sonnet: 'claude-sonnet-5-5',
    });
  });

  test('3. families come from the data, and keys are sorted', () => {
    const rates = { models: { 'claude-zeta-1': row(1, 1), 'claude-alpha-2': row(1, 1) }, aliases: {} };
    assert.deepEqual(Object.keys(mc.currentByFamily(rates)), ['alpha', 'zeta']);
  });

  test('3. an equal version prefers the undated id; all dated takes the greatest snapshot', () => {
    const undated = {
      models: { 'claude-haiku-4-5-20251001': row(1, 5), 'claude-haiku-4-5': row(1, 5) },
    };
    assert.equal(mc.currentByFamily(undated).haiku, 'claude-haiku-4-5');
    const dated = {
      models: { 'claude-haiku-4-5-20251001': row(1, 5), 'claude-haiku-4-5-20260101': row(1, 5) },
    };
    assert.equal(mc.currentByFamily(dated).haiku, 'claude-haiku-4-5-20260101');
  });

  test('3. a loadRates() result works the same as the raw literal; junk is an empty map', () => {
    assert.deepEqual(mc.currentByFamily({ ok: true, ...RATES }), mc.currentByFamily(RATES));
    for (const bad of [null, undefined, 'rates', [], { models: 'x' }]) {
      assert.deepEqual(mc.currentByFamily(bad), {}, JSON.stringify(bad));
    }
  });
});

describe('staleModelIds', () => {
  test('4. a superseded pin names the tier, the pinned id and the current id; equal versions are current', () => {
    const models = { opus: 'claude-opus-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-4-5' };
    assert.deepEqual(mc.staleModelIds(models, RATES), [
      { tier: 'opus', id: 'claude-opus-5', reason: 'superseded', current: 'claude-opus-5-5' },
    ]);
  });

  test('4. an id the table does not price is unpriced, with its family current id when known', () => {
    assert.deepEqual(mc.staleModelIds({ opus: 'claude-opus-9' }, RATES), [
      { tier: 'opus', id: 'claude-opus-9', reason: 'unpriced', current: 'claude-opus-5-5' },
    ]);
    assert.deepEqual(mc.staleModelIds({ opus: 'opus-latest' }, RATES), [
      { tier: 'opus', id: 'opus-latest', reason: 'unpriced', current: null },
    ]);
  });

  test('4. a [1m] suffix and a dated snapshot of the current version are current', () => {
    assert.deepEqual(mc.staleModelIds({ opus: 'claude-opus-5-5[1m]' }, RATES), []);
    assert.deepEqual(mc.staleModelIds({ haiku: 'claude-haiku-4-5-20251001' }, RATES), []);
  });

  test('4. a non-object models or rates value is [], never a throw', () => {
    for (const bad of [null, undefined, 'opus', [], 7]) {
      assert.deepEqual(mc.staleModelIds(bad, RATES), [], `models ${JSON.stringify(bad)}`);
      assert.deepEqual(mc.staleModelIds({ opus: 'claude-opus-5' }, bad), [], `rates ${JSON.stringify(bad)}`);
    }
    assert.deepEqual(mc.staleModelIds({ opus: 42, sonnet: null }, RATES), [], 'non-string ids are skipped');
  });

  test('5. the result is sorted by tier name', () => {
    const models = { sonnet: 'claude-sonnet-5', haiku: 'claude-haiku-9', opus: 'claude-opus-4-8' };
    assert.deepEqual(mc.staleModelIds(models, RATES).map((s) => s.tier), ['haiku', 'opus', 'sonnet']);
  });
});

describe('repo guard', () => {
  test('6. the shipped model-profiles.json pins no id that the shipped model-rates.json shows superseded', () => {
    const rates = loadRates();
    assert.equal(rates.ok, true, rates.error);
    const profiles = JSON.parse(fs.readFileSync(MODEL_PROFILES_PATH, 'utf-8'));
    assert.deepEqual(
      mc.staleModelIds(profiles.models, rates),
      [],
      'update models in references/model-profiles.json to the newest ids in references/model-rates.json',
    );
  });
});
