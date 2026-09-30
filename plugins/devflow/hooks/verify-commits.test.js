/**
 * Tests for verify-commits.js SubagentStop hook (TRD 10-06).
 *
 * Covers:
 *   - Subprocess integration (spawnSync, cwd = fixture project, stdin = payload)
 *     Test 1: autonomous + mid-execution + no recent commits + no marker → block JSON + marker created
 *     Test 2: same agent_id + marker exists → no block (retry already used)
 *     Test 3: different agent_id, no marker for it → blocks independently
 *     Test 4: mode yolo + no commits + mid-execution → stderr warning only, no stdout JSON
 *     Test 5: autonomous + recent commits exist → no block, no warning
 *     Test 6: autonomous + STATE.md not mid-execution → no block
 *     Test 7: non-DevFlow dir → silent no-op
 *     Test 8: payload missing agent_id → falls back to 'unknown' key, still bounded once
 *     Test 9: git unavailable / not a repo in fixture → silent no-op
 *   - Helpers (in-process)
 *     Test 10: retryMarkerPath sanitizes agentId (path traversal chars stripped)
 *     Test 11: cleanStaleMarkers removes markers older than 1 hour, keeps fresh ones
 *     Test 12: isAutonomousMode / isMidExecution behave correctly
 *
 * Objective 45, TRD 45-10 (SC1): the per-agent retry marker no longer lives under
 * <project>/.planning/. It lives in the hook-marker store
 * (bin/lib/hook-marker-store.cjs): $DEVFLOW_HOOK_MARKER_DIR, else
 * ~/.claude/devflow/state/hook-markers/<repo-key>/. Every spawned hook here gets
 * DEVFLOW_HOOK_MARKER_DIR pointing at a temp dir, so nothing touches ~/.claude.
 *   Test 1 / 2 / 3 / 8 seed and assert the marker through the store.
 *   Test 5: the first stop blocks, creates the store marker, and .planning/ gains no file
 *   Test 6: the second stop for the same agent is allowed
 *   Test 7: a stale store marker is swept; an in-tree leftover is never consulted
 */

'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'verify-commits.js');
const store = require('../devflow/bin/lib/hook-marker-store.cjs');

// ─── Import exported helpers (will fail until verify-commits.js exports them) ─
const {
  findPlanningDir,
  hasRecentCommits,
  isMidExecution,
  isAutonomousMode,
  retryMarkerPath,
  cleanStaleMarkers,
} = require('./verify-commits.js');

// ─── Fixture helpers ──────────────────────────────────────────────────────────

/**
 * Create a tmp DevFlow project fixture.
 *
 * @param {object} opts
 * @param {string} [opts.mode]              config.json mode ('autonomous'|'yolo')
 * @param {boolean} [opts.midExecution]     include 'Executing' in STATE.md
 * @param {boolean} [opts.initGit]          git init the fixture
 * @param {boolean} [opts.recentCommit]     add a commit dated "now" (requires initGit)
 * @param {boolean} [opts.staleCommit]      add a commit dated 20 min ago (no recent commits effect)
 */
function makeFixture(opts = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-test-'));
  const planningDir = path.join(tmp, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });

  // Write config.json
  const mode = opts.mode || 'autonomous';
  fs.writeFileSync(
    path.join(planningDir, 'config.json'),
    JSON.stringify({ mode }),
    'utf8',
  );

  // Write STATE.md
  const stateContent = opts.midExecution
    ? '# State\n\nStatus: Executing objective 10\n'
    : '# State\n\nStatus: Idle\n';
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), stateContent, 'utf8');

  // Optionally set up git
  if (opts.initGit) {
    execSync('git init -q', { cwd: tmp });
    execSync('git config user.email "test@test.com"', { cwd: tmp });
    execSync('git config user.name "Test"', { cwd: tmp });

    if (opts.recentCommit) {
      fs.writeFileSync(path.join(tmp, 'test.txt'), 'hello', 'utf8');
      execSync('git add test.txt', { cwd: tmp });
      execSync('git commit -m "recent commit"', { cwd: tmp });
    } else if (opts.staleCommit) {
      // Commit dated 20 minutes ago — outside the 10-minute window
      const oldDate = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      fs.writeFileSync(path.join(tmp, 'test.txt'), 'hello', 'utf8');
      execSync('git add test.txt', { cwd: tmp });
      execSync('git commit -m "old commit"', {
        cwd: tmp,
        env: { ...process.env, GIT_AUTHOR_DATE: oldDate, GIT_COMMITTER_DATE: oldDate },
      });
    }
  }

  return tmp;
}

/**
 * The marker root for a fixture: a sibling temp dir, so it is never inside the
 * fixture project. Created on demand by the hook (or by a seeding test).
 */
function markerRootOf(tmp) {
  return `${tmp}-markers`;
}

/** The env the hook (and the in-process helpers) resolve the store from. */
function markerEnv(tmp) {
  return { DEVFLOW_HOOK_MARKER_DIR: markerRootOf(tmp) };
}

/** Where the store puts <name> for the fixture project. */
function markerFileFor(tmp, name) {
  return store.markerFile(tmp, name, { env: markerEnv(tmp) });
}

/** Seed <name> in the store, creating its directory. Returns the file path. */
function seedMarker(tmp, name, ageMs = 0) {
  const file = markerFileFor(tmp, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, String(Date.now()), 'utf8');
  if (ageMs) {
    const t = new Date(Date.now() - ageMs);
    fs.utimesSync(file, t, t);
  }
  return file;
}

/** Dotfiles directly inside <tmp>/.planning (the SC1 concern). */
function planningDotfiles(tmp) {
  return fs.readdirSync(path.join(tmp, '.planning')).filter((f) => f.startsWith('.')).sort();
}

/**
 * Run the hook subprocess with given fixture dir and payload.
 */
function runHook(cwd, payload = {}) {
  return spawnSync(process.execPath, [HOOK_PATH], {
    cwd,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, ...markerEnv(cwd) },
  });
}

function cleanup(tmp) {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(markerRootOf(tmp), { recursive: true, force: true }); } catch {}
}

// ─── Subprocess integration tests ─────────────────────────────────────────────

describe('verify-commits subprocess — SubagentStop retry-once', () => {
  test('Test 1: autonomous + mid-execution + no recent commits + no marker → block JSON + marker created', () => {
    const tmp = makeFixture({ mode: 'autonomous', midExecution: true, initGit: true });
    try {
      const payload = { agent_id: 'agent-abc-1' };
      const result = runHook(tmp, payload);

      assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
      assert.ok(result.stdout.trim().length > 0, 'expected stdout JSON for block');

      let parsed;
      assert.doesNotThrow(() => { parsed = JSON.parse(result.stdout); }, 'stdout must be valid JSON');
      assert.ok(parsed.hookSpecificOutput, 'must have hookSpecificOutput wrapper');
      assert.equal(parsed.hookSpecificOutput.hookEventName, 'SubagentStop');
      assert.equal(parsed.hookSpecificOutput.decision, 'block');
      assert.match(parsed.hookSpecificOutput.reason, /no commits/i);

      // Marker file must be created — in the store, not under .planning/
      const marker = markerFileFor(tmp, 'autonomous-retry-agent-abc-1');
      assert.ok(fs.existsSync(marker), 'retry marker file must be created in the store');
      assert.deepEqual(planningDotfiles(tmp), [], '.planning/ must gain no dotfile');
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 2: same agent_id + marker exists → no block JSON (retry already used)', () => {
    const tmp = makeFixture({ mode: 'autonomous', midExecution: true, initGit: true });
    try {
      const payload = { agent_id: 'agent-abc-2' };

      // Pre-create the marker in the store (simulating first retry already consumed)
      seedMarker(tmp, 'autonomous-retry-agent-abc-2');

      const result = runHook(tmp, payload);
      assert.equal(result.status, 0);
      // No block JSON on second invocation for same agent
      assert.equal(result.stdout.trim(), '', 'second stop must not produce block JSON');
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 3: different agent_id, no marker for it → blocks independently', () => {
    const tmp = makeFixture({ mode: 'autonomous', midExecution: true, initGit: true });
    try {
      // Marker exists for agent-X but NOT for agent-Y
      seedMarker(tmp, 'autonomous-retry-agent-X');

      const payload = { agent_id: 'agent-Y' };
      const result = runHook(tmp, payload);
      assert.equal(result.status, 0);
      assert.ok(result.stdout.trim().length > 0, 'agent-Y should still be blocked (no marker for it)');

      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.hookSpecificOutput.decision, 'block');

      // Marker for agent-Y should now exist
      assert.ok(fs.existsSync(markerFileFor(tmp, 'autonomous-retry-agent-Y')));
      assert.deepEqual(planningDotfiles(tmp), [], '.planning/ must gain no dotfile');
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 4: mode yolo + no commits + mid-execution → stderr warning only, no stdout JSON', () => {
    const tmp = makeFixture({ mode: 'yolo', midExecution: true, initGit: true });
    try {
      const result = runHook(tmp, { agent_id: 'agent-yolo' });
      assert.equal(result.status, 0);
      // No block JSON
      assert.equal(result.stdout.trim(), '', 'yolo mode must not produce stdout JSON');
      // Should have warning on stderr
      assert.match(result.stderr, /no git commits/i, 'yolo mode must produce stderr warning');
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 5: autonomous + recent commits exist → no block, no warning', () => {
    const tmp = makeFixture({ mode: 'autonomous', midExecution: true, initGit: true, recentCommit: true });
    try {
      const result = runHook(tmp, { agent_id: 'agent-happy' });
      assert.equal(result.status, 0);
      assert.equal(result.stdout.trim(), '', 'no block when recent commits exist');
      assert.equal(result.stderr.trim(), '', 'no warning when recent commits exist');
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 6: autonomous + STATE.md not mid-execution → no block', () => {
    const tmp = makeFixture({ mode: 'autonomous', midExecution: false, initGit: true });
    try {
      const result = runHook(tmp, { agent_id: 'agent-idle' });
      assert.equal(result.status, 0);
      assert.equal(result.stdout.trim(), '', 'no block when not mid-execution');
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 7: non-DevFlow dir → silent no-op', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-nodf-'));
    try {
      const result = runHook(tmp, { agent_id: 'agent-nobody' });
      assert.equal(result.status, 0);
      assert.equal(result.stdout.trim(), '', 'must be silent outside DevFlow project');
      assert.equal(result.stderr.trim(), '', 'no stderr outside DevFlow project');
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 8: payload missing agent_id → falls back to "unknown" key, still bounded once', () => {
    const tmp = makeFixture({ mode: 'autonomous', midExecution: true, initGit: true });
    try {
      // First call without agent_id → should block and create autonomous-retry-unknown
      const result = runHook(tmp, {});
      assert.equal(result.status, 0);
      assert.ok(result.stdout.trim().length > 0, 'should block on first call without agent_id');

      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.hookSpecificOutput.decision, 'block');

      const unknownMarker = markerFileFor(tmp, 'autonomous-retry-unknown');
      assert.ok(fs.existsSync(unknownMarker), 'autonomous-retry-unknown marker must be created in the store');

      // Second call → no block (marker already consumed)
      const result2 = runHook(tmp, {});
      assert.equal(result2.stdout.trim(), '', 'second call with unknown agent must not block');
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 9: git unavailable / not a repo in fixture → silent no-op', () => {
    // Create a fixture with .planning but NO git repo
    const tmp = makeFixture({ mode: 'autonomous', midExecution: true, initGit: false });
    try {
      const result = runHook(tmp, { agent_id: 'agent-nogit' });
      assert.equal(result.status, 0, `hook must exit 0: ${result.stderr}`);
      // The git call will fail → silent catch → no stdout block, no crash
      assert.equal(result.stdout.trim(), '', 'must be silent when git fails');
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 6b (TRD 45-10 #6): the second SubagentStop for the same agent is allowed', () => {
    const tmp = makeFixture({ mode: 'autonomous', midExecution: true, initGit: true });
    try {
      const first = runHook(tmp, { agent_id: 'agent-twice' });
      assert.equal(first.status, 0, first.stderr);
      assert.equal(JSON.parse(first.stdout).hookSpecificOutput.decision, 'block', 'first stop blocks');

      const second = runHook(tmp, { agent_id: 'agent-twice' });
      assert.equal(second.status, 0, second.stderr);
      assert.equal(second.stdout.trim(), '', 'second stop for the same agent must be allowed');
      assert.deepEqual(planningDotfiles(tmp), [], '.planning/ must gain no dotfile');
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 7 (TRD 45-10 #7): a stale store marker is swept; an in-tree leftover is never consulted', () => {
    const tmp = makeFixture({ mode: 'autonomous', midExecution: true, initGit: true });
    try {
      const planningDir = path.join(tmp, '.planning');

      // A stale marker (2h old) for another agent, in the store: the hook sweeps it.
      const stale = seedMarker(tmp, 'autonomous-retry-agent-old', 2 * 60 * 60 * 1000);

      // A leftover from an older DevFlow, in the tree: neither read nor written nor removed.
      const leftover = path.join(planningDir, '.autonomous-retry-agent-left');
      fs.writeFileSync(leftover, 'legacy', 'utf8');
      const oldTime = new Date(Date.now() - 3 * 60 * 60 * 1000);
      fs.utimesSync(leftover, oldTime, oldTime);
      const leftoverMtime = fs.statSync(leftover).mtimeMs;

      const result = runHook(tmp, { agent_id: 'agent-left' });

      assert.equal(result.status, 0, result.stderr);
      // Never consulted: agent-left has no STORE marker, so it is still blocked once.
      assert.equal(
        JSON.parse(result.stdout).hookSpecificOutput.decision,
        'block',
        'an in-tree marker must not count as the retry having been used'
      );
      assert.equal(fs.existsSync(stale), false, 'stale store marker is removed');
      assert.ok(fs.existsSync(markerFileFor(tmp, 'autonomous-retry-agent-left')), 'a store marker is written');
      assert.equal(fs.readFileSync(leftover, 'utf8'), 'legacy', 'in-tree leftover is not rewritten');
      assert.equal(fs.statSync(leftover).mtimeMs, leftoverMtime, 'in-tree leftover is not touched');
      assert.deepEqual(planningDotfiles(tmp), ['.autonomous-retry-agent-left'], 'nothing else appears in .planning/');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Helper unit tests (in-process) ──────────────────────────────────────────

describe('verify-commits helpers — in-process', () => {
  test('Test 10: retryMarkerPath sanitizes agentId (path traversal chars stripped)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-san-'));
    try {
      const planningDir = path.join(tmp, '.planning');
      // Path traversal attempt
      const p = retryMarkerPath(planningDir, '../../../etc/passwd', markerEnv(tmp));
      const base = path.basename(p);
      // Must sit directly in the store dir for this project (no traversal, not in-tree)
      assert.equal(path.dirname(p), store.markerDir(tmp, { env: markerEnv(tmp) }));
      assert.ok(!p.startsWith(tmp + path.sep), `marker must not be inside the project, got: ${p}`);
      // Only [A-Za-z0-9_-] survives
      assert.match(base, /^[A-Za-z0-9_-]+$/, 'sanitized name must be a bare, dot-free file name');
      assert.match(base, /^autonomous-retry-/, 'must start with autonomous-retry-');
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 11: cleanStaleMarkers removes markers older than 1 hour, keeps fresh ones', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-stale-'));
    try {
      const planningDir = path.join(tmp, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      // Stale marker (just over 1 hour old) and fresh marker (5 minutes old), in the store
      const staleMarker = seedMarker(tmp, 'autonomous-retry-stale-agent', 61 * 60 * 1000);
      const freshMarker = seedMarker(tmp, 'autonomous-retry-fresh-agent', 5 * 60 * 1000);

      cleanStaleMarkers(planningDir, markerEnv(tmp));

      assert.equal(fs.existsSync(staleMarker), false, 'stale marker (>1 hr) must be removed');
      assert.equal(fs.existsSync(freshMarker), true, 'fresh marker must be preserved');
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 12a: isAutonomousMode returns true for mode:autonomous config', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-isauto-'));
    try {
      fs.writeFileSync(
        path.join(tmp, 'config.json'),
        JSON.stringify({ mode: 'autonomous' }),
        'utf8',
      );
      assert.equal(isAutonomousMode(tmp), true);
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 12b: isAutonomousMode returns false for mode:yolo config', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-isauto-'));
    try {
      fs.writeFileSync(
        path.join(tmp, 'config.json'),
        JSON.stringify({ mode: 'yolo' }),
        'utf8',
      );
      assert.equal(isAutonomousMode(tmp), false);
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 12c: isMidExecution returns true when STATE.md contains Executing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-ismid-'));
    try {
      fs.writeFileSync(
        path.join(tmp, 'STATE.md'),
        '# State\n\nStatus: Executing objective 10\n',
        'utf8',
      );
      assert.equal(isMidExecution(tmp), true);
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 12d: isMidExecution returns true when STATE.md contains In progress', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-ismid-'));
    try {
      fs.writeFileSync(
        path.join(tmp, 'STATE.md'),
        '# State\n\nStatus: In progress\n',
        'utf8',
      );
      assert.equal(isMidExecution(tmp), true);
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 12e: isMidExecution returns false when STATE.md is Idle', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-ismid-'));
    try {
      fs.writeFileSync(
        path.join(tmp, 'STATE.md'),
        '# State\n\nStatus: Idle\n',
        'utf8',
      );
      assert.equal(isMidExecution(tmp), false);
    } finally {
      cleanup(tmp);
    }
  });
});
