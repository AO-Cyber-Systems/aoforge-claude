/**
 * Tests for sync-runtime.js SessionStart hook.
 *
 * All tests use isolated tmpdir for BOTH source (CLAUDE_PLUGIN_ROOT) and
 * target (HOME). NEVER passes real HOME or repo root as CLAUDE_PLUGIN_ROOT —
 * doing so would overwrite the live ~/.claude/aoforge/ mirror mid-session.
 *
 * Test cases (per TRD 23-01 ## Test list):
 *   1. Fresh install — all four subdirs mirrored, .plugin-version written
 *   2. Version match + intact mirror — hook exits without modifying target
 *   3. Version mismatch — target re-synced, stale file removed
 *   4. Exclusion — *.test.cjs NOT mirrored; sibling *.cjs IS mirrored
 *   5. Exclusion — *.test.js NOT mirrored in any synced subdir
 *   6. Exclusion — __fixtures__/ dir NOT present in target
 *   7. Self-heal — marker current but bin/aof-tools.cjs missing → re-syncs
 *   8. Atomicity hygiene — no aoforge-tmp-* entries remain after sync
 *   9. Failure path — missing CLAUDE_PLUGIN_ROOT → exits 0, writes nothing
 *  10. Failure path — unreadable/missing plugin.json → exits 0, target untouched
 *
 * Quick 21: never downgrade the mirror — see 'Quick 21' describe blocks below.
 *
 * Objective 45 (TRD 45-03): the marker is version + content digest (.plugin-digest) — see the
 * 'Objective 45: content digest marker' describe block. Cases that expect the equal-version
 * no-op seed a matching digest with seedDigest(); a mirror without one is re-mirrored once.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const runtimeDigest = require('../aoforge/bin/lib/runtime-digest.cjs');

const HOOK_PATH = path.join(__dirname, 'sync-runtime.js');
const TEST_VERSION = '9.9.9-test';

// ---------------------------------------------------------------------------
// Harness helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal self-contained tmp tree:
 *
 *   <root>/
 *     plugin-root/
 *       .claude-plugin/plugin.json  (declares version 9.9.9-test)
 *       aoforge/
 *         bin/aof-tools.cjs          (stub)
 *         bin/lib/helper.cjs        (stub — should be mirrored)
 *         bin/lib/helper.test.cjs   (test file — should NOT be mirrored)
 *         bin/lib/__fixtures__/sample.json  (fixture — should NOT be mirrored)
 *         workflows/wf.md           (stub — should be mirrored)
 *         references/ref.md         (stub — should be mirrored)
 *         templates/tpl.md          (stub — should be mirrored)
 *     home/                         (fake HOME — target is home/.claude/aoforge)
 *
 * Returns { root, pluginRoot, aoforgeSrc, home, targetDir, versionFile }
 */
function makeTmpRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-rt-'));

  const pluginRoot = path.join(root, 'plugin-root');
  const claudePluginDir = path.join(pluginRoot, '.claude-plugin');
  const aoforgeSrc = path.join(pluginRoot, 'aoforge');

  // .claude-plugin/plugin.json
  fs.mkdirSync(claudePluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(claudePluginDir, 'plugin.json'),
    JSON.stringify({ version: TEST_VERSION })
  );

  // aoforge/bin/aof-tools.cjs
  fs.mkdirSync(path.join(aoforgeSrc, 'bin', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(aoforgeSrc, 'bin', 'aof-tools.cjs'), '// stub aof-tools');
  // aoforge/bin/lib/helper.cjs (should mirror)
  fs.writeFileSync(path.join(aoforgeSrc, 'bin', 'lib', 'helper.cjs'), '// stub helper');
  // aoforge/bin/lib/helper.test.cjs (should NOT mirror — test file)
  fs.writeFileSync(path.join(aoforgeSrc, 'bin', 'lib', 'helper.test.cjs'), '// test stub');
  // aoforge/bin/lib/__fixtures__/sample.json (should NOT mirror)
  fs.mkdirSync(path.join(aoforgeSrc, 'bin', 'lib', '__fixtures__'), { recursive: true });
  fs.writeFileSync(
    path.join(aoforgeSrc, 'bin', 'lib', '__fixtures__', 'sample.json'),
    '{"fixture":true}'
  );

  // aoforge/workflows/wf.md
  fs.mkdirSync(path.join(aoforgeSrc, 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(aoforgeSrc, 'workflows', 'wf.md'), '# workflow stub');
  // aoforge/references/ref.md
  fs.mkdirSync(path.join(aoforgeSrc, 'references'), { recursive: true });
  fs.writeFileSync(path.join(aoforgeSrc, 'references', 'ref.md'), '# reference stub');
  // aoforge/templates/tpl.md
  fs.mkdirSync(path.join(aoforgeSrc, 'templates'), { recursive: true });
  fs.writeFileSync(path.join(aoforgeSrc, 'templates', 'tpl.md'), '# template stub');
  // aoforge/schemas/surface-spec.schema.json (TRD 34-02 — must mirror)
  fs.mkdirSync(path.join(aoforgeSrc, 'schemas'), { recursive: true });
  fs.writeFileSync(
    path.join(aoforgeSrc, 'schemas', 'surface-spec.schema.json'),
    '{"schema_version":1}'
  );

  // home dir (fake HOME)
  const home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true });

  const targetDir = path.join(home, '.claude', 'aoforge');
  const versionFile = path.join(targetDir, '.plugin-version');

  return { root, pluginRoot, aoforgeSrc, home, targetDir, versionFile };
}

/**
 * Spawn the hook subprocess with controlled env.
 * Always pass fake HOME and fake CLAUDE_PLUGIN_ROOT to avoid live-mirror hazard.
 */
function runHook(pluginRoot, home, extraEnv = {}) {
  return spawnSync(process.execPath, [HOOK_PATH], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      HOME: home,
      ...extraEnv,
    },
  });
}

/** Recursively collect all file paths under dir (relative to dir). */
function listFiles(dir) {
  const results = [];
  function walk(current, rel) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const relPath = rel ? rel + '/' + entry.name : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(current, entry.name), relPath);
      } else {
        results.push(relPath);
      }
    }
  }
  if (fs.existsSync(dir)) walk(dir, '');
  return results;
}

/**
 * Rewrite <pluginRoot>/.claude-plugin/plugin.json with a given version.
 * Pass v === undefined to write a manifest with NO version field at all.
 */
function setPluginVersion(pluginRoot, v) {
  const manifestPath = path.join(pluginRoot, '.claude-plugin', 'plugin.json');
  const body = v === undefined ? {} : { version: v };
  fs.writeFileSync(manifestPath, JSON.stringify(body));
}

/**
 * Pre-seed targetDir as an "already mirrored" tree: bin/aof-tools.cjs (only
 * when sentinel is true), a canary file (to prove no-op cases leave the
 * mirror untouched), and .plugin-version (skipped entirely when v === null,
 * simulating no version file on disk at all).
 */
function seedMirror(targetDir, versionFile, v, { sentinel = true } = {}) {
  fs.mkdirSync(path.join(targetDir, 'bin'), { recursive: true });
  if (sentinel) {
    fs.writeFileSync(path.join(targetDir, 'bin', 'aof-tools.cjs'), '// seeded aof-tools');
  }
  fs.writeFileSync(path.join(targetDir, 'bin', 'canary.txt'), 'canary-content');
  if (v !== null) {
    fs.writeFileSync(versionFile, v);
  }
}

/**
 * Objective 45: write the `.plugin-digest` marker a current mirror carries — the digest of the
 * bundled tree. A mirror seeded without it is a pre-45 mirror, which the hook re-mirrors once, so
 * every "equal version, intact sentinel => no-op" case must seed a matching digest.
 */
function seedDigest(targetDir, aoforgeSrc) {
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(
    path.join(targetDir, runtimeDigest.DIGEST_FILE),
    runtimeDigest.digestTree(aoforgeSrc)
  );
}

/** {relPath: content} map of everything under dir, built with listFiles. */
function snapshot(dir) {
  const map = {};
  for (const rel of listFiles(dir)) {
    map[rel] = fs.readFileSync(path.join(dir, rel), 'utf8');
  }
  return map;
}

// ---------------------------------------------------------------------------
// Test 1: Fresh install — all four subdirs mirrored, .plugin-version written
// ---------------------------------------------------------------------------

describe('Test 1: Fresh install', () => {
  test('all four subdirs mirrored and .plugin-version written', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);

    // .plugin-version written with correct version
    assert.ok(fs.existsSync(versionFile), '.plugin-version not written');
    assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), TEST_VERSION);

    // All four subdirs exist in target
    for (const sub of ['workflows', 'references', 'templates', 'bin']) {
      assert.ok(
        fs.existsSync(path.join(targetDir, sub)),
        `target/${sub} not created`
      );
    }

    // Key content files present
    assert.ok(fs.existsSync(path.join(targetDir, 'bin', 'aof-tools.cjs')));
    assert.ok(fs.existsSync(path.join(targetDir, 'workflows', 'wf.md')));
    assert.ok(fs.existsSync(path.join(targetDir, 'references', 'ref.md')));
    assert.ok(fs.existsSync(path.join(targetDir, 'templates', 'tpl.md')));
  });
});

// ---------------------------------------------------------------------------
// Test 2: Version match + intact mirror — hook exits without modifying target
// ---------------------------------------------------------------------------

describe('Test 2: Version match + intact sentinel — early exit', () => {
  test('does not modify target when version matches and sentinel present', (t) => {
    const { root, pluginRoot, aoforgeSrc, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    // Pre-build the target (simulate an already-synced state)
    fs.mkdirSync(path.join(targetDir, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'bin', 'aof-tools.cjs'), '// already synced');
    fs.writeFileSync(versionFile, TEST_VERSION);
    seedDigest(targetDir, aoforgeSrc); // Objective 45: a current mirror carries the digest marker

    // Write a canary file that should remain untouched
    const canary = path.join(targetDir, 'bin', 'canary.txt');
    fs.writeFileSync(canary, 'canary-content');

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0);

    // Canary should still exist (hook exited early without re-syncing)
    assert.ok(fs.existsSync(canary), 'canary file removed — hook did not early-exit');
    assert.equal(fs.readFileSync(canary, 'utf8'), 'canary-content');
  });
});

// ---------------------------------------------------------------------------
// Test 3: Version mismatch — target re-synced, stale file removed
// ---------------------------------------------------------------------------

describe('Test 3: Version mismatch — full re-sync', () => {
  test('old stale file in target subdir is removed after swap', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    // Pre-build target with old version and stale file
    fs.mkdirSync(path.join(targetDir, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'bin', 'aof-tools.cjs'), '// old version');
    const staleFile = path.join(targetDir, 'bin', 'stale-old.cjs');
    fs.writeFileSync(staleFile, '// this should be gone after re-sync');
    fs.writeFileSync(versionFile, '1.0.0-old');

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0);

    // Version marker updated
    assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), TEST_VERSION);
    // Stale file is gone (atomic rename replaced entire subdir)
    assert.ok(!fs.existsSync(staleFile), 'stale file still present after re-sync');
    // New content is there
    assert.ok(fs.existsSync(path.join(targetDir, 'bin', 'aof-tools.cjs')));
  });
});

// ---------------------------------------------------------------------------
// Test 4: Exclusion — *.test.cjs NOT mirrored; sibling *.cjs IS mirrored
// ---------------------------------------------------------------------------

describe('Test 4: Exclusion — *.test.cjs not mirrored', () => {
  test('bin/lib/helper.test.cjs absent; bin/lib/helper.cjs present in target', (t) => {
    const { root, pluginRoot, home, targetDir } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0);

    // Test file must NOT be in target
    const testFile = path.join(targetDir, 'bin', 'lib', 'helper.test.cjs');
    assert.ok(!fs.existsSync(testFile), 'helper.test.cjs should not be mirrored');

    // Non-test sibling MUST be in target
    const libFile = path.join(targetDir, 'bin', 'lib', 'helper.cjs');
    assert.ok(fs.existsSync(libFile), 'helper.cjs should be mirrored');
  });
});

// ---------------------------------------------------------------------------
// Test 5: Exclusion — *.test.js NOT mirrored in any synced subdir
// ---------------------------------------------------------------------------

describe('Test 5: Exclusion — *.test.js not mirrored', () => {
  test('a .test.js file placed in workflows/ is not mirrored', (t) => {
    const { root, pluginRoot, aoforgeSrc, home, targetDir } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    // Add a .test.js file to workflows source
    fs.writeFileSync(
      path.join(aoforgeSrc, 'workflows', 'workflow.test.js'),
      '// test workflow stub'
    );

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0);

    // .test.js must NOT be in target
    const testFile = path.join(targetDir, 'workflows', 'workflow.test.js');
    assert.ok(!fs.existsSync(testFile), 'workflow.test.js should not be mirrored');

    // Non-test .md file IS there
    assert.ok(fs.existsSync(path.join(targetDir, 'workflows', 'wf.md')));
  });
});

// ---------------------------------------------------------------------------
// Test 6: Exclusion — __fixtures__/ dir NOT mirrored
// ---------------------------------------------------------------------------

describe('Test 6: Exclusion — __fixtures__/ dir not mirrored', () => {
  test('bin/lib/__fixtures__/ absent from target; parent bin/lib/ present', (t) => {
    const { root, pluginRoot, home, targetDir } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0);

    // __fixtures__ dir must NOT be in target
    const fixturesDir = path.join(targetDir, 'bin', 'lib', '__fixtures__');
    assert.ok(!fs.existsSync(fixturesDir), '__fixtures__/ should not be mirrored');

    // sample.json inside __fixtures__ must NOT be mirrored
    const sampleFile = path.join(targetDir, 'bin', 'lib', '__fixtures__', 'sample.json');
    assert.ok(!fs.existsSync(sampleFile), '__fixtures__/sample.json should not be mirrored');

    // Parent lib/ with non-test sibling IS mirrored
    const libDir = path.join(targetDir, 'bin', 'lib');
    assert.ok(fs.existsSync(libDir), 'bin/lib/ should be mirrored');
    assert.ok(fs.existsSync(path.join(libDir, 'helper.cjs')), 'helper.cjs should be mirrored');
  });
});

// ---------------------------------------------------------------------------
// Test 7: Self-heal — version matches but bin/aof-tools.cjs missing → re-syncs
// ---------------------------------------------------------------------------

describe('Test 7: Self-heal — sentinel missing forces re-sync', () => {
  test('re-syncs when version marker matches but bin/aof-tools.cjs absent', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    // Set up target: version marker matches but no sentinel (incomplete mirror)
    fs.mkdirSync(targetDir, { recursive: true });
    // Write the version marker WITHOUT the sentinel
    fs.writeFileSync(versionFile, TEST_VERSION);
    // Do NOT create bin/aof-tools.cjs — this is the corruption mode

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0);

    // After self-heal, sentinel should exist
    assert.ok(
      fs.existsSync(path.join(targetDir, 'bin', 'aof-tools.cjs')),
      'self-heal failed: bin/aof-tools.cjs still missing'
    );
    // Version marker should reflect the version
    assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), TEST_VERSION);
  });
});

// ---------------------------------------------------------------------------
// Test 8: Atomicity hygiene — no aoforge-tmp-* entries remain after sync
// ---------------------------------------------------------------------------

describe('Test 8: Atomicity hygiene — no stale tmp dirs', () => {
  test('no aoforge-tmp-* entries in targetDir after successful sync', (t) => {
    const { root, pluginRoot, home, targetDir } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0);

    // No aoforge-tmp-* dirs should remain in targetDir
    if (fs.existsSync(targetDir)) {
      const entries = fs.readdirSync(targetDir);
      const tmpEntries = entries.filter(e => e.startsWith('aoforge-tmp-'));
      assert.deepEqual(tmpEntries, [], `stale tmp dirs remain: ${tmpEntries.join(', ')}`);
    }
  });

  test('stale aoforge-tmp-* dirs from a prior crashed run are swept before sync', (t) => {
    const { root, pluginRoot, home, targetDir } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    // Pre-create a stale tmp dir (simulating a previously crashed run)
    fs.mkdirSync(targetDir, { recursive: true });
    const staleDir = path.join(targetDir, 'aoforge-tmp-bin-99999');
    fs.mkdirSync(staleDir, { recursive: true });
    fs.writeFileSync(path.join(staleDir, 'stale.cjs'), '// stale');

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0);

    // Stale tmp dir should be gone
    assert.ok(!fs.existsSync(staleDir), 'stale aoforge-tmp-* dir was not swept');
    // No new tmp dirs remain either
    const entries = fs.readdirSync(targetDir);
    const tmpEntries = entries.filter(e => e.startsWith('aoforge-tmp-'));
    assert.deepEqual(tmpEntries, []);
  });
});

// ---------------------------------------------------------------------------
// Test 9: Failure path — missing CLAUDE_PLUGIN_ROOT → exits 0, writes nothing
// ---------------------------------------------------------------------------

describe('Test 9: Failure path — missing CLAUDE_PLUGIN_ROOT', () => {
  test('exits 0 and writes nothing to target when CLAUDE_PLUGIN_ROOT absent', (t) => {
    const { root, home, targetDir } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    // Spawn hook without CLAUDE_PLUGIN_ROOT
    const result = spawnSync(process.execPath, [HOOK_PATH], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: undefined,
        HOME: home,
      },
    });

    assert.equal(result.status, 0, 'hook must exit 0 even on missing env var');
    // Target directory should not have been created
    assert.ok(
      !fs.existsSync(path.join(targetDir, '.plugin-version')),
      '.plugin-version should not be written when CLAUDE_PLUGIN_ROOT missing'
    );
  });
});

// ---------------------------------------------------------------------------
// Test 10: Failure path — missing plugin.json → exits 0, target untouched
// ---------------------------------------------------------------------------

describe('Test 10: Failure path — missing plugin.json', () => {
  test('exits 0 and does not write .plugin-version when plugin.json missing', (t) => {
    const { root, pluginRoot, home, targetDir } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    // Remove plugin.json to simulate unreadable manifest
    const manifestPath = path.join(pluginRoot, '.claude-plugin', 'plugin.json');
    fs.unlinkSync(manifestPath);

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, 'hook must exit 0 even when plugin.json missing');

    const versionFile = path.join(targetDir, '.plugin-version');
    assert.ok(
      !fs.existsSync(versionFile),
      '.plugin-version should not be written when plugin.json missing'
    );
  });

  test('exits 0 and does not write .plugin-version when plugin.json is malformed JSON', (t) => {
    const { root, pluginRoot, home, targetDir } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    // Overwrite plugin.json with invalid JSON
    const manifestPath = path.join(pluginRoot, '.claude-plugin', 'plugin.json');
    fs.writeFileSync(manifestPath, '{ not valid json !!');

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, 'hook must exit 0 even when plugin.json is malformed');

    const versionFile = path.join(targetDir, '.plugin-version');
    assert.ok(
      !fs.existsSync(versionFile),
      '.plugin-version should not be written when plugin.json malformed'
    );
  });
});

// ---------------------------------------------------------------------------
// Bonus: Exclusion regexes do NOT match references/deviation-rules.md
// (regression guard for TRD 23-05 which ships this file through the mirror)
// ---------------------------------------------------------------------------

describe('Regression: exclusion patterns do not match references/*.md', () => {
  test('references/deviation-rules.md is not excluded', () => {
    const MIRROR_EXCLUDE = [/\.test\.cjs$/, /\.test\.js$/, /(^|\/)__fixtures__(\/|$)/];
    const testPath = 'references/deviation-rules.md';
    const excluded = MIRROR_EXCLUDE.some(r => r.test(testPath));
    assert.equal(excluded, false, 'references/deviation-rules.md must not be excluded');
  });
});

// ---------------------------------------------------------------------------
// Objective 34 mirror-completeness guard
//
// TRD 34-02 shipped `aoforge/schemas/` (surface-spec.schema.json +
// must_not_vocabulary.json). `loadSurfaceSpecSchema()` resolves them relative to
// __dirname, so every checkout test passes — but SUBDIRS is an ALLOWLIST, and a
// subdir missing from it is never mirrored. `aof-tools ui spec validate` would then
// ENOENT on every real skill invocation while the suite stayed green: a check that
// passes in the checkout and cannot run in the runtime that matters.
//
// Case A pins the schemas dir. Case B is the drift guard — it fails for the NEXT
// subdir someone adds, not just this one.
// ---------------------------------------------------------------------------

describe('Objective 34: every shipped runtime subdir reaches the mirror', () => {
  test('A — aoforge/schemas/ is mirrored', (t) => {
    const { root, pluginRoot, home, targetDir } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);

    assert.ok(
      fs.existsSync(path.join(targetDir, 'schemas')),
      'target/schemas not created — SUBDIRS is an allowlist and omits it'
    );
    assert.ok(
      fs.existsSync(path.join(targetDir, 'schemas', 'surface-spec.schema.json')),
      'surface-spec.schema.json not mirrored — ui spec validate would ENOENT at runtime'
    );
  });

  test('B — drift guard: no real aoforge/ subdir is absent from the mirror', (t) => {
    // Runs against the REAL checkout, not the tmp tree: this is the case that
    // catches a subdir added after today.
    const realSrc = path.join(__dirname, '..', 'aoforge');
    const onDisk = fs.readdirSync(realSrc, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name)
      .sort();

    // Objective 45: the hook takes SUBDIRS from the shared runtime-digest module (its literal
    // fallback is pinned to the module in the 'Objective 45' describe below), so the drift guard
    // reads the same allowlist the hook actually mirrors.
    const declared = [...runtimeDigest.SUBDIRS].sort();

    const missing = onDisk.filter(d => !declared.includes(d));
    assert.deepStrictEqual(
      missing, [],
      `aoforge/ subdir(s) on disk but not in SUBDIRS, so never mirrored: ${missing.join(', ')}`
    );
  });
});

// ---------------------------------------------------------------------------
// Objective 42 (TRD 42-10): bundled tier-2 profiles mirror, user/org profiles survive
//
// TRD 42-02 moved the go/dart/flutter profiles to aoforge/stack-profiles/ and added
// 'stack-profiles' to SUBDIRS. That dir is swapped wholesale on every mirror, exactly like
// references/ — so it MUST NOT be where a user or org keeps its own profile. Those live in
// ~/.claude/aoforge/stacks/<id>.md, a sibling that is deliberately NOT in SUBDIRS. If it ever
// joined the allowlist (or the drift guard's "fix" were to add every dir), a mirror run would
// delete every user override. These cases pin both halves.
// ---------------------------------------------------------------------------

describe('Objective 42: stack-profiles mirrors; ~/.claude/aoforge/stacks/ is never touched', () => {
  // A byte pattern that would not survive a utf8 round trip, so "byte-identical" is real.
  const CUSTOM_BYTES = Buffer.concat([
    Buffer.from('---\nschema: 1\nid: custom\nextends: go\n---\n\n# Org profile\n'),
    Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x0d, 0x0a]),
  ]);

  function seedBundledProfile(aoforgeSrc) {
    fs.mkdirSync(path.join(aoforgeSrc, 'stack-profiles'), { recursive: true });
    fs.writeFileSync(
      path.join(aoforgeSrc, 'stack-profiles', 'go.md'),
      '---\nschema: 1\nid: go\n---\n\n# Stack Profile: go\n'
    );
  }

  function seedUserStacks(targetDir) {
    fs.mkdirSync(path.join(targetDir, 'stacks', 'acme'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'stacks', 'custom.md'), CUSTOM_BYTES);
    fs.writeFileSync(path.join(targetDir, 'stacks', 'acme', 'nested.md'), 'nested org profile');
  }

  test('fresh mirror creates stack-profiles/go.md and leaves stacks/custom.md byte-identical', (t) => {
    const { root, pluginRoot, aoforgeSrc, home, targetDir } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    seedBundledProfile(aoforgeSrc);
    seedUserStacks(targetDir);

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);

    assert.ok(
      fs.existsSync(path.join(targetDir, 'stack-profiles', 'go.md')),
      'stack-profiles/go.md not mirrored — SUBDIRS omits stack-profiles'
    );
    assert.ok(
      CUSTOM_BYTES.equals(fs.readFileSync(path.join(targetDir, 'stacks', 'custom.md'))),
      'stacks/custom.md changed — the mirror touched the user/org profile dir'
    );
    assert.equal(
      fs.readFileSync(path.join(targetDir, 'stacks', 'acme', 'nested.md'), 'utf8'),
      'nested org profile'
    );
  });

  test('a version-bump re-mirror refreshes stack-profiles/ but still leaves stacks/ alone', (t) => {
    const { root, pluginRoot, aoforgeSrc, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    seedBundledProfile(aoforgeSrc);

    // An older mirror already on disk: a stale bundled profile, plus the user's own profile.
    seedMirror(targetDir, versionFile, '1.0.0');
    fs.mkdirSync(path.join(targetDir, 'stack-profiles'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'stack-profiles', 'stale.md'), 'removed upstream');
    seedUserStacks(targetDir);

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
    assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), TEST_VERSION, 'mirror did not run');

    assert.ok(fs.existsSync(path.join(targetDir, 'stack-profiles', 'go.md')));
    assert.ok(
      !fs.existsSync(path.join(targetDir, 'stack-profiles', 'stale.md')),
      'stack-profiles/ is a mirror of the bundled dir: a profile removed upstream must not linger'
    );
    assert.ok(
      CUSTOM_BYTES.equals(fs.readFileSync(path.join(targetDir, 'stacks', 'custom.md'))),
      'stacks/custom.md changed across a re-mirror'
    );
    assert.equal(
      fs.readFileSync(path.join(targetDir, 'stacks', 'acme', 'nested.md'), 'utf8'),
      'nested org profile'
    );
  });
});

// ---------------------------------------------------------------------------
// Quick 21: never downgrade the mirror
//
// The old gate skipped work only on EXACT version equality + intact sentinel.
// Any other difference re-mirrored — including a session running an OLDER
// plugin cache against a NEWER mirror, which downgraded it (found at 2.7.1
// while 2.10.1 was installed). New rule: mirror only when (a) the mirror's
// .plugin-version is missing or unparseable, (b) the plugin is strictly
// semver-newer than the mirror, or (c) versions are equal but the sentinel
// is missing. Every other case is a no-op that leaves the mirror
// byte-identical and touches nothing.
// ---------------------------------------------------------------------------

describe('Quick 21: never downgrade the mirror', () => {
  test('1 — older plugin (2.7.1) over newer mirror (2.10.1): no-op, one-line stderr naming both versions', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    setPluginVersion(pluginRoot, '2.7.1');
    seedMirror(targetDir, versionFile, '2.10.1');
    const before = snapshot(targetDir);

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, result.stderr);

    assert.deepEqual(snapshot(targetDir), before, 'mirror must be byte-identical after a refused downgrade');

    const lines = result.stderr.trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 1, `expected exactly one stderr line, got: ${JSON.stringify(lines)}`);
    assert.match(lines[0], /2\.7\.1/);
    assert.match(lines[0], /2\.10\.1/);
  });

  test('2 — numeric-not-lexical: plugin 2.9.0 over mirror 2.10.1 is a no-op', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    setPluginVersion(pluginRoot, '2.9.0');
    seedMirror(targetDir, versionFile, '2.10.1');
    const before = snapshot(targetDir);

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(snapshot(targetDir), before);
  });

  test('3 — downgrade refused even when the mirror sentinel is already missing (broken mirror stays broken, not overwritten)', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    setPluginVersion(pluginRoot, '2.7.1');
    seedMirror(targetDir, versionFile, '2.10.1', { sentinel: false });
    const before = snapshot(targetDir);

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(snapshot(targetDir), before);
    assert.ok(!fs.existsSync(path.join(targetDir, 'bin', 'aof-tools.cjs')), 'a downgrade refusal must not repair a broken mirror');
  });

  test('4 — newer plugin (2.10.1) over older mirror (2.7.1) mirrors; canary gone', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    setPluginVersion(pluginRoot, '2.10.1');
    seedMirror(targetDir, versionFile, '2.7.1');

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), '2.10.1');
    assert.ok(!fs.existsSync(path.join(targetDir, 'bin', 'canary.txt')), 'canary should be gone after a real re-sync');
  });

  test('5 — newer plugin (2.10.1) over mirror 2.9.0 mirrors (numeric per part)', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    setPluginVersion(pluginRoot, '2.10.1');
    seedMirror(targetDir, versionFile, '2.9.0');

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), '2.10.1');
  });

  test('6 — equal versions + intact sentinel: no-op, canary kept', (t) => {
    const { root, pluginRoot, aoforgeSrc, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    setPluginVersion(pluginRoot, '2.10.1');
    seedMirror(targetDir, versionFile, '2.10.1');
    seedDigest(targetDir, aoforgeSrc); // Objective 45: no-op needs a matching digest marker

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(path.join(targetDir, 'bin', 'canary.txt')), 'no-op must leave the canary alone');
  });

  test('7 — equal versions + missing sentinel: repairs (self-heal), aof-tools.cjs present', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    setPluginVersion(pluginRoot, '2.10.1');
    seedMirror(targetDir, versionFile, '2.10.1', { sentinel: false });

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(path.join(targetDir, 'bin', 'aof-tools.cjs')), 'sentinel missing at equal version must self-heal');
  });

  test('8 — garbage mirror version always re-mirrors', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    setPluginVersion(pluginRoot, '2.10.1');
    seedMirror(targetDir, versionFile, 'garbage');

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), '2.10.1');
  });

  test('9 — empty mirror version file always re-mirrors', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    setPluginVersion(pluginRoot, '2.10.1');
    seedMirror(targetDir, versionFile, '');

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), '2.10.1');
  });

  test('10 — no mirror version file at all always re-mirrors', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    setPluginVersion(pluginRoot, '2.10.1');
    seedMirror(targetDir, versionFile, null);

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), '2.10.1');
  });

  test('11 — unparseable plugin version ("unknown") never overwrites a parseable mirror', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    setPluginVersion(pluginRoot, 'unknown');
    seedMirror(targetDir, versionFile, '2.10.1');
    const before = snapshot(targetDir);

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(snapshot(targetDir), before);
  });

  test('12 — plugin.json with no version field never overwrites a parseable mirror', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    setPluginVersion(pluginRoot, undefined);
    seedMirror(targetDir, versionFile, '2.10.1');
    const before = snapshot(targetDir);

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(snapshot(targetDir), before);
  });

  test('13 — unparseable plugin version still mirrors onto a fresh install (no version to protect)', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    setPluginVersion(pluginRoot, 'banana');
    // No seedMirror call — targetDir does not exist yet, so the mirror version is missing.

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(path.join(targetDir, 'bin', 'aof-tools.cjs')), 'fresh install must still mirror even with an unparseable plugin version');
    assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), 'banana');
  });

  test('14 — release beats prerelease: plugin 2.10.1 over mirror 2.10.1-rc.1 mirrors', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    setPluginVersion(pluginRoot, '2.10.1');
    seedMirror(targetDir, versionFile, '2.10.1-rc.1');

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), '2.10.1');
  });

  test('15 — prerelease loses to release: plugin 2.10.1-rc.1 over mirror 2.10.1 is a no-op', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    setPluginVersion(pluginRoot, '2.10.1-rc.1');
    seedMirror(targetDir, versionFile, '2.10.1');
    const before = snapshot(targetDir);

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(snapshot(targetDir), before);
  });

  test('16 — leading v and +build metadata are ignored: v2.10.1 vs 2.10.1+build.5 is equal, no-op, canary kept', (t) => {
    const { root, pluginRoot, aoforgeSrc, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    setPluginVersion(pluginRoot, 'v2.10.1');
    seedMirror(targetDir, versionFile, '2.10.1+build.5');
    seedDigest(targetDir, aoforgeSrc); // Objective 45: no-op needs a matching digest marker

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(path.join(targetDir, 'bin', 'canary.txt')), 'equal-after-normalization must be a no-op');
  });
});

// ---------------------------------------------------------------------------
// TRD 36-06: after a successful mirror, sync-runtime runs the BUNDLED global upgrade.
// Fake plugin root + fake HOME only (runHook sets HOME); the real ~/.claude is never touched.
// ---------------------------------------------------------------------------

describe('TRD 36-06: sync-runtime runs the bundled global upgrade', () => {
  const { makeFakeHome } = require('../aoforge/bin/lib/__fixtures__/upgrade-fixtures.cjs');
  const REAL_LIB = path.join(__dirname, '..', 'aoforge', 'bin', 'lib');
  const REAL_TEMPLATE = path.join(__dirname, '..', 'aoforge', 'templates', 'global-claude-md.md');
  // v=3 as of TRD 53-05 (v=2 was TRD 37-10, /aoforge:adopt; v=3 adds /aoforge:doctor).
  const START = '<!-- AOFORGE:START v=3 src=global-claude-md -->';
  // An explicit empty value, so an ambient AOFORGE_SKIP_GLOBAL_UPGRADE cannot mask these cases.
  const RUN = { AOFORGE_SKIP_GLOBAL_UPGRADE: '' };

  function setup(t) {
    const tmp = makeTmpRoot();
    const home = makeFakeHome({ legacy: true });
    t.after(() => {
      fs.rmSync(tmp.root, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    });
    for (const f of ['global-upgrade.cjs', 'managed-block.cjs', 'notices.cjs']) {
      fs.copyFileSync(path.join(REAL_LIB, f), path.join(tmp.aoforgeSrc, 'bin', 'lib', f));
    }
    fs.copyFileSync(REAL_TEMPLATE, path.join(tmp.aoforgeSrc, 'templates', 'global-claude-md.md'));
    const targetDir = path.join(home, '.claude', 'aoforge');
    return { ...tmp, home, targetDir, versionFile: path.join(targetDir, '.plugin-version') };
  }

  function legacyInPlace(home) {
    const c = path.join(home, '.claude');
    return ['skills/df-plan/SKILL.md', 'agents/df-planner.md', 'aoforge/VERSION']
      .every(rel => fs.existsSync(path.join(c, rel)));
  }

  test('15 — after a good mirror, legacy files move to backups and CLAUDE.md gets the block', (t) => {
    const { pluginRoot, home, targetDir, versionFile } = setup(t);

    const result = runHook(pluginRoot, home, RUN);
    assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);

    assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), TEST_VERSION);
    assert.ok(fs.existsSync(path.join(targetDir, 'bin', 'aof-tools.cjs')), 'mirror not done');

    const backups = path.join(targetDir, 'backups');
    const legacyDirs = fs.existsSync(backups)
      ? fs.readdirSync(backups).filter(d => d.startsWith('legacy-'))
      : [];
    assert.equal(legacyDirs.length, 1, `expected one legacy-* backup, got ${legacyDirs.join(', ')}: ${result.stderr}`);
    const b = path.join(backups, legacyDirs[0]);
    assert.ok(fs.existsSync(path.join(b, 'skills', 'df-plan', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(b, 'agents', 'df-planner.md')));
    assert.ok(fs.existsSync(path.join(b, 'aoforge', 'VERSION')));
    assert.equal(fs.existsSync(path.join(home, '.claude', 'skills', 'df-plan')), false);
    assert.ok(fs.existsSync(path.join(home, '.claude', 'skills', 'keep-me', 'SKILL.md')), 'non-df sibling moved');

    const md = fs.readFileSync(path.join(home, '.claude', 'CLAUDE.md'), 'utf8');
    assert.ok(md.includes(START), 'CLAUDE.md lacks the managed block');
  });

  test('16 — AOFORGE_SKIP_GLOBAL_UPGRADE=1 mirrors but leaves the global state alone', (t) => {
    const { pluginRoot, home, targetDir, versionFile } = setup(t);

    const result = runHook(pluginRoot, home, { AOFORGE_SKIP_GLOBAL_UPGRADE: '1' });
    assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);

    assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), TEST_VERSION);
    assert.ok(fs.existsSync(path.join(targetDir, 'bin', 'aof-tools.cjs')), 'mirror not done');
    assert.ok(legacyInPlace(home), 'legacy files moved despite the skip flag');
    assert.equal(fs.existsSync(path.join(home, '.claude', 'CLAUDE.md')), false);
  });

  test('17 — a global-upgrade module that throws on require never undoes a good mirror', (t) => {
    const { pluginRoot, aoforgeSrc, home, targetDir, versionFile } = setup(t);
    fs.writeFileSync(
      path.join(aoforgeSrc, 'bin', 'lib', 'global-upgrade.cjs'),
      "throw new Error('boom on require');\n"
    );

    const result = runHook(pluginRoot, home, RUN);
    assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
    assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), TEST_VERSION);
    assert.ok(fs.existsSync(path.join(targetDir, 'bin', 'aof-tools.cjs')), 'mirror not done');
    assert.match(result.stderr, /global upgrade skipped: boom on require/);
    assert.doesNotMatch(result.stderr, /sync-runtime failed/);
  });

  test('18 — the version-match fast path does not run the global upgrade', (t) => {
    const { pluginRoot, aoforgeSrc, home, targetDir, versionFile } = setup(t);
    fs.mkdirSync(path.join(targetDir, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'bin', 'aof-tools.cjs'), '// already synced');
    fs.writeFileSync(versionFile, TEST_VERSION);
    seedDigest(targetDir, aoforgeSrc); // Objective 45: the fast path needs a matching digest marker

    const result = runHook(pluginRoot, home, RUN);
    assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
    assert.ok(legacyInPlace(home), 'global upgrade ran on the fast path');
    assert.equal(fs.existsSync(path.join(home, '.claude', 'CLAUDE.md')), false);
  });

  test('Quick 21 case 17 — downgrade refusal inside the 36-06 fixture: legacy files stay in place, global upgrade does not run', (t) => {
    const { pluginRoot, home, targetDir, versionFile } = setup(t);
    setPluginVersion(pluginRoot, '2.7.1');
    fs.mkdirSync(path.join(targetDir, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'bin', 'aof-tools.cjs'), '// already synced');
    fs.writeFileSync(versionFile, '2.10.1');

    const result = runHook(pluginRoot, home, RUN);
    assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);

    assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), '2.10.1', 'downgrade refusal must not touch .plugin-version');
    assert.ok(legacyInPlace(home), 'global upgrade ran despite the downgrade refusal');
    assert.equal(fs.existsSync(path.join(home, '.claude', 'CLAUDE.md')), false, 'CLAUDE.md must not gain the managed block on a refused downgrade');
  });
});

// ---------------------------------------------------------------------------
// Objective 45 (TRD 45-03, DOC-03): content digest marker
//
// `.plugin-version` cannot tell a same-version content change from a no-op, so a rebuilt plugin
// (routine on a dev branch, and after an in-place update of an unreleased build) never reached
// the mirror. The hook now also writes `.plugin-digest` — digestTree() of the bundled runtime —
// and the equal-version fast path exits only when that marker matches. Downgrade refusal
// (Quick 21) is untouched: an older plugin never re-mirrors, whatever the digest says.
// Fixtures use a tmp plugin root and a tmp HOME only.
// ---------------------------------------------------------------------------

describe('Objective 45: content digest marker', () => {
  const DIGEST_FILE = runtimeDigest.DIGEST_FILE;
  const digestPath = (targetDir) => path.join(targetDir, DIGEST_FILE);

  test('8 — fresh install writes .plugin-digest = digestTree(bundle); .plugin-version stays the bare version', (t) => {
    const { root, pluginRoot, aoforgeSrc, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);

    assert.equal(fs.readFileSync(versionFile, 'utf8'), TEST_VERSION, '.plugin-version must hold the bare version string');
    assert.ok(fs.existsSync(digestPath(targetDir)), '.plugin-digest not written');
    const expected = runtimeDigest.digestTree(aoforgeSrc);
    assert.match(expected, /^sha256:[0-9a-f]{64}$/);
    assert.equal(fs.readFileSync(digestPath(targetDir), 'utf8').trim(), expected);
    assert.equal(runtimeDigest.readMarkerDigest(targetDir), expected);
  });

  test('8b — the marker digest equals a digest of what actually landed in the mirror', (t) => {
    const { root, pluginRoot, home, targetDir } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
    // The exclusions were dropped during the copy; digesting the mirror must still agree.
    assert.equal(runtimeDigest.digestTree(targetDir), runtimeDigest.readMarkerDigest(targetDir));
  });

  test('9 — equal version + intact sentinel + matching digest: no-op, canary kept, no stderr', (t) => {
    const { root, pluginRoot, aoforgeSrc, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    seedMirror(targetDir, versionFile, TEST_VERSION);
    seedDigest(targetDir, aoforgeSrc);
    const before = snapshot(targetDir);

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
    assert.deepEqual(snapshot(targetDir), before, 'a matching digest must leave the mirror byte-identical');
    assert.equal(result.stderr, '');
  });

  test('10 — equal version + intact sentinel + bundled file changed: re-mirrors; canary gone; digest updated', (t) => {
    const { root, pluginRoot, aoforgeSrc, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    seedMirror(targetDir, versionFile, TEST_VERSION);
    seedDigest(targetDir, aoforgeSrc);
    const staleDigest = runtimeDigest.readMarkerDigest(targetDir);

    // Same version, different content — the case the version compare alone could never see.
    fs.writeFileSync(path.join(aoforgeSrc, 'workflows', 'wf.md'), '# workflow CHANGED');

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);

    assert.equal(
      fs.readFileSync(path.join(targetDir, 'workflows', 'wf.md'), 'utf8'),
      '# workflow CHANGED',
      'changed bundled content did not reach the mirror'
    );
    assert.ok(!fs.existsSync(path.join(targetDir, 'bin', 'canary.txt')), 'canary should be gone after a real re-mirror');

    const fresh = runtimeDigest.digestTree(aoforgeSrc);
    assert.notEqual(fresh, staleDigest);
    assert.equal(runtimeDigest.readMarkerDigest(targetDir), fresh, 'digest marker not updated');
    assert.equal(fs.readFileSync(versionFile, 'utf8'), TEST_VERSION);
    assert.match(result.stderr, /same version .*content changed; re-mirroring/);
  });

  test('11 — equal version + sentinel + no .plugin-digest (pre-45 mirror): re-mirrors once, then a second run is a no-op', (t) => {
    const { root, pluginRoot, aoforgeSrc, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    seedMirror(targetDir, versionFile, TEST_VERSION);
    assert.equal(fs.existsSync(digestPath(targetDir)), false, 'precondition: no digest marker');

    const first = runHook(pluginRoot, home);
    assert.equal(first.status, 0, `hook exited non-zero: ${first.stderr}`);
    assert.ok(!fs.existsSync(path.join(targetDir, 'bin', 'canary.txt')), 'a pre-45 mirror must re-mirror once');
    assert.equal(runtimeDigest.readMarkerDigest(targetDir), runtimeDigest.digestTree(aoforgeSrc));

    // Second run: put the canary back; a no-op leaves it alone.
    fs.writeFileSync(path.join(targetDir, 'bin', 'canary.txt'), 'canary-content');
    const before = snapshot(targetDir);
    const second = runHook(pluginRoot, home);
    assert.equal(second.status, 0, `hook exited non-zero: ${second.stderr}`);
    assert.deepEqual(snapshot(targetDir), before, 'second run must be a no-op');
    assert.equal(second.stderr, '');
  });

  test('12 — older plugin + different digest: still refused (stderr names both versions), target untouched', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    setPluginVersion(pluginRoot, '2.7.1');
    seedMirror(targetDir, versionFile, '2.10.1');
    fs.writeFileSync(digestPath(targetDir), 'sha256:' + '0'.repeat(64)); // differs from the bundle's
    const before = snapshot(targetDir);

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(snapshot(targetDir), before, 'downgrade refusal must not depend on the digest');
    assert.match(result.stderr, /2\.7\.1/);
    assert.match(result.stderr, /2\.10\.1/);
    assert.match(result.stderr, /not downgrading/);
  });

  test('12b — a newer plugin still mirrors and writes the digest marker', (t) => {
    const { root, pluginRoot, aoforgeSrc, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    setPluginVersion(pluginRoot, '2.10.1');
    seedMirror(targetDir, versionFile, '2.7.1');

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(versionFile, 'utf8'), '2.10.1');
    assert.equal(runtimeDigest.readMarkerDigest(targetDir), runtimeDigest.digestTree(aoforgeSrc));
  });

  test('12c — .plugin-digest is written only after a good mirror: a failed run leaves the old marker', (t) => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) return; // root ignores chmod

    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => {
      try { fs.chmodSync(targetDir, 0o755); } catch {}
      fs.rmSync(root, { recursive: true, force: true });
    });

    setPluginVersion(pluginRoot, '2.10.1');
    seedMirror(targetDir, versionFile, '2.7.1');
    const oldDigest = 'sha256:' + '1'.repeat(64);
    fs.writeFileSync(digestPath(targetDir), oldDigest);

    // A read-only target dir makes the first temp-dir copy fail, i.e. the mirror errors out
    // before any swap. Neither marker may move.
    fs.chmodSync(targetDir, 0o555);
    const result = runHook(pluginRoot, home);
    fs.chmodSync(targetDir, 0o755);

    assert.equal(result.status, 0, 'a failed mirror still exits 0 (retry next session)');
    assert.match(result.stderr, /sync-runtime failed/);
    assert.equal(fs.readFileSync(versionFile, 'utf8'), '2.7.1', '.plugin-version moved despite a failed mirror');
    assert.equal(runtimeDigest.readMarkerDigest(targetDir), oldDigest, '.plugin-digest moved despite a failed mirror');
  });

  test('14 — fail-safe: when runtime-digest.cjs cannot be loaded the hook keeps today\'s version-only behavior', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    // A copy of the hook in a tree that has NO aoforge/bin/lib/runtime-digest.cjs beside it.
    const stubHooks = path.join(root, 'stub-plugin', 'hooks');
    fs.mkdirSync(stubHooks, { recursive: true });
    const stubHook = path.join(stubHooks, 'sync-runtime.js');
    fs.copyFileSync(HOOK_PATH, stubHook);
    const run = () => spawnSync(process.execPath, [stubHook], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot, HOME: home },
    });

    // Fresh install still mirrors, and writes no digest marker (there is nothing to digest with).
    const first = run();
    assert.equal(first.status, 0, `hook exited non-zero: ${first.stderr}`);
    assert.ok(fs.existsSync(path.join(targetDir, 'bin', 'aof-tools.cjs')), 'fresh install must still mirror');
    assert.equal(fs.readFileSync(versionFile, 'utf8'), TEST_VERSION);
    assert.equal(fs.existsSync(digestPath(targetDir)), false, 'no digest module => no digest marker');
    assert.doesNotMatch(first.stderr, /sync-runtime failed/);

    // Equal version + intact sentinel + no marker: version-only behavior means no-op.
    fs.writeFileSync(path.join(targetDir, 'bin', 'canary.txt'), 'canary-content');
    const second = run();
    assert.equal(second.status, 0, `hook exited non-zero: ${second.stderr}`);
    assert.ok(fs.existsSync(path.join(targetDir, 'bin', 'canary.txt')), 'version-only fallback must no-op at equal version');
  });

  test('15 — the hook takes SUBDIRS from runtime-digest.cjs; its fallback literal cannot drift from it', () => {
    const hookSrc = fs.readFileSync(HOOK_PATH, 'utf8');
    assert.match(hookSrc, /runtime-digest\.cjs/, 'hook does not load the shared digest module');
    const m = hookSrc.match(/const FALLBACK_SUBDIRS = \[([^\]]*)\]/);
    assert.ok(m, 'could not locate FALLBACK_SUBDIRS in sync-runtime.js');
    const fallback = m[1].split(',')
      .map(x => x.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    assert.deepStrictEqual(fallback, runtimeDigest.SUBDIRS);
  });
});
