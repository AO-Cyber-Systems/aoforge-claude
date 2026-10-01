'use strict';

// wiki-remote.cjs (TRD 47-04) — a local bare repo standing in for `<repo>.wiki.git`.
//
// Hermetic by construction: the remote is a directory under os.tmpdir() reached over file://, and every
// git call made HERE runs with an isolated config (no global/system config, a temp HOME, no terminal
// prompts, explicit author/committer identity), so a developer's hooks, signing or `init.defaultBranch`
// cannot leak in. The module under test spawns git too, with whatever `process.env` holds; a test
// installs the same isolation for it with `applyGitTestEnv(home)`.
//
//   const remote = createWikiRemote({ seed: { 'Home.md': '# Home\n' } });
//   remote.remoteUrl        file:// URL of the bare repo (branch `master`, seeded)
//   remote.missingUrl       file:// URL of a path that does not exist       -> git: "not a git repository"
//   remote.notARepoUrl      file:// URL of a regular file, not a repository -> git: "invalid gitfile format"
//   remote.commitPage(...)  a "human edit" made on the remote (through a scratch clone)
//   remote.goOffline()      the remote disappears; goOnline() brings it back

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

/** True when a `git` binary is on PATH. Integration tests skip, visibly, when it is not. */
function gitAvailable() {
  const r = spawnSync('git', ['--version'], { encoding: 'utf-8' });
  return !r.error && r.status === 0;
}

/** The isolation overlay for git: nothing from the developer's machine, an explicit identity. */
function gitTestEnv(home) {
  return {
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, '.config'),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_EDITOR: 'true',
    GIT_AUTHOR_NAME: 'Test Author',
    GIT_AUTHOR_EMAIL: 'author@example.invalid',
    GIT_COMMITTER_NAME: 'Test Committer',
    GIT_COMMITTER_EMAIL: 'committer@example.invalid',
  };
}

// Variables that would point git at the repository the test runner itself happens to be inside.
const LEAKY = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_NAMESPACE',
];

/**
 * Install `gitTestEnv(home)` on `process.env` (so the module under test is isolated too) and return a
 * `restore()` that puts every touched variable back exactly as it was.
 */
function applyGitTestEnv(home) {
  const overlay = gitTestEnv(home);
  const touched = [...Object.keys(overlay), ...LEAKY];
  const saved = new Map(touched.map((k) => [k, process.env[k]]));
  for (const k of LEAKY) delete process.env[k];
  Object.assign(process.env, overlay);
  return function restore() {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

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

/**
 * Create a bare wiki remote, seeded through a scratch clone. `seed` is `{ 'Page.md': text }`.
 * Returns `{ remoteUrl, bareDir, home, commitPage, readRemotePage, headSha, goOffline, goOnline,
 * missingUrl, notARepoUrl, cleanup }`.
 */
function createWikiRemote({ seed = { 'Home.md': '# Home\n' } } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'df-wiki-remote-'));
  const home = path.join(base, 'home');
  fs.mkdirSync(home, { recursive: true });
  const env = { ...process.env, ...gitTestEnv(home) };
  for (const k of LEAKY) delete env[k];

  const bareDir = path.join(base, 'remote.wiki.git');
  const offlineDir = `${bareDir}.offline`;
  const scratch = path.join(base, 'scratch');
  const notARepo = path.join(base, 'not-a-repo');
  fs.writeFileSync(notARepo, 'this is a file, not a repository\n');

  mustRun(base, env, ['init', '--bare', '-b', 'master', bareDir]);
  mustRun(base, env, ['clone', bareDir, scratch]);
  mustRun(scratch, env, ['checkout', '-B', 'master']);

  function publish(files, message) {
    mustRun(scratch, env, ['pull', '--rebase', 'origin', 'master']);
    for (const [name, text] of Object.entries(files)) {
      fs.writeFileSync(path.join(scratch, name), text);
    }
    mustRun(scratch, env, ['add', '-A']);
    mustRun(scratch, env, ['commit', '-m', message]);
    mustRun(scratch, env, ['push', 'origin', 'HEAD:master']);
  }

  // The first publish happens on an empty remote, where there is nothing to pull yet.
  for (const [name, text] of Object.entries(seed)) {
    fs.writeFileSync(path.join(scratch, name), text);
  }
  mustRun(scratch, env, ['add', '-A']);
  mustRun(scratch, env, ['commit', '-m', 'seed wiki', '--allow-empty']);
  mustRun(scratch, env, ['push', 'origin', 'HEAD:master']);

  return {
    remoteUrl: pathToFileURL(bareDir).href,
    bareDir,
    home,
    missingUrl: pathToFileURL(path.join(base, 'missing.wiki.git')).href,
    notARepoUrl: pathToFileURL(notARepo).href,

    /** A human edit on the remote: write `<page>.md` with `text` and push it to master. */
    commitPage(page, text, message = `edit ${page}`) {
      publish({ [`${page}.md`]: text }, message);
    },

    /** The text of `<page>.md` at the remote's master, or null when the page is absent. */
    readRemotePage(page) {
      const r = runIn(bareDir, env, ['show', `master:${page}.md`]);
      return r.status === 0 ? r.stdout : null;
    },

    /** The remote's master sha. */
    headSha() {
      return mustRun(bareDir, env, ['rev-parse', 'master']);
    },

    /** The remote moves away: a push or fetch now fails with "not a git repository". */
    goOffline() {
      if (fs.existsSync(bareDir)) fs.renameSync(bareDir, offlineDir);
    },

    goOnline() {
      if (fs.existsSync(offlineDir)) fs.renameSync(offlineDir, bareDir);
    },

    cleanup() {
      fs.rmSync(base, { recursive: true, force: true });
    },
  };
}

module.exports = { createWikiRemote, gitAvailable, gitTestEnv, applyGitTestEnv };
