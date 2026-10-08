'use strict';

/**
 * Tests for validate health Check 18: a stale pinned model id, W063 (TRD 61-07, OBS-01).
 *
 * Check 18 renders what model-currency.staleModelIds returns for the running engine's model-profiles.json against its
 * model-rates.json, so these tests prove the rendering: W063 is a warning that is never repairable, superseded and
 * unpriced pins read differently, and a check that cannot run says so instead of going silent.
 *
 * Hermetic: a temp project and a temp homeDir per test, mainVersionFn stubbed (no git fetch), and the profiles and rates
 * are literal files written here and injected through the modelProfilesPath / modelRatesPath options. Test 15 alone
 * uses the engine's own files, on purpose.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { cmdValidateHealth } = require('./validate.cjs');
const { MODEL_PROFILES_JSON, MODEL_RATES_JSON } = require('./__fixtures__/doctor-fixtures.cjs');

const INSTALLED = () => ({ version: '2.14.0', installPath: '/fake' });
const FIX = 'Update the plugin (`/plugin update devflow@aocyber`); in the DevFlow source, update models in '
  + 'references/model-profiles.json';

let root = null;
let home = null;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-validate-models-'));
  fs.mkdirSync(path.join(root, '.planning', 'objectives'), { recursive: true });
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-validate-models-home-'));
});

afterEach(() => {
  for (const dir of [root, home]) if (dir) fs.rmSync(dir, { recursive: true, force: true });
  root = null;
  home = null;
});

/** Write a literal JSON (object) or raw text (string) file under the temp home and return its path. */
function literal(name, value) {
  const file = path.join(home, name);
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', 'utf-8');
  return file;
}

function profilesWith(models) {
  const doc = JSON.parse(JSON.stringify(MODEL_PROFILES_JSON));
  Object.assign(doc.models, models);
  return doc;
}

/** cmdValidateHealth ends in output(), which prints and exits: capture the JSON and swallow the exit. */
function runHealth(extra = {}) {
  const chunks = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { chunks.push(chunk); return true; };
  const origExit = process.exit.bind(process);
  process.exit = (code) => { throw new Error(`process.exit(${code})`); };
  try {
    cmdValidateHealth(root, { homeDir: home, mainVersionFn: () => null, installedPluginFn: INSTALLED, ...extra }, true);
  } catch (e) {
    if (!e.message.startsWith('process.exit')) throw e;
  } finally {
    process.stdout.write = origWrite;
    process.exit = origExit;
  }
  return JSON.parse(chunks[chunks.length - 1]);
}

const w063 = (json) => [...json.errors, ...json.warnings, ...json.info].filter((i) => i.code === 'W063');

describe('Check 18: W063 stale pinned model id', () => {
  test('12. a superseded opus pin -> one W063 warning naming the tier, both ids and the table, never repairable', () => {
    const json = runHealth({
      modelProfilesPath: literal('profiles.json', profilesWith({ opus: 'claude-opus-5' })),
      modelRatesPath: literal('rates.json', MODEL_RATES_JSON),
    });
    const found = w063(json);
    assert.equal(found.length, 1, JSON.stringify(found));
    assert.equal(json.warnings.filter((i) => i.code === 'W063').length, 1, 'reported as a warning, not an error or info');
    assert.equal(
      found[0].message,
      'model-id-stale: models.opus = claude-opus-5 is superseded by claude-opus-5-5 (model-rates.json)',
    );
    assert.equal(found[0].repairable, false);
    assert.equal(found[0].fix, FIX);
  });

  test('13. current pins -> no W063', () => {
    const json = runHealth({
      modelProfilesPath: literal('profiles.json', MODEL_PROFILES_JSON),
      modelRatesPath: literal('rates.json', MODEL_RATES_JSON),
    });
    assert.deepEqual(w063(json), []);
  });

  test('13. a pin the rate table does not price -> W063 model-id-unknown', () => {
    const json = runHealth({
      modelProfilesPath: literal('profiles.json', profilesWith({ sonnet: 'claude-sonnet-9' })),
      modelRatesPath: literal('rates.json', MODEL_RATES_JSON),
    });
    const found = w063(json);
    assert.equal(found.length, 1, JSON.stringify(found));
    assert.equal(
      found[0].message,
      'model-id-unknown: models.sonnet = claude-sonnet-9 is not in model-rates.json, so its currency cannot be checked',
    );
    assert.equal(found[0].repairable, false);
  });

  test('14. an unreadable profiles path -> one W063 model-id-check-failed, and the health run still completes', () => {
    const json = runHealth({
      modelProfilesPath: path.join(home, 'missing-profiles.json'),
      modelRatesPath: literal('rates.json', MODEL_RATES_JSON),
    });
    const found = w063(json);
    assert.equal(found.length, 1, JSON.stringify(found));
    assert.match(found[0].message, /^model-id-check-failed: /);
    assert.equal(found[0].repairable, false);
    assert.ok(['healthy', 'degraded', 'broken'].includes(json.status), json.status);
  });

  test('14. an unreadable rate table -> one W063 model-id-check-failed', () => {
    const json = runHealth({
      modelProfilesPath: literal('profiles.json', MODEL_PROFILES_JSON),
      modelRatesPath: literal('rates.json', '{ not json'),
    });
    const found = w063(json);
    assert.equal(found.length, 1, JSON.stringify(found));
    assert.match(found[0].message, /^model-id-check-failed: /);
  });

  test('15. without the options the engine\'s own files are read, and the shipped pins are current', () => {
    assert.deepEqual(w063(runHealth()), []);
  });
});
