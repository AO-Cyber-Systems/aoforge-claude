'use strict';

/**
 * Test suite for lib/validate.cjs — cmdValidateHealth's engine-lag check (W0-2)
 * and the two lib/helpers.cjs lookups it depends on (fix round 2).
 *
 * Covers the installed-vs-mirror-vs-main lag reporting added on top of the
 * existing .planning/ integrity checks: E020 (mirror-stale) and W021
 * (plugin-behind-main).
 *
 * Fix round 2 background: the round-1 implementation compared the mirror's
 * `.plugin-version` against `helpers.pluginVersion()` — but when df-tools
 * runs from the ~/.claude/devflow mirror (every skill invocation), that
 * function's first candidate doesn't exist there, so it falls through to the
 * SAME `.plugin-version` file being compared against, making E020
 * structurally dead in production. This round switches to two independent
 * sources of truth the Claude Code plugin manager maintains:
 * ~/.claude/plugins/installed_plugins.json (helpers.installedPlugin) and
 * ~/.claude/plugins/known_marketplaces.json (helpers.marketplaceCheckout).
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { cmdValidateHealth, compareSemver } = require('./validate.cjs');
const { installedPlugin, marketplaceCheckout } = require('./helpers.cjs');
const { _resetCache } = require('./stack-profile.cjs');
const stackFx = require('./__fixtures__/stack-profile-fixtures.cjs');

let tmpProject;
let tmpHome;
let tmpExtra; // for fixture dirs that live outside tmpHome (e.g. a marketplace checkout)

afterEach(() => {
  for (const dir of [tmpProject, tmpHome, tmpExtra]) {
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpProject = null;
  tmpHome = null;
  tmpExtra = null;
});

// ─── Fixture builders ──────────────────────────────────────────────────────

// Minimal .planning/ so cmdValidateHealth doesn't short-circuit on Check 1
// (missing .planning/ dir) before it ever reaches the engine-lag check.
function makePlanningProject() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'df-validate-test-'));
  fs.mkdirSync(path.join(tmp, '.planning', 'objectives'), { recursive: true });
  return tmp;
}

function makeHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'df-validate-home-'));
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf-8');
}

// Writes ~/.claude/devflow/.plugin-version — the mirror marker sync-runtime.js
// maintains, and the ONLY thing `mirror` reads.
function makeMirror(home, version) {
  const mirrorDir = path.join(home, '.claude', 'devflow');
  fs.mkdirSync(mirrorDir, { recursive: true });
  fs.writeFileSync(path.join(mirrorDir, '.plugin-version'), version, 'utf-8');
}

// Mirrors the real layout observed on a live machine during this task:
// ~/.claude/plugins/installed_plugins.json → { plugins: { "devflow@aocyber": [ {scope, installPath, version}, ... ] } }
// with installPath pointing at a cache dir holding .claude-plugin/plugin.json.
function makeInstalledPluginFixture(home, entries) {
  const list = Array.isArray(entries) ? entries : [entries];
  const written = list.map((e, i) => {
    const installPath = e.installPath || path.join(home, '.claude', 'plugins', 'cache', 'aocyber', 'devflow', `slot-${i}`);
    if (e.cachePluginVersion !== undefined) {
      writeJson(path.join(installPath, '.claude-plugin', 'plugin.json'), { name: 'devflow', version: e.cachePluginVersion });
    } else if (e.omitCacheDir !== true) {
      fs.mkdirSync(installPath, { recursive: true });
    }
    return {
      scope: e.scope || 'user',
      installPath,
      version: e.registryVersion,
    };
  });
  writeJson(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), {
    version: 2,
    plugins: { 'devflow@aocyber': written },
  });
  return written;
}

// ~/.claude/plugins/known_marketplaces.json → { aocyber: { installLocation } }
function makeMarketplaceFixture(home, installLocation) {
  fs.mkdirSync(installLocation, { recursive: true });
  writeJson(path.join(home, '.claude', 'plugins', 'known_marketplaces.json'), {
    aocyber: { installLocation },
  });
}

// cmdValidateHealth ends by calling helpers.cjs `output()`, which writes JSON
// to stdout and calls process.exit(0). Mock both so the test process survives.
function runHealth(cwd, options, raw) {
  const stdoutChunks = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { stdoutChunks.push(chunk); return true; };

  let exitCode = null;
  const origExit = process.exit.bind(process);
  process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };

  try {
    cmdValidateHealth(cwd, options, raw);
  } catch (e) {
    if (!e.message.startsWith('process.exit')) throw e;
  } finally {
    process.stdout.write = origWrite;
    process.exit = origExit;
  }

  const stdout = stdoutChunks.join('');
  const jsonChunk = stdoutChunks[stdoutChunks.length - 1];
  let json = null;
  try { json = JSON.parse(jsonChunk); } catch { /* leave null; assertions will fail loudly */ }

  return { exitCode, stdout, json };
}

// ─── helpers.installedPlugin ───────────────────────────────────────────────

describe('helpers.installedPlugin', () => {
  test('reads version from the cache dir .claude-plugin/plugin.json via installPath', () => {
    tmpHome = makeHome();
    makeInstalledPluginFixture(tmpHome, { scope: 'user', registryVersion: '2.6.0', cachePluginVersion: '2.6.0' });

    const info = installedPlugin({ homeDir: tmpHome });
    assert.ok(info, 'expected an installed-plugin result');
    assert.strictEqual(info.version, '2.6.0');
    assert.ok(info.installPath.includes('cache'));
  });

  test('falls back to the registry version field when the cache plugin.json is unreadable', () => {
    tmpHome = makeHome();
    makeInstalledPluginFixture(tmpHome, { scope: 'user', registryVersion: '2.6.0', omitCacheDir: false });
    // cachePluginVersion intentionally omitted above → no .claude-plugin/plugin.json written,
    // only the bare installPath directory — exercises the fallback path.

    const info = installedPlugin({ homeDir: tmpHome });
    assert.ok(info);
    assert.strictEqual(info.version, '2.6.0');
  });

  test('prefers the scope:"user" entry when multiple entries exist (real registries list project scope too)', () => {
    tmpHome = makeHome();
    makeInstalledPluginFixture(tmpHome, [
      { scope: 'project', registryVersion: '2.6.0', cachePluginVersion: '2.6.0' },
      { scope: 'user', registryVersion: '2.6.0', cachePluginVersion: '2.6.0' },
    ]);

    const info = installedPlugin({ homeDir: tmpHome });
    assert.ok(info);
    assert.strictEqual(info.version, '2.6.0');
  });

  test('returns null when installed_plugins.json is missing', () => {
    tmpHome = makeHome();
    assert.strictEqual(installedPlugin({ homeDir: tmpHome }), null);
  });

  test('returns null when the devflow@aocyber key is absent', () => {
    tmpHome = makeHome();
    writeJson(path.join(tmpHome, '.claude', 'plugins', 'installed_plugins.json'), {
      version: 2,
      plugins: { 'other-plugin@somewhere': [{ scope: 'user', version: '1.0.0' }] },
    });
    assert.strictEqual(installedPlugin({ homeDir: tmpHome }), null);
  });
});

// ─── helpers.marketplaceCheckout ───────────────────────────────────────────

describe('helpers.marketplaceCheckout', () => {
  test('returns installLocation when it names an existing directory', () => {
    tmpHome = makeHome();
    tmpExtra = fs.mkdtempSync(path.join(os.tmpdir(), 'df-validate-marketplace-'));
    makeMarketplaceFixture(tmpHome, tmpExtra);

    assert.strictEqual(marketplaceCheckout({ homeDir: tmpHome }), tmpExtra);
  });

  test('returns null when known_marketplaces.json is missing', () => {
    tmpHome = makeHome();
    assert.strictEqual(marketplaceCheckout({ homeDir: tmpHome }), null);
  });

  test('returns null when the aocyber key is absent', () => {
    tmpHome = makeHome();
    writeJson(path.join(tmpHome, '.claude', 'plugins', 'known_marketplaces.json'), {
      'claude-plugins-official': { installLocation: '/nonexistent' },
    });
    assert.strictEqual(marketplaceCheckout({ homeDir: tmpHome }), null);
  });

  test('returns null when installLocation does not exist on disk', () => {
    tmpHome = makeHome();
    writeJson(path.join(tmpHome, '.claude', 'plugins', 'known_marketplaces.json'), {
      aocyber: { installLocation: path.join(tmpHome, 'does-not-exist') },
    });
    assert.strictEqual(marketplaceCheckout({ homeDir: tmpHome }), null);
  });
});

// ─── compareSemver ──────────────────────────────────────────────────────────

describe('compareSemver', () => {
  test('numeric comparison, not lexicographic: 2.10.0 > 2.9.0', () => {
    assert.strictEqual(compareSemver('2.10.0', '2.9.0'), 1);
    assert.strictEqual(compareSemver('2.9.0', '2.10.0'), -1);
  });

  test('equal versions compare 0', () => {
    assert.strictEqual(compareSemver('2.6.0', '2.6.0'), 0);
  });

  test('handles a 2-segment input (missing patch treated as 0)', () => {
    assert.strictEqual(compareSemver('2.7', '2.6.9'), 1);
    assert.strictEqual(compareSemver('2.7', '2.7.0'), 0);
  });
});

// ─── cmdValidateHealth — E020 / W021 / engine row ──────────────────────────

describe('cmdValidateHealth — engine lag (E020 mirror-stale, W021 plugin-behind-main)', () => {

  test('E020 raised when mirror differs from the installed plugin version', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.5.0');

    const { json } = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.6.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => null,
    }, false);

    assert.ok(json, 'expected JSON output');
    const e020 = json.errors.find(e => e.code === 'E020');
    assert.ok(e020, `expected E020 in errors: ${JSON.stringify(json.errors)}`);
    assert.strictEqual(
      e020.message,
      'mirror-stale: ~/.claude/devflow is 2.5.0 but the installed plugin is 2.6.0'
    );
    assert.strictEqual(
      e020.fix,
      'Start a new session so sync-runtime re-mirrors, or run the sync hook, or run `/plugin update devflow@aocyber`'
    );
  });

  test('E020 absent when the mirror version matches the installed plugin version', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.6.0');

    const { json } = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.6.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => null,
    }, false);

    const e020 = json.errors.find(e => e.code === 'E020');
    assert.strictEqual(e020, undefined, 'should not raise E020 when versions match');
  });

  test('E020 absent when .plugin-version is missing (fresh machine, no mirror yet)', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome(); // no mirror written at all

    const { json } = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.6.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => null,
    }, false);

    const e020 = json.errors.find(e => e.code === 'E020');
    assert.strictEqual(e020, undefined, 'should not raise E020 with no mirror present');
  });

  test('E020 absent when the installed plugin is unknown (installedPluginFn returns null)', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.5.0');

    const { json } = runHealth(tmpProject, {
      installedPluginFn: () => null,
      homeDir: tmpHome,
      mainVersionFn: () => null,
    }, false);

    const e020 = json.errors.find(e => e.code === 'E020');
    assert.strictEqual(e020, undefined, 'should not raise E020 when installed is unknown');
  });

  // PR #81 review finding 2: E020 fired as an error whenever mirror !== installed,
  // including the direction where the MIRROR is newer (a dev checkout run via
  // --plugin-dir, where ~/.claude/devflow legitimately leads the installed plugin).
  // That is not staleness — cmdValidateHealth must use compareSemver and split the
  // two directions: mirror < installed stays E020 (existing wording), mirror >
  // installed becomes I022 (info, no fix text), and neither fires when equal.
  test('E020 (not I022) raised when the mirror is BEHIND the installed plugin', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.5.0');

    const { json } = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.6.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => null,
    }, false);

    assert.ok(json.errors.find(e => e.code === 'E020'), 'expected E020 when mirror is behind installed');
    assert.strictEqual(json.info.find(i => i.code === 'I022'), undefined, 'I022 must not fire on the mirror-behind direction');
  });

  test('I022 (not E020) raised when the mirror is AHEAD of the installed plugin (dev checkout via --plugin-dir)', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.7.0');

    const { json } = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.6.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => null,
    }, false);

    assert.strictEqual(json.errors.find(e => e.code === 'E020'), undefined, 'E020 must not fire when the mirror is ahead, not stale');
    const i022 = json.info.find(i => i.code === 'I022');
    assert.ok(i022, `expected I022 in info: ${JSON.stringify(json.info)}`);
    assert.strictEqual(
      i022.message,
      'mirror-ahead: ~/.claude/devflow is 2.7.0, installed plugin is 2.6.0 (dev checkout?)'
    );
    assert.strictEqual(i022.fix, undefined, 'I022 carries no fix text');
  });

  test('W021 raised when mainVersionFn reports a version ahead of the installed plugin', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.6.0');

    const { json } = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.6.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => '2.7.1',
    }, false);

    const w021 = json.warnings.find(w => w.code === 'W021');
    assert.ok(w021, `expected W021 in warnings: ${JSON.stringify(json.warnings)}`);
    assert.strictEqual(w021.message, 'plugin-behind-main: installed 2.6.0, origin/main 2.7.1');
    assert.strictEqual(w021.fix, 'Update the plugin from the marketplace');
  });

  test('W021 absent when mainVersionFn returns null (checkout unreachable)', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.6.0');

    const { json } = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.6.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => null,
    }, false);

    const w021 = json.warnings.find(w => w.code === 'W021');
    assert.strictEqual(w021, undefined, 'should not raise W021 when main version is unknown');
  });

  test('W021 absent when installed is unknown, even if mainVersionFn returns a version', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.6.0');

    const { json } = runHealth(tmpProject, {
      installedPluginFn: () => null,
      homeDir: tmpHome,
      mainVersionFn: () => '2.7.1',
    }, false);

    const w021 = json.warnings.find(w => w.code === 'W021');
    assert.strictEqual(w021, undefined, 'should not raise W021 when installed is unknown');
  });

  test('W021 absent when main is behind or equal to the installed plugin version', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.6.0');

    const behind = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.6.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => '2.5.9',
    }, false);
    assert.strictEqual(behind.json.warnings.find(w => w.code === 'W021'), undefined);

    const equal = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.6.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => '2.6.0',
    }, false);
    assert.strictEqual(equal.json.warnings.find(w => w.code === 'W021'), undefined);
  });

  test('engine row present with running, mirror, installed, and main versions', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.5.0');

    const { json } = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.6.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => '2.7.1',
    }, false);

    assert.strictEqual(json.engine.mirror, '2.5.0');
    assert.strictEqual(json.engine.installed, '2.6.0');
    assert.strictEqual(json.engine.main, '2.7.1');
    // `running` comes from the real (uninjected) helpers.pluginVersion() —
    // just assert it's present and a string, its exact value is this
    // machine's engine, not a seam under test here.
    assert.strictEqual(typeof json.engine.running, 'string');
    assert.ok(json.engine.running.length > 0);
  });

  test('engine row reports null mirror/installed/main when unavailable', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome(); // no mirror

    const { json } = runHealth(tmpProject, {
      installedPluginFn: () => null,
      homeDir: tmpHome,
      mainVersionFn: () => null,
    }, false);

    assert.strictEqual(json.engine.mirror, null);
    assert.strictEqual(json.engine.installed, null);
    assert.strictEqual(json.engine.main, null);
  });

  // stdout must stay JSON-only in both modes: skills parse `validate health`'s
  // stdout as JSON. The `engine` row inside the JSON is the report; there is
  // no separate human-readable text mode. (Controller ruling, fix round 1.)
  test('non-raw output is pure JSON.parse-able stdout (engine row carries the report)', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.5.0');

    const { stdout, json } = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.6.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => '2.7.1',
    }, false);

    assert.ok(json, 'expected parseable JSON');
    assert.deepStrictEqual(JSON.parse(stdout), json, 'entire stdout must be exactly the JSON payload — no extra lines');
  });

  test('raw output is pure JSON.parse-able stdout, identical shape to non-raw', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.5.0');

    const { stdout, json } = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.6.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => '2.7.1',
    }, true);

    assert.ok(json, 'raw mode should still produce parseable JSON');
    assert.deepStrictEqual(JSON.parse(stdout), json, 'entire stdout must be exactly the JSON payload — no extra lines');
  });

  test('default seams (no injection) do not throw and produce an engine row', () => {
    tmpProject = makePlanningProject();

    // No installedPluginFn/homeDir passed — exercises the real defaults
    // (helpers.installedPlugin, os.homedir(), helpers.pluginVersion) against
    // this machine. mainVersionFn IS stubbed: the default performs a real
    // `git fetch` in the user's marketplace clone — no network in unit tests.
    const { json } = runHealth(tmpProject, { mainVersionFn: () => null }, false);

    assert.ok(json, 'expected JSON output with default seams');
    assert.ok('engine' in json, 'engine row should be present even with default seams');
    assert.strictEqual(typeof json.engine.running, 'string');
    assert.strictEqual(json.engine.main, null);
  });

  // Spec: every tool output carries engine_version/schema_version so a consumer
  // can reject a report produced by a stale engine — on BOTH output paths.
  test('health output carries engine_version + schema_version (normal path)', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.5.0');

    const { json } = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.5.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => null,
    }, true);

    assert.ok(json);
    assert.strictEqual(typeof json.engine_version, 'string');
    assert.match(json.engine_version, /^\d+\.\d+\.\d+/);
    assert.strictEqual(json.schema_version, 1);
  });

  test('health output carries engine_version + schema_version on the E001 early return (no .planning/)', () => {
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-health-noplanning-'));

    const { json } = runHealth(tmpProject, { mainVersionFn: () => null }, true);

    assert.ok(json);
    assert.strictEqual(json.status, 'broken');
    assert.ok(json.errors.some(e => e.code === 'E001'), 'E001 raised');
    assert.strictEqual(typeof json.engine_version, 'string');
    assert.strictEqual(json.schema_version, 1);
  });

  // The end-to-end case the round-1 review flagged as missing: drive
  // cmdValidateHealth with ONLY homeDir pointed at a fixture (mirror +
  // installed_plugins.json + cache plugin.json) and mainVersionFn stubbed
  // (avoids a real network/git call) — installedPluginFn is left at its
  // real default (helpers.installedPlugin) to prove homeDir actually reaches
  // it and E020 fires on the mirror-vs-installed path exactly as it would
  // for a real skill invocation running from ~/.claude/devflow.
  test('end-to-end mirror path: default installedPluginFn + fixture homeDir → E020 fires on real mismatch', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.5.0');
    makeInstalledPluginFixture(tmpHome, { scope: 'user', registryVersion: '2.6.0', cachePluginVersion: '2.6.0' });

    const { json } = runHealth(tmpProject, {
      homeDir: tmpHome,
      mainVersionFn: () => null, // avoid a real network/git call in this test
      // installedPluginFn intentionally NOT overridden — exercises the real
      // helpers.installedPlugin() default reading the fixture via homeDir.
    }, false);

    assert.ok(json, 'expected JSON output');
    const e020 = json.errors.find(e => e.code === 'E020');
    assert.ok(e020, `expected E020 via the real installedPlugin() default: ${JSON.stringify(json.errors)}`);
    assert.strictEqual(
      e020.message,
      'mirror-stale: ~/.claude/devflow is 2.5.0 but the installed plugin is 2.6.0'
    );
    assert.strictEqual(json.engine.mirror, '2.5.0');
    assert.strictEqual(json.engine.installed, '2.6.0');
  });
});

// ─── Check 12: Stack profile (.planning/STACK.md) ─────────────────────────
// Never repairable — drafting a profile needs human confirmation (`stack init`).
// All codes: E030 (invalid), W030 (extends unresolved), W031 (undefined command),
// W032 (validator warning), I030 (absent but detectable).
describe('Check 12: stack profile', () => {
  beforeEach(() => {
    // validateProfile doesn't itself go through stack-profile.cjs's resolveProfile
    // cache, but reset it anyway per the fixture contract — this suite reuses the
    // process across cases.
    _resetCache();
  });

  const ALL_STACK_CODES = ['E030', 'W030', 'W031', 'W032', 'I030'];

  function findAny(json, code) {
    return [...json.errors, ...json.warnings, ...json.info].find((i) => i.code === code);
  }

  test('H1: valid STACK.md produces no Check 12 issue', () => {
    tmpHome = stackFx.makeHome({});
    tmpProject = stackFx.makeProject({ stackMd: stackFx.profileMd({ yaml: 'schema: 1' }) });

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);

    for (const code of ALL_STACK_CODES) {
      assert.strictEqual(findAny(json, code), undefined, `unexpected ${code}: ${JSON.stringify(json)}`);
    }
  });

  test('H2: schema violation adds exactly one E030, not repairable, status not healthy', () => {
    tmpHome = stackFx.makeHome({});
    tmpProject = stackFx.makeProject({ stackMd: stackFx.profileMd({ yaml: 'schema: 2' }) });

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);

    const e030s = json.errors.filter((e) => e.code === 'E030');
    assert.strictEqual(e030s.length, 1, `expected exactly one E030: ${JSON.stringify(json.errors)}`);
    assert.strictEqual(e030s[0].repairable, false);
    assert.match(e030s[0].message, /STK001/);
    assert.notStrictEqual(json.status, 'healthy');
  });

  test('H3: an extends cycle adds E030, not W030', () => {
    tmpHome = stackFx.cycleHome();
    tmpProject = stackFx.makeProject({
      stackMd: stackFx.profileMd({ yaml: ['schema: 1', 'extends: a'].join('\n') }),
    });

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);

    assert.ok(json.errors.find((e) => e.code === 'E030'), `expected E030: ${JSON.stringify(json.errors)}`);
    assert.strictEqual(json.warnings.find((w) => w.code === 'W030'), undefined, 'a cycle must not also fire W030');
  });

  test('H4: an unresolved extends adds W030 naming the id, no E030', () => {
    tmpHome = stackFx.makeHome({});
    tmpProject = stackFx.makeProject({
      stackMd: stackFx.profileMd({ yaml: ['schema: 1', 'extends: missing'].join('\n') }),
    });

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);

    const w030 = json.warnings.find((w) => w.code === 'W030');
    assert.ok(w030, `expected W030: ${JSON.stringify(json.warnings)}`);
    assert.match(w030.message, /"missing"/);
    assert.match(w030.message, /~\/\.claude\/devflow\/stacks\/ or the bundled stack-profiles\//);
    assert.strictEqual(json.errors.find((e) => e.code === 'E030'), undefined);
  });

  test('H5: an undefined command in gates.task adds W031 naming the field and key', () => {
    tmpHome = stackFx.makeHome({});
    const yaml = ['schema: 1', 'commands:', '  build: { run: "x" }', 'gates:', '  task: [nosuch]'].join('\n');
    tmpProject = stackFx.makeProject({ stackMd: stackFx.profileMd({ yaml }) });

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);

    const w031 = json.warnings.find((w) => w.code === 'W031');
    assert.ok(w031, `expected W031: ${JSON.stringify(json.warnings)}`);
    assert.match(w031.message, /gates\.task/);
    assert.match(w031.message, /"nosuch"/);
  });

  test('H6: an over-length body adds W032 only', () => {
    tmpHome = stackFx.makeHome({});
    tmpProject = stackFx.makeProject({ stackMd: stackFx.longBodyProfile(150) });

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);

    const w032 = json.warnings.find((w) => w.code === 'W032');
    assert.ok(w032, `expected W032: ${JSON.stringify(json.warnings)}`);
    for (const code of ['E030', 'W030', 'W031', 'I030']) {
      assert.strictEqual(findAny(json, code), undefined, `unexpected ${code}`);
    }
  });

  test('H7: no STACK.md with a detectable manifest adds I030 naming stack init', () => {
    tmpHome = stackFx.makeHome({});
    tmpProject = stackFx.makeProject({ files: { 'package.json': '{}' } });

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);

    const i030 = json.info.find((i) => i.code === 'I030');
    assert.ok(i030, `expected I030: ${JSON.stringify(json.info)}`);
    assert.match(i030.fix, /df-tools stack init/);
  });

  test('H8: no STACK.md and no manifest adds no Check 12 issue', () => {
    tmpHome = stackFx.makeHome({});
    tmpProject = stackFx.makeProject({});

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);

    for (const code of ALL_STACK_CODES) {
      assert.strictEqual(findAny(json, code), undefined, `unexpected ${code}: ${JSON.stringify(json)}`);
    }
  });

  test('H9: --repair never writes STACK.md — Check 12 is never repairable', () => {
    tmpHome = stackFx.makeHome({});
    const stackMd = stackFx.profileMd({ yaml: 'schema: 2' });
    tmpProject = stackFx.makeProject({ stackMd });
    const stackPath = path.join(tmpProject, '.planning', 'STACK.md');

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null, repair: true }, false);

    assert.strictEqual(fs.readFileSync(stackPath, 'utf-8'), stackMd, 'STACK.md bytes must be unchanged');
    const e030 = json.errors.find((e) => e.code === 'E030');
    assert.ok(e030, 'E030 should still be reported');
    assert.strictEqual(e030.repairable, false);
    const repairs = json.repairs_performed || [];
    assert.strictEqual(
      repairs.find((r) => r.path === 'STACK.md' || r.action === 'stackInit'),
      undefined,
      'no repair action should target the stack profile'
    );
  });

  test('H10: homeDir is honoured — W030 clears once the fake home gains the extends target', () => {
    tmpHome = stackFx.makeHome({});
    tmpProject = stackFx.makeProject({
      stackMd: stackFx.profileMd({ yaml: ['schema: 1', 'extends: missing'].join('\n') }),
    });

    const before = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);
    assert.ok(before.json.warnings.find((w) => w.code === 'W030'), 'expected W030 before the fake home gains the profile');

    fs.mkdirSync(path.join(tmpHome, '.claude', 'devflow', 'stacks'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpHome, '.claude', 'devflow', 'stacks', 'missing.md'),
      stackFx.profileMd({ yaml: ['schema: 1', 'id: missing'].join('\n') }),
      'utf-8'
    );

    const after = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);
    assert.strictEqual(
      after.json.warnings.find((w) => w.code === 'W030'),
      undefined,
      'W030 should clear once ~/.claude/devflow/stacks/missing.md exists'
    );
  });

  // TRD 42-01 (SDR-07): W032 carries STK010 as well as STK007, each with its own fix hint.
  test('H11: a placeholder skill pin adds W032 (STK010) with a pin-specific fix; no error, not broken', () => {
    tmpHome = stackFx.makeHome({});
    const yaml = [
      'schema: 1',
      'agent_tooling:',
      '  skills:',
      '    - { source: "x", pin: "<sha>" }',
    ].join('\n');
    tmpProject = stackFx.makeProject({ stackMd: stackFx.profileMd({ yaml }) });

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);

    const w032s = json.warnings.filter((w) => w.code === 'W032');
    assert.strictEqual(w032s.length, 1, `expected exactly one W032: ${JSON.stringify(json.warnings)}`);
    assert.match(w032s[0].message, /placeholder pin "<sha>"/);
    assert.match(w032s[0].fix, /Pin agent_tooling\.skills\[\]\.pin to a real commit SHA/);
    assert.doesNotMatch(w032s[0].fix, /Trim the profile body/, 'STK010 must not borrow the STK007 fix hint');
    assert.strictEqual(findAny(json, 'E030'), undefined, 'a placeholder pin is a warning, never E030');
    // (The bare fixture is `broken` for unrelated reasons — no PROJECT.md/STATE.md — so assert on
    // the error list rather than the overall status.)
    assert.ok(!json.errors.some((e) => /placeholder|STK010/.test(e.message)), JSON.stringify(json.errors));
  });

  test('H12: STK007 keeps its own W032 fix hint beside STK010', () => {
    tmpHome = stackFx.makeHome({});
    tmpProject = stackFx.makeProject({ stackMd: stackFx.longBodyProfile(150) });

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);

    const w032 = json.warnings.find((w) => w.code === 'W032');
    assert.ok(w032, `expected W032: ${JSON.stringify(json.warnings)}`);
    assert.match(w032.fix, /Trim the profile body/);
  });
});

// ─── Check 12b: managed .mcp.json server binaries (TRD 42-09, W033) ────────
// Advisory only: a managed (`env.DEVFLOW_MANAGED === 'stack'`) server whose command does not
// resolve. Foreign servers are never inspected. `env` and `homeDir` are injected, so the real
// PATH and ~/go/bin are never consulted.
describe('Check 12b: managed MCP server binaries (W033)', () => {
  const stubDirs = [];
  afterEach(() => {
    while (stubDirs.length) fs.rmSync(stubDirs.pop(), { recursive: true, force: true });
  });

  function stubBin(names) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-validate-bin-'));
    stubDirs.push(dir);
    for (const n of names) {
      fs.writeFileSync(path.join(dir, n), '#!/bin/sh\nexit 0\n', 'utf-8');
      fs.chmodSync(path.join(dir, n), 0o755);
    }
    return dir;
  }

  function withMcp(servers) {
    tmpProject = makePlanningProject();
    fs.writeFileSync(path.join(tmpProject, '.mcp.json'), `${JSON.stringify({ mcpServers: servers }, null, 2)}\n`, 'utf-8');
    tmpHome = makeHome();
  }

  const managed = (command) => ({ command, args: ['mcp'], env: { DEVFLOW_MANAGED: 'stack' } });

  test('M1: a managed gopls entry with gopls absent adds W033 (advisory, not repairable)', () => {
    withMcp({ gopls: managed('gopls') });
    const env = { PATH: stubBin([]) };

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null, env }, false);

    const w033 = json.warnings.filter((w) => w.code === 'W033');
    assert.strictEqual(w033.length, 1, `expected one W033: ${JSON.stringify(json.warnings)}`);
    assert.match(w033[0].message, /^stack-mcp-binary-missing: gopls \(gopls\)$/);
    assert.match(w033[0].fix, /Install gopls or run df-tools stack mcp --write to prune/);
    assert.strictEqual(w033[0].repairable, false);
    assert.strictEqual(json.errors.find((e) => e.code === 'W033'), undefined, 'W033 never becomes an error');
  });

  test('M2: a foreign server with a missing binary adds no W033', () => {
    withMcp({ playwright: { command: 'npx-not-here', args: ['x'] }, other: { command: 'nope', env: { DEVFLOW_MANAGED: 'other' } } });
    const env = { PATH: stubBin([]) };

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null, env }, false);

    assert.strictEqual(json.warnings.find((w) => w.code === 'W033'), undefined, JSON.stringify(json.warnings));
  });

  test('M3: a managed entry whose binary resolves adds no W033', () => {
    withMcp({ gopls: managed('gopls'), dart: managed('dart') });
    const env = { PATH: stubBin(['gopls', 'dart']) };

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null, env }, false);

    assert.strictEqual(json.warnings.find((w) => w.code === 'W033'), undefined, JSON.stringify(json.warnings));
  });

  test('M4: no .mcp.json, or an unparseable one, adds no W033 and does not break health', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    const env = { PATH: stubBin([]) };
    const none = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null, env }, false);
    assert.strictEqual(none.json.warnings.find((w) => w.code === 'W033'), undefined);

    fs.writeFileSync(path.join(tmpProject, '.mcp.json'), '{ not json', 'utf-8');
    const bad = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null, env }, false);
    assert.ok(bad.json, 'health still reports');
    assert.strictEqual(bad.json.warnings.find((w) => w.code === 'W033'), undefined);
  });

  test('M5: --repair leaves .mcp.json untouched', () => {
    withMcp({ gopls: managed('gopls') });
    const before = fs.readFileSync(path.join(tmpProject, '.mcp.json'), 'utf-8');
    const env = { PATH: stubBin([]) };

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null, env, repair: true }, false);

    assert.ok(json.warnings.find((w) => w.code === 'W033'));
    assert.strictEqual(fs.readFileSync(path.join(tmpProject, '.mcp.json'), 'utf-8'), before);
  });
});

// ─── Health repairs delegate to upgrade migrations 0001-0003 (TRD 36-04a) ──
//
// Every project is a mkdtemp fixture (upgrade-fixtures.cjs / makePlanningProject) and every run
// passes homeDir: tmpHome, so the real ~/.claude is never consulted and this repo is never touched.

describe('health repairs delegate to migrations 0001-0003', () => {
  const upgradeFx = require('./__fixtures__/upgrade-fixtures.cjs');
  const { buildConfig } = require('./migrations/0001-config-stamp.cjs');

  test('22. --repair with no config.json writes buildConfig(null) (the nested template)', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null, repair: true }, false);

    const written = JSON.parse(fs.readFileSync(path.join(tmpProject, '.planning', 'config.json'), 'utf-8'));
    assert.deepStrictEqual(written, buildConfig(null));
    assert.strictEqual(written.planning.commit_docs, true);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(written, 'job_checker'), false);
    const action = json.repairs_performed.find((r) => r.action === 'createConfig');
    assert.ok(action && action.success === true, 'createConfig repair recorded as successful');
  });

  test('23. --repair on the v1 fixture renames both JOB files (W008) and seeds state.json (W009)', () => {
    tmpProject = upgradeFx.makeV1Project();
    tmpHome = makeHome();
    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null, repair: true }, false);

    const objectives = path.join(tmpProject, '.planning', 'objectives');
    assert.strictEqual(fs.existsSync(path.join(objectives, '01-alpha', '01-01-JOB.md')), false);
    assert.strictEqual(fs.existsSync(path.join(objectives, '01-alpha', '01-01-TRD.md')), true);
    assert.strictEqual(fs.existsSync(path.join(objectives, '02-beta', '02-01-JOB.md')), false);
    assert.strictEqual(fs.existsSync(path.join(objectives, '02-beta', '02-01-TRD.md')), true);

    const seeded = JSON.parse(fs.readFileSync(path.join(tmpProject, '.planning', 'state.json'), 'utf-8'));
    assert.strictEqual(seeded.current_objective, '01');
    assert.strictEqual(seeded.status, 'In progress');

    const migrate = json.repairs_performed.find((r) => r.action === 'migrateJobFiles');
    assert.ok(migrate, 'migrateJobFiles recorded');
    assert.strictEqual(migrate.success, true);
    assert.deepStrictEqual(migrate.migrated, [
      { from: '.planning/objectives/01-alpha/01-01-JOB.md', to: '.planning/objectives/01-alpha/01-01-TRD.md' },
      { from: '.planning/objectives/02-beta/02-01-JOB.md', to: '.planning/objectives/02-beta/02-01-TRD.md' },
    ]);
    const seed = json.repairs_performed.find((r) => r.action === 'createStateJson');
    assert.ok(seed, 'createStateJson recorded');
    assert.strictEqual(seed.success, true);
    assert.strictEqual(seed.path, 'state.json');
    assert.ok(seed.seeded_fields.includes('current_objective'));
  });

  test('24. W008 detection unchanged: the v1 fixture reports it with the same message text', () => {
    tmpProject = upgradeFx.makeV1Project();
    tmpHome = makeHome();
    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);

    const w008 = json.warnings.find((w) => w.code === 'W008');
    assert.ok(w008, 'W008 raised');
    assert.strictEqual(w008.message, 'Legacy JOB.md format found: 2 file(s). TRD.md is the current format.');
    assert.strictEqual(w008.fix, 'Run /devflow:status check --repair to auto-rename to TRD.md');
    assert.strictEqual(w008.repairable, true);
    // Without --repair nothing moves.
    assert.strictEqual(
      fs.existsSync(path.join(tmpProject, '.planning', 'objectives', '01-alpha', '01-01-JOB.md')),
      true
    );
  });
});

// ─── Check 13: upgrade state (TRD 36-03, W040) ─────────────────────────────
//
// Fixture projects and a tmp home only: upgrade.check never resolves the real ~/.claude, and the
// one apply below backs up into tmpHome.

describe('Check 13: upgrade state (W040)', () => {
  const upgradeFx = require('./__fixtures__/upgrade-fixtures.cjs');
  const upgrade = require('./upgrade.cjs');
  const { pluginVersion } = require('./helpers.cjs');

  const w040s = (json) => json.warnings.filter((w) => w.code === 'W040');

  test('12. a behind v1 project reports one non-repairable W040 naming the pending counts', () => {
    tmpProject = upgradeFx.makeV1Project();
    tmpHome = makeHome();
    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);

    const found = w040s(json);
    assert.strictEqual(found.length, 1, `one W040; got ${JSON.stringify(found)}`);
    const w = found[0];
    assert.ok(w.message.startsWith('project-behind:'), w.message);
    assert.match(w.message, /\b5 pending\b/);
    assert.match(w.message, /\b1 need confirmation\b/);
    assert.strictEqual(w.repairable, false);
    assert.match(w.fix, /df-tools upgrade --apply/);
  });

  test('13. after upgrade.apply with 0006 confirmed there is no W040', () => {
    tmpProject = upgradeFx.makeV1Project();
    tmpHome = makeHome();
    const report = upgrade.apply({
      projectRoot: tmpProject,
      userHome: tmpHome,
      pluginVersion: pluginVersion(),
      confirm: true,
      options: { kind: 'plugin' },
    });
    assert.deepStrictEqual(report.failed, []);
    assert.strictEqual(report.up_to_date, true);

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);
    assert.deepStrictEqual(w040s(json), []);
  });

  test('14. stamped with an older version and nothing pending still reports W040', () => {
    tmpProject = upgradeFx.makeStampedProject('2.0.0');
    tmpHome = makeHome();
    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);

    const found = w040s(json);
    assert.strictEqual(found.length, 1, `one W040; got ${JSON.stringify(found)}`);
    assert.ok(
      found[0].message.startsWith(`project-behind: stamped v2.0.0, DevFlow v${pluginVersion()}`),
      found[0].message
    );
  });

  test('15. a check that cannot run reports W040 upgrade-check-not-available, never a pass', () => {
    tmpProject = upgradeFx.makeStampedProject(pluginVersion());
    tmpHome = makeHome();
    tmpExtra = upgradeFx.makeRegistryDir({
      '0001-broken.cjs': upgradeFx.migrationSource({ id: '0001', detect: undefined, apply: 'return { changed: [] };' }),
    });
    const { json } = runHealth(
      tmpProject,
      { homeDir: tmpHome, mainVersionFn: () => null, upgradeRegistryDir: tmpExtra },
      false
    );

    const found = w040s(json);
    assert.strictEqual(found.length, 1, `one W040; got ${JSON.stringify(found)}`);
    assert.ok(found[0].message.startsWith('upgrade-check-not-available:'), found[0].message);
    assert.match(found[0].message, /missing detect/);
    assert.strictEqual(found[0].repairable, false);
  });
});

// ─── Check 4: W002 — STATE.md position vs known objectives (TRD 38-02) ────
//
// W002 used to hunt for "[Pp]hase N" text that no current STATE.md convention writes — dead code,
// so no prior test covered it (grep -c W002 validate.test.cjs was 0). This makes it live: it reads
// only the current position-line conventions, treats milestones/ archives as still-valid objective
// numbers, and is deliberately NOT repairable — a single stale number must never let --repair
// replace a user's whole STATE.md with the regenerateState stub.

describe('objective 38 — W002 + live fix text', () => {
  function makeObjectivesFixture(objectiveDirNames, opts = {}) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'df-w002-test-'));
    for (const dir of objectiveDirNames) {
      fs.mkdirSync(path.join(tmp, '.planning', 'objectives', dir), { recursive: true });
    }
    for (const dir of (opts.milestoneDirs || [])) {
      // dir is relative to .planning/milestones/, e.g. 'v1.0-objectives/07-x'
      fs.mkdirSync(path.join(tmp, '.planning', 'milestones', dir), { recursive: true });
    }
    return tmp;
  }

  function writeState(tmp, content) {
    fs.writeFileSync(path.join(tmp, '.planning', 'STATE.md'), content, 'utf-8');
  }

  const w002s = (json) => json.warnings.filter((w) => w.code === 'W002');

  test('1. **Objective complete:** 7 with only 01-a on disk -> one W002 naming 7, not repairable', () => {
    tmpProject = makeObjectivesFixture(['01-a']);
    tmpHome = makeHome();
    writeState(tmpProject, '# State\n\n**Objective complete:** 7 — done\n');

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);
    const found = w002s(json);
    assert.strictEqual(found.length, 1, `expected exactly one W002; got ${JSON.stringify(found)}`);
    assert.match(found[0].message, /\b7\b/);
    assert.strictEqual(found[0].repairable, false);
  });

  test('2. a matching objectives/ dir clears W002', () => {
    tmpProject = makeObjectivesFixture(['07-x']);
    tmpHome = makeHome();
    writeState(tmpProject, '# State\n\n**Objective complete:** 7 — done\n');

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);
    assert.strictEqual(w002s(json).length, 0, 'objectives/07-x on disk clears W002');
  });

  test('3. an archived objective under milestones/ also clears W002', () => {
    tmpProject = makeObjectivesFixture(['01-a'], { milestoneDirs: ['v1.0-objectives/07-x'] });
    tmpHome = makeHome();
    writeState(tmpProject, '# State\n\n**Objective complete:** 7 — done\n');

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);
    assert.strictEqual(w002s(json).length, 0, 'milestones/v1.0-objectives/07-x clears W002 (archived counts)');
  });

  test('4. template "Objective: N of M" and "**Current objective:**" both surface W002 for the missing ref', () => {
    tmpProject = makeObjectivesFixture(['01-a']);
    tmpHome = makeHome();

    writeState(tmpProject, '# State\n\nObjective: 3 of 5\nJob: Not started\n');
    const { json: templateForm } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);
    assert.ok(w002s(templateForm).some((w) => /\b3\b/.test(w.message)), 'W002 names 3 for template form');

    writeState(tmpProject, '# State\n\n**Current objective:** 12\n');
    const { json: currentForm } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);
    assert.ok(w002s(currentForm).some((w) => /\b12\b/.test(w.message)), 'W002 names 12 for **Current objective:**');
  });

  test('5. prose never triggers W002: "objectives 27-36 complete", "Phase 9 handoff", "Phase A handoff snapshot"', () => {
    tmpProject = makeObjectivesFixture(['01-a']);
    tmpHome = makeHome();
    writeState(
      tmpProject,
      '# State\n\n**Status:** v1.3 in flight — objectives 27–36 complete\n' +
      'Phase 9 handoff\n' +
      'Phase A handoff snapshot\n'
    );

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);
    assert.strictEqual(w002s(json).length, 0, `expected no W002; got ${JSON.stringify(w002s(json))}`);
  });

  test('6. --repair on a W002-only project leaves STATE.md byte-identical and never regenerates it', () => {
    tmpProject = makeObjectivesFixture(['01-a']);
    tmpHome = makeHome();
    const stateContent = '# State\n\n**Objective complete:** 7 — done\n';
    writeState(tmpProject, stateContent);

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null, repair: true }, false);
    assert.strictEqual(w002s(json).length, 1, 'W002 still raised');
    const after = fs.readFileSync(path.join(tmpProject, '.planning', 'STATE.md'), 'utf-8');
    assert.strictEqual(after, stateContent, 'STATE.md bytes unchanged after --repair');
    assert.strictEqual(
      (json.repairs_performed || []).some((r) => r.action === 'regenerateState'),
      false,
      'W002 never triggers regenerateState'
    );
    assert.strictEqual(
      w002s(json)[0].fix,
      'Correct the objective number in STATE.md (or restore the objective directory)'
    );
  });

  test('7. fix text names live devflow commands (E001, E002, E003, E004, W003)', () => {
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'df-w002-noplanning-'));
    tmpHome = makeHome();
    const { json: noPlanning } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);
    const e001 = noPlanning.errors.find((e) => e.code === 'E001');
    assert.ok(e001, 'E001 raised');
    assert.strictEqual(e001.fix, 'Run /devflow:new-project to initialize');
    fs.rmSync(tmpProject, { recursive: true, force: true });

    // Minimal .planning/ with only objectives/ present — PROJECT.md, ROADMAP.md, STATE.md,
    // config.json all missing, so E002/E003/E004/W003 all fire off the one fixture.
    tmpProject = makePlanningProject();
    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);

    const e002 = json.errors.find((e) => e.code === 'E002');
    assert.ok(e002, 'E002 raised');
    assert.strictEqual(e002.fix, 'Run /devflow:new-project to create');

    const e003 = json.errors.find((e) => e.code === 'E003');
    assert.ok(e003, 'E003 raised');
    assert.strictEqual(e003.fix, 'Run /devflow:milestone new to create roadmap');

    const e004 = json.errors.find((e) => e.code === 'E004');
    assert.ok(e004, 'E004 raised');
    assert.strictEqual(e004.fix, 'Run /devflow:status check --repair to regenerate');

    const w003 = json.warnings.find((w) => w.code === 'W003');
    assert.ok(w003, 'W003 raised');
    assert.strictEqual(w003.fix, 'Run /devflow:status check --repair to create with defaults');
  });

  test('8. regenerateState (E004 + --repair) writes a Session Log line naming /devflow:status check --repair and no /df:', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null, repair: true }, false);

    const action = json.repairs_performed.find((r) => r.action === 'regenerateState');
    assert.ok(action && action.success === true, 'regenerateState repair recorded as successful');

    const written = fs.readFileSync(path.join(tmpProject, '.planning', 'STATE.md'), 'utf-8');
    assert.match(written, /## Session Log[\s\S]*\/devflow:status check --repair/);
    assert.ok(!written.includes('/df:'), 'no stale /df: command in regenerated STATE.md');
  });
});

// ─── Check 8: W007 reads archived milestone roadmaps (quick 26) ────────────
//
// An objective is "known" to W007 when any roadmap lists it — the current ROADMAP.md
// or an archived .planning/milestones/*-ROADMAP.md — as a heading OR as a
// checklist/bullet line. Prose mentions never count. W006 keeps reading ROADMAP.md
// headings only.
describe('Check 8: W007 reads archived milestone roadmaps', () => {
  // dirs: objective dir names under .planning/objectives/; roadmap: ROADMAP.md text;
  // archives: { fileName: text } written under .planning/milestones/.
  function makeRoadmapFixture({ dirs = [], roadmap = '# Roadmap\n', archives = {} }) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'df-w007-test-'));
    for (const dir of dirs) {
      fs.mkdirSync(path.join(tmp, '.planning', 'objectives', dir), { recursive: true });
    }
    fs.mkdirSync(path.join(tmp, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.planning', 'ROADMAP.md'), roadmap, 'utf-8');
    for (const [name, text] of Object.entries(archives)) {
      fs.mkdirSync(path.join(tmp, '.planning', 'milestones'), { recursive: true });
      fs.writeFileSync(path.join(tmp, '.planning', 'milestones', name), text, 'utf-8');
    }
    return tmp;
  }

  const w007s = (json) => json.warnings.filter((w) => w.code === 'W007');
  const w006s = (json) => json.warnings.filter((w) => w.code === 'W006');
  const health = () => runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);

  test('1. checklist line in an archived milestone roadmap clears W007', () => {
    tmpProject = makeRoadmapFixture({
      dirs: ['27-x'],
      archives: { 'v1.3-ROADMAP.md': '# v1.3\n\n- [x] Objective 27: Foo (3/3 plans)\n' },
    });
    tmpHome = makeHome();

    const { json } = health();
    assert.strictEqual(w007s(json).length, 0, `expected no W007; got ${JSON.stringify(w007s(json))}`);
  });

  test('2. "### Objective 5:" heading in an archived roadmap clears W007 for dir 05-y (unpadded match)', () => {
    tmpProject = makeRoadmapFixture({
      dirs: ['05-y'],
      archives: { 'v1.2-ROADMAP.md': '# v1.2\n\n### Objective 5: Bar\n\nGoal: bar\n' },
    });
    tmpHome = makeHome();

    const { json } = health();
    assert.strictEqual(w007s(json).length, 0, `expected no W007; got ${JSON.stringify(w007s(json))}`);
  });

  test('3. checklist line in ROADMAP.md itself (no heading) clears W007', () => {
    tmpProject = makeRoadmapFixture({
      dirs: ['40-z'],
      roadmap: '# Roadmap\n\n- [x] Objective 40: Baz\n',
    });
    tmpHome = makeHome();

    const { json } = health();
    assert.strictEqual(w007s(json).length, 0, `expected no W007; got ${JSON.stringify(w007s(json))}`);
  });

  test('4. bold bullet line in ROADMAP.md clears W007', () => {
    tmpProject = makeRoadmapFixture({
      dirs: ['26-w'],
      roadmap: '# Roadmap\n\n- **Objective 26: Qux** — moved\n',
    });
    tmpHome = makeHome();

    const { json } = health();
    assert.strictEqual(w007s(json).length, 0, `expected no W007; got ${JSON.stringify(w007s(json))}`);
  });

  test('5. an orphan dir listed in no roadmap still gets exactly one W007 naming it', () => {
    tmpProject = makeRoadmapFixture({
      dirs: ['99-orphan'],
      roadmap: '# Roadmap\n\n### Objective 1: Something else\n',
      archives: { 'v1.3-ROADMAP.md': '# v1.3\n\n- [x] Objective 27: Foo\n' },
    });
    tmpHome = makeHome();

    const { json } = health();
    const found = w007s(json);
    assert.strictEqual(found.length, 1, `expected exactly one W007; got ${JSON.stringify(found)}`);
    assert.match(found[0].message, /Objective 99\b/);
  });

  test('6. prose mentions ("Depends on: Objective 99", "candidates: Objective 99 (") do not count', () => {
    tmpProject = makeRoadmapFixture({
      dirs: ['99-orphan'],
      roadmap:
        '# Roadmap\n\n### Objective 1: Something else\n\n' +
        '**Depends on:** Objective 99\n\n' +
        'Follow-up candidates: Objective 99 (later)\n',
    });
    tmpHome = makeHome();

    const { json } = health();
    const found = w007s(json);
    assert.strictEqual(found.length, 1, `expected exactly one W007; got ${JSON.stringify(found)}`);
    assert.match(found[0].message, /Objective 99\b/);
  });

  test('7. W006 unchanged: a checklist-only ROADMAP.md entry with no dir does not raise W006', () => {
    tmpProject = makeRoadmapFixture({
      dirs: [],
      roadmap: '# Roadmap\n\n- [x] Objective 7: Old\n',
    });
    tmpHome = makeHome();

    const { json } = health();
    assert.strictEqual(w006s(json).length, 0, `list lines must not feed W006; got ${JSON.stringify(w006s(json))}`);
  });

  test('8. non-roadmap files in milestones/ are ignored (v1.3-MILESTONE-AUDIT.md heading does not count)', () => {
    tmpProject = makeRoadmapFixture({
      dirs: ['99-orphan'],
      archives: { 'v1.3-MILESTONE-AUDIT.md': '# Audit\n\n### Objective 99: Audited\n\n- [x] Objective 99: Audited\n' },
    });
    tmpHome = makeHome();

    const { json } = health();
    const found = w007s(json);
    assert.strictEqual(found.length, 1, `expected exactly one W007; got ${JSON.stringify(found)}`);
    assert.match(found[0].message, /Objective 99\b/);
  });
});

// ─── Check 14: documentation staleness (TRD 38-10) ─────────────────────────
//
// Drives the SAME collect() from doc-staleness.cjs (fully unit-tested in
// doc-staleness.test.cjs) through cmdValidateHealth's Check 14 wiring: every
// returned issue becomes an advisory `warning` with `repairable: false`, and a
// throwing collect() becomes exactly one W054 rather than an uncaught crash.
describe('Check 14: documentation staleness', () => {
  const { makeFixture, writeMappedDocs, makeFakeHome, gitEnv } = require('./__fixtures__/adopt-fixtures.cjs');
  const { execFileSync } = require('child_process');

  let gitParent;
  let gitHome;

  afterEach(() => {
    for (const dir of [gitParent, gitHome]) {
      if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
    gitParent = null;
    gitHome = null;
  });

  function git(root, home, args) {
    return execFileSync('git', ['-C', root, ...args], {
      env: gitEnv(home),
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
  }
  function commitAll(root, home, message) {
    git(root, home, ['add', '-A']);
    git(root, home, ['commit', '-q', '-m', message]);
  }

  // A real git repo with codebase maps committed, then 3 more commits touching src/ — matches
  // doc-staleness.test.cjs cases 10/11 exactly, so a configured threshold of 2 (< 3) fires W053.
  function makeW053Fixture() {
    gitParent = fs.mkdtempSync(path.join(os.tmpdir(), 'df-validate-w053-parent-'));
    gitHome = makeFakeHome();
    const root = makeFixture('empty', { parent: gitParent, home: gitHome });
    writeMappedDocs(root);
    commitAll(root, gitHome, 'add codebase maps');
    for (let i = 0; i < 3; i++) {
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src', `f${i}.txt`), `${i}\n`);
      commitAll(root, gitHome, `touch src f${i}`);
    }
    return root;
  }

  const w05xCodes = (json) => json.warnings.filter((w) => /^W05\d$/.test(w.code));

  test('1. stale STACK.md (reviewed 2025-01-01) -> health warnings include non-repairable W051', () => {
    tmpProject = stackFx.makeProject({
      stackMd: stackFx.profileMd({ yaml: 'schema: 1\nprovenance:\n  reviewed: "2025-01-01"\n' }),
    });
    tmpHome = makeHome();

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);
    const w051 = json.warnings.filter((w) => w.code === 'W051');
    assert.strictEqual(w051.length, 1, `expected one W051; got ${JSON.stringify(json.warnings)}`);
    assert.strictEqual(w051[0].repairable, false);
  });

  test('2. go.mod fixture declaring languages:[python] -> W052', () => {
    const reviewed = new Date().toISOString().slice(0, 10); // today — never stale in this test
    tmpProject = stackFx.makeProject({
      stackMd: stackFx.profileMd({ yaml: `schema: 1\nlanguages: [python]\nprovenance:\n  reviewed: "${reviewed}"\n` }),
      files: stackFx.goShapedRepo(),
    });
    tmpHome = makeHome();

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);
    const w052 = json.warnings.filter((w) => w.code === 'W052');
    assert.strictEqual(w052.length, 1, `expected one W052; got ${JSON.stringify(json.warnings)}`);
    assert.match(w052[0].message, /go/);
    assert.match(w052[0].message, /python/);
  });

  test('3. committed maps + config.json docs.codebase_map_stale_commits:2 (3 commits) -> W053', () => {
    tmpProject = makeW053Fixture();
    writeJson(path.join(tmpProject, '.planning', 'config.json'), { docs: { codebase_map_stale_commits: 2 } });
    tmpHome = makeHome();

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);
    const w053 = json.warnings.filter((w) => w.code === 'W053');
    assert.strictEqual(w053.length, 1, `expected one W053; got ${JSON.stringify(json.warnings)}`);
    assert.match(w053[0].message, /3/);
    assert.match(w053[0].message, /2/);
  });

  test('4. STATE.md naming /devflow:update -> W050', () => {
    const state = '# Project State\n\n## Current Position\n\nrun /devflow:update to refresh.\n\n## Session Log\n';
    tmpProject = stackFx.makeProject({ files: { '.planning/STATE.md': state } });
    tmpHome = makeHome();

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);
    const w050 = json.warnings.filter((w) => w.code === 'W050');
    assert.strictEqual(w050.length, 1, `expected one W050; got ${JSON.stringify(json.warnings)}`);
    assert.match(w050[0].message, /\/devflow:update/);
  });

  test('5. clean fixture (fresh STACK.md, matching languages, no maps) -> no W05x', () => {
    const reviewed = new Date().toISOString().slice(0, 10);
    tmpProject = stackFx.makeProject({
      stackMd: stackFx.profileMd({ yaml: `schema: 1\nlanguages: [go]\nprovenance:\n  reviewed: "${reviewed}"\n` }),
      files: stackFx.goShapedRepo(),
    });
    tmpHome = makeHome();

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);
    assert.deepStrictEqual(w05xCodes(json), [], `expected no W05x; got ${JSON.stringify(json.warnings)}`);
  });

  test('6. a throwing collect() adds exactly one W054, never a silent/uncaught failure', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();

    const docStalenessPath = require.resolve('./doc-staleness.cjs');
    const original = require.cache[docStalenessPath];
    require.cache[docStalenessPath] = {
      id: docStalenessPath,
      filename: docStalenessPath,
      loaded: true,
      exports: { collect: () => { throw new Error('boom'); } },
    };

    try {
      const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false);
      const w054 = json.warnings.filter((w) => w.code === 'W054');
      assert.strictEqual(w054.length, 1, `expected exactly one W054; got ${JSON.stringify(json.warnings)}`);
      assert.match(w054[0].message, /doc-staleness-check-failed: boom/);
      assert.strictEqual(w054[0].fix, 'Run `df-tools validate docs` to see why');
    } finally {
      if (original) require.cache[docStalenessPath] = original;
      else delete require.cache[docStalenessPath];
    }
  });

  test('7. --repair on a W051+W053 fixture leaves STACK.md and codebase maps byte-identical, no repair mentions W05x', () => {
    tmpProject = makeW053Fixture();
    const stackMd = stackFx.profileMd({ yaml: 'schema: 1\nprovenance:\n  reviewed: "2025-01-01"\n' });
    fs.writeFileSync(path.join(tmpProject, '.planning', 'STACK.md'), stackMd, 'utf-8');
    writeJson(path.join(tmpProject, '.planning', 'config.json'), { docs: { codebase_map_stale_commits: 2 } });
    tmpHome = makeHome();

    const codebaseDir = path.join(tmpProject, '.planning', 'codebase');
    const before = fs.readdirSync(codebaseDir).sort()
      .map((f) => [f, fs.readFileSync(path.join(codebaseDir, f), 'utf-8')]);

    const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null, repair: true }, false);

    assert.strictEqual(json.warnings.filter((w) => w.code === 'W051').length, 1, 'W051 still raised');
    assert.strictEqual(json.warnings.filter((w) => w.code === 'W053').length, 1, 'W053 still raised');

    const after = fs.readdirSync(codebaseDir).sort()
      .map((f) => [f, fs.readFileSync(path.join(codebaseDir, f), 'utf-8')]);
    assert.deepStrictEqual(after, before, 'codebase maps byte-identical after --repair');
    assert.strictEqual(
      fs.readFileSync(path.join(tmpProject, '.planning', 'STACK.md'), 'utf-8'),
      stackMd,
      'STACK.md byte-identical after --repair'
    );
    assert.ok(
      (json.repairs_performed || []).every((r) => !/W05\d/.test(JSON.stringify(r))),
      'no repair action mentions a W05x code'
    );
  });
});

// ─── df-tools validate docs (CLI) — TRD 38-10 tests 8-11 ────────────────────
//
// A cheap, read-only doc-staleness report for the default /devflow:status view
// (full `validate health` does a best-effort `git fetch` in Check 11, too slow
// for every status call). Drives the same doc-staleness.collect() as Check 14
// above, through cmdValidateDocs and the `validate docs` CLI dispatch.
describe('df-tools validate docs (CLI)', () => {
  const { spawnSync } = require('child_process');
  const DOCS_TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');

  function runDocs(args, cwd, home) {
    const r = spawnSync(process.execPath, [DOCS_TOOLS_PATH, 'validate', ...args], {
      cwd,
      encoding: 'utf-8',
      timeout: 30000,
      env: { ...process.env, HOME: home },
    });
    return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
  }

  test('8. validate docs on the case-1 fixture -> exit 0, issues[0].code === "W051"', () => {
    tmpProject = stackFx.makeProject({
      stackMd: stackFx.profileMd({ yaml: 'schema: 1\nprovenance:\n  reviewed: "2025-01-01"\n' }),
    });
    tmpHome = makeHome();

    const r = runDocs(['docs'], tmpProject, tmpHome);
    assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
    const json = JSON.parse(r.stdout);
    assert.strictEqual(json.issues[0].code, 'W051', `expected W051 first; got ${r.stdout}`);
  });

  test('9. validate docs --raw on the clean fixture -> stdout "no documentation advisories"', () => {
    const reviewed = new Date().toISOString().slice(0, 10);
    tmpProject = stackFx.makeProject({
      stackMd: stackFx.profileMd({ yaml: `schema: 1\nlanguages: [go]\nprovenance:\n  reviewed: "${reviewed}"\n` }),
      files: stackFx.goShapedRepo(),
    });
    tmpHome = makeHome();

    const r = runDocs(['docs', '--raw'], tmpProject, tmpHome);
    assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
    assert.strictEqual(r.stdout, 'no documentation advisories');
  });

  test('10. validate docs in a dir with no .planning/ -> exit 0, note: "no .planning/"', () => {
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'df-validate-docs-noplanning-'));
    tmpHome = makeHome();

    const r = runDocs(['docs'], tmpProject, tmpHome);
    assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
    const json = JSON.parse(r.stdout);
    assert.deepStrictEqual(json, { issues: [], checked: {}, note: 'no .planning/' });
  });

  test('11. validate bogus -> non-zero exit, stderr names consistency, health, docs', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();

    const r = runDocs(['bogus'], tmpProject, tmpHome);
    assert.notStrictEqual(r.status, 0);
    assert.match(r.stderr, /consistency/);
    assert.match(r.stderr, /health/);
    assert.match(r.stderr, /docs/);
  });
});

// ─── Check 15: planning cache drift, W055 / W056 (TRD 48-09) ────────────────
//
// Store mode only. Test 9 pins today's issue codes for local-mode projects that hold
// cache-shaped files with no baselines (every one would be W055 in store mode), so
// Check 15's "not applicable in local mode" is proven additive. All outbox state lives
// under hermeticEnv()'s temp DEVFLOW_OUTBOX_DIR; nothing reads the real ~/.claude.
describe('Check 15: planning cache drift (W055/W056)', () => {
  const upgradeFx = require('./__fixtures__/upgrade-fixtures.cjs');
  const { pluginVersion } = require('./helpers.cjs');
  const { hermeticEnv } = require('./__fixtures__/gh-store-fixtures.cjs');

  let env = null;
  beforeEach(() => {
    env = hermeticEnv();
  });
  afterEach(() => {
    if (env) env.restore();
    env = null;
  });

  /** A current, stamped project (no W040) whose config.json gets `github` merged in. */
  function makeProjectWithGithub(github) {
    const root = upgradeFx.makeStampedProject(pluginVersion());
    const configPath = path.join(root, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (github !== undefined) config.github = github;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    return root;
  }

  const codes = (json) => ({
    errors: json.errors.map((i) => i.code),
    warnings: json.warnings.map((i) => i.code),
    info: json.info.map((i) => i.code),
  });

  // Pinned from `validate health` at WAVE_BASE fdfb4b4f for upgrade-fixtures makeStampedProject:
  // W001 (PROJECT.md missing a section) and I001 (02-01-TRD.md has no SUMMARY.md). The fixture's
  // PROJECT.md, OBJECTIVE.md, TRDs and SUMMARY are all cache-shaped with no baseline, so each would
  // be a W055 in store mode. Any change here is a behaviour change for local projects.
  const PINNED_LOCAL_CODES = { errors: [], warnings: ['W001'], info: ['I001'] };

  const LOCAL_SHAPES = [
    ['no github block', undefined],
    ['github disabled (this repo’s shape)', { enabled: false, repo: '' }],
    ['github enabled, store absent', { enabled: true, repo: 'acme/demo' }],
  ];

  for (const [name, github] of LOCAL_SHAPES) {
    test(`9. characterization, local mode (${name}): issue codes are the pinned list, no W055/W056`, () => {
      tmpProject = makeProjectWithGithub(github);
      tmpHome = makeHome();
      const { json } = runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, true);
      assert.deepStrictEqual(codes(json), PINNED_LOCAL_CODES, JSON.stringify(json, null, 2));
      assert.strictEqual(fs.existsSync(env.env.DEVFLOW_OUTBOX_DIR), false, 'local mode reads and writes no outbox state');
    });
  }
});
