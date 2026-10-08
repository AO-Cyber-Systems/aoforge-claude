'use strict';

/**
 * 13-model-profiles.test.cjs — TRD 45-05 task 3 (DOC-05): the model-profiles doctor check.
 * TRD 61-07 (OBS-01) adds stale-id detection against model-rates.json (tests 7-11).
 *
 * Report-only. The "mirror" copy lives at <home>/.claude/aoforge/references/model-profiles.json and the
 * "installed" copy at <installPath>/aoforge/references/model-profiles.json; both under a temp home. The rate table
 * sits next to each copy (references/model-rates.json) only where a test writes one; with neither, the check falls
 * back to the engine's own shipped table.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const doctor = require('../doctor.cjs');
const {
  makeDoctorHome, makeInstalledPlugin, makeMirror, PLUGIN_ROOT, MODEL_PROFILES_JSON, MODEL_RATES_JSON,
} = require('../__fixtures__/doctor-fixtures.cjs');
const { loadRates } = require('../calibration-inputs.cjs');
const { currentByFamily } = require('../model-currency.cjs');

const check = require('./13-model-profiles.cjs');

const REAL_PATH = path.join(PLUGIN_ROOT, 'aoforge', 'references', 'model-profiles.json');
const REL = 'references/model-profiles.json';
const RATES_REL = 'references/model-rates.json';
const SOURCE_HINT = 'update models in plugins/aoforge/aoforge/references/model-profiles.json and release';

function ctxFor(home) {
  return doctor.buildContext({ userHome: home, env: {}, now: new Date('2026-09-30T12:00:00Z') });
}

const clone = (v) => JSON.parse(JSON.stringify(v));
const asText = (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2) + '\n');

/**
 * A home whose mirror and/or installed plugin carry the given model-profiles content
 * (object => JSON, string => raw bytes, undefined => the file is absent there). `mirrorRates` /
 * `installedRates` write references/model-rates.json next to that copy the same way.
 */
function homeWith({ mirror, installed, mirrorRates, installedRates } = {}) {
  const home = makeDoctorHome();
  const mirrorFiles = {};
  if (mirror !== undefined) mirrorFiles[REL] = asText(mirror);
  if (mirrorRates !== undefined) mirrorFiles[RATES_REL] = asText(mirrorRates);
  if (Object.keys(mirrorFiles).length > 0) {
    makeMirror(home, { version: '2.11.0', files: mirrorFiles });
  }
  const files = installed === undefined ? {} : { ['aoforge/' + REL]: asText(installed) };
  if (installedRates !== undefined) files['aoforge/' + RATES_REL] = asText(installedRates);
  const { installPath } = makeInstalledPlugin(home, { version: '2.11.0', files });
  if (installed === undefined) {
    fs.rmSync(path.join(installPath, 'aoforge', REL), { force: true });
  }
  return home;
}

/** MODEL_RATES_JSON without the given ids (and any alias pointing at them). */
function ratesWithout(...ids) {
  const r = clone(MODEL_RATES_JSON);
  for (const id of ids) delete r.models[id];
  for (const [alias, target] of Object.entries(r.aliases)) if (!r.models[target]) delete r.aliases[alias];
  return r;
}

/** The profiles fixture with some tiers repinned. */
function pinned(models) {
  const doc = clone(MODEL_PROFILES_JSON);
  Object.assign(doc.models, models);
  return doc;
}

describe('13-model-profiles check', () => {
  test('exports a report-only global check', () => {
    assert.equal(check.id, 'model-profiles');
    assert.equal(check.scope, 'global');
    assert.equal(typeof check.run, 'function');
    assert.equal(check.fix, undefined);
  });

  test('12. the real bundled model-profiles.json is ok; the ids are visible in the finding and details', () => {
    const real = JSON.parse(fs.readFileSync(REAL_PATH, 'utf-8'));
    const home = homeWith({ mirror: real });
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'ok', r.finding);
    assert.equal(r.fixable, false);
    assert.deepEqual(r.details.models, real.models);
    assert.equal(r.details.source, 'mirror');
    const expected = 'models: ' + Object.entries(real.models).map(([k, v]) => `${k}=${v}`).join(', ');
    assert.ok(r.finding.startsWith(expected), r.finding);
  });

  test('12b. with no mirror file, the installed copy is validated (source installed)', () => {
    const home = homeWith({ installed: MODEL_PROFILES_JSON });
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'ok', r.finding);
    assert.equal(r.details.source, 'installed');
    assert.deepEqual(r.details.models, MODEL_PROFILES_JSON.models);
  });

  test('12c. identical mirror and installed: ok, and installed_models is reported', () => {
    const home = homeWith({ mirror: MODEL_PROFILES_JSON, installed: MODEL_PROFILES_JSON });
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'ok', r.finding);
    assert.deepEqual(r.details.installed_models, MODEL_PROFILES_JSON.models);
  });

  test('12d. an id with the [1m] suffix and a multi-part version is a valid shape', () => {
    const doc = clone(MODEL_PROFILES_JSON);
    doc.models.opus = 'claude-opus-4-7[1m]';
    doc.models.sonnet = 'claude-sonnet-4-5-20250929';
    // A rate table in which these are the newest ids, so only the shape is under test here (61-07).
    const rates = clone(MODEL_RATES_JSON);
    const row = rates.models['claude-opus-5'];
    rates.models = {
      'claude-opus-4-7': row,
      'claude-sonnet-4-5-20250929': row,
      'claude-haiku-4-5-20251001': MODEL_RATES_JSON.models['claude-haiku-4-5-20251001'],
    };
    const r = check.run(ctxFor(homeWith({ mirror: doc, mirrorRates: rates })));
    assert.equal(r.severity, 'ok', r.finding);
  });

  test('13a. an agent tier naming an undefined model key warns and names the agent and key', () => {
    const doc = clone(MODEL_PROFILES_JSON);
    doc.agents.executor.balanced = 'gpt';
    const r = check.run(ctxFor(homeWith({ mirror: doc })));
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, false);
    assert.ok(r.finding.includes('executor'), r.finding);
    assert.ok(r.finding.includes('gpt'), r.finding);
    assert.ok(r.fix_command.includes('model-profiles.json'), r.fix_command);
  });

  test('13b. a models value with a bad shape warns and names it', () => {
    const doc = clone(MODEL_PROFILES_JSON);
    doc.models.opus = 'opus-latest';
    const r = check.run(ctxFor(homeWith({ mirror: doc })));
    assert.equal(r.severity, 'warn');
    assert.ok(r.finding.includes('opus-latest'), r.finding);
    assert.deepEqual(r.details.models, doc.models);
  });

  test('13c. structurally wrong documents warn instead of throwing', () => {
    for (const bad of [
      { agents: MODEL_PROFILES_JSON.agents },              // no models
      { models: MODEL_PROFILES_JSON.models },              // no agents
      { models: 'opus', agents: [] },                       // wrong types
      { models: MODEL_PROFILES_JSON.models, agents: { planner: 'opus' } }, // agent entry not an object
      [],                                                   // not an object at all
      null,
    ]) {
      const r = check.run(ctxFor(homeWith({ mirror: bad })));
      assert.equal(r.severity, 'warn', JSON.stringify(bad) + ' => ' + r.finding);
      assert.equal(r.fixable, false);
    }
  });

  test('14. mirror ids differing from installed ids warns and lists both', () => {
    const mirrorDoc = clone(MODEL_PROFILES_JSON);
    mirrorDoc.models.sonnet = 'claude-sonnet-4-5';
    const installedDoc = clone(MODEL_PROFILES_JSON);
    installedDoc.models.sonnet = 'claude-sonnet-5';
    const r = check.run(ctxFor(homeWith({ mirror: mirrorDoc, installed: installedDoc })));
    assert.equal(r.severity, 'warn');
    assert.ok(r.finding.includes('mirror model ids differ from installed plugin'), r.finding);
    assert.ok(r.finding.includes('claude-sonnet-4-5'), r.finding);
    assert.ok(r.finding.includes('claude-sonnet-5'), r.finding);
    assert.deepEqual(r.details.models, mirrorDoc.models);
    assert.deepEqual(r.details.installed_models, installedDoc.models);
    assert.equal(r.details.source, 'mirror');
    assert.equal(r.fixable, false);
  });

  test('15a. the file missing in both locations warns (not error) and does not throw', () => {
    const home = homeWith({});
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, false);
    assert.match(r.finding, /model-profiles\.json/);
  });

  test('15b. garbage in both locations warns (not error) and does not throw', () => {
    const home = homeWith({ mirror: '{ definitely not json', installed: 'also <<< garbage' });
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'warn');
    assert.match(r.finding, /model-profiles\.json/);
  });

  test('15c. no installed plugin and no mirror at all still does not throw', () => {
    const home = makeDoctorHome();
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'warn');
  });

  test('15d. a garbage mirror with a good installed copy warns about the mirror and still validates installed', () => {
    const home = homeWith({ mirror: '{ nope', installed: MODEL_PROFILES_JSON });
    const r = check.run(ctxFor(home));
    assert.equal(r.severity, 'warn');
    assert.match(r.finding, /mirror/);
    assert.deepEqual(r.details.models, MODEL_PROFILES_JSON.models);
    assert.equal(r.details.source, 'installed');
  });
});

describe('13-model-profiles check: pinned ids against model-rates.json (TRD 61-07, OBS-01)', () => {
  test('7. a superseded pin warns, naming the tier, the pinned id and the current id', () => {
    const doc = pinned({ opus: 'claude-opus-5' });
    const r = check.run(ctxFor(homeWith({ mirror: doc, installed: doc, mirrorRates: MODEL_RATES_JSON })));
    assert.equal(r.severity, 'warn');
    assert.ok(
      r.finding.includes('models.opus = claude-opus-5 is superseded by claude-opus-5-5 (model-rates.json)'),
      r.finding,
    );
    assert.deepEqual(r.details.stale, [
      { tier: 'opus', id: 'claude-opus-5', reason: 'superseded', current: 'claude-opus-5-5' },
    ]);
    assert.equal(r.details.rates_source, 'mirror');
    assert.equal(r.fix_command, SOURCE_HINT);
    assert.equal(r.fixable, false);
  });

  test('8. current pins are ok, with an empty stale list', () => {
    const r = check.run(ctxFor(homeWith({
      mirror: MODEL_PROFILES_JSON, installed: MODEL_PROFILES_JSON, mirrorRates: MODEL_RATES_JSON,
    })));
    assert.equal(r.severity, 'ok', r.finding);
    assert.deepEqual(r.details.stale, []);
    assert.equal(r.details.rates_source, 'mirror');
  });

  test('9. mirror profiles are judged against the mirror rate table first', () => {
    // The mirror table stops at opus-5, the installed one does not: opus-5 is current only if the mirror table is used.
    const doc = pinned({ opus: 'claude-opus-5' });
    const r = check.run(ctxFor(homeWith({
      mirror: doc, installed: doc, mirrorRates: ratesWithout('claude-opus-5-5'), installedRates: MODEL_RATES_JSON,
    })));
    assert.equal(r.severity, 'ok', r.finding);
    assert.equal(r.details.rates_source, 'mirror');
  });

  test('9. no mirror rate table -> the installed copy\'s table', () => {
    const doc = pinned({ opus: 'claude-opus-5' });
    const r = check.run(ctxFor(homeWith({
      mirror: doc, installed: doc, installedRates: ratesWithout('claude-opus-5-5'),
    })));
    assert.equal(r.severity, 'ok', r.finding);
    assert.equal(r.details.rates_source, 'installed');
  });

  test('9. installed profiles (no mirror copy) use the installed table', () => {
    const doc = pinned({ opus: 'claude-opus-5' });
    const r = check.run(ctxFor(homeWith({ installed: doc, installedRates: ratesWithout('claude-opus-5-5') })));
    assert.equal(r.severity, 'ok', r.finding);
    assert.equal(r.details.source, 'installed');
    assert.equal(r.details.rates_source, 'installed');
  });

  test('9. neither copy has a rate table -> the engine\'s own model-rates.json', () => {
    const doc = pinned({ opus: 'claude-opus-4-8' });
    const r = check.run(ctxFor(homeWith({ mirror: doc, installed: doc })));
    assert.equal(r.details.rates_source, 'engine');
    assert.equal(r.severity, 'warn');
    const engineCurrent = currentByFamily(loadRates()).opus;
    assert.deepEqual(r.details.stale, [
      { tier: 'opus', id: 'claude-opus-4-8', reason: 'superseded', current: engineCurrent },
    ]);
  });

  test('9. an unreadable rate table warns and falls through to the next one', () => {
    const doc = pinned({ opus: 'claude-opus-5' });
    const r = check.run(ctxFor(homeWith({
      mirror: doc, installed: doc, mirrorRates: '{ not json', installedRates: ratesWithout('claude-opus-5-5'),
    })));
    assert.equal(r.severity, 'warn');
    assert.equal(r.details.rates_source, 'installed');
    assert.deepEqual(r.details.stale, []);
    assert.match(r.finding, /mirror model-rates\.json/);
  });

  test('10. a pinned id the rate table does not price warns that its currency cannot be checked', () => {
    const doc = pinned({ opus: 'claude-opus-9' });
    const r = check.run(ctxFor(homeWith({ mirror: doc, installed: doc, mirrorRates: MODEL_RATES_JSON })));
    assert.equal(r.severity, 'warn');
    assert.ok(r.finding.includes('models.opus = claude-opus-9 is not in model-rates.json'), r.finding);
    assert.deepEqual(r.details.stale, [
      { tier: 'opus', id: 'claude-opus-9', reason: 'unpriced', current: 'claude-opus-5-5' },
    ]);
  });

  test('11. a malformed id is reported once, structurally, and not again as unpriced', () => {
    const doc = pinned({ opus: 'opus-latest' });
    const r = check.run(ctxFor(homeWith({ mirror: doc, installed: doc, mirrorRates: MODEL_RATES_JSON })));
    assert.equal(r.severity, 'warn');
    assert.deepEqual(r.details.issues, ['mirror model-profiles.json: models.opus = "opus-latest" is not a claude model id']);
    assert.deepEqual(r.details.stale, []);
  });

  test('11. drift still reports first, and the stale finding is appended after it', () => {
    const mirrorDoc = pinned({ sonnet: 'claude-sonnet-5' });
    const r = check.run(ctxFor(homeWith({
      mirror: mirrorDoc, installed: MODEL_PROFILES_JSON, mirrorRates: MODEL_RATES_JSON,
    })));
    assert.equal(r.severity, 'warn');
    assert.equal(r.details.issues.length, 2, JSON.stringify(r.details.issues));
    assert.match(r.details.issues[0], /^mirror model ids differ from installed plugin/);
    assert.match(r.details.issues[1], /models\.sonnet = claude-sonnet-5 is superseded by claude-sonnet-5-5/);
  });

  test('11. structural problems come first, stale ones after, and the +N more cap still applies', () => {
    const doc = pinned({ opus: 'claude-opus-5' });
    for (let i = 0; i < 6; i++) doc.agents[`agent${i}`] = { quality: `nope${i}` };
    const r = check.run(ctxFor(homeWith({ mirror: doc, installed: doc, mirrorRates: MODEL_RATES_JSON })));
    assert.equal(r.severity, 'warn');
    assert.equal(r.details.issues.length, 7);
    assert.match(r.details.issues[6], /models\.opus = claude-opus-5 is superseded by claude-opus-5-5/);
    assert.ok(r.finding.endsWith('; +1 more'), r.finding);
    assert.equal(r.fix_command, SOURCE_HINT);
  });
});
