'use strict';

/**
 * planning-mode.cjs — the planning-write mode switch (objective 48, D-01) and main-checkout resolution (D-14).
 *
 * Mode is `store` iff the MAIN checkout's `.planning/config.json` has `github.enabled === true && github.store === true`
 * (strict booleans: the string "true" is not enough). Every other config, a missing config, or malformed JSON is `local`.
 *
 * INVARIANT (D-01): `local` is today's behaviour. In local mode every verb writes the same `.planning/` file, at the same path,
 * with the same bytes as before objective 48; `.planning/` stays tracked; the edit gate's cache deny is inactive.
 *
 * This module is the ONLY reader of `github.store` for planning-write decisions. `gh.cjs storeEnabled` keeps serving the
 * sync path; nothing else in the planning-* modules reads the key.
 *
 * Hook-safe: requires only fs, path and os, never spawns git. The edit gate calls it on every Edit/Write, so the worktree
 * resolution parses the `.git` file and `commondir` by hand and fails open (to the nearest `.planning/`) on anything odd.
 */

const fs = require('fs');
const path = require('path');

const LOCAL = 'local';
const STORE = 'store';

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function statOrNull(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

function lstatOrNull(p) {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

function isDir(p) {
  const st = statOrNull(p);
  return !!st && st.isDirectory();
}

function realOrResolved(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

// ─── config ───────────────────────────────────────────────────────────────────

/** `{config, problem}`: the parsed object, or null with the reason it is unusable. Never throws. */
function loadConfig(root) {
  let text;
  try {
    text = fs.readFileSync(path.join(root, '.planning', 'config.json'), 'utf8');
  } catch {
    return { config: null, problem: 'no .planning/config.json' };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { config: null, problem: '.planning/config.json is not valid JSON' };
  }
  if (!isPlainObject(parsed)) return { config: null, problem: '.planning/config.json is not a JSON object' };
  return { config: parsed, problem: null };
}

/**
 * The parsed `.planning/config.json` of `root` (taken as given, not resolved), or null when it is missing, malformed or not
 * a JSON object. Never throws.
 */
function readPlanningConfig(root) {
  if (typeof root !== 'string' || root === '') return null;
  return loadConfig(root).config;
}

// ─── main checkout ────────────────────────────────────────────────────────────

/** The nearest ancestor of `start` (inclusive) holding a `.git` entry, with its lstat; null when none. */
function findGitHolder(start) {
  let dir = path.resolve(start);
  for (;;) {
    const st = lstatOrNull(path.join(dir, '.git'));
    if (st) return { dir, st };
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The nearest ancestor of `start` (inclusive) with a `.planning/` directory; null when none. */
function nearestPlanningRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (isDir(path.join(dir, '.planning'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const WORKTREE_GITDIR_RE = /[\\/]\.git[\\/]worktrees[\\/][^\\/]+[\\/]?$/;

/**
 * The checkout root that owns the `.git` FILE in `holder`. A linked worktree's file reads
 * `gitdir: <main>/.git/worktrees/<id>`; `<gitdir>/commondir` (relative to gitdir, usually `../..`) names the common
 * `.git`, whose parent is the main checkout. Older git without `commondir`: when gitdir has the
 * `<main>/.git/worktrees/<id>` shape, `<main>` is three levels up. Anything else (a submodule's `.git/modules/<name>`,
 * an unreadable pointer) is not a linked worktree, so the holder itself is the root.
 */
function rootFromGitFile(holder) {
  let raw;
  try {
    raw = fs.readFileSync(path.join(holder, '.git'), 'utf8');
  } catch {
    return holder;
  }
  const m = /^gitdir:\s*(.+?)\s*$/m.exec(String(raw));
  if (!m) return holder;
  const gitdir = path.resolve(holder, m[1]);

  let common = null;
  try {
    const rel = fs.readFileSync(path.join(gitdir, 'commondir'), 'utf8').trim();
    if (rel) common = path.resolve(gitdir, rel);
  } catch {
    common = null;
  }
  if (common) {
    // A worktree's gitdir lives under the common dir; a submodule's never has a commondir file.
    return path.dirname(common);
  }
  if (WORKTREE_GITDIR_RE.test(gitdir)) return path.dirname(path.dirname(path.dirname(gitdir)));
  return holder;
}

/**
 * The MAIN checkout root for `cwd`, realpath'd, or null.
 *
 * Walk up to the first dir with `.git`. A `.git` directory: that dir is the root. A `.git` file: resolve the linked
 * worktree's main checkout (see rootFromGitFile). Prefer that root when it has `.planning/`; otherwise fall back to the
 * nearest ancestor of `cwd` with `.planning/`; otherwise null. Never spawns git, never throws.
 *
 * Compatible with hooks/gate-edits.js `sharedPlanningDir` (TRD 27-01) for ordinary worktrees.
 */
function resolveMainRoot(cwd) {
  const start = typeof cwd === 'string' && cwd !== '' ? cwd : process.cwd();
  let candidate = null;
  try {
    const holder = findGitHolder(start);
    if (holder) candidate = holder.st.isDirectory() ? holder.dir : rootFromGitFile(holder.dir);
  } catch {
    candidate = null;
  }
  if (candidate && isDir(path.join(candidate, '.planning'))) return realOrResolved(candidate);

  const nearest = nearestPlanningRoot(start);
  return nearest ? realOrResolved(nearest) : null;
}

// ─── mode ─────────────────────────────────────────────────────────────────────

/**
 * `{mode: 'local'|'store', reason, root}` for any cwd inside a project. Resolves the MAIN checkout first, so a linked
 * worktree's own config never decides the mode. `root` is the resolved main root (null when there is no `.planning/`).
 */
function planningMode(cwdOrRoot) {
  const root = resolveMainRoot(cwdOrRoot);
  if (!root) return { mode: LOCAL, reason: 'no .planning/ directory', root: null };

  const { config, problem } = loadConfig(root);
  if (!config) return { mode: LOCAL, reason: problem, root };

  const gh = config.github;
  if (!isPlainObject(gh)) return { mode: LOCAL, reason: 'no github block in .planning/config.json', root };
  if (gh.enabled !== true) return { mode: LOCAL, reason: 'github.enabled is not true', root };
  if (gh.store !== true) return { mode: LOCAL, reason: 'github.store is not true', root };
  return { mode: STORE, reason: 'github.enabled and github.store are true', root };
}

/** `planningMode(cwdOrRoot).mode === 'store'`. */
function isStoreMode(cwdOrRoot) {
  return planningMode(cwdOrRoot).mode === STORE;
}

module.exports = {
  LOCAL,
  STORE,
  readPlanningConfig,
  planningMode,
  isStoreMode,
  resolveMainRoot,
};
