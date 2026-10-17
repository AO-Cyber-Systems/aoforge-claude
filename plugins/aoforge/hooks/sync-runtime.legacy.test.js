'use strict';

// Test list (TRD 78-06, objective 78, SC-3): sync-runtime no longer carries the pre-rename runtime home over.
//
// AOForge 3.0.x copied the old runtime home's state into ~/.claude/aoforge/ on the first session (TRD 72-07). 3.1 runs
// no such conversion: the coexistence-guard notice and doctor check 16 name the 3.0.x path or the manual copy. The
// global upgrade (objective 36: the df-* move and the managed CLAUDE.md block) is not a rename shim and still runs.
//
// Each test spawns the real hook with CLAUDE_PLUGIN_ROOT = this repository's plugin and HOME = a scratch home from
// legacy-runtime-fixtures.cjs (never the real ~/.claude), with a pre-rename runtime home and no migration marker.
//
// 6. First run: the mirror lands with .plugin-version; no migration marker, none of the old home's state in the new
//    home, the old home byte for byte as it was; the global upgrade still ran (a df-* skill moved into
//    backups/legacy-<ts>/, CLAUDE.md holds the managed block); stdout empty, exit 0, no migration line on stderr.
// 6b. Second run on the fast path (same version and digest): still no marker and nothing copied; stderr empty.

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { legacyRuntimeHome } = require('../aoforge/bin/lib/__fixtures__/legacy-runtime-fixtures.cjs');

const HOOK_PATH = path.join(__dirname, 'sync-runtime.js');
const PLUGIN_ROOT = path.join(__dirname, '..');
const PLUGIN_VERSION = JSON.parse(
  fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
).version;
const MARKER = '.legacy-state-migrated.json';
const DF_SKILL = 'skills/df-plan/SKILL.md';

/** The session env minus every AOFORGE_/DEVFLOW_ variable, so nothing from the running session leaks in. */
function cleanEnv(home) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('AOFORGE_') || k.startsWith('DEVFLOW_')) continue;
    env[k] = v;
  }
  return { ...env, HOME: home, USERPROFILE: home, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT };
}

function runHook(home) {
  return spawnSync(process.execPath, [HOOK_PATH], { encoding: 'utf8', env: cleanEnv(home), timeout: 60000 });
}

/** Every file under `dir`, relative and posix, sorted; [] when it does not exist. */
function listFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  (function walk(cur, rel) {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(cur, entry.name), childRel);
      else out.push(childRel);
    }
  })(dir, '');
  return out.sort();
}

/** The old home's user state, none of which may appear under the new home. */
function stateRels(h) {
  return Object.keys(h.files).filter((rel) =>
    /^(calibration\.json|audit\.log|transcript-index\.jsonl|stacks\/|state\/|backups\/)/.test(rel)
  );
}

describe('sync-runtime runs no pre-rename runtime-state migration (TRD 78-06)', () => {
  let h;
  let markerPath;
  before(() => {
    h = legacyRuntimeHome();
    markerPath = path.join(h.aoforge, MARKER);
    const skill = path.join(h.home, '.claude', ...DF_SKILL.split('/'));
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    fs.writeFileSync(skill, '---\nname: df-plan\n---\n# legacy skill\n');
  });
  after(() => h.cleanup());

  test('6. first run: mirror, no marker, nothing carried over, the old home untouched; the global upgrade ran', () => {
    const r = runHook(h.home);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
    assert.doesNotMatch(r.stderr, /runtime state migration/);

    assert.equal(fs.readFileSync(path.join(h.aoforge, '.plugin-version'), 'utf8'), PLUGIN_VERSION);
    assert.ok(fs.existsSync(path.join(h.aoforge, 'bin', 'aof-tools.cjs')), 'the mirror landed');

    assert.equal(fs.existsSync(markerPath), false, 'no migration marker');
    for (const rel of stateRels(h)) {
      assert.equal(fs.existsSync(path.join(h.aoforge, ...rel.split('/'))), false, `${rel} was carried over`);
    }
    for (const [rel, content] of Object.entries(h.files)) {
      assert.equal(fs.readFileSync(path.join(h.legacy, ...rel.split('/')), 'utf8'), content, `old home changed: ${rel}`);
    }

    // The objective-36 global upgrade is not a rename shim: the df-* move and the managed block still happen.
    assert.equal(fs.existsSync(path.join(h.home, '.claude', ...DF_SKILL.split('/'))), false, 'the df-* skill moved');
    const backups = path.join(h.aoforge, 'backups');
    const legacyDirs = fs.readdirSync(backups).filter((d) => d.startsWith('legacy-'));
    assert.equal(legacyDirs.length, 1, `one legacy-<ts> backup: ${legacyDirs.join(', ')}`);
    assert.deepEqual(listFiles(path.join(backups, legacyDirs[0])), [DF_SKILL]);
    const md = fs.readFileSync(path.join(h.home, '.claude', 'CLAUDE.md'), 'utf8');
    assert.match(md, /<!-- AOFORGE:START /, 'CLAUDE.md gained the managed block');
  });

  test('6b. second run on the fast path: still no marker, still nothing copied, stderr empty', () => {
    const versionMtime = fs.statSync(path.join(h.aoforge, '.plugin-version')).mtimeMs;
    const r = runHook(h.home);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr, '', 'the fast path is silent');
    assert.equal(fs.statSync(path.join(h.aoforge, '.plugin-version')).mtimeMs, versionMtime, 'no re-mirror');
    assert.equal(fs.existsSync(markerPath), false, 'no migration marker');
    for (const rel of stateRels(h)) {
      assert.equal(fs.existsSync(path.join(h.aoforge, ...rel.split('/'))), false, `${rel} was carried over`);
    }
  });
});
