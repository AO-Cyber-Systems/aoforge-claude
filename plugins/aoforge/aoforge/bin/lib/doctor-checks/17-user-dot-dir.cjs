'use strict';

// Doctor check: user-dot-dir (objective 73, TRD 73-13, gap G5).
//
// AOForge 3.0.0 kept the user's files and the watch daemon's files in ~/.aoforge/, which has the planning
// directory's name. 73-09 stops $HOME from ever being a project and 73-11/73-12 moved the files to the runtime home,
// reading the old copies for one release. This check finds a leftover ~/.aoforge/ and, on --fix, moves what AOForge
// put there:
//
//   absent                                          -> ok
//   planning files inside                           -> warn, report-only ($HOME is never a project; yours to move)
//   live daemon pid / a service still logging there -> warn, report-only, names the command to run first
//   known files                                     -> warn, fixable: moved to the new home, or into
//                                                      backups/aoforge-dot-dir-<ts>/ when the destination exists or
//                                                      the pid file is stale; never deleted, never overwritten
//   unknown files                                   -> listed, left in place (the directory then stays)
//   empty                                           -> warn, fixable: the empty directory is removed
//
// The mover is global-upgrade's moveEntry (a rename, or an EXDEV copy that is verified before the original goes), so
// every move is reversible by moving the file back. The directory itself is removed only when it is empty afterwards,
// and only when it is a real directory: a symlinked ~/.aoforge keeps its link and its target. The doctor never edits
// or reloads a service (no launchctl, no systemctl) and never signals a process: a pid is probed with signal 0.
//
// Reads the home only through ctx.userHome and ctx.paths. File names come from NAMES (legacy-names.cjs).

const fs = require('fs');
const path = require('path');

const { NAMES } = require('../legacy-names.cjs');
const { watchStateDir, runtimeHome } = require('../compat.cjs');
const { moveEntry } = require('../global-upgrade.cjs');
const { servicePaths } = require('../service-installer.cjs');

const DOT_DIR = NAMES.userDotDir;
const PID_FILE = `${NAMES.watch}.pid`;
/** What the watch daemon and its service wrote: moved to the watch state directory. */
const TO_WATCH = [PID_FILE, `${NAMES.watch}.log`, 'launchd-stdout.log', 'launchd-stderr.log',
  'systemd-stdout.log', 'systemd-stderr.log'];
/** The user's own files: moved to the runtime home. */
const TO_RUNTIME = ['defaults.json', 'brave_api_key', `${NAMES.watch}-allow.json`];
/** Planning files: $HOME is never a project, so they are the user's to move, never the doctor's. */
const PLANNING = ['STATE.md', 'ROADMAP.md', 'PROJECT.md', 'config.json', 'objectives'];
const BACKUP_PREFIX = `${NAMES.runtimeDir}-dot-dir-`;

const RUNTIME_BIN = `~/.claude/${NAMES.runtimeDir}/bin`;
const FIX_COMMAND = `node ${RUNTIME_BIN}/aof-tools.cjs doctor --global --fix`;
const WATCH_CLI = `node ${RUNTIME_BIN}/${NAMES.watch}.cjs`;

function statWith(stat, p) {
  try {
    return stat(p);
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return null;
    throw err;
  }
}
const lstatOrNull = (p) => statWith(fs.lstatSync, p);
const statOrNull = (p) => statWith(fs.statSync, p);

/** `~/<path below home>` (posix) for a finding; `dir` adds the trailing '/'. */
function shown(ctx, abs, dir = false) {
  const rel = path.relative(ctx.userHome, abs).split(path.sep).join('/');
  return `~/${rel}${dir ? '/' : ''}`;
}

/** The pid in the daemon's JSON pid record, or null when the file is not one. */
function recordedPid(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return data && Number.isInteger(data.pid) && data.pid > 0 ? data.pid : null;
  } catch {
    return null;
  }
}

/** Signal 0 only probes. EPERM means the process exists under another user: live, so the fix waits. */
function isLive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return Boolean(err && err.code === 'EPERM');
  }
}

function xmlUnescape(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/** The `--project` value an installed service runs with, or null. */
function serviceProject(kind, text) {
  const m = kind === 'launchd'
    ? text.match(/<string>--project<\/string>\s*<string>([^<]*)<\/string>/)
    : text.match(/^ExecStart=.*\s--project\s+(\S+)/m);
  if (!m || !m[1]) return null;
  return kind === 'launchd' ? xmlUnescape(m[1]) : m[1];
}

/** A shell word: as is when it holds only safe characters, else single-quoted. */
function shellWord(s) {
  return /^[A-Za-z0-9_./,:@%+=-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Installed watch services whose file still names a path in the dot directory. */
function servicesInDotDir(ctx) {
  const out = [];
  for (const [kind, file] of Object.entries(servicePaths(ctx.userHome))) {
    const st = statOrNull(file);
    if (!st || !st.isFile()) continue;
    const text = fs.readFileSync(file, 'utf-8');
    if (text.includes(`/${DOT_DIR}/`)) out.push({ kind, file, project: serviceProject(kind, text) });
  }
  return out;
}

/** What is in ~/.aoforge/ and what stands in the way of moving it. */
function scan(ctx) {
  const dir = path.join(ctx.userHome, DOT_DIR);
  const link = lstatOrNull(dir);
  const st = link && link.isSymbolicLink() ? statOrNull(dir) : link;
  if (!st || !st.isDirectory()) return { dir, absent: true };

  const known = [];
  const planning = [];
  const unknown = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (PLANNING.includes(name)) {
      planning.push(name);
      continue;
    }
    const from = path.join(dir, name);
    const entry = lstatOrNull(from);
    let toDir = null;
    if (TO_WATCH.includes(name)) toDir = watchStateDir(ctx.userHome);
    else if (TO_RUNTIME.includes(name)) toDir = runtimeHome(ctx.userHome);
    // A known name that is not a regular file (a directory, a symlink) is not what AOForge wrote: left in place.
    if (toDir && entry && entry.isFile()) known.push({ name, from, toDir, to: path.join(toDir, name) });
    else unknown.push(name);
  }

  const pidEntry = known.find((k) => k.name === PID_FILE);
  const pid = pidEntry ? recordedPid(pidEntry.from) : null;
  const pidLive = pid !== null && isLive(pid);
  for (const k of known) {
    k.stale = k === pidEntry && !pidLive;
    k.intoBackup = k.stale || lstatOrNull(k.to) !== null;
  }
  return {
    dir, absent: false, symlink: link.isSymbolicLink(), known, planning, unknown, pid, pidLive,
    services: servicesInDotDir(ctx),
  };
}

function backupLabel(ctx) {
  return `${shown(ctx, ctx.paths.backupsDir)}/${BACKUP_PREFIX}<timestamp>/`;
}

function judge(ctx, s) {
  const dot = shown(ctx, s.dir, true);
  if (s.absent) return { severity: 'ok', finding: `no ${dot} directory`, fixable: false, details: { dir: s.dir } };

  const details = {
    dir: s.dir,
    symlink: s.symlink,
    known: s.known.map((k) => ({ name: k.name, to: k.intoBackup ? 'backup' : k.to, stale_pid: k.stale })),
    planning: s.planning,
    unknown: s.unknown,
    pid: s.pid,
    pid_live: s.pidLive,
    services: s.services.map((x) => x.file),
  };
  const warn = (finding, fixable, fixCommand) => ({
    severity: 'warn',
    finding,
    fixable,
    ...(fixCommand ? { fix_command: fixCommand } : {}),
    details,
  });

  if (s.planning.length > 0) {
    return warn(`${dot} holds planning files (${s.planning.join(', ')}): $HOME is never an AOForge project, so nothing `
      + 'reads them there; the doctor leaves the directory alone (move them into the project they belong to)', false);
  }

  const blockers = [];
  const commands = [];
  if (s.pidLive) {
    blockers.push(`the watch daemon (pid ${s.pid}) is running with its pid file there; stop it first (${NAMES.watch} stop)`);
    commands.push(`${WATCH_CLI} stop`);
  }
  if (s.services.length > 0) {
    const project = s.services.map((x) => x.project).find(Boolean);
    blockers.push(`an installed watch service (${s.services.map((x) => shown(ctx, x.file)).join(', ')}) still logs `
      + `into ${dot}; reinstall it first (${NAMES.watch} uninstall-service, then install-service) so it logs to `
      + `${shown(ctx, watchStateDir(ctx.userHome), true)}`);
    commands.push(`${WATCH_CLI} uninstall-service`, `${WATCH_CLI} install-service --project ${project ? shellWord(project) : '<dir>'}`);
  }
  if (blockers.length > 0) {
    return warn(`${dot} holds files AOForge 3.0.0 wrote, and the fix waits: ${blockers.join('; ')}; `
      + 'then run doctor --global --fix', false, commands.join(' && '));
  }

  if (s.known.length === 0 && s.unknown.length === 0) {
    if (s.symlink) {
      return warn(`${dot} is a symlink to an empty directory: nothing AOForge reads is left there, and the doctor `
        + 'never removes a link (remove it yourself when you no longer need it)', false);
    }
    return warn(`${dot} is empty (left by AOForge 3.0.0); the fix removes the empty directory`, true, FIX_COMMAND);
  }
  if (s.known.length === 0) {
    return warn(`${dot} holds only files AOForge does not know: ${s.unknown.join(', ')}; the doctor leaves them, and `
      + 'the directory, in place', false);
  }

  const moves = s.known.map((k) => {
    if (k.stale) return `${k.name} -> ${backupLabel(ctx)} (stale pid file)`;
    if (k.intoBackup) return `${k.name} -> ${backupLabel(ctx)} (${shown(ctx, k.to)} already exists)`;
    return `${k.name} -> ${shown(ctx, k.toDir, true)}`;
  });
  const left = s.unknown.length > 0 ? `; left in place, with the directory: ${s.unknown.join(', ')}` : '';
  return warn(`${dot} holds files AOForge 3.0.0 wrote: ${moves.join(', ')} (the fix moves them; a file whose `
    + `destination exists goes to ${backupLabel(ctx)} instead; nothing is deleted or overwritten)${left}`, true, FIX_COMMAND);
}

function run(ctx) {
  return judge(ctx, scan(ctx));
}

function stamp(now) {
  return now.toISOString().replace(/[:.]/g, '-');
}

function fix(ctx) {
  // Re-scan: the home may have changed since run().
  const s = scan(ctx);
  const result = judge(ctx, s);
  if (result.fixable !== true) return { applied: false, refused: result.finding };

  const dot = shown(ctx, s.dir, true);
  const backupDir = path.join(ctx.paths.backupsDir, `${BACKUP_PREFIX}${stamp(ctx.now)}`);
  const changed = [];
  const moved = [];
  const kept = [];
  let usedBackup = false;
  for (const k of s.known) {
    const target = k.intoBackup ? path.join(backupDir, k.name) : k.to;
    // Never overwrite: a target that appeared since the scan, or a backup slot already taken, keeps the file here.
    if (lstatOrNull(target) !== null) {
      kept.push(`${k.name} (${shown(ctx, target)} already exists)`);
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    moveEntry(k.from, target);
    changed.push(target);
    moved.push(`${k.name} -> ${shown(ctx, target)}`);
    if (k.intoBackup) usedBackup = true;
  }

  const notes = [];
  if (moved.length > 0) notes.push(`moved ${moved.length} file${moved.length === 1 ? '' : 's'}: ${moved.join(', ')}`);
  if (kept.length > 0) notes.push(`kept in ${dot}, never overwritten: ${kept.join(', ')}`);
  if (s.unknown.length > 0) notes.push(`left in place, not files AOForge wrote: ${s.unknown.join(', ')}`);

  let removed = false;
  const remaining = fs.readdirSync(s.dir);
  if (s.symlink) {
    notes.push(`${dot} is a symlink: the link and its target stay`);
  } else if (remaining.length === 0) {
    fs.rmdirSync(s.dir);
    removed = true;
    notes.push(`removed the empty ${dot}`);
  } else {
    notes.push(`${dot} stays: it still holds ${remaining.sort().join(', ')}`);
  }

  return {
    applied: changed.length > 0 || removed,
    changed,
    ...(usedBackup ? { backup: backupDir } : {}),
    notes: notes.join('; '),
  };
}

module.exports = {
  id: 'user-dot-dir',
  title: `Files AOForge 3.0.0 left in ~/${DOT_DIR}`,
  scope: 'global',
  run,
  fix,
};
