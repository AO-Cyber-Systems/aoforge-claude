#!/usr/bin/env node
'use strict';

/**
 * DevFlow Project Upgrade (SessionStart) — objective 36, TRD 36-05, UPG-05.
 *
 * Upgrades a behind DevFlow project in place when a session starts:
 *
 *   1. Fast path: `.planning/config.json` `devflow.version` equals the bundled plugin version →
 *      exit. One small JSON read; nothing else is required or written.
 *   2. Apply: run the `auto` migrations synchronously via the BUNDLED upgrade.cjs (never the
 *      ~/.claude/devflow mirror — sync-runtime runs in parallel and may be mid-swap).
 *   3. Commit: spawn ONE detached child that commits exactly `changed_files` through the bundled
 *      `df-tools commit --files`, unless a skip rule holds (rebase/merge/cherry-pick/revert/bisect
 *      in progress, detached HEAD, a changed file had uncommitted edits before the hook ran, not a
 *      git repository). A failed commit (e.g. signing) is reported, never retried another way.
 *   4. Notices: results, pending `confirm` migrations and skip reasons go to
 *      `.planning/.devflow-notices.json`; route-results.js emits them once on the next prompt.
 *
 * Modes:
 *   node upgrade-project.js                                   SessionStart hook
 *   node upgrade-project.js --commit-child <root> <ver> <f…>  the detached commit child
 *
 * Escape hatch: DEVFLOW_SKIP_UPGRADE=1.
 * Contract: stdout stays empty (SessionStart stdout becomes context), never throws, exit 0.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync, spawn, spawnSync } = require('child_process');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const LIB = path.join(pluginRoot, 'devflow', 'bin', 'lib');
const DF_TOOLS = path.join(pluginRoot, 'devflow', 'bin', 'df-tools.cjs');
const NOTICES_REL = '.planning/.devflow-notices.json';
const LOCK_STALE_MS = 120 * 1000;
const COMMIT_TIMEOUT_MS = 120 * 1000;
const MIGRATE_CMD = '/devflow:status check --migrate';

// git-path name → operation, checked in this order.
const BUSY_MARKERS = [
  ['rebase-merge', 'rebase'],
  ['rebase-apply', 'rebase'],
  ['MERGE_HEAD', 'merge'],
  ['CHERRY_PICK_HEAD', 'cherry-pick'],
  ['REVERT_HEAD', 'revert'],
  ['BISECT_LOG', 'bisect'],
];

// ─── small helpers ────────────────────────────────────────────────────────────

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/** Nearest ancestor of `start` (inclusive) holding a `.planning/` DIRECTORY, else null. */
function findProjectRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    try {
      if (fs.statSync(path.join(dir, '.planning')).isDirectory()) return dir;
    } catch { /* keep walking */ }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
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
  return path.join(home, '.claude', 'devflow', 'locks', `${slug}-${hash8}.lock`);
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

  const names = BUSY_MARKERS.map(([name]) => name);
  const paths = git(root, ['rev-parse', ...names.flatMap((n) => ['--git-path', n])]);
  if (paths.ok) {
    const lines = paths.out.split('\n').filter(Boolean);
    for (let i = 0; i < BUSY_MARKERS.length && i < lines.length; i++) {
      if (fs.existsSync(path.resolve(root, lines[i]))) {
        state.busy = BUSY_MARKERS[i][1];
        break;
      }
    }
  }

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

/** Add the notices file to the repo's info/exclude unless git already ignores it. */
function ensureExcluded(root) {
  if (git(root, ['check-ignore', '-q', '--', NOTICES_REL]).ok) return;
  const rel = git(root, ['rev-parse', '--git-path', 'info/exclude']);
  if (!rel.ok) return;
  const excludePath = path.resolve(root, rel.out.trim());
  // info/exclude patterns are relative to the repo top; a pattern with an inner '/' is anchored.
  const prefix = git(root, ['rev-parse', '--show-prefix']).out.trim();
  const entry = prefix ? `/${prefix}${NOTICES_REL}` : NOTICES_REL;
  try {
    const current = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf-8') : '';
    if (current.split('\n').includes(entry)) return;
    fs.mkdirSync(path.dirname(excludePath), { recursive: true });
    const sep = current === '' || current.endsWith('\n') ? '' : '\n';
    fs.appendFileSync(excludePath, `${sep}${entry}\n`);
  } catch { /* best effort */ }
}

function skipReason(state, changedFiles) {
  if (!state.isRepo) return 'not a git repository';
  if (state.busy) return `${state.busy} in progress`;
  if (state.detached) return 'detached HEAD';
  const dirty = changedFiles.filter((f) => state.dirty.has(state.prefix + f));
  if (dirty.length) return `uncommitted edits existed before the upgrade in ${dirty.join(', ')}`;
  return null;
}

// ─── the hook ─────────────────────────────────────────────────────────────────

function main() {
  if (process.env.DEVFLOW_SKIP_UPGRADE === '1') return;
  const root = findProjectRoot(process.cwd());
  if (!root) return;
  const manifest = readJson(path.join(pluginRoot, '.claude-plugin', 'plugin.json'));
  const to = manifest && typeof manifest.version === 'string' ? manifest.version : null;
  if (!to) return;
  const config = readJson(path.join(root, '.planning', 'config.json'));
  const stamp = config && config.devflow && typeof config.devflow === 'object' ? config.devflow.version : undefined;
  if (stamp === to) return; // FAST PATH

  const home = os.homedir();
  const lock = acquireLock(home, root);
  if (!lock) return;
  try {
    const state = gitState(root);
    if (state.isRepo) ensureExcluded(root);

    const upgrade = require(path.join(LIB, 'upgrade.cjs'));
    const report = upgrade.apply({ projectRoot: root, userHome: home, pluginVersion: to });

    if (report.pending_confirm.length) {
      const ids = report.pending_confirm.map((m) => m.id).join(', ');
      notify(root, {
        source: 'upgrade-project',
        level: 'action',
        key: 'upgrade-pending-confirm',
        message: `DevFlow has migrations that need your confirmation (${ids}). Run \`${MIGRATE_CMD}\` to review and apply them.`,
        detail: report.pending_confirm.map((m) => `${m.id}: ${m.title}${m.reason ? ` — ${m.reason}` : ''}`).join('\n'),
      });
    }
    if (report.failed.length) {
      notify(root, {
        source: 'upgrade-project',
        level: 'warn',
        key: 'upgrade-failed',
        message: `DevFlow upgrade to v${to} failed for ${report.failed.map((f) => f.id).join(', ')}; the project was left at ${report.from ? `v${report.from}` : 'its current version'} for those. Run \`${MIGRATE_CMD}\` for details.`,
        detail: report.failed.map((f) => `${f.id} (${f.phase}): ${f.error}`).join('\n'),
      });
    }

    const changed = Array.isArray(report.changed_files) ? report.changed_files : [];
    if (!changed.length) return;

    notify(root, {
      source: 'upgrade-project',
      level: 'info',
      message: `DevFlow upgraded this project from ${report.from ? `v${report.from}` : 'an unstamped version'} to v${to} (${report.applied.map((a) => a.id).join(', ') || 'stamp only'}).`,
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
        message: `DevFlow upgraded this project to v${to}; not committed: ${skip}. The changes are applied and left uncommitted — review and commit them yourself.`,
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
      message: `DevFlow upgrade to v${to} did not complete: ${String((e && e.message) || e).split('\n')[0]}`,
    });
  } finally {
    releaseLock(lock);
  }
}

// ─── the detached commit child ────────────────────────────────────────────────

function isTracked(root, rel) {
  return git(root, ['ls-files', '--error-unmatch', '--', rel]).ok;
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
  const message = `chore(devflow): upgrade project to v${to}`;
  const keep = files.filter((f) => fs.existsSync(path.join(root, f)) || isTracked(root, f));
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
      message: `DevFlow committed the v${to} upgrade as ${result.hash || 'a new commit'} (${keep.length} files).`,
    });
    return;
  }

  let why;
  if (r.error && r.error.code === 'ETIMEDOUT') why = `the commit timed out after ${COMMIT_TIMEOUT_MS / 1000} s`;
  else if (result && result.reason) {
    const firstErr = typeof result.error === 'string' ? result.error.trim().split('\n')[0] : '';
    why = firstErr ? `${result.reason} (${firstErr})` : result.reason;
  } else {
    why = String(r.stderr || '').trim().split('\n')[0] || `df-tools commit exited ${r.status}`;
  }
  notify(root, {
    source: 'upgrade-commit',
    level: 'warn',
    message: `DevFlow upgrade to v${to} not committed: ${why}. Changes are applied; review and commit them yourself.`,
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
