'use strict';

// Migration 0008 — runtime-state-untrack (TRD 44-06, AUT-05).
//
// DevFlow hooks write two runtime-state files inside `.planning/`: guard-no-progress.js rewrites
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
// `.gitignore` lines, so a `.planning/` rule or a glob counts (the 42-14 D5 lesson). The user's
// global excludes file is switched off for that check: a personal ignore hides the file on one
// machine only, and the fix belongs in the repository.
//
// Committing the result has a trap of its own: a pathspec commit re-stages each listed path from
// the working tree, which would re-track a file that was just `rm --cached`. `df-tools commit`
// handles staged removals explicitly (lib/misc.cjs cmdCommit), and upgrade-project.js commits
// these paths even though they were dirty before the upgrade (they land as deletions only).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RUNTIME_STATE_FILES = ['.planning/.progress-guard.json', '.planning/.awareness-cache.json'];
const GITIGNORE_REL = '.gitignore';
const HEADER = '# DevFlow runtime state (migration 0008)';

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

/** One spawn: which runtime-state files are in the index. Paths come back project-relative. */
function trackedFiles(ctx) {
  const r = git(ctx, ['ls-files', '-z', '--', ...RUNTIME_STATE_FILES]);
  if (r.status !== 0) throw new Error(`git ls-files failed: ${r.err || r.status}`);
  const listed = new Set(splitZ(r.out));
  return RUNTIME_STATE_FILES.filter((rel) => listed.has(rel));
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

function presentOnDisk(ctx) {
  return RUNTIME_STATE_FILES.filter((rel) => fs.existsSync(path.join(ctx.projectRoot, rel)));
}

// ─── detect / apply ─────────────────────────────────────────────────────────────

function detect(ctx) {
  if (!isWorkTree(ctx)) return { applies: false, reason: 'not a git work tree' };
  const tracked = trackedFiles(ctx);
  const present = presentOnDisk(ctx);
  const ignored = ignoredSet(ctx, present);
  const unignored = present.filter((rel) => !tracked.includes(rel) && !ignored.has(rel));

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

function apply(ctx) {
  if (!isWorkTree(ctx)) return { changed: [], notes: 'not a git work tree' };

  const tracked = trackedFiles(ctx);
  const ignored = ignoredSet(ctx, RUNTIME_STATE_FILES);
  const missing = RUNTIME_STATE_FILES.filter((rel) => !ignored.has(rel));
  const changed = [];

  if (missing.length) {
    const gitignorePath = path.join(ctx.projectRoot, GITIGNORE_REL);
    const current = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
    if (!ctx.dryRun) fs.writeFileSync(gitignorePath, appendEntries(current, missing));
    changed.push(GITIGNORE_REL);
  }

  if (tracked.length && !ctx.dryRun) {
    // --force: when the index holds a staged copy that differs from both HEAD and the working file
    // (routine for a file a hook rewrites after `git add .planning/`), plain `rm --cached` refuses.
    // With --cached, --force only drops that INDEX entry; the working file is never touched.
    const r = git(ctx, ['rm', '--cached', '--force', '--quiet', '--', ...tracked]);
    if (r.status !== 0) throw new Error(`git rm --cached failed: ${r.err || r.status}`);
  }
  changed.push(...[...tracked].sort());

  const notes = [
    missing.length ? `ignored: ${missing.join(', ')}` : 'ignore rules already present',
    `untracked: ${tracked.length ? tracked.join(', ') : 'none'}`,
  ].join('; ');
  return { changed, notes };
}

module.exports = {
  id: '0008',
  title: 'Gitignore and untrack DevFlow runtime state files',
  since: '2.12.0',
  safety: 'auto',
  detect,
  apply,
  RUNTIME_STATE_FILES,
};
