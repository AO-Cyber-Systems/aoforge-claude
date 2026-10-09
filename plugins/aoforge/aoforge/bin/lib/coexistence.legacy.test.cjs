'use strict';

// Test list (TRD 72-10, objective 72, INST-05): AOForge detects the old plugin installed beside it.
//
// Every case runs on a fake home from __fixtures__/legacy-plugin-fixtures.cjs; the real ~/.claude is never read.
//
// 1. No installed_plugins.json -> { installed: false, enabled: false, version: null, pointer: false }.
// 2. The old plugin 2.15.0 installed, no enabledPlugins entry -> enabled true, version '2.15.0', pointer false.
// 3. Same with enabledPlugins["devflow@aocyber"] = false -> installed, enabled false.
//    3b. The false entry in settings.local.json disables it too; a true entry there beats a false one in
//        settings.json (the local file wins).
// 4. The old plugin 3.0.0 (the pointer release) installed and enabled -> pointer true.
// 5. coexistenceMessage names the version, says the gates may run twice (non-pointer only) and gives
//    `claude plugin disable devflow@aocyber`; null when the old plugin is not enabled.
// 5b. A corrupt installed_plugins.json or a corrupt settings file never throws: corrupt plugins -> not installed;
//     corrupt settings -> the default (enabled).
// 5c. detectLegacyPlugin requires userHome (no default to the real home).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { pluginHome } = require('./__fixtures__/legacy-plugin-fixtures.cjs');
const coexistence = require('./coexistence.cjs');

function withHome(opts, fn) {
  const h = pluginHome(opts);
  try {
    return fn(h);
  } finally {
    h.cleanup();
  }
}

const detect = (home) => coexistence.detectLegacyPlugin({ userHome: home });

describe('coexistence.detectLegacyPlugin', () => {
  it('1. no installed_plugins.json -> not installed, not enabled', () => {
    withHome({ aoforge: null }, ({ home }) => {
      assert.equal(fs.existsSync(path.join(home, '.claude', 'plugins', 'installed_plugins.json')), false);
      assert.deepEqual(detect(home), { installed: false, enabled: false, version: null, pointer: false });
    });
  });

  it('1b. AOForge alone installed -> the old plugin is not installed', () => {
    withHome({}, ({ home }) => {
      assert.deepEqual(detect(home), { installed: false, enabled: false, version: null, pointer: false });
    });
  });

  it('2. devflow 2.15.0 installed, no settings entry -> enabled, version 2.15.0, not the pointer', () => {
    withHome({ devflow: { version: '2.15.0' } }, ({ home }) => {
      assert.deepEqual(detect(home), { installed: true, enabled: true, version: '2.15.0', pointer: false });
    });
  });

  it('3. enabledPlugins["devflow@aocyber"] = false -> installed, not enabled', () => {
    withHome({ devflow: { version: '2.15.0', enabled: false } }, ({ home }) => {
      assert.deepEqual(detect(home), { installed: true, enabled: false, version: '2.15.0', pointer: false });
    });
  });

  it('3b. settings.local.json false disables it; a local true beats a settings.json false', () => {
    withHome({ devflow: { version: '2.15.0', enabled: false, settingsFile: 'settings.local.json' } }, ({ home }) => {
      assert.equal(detect(home).enabled, false);
    });
    withHome({ devflow: { version: '2.15.0', enabled: false } }, ({ home }) => {
      fs.writeFileSync(
        path.join(home, '.claude', 'settings.local.json'),
        JSON.stringify({ enabledPlugins: { 'devflow@aocyber': true } })
      );
      assert.equal(detect(home).enabled, true);
    });
  });

  it('4. devflow 3.0.0 (the pointer release) installed and enabled -> pointer true', () => {
    withHome({ devflow: { version: '3.0.0', enabled: true } }, ({ home }) => {
      assert.deepEqual(detect(home), { installed: true, enabled: true, version: '3.0.0', pointer: true });
    });
  });

  it('5b. corrupt files never throw', () => {
    withHome({ corrupt: true, devflow: { version: '2.15.0' } }, ({ home }) => {
      assert.deepEqual(detect(home), { installed: false, enabled: false, version: null, pointer: false });
    });
    withHome({ devflow: { version: '2.15.0' } }, ({ home }) => {
      fs.writeFileSync(path.join(home, '.claude', 'settings.json'), '{ not json');
      assert.deepEqual(detect(home), { installed: true, enabled: true, version: '2.15.0', pointer: false });
    });
    withHome({ aoforge: null }, ({ home }) => {
      const file = path.join(home, '.claude', 'plugins', 'installed_plugins.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      for (const body of ['null', '[]', '{"version":2}', '{"plugins":{"devflow@aocyber":[]}}', '{"plugins":{"devflow@aocyber":[{"scope":"user"}]}}']) {
        fs.writeFileSync(file, body);
        assert.equal(detect(home).installed, false, body);
      }
    });
  });

  it('5c. userHome is required', () => {
    assert.throws(() => coexistence.detectLegacyPlugin({}), /userHome/);
    assert.throws(() => coexistence.detectLegacyPlugin(), /userHome/);
  });
});

describe('coexistence.coexistenceMessage', () => {
  it('5. names the version, the double-gate risk (non-pointer only) and the disable command; null when not enabled', () => {
    const full = coexistence.coexistenceMessage({ installed: true, enabled: true, version: '2.15.0', pointer: false });
    assert.equal(typeof full, 'string');
    assert.match(full, /2\.15\.0/);
    assert.match(full, /twice/);
    assert.ok(full.includes('claude plugin disable devflow@aocyber'), full);
    assert.ok(!full.includes('\n'), 'one line');

    const pointer = coexistence.coexistenceMessage({ installed: true, enabled: true, version: '3.0.0', pointer: true });
    assert.match(pointer, /3\.0\.0/);
    assert.doesNotMatch(pointer, /twice/);
    assert.ok(pointer.includes('claude plugin disable devflow@aocyber'), pointer);

    assert.equal(coexistence.coexistenceMessage({ installed: true, enabled: false, version: '2.15.0', pointer: false }), null);
    assert.equal(coexistence.coexistenceMessage({ installed: false, enabled: false, version: null, pointer: false }), null);
    assert.equal(coexistence.coexistenceMessage(null), null);
  });
});
