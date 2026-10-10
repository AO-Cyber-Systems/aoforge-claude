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
 * the other per-user runtime state. $AOFORGE_HANDOFF_PID_FILE overrides it, and
 * then nothing else is read. This module writes only that file.
 *
 * Read order, first existing file wins (compat.resolveUserFile, one release):
 *   1. the watch state directory;
 *   2. ~/.aoforge/aoforge-watch.pid, where AOForge 3.0.0 kept it. A daemon 3.0.0
 *      started is the same AOForge daemon and keeps rereading that file for its
 *      `watching` list, so the record is NOT marked legacy: status, stop, start,
 *      isWatcherLive and gate-interactive see it, add/remove rewrite that same
 *      file, and removePidFile clears it, so stop/start clean up after it;
 *   3. the pre-rename daemon's pid file under the legacy dot directory (objective
 *      72, INST-03), marked `legacy: true`. That daemon watches its own handoff
 *      directories, not this one's, so its file is never taken over or removed:
 *      add/remove refuse it.
 * The compat layer is loaded fail-open, because some stub runtimes copy this
 * file alone (which is why the watch directory is spelled here as well); without
 * it only the watch state directory is read.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PID_FILE_NAME = 'aoforge-watch.pid';
// <home>/.claude/aoforge/state/watch = compat.watchStateDir(home). Spelled here: some stub runtimes copy this file
// alone. watcher-state.test.cjs pins the two equal.
const WATCH_DIR_SEGMENTS = Object.freeze(['.claude', 'aoforge', 'state', 'watch']);
// Where AOForge 3.0.0 kept the pid file. Read and cleared for one release; removed with the other shims in the
// release after 3.0.0.
const INTERIM_DOT_DIR = '.aoforge';

function homeDir() {
  // Use process.env.HOME first so tests can override it. os.homedir() reads
  // HOME on POSIX, USERPROFILE on Windows; we re-read it each call rather
  // than caching at module load.
  return process.env.HOME || os.homedir();
}

/** The AOForge daemon's pid file: the only one this module writes. */
function pidFilePath() {
  // Allow explicit override via env (used by hook tests).
  if (process.env.AOFORGE_HANDOFF_PID_FILE) {
    return process.env.AOFORGE_HANDOFF_PID_FILE;
  }
  return path.join(homeDir(), ...WATCH_DIR_SEGMENTS, PID_FILE_NAME);
}

/**
 * The pid file to read: `{ file, legacy, interim }`. `interim` is the 3.0.0 file (the same AOForge daemon);
 * `legacy` is the pre-rename daemon's. See the header for the order.
 */
function readablePidFile() {
  const current = pidFilePath();
  if (process.env.AOFORGE_HANDOFF_PID_FILE) return { file: current, legacy: false, interim: false };
  let compat;
  let LEGACY;
  try {
    compat = require('./compat.cjs');
    ({ LEGACY } = require('./legacy-names.cjs'));
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
    return { file: current, legacy: false, interim: false };
  }
  const r = compat.resolveUserFile(homeDir(), PID_FILE_NAME, {
    fsImpl: fs,
    legacyName: `${LEGACY.watch}.pid`,
    currentDir: path.dirname(current),
  });
  return { file: r.file, legacy: r.which === 'legacy', interim: r.which === 'interim' };
}

function legacyDaemonError(pid) {
  const err = new Error(
    `the running watcher (pid ${pid}) was started before the rename to AOForge and watches only its own ` +
    'handoff directories; stop it with `aoforge-watch stop`, then start aoforge-watch',
  );
  err.code = 'ELEGACYDAEMON';
  return err;
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

/**
 * The daemon's pid record, or null. A record read from the pre-rename daemon's file carries `legacy: true`; one read
 * from the 3.0.0 file carries nothing extra (it is the same AOForge daemon).
 */
function readPidFile() {
  const { file, legacy } = readablePidFile();
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object') return null;
    return legacy ? { ...data, legacy: true } : data;
  } catch {
    return null;
  }
}

/**
 * Remove the AOForge daemon's pid file and, for one release, the one AOForge 3.0.0 wrote, so `stop` and `start` clear
 * a stale 3.0.0 record. Never the pre-rename daemon's file: that daemon still runs from it until it is stopped.
 */
function removePidFile() {
  const files = [pidFilePath()];
  if (!process.env.AOFORGE_HANDOFF_PID_FILE) files.push(path.join(homeDir(), INTERIM_DOT_DIR, PID_FILE_NAME));
  for (const file of files) {
    try {
      fs.unlinkSync(file);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
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
  // The file the running daemon rereads: a daemon AOForge 3.0.0 started still reads ~/.aoforge/ (TRD 73-12).
  const { file } = readablePidFile();
  const current = readPidFile();
  if (!current) {
    const err = new Error('no PID file — daemon not running');
    err.code = 'ENOPIDFILE';
    throw err;
  }
  if (current.legacy) throw legacyDaemonError(current.pid);
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
  const { file } = readablePidFile(); // the file the running daemon rereads, as in addWatchedProject
  const current = readPidFile();
  if (!current) {
    const err = new Error('no PID file — daemon not running');
    err.code = 'ENOPIDFILE';
    throw err;
  }
  if (current.legacy) throw legacyDaemonError(current.pid);
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
  makeDoneRecord,
  markConsumed,
  listUnconsumed,
  addWatchedProject,
  removeWatchedProject,
};
