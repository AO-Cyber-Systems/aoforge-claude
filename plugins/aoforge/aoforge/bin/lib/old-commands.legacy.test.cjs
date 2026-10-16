'use strict';

// Test list (TRD 78-02, objective 78-remove-the-rename-shims, SC-2): the old commands are gone. The final pointer
// release of the pre-rename plugin left the marketplace in the release after 3.0.0, and with it everything that
// kept the old command forms working in this repository. Written before the removal.
//
// 1. Repo contract (skipped outside an AOForge source checkout, like rename-guard.repo.test.cjs):
//    1a. The pointer plugin directory (`plugins/<legacy slug>/`) does not exist and git tracks nothing under it.
//    1b. `.claude-plugin/marketplace.json` has no plugin entry named or sourced as the legacy plugin.
//    1c. package.json `scripts.test` has no glob under the legacy plugin directory.
//    1d. The pointer generator (`scripts/gen-pointer-skills.cjs`), its test and its fixture are gone.
//    1e. `plugins/aoforge/.claude-plugin/plugin.json`, package.json, the marketplace and its `aoforge` entry carry
//        the same version (no version bump in this TRD).
// 2. skill-route.cjs exports no NAMESPACE_RENAMES (the legacy slash namespaces are no longer a rename source).
//
// Legacy names are built from LEGACY (legacy-names.cjs); this file may spell them, but has no need to.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { NAMES, LEGACY } = require('./legacy-names.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_AOFORGE_CHECKOUT =
  fs.existsSync(path.join(REPO_ROOT, 'README.md')) &&
  fs.existsSync(path.join(REPO_ROOT, 'scripts', 'aoforge-rename.cjs'));

const POINTER_DIR = `plugins/${LEGACY.slug}`;
const POINTER_FILES = [
  'scripts/gen-pointer-skills.cjs',
  'scripts/gen-pointer-skills.legacy.test.cjs',
  'scripts/__fixtures__/legacy-pointer-fixtures.cjs',
];

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8'));

/** Tracked paths under `rel` (a file or a directory), posix-relative. */
function tracked(rel) {
  const r = spawnSync('git', ['ls-files', '--', rel], { cwd: REPO_ROOT, encoding: 'utf-8' });
  assert.equal(r.status, 0, `git ls-files ${rel}: ${r.stderr}`);
  return r.stdout.split('\n').filter(Boolean);
}

describe('old-commands.legacy.test.cjs', () => {
  describe('1: the pointer release is gone (repo contract)', {
    skip: IS_AOFORGE_CHECKOUT ? false : 'not an AOForge source checkout',
  }, () => {
    test('1a: the pointer plugin directory does not exist and nothing under it is tracked', () => {
      assert.equal(fs.existsSync(path.join(REPO_ROOT, POINTER_DIR)), false, `${POINTER_DIR}/ still exists`);
      assert.deepEqual(tracked(POINTER_DIR), [], `${POINTER_DIR}/ still has tracked files`);
    });

    test('1b: the marketplace has no entry named or sourced as the legacy plugin', () => {
      const market = readJson('.claude-plugin/marketplace.json');
      assert.ok(Array.isArray(market.plugins) && market.plugins.length >= 1, 'marketplace.plugins must be a non-empty array');
      const stale = market.plugins.filter(
        (p) => p.name === LEGACY.slug || String(p.source || '').replace(/^\.\//, '') === POINTER_DIR,
      );
      assert.deepEqual(stale.map((p) => p.name), [], 'marketplace entries of the pointer release');
      assert.ok(market.plugins.some((p) => p.name === NAMES.slug), `the ${NAMES.slug} entry must stay`);
    });

    test('1c: npm test runs no glob under the legacy plugin directory', () => {
      const script = readJson('package.json').scripts.test;
      assert.ok(!script.includes(`${POINTER_DIR}/`), `scripts.test still names ${POINTER_DIR}/: ${script}`);
      assert.ok(script.includes(`plugins/${NAMES.slug}/`), `scripts.test must still run plugins/${NAMES.slug}/`);
    });

    test('1d: the pointer generator, its test and its fixture are gone', () => {
      for (const rel of POINTER_FILES) {
        assert.equal(fs.existsSync(path.join(REPO_ROOT, rel)), false, `${rel} still exists`);
        assert.deepEqual(tracked(rel), [], `${rel} is still tracked`);
      }
    });

    test('1e: plugin.json, package.json and the marketplace carry one version', () => {
      const plugin = readJson(`plugins/${NAMES.slug}/.claude-plugin/plugin.json`);
      const pkg = readJson('package.json');
      const market = readJson('.claude-plugin/marketplace.json');
      const entry = market.plugins.find((p) => p.name === NAMES.slug);
      assert.ok(entry, `marketplace entry ${NAMES.slug}`);
      assert.deepEqual(
        { pkg: pkg.version, market: market.version, entry: entry.version },
        { pkg: plugin.version, market: plugin.version, entry: plugin.version },
      );
    });
  });

  test('2: skill-route.cjs exports no NAMESPACE_RENAMES', () => {
    const skillRoute = require('./skill-route.cjs');
    assert.equal(Object.prototype.hasOwnProperty.call(skillRoute, 'NAMESPACE_RENAMES'), false);
  });
});
