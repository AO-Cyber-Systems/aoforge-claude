'use strict';

// Migration 0012 — planning-dir move (objective 72, TRD 72-08, INST-04).
//
// AOForge keeps a project's planning tree in `.aoforge/` (NAMES.planningDir). A project a pre-rename install created
// has it in the legacy directory (LEGACY.planningDir), which every tool still reads for one release (compat.cjs, W066).
// This auto migration moves it, once, at the next session start (hooks/upgrade-project.js runs it and commits the
// result as one rename commit):
//
//   1. Guards (apply returns `{ changed: [], deferred: <code>, notes }` and writes nothing):
//        exists       `.aoforge/` is already there (W066 "both": a person decides what to keep)
//        rebase | merge | cherry-pick | revert | bisect   an operation is in progress (git-busy.cjs, the hook's list)
//        dirty        a tracked file has staged or unstaged changes. Untracked files are NOT dirt: inside the legacy
//                     directory they move with it, elsewhere they are not touched. A path an earlier migration of the
//                     same run changed (ctx.changedSoFar, from the runner) is the upgrade's own change, not the user's.
//   2. Backup, outside the repository (upgrade.backup: the whole legacy directory and CLAUDE.md), plus the ignore files
//      as they were (`0012-gitignore.before`, `0012-info-exclude.before`).
//   3. Store mode: the 0010 `.gitignore` block (either marker slug) is re-upserted first, with the AOForge markers and
//      both directory names, so the moved cache is ignored the moment it lands.
//   4. The move: `git mv <legacy> .aoforge` in a git work tree (history follows; untracked and ignored files inside
//      move with the directory, because git renames the directory itself). A legacy directory git tracks nothing in
//      cannot be `git mv`ed, so it is renamed with fs. Outside git: an fs rename.
//   5. Every `.gitignore` / `.git/info/exclude` line that names the legacy directory gets its `.aoforge/` counterpart
//      on the next line. The legacy lines are KEPT: the fallback lasts a release, and other branches may still have the
//      legacy directory. Outside git the ignore files are left alone.
//
// `changed` lists the two directories plus `.gitignore` when it changed (info/exclude is not a project file). The
// migration never stages anything beyond what `git mv` stages and never commits: the hook's commit child commits
// `changed` through `aof-tools commit`.
//
// One-release scope: this migration, the fallback it ends and the both-names 0010 block go in SHIM_REMOVAL (the release
// after 3.0.0). Every legacy name comes from legacy-names.cjs.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { NAMES, LEGACY, SHIM_REMOVAL } = require('../legacy-names.cjs');
const compat = require('../compat.cjs');
const upgrade = require('../upgrade.cjs');
const { busyOperation } = require('../git-busy.cjs');
const { escapeRegExp } = require('../text-escape.cjs');

// Destructured so a dotted access never spells the legacy directory (the rename guard reads source text).
const { planningDir: NEW_DIR } = NAMES;
const { planningDir: OLD_DIR } = LEGACY;

const GITIGNORE_REL = '.gitignore';
const MAX_LISTED = 10;

const GIT_REDIRECT_VARS = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_NAMESPACE',
];

function gitEnv() {
  const env = { ...process.env };
  for (const key of GIT_REDIRECT_VARS) delete env[key];
  return env;
}

function git(ctx, args) {
  const r = spawnSync('git', args, {
    cwd: ctx.projectRoot,
    env: gitEnv(),
    input: '',
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return { status: r.status, out: r.stdout || '', err: (r.stderr || '').trim() };
}

function isWorkTree(ctx) {
  const r = git(ctx, ['rev-parse', '--is-inside-work-tree']);
  return r.status === 0 && r.out.trim() === 'true';
}

function lazy0010() {
  return require('./0010-store-gitignore.cjs');
}

// A path segment naming the legacy directory: at the start of the pattern or after a `/`, followed by `/` or the end.
const LEGACY_SEGMENT = `(^|/)${escapeRegExp(OLD_DIR)}(?=/|$)`;

function listed(paths) {
  const shown = paths.slice(0, MAX_LISTED).join(', ');
  return paths.length > MAX_LISTED ? `${shown} and ${paths.length - MAX_LISTED} more` : shown;
}

// ─── detect ─────────────────────────────────────────────────────────────────────

function detect(ctx) {
  const root = ctx.projectRoot;
  if (compat.bothPlanningDirs(root)) {
    return {
      applies: false,
      reason: `${NEW_DIR}/ and ${OLD_DIR}/ both exist, so nothing is moved (W066: move what you still need into ` +
        `${NEW_DIR}/, then remove ${OLD_DIR}/)`,
    };
  }
  if (!compat.isLegacyPlanning(root)) {
    return {
      applies: false,
      reason: fs.existsSync(path.join(root, NEW_DIR)) ? `the project already uses ${NEW_DIR}/` : `no ${OLD_DIR}/ directory`,
    };
  }
  return {
    applies: true,
    reason: `${OLD_DIR}/ is the legacy planning directory; it moves to ${NEW_DIR}/ ` +
      `(the legacy one is read until ${SHIM_REMOVAL})`,
  };
}

// ─── guards ─────────────────────────────────────────────────────────────────────

/** Tracked paths (repository-relative) with staged or unstaged changes, from one porcelain v1 snapshot. */
function trackedChanges(ctx) {
  const r = git(ctx, ['status', '--porcelain=v1', '-z', '--untracked-files=no']);
  if (r.status !== 0) throw new Error(`git status failed: ${r.err || r.status}`);
  const parts = r.out.split('\0');
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (entry.length < 4) continue;
    out.push(entry.slice(3));
    // A rename or copy entry is followed by its source path.
    if (/[RC]/.test(entry.slice(0, 2)) && i + 1 < parts.length) out.push(parts[++i]);
  }
  return [...new Set(out)].sort();
}

/** The paths an earlier migration of this run changed, as a predicate on repository-relative paths. */
function changedSoFarPredicate(ctx) {
  const prefix = git(ctx, ['rev-parse', '--show-prefix']).out.trim();
  const own = (Array.isArray(ctx.changedSoFar) ? ctx.changedSoFar : [])
    .map((p) => `${prefix}${String(p).replace(/\\/g, '/').replace(/\/+$/, '')}`);
  return (repoPath) => own.some((c) => repoPath === c || repoPath.startsWith(`${c}/`));
}

/** `{ code, notes }` when the move must wait, else null. Reads only. */
function deferral(ctx, inGit) {
  const root = ctx.projectRoot;
  if (fs.existsSync(path.join(root, NEW_DIR))) {
    return {
      code: 'exists',
      notes: `${NEW_DIR}/ already exists; ${OLD_DIR}/ was not moved (W066: move what you still need into ${NEW_DIR}/, ` +
        `then remove ${OLD_DIR}/)`,
    };
  }
  if (!inGit) return null;
  const busy = busyOperation(root, (args) => {
    const r = git(ctx, args);
    return { ok: r.status === 0, out: r.out };
  });
  if (busy) {
    return { code: busy, notes: `a ${busy} is in progress; ${OLD_DIR}/ moves once it is finished` };
  }
  const isOwn = changedSoFarPredicate(ctx);
  const dirty = trackedChanges(ctx).filter((p) => !isOwn(p));
  if (dirty.length) {
    return {
      code: 'dirty',
      notes: `tracked files have uncommitted changes (${listed(dirty)}); commit or stash them, then run ` +
        '`aof-tools upgrade --apply --only 0012`',
    };
  }
  return null;
}

// ─── ignore files ───────────────────────────────────────────────────────────────

/** The `.aoforge/` counterpart of an ignore line naming the legacy directory, or null. Comments and blanks: null. */
function counterpart(line) {
  if (!line.trim() || line.trimStart().startsWith('#')) return null;
  const neg = line.startsWith('!') ? '!' : '';
  const body = neg ? line.slice(1) : line;
  if (!new RegExp(LEGACY_SEGMENT).test(body)) return null;
  return neg + body.replace(new RegExp(LEGACY_SEGMENT, 'g'), `$1${NEW_DIR}`);
}

/**
 * `text` with each legacy-directory line followed by its counterpart (unless the file already has it). Lines in
 * `[skipFrom, skipTo]` (the 0010 block, rewritten on its own) are left alone. -> `{ text, added: [lines] }`.
 */
function withCounterparts(text, skip = null) {
  const lines = text.split('\n');
  const have = new Set(lines.map((l) => l.replace(/\r$/, '')));
  const out = [];
  const added = [];
  lines.forEach((raw, i) => {
    out.push(raw);
    if (skip && i >= skip.start && i <= skip.end) return;
    const cr = raw.endsWith('\r') ? '\r' : '';
    const twin = counterpart(raw.replace(/\r$/, ''));
    if (twin === null || have.has(twin)) return;
    have.add(twin);
    added.push(twin);
    out.push(twin + cr);
  });
  return { text: out.join('\n'), added };
}

function readOrNull(file) {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw e;
  }
}

/** The new .gitignore text (store block first, then counterparts outside it) -> `{ text, added, block }`. */
function plannedGitignore(before) {
  if (before === null) return { text: null, added: [], block: false };
  const m0010 = lazy0010();
  let text = before;
  let block = false;
  if (m0010.readBlock(text)) {
    text = m0010.upsertBlock(text);
    block = text !== before;
  }
  const b = m0010.readBlock(text);
  const res = withCounterparts(text, b ? { start: b.start, end: b.end } : null);
  return { text: res.text, added: res.added, block };
}

function infoExcludePath(ctx) {
  const r = git(ctx, ['rev-parse', '--git-path', 'info/exclude']);
  if (r.status !== 0 || !r.out.trim()) return null;
  return path.resolve(ctx.projectRoot, r.out.trim());
}

// ─── the move ───────────────────────────────────────────────────────────────────

/**
 * After `git mv`, anything git left in the legacy directory (no git version observed to do so: it renames the
 * directory itself) is moved entry by entry with fs, so the outcome never depends on the git version.
 */
function moveLeftovers(from, to) {
  if (!fs.existsSync(from)) return;
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    const dest = path.join(to, name);
    if (fs.existsSync(dest)) {
      if (fs.statSync(src).isDirectory() && fs.statSync(dest).isDirectory()) moveLeftovers(src, dest);
      continue;
    }
    fs.renameSync(src, dest);
  }
  if (fs.readdirSync(from).length === 0) fs.rmdirSync(from);
}

function moveDirectory(ctx, inGit) {
  const from = path.join(ctx.projectRoot, OLD_DIR);
  const to = path.join(ctx.projectRoot, NEW_DIR);
  if (inGit) {
    const tracked = git(ctx, ['ls-files', '-z', '--', OLD_DIR]);
    if (tracked.status !== 0) throw new Error(`git ls-files failed: ${tracked.err || tracked.status}`);
    if (tracked.out.length > 0) {
      const r = git(ctx, ['mv', '--', OLD_DIR, NEW_DIR]);
      if (r.status !== 0) throw new Error(`git mv ${OLD_DIR} ${NEW_DIR} failed: ${r.err || r.status}`);
      moveLeftovers(from, to);
      return 'git mv';
    }
  }
  fs.renameSync(from, to);
  return 'rename';
}

// ─── apply ──────────────────────────────────────────────────────────────────────

function apply(ctx) {
  const root = ctx.projectRoot;
  if (!fs.existsSync(path.join(root, OLD_DIR)) && !fs.existsSync(path.join(root, NEW_DIR))) {
    return { changed: [], notes: `no ${OLD_DIR}/ directory: nothing to move` };
  }
  const inGit = isWorkTree(ctx);
  const wait = deferral(ctx, inGit);
  if (wait) return { changed: [], deferred: wait.code, notes: wait.notes };

  // Plan every write first (a malformed 0010 block throws here, before anything is touched).
  const gitignorePath = path.join(root, GITIGNORE_REL);
  const gitignoreBefore = inGit ? readOrNull(gitignorePath) : null;
  const gi = plannedGitignore(gitignoreBefore);
  const excludePath = inGit ? infoExcludePath(ctx) : null;
  const excludeBefore = excludePath ? readOrNull(excludePath) : null;
  const ex = excludeBefore === null ? { text: null, added: [] } : withCounterparts(excludeBefore);

  const gitignoreChanged = gi.text !== null && gi.text !== gitignoreBefore;
  const changed = [NEW_DIR, OLD_DIR, ...(gitignoreChanged ? [GITIGNORE_REL] : [])].sort();
  const noteParts = (via, backup) => [
    `moved ${OLD_DIR}/ to ${NEW_DIR}/ (${via})`,
    gi.block ? `rewrote the store .gitignore block (AOForge markers, both directory names)` : null,
    gi.added.length ? `.gitignore: added ${gi.added.join(', ')}` : null,
    ex.added.length ? `info/exclude: added ${ex.added.join(', ')}` : null,
    backup ? `backup: ${backup}` : null,
  ].filter(Boolean).join('; ');

  if (ctx.dryRun) {
    return { changed, dryRun: true, notes: noteParts(inGit ? 'git mv' : 'rename', null) };
  }

  const backup = upgrade.backup({ projectRoot: root, userHome: ctx.userHome });
  if (gitignoreBefore !== null) fs.writeFileSync(path.join(backup, '0012-gitignore.before'), gitignoreBefore);
  if (excludeBefore !== null) fs.writeFileSync(path.join(backup, '0012-info-exclude.before'), excludeBefore);

  // The store block lands before the move, so the moved cache is never unignored.
  if (gi.block) fs.writeFileSync(gitignorePath, lazy0010().upsertBlock(gitignoreBefore));
  const via = moveDirectory(ctx, inGit);
  if (gitignoreChanged) fs.writeFileSync(gitignorePath, gi.text);
  if (ex.added.length) fs.writeFileSync(excludePath, ex.text);

  return { changed, notes: noteParts(via, backup), backup, moved: { from: OLD_DIR, to: NEW_DIR, via } };
}

module.exports = {
  id: '0012',
  title: `Move the legacy planning directory to ${NEW_DIR}/`,
  since: '3.0.0',
  safety: 'auto',
  detect,
  apply,
  counterpart,
};
