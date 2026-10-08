'use strict';

// git-remote.cjs (TRD 49-04) — a temp bare `origin` plus a clone of it on `main`, for the objective-branch /
// PR-lifecycle tests (49-04, 49-09, 49-12, 49-14). It is a fixture, not production code.
//
// Hermetic by construction: everything lives under os.tmpdir(); git runs with an isolated config
// (GIT_CONFIG_GLOBAL=/dev/null, GIT_CONFIG_SYSTEM=/dev/null, a temp HOME, no prompts, explicit author and
// committer identity) and the clone also carries a local user.name/user.email. The isolation is installed on
// `process.env` too, because the module under test spawns git with whatever `process.env` holds; `cleanup()`
// restores it. Create and clean up remotes in LIFO order when a test holds more than one.
//
//   const g = makeGitRemote();
//   g.origin                  bare repo path (HEAD -> main, holds `main` with one commit)
//   g.work                    a clone on `main` (origin/HEAD set, as after `git clone`), one commit
//   g.git(cwd, args)          run git, trimmed stdout, throws on a non-zero exit
//   g.run(cwd, args)          run git, the raw spawnSync result (never throws on exit status)
//   g.commitFile(cwd, rel, content, message)   write + add + commit in any checkout, returns the sha
//   g.cloneOrigin(name)       a second, identity-configured clone of origin (another "developer")
//   g.advanceOrigin(opts)     commit through a second clone and push; returns the new tip sha
//   g.createRemoteBranch(b, from='main')  create `refs/heads/<b>` on origin at `from`'s tip (what
//                             createLinkedBranch does on GitHub); nothing is created locally
//   g.cleanup()               remove every temp dir and restore process.env (idempotent)

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { gitAvailable, gitTestEnv, applyGitTestEnv } = require('./wiki-remote.cjs');

function runIn(cwd, env, args) {
  const r = spawnSync('git', args, { cwd, env, encoding: 'utf-8' });
  if (r.error) throw new Error(`git ${args.join(' ')}: ${r.error.message}`);
  return r;
}

function mustRun(cwd, env, args) {
  const r = runIn(cwd, env, args);
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed (${r.status}): ${(r.stderr || '').trim()}`);
  }
  return (r.stdout || '').trim();
}

function configureIdentity(cwd, env) {
  mustRun(cwd, env, ['config', 'user.name', 'Fixture Dev']);
  mustRun(cwd, env, ['config', 'user.email', 'dev@example.invalid']);
  mustRun(cwd, env, ['config', 'commit.gpgsign', 'false']);
}

/** Build a bare origin and a clone on `main` (one commit, pushed, tracking origin/main). */
function makeGitRemote() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-git-remote-')));
  const home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true });
  const restoreEnv = applyGitTestEnv(home);
  const env = { ...process.env, ...gitTestEnv(home) };

  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  let done = false;

  function cleanup() {
    if (done) return;
    done = true;
    restoreEnv();
    fs.rmSync(root, { recursive: true, force: true });
  }

  try {
    mustRun(root, env, ['init', '--bare', '-q', '-b', 'main', origin]);
    mustRun(root, env, ['init', '-q', '-b', 'main', work]);
    configureIdentity(work, env);
    fs.writeFileSync(path.join(work, 'README.md'), '# fixture\n');
    mustRun(work, env, ['add', 'README.md']);
    mustRun(work, env, ['commit', '-q', '-m', 'chore: seed']);
    mustRun(work, env, ['remote', 'add', 'origin', origin]);
    mustRun(work, env, ['push', '-q', '-u', 'origin', 'main']);
    // A real `git clone` leaves origin/HEAD pointing at the default branch; reproduce that.
    mustRun(work, env, ['remote', 'set-head', 'origin', 'main']);
  } catch (e) {
    cleanup();
    throw e;
  }

  const git = (cwd, args) => mustRun(cwd, env, args);
  const run = (cwd, args) => runIn(cwd, env, args);

  function commitFile(cwd, rel, content, message) {
    const file = path.join(cwd, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    mustRun(cwd, env, ['add', rel]);
    mustRun(cwd, env, ['commit', '-q', '-m', message || `chore: update ${rel}`]);
    return mustRun(cwd, env, ['rev-parse', 'HEAD']);
  }

  function cloneOrigin(name = 'second') {
    const dir = path.join(root, `clone-${name}`);
    mustRun(root, env, ['clone', '-q', origin, dir]);
    configureIdentity(dir, env);
    return dir;
  }

  function advanceOrigin(opts = {}) {
    const branch = opts.branch || 'main';
    const dir = cloneOrigin(opts.name || `advance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    if (branch !== 'main') mustRun(dir, env, ['switch', '-q', branch]);
    const sha = commitFile(dir, opts.file || 'advance.txt', opts.content || `advance ${Date.now()}\n`, opts.message || 'chore: advance origin');
    mustRun(dir, env, ['push', '-q', 'origin', branch]);
    return sha;
  }

  function createRemoteBranch(branch, from = 'main') {
    const sha = mustRun(origin, env, ['rev-parse', `refs/heads/${from}`]);
    mustRun(origin, env, ['update-ref', `refs/heads/${branch}`, sha]);
    return sha;
  }

  return { root, home, origin, work, env, git, run, commitFile, cloneOrigin, advanceOrigin, createRemoteBranch, cleanup };
}

module.exports = { makeGitRemote, gitAvailable };
