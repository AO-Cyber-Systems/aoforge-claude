'use strict';

// doctor-git — the DOC-06 safety guard for `df-tools doctor` fixes (TRD 45-06).
//
// A doctor fix that changes the git INDEX (untracking runtime state with `git rm --cached`) must
// never mix with work the user has staged: `df-tools commit` refuses when anything outside
// `--files` is staged, and a whole-index commit would sweep the user's work into the doctor's
// "chore: untrack" commit. So before any index-changing fix, `indexChangeGuard` insists that
// nothing is staged and that `.gitignore` (which the same fix edits) has no uncommitted change.
// Fixes that only touch working files use `worktreeGuard` over the paths they write.
//
// Both guards take `exclude`: the project-relative paths the doctor itself changed earlier in the
// same `--fix` run (ctx.changedThisRun, 45-04 engine). Those are the doctor's own changes, never
// "foreign" work, so a legacy fix's staged removals and .gitignore edit cannot block the
// pending-migrations fix that follows it.
//
// Every git call runs with `cwd: root`, `-z` output, and the GIT_* redirect variables stripped
// (the 0008 pattern), so a doctor run from inside a git hook can only ever look at `root`.
// Read-only apart from `rmCached`, which the legacy fix calls only after `indexChangeGuard` passed.

const os = require('os');
const { spawnSync } = require('child_process');

// Env vars that would point git at some OTHER repository than `root`.
const GIT_REDIRECT_VARS = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_NAMESPACE',
];

function gitEnv(env) {
  const out = { ...(env || process.env) };
  for (const key of GIT_REDIRECT_VARS) delete out[key];
  return out;
}

function git(root, args, opts = {}) {
  const r = spawnSync('git', args, {
    cwd: root,
    env: gitEnv(opts.env),
    input: opts.input || '',
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return { status: r.status, out: r.stdout || '', err: (r.stderr || '').trim(), error: r.error };
}

function splitZ(text) {
  return text.split('\0').filter(Boolean);
}

function uniqueSorted(paths) {
  return [...new Set(paths)].sort();
}

/** exclude: Set | Array | (rel) => boolean | undefined → predicate. */
function toExcluder(exclude) {
  if (typeof exclude === 'function') return exclude;
  if (!exclude) return () => false;
  const set = exclude instanceof Set ? exclude : new Set(Array.from(exclude));
  return (rel) => set.has(rel);
}

/** True when `root` is inside a git work tree. */
function isGitRepo(root, opts = {}) {
  const r = git(root, ['rev-parse', '--is-inside-work-tree'], opts);
  return r.status === 0 && r.out.trim() === 'true';
}

/**
 * lsFiles(root, pathspecs, {others, env}) -> sorted project-relative paths.
 * `others: false` lists the index; `others: true` lists untracked files INCLUDING ignored ones
 * (no --exclude-standard). A non-repo gives [].
 */
function lsFiles(root, pathspecs, opts = {}) {
  if (!isGitRepo(root, opts)) return [];
  const args = ['ls-files', '-z', ...(opts.others ? ['--others'] : []), '--', ...pathspecs];
  const r = git(root, args, opts);
  if (r.status !== 0) throw new Error(`git ls-files failed: ${r.err || r.status}`);
  return uniqueSorted(splitZ(r.out));
}

/**
 * stagedPaths(root) -> sorted paths whose index entry differs from HEAD (adds, modifications,
 * deletes; renames listed as their delete + add). A non-repo gives [].
 */
function stagedPaths(root, opts = {}) {
  if (!isGitRepo(root, opts)) return [];
  const r = git(root, ['diff', '--cached', '--name-only', '--no-renames', '-z'], opts);
  if (r.status !== 0) throw new Error(`git diff --cached failed: ${r.err || r.status}`);
  return uniqueSorted(splitZ(r.out));
}

/**
 * dirtyPaths(root, pathspecs, {untracked, env}) -> sorted paths under `pathspecs` with staged or
 * unstaged changes to tracked files. Untracked files count only with `untracked: true` (their
 * absence from git is not "uncommitted work" in a tracked file). A non-repo gives [].
 */
function dirtyPaths(root, pathspecs, opts = {}) {
  if (!isGitRepo(root, opts)) return [];
  const untracked = opts.untracked ? 'all' : 'no';
  const args = ['status', '--porcelain=v1', '-z', '--no-renames', `--untracked-files=${untracked}`, '--', ...pathspecs];
  const r = git(root, args, opts);
  if (r.status !== 0) throw new Error(`git status failed: ${r.err || r.status}`);
  // Each record is `XY <path>`; --no-renames means there is never a second (origin) path.
  return uniqueSorted(splitZ(r.out).map((rec) => rec.slice(3)).filter(Boolean));
}

/**
 * indexChangeGuard(root, {exclude, env}) -> {ok} | {ok:false, reason}
 * Refuses when any non-excluded path is staged, or `.gitignore` has an uncommitted change
 * (staged, unstaged, or untracked). Outside a git repo an index change is not applicable.
 */
function indexChangeGuard(root, opts = {}) {
  if (!isGitRepo(root, opts)) return { ok: false, reason: 'not a git repository (index changes are not applicable)' };
  const excluded = toExcluder(opts.exclude);
  const staged = stagedPaths(root, opts).filter((p) => !excluded(p));
  if (staged.length) return { ok: false, reason: `staged changes present: ${staged.join(', ')}` };
  const gitignore = dirtyPaths(root, ['.gitignore'], { ...opts, untracked: true }).filter((p) => !excluded(p));
  if (gitignore.length) return { ok: false, reason: '.gitignore has uncommitted changes' };
  return { ok: true };
}

/**
 * worktreeGuard(root, pathspecs, {exclude, env}) -> {ok} | {ok:false, reason}
 * Refuses when a non-excluded path under `pathspecs` has uncommitted changes. Outside a git repo
 * there is nothing to protect against, so worktree fixes may proceed.
 */
function worktreeGuard(root, pathspecs, opts = {}) {
  if (!isGitRepo(root, opts)) return { ok: true };
  const excluded = toExcluder(opts.exclude);
  const dirty = dirtyPaths(root, pathspecs, opts).filter((p) => !excluded(p));
  if (dirty.length) return { ok: false, reason: `uncommitted changes: ${dirty.join(', ')}` };
  return { ok: true };
}

/**
 * checkIgnored(root, paths, {env}) -> Set of the `paths` an ignore rule of THIS repository covers
 * (project-relative posix paths in, the same strings out). Two switches decide what "ignored" means:
 * `--no-index` ignores the index, so a TRACKED file still reports the rule that would ignore it (the
 * question is whether untracking it keeps it out), and `core.excludesFile` is pointed at the null
 * device so the user's global excludes never answer for the repository (the 42-14 D5 lesson in
 * migration 0008's header: a rule only on this machine protects nobody else's clone). check-ignore
 * exits 1 when nothing matches; that is a normal answer. Callers check `isGitRepo` first.
 */
function checkIgnored(root, paths, opts = {}) {
  if (!paths.length) return new Set();
  const r = git(root, ['-c', `core.excludesFile=${os.devNull}`, 'check-ignore', '--no-index', '--stdin', '-z'], {
    ...opts,
    input: paths.map((p) => `${p}\0`).join(''),
  });
  if (r.status !== 0 && r.status !== 1) throw new Error(`git check-ignore failed: ${r.err || r.status}`);
  return new Set(splitZ(r.out));
}

/**
 * rmCached(root, paths) — drop `paths` from the INDEX only. --force: a staged copy that differs
 * from both HEAD and the working file must not make it refuse; with --cached that only drops the
 * index entry. --literal-pathspecs: these are exact paths git listed. Callers guard first.
 */
function rmCached(root, paths, opts = {}) {
  if (!paths.length) return;
  const r = git(root, ['--literal-pathspecs', 'rm', '--cached', '--force', '--quiet', '--', ...paths], opts);
  if (r.status !== 0) throw new Error(`git rm --cached failed: ${r.err || r.status}`);
}

module.exports = {
  GIT_REDIRECT_VARS,
  isGitRepo,
  lsFiles,
  stagedPaths,
  dirtyPaths,
  indexChangeGuard,
  worktreeGuard,
  checkIgnored,
  rmCached,
  toExcluder,
};
