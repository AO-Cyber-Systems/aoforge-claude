#!/usr/bin/env node
'use strict';

/**
 * AOForge Project Upgrade (SessionStart) — objective 36, TRD 36-05, UPG-05.
 *
 * Upgrades a behind AOForge project in place when a session starts:
 *
 *   0. Prune (objective 37, ADP-05): `backup-prune.runThrottled` removes old backups under
 *      ~/.claude/aoforge/backups, at most once per 24 h, in EVERY session whether or not cwd is a
 *      AOForge project. Runs FIRST — before the AOFORGE_SKIP_UPGRADE check, the project lookup and
 *      the stamp fast path below. Why this hook and not sync-runtime.js: sync-runtime exits at its
 *      own version fast path (sync-runtime.js:44-49) whenever the mirror is already current, i.e.
 *      in almost every session, and its global-upgrade call only runs right after a re-mirror.
 *      upgrade-project.js runs on every SessionStart and every one of its own early returns (steps
 *      1-4) comes AFTER this call, so the prune is not skipped along with them. The call is wrapped
 *      in its own try/catch: any error writes one `[aoforge] backup prune skipped: <msg>` line to
 *      stderr and the hook continues; stdout stays empty; exit code stays 0.
 *   0b. Transcript export (objective 61, OBS-03): `transcript-export-schedule.runScheduled` starts
 *      `aof-tools transcript-export` at most once per 24 h, in EVERY session, right after the prune
 *      and before the same early returns. The export preserves a compact per-session index at
 *      ~/.claude/aoforge/transcript-index.jsonl before Claude Code's retention deletes the
 *      transcripts (the 2026-08-18 audit lost 164 sessions); nothing ran it. It is a DETACHED
 *      child (unref'd, stdio ignored) running the BUNDLED aof-tools, never the mirror: a first run
 *      reads every transcript (gigabytes) and must not hold up session start, and the export is
 *      incremental, so later runs are cheap. The 24 h window is CLAIMED (stamp written to
 *      ~/.claude/aoforge/state/transcript-export/last-run.json) BEFORE the spawn, so sessions that
 *      start together start one export; a child that dies leaves the window claimed and the next
 *      window catches up. No ~/.claude/projects → nothing spawned, nothing written. Own try/catch:
 *      any error writes one `[aoforge] transcript export skipped: <msg>` line to stderr and the
 *      hook continues; stdout stays empty; exit code stays 0.
 *   1. Fast path: `.aoforge/config.json` `aoforge.version` equals the bundled plugin version and the
 *      project does not use the legacy planning directory → exit. One small JSON read and two stats;
 *      nothing else is required or written. Only the new stamp key counts here: a legacy key (or a
 *      legacy directory) always takes the slow path, so migrations 0012/0013 get to run (TRD 72-08).
 *   2. Apply: run the `auto` migrations synchronously via the BUNDLED upgrade.cjs (never the
 *      ~/.claude/aoforge mirror — sync-runtime runs in parallel and may be mid-swap). A legacy
 *      project's 0012 moves its planning directory to `.aoforge/` with `git mv`; when 0012 defers
 *      (dirty tree, an operation in progress, `.aoforge/` already there) nothing moves and a notice
 *      names the reason and `aof-tools upgrade --apply --only 0012`.
 *   3. Commit: spawn ONE detached child that commits exactly `changed_files` through the bundled
 *      `aof-tools commit --files`, unless a skip rule holds (rebase/merge/cherry-pick/revert/bisect
 *      in progress, detached HEAD, a changed file had uncommitted edits before the hook ran, not a
 *      git repository). A changed DIRECTORY (0012's two) counts as edited when anything under it was
 *      dirty or untracked-and-unignored before the run, so the commit never sweeps such a file in.
 *      A completed move commits as renames: the child keeps a path that only HEAD still has.
 *      A failed commit (e.g. signing) is reported, never retried another way.
 *   4. Notices: results, pending `confirm` migrations, deferrals and skip reasons go to
 *      `.aoforge/.aoforge-notices.json` (the project's planning directory after the run);
 *      route-results.js emits them once on the next prompt.
 *
 * Modes:
 *   node upgrade-project.js                                   SessionStart hook
 *   node upgrade-project.js --commit-child <root> <ver> <f…>  the detached commit child
 *
 * Escape hatches, each independent of the others: AOFORGE_SKIP_UPGRADE=1 (steps 1-4),
 * AOFORGE_SKIP_PRUNE=1 (step 0), AOFORGE_SKIP_TRANSCRIPT_EXPORT=1 (step 0b).
 * Contract: stdout stays empty (SessionStart stdout becomes context), never throws, exit 0.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
// Objective 72: honour the legacy env prefix for one release. A stub plugin tree without the libs fails open.
try { require('../aoforge/bin/lib/compat.cjs').aliasLegacyEnv(); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
// TRD 72-06: the planning directory is `.aoforge/`, or for one release a legacy one (compat.cjs resolves which).
const {
  findProjectRoot: compatFindProjectRoot,
  planningDirName,
  planningRoot,
  isLegacyPlanning,
} = require('../aoforge/bin/lib/compat.cjs');
// TRD 72-08: the busy-operation list is shared with migration 0012 (which never moves the directory mid-operation).
const { busyOperation } = require('../aoforge/bin/lib/git-busy.cjs');
const { execFileSync, spawn, spawnSync } = require('child_process');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const LIB = path.join(pluginRoot, 'aoforge', 'bin', 'lib');
const DF_TOOLS = path.join(pluginRoot, 'aoforge', 'bin', 'aof-tools.cjs');
const { NAMES } = require('../aoforge/bin/lib/legacy-names.cjs');
const LOCK_STALE_MS = 120 * 1000;
const COMMIT_TIMEOUT_MS = 120 * 1000;
const MIGRATE_CMD = '/aoforge:status check --migrate';

// ─── small helpers ────────────────────────────────────────────────────────────

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Nearest ancestor of `start` (inclusive) holding a planning DIRECTORY (`.aoforge/`, or a legacy one:
 * compat.findProjectRoot), else null.
 */
function findProjectRoot(start) {
  try {
    return compatFindProjectRoot(start, { maxUp: Infinity });
  } catch {
    return null;
  }
}

/** `git -C root …` → { ok, out }. Never a shell string, never throws. */
function git(root, args) {
  try {
    const out = execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
    });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: e && typeof e.stdout === 'string' ? e.stdout : '' };
  }
}

function loadNotices() {
  try {
    return require(path.join(LIB, 'notices.cjs'));
  } catch {
    return null;
  }
}

function notify(root, notice) {
  const notices = loadNotices();
  if (!notices) return;
  try {
    notices.appendNotice(notices.projectNoticesPath(root), notice);
  } catch { /* a notice must never break the hook */ }
}

// ─── lock ─────────────────────────────────────────────────────────────────────

function lockPathFor(home, root) {
  const real = fs.realpathSync(root);
  const slug = path.basename(real).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const hash8 = crypto.createHash('sha1').update(real).digest('hex').slice(0, 8);
  return path.join(home, '.claude', 'aoforge', 'locks', `${slug}-${hash8}.lock`);
}

/** Claim the per-project lock; a lock older than 120 s is stolen once. → path or null. */
function acquireLock(home, root) {
  let lockPath;
  try {
    lockPath = lockPathFor(home, root);
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  } catch {
    return null;
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      try { fs.writeSync(fd, `${process.pid} ${new Date().toISOString()}\n`); } finally { fs.closeSync(fd); }
      return lockPath;
    } catch (e) {
      if (!e || e.code !== 'EEXIST' || attempt > 0) return null;
      try {
        const age = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (age <= LOCK_STALE_MS) return null;
        fs.unlinkSync(lockPath);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function releaseLock(lockPath) {
  if (!lockPath) return;
  try { fs.unlinkSync(lockPath); } catch { /* already gone */ }
}

// ─── git state (taken BEFORE apply) ───────────────────────────────────────────

/**
 * → { isRepo, busy: op|null, detached, prefix, dirty:Set<repo-relative path> }
 * `dirty` comes from a porcelain v1 -z snapshot with every untracked file listed.
 */
function gitState(root) {
  const state = { isRepo: false, busy: null, detached: false, prefix: '', dirty: new Set() };
  const top = git(root, ['rev-parse', '--show-prefix']);
  if (!top.ok) return state;
  state.isRepo = true;
  state.prefix = top.out.trim();

  state.busy = busyOperation(root, (args) => git(root, args));

  state.detached = !git(root, ['symbolic-ref', '-q', 'HEAD']).ok;

  const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (status.ok) {
    const parts = status.out.split('\0');
    for (let i = 0; i < parts.length; i++) {
      const entry = parts[i];
      if (entry.length < 4) continue;
      const xy = entry.slice(0, 2);
      state.dirty.add(entry.slice(3));
      // A rename/copy entry is followed by its source path.
      if (/[RC]/.test(xy) && i + 1 < parts.length) state.dirty.add(parts[++i]);
    }
  }
  return state;
}

/**
 * The notices file relative to the project root, in the project's own planning directory (`.aoforge/`,
 * or a legacy one): where notices.cjs projectNoticesPath writes it.
 */
function noticesRel(root) {
  return `${planningDirName(root)}/${NAMES.notices}`;
}

/** Add the notices file to the repo's info/exclude unless git already ignores it. */
function ensureExcluded(root) {
  const notices = noticesRel(root);
  if (git(root, ['check-ignore', '-q', '--', notices]).ok) return;
  const rel = git(root, ['rev-parse', '--git-path', 'info/exclude']);
  if (!rel.ok) return;
  const excludePath = path.resolve(root, rel.out.trim());
  // info/exclude patterns are relative to the repo top; a pattern with an inner '/' is anchored.
  const prefix = git(root, ['rev-parse', '--show-prefix']).out.trim();
  const entry = prefix ? `/${prefix}${notices}` : notices;
  try {
    const current = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf-8') : '';
    if (current.split('\n').includes(entry)) return;
    fs.mkdirSync(path.dirname(excludePath), { recursive: true });
    const sep = current === '' || current.endsWith('\n') ? '' : '\n';
    fs.appendFileSync(excludePath, `${sep}${entry}\n`);
  } catch { /* best effort */ }
}

/**
 * TRD 44-06: runtime-state paths untracked by migration 0008. Hooks rewrite them constantly, so
 * they are dirty in almost every session; the upgrade commits them as DELETIONS only (aof-tools
 * commit's staged-removal path), never as content, so a pre-upgrade edit cannot be swept in.
 * TRD 45-02: the same holds for a nested `.aoforge/` (aodex tracks `flutter/.aoforge/…`), so the
 * exemption is a predicate — the migration's own `isRuntimeStatePath` — not a fixed list of root
 * paths. Loaded lazily from the bundled migration so the fast path requires nothing. An older
 * bundle without that export falls back to membership in RUNTIME_STATE_FILES (root paths only);
 * a bundle that cannot be loaded exempts nothing, which is the fail-safe direction (it can only
 * cause a skip, never sweep a dirty file into the commit).
 */
function runtimeStatePredicate() {
  try {
    const m = require(path.join(LIB, 'migrations', '0008-runtime-state-untrack.cjs'));
    if (typeof m.isRuntimeStatePath === 'function') return (rel) => m.isRuntimeStatePath(rel) === true;
    const list = Array.isArray(m.RUNTIME_STATE_FILES) ? m.RUNTIME_STATE_FILES : [];
    return (rel) => list.includes(rel);
  } catch {
    return () => false;
  }
}

/**
 * TRD 72-08: a changed path may be a DIRECTORY (migration 0012 reports both planning directories). It counts as
 * edited when any path under it was dirty before the run (`state.dirty` lists untracked files one by one), because
 * the commit stages the directory as a whole and would sweep such a file in. Runtime-state paths stay exempt.
 */
function skipReason(state, changedFiles) {
  if (!state.isRepo) return 'not a git repository';
  if (state.busy) return `${state.busy} in progress`;
  if (state.detached) return 'detached HEAD';
  const isExempt = runtimeStatePredicate();
  const dirty = [];
  for (const f of changedFiles) {
    if (isExempt(f)) continue;
    const full = state.prefix + f;
    if (state.dirty.has(full)) {
      dirty.push(f);
      continue;
    }
    for (const d of state.dirty) {
      if (!d.startsWith(`${full}/`)) continue;
      const rel = d.slice(state.prefix.length);
      if (!isExempt(rel)) dirty.push(rel);
    }
  }
  if (dirty.length) return `uncommitted edits existed before the upgrade in ${[...new Set(dirty)].sort().join(', ')}`;
  return null;
}

/**
 * TRD 72-08: a migration the runner deferred (0012 on a dirty or busy tree) gets one action notice, replaced rather
 * than repeated while it stays deferred (a stable key). The kind, reason code and command ride in `detail`.
 */
function notifyDeferred(root, d) {
  const command = `aof-tools upgrade --apply --only ${d.id}`;
  const notes = String(d.notes || '').trim();
  const tail = notes.includes(command) ? '' : ` Run \`${command}\` once it clears.`;
  notify(root, {
    source: 'upgrade-project',
    level: 'action',
    key: `upgrade-deferred-${d.id}`,
    message: `AOForge left migration ${d.id} (${d.title}) for later (${d.reason}): ${notes || d.reason}.${tail} ` +
      'The next session start retries it.',
    detail: { kind: 'deferred', id: d.id, reason: d.reason, command, notes },
  });
}

// ─── the hook ─────────────────────────────────────────────────────────────────

/**
 * The export child: a detached, unref'd `node <bundled aof-tools> transcript-export …` with its stdio
 * ignored, so SessionStart never waits for it (a first run reads every transcript). The `error`
 * listener keeps an asynchronous spawn failure from becoming an uncaught exception.
 */
function spawnTranscriptExport(args) {
  const child = spawn(process.execPath, args, { detached: true, stdio: 'ignore', env: process.env });
  child.on('error', () => {});
  child.unref();
}

function main() {
  // Objective 37 (ADP-05): prune ~/.claude/aoforge/backups at most once per 24 h. Runs first so it
  // happens in EVERY session (sync-runtime.js exits at its version fast path, so it does not).
  if (process.env.AOFORGE_SKIP_PRUNE !== '1') {
    try {
      require(path.join(LIB, 'backup-prune.cjs')).runThrottled({ userHome: os.homedir(), now: new Date() });
    } catch (e) {
      process.stderr.write(`[aoforge] backup prune skipped: ${e.message}\n`);
    }
  }

  // Objective 61 (OBS-03): start `aof-tools transcript-export` in the background at most once per
  // 24 h. Same placement and independence as the prune: before the upgrade early returns, skipped
  // only by its own escape.
  if (process.env.AOFORGE_SKIP_TRANSCRIPT_EXPORT !== '1') {
    try {
      require(path.join(LIB, 'transcript-export-schedule.cjs')).runScheduled({
        userHome: os.homedir(),
        now: new Date(),
        env: process.env,
        dfTools: DF_TOOLS,
        spawnChild: spawnTranscriptExport,
      });
    } catch (e) {
      process.stderr.write(`[aoforge] transcript export skipped: ${e.message}\n`);
    }
  }

  if (process.env.AOFORGE_SKIP_UPGRADE === '1') return;
  const root = findProjectRoot(process.cwd());
  if (!root) return;
  const manifest = readJson(path.join(pluginRoot, '.claude-plugin', 'plugin.json'));
  const to = manifest && typeof manifest.version === 'string' ? manifest.version : null;
  if (!to) return;
  const config = readJson(path.join(planningRoot(root), 'config.json'));
  // Only the new stamp key: a project still stamped under the legacy key takes the slow path, so 0013 renames it.
  const stampKey = NAMES.configKey;
  const stamp = config && config[stampKey] && typeof config[stampKey] === 'object' ? config[stampKey].version : undefined;
  if (stamp === to && !isLegacyPlanning(root)) return; // FAST PATH (a legacy directory always leaves it: 0012)

  const home = os.homedir();
  const lock = acquireLock(home, root);
  if (!lock) return;
  try {
    const state = gitState(root);
    if (state.isRepo) ensureExcluded(root);

    const upgrade = require(path.join(LIB, 'upgrade.cjs'));
    const report = upgrade.apply({ projectRoot: root, userHome: home, pluginVersion: to });
    // 0012 may have moved the planning directory: the notices file now lives under the new name.
    if (state.isRepo) ensureExcluded(root);

    for (const d of Array.isArray(report.deferred) ? report.deferred : []) notifyDeferred(root, d);
    if (report.pending_confirm.length) {
      const ids = report.pending_confirm.map((m) => m.id).join(', ');
      notify(root, {
        source: 'upgrade-project',
        level: 'action',
        key: 'upgrade-pending-confirm',
        message: `AOForge has migrations that need your confirmation (${ids}). Run \`${MIGRATE_CMD}\` to review and apply them.`,
        detail: report.pending_confirm.map((m) => `${m.id}: ${m.title}${m.reason ? ` — ${m.reason}` : ''}`).join('\n'),
      });
    }
    if (report.failed.length) {
      notify(root, {
        source: 'upgrade-project',
        level: 'warn',
        key: 'upgrade-failed',
        message: `AOForge upgrade to v${to} failed for ${report.failed.map((f) => f.id).join(', ')}; the project was left at ${report.from ? `v${report.from}` : 'its current version'} for those. Run \`${MIGRATE_CMD}\` for details.`,
        detail: report.failed.map((f) => `${f.id} (${f.phase}): ${f.error}`).join('\n'),
      });
    }

    const changed = Array.isArray(report.changed_files) ? report.changed_files : [];
    if (!changed.length) return;

    notify(root, {
      source: 'upgrade-project',
      level: 'info',
      message: `AOForge upgraded this project from ${report.from ? `v${report.from}` : 'an unstamped version'} to v${to} (${report.applied.map((a) => a.id).join(', ') || 'stamp only'}).`,
      detail: {
        from: report.from,
        to,
        applied: report.applied.map((a) => a.id),
        changed_files: changed,
        backup: report.backup,
      },
    });

    const skip = skipReason(state, changed);
    if (skip) {
      notify(root, {
        source: 'upgrade-project',
        level: 'warn',
        message: `AOForge upgraded this project to v${to}; not committed: ${skip}. The changes are applied and left uncommitted — review and commit them yourself.`,
        detail: changed.join('\n'),
      });
      return;
    }

    const child = spawn(process.execPath, [__filename, '--commit-child', root, to, ...changed], {
      cwd: root,
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });
    child.on('error', () => { /* reported by nobody; the change stays applied */ });
    child.unref();
  } catch (e) {
    notify(root, {
      source: 'upgrade-project',
      level: 'warn',
      message: `AOForge upgrade to v${to} did not complete: ${String((e && e.message) || e).split('\n')[0]}`,
    });
  } finally {
    releaseLock(lock);
  }
}

// ─── the detached commit child ────────────────────────────────────────────────

function isTracked(root, rel) {
  return git(root, ['ls-files', '--error-unmatch', '--', rel]).ok;
}

/**
 * TRD 72-08: a path only HEAD still has — the legacy planning directory after 0012's `git mv` (gone from disk and from
 * the index). Kept in the commit so its deletions pair with the additions as renames.
 */
function inHead(root, rel) {
  const r = git(root, ['ls-tree', '--name-only', 'HEAD', '--', rel]);
  return r.ok && r.out.trim() !== '';
}

function parseResult(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.lastIndexOf('\n{');
    if (start >= 0) {
      try { return JSON.parse(text.slice(start + 1)); } catch { /* fall through */ }
    }
    return null;
  }
}

function commitChild([root, to, ...files]) {
  if (!root || !to) return;
  const message = `chore(aoforge): upgrade project to v${to}`;
  const keep = files.filter((f) => fs.existsSync(path.join(root, f)) || isTracked(root, f) || inHead(root, f));
  if (!keep.length) return;

  const r = spawnSync(process.execPath, [DF_TOOLS, 'commit', message, '--files', ...keep], {
    cwd: root,
    encoding: 'utf-8',
    timeout: COMMIT_TIMEOUT_MS,
    env: process.env,
  });
  const result = parseResult(r.stdout);

  if (result && result.committed === true) {
    notify(root, {
      source: 'upgrade-commit',
      level: 'info',
      message: `AOForge committed the v${to} upgrade as ${result.hash || 'a new commit'} (${keep.length} files).`,
    });
    return;
  }

  let why;
  if (r.error && r.error.code === 'ETIMEDOUT') why = `the commit timed out after ${COMMIT_TIMEOUT_MS / 1000} s`;
  else if (result && result.reason) {
    const firstErr = typeof result.error === 'string' ? result.error.trim().split('\n')[0] : '';
    why = firstErr ? `${result.reason} (${firstErr})` : result.reason;
  } else {
    why = String(r.stderr || '').trim().split('\n')[0] || `aof-tools commit exited ${r.status}`;
  }
  notify(root, {
    source: 'upgrade-commit',
    level: 'warn',
    message: `AOForge upgrade to v${to} not committed: ${why}. Changes are applied; review and commit them yourself.`,
    detail: keep.join('\n'),
  });
}

// ─── entry ────────────────────────────────────────────────────────────────────

if (require.main === module) {
  try {
    if (process.argv[2] === '--commit-child') commitChild(process.argv.slice(3));
    else main();
  } catch { /* never throw */ }
  process.exitCode = 0;
}

module.exports = { findProjectRoot, gitState, skipReason, lockPathFor, acquireLock, releaseLock };
