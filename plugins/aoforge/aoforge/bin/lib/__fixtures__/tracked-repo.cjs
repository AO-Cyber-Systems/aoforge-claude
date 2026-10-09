'use strict';

// Hand-built hermetic git repository for the Bash write gate (TRD 60-03). No generated data.
//
//   makeTrackedRepo({ files, untracked, ignored, planningDir, history })
//     -> { root, projectRoot, home, env, git(args), run(args), cleanup() }
//
// What it builds, in this order:
//   1. `history`   an ordered list of { at: '<ISO>', add: {rel: content}, remove: [rel] }. Each entry writes or
//                  removes its files, runs `git add -A` and commits with GIT_AUTHOR_DATE and GIT_COMMITTER_DATE
//                  set to `at`, so the committer date is exact. The transcript replay (60-05) needs that: it
//                  places a transcript row before or after the commit that added a file.
//   2. `files`     {rel: content}, plus `<planningDir>/config.json` = `{}`, committed together as "tracked"
//                  (the current date).
//   3. `ignored`   {rel: content}: each path is appended to `.gitignore` (committed) and the file is written, so
//                  it exists on disk and is not tracked.
//   4. `untracked` {rel: content}: written, never added.
//
// `root` is the repository top, in the spelling mkdtemp returned (NOT realpath'd, so on macOS it is under
// `/var`, which is a symlink to `/private/var`). A test that wants the other spelling calls
// `fs.realpathSync(root)`. `projectRoot` is the directory that holds `planningDir`: it equals `root` for the
// default `.aoforge`, and `<root>/pkg` for `planningDir: 'pkg/.aoforge'` (a nested project).
//
// Every git call is hermetic: `env` is `process.env` overlaid with `gitTestEnv(home)` (GIT_CONFIG_GLOBAL and
// GIT_CONFIG_SYSTEM pointed at /dev/null, a temp HOME, an explicit identity) with the variables that would
// point git at the repository the test runner is inside removed, plus a repository-local `commit.gpgsign false`.
// Nothing outside the mkdtemp directory is written and this repository's git configuration is never touched.
//
// `git(args)` throws on a non-zero exit and returns trimmed stdout. `run(args)` returns the raw spawnSync
// result. `cleanup()` removes everything the builder created.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { gitTestEnv } = require('./wiki-remote.cjs');

// Variables that would point git at the repository the test runner is itself inside.
const LEAKY = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_NAMESPACE',
];

function makeTrackedRepo({
  files = {},
  untracked = {},
  ignored = {},
  planningDir = '.aoforge',
  history = [],
} = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'df-tracked-'));
  const home = path.join(base, 'home');
  const root = path.join(base, 'repo');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(root, { recursive: true });

  const env = { ...process.env, ...gitTestEnv(home) };
  for (const key of LEAKY) delete env[key];

  function run(args, opts = {}) {
    return spawnSync('git', args, {
      cwd: opts.cwd || root,
      env: opts.env ? { ...env, ...opts.env } : env,
      encoding: 'utf-8',
    });
  }

  function git(args, opts = {}) {
    const r = run(args, opts);
    if (r.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed (${r.status}): ${(r.stderr || '').trim()}`);
    }
    return (r.stdout || '').trim();
  }

  function writeFiles(map) {
    for (const [rel, content] of Object.entries(map)) {
      const abs = path.join(root, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, 'utf-8');
    }
  }

  function commitAll(message, at) {
    git(['add', '-A']);
    const opts = at ? { env: { GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at } } : {};
    git(['commit', '--allow-empty', '-q', '-m', message], opts);
  }

  const init = run(['init', '-b', 'main']);
  if (init.status !== 0) {
    git(['init']);
    git(['symbolic-ref', 'HEAD', 'refs/heads/main']);
  }
  git(['config', 'user.name', 'Test Author']);
  git(['config', 'user.email', 'author@example.invalid']);
  git(['config', 'commit.gpgsign', 'false']);

  fs.mkdirSync(path.join(root, planningDir), { recursive: true });
  const projectRoot = path.dirname(path.join(root, planningDir));

  for (const entry of history) {
    writeFiles(entry.add || {});
    for (const rel of entry.remove || []) fs.rmSync(path.join(root, rel), { force: true });
    commitAll(entry.message || `history ${entry.at}`, entry.at);
  }

  writeFiles({ [path.posix.join(planningDir, 'config.json')]: '{}', ...files });
  commitAll('tracked');

  const ignoredRels = Object.keys(ignored);
  if (ignoredRels.length > 0) {
    const ignoreFile = path.join(root, '.gitignore');
    const before = fs.existsSync(ignoreFile) ? fs.readFileSync(ignoreFile, 'utf-8') : '';
    const sep = before === '' || before.endsWith('\n') ? '' : '\n';
    fs.writeFileSync(ignoreFile, `${before}${sep}${ignoredRels.join('\n')}\n`, 'utf-8');
    commitAll('ignore');
    writeFiles(ignored);
  }

  writeFiles(untracked);

  function cleanup() {
    fs.rmSync(base, { recursive: true, force: true });
  }

  return { root, projectRoot, home, env, git, run, cleanup };
}

module.exports = { makeTrackedRepo };
