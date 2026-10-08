'use strict';

// draft-fixtures.cjs (TRD 69-01) — a hand-built, local-mode AOForge project for the planning-draft tests.
//
// Everything lives under one realpath'd mkdtemp root:
//   <root>/proj/.planning/{config.json,PROJECT.md}   the project (github.store off: local mode)
//   <root>/tmp                                       the isolated TMPDIR, so drafts never land in the real temp tree
//   <root>/home                                      a fake HOME
// `run` spawns the repo's aof-tools with that environment, so a spawned `planning draft` writes under <root>/tmp.
// In-process callers (planning-drafts.test.cjs) set process.env.TMPDIR to `tmp` themselves: os.tmpdir() reads it on
// every call.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DF_TOOLS = path.resolve(__dirname, '..', '..', 'aof-tools.cjs');

/** process.env without any AOFORGE_* variable, TMPDIR and HOME pointed into the fixture. */
function isolatedEnv(tmp, home) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('AOFORGE_')) env[k] = v;
  }
  env.TMPDIR = tmp;
  env.HOME = home;
  return env;
}

/**
 * makeDraftProject({project?}) -> {dir, tmp, home, env, livePath(rel), setLive(rel, text), setMtime(file, ms),
 *                                  run(argv, {input}?), cleanup()}
 */
function makeDraftProject({ project = '# Project\n\nv1\n' } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-drafts-')));
  const dir = path.join(root, 'proj');
  const tmp = path.join(root, 'tmp');
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
  fs.mkdirSync(tmp, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'config.json'), '{}\n');
  fs.writeFileSync(path.join(dir, '.planning', 'PROJECT.md'), project);

  const env = isolatedEnv(tmp, home);
  const livePath = (rel) => path.join(dir, '.planning', ...rel.split('/'));

  return {
    dir,
    tmp,
    home,
    env,
    livePath,
    setLive(rel, text) {
      const file = livePath(rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
      return file;
    },
    setMtime(file, ms) {
      const t = new Date(ms);
      fs.utimesSync(file, t, t);
    },
    run(argv, { input } = {}) {
      const opts = { encoding: 'utf8', env, timeout: 20000 };
      if (input !== undefined) opts.input = input;
      const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', dir, ...argv], opts);
      return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
    },
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

module.exports = { makeDraftProject, DF_TOOLS };
