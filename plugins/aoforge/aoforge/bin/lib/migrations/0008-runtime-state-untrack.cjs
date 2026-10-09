'use strict';

// Migration 0008 — runtime-state-untrack (TRD 44-06, AUT-05).
//
// AOForge hooks write two runtime-state files inside `.aoforge/`: guard-no-progress.js rewrites
// the progress-guard file on EVERY tool call, and awareness-cache-populate.js refreshes the
// awareness cache at session start. Several repos committed them before they were ignored, so they
// show as modified in nearly every session and trip dirty-tree refusals (44-EVIDENCE DF-10). This
// migration makes the project's own `.gitignore` cover both files and removes any tracked copy
// from the INDEX ONLY (`git rm --cached`). The working files are live state for running hooks and
// are never deleted, moved or rewritten.
//
// Applicability is deliberately narrow: only when one of the files is tracked, or exists on disk
// without being ignored. A project that has neither file is left alone even if `.gitignore` lacks
// the entries — otherwise every git fixture in the upgrade/adopt suites would grow a `.gitignore`.
//
// "Already ignored" is decided by `git check-ignore --no-index`, never by string-matching
// `.gitignore` lines, so a `.aoforge/` rule or a glob counts (the 42-14 D5 lesson). The user's
// global excludes file is switched off for that check: a personal ignore hides the file on one
// machine only, and the fix belongs in the repository.
//
// Committing the result has a trap of its own: a pathspec commit re-stages each listed path from
// the working tree, which would re-track a file that was just `rm --cached`. `aof-tools commit`
// handles staged removals explicitly (lib/misc.cjs cmdCommit), and upgrade-project.js commits
// these paths even though they were dirty before the upgrade (they land as deletions only).
//
// Nested coverage (TRD 45-02, DOC-02). The root `.aoforge/` is not the only one: aodex also tracks
// `flutter/.aoforge/.progress-guard.json`, which a root-only migration never saw. Discovery now
// covers `**/.aoforge/<name>` at any depth, and it goes through git pathspecs
// (`:(glob)**/.aoforge/<name>` for tracked files, the same with `--others` for untracked ones)
// rather than a filesystem walk. Git skips nested repositories and submodules on its own, so a
// foreign checkout's files are never touched, and there is no hand-rolled recursion to get wrong.
// `discover(ctx)` is exported for the doctor (45-06), which needs the same view. Nested paths are
// ignored through `**/.aoforge/<name>` entries (a pattern with a slash in the middle is anchored to
// its .gitignore's directory, so the root-form entry cannot cover them). Root paths keep their
// root-form entries so every existing project's .gitignore comes out byte-for-byte as before.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { planningRel, PLANNING_DIR_NAMES, isPlanningDirName } = require('../compat.cjs');

const RUNTIME_STATE_BASENAMES = ['.progress-guard.json', '.awareness-cache.json'];
// The default-layout root paths (exported for callers that name them). The migration itself covers the root copies
// under the project's resolved planning directory (rootRuntimeFiles), and finds nested copies under either name.
const RUNTIME_STATE_FILES = RUNTIME_STATE_BASENAMES.map((b) => `.aoforge/${b}`);
// `**/` matches zero or more directories, so these also match the root copies. The literal root
// paths ride along anyway: they make the root answer independent of glob semantics.
const GLOB_PATHSPECS = PLANNING_DIR_NAMES.flatMap((d) => RUNTIME_STATE_BASENAMES.map((b) => `:(glob)**/${d}/${b}`));
const ALL_ROOT_FILES = PLANNING_DIR_NAMES.flatMap((d) => RUNTIME_STATE_BASENAMES.map((b) => `${d}/${b}`));
const LIST_PATHSPECS = [...ALL_ROOT_FILES, ...GLOB_PATHSPECS];

/** The root runtime-state paths under the project's resolved planning directory (`.aoforge/`, or a legacy one). */
function rootRuntimeFiles(root) {
  return RUNTIME_STATE_BASENAMES.map((b) => planningRel(root, b));
}
const GITIGNORE_REL = '.gitignore';
const HEADER = '# AOForge runtime state (migration 0008)';

// Env vars that would point git at some OTHER repository than ctx.projectRoot (e.g. when an
// upgrade runs from inside a git hook). The migration only ever operates on ctx.projectRoot.
const GIT_REDIRECT_VARS = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_NAMESPACE',
];

function gitEnv() {
  const env = { ...process.env };
  for (const key of GIT_REDIRECT_VARS) delete env[key];
  return env;
}

function git(ctx, args, input) {
  const r = spawnSync('git', args, {
    cwd: ctx.projectRoot,
    env: gitEnv(),
    input: input === undefined ? '' : input,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return { status: r.status, out: r.stdout || '', err: (r.stderr || '').trim(), error: r.error };
}

function splitZ(text) {
  return text.split('\0').filter(Boolean);
}

function isWorkTree(ctx) {
  const r = git(ctx, ['rev-parse', '--is-inside-work-tree']);
  return r.status === 0 && r.out.trim() === 'true';
}

/**
 * True for `<anything>/<planning dir>/<runtime-state basename>` at any depth, root included, under either name. Purely
 * lexical, on a project-relative posix path; whether git tracks or ignores it is a separate question.
 */
function isRuntimeStatePath(rel) {
  if (typeof rel !== 'string') return false;
  const segments = rel.split('/');
  const n = segments.length;
  return n >= 2 && isPlanningDirName(segments[n - 2]) && RUNTIME_STATE_BASENAMES.includes(segments[n - 1]);
}

function uniqueSorted(paths) {
  return [...new Set(paths)].sort();
}

/**
 * One spawn: runtime-state files git knows about at any depth, project-relative posix, sorted.
 * `others: false` lists the index; `others: true` lists untracked files INCLUDING ignored ones (no
 * `--exclude-standard`), because "is it ignored" is decided later by check-ignore, with the user's
 * global excludes switched off. If a git build rejects the glob pathspec, fall back to listing
 * everything and filtering here — slower, same answer.
 */
function listRuntimeFiles(ctx, { others }) {
  const base = ['ls-files', '-z', ...(others ? ['--others'] : [])];
  let r = git(ctx, [...base, '--', ...LIST_PATHSPECS]);
  if (r.status !== 0) r = git(ctx, base);
  if (r.status !== 0) throw new Error(`git ls-files failed: ${r.err || r.status}`);
  return uniqueSorted(splitZ(r.out).filter(isRuntimeStatePath));
}

/**
 * One spawn: which of `paths` an ignore rule covers, ignoring the index (so a tracked file still
 * reports its rule) and ignoring the user's global excludes file. check-ignore exits 1 when
 * nothing matches — that is a normal answer, not a failure.
 */
function ignoredSet(ctx, paths) {
  if (paths.length === 0) return new Set();
  const r = git(ctx, ['-c', `core.excludesFile=${os.devNull}`, 'check-ignore', '--no-index', '--stdin', '-z'],
    paths.map((p) => `${p}\0`).join(''));
  if (r.status !== 0 && r.status !== 1) throw new Error(`git check-ignore failed: ${r.err || r.status}`);
  return new Set(splitZ(r.out));
}

/**
 * The runtime-state files at every depth, assuming ctx is a git work tree:
 *   tracked    in the index
 *   present    on disk — tracked files that still exist, plus untracked ones (ignored or not)
 *   unignored  present, untracked, and covered by no ignore rule (check-ignore, global excludes off)
 * All three are project-relative posix paths, sorted and deduped.
 */
function discoverInWorkTree(ctx) {
  const tracked = listRuntimeFiles(ctx, { others: false });
  const untracked = listRuntimeFiles(ctx, { others: true });
  const trackedOnDisk = tracked.filter((rel) => fs.existsSync(path.join(ctx.projectRoot, rel)));
  const present = uniqueSorted([...trackedOnDisk, ...untracked]);
  const ignored = ignoredSet(ctx, present);
  const trackedSet = new Set(tracked);
  const unignored = present.filter((rel) => !trackedSet.has(rel) && !ignored.has(rel));
  return { tracked, present, unignored };
}

/** Public (the doctor's contract). A directory that is not a git work tree has nothing to find. */
function discover(ctx) {
  if (!isWorkTree(ctx)) return { tracked: [], present: [], unignored: [] };
  return discoverInWorkTree(ctx);
}

// ─── detect / apply ─────────────────────────────────────────────────────────────

function detect(ctx) {
  if (!isWorkTree(ctx)) return { applies: false, reason: 'not a git work tree' };
  const { tracked, unignored } = discoverInWorkTree(ctx);

  if (tracked.length === 0 && unignored.length === 0) {
    return { applies: false, reason: 'no runtime state file is tracked or present without an ignore rule' };
  }
  const parts = [];
  if (tracked.length) parts.push(`tracked: ${tracked.join(', ')}`);
  if (unignored.length) parts.push(`present and not ignored: ${unignored.join(', ')}`);
  return { applies: true, reason: parts.join('; ') };
}

/** `content` with `entries` appended under the 0008 header, newline-safe. */
function appendEntries(content, entries) {
  const sep = content === '' ? '' : content.endsWith('\n') ? '\n' : '\n\n';
  return `${content}${sep}${HEADER}\n${entries.join('\n')}\n`;
}

/**
 * The .gitignore line that covers `rel`: the literal root path, or the any-depth form for nested ones, under the
 * planning-directory name the path itself uses.
 */
function ignoreEntryFor(rel, rootFiles) {
  if (rootFiles.includes(rel)) return rel;
  const segments = rel.split('/');
  return `**/${segments[segments.length - 2]}/${path.posix.basename(rel)}`;
}

function apply(ctx) {
  if (!isWorkTree(ctx)) return { changed: [], notes: 'not a git work tree' };

  const found = discoverInWorkTree(ctx);
  const tracked = found.tracked;
  // The two root paths always need cover (as before); every nested path git found needs it too.
  const rootFiles = rootRuntimeFiles(ctx.projectRoot);
  const discovered = uniqueSorted([...tracked, ...found.present]).filter((rel) => !rootFiles.includes(rel));
  const needs = [...rootFiles, ...discovered];
  const ignored = ignoredSet(ctx, needs);
  const missing = needs.filter((rel) => !ignored.has(rel));
  const entries = [...new Set(missing.map((rel) => ignoreEntryFor(rel, rootFiles)))];
  const changed = [];

  if (entries.length) {
    const gitignorePath = path.join(ctx.projectRoot, GITIGNORE_REL);
    const current = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
    if (!ctx.dryRun) fs.writeFileSync(gitignorePath, appendEntries(current, entries));
    changed.push(GITIGNORE_REL);
  }

  if (tracked.length && !ctx.dryRun) {
    // --force: when the index holds a staged copy that differs from both HEAD and the working file
    // (routine for a file a hook rewrites after `git add .aoforge/`), plain `rm --cached` refuses.
    // With --cached, --force only drops that INDEX entry; the working file is never touched.
    // --literal-pathspecs: these are exact paths git itself listed, so a directory name containing
    // glob characters must not be re-read as a pattern.
    const r = git(ctx, ['--literal-pathspecs', 'rm', '--cached', '--force', '--quiet', '--', ...tracked]);
    if (r.status !== 0) throw new Error(`git rm --cached failed: ${r.err || r.status}`);
  }
  changed.push(...[...tracked].sort());

  const notes = [
    entries.length ? `ignored: ${entries.join(', ')}` : 'ignore rules already present',
    `untracked: ${tracked.length ? tracked.join(', ') : 'none'}`,
  ].join('; ');
  return { changed, notes };
}

module.exports = {
  id: '0008',
  title: 'Gitignore and untrack AOForge runtime state files',
  since: '2.12.0',
  safety: 'auto',
  detect,
  apply,
  discover,
  isRuntimeStatePath,
  RUNTIME_STATE_FILES,
  RUNTIME_STATE_BASENAMES,
};
