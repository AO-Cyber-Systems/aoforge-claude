'use strict';

/**
 * Watcher state library — PID file lifecycle, liveness check, done-record
 * helpers used by the aoforge-watch daemon and by hooks that need to know
 * whether the daemon is running.
 *
 * Module is CommonJS that hooks (which run in their own Node processes) can
 * require directly. All paths honour $HOME (so tests can point at a temp dir).
 *
 * Where the pid file lives (TRD 73-12): the watch state directory,
 * ~/.claude/aoforge/state/watch/aoforge-watch.pid (compat.watchStateDir), beside
 * the other per-user runtime state. $AOFORGE_HANDOFF_PID_FILE overrides it.
 * That one file is the daemon record: it is the only file this module reads,
 * writes or removes as the record (TRD 78-05). Neither ~/.aoforge/aoforge-watch.pid
 * (where AOForge 3.0.0 kept it) nor the pre-rename daemon's pid file is read.
 *
 * The 3.0.0-daemon detector (TRD 78-05): a daemon AOForge 3.0.0 started is the
 * same program still rereading ~/.aoforge/aoforge-watch.pid. interimDaemon()
 * reads that file and probes its pid with signal 0, so `aoforge-watch start`
 * can name a live one instead of starting a second daemon beside it. It only
 * reports: nothing is served from, written to or removed from that file (moving
 * the leftover is doctor check 17's job). With the override set it reads nothing.
 *
 * Node built-ins only: some stub runtimes copy this file alone, which is why the
 * watch directory is spelled here rather than taken from compat.cjs.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PID_FILE_NAME = 'aoforge-watch.pid';
// <home>/.claude/aoforge/state/watch = compat.watchStateDir(home). Spelled here: some stub runtimes copy this file
// alone. watcher-state.test.cjs pins the two equal.
const WATCH_DIR_SEGMENTS = Object.freeze(['.claude', 'aoforge', 'state', 'watch']);
// Where AOForge 3.0.0 kept the pid file (NAMES.userDotDir, AOForge's own 3.0.0 user directory). Read only by the
// interimDaemon() detector, never as the daemon record (TRD 78-05).
const INTERIM_DOT_DIR = '.aoforge';

function homeDir() {
  // Use process.env.HOME first so tests can override it. os.homedir() reads
  // HOME on POSIX, USERPROFILE on Windows; we re-read it each call rather
  // than caching at module load.
  return process.env.HOME || os.homedir();
}

/** The AOForge daemon's pid file: the daemon record, and the only file this module reads, writes or removes as it. */
function pidFilePath() {
  // Allow explicit override via env (used by hook tests).
  if (process.env.AOFORGE_HANDOFF_PID_FILE) {
    return process.env.AOFORGE_HANDOFF_PID_FILE;
  }
  return path.join(homeDir(), ...WATCH_DIR_SEGMENTS, PID_FILE_NAME);
}

/** Parse a pid file into an object, or null when it is missing, unreadable, malformed or not an object. */
function readRecord(file) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  return data && typeof data === 'object' ? data : null;
}

/** Is `pid` a running process? Signal 0 only probes: EPERM (alive, another user's) counts as live, ESRCH as dead. */
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return !!(e && e.code === 'EPERM');
  }
}

function writePidFile({ pid, version, shell, watching }) {
  const file = pidFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const payload = {
    pid,
    version: version || '0.0.0',
    shell: shell || null,
    watching: Array.isArray(watching) ? watching : [],
    started_at: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
  return payload;
}

/** The daemon's pid record (pidFilePath() only), or null. The record is the file's object as written. */
function readPidFile() {
  return readRecord(pidFilePath());
}

/** Remove the daemon's pid file. Idempotent. No other file is touched: not the 3.0.0 one, not the pre-rename one. */
function removePidFile() {
  try {
    fs.unlinkSync(pidFilePath());
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

/**
 * A daemon AOForge 3.0.0 started, as its pid file ~/.aoforge/aoforge-watch.pid says (TRD 78-05): `{ pid, file, live }`,
 * where `live` is a signal-0 probe of `pid`; null when there is no such file, it is malformed, its pid is not a
 * positive integer, or AOFORGE_HANDOFF_PID_FILE is set (then nothing else is read). Detected, never adopted: the
 * caller names it so the user can stop it; nothing here reads its `watching` list or touches the file.
 */
function interimDaemon() {
  if (process.env.AOFORGE_HANDOFF_PID_FILE) return null;
  const file = path.join(homeDir(), INTERIM_DOT_DIR, PID_FILE_NAME);
  const data = readRecord(file);
  if (!data || !Number.isInteger(data.pid) || data.pid <= 0) return null;
  return { pid: data.pid, file, live: pidAlive(data.pid) };
}

function isWatcherLive() {
  const info = readPidFile();
  if (!info || typeof info.pid !== 'number') return false;
  try {
    process.kill(info.pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a done-record from a pending-record + execution result.
 *
 * @param {object} pending — the original pending record
 * @param {object} result — { stdout, stderr, exit_code, status, started_at }
 * @returns done-record (with consumed: false, completed_at)
 */
function makeDoneRecord(pending, result) {
  return {
    ...pending,
    started_at: result.started_at || new Date().toISOString(),
    completed_at: new Date().toISOString(),
    status: result.status || (result.exit_code === 0 ? 'done' : 'failed'),
    exit_code: result.exit_code,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    consumed: false,
  };
}

function markConsumed(donePath) {
  let rec;
  try {
    rec = JSON.parse(fs.readFileSync(donePath, 'utf8'));
  } catch {
    return false;
  }
  rec.consumed = true;
  // Atomic-ish: write to tmp + rename.
  const tmp = donePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(rec, null, 2) + '\n');
  fs.renameSync(tmp, donePath);
  return true;
}

function listUnconsumed(doneDir) {
  if (!fs.existsSync(doneDir)) return [];
  let entries;
  try {
    entries = fs.readdirSync(doneDir);
  } catch {
    return [];
  }
  const recs = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const filePath = path.join(doneDir, name);
    try {
      const rec = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (rec && rec.consumed === false) {
        rec._path = filePath;
        recs.push(rec);
      }
    } catch {
      // skip malformed
    }
  }
  recs.sort((a, b) => (a.completed_at || '').localeCompare(b.completed_at || ''));
  return recs;
}

/**
 * TRD 20-03: Add a project path to the live PID file's watching: [] array.
 * Atomic via tmp+rename. Idempotent (no-op if already present). Throws
 * `ENOPIDFILE` when the daemon isn't running so callers can guide the user.
 *
 * Path is normalized via path.resolve so relative paths from the CLI work.
 *
 * @param {string} projectPath
 * @returns {object} the new PID-file payload
 */
function addWatchedProject(projectPath) {
  const file = pidFilePath();
  const current = readPidFile();
  if (!current) {
    const err = new Error('no PID file — daemon not running');
    err.code = 'ENOPIDFILE';
    throw err;
  }
  const watching = Array.isArray(current.watching) ? [...current.watching] : [];
  const norm = path.resolve(projectPath);
  if (!watching.includes(norm)) watching.push(norm);
  const next = { ...current, watching };
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
  fs.renameSync(tmp, file);
  return next;
}

/**
 * TRD 20-03: Remove a project path from watching: []. Atomic via tmp+rename.
 * Idempotent — when the path is not in the array, returns the current
 * payload unchanged (no rewrite). Throws `ENOPIDFILE` when the daemon
 * isn't running (mirrors addWatchedProject for symmetric error handling;
 * CLI maps this to a friendly "not running" message and exits 0).
 *
 * @param {string} projectPath
 * @returns {object} the (possibly unchanged) PID-file payload
 */
function removeWatchedProject(projectPath) {
  const file = pidFilePath();
  const current = readPidFile();
  if (!current) {
    const err = new Error('no PID file — daemon not running');
    err.code = 'ENOPIDFILE';
    throw err;
  }
  const watching = Array.isArray(current.watching) ? [...current.watching] : [];
  const norm = path.resolve(projectPath);
  const idx = watching.indexOf(norm);
  if (idx === -1) return current; // idempotent — no-op
  watching.splice(idx, 1);
  const next = { ...current, watching };
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
  fs.renameSync(tmp, file);
  return next;
}

module.exports = {
  WATCH_DIR_SEGMENTS,
  pidFilePath,
  writePidFile,
  readPidFile,
  removePidFile,
  isWatcherLive,
  interimDaemon,
  makeDoneRecord,
  markConsumed,
  listUnconsumed,
  addWatchedProject,
  removeWatchedProject,
};
