'use strict';

// Test list (objective 72, TRD 72-02):
//  1. NAMES and LEGACY are frozen; assigning a key throws in strict mode.
//  2. Every NAMES key exists in LEGACY (same key set apart from the LEGACY-only keys).
//  3. Exact pairs from the 72-CONTEXT name map.
//  4. SHIM_REMOVAL is the string 'the release after 3.0.0'.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { NAMES, LEGACY, SHIM_REMOVAL } = require('./legacy-names.cjs');

const LEGACY_ONLY = ['commandNsShort', 'commandDash', 'installPrefix'];

describe('legacy-names', () => {
  it('1. NAMES and LEGACY are frozen', () => {
    assert.ok(Object.isFrozen(NAMES));
    assert.ok(Object.isFrozen(LEGACY));
    assert.throws(() => {
      NAMES.slug = 'x';
    }, TypeError);
    assert.throws(() => {
      LEGACY.slug = 'x';
    }, TypeError);
  });

  it('2. NAMES keys are all in LEGACY; LEGACY adds only its own keys', () => {
    for (const key of Object.keys(NAMES)) {
      assert.ok(key in LEGACY, `LEGACY is missing ${key}`);
    }
    const extra = Object.keys(LEGACY).filter((k) => !(k in NAMES)).sort();
    assert.deepEqual(extra, [...LEGACY_ONLY].sort());
  });

  it('3. holds the exact pairs of the 72-CONTEXT name map', () => {
    const pairs = {
      product: ['DevFlow', 'AOForge'],
      slug: ['devflow', 'aoforge'],
      upper: ['DEVFLOW', 'AOFORGE'],
      cli: ['df-tools', 'aof-tools'],
      banner: ['DF ►', 'AOF ►'],
      planningDir: ['.planning', '.aoforge'],
      runtimeDir: ['devflow', 'aoforge'],
      envPrefix: ['DEVFLOW_', 'AOFORGE_'],
      agentNs: ['devflow:', 'aoforge:'],
      commandNs: ['/devflow:', '/aoforge:'],
      configKey: ['devflow', 'aoforge'],
      blockTag: ['DEVFLOW', 'AOFORGE'],
      markerNs: ['devflow', 'aoforge'],
      checkContextNs: ['devflow/', 'aoforge/'],
      userDotDir: ['.devflow', '.aoforge'],
      notices: ['.devflow-notices.json', '.aoforge-notices.json'],
      repo: ['devflow-claude', 'aoforge-claude'],
      pagesProject: ['devflow-docs', 'aoforge-docs'],
      checksWorkflow: ['devflow-checks.yml', 'aoforge-checks.yml'],
      checksCaller: ['devflow.yml', 'aoforge.yml'],
      watch: ['devflow-watch', 'aoforge-watch'],
      adoptBranch: ['devflow/adopt', 'aoforge/adopt'],
      plugin: ['devflow@aocyber', 'aoforge@aocyber'],
    };
    for (const [key, [legacy, current]] of Object.entries(pairs)) {
      assert.equal(LEGACY[key], legacy, `LEGACY.${key}`);
      assert.equal(NAMES[key], current, `NAMES.${key}`);
    }
    assert.deepEqual(Object.keys(NAMES).sort(), Object.keys(pairs).sort());
    assert.equal(LEGACY.commandNsShort, '/df:');
    assert.equal(LEGACY.commandDash, '/df-');
    assert.equal(LEGACY.installPrefix, 'df-');
  });

  it('4. SHIM_REMOVAL names the release', () => {
    assert.equal(SHIM_REMOVAL, 'the release after 3.0.0');
  });
});
