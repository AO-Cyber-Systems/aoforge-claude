'use strict';

/**
 * exec-context.cjs — make a spawn's repository and base EXPLICIT (issue #86).
 *
 * `devflow:executor` used to carry `isolation: worktree` in its frontmatter and
 * let the harness resolve that isolation. The harness resolved both halves
 * implicitly, and both were wrong in a multi-repo programme:
 *
 *   REPO: taken from the controller session's own repo. Dispatching an aodex
 *         objective from /Users/markemerson/Source/aodex-w1c put the first
 *         executor in devflow-claude. Every path it was given pointed into a
 *         repo it could not see — and nothing said so.
 *   BASE: the default branch. Wave 2 of a sequential objective therefore
 *         started from `main` and could not see wave 1's commits, so each wave
 *         re-did or contradicted the last.
 *
 * Nothing here can change the harness. What it can do is remove the need for
 * it: the orchestrator states the repo and the base, and these two commands
 * make the statement checkable.
 *
 *   exec-context check --repo <path> [--base <ref>] [--id <plan_id>]
 *     Proves the current directory is in the named repository (a linked
 *     worktree of it counts) and, with --base, that HEAD contains that commit.
 *     Exits 1 with a specific message otherwise. The executor runs this first;
 *     a wrong-repo spawn stops there instead of writing into the void.
 *
 *     With --id AND --base it also takes an exclusive claim on (checkout, base):
 *     a second executor with a different id in the same checkout for the same
 *     base is refused with SHARED INDEX (issue #98).
 *
 *   exec-context release --repo <path> [--id <slug>]
 *     Clears this checkout's claims (all, or only those held by --id) — for a
 *     claim left behind by a dead executor.
 *
 *   exec-context worktree --repo <path> --id <slug> [--base <ref>] [--path <dir>]
 *     Provisions isolation explicitly, in the NAMED repo, from an EXPLICIT base
 *     that defaults to that repo's current HEAD — never the default branch.
 *     This is the replacement for the frontmatter flag, for when waves run in
 *     parallel and need separate indexes.
 *
 * Repository identity is the git COMMON directory, not the checkout, so a
 * legitimate worktree of the target repo is recognised as the target repo while
 * a genuinely different repository is not.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const { output, error } = require('./helpers.cjs');

// ── git plumbing ─────────────────────────────────────────────────────────────

function git(dir, args) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf-8' });
  return {
    exitCode: r.status === null ? 1 : r.status,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

function realpath(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}

/**
 * The identity of the REPOSITORY a directory belongs to — shared by the main
 * checkout and every linked worktree of it. `--git-common-dir` is `.git` for a
 * normal checkout and the main repo's `.git` for a linked worktree, which is
 * exactly the distinction that matters here.
 *
 * Returns null when `dir` is not inside a git repository.
 */
function repoIdentity(dir) {
  if (!fs.existsSync(dir)) return null;
  const top = git(dir, ['rev-parse', '--show-toplevel']);
  if (top.exitCode !== 0) return null;
  const common = git(dir, ['rev-parse', '--git-common-dir']);
  if (common.exitCode !== 0) return null;
  // `--git-common-dir` may be relative to cwd (".git"); resolve it against dir.
  const commonDir = realpath(path.resolve(dir, common.stdout));
  const gitDir = realpath(path.resolve(dir, git(dir, ['rev-parse', '--git-dir']).stdout));
  return {
    checkout: realpath(top.stdout),
    commonDir,
    // The main checkout is the parent of the common `.git` directory.
    mainRoot: path.basename(commonDir) === '.git' ? path.dirname(commonDir) : commonDir,
    isWorktree: gitDir !== commonDir,
  };
}

function flag(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  const v = args[i + 1];
  // A flag whose value is itself a flag was given no value at all.
  if (v === undefined || v.startsWith('--')) return undefined;
  return v;
}

// ── shared-index claim (issue #98) ───────────────────────────────────────────

const CLAIM_TTL_MS_DEFAULT = 4 * 60 * 60 * 1000;

function claimTtlMs() {
  const n = parseInt(process.env.DEVFLOW_EXEC_CLAIM_TTL_MS, 10);
  return Number.isFinite(n) && n > 0 ? n : CLAIM_TTL_MS_DEFAULT;
}

// Under the git COMMON dir: shared by every linked worktree of the repo, and
// never part of any working tree, so a claim is neither committed nor invisible
// to a sibling standing in another worktree.
function claimDir(identity) {
  return path.join(identity.commonDir, 'devflow-exec-claims');
}

function checkoutKey(identity) {
  // realpath first: macOS reports /var/... and /private/var/... for one dir.
  return crypto.createHash('sha1').update(realpath(identity.checkout)).digest('hex').slice(0, 12);
}

function claimFile(identity, baseSha) {
  return path.join(claimDir(identity), `${checkoutKey(identity)}-${baseSha}.json`);
}

/**
 * Take an exclusive claim on (checkout, base) for plan `id` (issue #98).
 *
 * After #86 removed forced `isolation: worktree`, parallel executors of one wave
 * must each be provisioned with `exec-context worktree`. If the orchestrator
 * skips that, the siblings run in ONE checkout and race on ONE git index — their
 * commits interleave and land under the wrong TRD. The claim makes that path fail:
 *
 *   - parallel siblings of one wave share WAVE_BASE by construction, so a second
 *     id on the same (checkout, base) IS a sibling on a shared index → refused;
 *   - a later sequential wave has a DIFFERENT base (the previous wave's tip), so
 *     it never collides with an earlier wave's claim;
 *   - linked worktrees each have their own checkout key, so correctly isolated
 *     siblings never collide either.
 *
 * `openSync(..., 'wx')` is the atomicity guarantee: exactly one of two racing
 * siblings creates the file. The refresh (same id) and expired-replace paths
 * overwrite — the claim is already ours, or its holder is dead.
 */
function takeClaim(identity, id, baseSha, mainRoot, baseArg) {
  fs.mkdirSync(claimDir(identity), { recursive: true });
  const file = claimFile(identity, baseSha);
  const record = {
    id,
    checkout: identity.checkout,
    base_sha: baseSha,
    claimed_at: new Date().toISOString(),
  };
  const body = JSON.stringify(record, null, 2) + '\n';
  try {
    const fd = fs.openSync(file, 'wx');
    try { fs.writeSync(fd, body); } finally { fs.closeSync(fd); }
    return record;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }

  let existing = null;
  try { existing = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { existing = null; }

  if (existing && existing.id === id) {
    fs.writeFileSync(file, body);
    return record;
  }
  const age = existing ? Date.now() - Date.parse(existing.claimed_at) : Infinity;
  if (existing && Number.isFinite(age) && age < claimTtlMs()) {
    error(
      `SHARED INDEX — another executor already claimed this checkout for this base.\n` +
      `  other id : ${existing.id} (claimed ${existing.claimed_at})\n` +
      `  this id  : ${id}\n` +
      `  checkout : ${identity.checkout}\n` +
      `  base     : ${baseSha} (${baseArg})\n` +
      `Parallel executors of one wave share one git index here: their commits interleave and\n` +
      `land under the wrong TRD. Each parallel TRD needs its own worktree:\n` +
      `  df-tools exec-context worktree --repo ${mainRoot} --id ${id} --base ${baseArg}\n` +
      `If the other executor is dead (stale claim), clear it with:\n` +
      `  df-tools exec-context release --repo ${mainRoot} --id ${existing.id}`
    );
  }
  // Unreadable or expired: its holder is gone.
  fs.writeFileSync(file, body);
  return record;
}

// ── exec-context check ───────────────────────────────────────────────────────

function cmdExecContextCheck(cwd, args, raw) {
  const repoArg = flag(args, '--repo');
  if (repoArg === null || repoArg === undefined) {
    error('exec-context check requires --repo <path> — the repository this spawn is supposed to be working in.\nUsage: df-tools exec-context check --repo <path> [--base <ref>] [--id <plan_id>] [--raw]');
  }
  // Issue #100 finding 3: a relative --repo resolves against the SPAWN's OWN
  // cwd, so `--repo .` compares the repo the spawn is in with the repo the
  // spawn is in and can never fail. A guard that cannot fail is not a guard —
  // the whole point is to prove a claim made ELSEWHERE, by the dispatch.
  if (!path.isAbsolute(repoArg)) {
    error(
      `--repo must be an ABSOLUTE path; got: ${repoArg}\n` +
      `A relative path is resolved against this spawn's own working directory, so the ` +
      `check would compare the repository it is standing in with itself and always pass. ` +
      `Pass the literal absolute path your dispatch named (resolved here: ${path.resolve(cwd, repoArg)}).`
    );
  }
  const expectedPath = repoArg;
  if (!fs.existsSync(expectedPath)) {
    error(`--repo does not exist: ${expectedPath}`);
  }
  const expected = repoIdentity(expectedPath);
  if (!expected) {
    error(`--repo is not a git repository: ${expectedPath}`);
  }

  const actual = repoIdentity(cwd);
  if (!actual) {
    error(`This spawn is not inside a git repository at all (cwd: ${cwd}).\nExpected to be in: ${expected.mainRoot}`);
  }

  if (actual.commonDir !== expected.commonDir) {
    // The #86 failure, made loud. Naming both sides matters: the symptom is
    // "every path is missing", which reads as a planning error until you see
    // which repository you are standing in.
    error(
      `WRONG REPOSITORY — this spawn is rooted in the wrong repo.\n` +
      `  expected repo : ${expected.mainRoot}\n` +
      `  actually in   : ${actual.mainRoot}  (cwd: ${cwd})\n` +
      `Nothing written here can land on the intended branch. Stop and re-dispatch ` +
      `with the working directory set inside ${expected.mainRoot}, or provision a ` +
      `worktree with: df-tools exec-context worktree --repo ${expected.mainRoot} --id <trd-id>`
    );
  }

  // Issue #100 finding 8: on an unborn HEAD `git rev-parse HEAD` prints the
  // LITERAL STRING "HEAD" and exits 128. Taking .stdout without the exit code
  // reported {"ok":true,"branch":"HEAD","head_sha":"HEAD"} for a repository
  // that cannot hold a commit yet — and, with --base, blamed the base for it.
  const head = git(cwd, ['rev-parse', 'HEAD']);
  if (head.exitCode !== 0) {
    error(
      `NO COMMITS — this checkout has an unborn HEAD.\n` +
      `  checkout : ${actual.checkout}\n` +
      `  repo     : ${actual.mainRoot}\n` +
      `There is nothing here to build on: no commit is checked out, so no base can be ` +
      `visible and nothing committed here would land on the intended branch. This is a ` +
      `dispatch defect — the spawn was pointed at a freshly initialised or orphan-branch ` +
      `tree. Re-dispatch into a checkout with history, or provision one with:\n` +
      `  df-tools exec-context worktree --repo ${expected.mainRoot} --id <trd-id> --base <ref>`
    );
  }
  const headSha = head.stdout;
  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout;

  const baseArg = flag(args, '--base');
  if (baseArg === undefined) {
    error('--base was given without a value.\nUsage: df-tools exec-context check --repo <path> [--base <ref>] [--id <plan_id>] [--raw]');
  }

  const idArg = flag(args, '--id');
  if (idArg === undefined) {
    error('--id was given without a value.\nUsage: df-tools exec-context check --repo <path> [--base <ref>] [--id <plan_id>] [--raw]');
  }

  let baseSha = null;
  let baseVisible = null;
  if (baseArg !== null) {
    const resolved = git(cwd, ['rev-parse', '--verify', `${baseArg}^{commit}`]);
    if (resolved.exitCode !== 0) {
      error(`--base does not resolve to a commit in this repository: ${baseArg}\n${resolved.stderr}`);
    }
    baseSha = resolved.stdout;
    baseVisible = git(cwd, ['merge-base', '--is-ancestor', baseSha, headSha]).exitCode === 0;
    if (!baseVisible) {
      // The starvation half of #86: branched from the default branch, so the
      // previous wave's output is simply absent.
      error(
        `BASE NOT VISIBLE — this spawn cannot see the base it was given.\n` +
        `  base : ${baseSha} (${baseArg})\n` +
        `  HEAD : ${headSha} (${branch})\n` +
        `HEAD does not contain that commit, so work that the base represents — a ` +
        `previous wave's output, say — is missing from this tree. Branch from the ` +
        `base explicitly rather than from the default branch:\n` +
        `  df-tools exec-context worktree --repo ${expected.mainRoot} --id <trd-id> --base ${baseArg}`
      );
    }
  }

  // Issue #98: only with BOTH an id and a base — without either there is no
  // (checkout, base) pair to claim, and older callers must keep working.
  const claim = (idArg && baseSha)
    ? takeClaim(actual, idArg, baseSha, expected.mainRoot, baseArg)
    : null;

  const result = {
    ok: true,
    repo_root: actual.mainRoot,
    checkout: actual.checkout,
    is_worktree: actual.isWorktree,
    branch,
    head_sha: headSha,
    base_ref: baseArg,
    base_sha: baseSha,
    base_visible: baseVisible,
    claim,
  };
  output(result, raw, 'ok');
}

// ── exec-context release ─────────────────────────────────────────────────────

function cmdExecContextRelease(cwd, args, raw) {
  const usage = 'Usage: df-tools exec-context release --repo <path> [--id <plan_id>] [--raw]';
  const repoArg = flag(args, '--repo');
  if (repoArg === null || repoArg === undefined) {
    error(`exec-context release requires --repo <path>.\n${usage}`);
  }
  if (!path.isAbsolute(repoArg)) {
    error(`--repo must be an ABSOLUTE path; got: ${repoArg}\n${usage}`);
  }
  if (!fs.existsSync(repoArg)) error(`--repo does not exist: ${repoArg}`);
  const expected = repoIdentity(repoArg);
  if (!expected) error(`--repo is not a git repository: ${repoArg}`);
  const actual = repoIdentity(cwd);
  if (!actual) {
    error(`Not inside a git repository at all (cwd: ${cwd}).\nExpected to be in: ${expected.mainRoot}`);
  }
  if (actual.commonDir !== expected.commonDir) {
    error(
      `WRONG REPOSITORY — release must run from inside the repo whose claims it clears.\n` +
      `  expected repo : ${expected.mainRoot}\n` +
      `  actually in   : ${actual.mainRoot}  (cwd: ${cwd})`
    );
  }
  const idArg = flag(args, '--id');
  if (idArg === undefined) error(`--id was given without a value.\n${usage}`);

  const dir = claimDir(actual);
  const prefix = `${checkoutKey(actual)}-`;
  const released = [];
  let entries = [];
  try { entries = fs.readdirSync(dir); } catch { entries = []; }
  for (const name of entries) {
    if (!name.startsWith(prefix) || !name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    let rec = null;
    try { rec = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { rec = null; }
    const holder = rec && rec.id;
    if (idArg !== null && holder !== idArg) continue;
    fs.rmSync(file, { force: true });
    released.push(holder || null);
  }
  output({ ok: true, checkout: actual.checkout, released }, raw, released.join('\n'));
}

// ── exec-context worktree ────────────────────────────────────────────────────

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

function cmdExecContextWorktree(cwd, args, raw) {
  const repoArg = flag(args, '--repo');
  if (repoArg === null || repoArg === undefined) {
    error('exec-context worktree requires --repo <path>.\nUsage: df-tools exec-context worktree --repo <path> --id <slug> [--base <ref>] [--path <dir>] [--raw]');
  }
  const idArg = flag(args, '--id');
  if (idArg === null || idArg === undefined) {
    error('exec-context worktree requires --id <slug> — usually the TRD id, e.g. 571-02.\nUsage: df-tools exec-context worktree --repo <path> --id <slug> [--base <ref>] [--path <dir>] [--raw]');
  }
  const id = slugify(idArg);
  if (!id) error(`--id produced an empty slug: ${idArg}`);

  const repoPath = path.resolve(cwd, repoArg);
  if (!fs.existsSync(repoPath)) error(`--repo does not exist: ${repoPath}`);
  const repo = repoIdentity(repoPath);
  if (!repo) error(`--repo is not a git repository: ${repoPath}`);

  // Where the orchestrator is actually standing. When that is a linked worktree
  // OF the named repo, it is NOT `repo.mainRoot`: the main checkout has some
  // other branch out. Both the default base and the merge-back target follow
  // from this (issue #100 finding 2).
  const here = repoIdentity(cwd);
  const sameRepo = !!here && here.commonDir === repo.commonDir;
  const refDir = sameRepo ? here.checkout : repo.mainRoot;

  // The base is EXPLICIT. Defaulting to the tip the orchestrator is standing on
  // is the one thing forced isolation got wrong: it used the default branch, so
  // a sequential wave started without the previous wave's commits. Resolving a
  // bare `HEAD` in `repo.mainRoot` recreated exactly that when the orchestrator
  // dispatched from a worktree — mainRoot's HEAD is usually `main`.
  const baseArg = flag(args, '--base');
  if (baseArg === undefined) error('--base was given without a value.');
  const baseRef = baseArg === null ? 'HEAD' : baseArg;
  const resolved = git(refDir, ['rev-parse', '--verify', `${baseRef}^{commit}`]);
  if (resolved.exitCode !== 0) {
    error(`--base does not resolve to a commit in ${refDir}: ${baseRef}\n${resolved.stderr}`);
  }
  const baseSha = resolved.stdout;

  const pathArg = flag(args, '--path');
  if (pathArg === undefined) error('--path was given without a value.');
  const worktreePath = pathArg
    ? path.resolve(cwd, pathArg)
    // Outside the repository on purpose: a worktree nested inside the checkout
    // shows up as an untracked directory in every `git status` that follows.
    : path.join(path.dirname(repo.mainRoot), '.df-worktrees', path.basename(repo.mainRoot), id);
  const branch = `df/exec-${id}`;

  if (fs.existsSync(worktreePath)) {
    error(`Worktree path already exists: ${worktreePath}\nRemove it (git -C ${repo.mainRoot} worktree remove ${worktreePath}) or pass a different --id/--path.`);
  }
  if (git(repo.mainRoot, ['rev-parse', '--verify', `refs/heads/${branch}`]).exitCode === 0) {
    error(`Branch already exists: ${branch}\nA previous spawn for --id ${id} left it behind. Remove it, or pass a different --id.`);
  }

  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
  const add = git(repo.mainRoot, ['worktree', 'add', '-b', branch, worktreePath, baseSha]);
  if (add.exitCode !== 0) {
    error(`git worktree add failed in ${repo.mainRoot}:\n${add.stderr || add.stdout}`);
  }

  // Issue #100 finding 2: `git -C <mainRoot> merge` merges into whatever the
  // MAIN checkout currently has out. In #86's own scenario — an orchestrator
  // dispatching from a linked worktree on the objective branch — that lands the
  // wave on `main` instead of the objective branch. Merge into the checkout the
  // orchestrator is actually standing in, which is what execute-objective.md
  // step 5b already says to do; fall back to the named repo only when cwd
  // belongs to a different repository altogether.
  const mergeInto = refDir;

  const result = {
    ok: true,
    repo_root: repo.mainRoot,
    worktree_path: realpath(worktreePath),
    branch,
    base_ref: baseRef,
    base_sha: baseSha,
    merge_into: mergeInto,
    merge_back: `git -C ${mergeInto} merge --no-ff ${branch}`,
    remove: `git -C ${repo.mainRoot} worktree remove ${worktreePath}`,
  };
  output(result, raw, realpath(worktreePath));
}

// ── router ───────────────────────────────────────────────────────────────────

function cmdExecContextRoute(cwd, args, raw) {
  const sub = args[0];
  if (sub === 'check') {
    cmdExecContextCheck(cwd, args.slice(1), raw);
  } else if (sub === 'worktree') {
    cmdExecContextWorktree(cwd, args.slice(1), raw);
  } else if (sub === 'release') {
    cmdExecContextRelease(cwd, args.slice(1), raw);
  } else {
    error(`Unknown exec-context subcommand${sub ? ': ' + sub : ''}. Available: check, worktree, release`);
  }
}

module.exports = {
  cmdExecContextRoute,
  cmdExecContextCheck,
  cmdExecContextWorktree,
  cmdExecContextRelease,
  repoIdentity,
};
