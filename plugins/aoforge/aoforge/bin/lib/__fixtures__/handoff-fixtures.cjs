'use strict';

/**
 * Fixture builders for objective 73 (handoff gaps and result injection).
 *
 * Hand-built factories, no generated data (no_llm_test_data): every id is a fixed string, every timestamp is
 * derived from an injected `now` so a test can age a record by an exact number of milliseconds.
 *
 * 73-02 (delivery library): makeHandoffProject, doneRecord, pendingRecord, writeDone, writePending,
 *                           writePidFile, hookPayload
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { NAMES, LEGACY } = require('../legacy-names.cjs');

// A fixed clock. Library functions take `now`, so tests never read the wall clock.
const FIXED_NOW = Date.parse('2026-10-09T12:00:00.000Z');

const HANDOFF_DIR = '.aoforge-handoff';

function iso(ms) {
  return new Date(ms).toISOString();
}

/**
 * A disposable project holding `.aoforge-handoff/{pending,done}`. The root is realpath'd: macOS
 * `os.tmpdir()` sits under `/var/folders`, a symlink to `/private/var`.
 */
function makeHandoffProject() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-results-')));
  const handoffDir = path.join(root, HANDOFF_DIR);
  const pendingDir = path.join(handoffDir, 'pending');
  const doneDir = path.join(handoffDir, 'done');
  fs.mkdirSync(pendingDir, { recursive: true });
  fs.mkdirSync(doneDir, { recursive: true });
  return {
    root,
    handoffDir,
    pendingDir,
    doneDir,
    cleanup() {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
    },
  };
}

/** A record the daemon wrote to done/. Completed one second before `now`. */
function doneRecord(overrides = {}, now = FIXED_NOW) {
  return {
    id: 'h-fixture1',
    cmd: 'echo fixture',
    cwd: '/fixture',
    status: 'done',
    exit_code: 0,
    stdout: 'fixture\n',
    stderr: '',
    started_at: iso(now - 2000),
    completed_at: iso(now - 1000),
    consumed: false,
    ...overrides,
  };
}

/** A record a hook queued in pending/. Created one second before `now`. */
function pendingRecord(overrides = {}, now = FIXED_NOW) {
  return {
    id: 'h-fixture1',
    cmd: 'echo fixture',
    cwd: '/fixture',
    reason: 'needs a tty',
    source: 'hook',
    shell: null,
    timeout_ms: 600000,
    created_at: iso(now - 1000),
    status: 'pending',
    ...overrides,
  };
}

/** Write a done record as `done/<id>.json`; returns the path. */
function writeDone(project, rec) {
  const file = path.join(project.doneDir, `${rec.id}.json`);
  fs.writeFileSync(file, JSON.stringify(rec, null, 2) + '\n');
  return file;
}

/** Write a pending record as `pending/<id>.json`; returns the path. */
function writePending(project, rec) {
  const file = path.join(project.pendingDir, `${rec.id}.json`);
  fs.writeFileSync(file, JSON.stringify(rec, null, 2) + '\n');
  return file;
}

/**
 * Write the daemon's pid file under `dir` and return its path.
 *
 * Current daemon: `<dir>/aoforge-watch.pid`; a test points AOFORGE_HANDOFF_PID_FILE at the returned path.
 * `legacy: true` writes the pre-rename daemon's file, `<dir>/<legacy dot dir>/<legacy name>.pid`. watcher-state no
 * longer reads it (TRD 78-05): tests write it to prove it is ignored.
 */
function writePidFile(dir, { pid = process.pid, watching = [], legacy = false } = {}) {
  const file = legacy
    ? path.join(dir, LEGACY.userDotDir, `${LEGACY.watch}.pid`)
    : path.join(dir, `${NAMES.watch}.pid`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({
    pid,
    version: '0.0.0',
    shell: null,
    watching,
    started_at: iso(FIXED_NOW - 60000),
  }, null, 2) + '\n');
  return file;
}

/** A Claude Code hook payload for the main loop of session `s-fixture`; override `agent_id` for a subagent. */
function hookPayload(event, overrides = {}) {
  return {
    session_id: 's-fixture',
    hook_event_name: event,
    cwd: '/fixture',
    ...overrides,
  };
}

module.exports = {
  FIXED_NOW,
  makeHandoffProject,
  doneRecord,
  pendingRecord,
  writeDone,
  writePending,
  writePidFile,
  hookPayload,
};
