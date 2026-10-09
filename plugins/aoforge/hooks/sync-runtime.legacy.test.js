'use strict';

// Test list (TRD 72-07, objective 72-install-and-naming-cleanup, INST-03): sync-runtime carries the old runtime
// home's state over. Each test spawns the real hook with CLAUDE_PLUGIN_ROOT = this repository's plugin and HOME = a
// fake home from legacy-runtime-fixtures.cjs (never the real ~/.claude); the global upgrade is skipped so only the
// mirror and the migration touch the fake home.
//
// 8. First run: the mirror lands in <home>/.claude/aoforge/ with .plugin-version; the migration marker exists and the
//    estimate run state reached the new home; stdout is empty, exit 0.
// 9. Second run with the same version and digest (the fast path) and the marker present: no migration call (the
//    marker mtime is unchanged and a removed copy is not re-copied), stderr empty.
// 10. Marker deleted, legacy runtime present, fast path: the migration runs once (the marker is back, the fast path
//     still exits without re-mirroring); a further run leaves the marker alone.
// 11. The migration throws (the old state directory is unreadable): one `runtime state migration skipped` stderr
//     line, exit 0, the mirror intact, no marker.

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { legacyRuntimeHome, DEFAULT_KEY: K } = require('../aoforge/bin/lib/__fixtures__/legacy-runtime-fixtures.cjs');

const HOOK_PATH = path.join(__dirname, 'sync-runtime.js');
const PLUGIN_ROOT = path.join(__dirname, '..');
const PLUGIN_VERSION = JSON.parse(
  fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
).version;
const MARKER = '.legacy-state-migrated.json';

/** The session env minus every AOFORGE_/DEVFLOW_ variable, so nothing from the running session leaks in. */
function cleanEnv(home) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('AOFORGE_') || k.startsWith('DEVFLOW_')) continue;
    env[k] = v;
  }
  return { ...env, HOME: home, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, AOFORGE_SKIP_GLOBAL_UPGRADE: '1' };
}

function runHook(home) {
  return spawnSync(process.execPath, [HOOK_PATH], { encoding: 'utf8', env: cleanEnv(home), timeout: 60000 });
}

describe('sync-runtime runs the runtime state migration (TRD 72-07)', () => {
  let h;
  let markerPath;
  before(() => {
    h = legacyRuntimeHome();
    markerPath = path.join(h.aoforge, MARKER);
  });
  after(() => h.cleanup());

  test('8. first run: mirror + .plugin-version, the marker exists, the run state moved over, stdout empty', () => {
    const r = runHook(h.home);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
    assert.equal(fs.readFileSync(path.join(h.aoforge, '.plugin-version'), 'utf8'), PLUGIN_VERSION);
    assert.ok(fs.existsSync(path.join(h.aoforge, 'bin', 'aof-tools.cjs')), 'the mirror landed');
    assert.ok(fs.existsSync(markerPath), 'the migration marker exists');
    assert.equal(
      fs.readFileSync(path.join(h.aoforge, 'state', 'estimates', `${K}.json`), 'utf8'),
      h.files[`state/estimates/${K}.json`]
    );
    assert.doesNotMatch(r.stderr, /migration skipped/);
  });

  test('9. fast path with the marker present: no migration call', () => {
    const mtime = fs.statSync(markerPath).mtimeMs;
    fs.rmSync(path.join(h.aoforge, 'audit.log'));
    const r = runHook(h.home);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr, '', 'the fast path is silent');
    assert.equal(fs.statSync(markerPath).mtimeMs, mtime, 'marker untouched');
    assert.equal(fs.existsSync(path.join(h.aoforge, 'audit.log')), false, 'nothing was copied again');
  });

  test('10. marker deleted + legacy present on the fast path: the migration runs once', () => {
    fs.rmSync(markerPath);
    const versionMtime = fs.statSync(path.join(h.aoforge, '.plugin-version')).mtimeMs;
    const r = runHook(h.home);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
    assert.doesNotMatch(r.stderr, /runtime synced/, 'still the fast path: no re-mirror');
    assert.equal(fs.statSync(path.join(h.aoforge, '.plugin-version')).mtimeMs, versionMtime);
    assert.ok(fs.existsSync(markerPath), 'the marker is back');
    assert.equal(fs.readFileSync(path.join(h.aoforge, 'audit.log'), 'utf8'), h.files['audit.log'], 're-copied');

    const mtime = fs.statSync(markerPath).mtimeMs;
    const again = runHook(h.home);
    assert.equal(again.status, 0, again.stderr);
    assert.equal(fs.statSync(markerPath).mtimeMs, mtime, 'runs once: a further session leaves it alone');
  });

  test('11. a throwing migration is one stderr line, exit 0, the mirror intact', (t) => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      t.skip('root reads a mode-000 directory');
      return;
    }
    const g = legacyRuntimeHome();
    const stateDir = path.join(g.legacy, 'state');
    fs.chmodSync(stateDir, 0o000);
    t.after(() => {
      fs.chmodSync(stateDir, 0o755);
      g.cleanup();
    });
    const r = runHook(g.home);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
    const lines = r.stderr.split('\n').filter((l) => /runtime state migration skipped/.test(l));
    assert.equal(lines.length, 1, r.stderr);
    assert.match(lines[0], /^\[aoforge\] runtime state migration skipped: .*EACCES/);
    assert.doesNotMatch(r.stderr, /sync-runtime failed/);
    assert.equal(fs.readFileSync(path.join(g.aoforge, '.plugin-version'), 'utf8'), PLUGIN_VERSION);
    assert.ok(fs.existsSync(path.join(g.aoforge, 'bin', 'aof-tools.cjs')), 'mirror intact');
    assert.equal(fs.existsSync(path.join(g.aoforge, MARKER)), false, 'no marker: the next session retries');
  });
});
