/**
 * Tests for verify-completion.js Stop hook (TRD 15-05, TRD 10-05).
 *
 * Covers:
 *   - renderAuditEntry shape: full payload, missing fields, truncation, default ts
 *   - appendAuditLog filesystem behavior: parent dir creation, append, error handling
 *   - auditLogPath: env override, default path
 *   - Subprocess integration: ambient mode write, non-AOForge no-op, SUMMARY scan preserved
 *   - Autonomous resume: block emission, 3-attempt cap, pending decisions bypass, helper functions
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'verify-completion.js');
const {
  renderAuditEntry,
  appendAuditLog,
  auditLogPath,
  isAutonomousMode,
  readResumeCount,
  writeResumeCount,
  clearResumeCount,
  isMidExecution,
} = require('./verify-completion.js');

// ─── renderAuditEntry shape ───────────────────────────────────────────────────

describe('renderAuditEntry shape', () => {
  test('full payload renders all 5 fields', () => {
    const entry = renderAuditEntry({
      ts: '2026-05-04T00:00:00Z',
      session_id: 'abc-123',
      route_recommended: '/aoforge:build',
      skill_invoked: true,
      prompt_summary: 'Build the dashboard',
    });
    const parsed = JSON.parse(entry);
    assert.equal(parsed.ts, '2026-05-04T00:00:00Z');
    assert.equal(parsed.session_id, 'abc-123');
    assert.equal(parsed.route_recommended, '/aoforge:build');
    assert.equal(parsed.skill_invoked, true);
    assert.equal(parsed.prompt_summary, 'Build the dashboard');
  });

  test('missing session_id → "unknown"', () => {
    const entry = renderAuditEntry({ ts: 'x', route_recommended: 'r', skill_invoked: false });
    assert.equal(JSON.parse(entry).session_id, 'unknown');
  });

  test('missing route_recommended → "none"', () => {
    const entry = renderAuditEntry({ ts: 'x', session_id: 's' });
    assert.equal(JSON.parse(entry).route_recommended, 'none');
  });

  test('missing prompt_summary → "unknown"', () => {
    const entry = renderAuditEntry({ ts: 'x', session_id: 's' });
    assert.equal(JSON.parse(entry).prompt_summary, 'unknown');
  });

  test('skill_invoked non-boolean → false', () => {
    const entry = renderAuditEntry({ ts: 'x', session_id: 's', skill_invoked: 'yes' });
    assert.equal(JSON.parse(entry).skill_invoked, false);
  });

  test('prompt_summary truncated to 80 chars', () => {
    const long = 'x'.repeat(200);
    const entry = renderAuditEntry({ ts: 'x', session_id: 's', prompt_summary: long });
    assert.equal(JSON.parse(entry).prompt_summary.length, 80);
  });

  test('omitted ts → ISO 8601 timestamp generated', () => {
    const entry = renderAuditEntry({ session_id: 's' });
    const parsed = JSON.parse(entry);
    assert.match(parsed.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// ─── appendAuditLog filesystem behavior ──────────────────────────────────────

describe('appendAuditLog filesystem behavior', () => {
  let tmpLog;
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-log-'));
    tmpLog = path.join(tmpDir, 'audit.log');
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('creates parent directory if missing', () => {
    const nested = path.join(tmpDir, 'a', 'b', 'c', 'audit.log');
    const result = appendAuditLog('{}', nested);
    assert.equal(result.ok, true);
    assert.equal(fs.existsSync(nested), true);
  });

  test('appends entry as new line', () => {
    appendAuditLog('{"first":1}', tmpLog);
    appendAuditLog('{"second":2}', tmpLog);
    const lines = fs.readFileSync(tmpLog, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).first, 1);
    assert.equal(JSON.parse(lines[1]).second, 2);
  });

  test('returns ok:false on filesystem error (unwritable path)', () => {
    const result = appendAuditLog('{}', '/nonexistent-root-dir/audit.log');
    assert.equal(result.ok, false);
    assert.ok(result.reason, 'reason should be set');
  });
});

// ─── auditLogPath ─────────────────────────────────────────────────────────────

describe('auditLogPath', () => {
  test('returns AOFORGE_AUDIT_LOG_PATH env when set', () => {
    const prev = process.env.AOFORGE_AUDIT_LOG_PATH;
    process.env.AOFORGE_AUDIT_LOG_PATH = '/tmp/custom-audit.log';
    try {
      assert.equal(auditLogPath(), '/tmp/custom-audit.log');
    } finally {
      if (prev === undefined) delete process.env.AOFORGE_AUDIT_LOG_PATH;
      else process.env.AOFORGE_AUDIT_LOG_PATH = prev;
    }
  });

  test('defaults to ~/.claude/aoforge/audit.log when env unset', () => {
    const prev = process.env.AOFORGE_AUDIT_LOG_PATH;
    delete process.env.AOFORGE_AUDIT_LOG_PATH;
    try {
      assert.equal(
        auditLogPath(),
        path.join(os.homedir(), '.claude', 'aoforge', 'audit.log'),
      );
    } finally {
      if (prev !== undefined) process.env.AOFORGE_AUDIT_LOG_PATH = prev;
    }
  });
});

// ─── Subprocess integration ───────────────────────────────────────────────────

describe('subprocess integration — Stop hook in ambient mode', () => {
  test('writes audit log entry with redirected AOFORGE_AUDIT_LOG_PATH', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-comp-e2e-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      fs.mkdirSync(path.join(tmp, '.aoforge', 'objectives'), { recursive: true });
      const payload = JSON.stringify({
        session_id: 'test-session-1',
        prompt: 'Build the dashboard feature',
      });
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: payload,
        encoding: 'utf8',
        env: { ...process.env, AOFORGE_AUDIT_LOG_PATH: logPath },
      });
      assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
      assert.equal(fs.existsSync(logPath), true, 'audit.log should exist');
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      assert.equal(lines.length, 1);
      const parsed = JSON.parse(lines[0]);
      assert.equal(parsed.session_id, 'test-session-1');
      assert.equal(parsed.prompt_summary, 'Build the dashboard feature');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('no-op when not an AOForge project (no .aoforge)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-comp-non-df-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, AOFORGE_AUDIT_LOG_PATH: logPath },
      });
      assert.equal(result.status, 0);
      assert.equal(fs.existsSync(logPath), false, 'audit.log should NOT be written outside AOForge project');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('preserves existing SUMMARY scan warnings', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-comp-summary-'));
    const objDir = path.join(tmp, '.aoforge', 'objectives', '99-test');
    try {
      fs.mkdirSync(objDir, { recursive: true });
      const summaryPath = path.join(objDir, '99-01-SUMMARY.md');
      fs.writeFileSync(summaryPath, '# x\nSelf-Check: FAILED\n', 'utf8');
      // Touch to ensure mtime is recent
      fs.utimesSync(summaryPath, new Date(), new Date());
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, AOFORGE_AUDIT_LOG_PATH: path.join(tmp, 'audit.log') },
      });
      // Existing scan emits warnings via console.error
      assert.match(result.stderr, /Self-Check FAILED/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('stdout is empty (audit logging is observability-only)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-comp-stdout-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      fs.mkdirSync(path.join(tmp, '.aoforge', 'objectives'), { recursive: true });
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, AOFORGE_AUDIT_LOG_PATH: logPath },
      });
      assert.equal(result.stdout, '', 'hook must not write to stdout');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('does not crash when AOFORGE_AUDIT_LOG_PATH is unwritable', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-comp-nowrite-'));
    try {
      fs.mkdirSync(path.join(tmp, '.aoforge', 'objectives'), { recursive: true });
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, AOFORGE_AUDIT_LOG_PATH: '/nonexistent-root-dir/audit.log' },
      });
      assert.equal(result.status, 0, 'hook must exit 0 even when audit log is unwritable');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ─── Autonomous resume — subprocess integration ───────────────────────────────
//
// Objective 45, TRD 45-10 (SC1): the per-objective resume counter no longer lives
// in <project>/.aoforge/.autonomous-resume-<objective>. It lives in the hook marker
// store (bin/lib/hook-marker-store.cjs): $AOFORGE_HOOK_MARKER_DIR, else
// ~/.claude/aoforge/state/hook-markers/<repo-key>/autonomous-resume-<objective>.
// Every spawned hook and every in-process helper call below gets
// AOFORGE_HOOK_MARKER_DIR pointing at a temp dir, so nothing touches ~/.claude.

const store = require('../aoforge/bin/lib/hook-marker-store.cjs');

/** A sibling temp dir, so the marker root is never inside the fixture project. */
function markerRootOf(tmp) {
  return `${tmp}-markers`;
}

function markerEnv(tmp) {
  return { AOFORGE_HOOK_MARKER_DIR: markerRootOf(tmp) };
}

/** Where the store keeps the resume counter for `key` in the fixture project. */
function resumeFileFor(tmp, key) {
  return store.markerFile(tmp, `autonomous-resume-${key}`, { env: markerEnv(tmp) });
}

function seedResumeCount(tmp, key, count) {
  const file = resumeFileFor(tmp, key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, String(count));
  return file;
}

/** Dotfiles directly inside <tmp>/.aoforge (the SC1 concern). */
function planningDotfiles(tmp) {
  return fs.readdirSync(path.join(tmp, '.aoforge')).filter((f) => f.startsWith('.')).sort();
}

function cleanupFixture(tmp) {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(markerRootOf(tmp), { recursive: true, force: true });
}

/**
 * Build a minimal autonomous fixture for subprocess tests.
 *
 * @param {string} tmp - root tmpdir
 * @param {object} opts
 * @param {string} [opts.mode]            - config.json mode field (default: 'autonomous')
 * @param {string|null} [opts.configJson] - raw config JSON string, or null to omit config.json, or 'malformed'
 * @param {boolean} [opts.midExecution]   - whether STATE.md says "Executing" (default: true)
 * @param {string} [opts.objectiveLine]   - objective line content in STATE.md (default: 'Objective: 10')
 * @param {number} [opts.resumeCount]     - pre-existing counter value (default: 0, omit file if undefined)
 * @param {string[]} [opts.pendingIds]    - decision ids to write to .aoforge/decisions/pending/
 * @returns {string} planningDir path
 */
function buildAutonomousFixture(tmp, opts = {}) {
  const mode = opts.mode !== undefined ? opts.mode : 'autonomous';
  const midExecution = opts.midExecution !== false;
  const objectiveLine = opts.objectiveLine !== undefined ? opts.objectiveLine : 'Objective: 10';
  const pendingIds = opts.pendingIds || [];

  const planningDir = path.join(tmp, '.aoforge');
  fs.mkdirSync(path.join(planningDir, 'objectives'), { recursive: true });

  // Write config.json
  if (opts.configJson === null) {
    // omit config.json
  } else if (opts.configJson === 'malformed') {
    fs.writeFileSync(path.join(planningDir, 'config.json'), '{ bad json :::');
  } else if (opts.configJson !== undefined) {
    fs.writeFileSync(path.join(planningDir, 'config.json'), opts.configJson);
  } else {
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ mode }),
    );
  }

  // Write STATE.md
  const statusLine = midExecution ? 'Status: Executing' : 'Status: Idle';
  const stateContent = `# AOForge State\n\n## Current Position\n\n${objectiveLine}\n${statusLine}\n`;
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), stateContent);

  // Write resume counter if specified — into the store, not under .aoforge/
  if (opts.resumeCount !== undefined) {
    const objKey = objectiveLine.match(/Objective:\s*(\w+)/) ? objectiveLine.match(/Objective:\s*(\w+)/)[1] : 'current';
    seedResumeCount(tmp, objKey, opts.resumeCount);
  }

  // Write pending decisions if specified
  if (pendingIds.length > 0) {
    const pendingDir = path.join(planningDir, 'decisions', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });
    for (const id of pendingIds) {
      fs.writeFileSync(path.join(pendingDir, `${id}.md`), `---\nid: ${id}\nstatus: pending\n---\n`);
    }
  }

  return planningDir;
}

describe('autonomous resume — subprocess', () => {
  // Test 1: autonomous + mid-execution + count 0 → block JSON on stdout, counter = 1
  test('autonomous + mid-execution + count 0 → block JSON with attempt 1/3, counter written', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-auto-1-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      const planningDir = buildAutonomousFixture(tmp, { resumeCount: 0 });
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, AOFORGE_AUDIT_LOG_PATH: logPath, ...markerEnv(tmp) },
      });
      assert.equal(result.status, 0, `hook crashed: ${result.stderr}`);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.decision, 'block');
      assert.match(parsed.reason, /resuming \(attempt 1\/3\)/);
      // Counter file should now be 1 — in the store, and .aoforge/ gains no file
      const counterFile = resumeFileFor(tmp, '10');
      assert.equal(fs.readFileSync(counterFile, 'utf8').trim(), '1');
      assert.deepEqual(planningDotfiles(tmp), [], '.aoforge/ must gain no dotfile');
      assert.equal(fs.existsSync(path.join(planningDir, '.autonomous-resume-10')), false);
    } finally {
      cleanupFixture(tmp);
    }
  });

  // Test 2: counter at 3 → NO block, counter deleted
  test('counter at 3 → allow stop, counter file deleted', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-auto-2-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      const planningDir = buildAutonomousFixture(tmp, { resumeCount: 3 });
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, AOFORGE_AUDIT_LOG_PATH: logPath, ...markerEnv(tmp) },
      });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '', 'at cap 3 must not emit block JSON');
      // Counter file should be deleted from the store
      const counterFile = resumeFileFor(tmp, '10');
      assert.equal(fs.existsSync(counterFile), false, 'counter file should be cleared at cap');
      assert.deepEqual(planningDotfiles(tmp), [], '.aoforge/ must gain no dotfile');
    } finally {
      cleanupFixture(tmp);
    }
  });

  // Test 3: mode yolo + mid-execution → no block
  test('mode yolo + mid-execution → no block (warn-only preserved)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-auto-3-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      buildAutonomousFixture(tmp, { mode: 'yolo' });
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, AOFORGE_AUDIT_LOG_PATH: logPath, ...markerEnv(tmp) },
      });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '', 'yolo mode must not emit block JSON');
    } finally {
      cleanupFixture(tmp);
    }
  });

  // Test 4: autonomous + STATE.md NOT mid-execution → no block, counter cleared if present
  test('autonomous + NOT mid-execution → no block, counter cleared', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-auto-4-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      const planningDir = buildAutonomousFixture(tmp, { midExecution: false, resumeCount: 2 });
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, AOFORGE_AUDIT_LOG_PATH: logPath, ...markerEnv(tmp) },
      });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '', 'idle state must not emit block JSON');
      // Counter file should be cleared from the store
      const counterFile = resumeFileFor(tmp, '10');
      assert.equal(fs.existsSync(counterFile), false, 'counter should be cleared when not mid-execution');
      assert.deepEqual(planningDotfiles(tmp), [], '.aoforge/ must gain no dotfile');
    } finally {
      cleanupFixture(tmp);
    }
  });

  // Test 5: autonomous + mid-execution + pending decisions → block emitted, reason lists pending ids
  test('autonomous + mid-execution + pending decisions → block emitted, reason contains pending ids', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-auto-5-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      buildAutonomousFixture(tmp, {
        pendingIds: ['DECISION-001', 'DECISION-002'],
      });
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, AOFORGE_AUDIT_LOG_PATH: logPath, ...markerEnv(tmp) },
      });
      assert.equal(result.status, 0);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.decision, 'block');
      assert.match(parsed.reason, /DECISION-001/);
      assert.match(parsed.reason, /DECISION-002/);
    } finally {
      cleanupFixture(tmp);
    }
  });

  // Test 6: non-AOForge dir (no .aoforge) → no output, exit 0
  test('non-AOForge dir → no output, exit 0', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-auto-6-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      // No .aoforge dir created
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, AOFORGE_AUDIT_LOG_PATH: logPath, ...markerEnv(tmp) },
      });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '');
    } finally {
      cleanupFixture(tmp);
    }
  });

  // Test 7: malformed config.json → treated as non-autonomous, no block, no crash
  test('malformed config.json → treated as non-autonomous, no block, exit 0', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-auto-7-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      buildAutonomousFixture(tmp, { configJson: 'malformed' });
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, AOFORGE_AUDIT_LOG_PATH: logPath, ...markerEnv(tmp) },
      });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '', 'malformed config must not emit block JSON');
    } finally {
      cleanupFixture(tmp);
    }
  });

  // Test 8: existing audit-log behavior still works in autonomous block path (audit + block coexist)
  test('autonomous block path: audit log entry still written alongside block JSON', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-auto-8-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      buildAutonomousFixture(tmp, { resumeCount: 0 });
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: JSON.stringify({ session_id: 'audit-coexist-test' }),
        encoding: 'utf8',
        env: { ...process.env, AOFORGE_AUDIT_LOG_PATH: logPath, ...markerEnv(tmp) },
      });
      assert.equal(result.status, 0);
      // Block JSON on stdout
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.decision, 'block');
      // Audit log also written
      assert.equal(fs.existsSync(logPath), true, 'audit log must exist');
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      const auditEntry = JSON.parse(lines[0]);
      assert.equal(auditEntry.session_id, 'audit-coexist-test');
    } finally {
      cleanupFixture(tmp);
    }
  });
});

describe('autonomous resume — counter lives in the store (TRD 45-10 #8)', () => {
  test('the counter increments 1 → 2 across successive stops, and .aoforge/ gains no file', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-auto-inc-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      buildAutonomousFixture(tmp, {});
      const run = () => spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, AOFORGE_AUDIT_LOG_PATH: logPath, ...markerEnv(tmp) },
      });
      const counter = resumeFileFor(tmp, '10');

      assert.match(JSON.parse(run().stdout).reason, /attempt 1\/3/);
      assert.equal(fs.readFileSync(counter, 'utf8').trim(), '1');
      assert.match(JSON.parse(run().stdout).reason, /attempt 2\/3/);
      assert.equal(fs.readFileSync(counter, 'utf8').trim(), '2');
      assert.deepEqual(planningDotfiles(tmp), [], '.aoforge/ must gain no dotfile');
    } finally {
      cleanupFixture(tmp);
    }
  });

  test('an in-tree legacy counter at the cap is not consulted: the stop is still blocked once', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-auto-legacy-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      const planningDir = buildAutonomousFixture(tmp, {});
      const legacy = path.join(planningDir, '.autonomous-resume-10');
      fs.writeFileSync(legacy, '3');
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, AOFORGE_AUDIT_LOG_PATH: logPath, ...markerEnv(tmp) },
      });
      assert.equal(JSON.parse(result.stdout).decision, 'block');
      assert.equal(fs.readFileSync(legacy, 'utf8'), '3', 'the legacy file is left alone for the doctor');
    } finally {
      cleanupFixture(tmp);
    }
  });
});

// ─── Autonomous resume — pure helpers ────────────────────────────────────────

describe('autonomous resume — helpers', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-helpers-'));
    planningDir = path.join(tmpDir, '.aoforge');
    fs.mkdirSync(planningDir, { recursive: true });
  });

  afterEach(() => {
    try { cleanupFixture(tmpDir); } catch {}
  });

  // Test 9: isAutonomousMode
  test('isAutonomousMode: true only for mode="autonomous"', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ mode: 'autonomous' }));
    assert.equal(isAutonomousMode(planningDir), true);
  });

  test('isAutonomousMode: false for mode="yolo"', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ mode: 'yolo' }));
    assert.equal(isAutonomousMode(planningDir), false);
  });

  test('isAutonomousMode: false when config missing', () => {
    // No config.json written
    assert.equal(isAutonomousMode(planningDir), false);
  });

  test('isAutonomousMode: false when config malformed', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), '{ bad json :::');
    assert.equal(isAutonomousMode(planningDir), false);
  });

  // Test 10: readResumeCount — through the store (TRD 45-10 #9)
  test('readResumeCount: missing file → 0', () => {
    assert.equal(readResumeCount(planningDir, 'test', markerEnv(tmpDir)), 0);
  });

  test('readResumeCount: garbage content → 0', () => {
    seedResumeCount(tmpDir, 'test', 'not-a-number');
    assert.equal(readResumeCount(planningDir, 'test', markerEnv(tmpDir)), 0);
  });

  test('readResumeCount: "2" → 2', () => {
    seedResumeCount(tmpDir, 'test', '2');
    assert.equal(readResumeCount(planningDir, 'test', markerEnv(tmpDir)), 2);
  });

  test('readResumeCount: an in-tree legacy counter is never consulted', () => {
    fs.writeFileSync(path.join(planningDir, '.autonomous-resume-test'), '2');
    assert.equal(readResumeCount(planningDir, 'test', markerEnv(tmpDir)), 0);
  });

  // Test 11: writeResumeCount + clearResumeCount round-trip
  test('writeResumeCount + clearResumeCount round-trip; the file lives in the store and clearing removes it', () => {
    const env = markerEnv(tmpDir);
    writeResumeCount(planningDir, 'rt', 5, env);
    assert.equal(fs.existsSync(resumeFileFor(tmpDir, 'rt')), true, 'counter is written to the store');
    assert.equal(readResumeCount(planningDir, 'rt', env), 5);
    assert.deepEqual(planningDotfiles(tmpDir), [], '.aoforge/ must gain no dotfile');
    clearResumeCount(planningDir, 'rt', env);
    assert.equal(readResumeCount(planningDir, 'rt', env), 0);
    assert.equal(fs.existsSync(resumeFileFor(tmpDir, 'rt')), false, 'clearing removes the store file');
  });

  test('writeResumeCount: a hostile objective key cannot escape the store directory', () => {
    const env = markerEnv(tmpDir);
    writeResumeCount(planningDir, '../../evil', 1, env);
    const dir = store.markerDir(tmpDir, { env });
    const written = fs.readdirSync(dir);
    assert.equal(written.length, 1);
    assert.match(written[0], /^autonomous-resume-[A-Za-z0-9_-]+$/);
    assert.deepEqual(planningDotfiles(tmpDir), []);
  });

  // Test 12: isMidExecution
  test('isMidExecution: "Executing" in STATE.md → true', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Status: Executing\n');
    assert.equal(isMidExecution(planningDir), true);
  });

  test('isMidExecution: "In progress" in STATE.md → true', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Status: In progress\n');
    assert.equal(isMidExecution(planningDir), true);
  });

  test('isMidExecution: neither keyword → false', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Status: Idle\n');
    assert.equal(isMidExecution(planningDir), false);
  });

  test('isMidExecution: missing STATE.md → false', () => {
    // No STATE.md written
    assert.equal(isMidExecution(planningDir), false);
  });

  // Test 13: counter file is per-objective (independent keys)
  test('counter files are per-objective key (10 and 11 are independent)', () => {
    const env = markerEnv(tmpDir);
    writeResumeCount(planningDir, '10', 1, env);
    writeResumeCount(planningDir, '11', 2, env);
    assert.equal(readResumeCount(planningDir, '10', env), 1);
    assert.equal(readResumeCount(planningDir, '11', env), 2);
    clearResumeCount(planningDir, '10', env);
    assert.equal(readResumeCount(planningDir, '10', env), 0);
    assert.equal(readResumeCount(planningDir, '11', env), 2); // unaffected
  });
});
