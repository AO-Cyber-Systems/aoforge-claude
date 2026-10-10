'use strict';

/**
 * Hand-built temp homes holding the user's dot directory, with repositories and AOForge
 * projects below them (objective 73, gap G5).
 *
 * aoforge-watch writes its log and pid file into `~/<NAMES.userDotDir>/`, which has the
 * same name as a project's planning directory. These builders reproduce that footprint
 * under a temp HOME so a test can prove $HOME is never read as a project root.
 *
 * Consumers: TRD 73-09 ($HOME is never a project root), 73-11 (the watcher's files leave
 * the dot directory) and 73-13 (the doctor check for what is left in it).
 *
 * Hand-built, never generated: every tree is written file by file, nothing spawns git,
 * and nothing here reads or writes the real $HOME. Every home lives under os.tmpdir().
 * Homes are returned in the form mkdtemp gives (on macOS `/var/folders/...`, while a
 * spawned process reports `/private/var/folders/...`), on purpose: the symlinked forms
 * are part of what the tests pin.
 *
 * No legacy name is spelled here; every name comes from NAMES in legacy-names.cjs.
 * Not a test file: no `*.test.*` glob picks it up.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { NAMES } = require('../legacy-names.cjs');

const { planningDir: PLANNING_DIR, userDotDir: USER_DOT_DIR } = NAMES;

/** The watcher's footprint in the dot directory, as 73-VERIFICATION found it. */
const WATCH_FOOTPRINT = Object.freeze({ [`${NAMES.watch}.log`]: '[t] INFO dispatching h-1\n' });

/** Write each `name -> content` of `files` into `<home>/<userDotDir>/`; nothing when `files` is empty. */
function writeDotDir(home, files) {
  const dir = path.join(home, USER_DOT_DIR);
  const entries = Object.entries(files || {});
  if (entries.length === 0) return dir;
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of entries) fs.writeFileSync(path.join(dir, name), String(content));
  return dir;
}

/**
 * A temp home. `dotDir` maps file names to contents written into `<home>/<userDotDir>/`
 * (the directory is created only when there is at least one file).
 *
 * @param {object} [opts]
 * @param {Object<string,string>} [opts.dotDir={}]
 * @param {string} [opts.prefix='aof-home-']
 * @returns {{home: string, dotDir: string}} the home and the dot directory's path
 */
function mkHome({ dotDir = {}, prefix = 'aof-home-' } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { home, dotDir: writeDotDir(home, dotDir) };
}

/**
 * A repository below `home`: `<home>/<name>/.git/` (a directory holding HEAD, the
 * gate-fixtures makeGitDir shape, no git spawn) and `<home>/<name>/src/a.txt`. No
 * planning directory.
 *
 * @param {string} home
 * @param {string} [name='repo']
 * @returns {string} the repository root
 */
function mkRepoBelow(home, name = 'repo') {
  const root = path.join(home, name);
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.txt'), 'a\n');
  return root;
}

/**
 * An AOForge project below `home`: a repository as mkRepoBelow builds it plus
 * `<planningDir>/ROADMAP.md` and `<planningDir>/objectives/` (the gate-fixtures
 * makeAoforgeProject shape).
 *
 * @param {string} home
 * @param {string} [name='proj']
 * @returns {string} the project root
 */
function mkProjectBelow(home, name = 'proj') {
  const root = mkRepoBelow(home, name);
  const planning = path.join(root, PLANNING_DIR);
  fs.mkdirSync(path.join(planning, 'objectives'), { recursive: true });
  fs.writeFileSync(path.join(planning, 'ROADMAP.md'), '# Roadmap\n');
  return root;
}

/**
 * A home reachable under two names with DIFFERENT basenames: `<base>/real` and the
 * symlink `<base>/link -> <base>/real`. `dotDir` is written into
 * `<base>/real/<userDotDir>/` as in mkHome. Remove it with `rmHome(base)`.
 *
 * @param {object} [opts]
 * @param {Object<string,string>} [opts.dotDir={}]
 * @returns {{base: string, real: string, link: string}}
 */
function linkHome({ dotDir = {} } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'aof-linkhome-'));
  const real = path.join(base, 'real');
  const link = path.join(base, 'link');
  fs.mkdirSync(real, { recursive: true });
  fs.symlinkSync(real, link, 'dir');
  writeDotDir(real, dotDir);
  return { base, real, link };
}

/** Remove each directory tree; falsy entries are skipped. */
function rmHome(...dirs) {
  for (const d of dirs) {
    if (d) fs.rmSync(d, { recursive: true, force: true });
  }
}

module.exports = { WATCH_FOOTPRINT, mkHome, mkRepoBelow, mkProjectBelow, linkHome, rmHome };
