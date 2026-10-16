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
//
// Test list (TRD 78-06, objective 78, SC-3/SC-4): the global leftover detectors and the notice text. Fake homes come
// from __fixtures__/legacy-doctor-fixtures.cjs (leftoverHome); env is always an injected object.
//
// 10. legacyEnvVariables ignores the bare prefix and undefined values, sorts, and names each AOFORGE_* form.
// 10b. legacyRuntimeHome is <home>/.claude/devflow; LEGACY_STATE_MARKER is the 3.0.x migration's marker name.
// 10c. legacyRuntimeState: {present:false} / {present:true, migrated:false} / {present:true, migrated:true}; a file at
//      the old runtime home's path is not present; userHome is required.
// 10d. interimUserFiles lists only TO_RUNTIME/TO_WATCH names that are regular files in ~/.aoforge/ (sorted).
// 10e. TO_RUNTIME/TO_WATCH name 3.0.0's files from NAMES and are frozen.
// 10f. legacyNotices: nothing -> []; one finding per kind, each one line naming its fix; the pointer plugin alone is
//      info; a migrated runtime home is quiet; the env object is never changed and no variable's value is shown.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { pluginHome } = require('./__fixtures__/legacy-plugin-fixtures.cjs');
const { leftoverHome } = require('./__fixtures__/legacy-doctor-fixtures.cjs');
const coexistence = require('./coexistence.cjs');

function withHome(opts, fn) {
  const h = pluginHome(opts);
  try {
    return fn(h);
  } finally {
    h.cleanup();
  }
}

function withLeftover(opts, fn) {
  const h = leftoverHome(opts);
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

describe('coexistence global leftover detectors (TRD 78-06)', () => {
  it('10. legacyEnvVariables: sorted, the bare prefix and undefined values ignored, each with its AOFORGE_* form', () => {
    const env = {
      DEVFLOW_SKIP_UPGRADE: '1',
      DEVFLOW_ALLOW_RAW_COMMIT: '1',
      DEVFLOW_: 'x',
      DEVFLOW_UNSET: undefined,
      AOFORGE_SKIP_PRUNE: '1',
      PATH: '/usr/bin',
    };
    assert.deepEqual(coexistence.legacyEnvVariables(env), [
      { name: 'DEVFLOW_ALLOW_RAW_COMMIT', aoforge: 'AOFORGE_ALLOW_RAW_COMMIT' },
      { name: 'DEVFLOW_SKIP_UPGRADE', aoforge: 'AOFORGE_SKIP_UPGRADE' },
    ]);
    assert.deepEqual(coexistence.legacyEnvVariables({}), []);
    assert.deepEqual(coexistence.legacyEnvVariables(undefined), []);
    assert.deepEqual(coexistence.legacyEnvVariables(null), []);
  });

  it('10b. legacyRuntimeHome and LEGACY_STATE_MARKER', () => {
    assert.equal(coexistence.legacyRuntimeHome('/home/u'), path.join('/home/u', '.claude', 'devflow'));
    assert.equal(coexistence.LEGACY_STATE_MARKER, '.legacy-state-migrated.json');
    assert.equal(/devflow/i.test(coexistence.LEGACY_STATE_MARKER), false, 'the marker name spells no legacy name');
  });

  it('10c. legacyRuntimeState: absent, present and not migrated, present and migrated', () => {
    withLeftover({}, ({ home }) => {
      assert.deepEqual(coexistence.legacyRuntimeState(home), { present: false, migrated: false });
    });
    withLeftover({ legacyRuntime: true }, ({ home }) => {
      assert.deepEqual(coexistence.legacyRuntimeState(home), { present: true, migrated: false });
    });
    withLeftover({ legacyRuntime: true, migrated: true }, ({ home }) => {
      assert.deepEqual(coexistence.legacyRuntimeState(home), { present: true, migrated: true });
    });
    withLeftover({}, ({ home, claudeDir }) => {
      fs.writeFileSync(path.join(claudeDir, 'devflow'), 'not a directory\n');
      assert.equal(coexistence.legacyRuntimeState(home).present, false, 'a file is not a runtime home');
    });
    assert.throws(() => coexistence.legacyRuntimeState(), /userHome/);
    assert.throws(() => coexistence.legacyRuntimeState('relative/home'), /userHome/);
  });

  it('10d. interimUserFiles: only the known names, only regular files, sorted', () => {
    withLeftover(
      { interimFiles: ['defaults.json', 'aoforge-watch.log', 'notes.txt', 'STATE.md', 'brave_api_key/'] },
      ({ home }) => {
        assert.deepEqual(coexistence.interimUserFiles(home), ['aoforge-watch.log', 'defaults.json']);
      }
    );
    withLeftover({}, ({ home }) => {
      assert.deepEqual(coexistence.interimUserFiles(home), [], 'no ~/.aoforge/');
      fs.writeFileSync(path.join(home, '.aoforge'), 'a file, not the directory\n');
      assert.deepEqual(coexistence.interimUserFiles(home), [], '~/.aoforge is a file');
    });
    assert.throws(() => coexistence.interimUserFiles(), /userHome/);
  });

  it('10e. TO_RUNTIME and TO_WATCH: 3.0.0\'s files, frozen', () => {
    assert.deepEqual([...coexistence.TO_RUNTIME], ['defaults.json', 'brave_api_key', 'aoforge-watch-allow.json']);
    assert.deepEqual([...coexistence.TO_WATCH], [
      'aoforge-watch.pid', 'aoforge-watch.log', 'launchd-stdout.log', 'launchd-stderr.log',
      'systemd-stdout.log', 'systemd-stderr.log',
    ]);
    assert.ok(Object.isFrozen(coexistence.TO_RUNTIME));
    assert.ok(Object.isFrozen(coexistence.TO_WATCH));
  });

  it('10f. legacyNotices: nothing found -> []', () => {
    withLeftover({}, ({ home }) => {
      assert.deepEqual(coexistence.legacyNotices({ env: { PATH: '/usr/bin', AOFORGE_SKIP_PRUNE: '1' }, userHome: home }), []);
    });
    withLeftover({ legacyRuntime: true, migrated: true, devflowEnabled: false }, ({ home }) => {
      assert.deepEqual(coexistence.legacyNotices({ env: {}, userHome: home }), [], 'a migrated runtime home is quiet');
    });
    assert.throws(() => coexistence.legacyNotices({ env: {} }), /userHome/);
  });

  it('10f. legacyNotices: each kind names its fix in one line', () => {
    withLeftover(
      { devflowEnabled: true, legacyRuntime: true, interimFiles: ['defaults.json', 'brave_api_key'] },
      ({ home }) => {
        const env = { DEVFLOW_SKIP_EDIT_GATE: 'secret-value', PATH: '/usr/bin' };
        const before = { ...env };
        const found = coexistence.legacyNotices({ env, userHome: home });
        assert.deepEqual(env, before, 'the env object is never changed (no alias is made)');
        assert.deepEqual(found.map((f) => f.kind), ['plugin-enabled', 'legacy-env', 'runtime-not-migrated', 'user-dot-dir']);
        for (const f of found) {
          assert.equal(typeof f.text, 'string');
          assert.equal(f.text.includes('\n'), false, `${f.kind}: one line`);
          assert.equal(f.level, 'action', f.kind);
          assert.equal(f.text.includes('secret-value'), false, `${f.kind}: no variable value is shown`);
        }
        const by = Object.fromEntries(found.map((f) => [f.kind, f.text]));

        assert.ok(by['plugin-enabled'].includes('claude plugin disable devflow@aocyber'), by['plugin-enabled']);
        assert.match(by['plugin-enabled'], /twice/);

        assert.ok(by['legacy-env'].includes('DEVFLOW_SKIP_EDIT_GATE'), by['legacy-env']);
        assert.ok(by['legacy-env'].includes('AOFORGE_SKIP_EDIT_GATE'), by['legacy-env']);
        assert.match(by['legacy-env'], /no longer read/);
        assert.match(by['legacy-env'], /where you set/);

        assert.ok(by['runtime-not-migrated'].includes('~/.claude/devflow/'), by['runtime-not-migrated']);
        assert.match(by['runtime-not-migrated'], /no longer migrates it/);
        assert.ok(by['runtime-not-migrated'].includes('AOForge 3.0.x'), by['runtime-not-migrated']);
        assert.ok(by['runtime-not-migrated'].includes('docs/MIGRATING-TO-AOFORGE.md'), by['runtime-not-migrated']);

        assert.ok(by['user-dot-dir'].includes('~/.aoforge/'), by['user-dot-dir']);
        assert.ok(by['user-dot-dir'].includes('defaults.json'), by['user-dot-dir']);
        assert.ok(by['user-dot-dir'].includes('brave_api_key'), by['user-dot-dir']);
        assert.match(by['user-dot-dir'], /no longer reads them there/);
        assert.ok(by['user-dot-dir'].includes('aof-tools doctor --global --fix'), by['user-dot-dir']);
      }
    );
  });

  it('10f. legacyNotices: the pointer plugin alone is info; detection is injectable', () => {
    withLeftover({}, ({ home }) => {
      const detect = () => ({ installed: true, enabled: true, version: '3.0.0', pointer: true });
      const found = coexistence.legacyNotices({ env: {}, userHome: home, detect });
      assert.equal(found.length, 1);
      assert.equal(found[0].kind, 'plugin-enabled');
      assert.equal(found[0].level, 'info');
      assert.doesNotMatch(found[0].text, /twice/);
    });
  });
});
