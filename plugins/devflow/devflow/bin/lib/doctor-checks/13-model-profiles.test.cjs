'use strict';

/**
 * 13-model-profiles.test.cjs — TRD 45-05 task 3 (DOC-05): the model-profiles doctor check.
 *
 * Report-only. The "mirror" copy lives at <home>/.claude/devflow/references/model-profiles.json and the
 * "installed" copy at <installPath>/devflow/references/model-profiles.json; both under a temp home.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const doctor = require('../doctor.cjs');
const {
  makeDoctorHome, makeInstalledPlugin, makeMirror, PLUGIN_ROOT, MODEL_PROFILES_JSON,
} = require('../__fixtures__/doctor-fixtures.cjs');

const check = require('./13-model-profiles.cjs');

const REAL_PATH = path.join(PLUGIN_ROOT, 'devflow', 'references', 'model-profiles.json');
const REL = 'references/model-profiles.json';

function ctxFor(home) {
  return doctor.buildContext({ userHome: home, env: {}, now: new Date('2026-09-30T12:00:00Z') });
}

const clone = (v) => JSON.parse(JSON.stringify(v));
const asText = (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2) + '\n');

/**
 * A home whose mirror and/or installed plugin carry the given model-profiles content
 * (object => JSON, string => raw bytes, undefined => the file is absent there).
 */
function homeWith({ mirror, installed } = {}) {
  const home = makeDoctorHome();
  if (mirror !== undefined) {
    makeMirror(home, { version: '2.11.0', files: { [REL]: asText(mirror) } });
  }
  const files = installed === undefined ? {} : { ['devflow/' + REL]: asText(installed) };
  const { installPath } = makeInstalledPlugin(home, { version: '2.11.0', files });
  if (installed === undefined) {
    fs.rmSync(path.join(installPath, 'devflow', REL), { force: true });
  }
  return home;
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
    const r = check.run(ctxFor(homeWith({ mirror: doc })));
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
