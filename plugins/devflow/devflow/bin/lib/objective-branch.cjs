'use strict';

// objective-branch.cjs (TRD 49-04) — the one git seam for the objective branch / PR lifecycle (objective 49):
// fetch, switch, empty start commit, push, local cleanup.
//
// `git` is spawned ONLY through `runGit` below (argv array, never a shell string). `_setRunGit(fn)` replaces it
// for tests; `_resetRunGit()` (or `_setRunGit(null)`) restores it. This module never calls `gh` and never
// requires the GitHub client: every GitHub write goes through the outbox. The seam guard
// (gh-seam.repo.test.cjs, test 20) names this file as a git site by name, with a reason.
//
// Every function returns `{ok:true, ...}` or `{ok:false, error, stderr}`; none throws for a git failure.
// The seam reports facts and does what it is told; deciding whether a force delete is safe is the caller's job
// (after a squash merge every objective/exec branch is "unmerged" to git, so `deleteLocal` takes `{force}`).
// What it does refuse outright: deleting the current branch or the default branch, a dirty tracked tree
// before a switch, and any branch name that is not a plain ref name.

const { spawnSync } = require('child_process');
const fs = require('fs');

const GIT_SITE = 'objective-branch';
const REMOTE = 'origin';
const GIT_TIMEOUT_MS = 120000;
// Never deleted, whatever origin/HEAD says (it may be unset in a fresh clone).
const PROTECTED_DEFAULTS = ['main', 'master'];

// ─── The git seam ─────────────────────────────────────────────────────────────

/**
 * Run one git command. Never throws; always `{ok, status, stdout, stderr}` (output is NOT trimmed).
 * argv is an array (no shell). `opts = {cwd, env, timeout}`; env is `process.env` + `GIT_TERMINAL_PROMPT=0` + opts.env.
 */
function realRunGit(args, opts = {}) {
  const cwd = opts.cwd;
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', ...(opts.env || {}) };
  const r = spawnSync('git', args, {
    cwd,
    env,
    encoding: 'utf-8',
    timeout: opts.timeout || GIT_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) {
    if (r.error.code === 'ENOENT') {
      // A missing cwd also surfaces as ENOENT; do not blame git for it.
      if (cwd && !fs.existsSync(cwd)) {
        return { ok: false, status: null, stdout: '', stderr: `working directory does not exist: ${cwd}` };
      }
      return { ok: false, status: null, stdout: '', stderr: 'git: command not found' };
    }
    if (r.error.code === 'ETIMEDOUT') {
      return { ok: false, status: null, stdout: r.stdout || '', stderr: 'git: timed out' };
    }
    return { ok: false, status: null, stdout: r.stdout || '', stderr: String(r.error.message || r.error) };
  }
  return { ok: r.status === 0, status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

let runGitImpl = realRunGit;

/** Replace the git runner (tests); `_setRunGit(null)` restores the real one. */
function _setRunGit(fn) {
  runGitImpl = typeof fn === 'function' ? fn : realRunGit;
}

/** Restore the real git runner. */
function _resetRunGit() {
  runGitImpl = realRunGit;
}

/** One git call in the checkout at `root`. */
function git(root, args) {
  return runGitImpl(args, { cwd: root });
}

// ─── Results and validation ───────────────────────────────────────────────────

/** `{ok:false, error, stderr}` from a failed git result. */
function fail(r, fallback) {
  const stderr = String(r.stderr || '');
  const error = stderr.trim() || String(r.stdout || '').trim() || fallback || `git exited ${r.status}`;
  return { ok: false, error, stderr };
}

function bad(error) {
  return { ok: false, error, stderr: '' };
}

/** A plain ref name: no leading dash or dot-dot (argument injection, range syntax), no spaces, no `.lock`. */
function validBranch(name) {
  return typeof name === 'string'
    && /^[A-Za-z0-9_][A-Za-z0-9._/-]*$/.test(name)
    && name.length <= 255
    && !name.includes('..')
    && !name.includes('//')
    && !name.endsWith('/')
    && !name.endsWith('.')
    && !name.endsWith('.lock');
}

function branchError(name) {
  return bad(`invalid branch name: ${typeof name === 'string' ? JSON.stringify(name) : String(name)}`);
}

/** A sha, branch or ref given to a rev-taking call; the tip functions' `{ok, sha}` results are accepted too. */
function asRev(x) {
  if (x && typeof x === 'object' && 'sha' in x) return x.sha;
  return x;
}

function validRev(x) {
  return typeof x === 'string' && x !== '' && !x.startsWith('-') && !/[\s\x00-\x1f]/.test(x);
}

// ─── Reads ────────────────────────────────────────────────────────────────────

/** The checked-out branch: `{ok:true, branch, detached}`; `branch` is null for a detached HEAD. */
function currentBranch(root) {
  const r = git(root, ['branch', '--show-current']);
  if (!r.ok) return fail(r);
  const branch = r.stdout.trim();
  return { ok: true, branch: branch === '' ? null : branch, detached: branch === '' };
}

/** HEAD's sha: `{ok:true, sha}`. */
function headSha(root) {
  const r = git(root, ['rev-parse', 'HEAD']);
  const sha = r.stdout.trim();
  if (!r.ok || sha === '') return fail(r, 'could not resolve HEAD');
  return { ok: true, sha };
}

/** The local branch's tip: `{ok:true, sha}`, or `{ok:true, sha:null}` when there is no such local branch. */
function branchTip(root, branch) {
  if (!validBranch(branch)) return branchError(branch);
  const r = git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}^{commit}`]);
  if (r.ok && r.stdout.trim() !== '') return { ok: true, sha: r.stdout.trim() };
  if (r.status === 1) return { ok: true, sha: null };
  return fail(r);
}

/** origin's tip for `branch` (asks the remote): `{ok:true, sha}`, or `{ok:true, sha:null}` when origin lacks it. */
function remoteTip(root, branch) {
  if (!validBranch(branch)) return branchError(branch);
  const ref = `refs/heads/${branch}`;
  const r = git(root, ['ls-remote', '--heads', REMOTE, ref]);
  if (!r.ok) return fail(r);
  for (const line of r.stdout.split('\n')) {
    const [sha, name] = line.trim().split(/\s+/);
    if (name === ref && sha) return { ok: true, sha };
  }
  return { ok: true, sha: null };
}

/** The remote-tracking tip already fetched locally (`refs/remotes/origin/<branch>`), or null. Does not ask the remote. */
function trackingTip(root, branch) {
  const r = git(root, ['rev-parse', '--verify', '--quiet', `refs/remotes/${REMOTE}/${branch}^{commit}`]);
  if (r.ok && r.stdout.trim() !== '') return { ok: true, sha: r.stdout.trim() };
  if (r.status === 1) return { ok: true, sha: null };
  return fail(r);
}

/**
 * Tracked files with uncommitted changes (`status --porcelain --untracked-files=no`): untracked files never
 * count, because in store mode `.planning/` is a gitignored cache. `{ok:true, clean, files}`.
 */
function isTrackedClean(root) {
  const r = git(root, ['status', '--porcelain', '-z', '--untracked-files=no']);
  if (!r.ok) return fail(r);
  const entries = r.stdout.split('\0').filter((e) => e !== '');
  const files = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    files.push(entry.slice(3));
    // a rename or copy carries its source path as the next NUL-separated field
    if (/^[RC]/.test(entry) || /^.[RC]/.test(entry)) i += 1;
  }
  return { ok: true, clean: files.length === 0, files };
}

/** Is `commit` an ancestor of `of`? `{ok:true, ancestor}`; exit 1 is "no", any other failure is ok:false. */
function isAncestor(root, commit, of) {
  const c = asRev(commit);
  const o = asRev(of);
  if (!validRev(c) || !validRev(o)) return bad(`isAncestor needs two revisions, got ${JSON.stringify(c)} and ${JSON.stringify(o)}`);
  const r = git(root, ['merge-base', '--is-ancestor', c, o]);
  if (r.status === 0) return { ok: true, ancestor: true };
  if (r.status === 1) return { ok: true, ancestor: false };
  return fail(r, `git merge-base --is-ancestor exited ${r.status}`);
}

/** Local branches matching a glob (default all): `{ok:true, branches}`. */
function listLocal(root, pattern) {
  const args = ['branch', '--list', '--format=%(refname:short)'];
  if (pattern !== undefined && pattern !== null && pattern !== '') {
    if (typeof pattern !== 'string' || pattern.startsWith('-')) return bad(`invalid branch pattern: ${String(pattern)}`);
    args.push(pattern);
  }
  const r = git(root, args);
  if (!r.ok) return fail(r);
  const branches = r.stdout.split('\n').map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('('));
  return { ok: true, branches };
}

/**
 * The default branch: what origin/HEAD points at (`source:'origin-head'`), else the first of main / master that
 * exists locally (`source:'fallback'`), else `branch:null`.
 */
function defaultBranch(root) {
  const r = git(root, ['symbolic-ref', '--quiet', '--short', `refs/remotes/${REMOTE}/HEAD`]);
  const ref = r.stdout.trim();
  if (r.ok && ref.startsWith(`${REMOTE}/`)) return { ok: true, branch: ref.slice(REMOTE.length + 1), source: 'origin-head' };
  for (const name of PROTECTED_DEFAULTS) {
    const t = branchTip(root, name);
    if (t.ok && t.sha) return { ok: true, branch: name, source: 'fallback' };
  }
  return { ok: true, branch: null, source: 'none' };
}

// ─── Writes ───────────────────────────────────────────────────────────────────

/**
 * Fetch one branch into its remote-tracking ref (`+refs/heads/<b>:refs/remotes/origin/<b>`), explicitly, so it
 * works in a single-branch clone too. `{ok:true, branch}`.
 */
function fetchBranch(root, branch) {
  if (!validBranch(branch)) return branchError(branch);
  const r = git(root, ['fetch', REMOTE, `+refs/heads/${branch}:refs/remotes/${REMOTE}/${branch}`]);
  return r.ok ? { ok: true, branch } : fail(r);
}

/**
 * Check out `branch`. Already on it: a no-op. A local branch: `git switch`. Otherwise it is tracked from
 * `origin/<branch>` (fetched first when that ref is missing); the branch is created on GitHub by
 * createLinkedBranch, never here. Refuses when tracked files are modified.
 *   `{ok:true, branch, switched, created}`  |  `{ok:false, error, stderr, dirty?}`
 */
function switchTo(root, branch) {
  if (!validBranch(branch)) return branchError(branch);
  const cur = currentBranch(root);
  if (!cur.ok) return cur;
  if (cur.branch === branch) return { ok: true, branch, switched: false, created: false };

  const clean = isTrackedClean(root);
  if (!clean.ok) return clean;
  if (!clean.clean) {
    return { ok: false, error: `tracked files have uncommitted changes: ${clean.files.join(', ')}`, stderr: '', dirty: clean.files };
  }

  const local = branchTip(root, branch);
  if (!local.ok) return local;
  if (local.sha) {
    const s = git(root, ['switch', branch]);
    return s.ok ? { ok: true, branch, switched: true, created: false } : fail(s);
  }

  const tracked = trackingTip(root, branch);
  if (!tracked.ok) return tracked;
  if (!tracked.sha) {
    const f = fetchBranch(root, branch);
    if (!f.ok) return f;
  }
  const s = git(root, ['switch', '--track', `${REMOTE}/${branch}`]);
  return s.ok ? { ok: true, branch, switched: true, created: true } : fail(s);
}

/**
 * An empty commit with exactly `message` (the caller supplies the `Refs #N` trailer). Refuses when the index
 * holds staged changes, since `--allow-empty` would otherwise commit them. `{ok:true, sha}`.
 */
function startCommit(root, message) {
  if (typeof message !== 'string' || message.trim() === '') return bad('a start commit needs a message');
  const staged = git(root, ['diff', '--cached', '--quiet']);
  if (staged.status === 1) return bad('the index has staged changes; a start commit must be empty');
  if (!staged.ok) return fail(staged);
  const c = git(root, ['commit', '--allow-empty', '-m', message]);
  if (!c.ok) return fail(c);
  return headSha(root);
}

/** Push `branch` to origin (`-u` with `{setUpstream:true}`). Never forces. `{ok:true, branch, setUpstream}`. */
function push(root, branch, opts = {}) {
  if (!validBranch(branch)) return branchError(branch);
  const setUpstream = Boolean(opts && opts.setUpstream);
  const r = git(root, setUpstream ? ['push', '-u', REMOTE, branch] : ['push', REMOTE, branch]);
  return r.ok ? { ok: true, branch, setUpstream } : fail(r);
}

/**
 * Leave the checkout on the default branch, fast-forwarded to origin: fetch, switch (refuses a dirty tracked
 * tree), `merge --ff-only`. `{ok:true, branch, sha, switched, updated}`; a diverged local main is ok:false.
 */
function syncDefault(root, branch) {
  let def = branch;
  if (def === undefined || def === null || def === '') {
    const d = defaultBranch(root);
    if (!d.ok) return d;
    def = d.branch;
    if (!def) return bad('could not determine the default branch');
  }
  if (!validBranch(def)) return branchError(def);

  const f = fetchBranch(root, def);
  if (!f.ok) return f;
  const sw = switchTo(root, def);
  if (!sw.ok) return sw;
  const before = headSha(root);
  if (!before.ok) return before;
  const m = git(root, ['merge', '--ff-only', `${REMOTE}/${def}`]);
  if (!m.ok) return fail(m);
  const after = headSha(root);
  if (!after.ok) return after;
  return { ok: true, branch: def, sha: after.sha, switched: sw.switched, updated: after.sha !== before.sha };
}

/**
 * Delete a local branch: `branch -d` (git refuses an unmerged branch), or `branch -D` with `{force:true}`.
 * Never the current branch and never the default branch (origin/HEAD's, or main / master), force or not.
 * `{ok:true, branch, forced}`.
 */
function deleteLocal(root, branch, opts = {}) {
  if (!validBranch(branch)) return branchError(branch);
  const cur = currentBranch(root);
  if (!cur.ok) return cur;
  if (cur.branch === branch) return bad(`refusing to delete the current branch: ${branch}`);

  const protectedNames = new Set(PROTECTED_DEFAULTS);
  const def = defaultBranch(root);
  if (def.ok && def.branch) protectedNames.add(def.branch);
  if (protectedNames.has(branch)) return bad(`refusing to delete the default branch: ${branch}`);

  const forced = Boolean(opts && opts.force);
  const r = git(root, ['branch', forced ? '-D' : '-d', branch]);
  return r.ok ? { ok: true, branch, forced } : fail(r);
}

module.exports = {
  GIT_SITE,
  REMOTE,
  // seam (forwarding wrapper: later injections are visible to earlier importers)
  runGit: (...a) => runGitImpl(...a),
  realRunGit,
  _setRunGit,
  _resetRunGit,
  // reads
  currentBranch,
  headSha,
  branchTip,
  remoteTip,
  isTrackedClean,
  isAncestor,
  listLocal,
  defaultBranch,
  // writes
  fetchBranch,
  switchTo,
  startCommit,
  push,
  syncDefault,
  deleteLocal,
};
