'use strict';

// Test list (objective 72, TRD 72-02):
//  1. NAMES and LEGACY are frozen; assigning a key throws in strict mode.
//  2. Every NAMES key exists in LEGACY (same key set apart from the LEGACY-only keys).
//  3. Exact pairs from the 72-CONTEXT name map.
//  4. SHIM_REMOVAL is the string '3.1.0', the release that removed the one-release shims (objective 78, TRD 78-12).
//  5. SHIM_RELEASE is the string '3.0.x' (objective 78, TRD 78-01).
//  6. Every LEGACY key has a consumer under plugins/aoforge or scripts other than this module and this test (TRD
//     78-12): a direct `LEGACY.<key>` or `LEGACY['<key>']`, a destructuring of LEGACY that names the key, or, for a
//     key NAMES also has, legacy-rewrite.cjs's shared-key loop (gh rebrand rewrites every shared name). A key with no
//     consumer is dead and must go; a removed key with a remaining consumer would be a bug, so this runs first.
//     Repository checkouts only: a mirror install has no scripts/ and skips it.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { NAMES, LEGACY, SHIM_REMOVAL, SHIM_RELEASE } = require('./legacy-names.cjs');

// TRD 78-12 removed commandDash: nothing read it once doc-refs stopped reading pre-rename command forms (TRD 78-02).
const LEGACY_ONLY = ['commandNsShort', 'installPrefix'];

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'scripts', 'aoforge-rename.cjs'));
const SELF = new Set([
  'plugins/aoforge/aoforge/bin/lib/legacy-names.cjs',
  'plugins/aoforge/aoforge/bin/lib/legacy-names.legacy.test.cjs',
]);
const REWRITE = 'plugins/aoforge/aoforge/bin/lib/legacy-rewrite.cjs';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Tracked source files under plugins/aoforge and scripts, relative to the repository, minus this module and test. */
function sources() {
  const r = spawnSync('git', ['-C', REPO_ROOT, 'ls-files', '-z', '--', 'plugins/aoforge', 'scripts'], { encoding: 'utf-8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.split('\0').filter((rel) => /\.(c?js|mjs)$/.test(rel) && !SELF.has(rel));
}

/** The keys a `{ ... } = LEGACY` destructuring in `text` names (`key` or `key: alias`). */
function destructured(text) {
  const keys = new Set();
  for (const m of text.matchAll(/\{([^{}]*)\}\s*=\s*LEGACY\b/g)) {
    for (const part of m[1].split(',')) {
      const key = part.split(':')[0].trim();
      if (key) keys.add(key);
    }
  }
  return keys;
}

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
    assert.equal(LEGACY.installPrefix, 'df-');
    assert.equal('commandDash' in LEGACY, false, 'commandDash was removed (TRD 78-12)');
  });

  it('4. SHIM_REMOVAL is 3.1.0, the release that removed the shims (TRD 78-12)', () => {
    assert.equal(SHIM_REMOVAL, '3.1.0');
  });

  it('5. SHIM_RELEASE is the last release line that carries the shims (TRD 78-01)', () => {
    assert.equal(SHIM_RELEASE, '3.0.x');
  });

  it('6. every LEGACY key has a consumer (TRD 78-12)', { skip: IS_CHECKOUT ? false : 'not a repository checkout' }, () => {
    const files = sources();
    assert.ok(files.length > 500, `scan set too small: ${files.length}`);
    const texts = files.map((rel) => [rel, fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8')]);
    const rewrite = texts.find(([rel]) => rel === REWRITE);
    assert.ok(rewrite, `${REWRITE} is tracked`);
    const sharedLoop = /for \(const key of Object\.keys\(NAMES\)\)[\s\S]{0,200}LEGACY\[key\]/.test(rewrite[1]);
    assert.ok(sharedLoop, 'legacy-rewrite.cjs still maps every key NAMES and LEGACY share');

    const unused = [];
    for (const key of Object.keys(LEGACY)) {
      if (sharedLoop && key in NAMES) continue;
      const direct = new RegExp(`\\bLEGACY(?:\\.${esc(key)}\\b|\\[['"\`]${esc(key)}['"\`]\\])`);
      const users = texts.filter(([, text]) => direct.test(text) || destructured(text).has(key)).map(([rel]) => rel);
      if (users.length === 0) unused.push(key);
    }
    assert.deepEqual(unused, [], `LEGACY keys with no consumer: ${unused.join(', ')}`);
  });
});
