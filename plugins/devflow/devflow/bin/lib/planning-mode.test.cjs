'use strict';

// planning-mode.test.cjs — Test list (TRD 48-01, Task 1)
//
//   1. planningMode: no config / malformed JSON / enabled only / store:'true' (string) / enabled+store / store without enabled.
//      Only `github.enabled === true && github.store === true` is store mode (D-01, strict booleans).
//   2. resolveMainRoot from the main checkout root and from a nested subdir -> the main root (realpath).
//   3. A linked worktree written by hand (no git spawn): `main/.git/worktrees/wt1/commondir` = `../..`, `wt/.git` is a file
//      `gitdir: <main>/.git/worktrees/wt1` -> resolveMainRoot(wt) is main, and planningMode(wt) reads MAIN's config (D-14).
//      Also: no `commondir` (older git), a relative gitdir, and a `.git` file that is not a worktree (submodule shape).
//   4. A non-git temp dir with `.planning/` -> that dir; no `.planning/` anywhere -> null.
//
// Fixtures are hand-built temp trees. Nothing here spawns git or touches ~/.claude.

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const mode = require('./planning-mode.cjs');

let tmp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'planning-mode-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const real = (p) => fs.realpathSync(p);

function mkdirs(...parts) {
  const dir = path.join(...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeConfig(root, value) {
  mkdirs(root, '.planning');
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  fs.writeFileSync(path.join(root, '.planning', 'config.json'), text);
}

/** A main checkout: `<tmp>/<name>/.git/` (a directory) and `.planning/`. */
function mainCheckout(name = 'main') {
  const root = mkdirs(tmp, name);
  mkdirs(root, '.git');
  mkdirs(root, '.planning');
  return root;
}

/**
 * A linked worktree of `main`, written the way `git worktree add` lays it out:
 *   <main>/.git/worktrees/<id>/commondir  = "../.."  (optional)
 *   <main>/.git/worktrees/<id>/gitdir     = "<wt>/.git"
 *   <wt>/.git                             = "gitdir: <main>/.git/worktrees/<id>"   (a FILE)
 */
function linkedWorktree(main, { id = 'wt1', name = 'wt', commondir = true, relative = false } = {}) {
  const gitdir = mkdirs(main, '.git', 'worktrees', id);
  if (commondir) fs.writeFileSync(path.join(gitdir, 'commondir'), '../..\n');
  const wt = mkdirs(tmp, name);
  fs.writeFileSync(path.join(gitdir, 'gitdir'), `${path.join(wt, '.git')}\n`);
  const pointer = relative ? path.relative(wt, gitdir) : gitdir;
  fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${pointer}\n`);
  return wt;
}

describe('planningMode: the D-01 switch', () => {
  test('1a. no .planning/config.json -> local', () => {
    const root = mainCheckout();
    const got = mode.planningMode(root);
    assert.strictEqual(got.mode, 'local');
    assert.strictEqual(typeof got.reason, 'string');
    assert.strictEqual(mode.isStoreMode(root), false);
    assert.strictEqual(mode.readPlanningConfig(root), null);
  });

  test('1b. malformed JSON -> local, and readPlanningConfig never throws', () => {
    const root = mainCheckout();
    writeConfig(root, '{"github": {"enabled": true, "store": true');
    assert.strictEqual(mode.readPlanningConfig(root), null);
    assert.strictEqual(mode.planningMode(root).mode, 'local');
    assert.strictEqual(mode.isStoreMode(root), false);
  });

  test('1c. a JSON value that is not an object -> local', () => {
    const root = mainCheckout();
    for (const text of ['[]', '"store"', 'null', '42', 'true']) {
      writeConfig(root, text);
      assert.strictEqual(mode.readPlanningConfig(root), null, text);
      assert.strictEqual(mode.planningMode(root).mode, 'local', text);
    }
  });

  test('1d. {github:{enabled:true}} -> local', () => {
    const root = mainCheckout();
    writeConfig(root, { github: { enabled: true } });
    assert.deepStrictEqual(mode.readPlanningConfig(root), { github: { enabled: true } });
    assert.strictEqual(mode.planningMode(root).mode, 'local');
  });

  test("1e. store: 'true' (a string) -> local: truthiness is not enough", () => {
    const root = mainCheckout();
    writeConfig(root, { github: { enabled: true, store: 'true' } });
    assert.strictEqual(mode.planningMode(root).mode, 'local');
    assert.strictEqual(mode.isStoreMode(root), false);
  });

  test("1f. enabled: 'true' (a string) with store: true -> local", () => {
    const root = mainCheckout();
    writeConfig(root, { github: { enabled: 'true', store: true } });
    assert.strictEqual(mode.planningMode(root).mode, 'local');
  });

  test('1g. {github:{enabled:true, store:true}} -> store', () => {
    const root = mainCheckout();
    writeConfig(root, { github: { enabled: true, store: true } });
    const got = mode.planningMode(root);
    assert.strictEqual(got.mode, 'store');
    assert.strictEqual(typeof got.reason, 'string');
    assert.strictEqual(mode.isStoreMode(root), true);
  });

  test('1h. {github:{enabled:false, store:true}} -> local', () => {
    const root = mainCheckout();
    writeConfig(root, { github: { enabled: false, store: true } });
    assert.strictEqual(mode.planningMode(root).mode, 'local');
  });

  test('1i. github that is not an object -> local', () => {
    const root = mainCheckout();
    writeConfig(root, { github: true, store: true });
    assert.strictEqual(mode.planningMode(root).mode, 'local');
  });

  test('1j. the reasons for local and store differ (callers print them)', () => {
    const off = mainCheckout('off');
    writeConfig(off, { github: { enabled: true } });
    const on = mainCheckout('on');
    writeConfig(on, { github: { enabled: true, store: true } });
    assert.notStrictEqual(mode.planningMode(off).reason, mode.planningMode(on).reason);
  });

  test('1k. planningMode accepts any cwd inside the project, and reports the resolved root', () => {
    const root = mainCheckout();
    writeConfig(root, { github: { enabled: true, store: true } });
    const deep = mkdirs(root, 'src', 'a', 'b');
    const got = mode.planningMode(deep);
    assert.strictEqual(got.mode, 'store');
    assert.strictEqual(got.root, real(root));
  });
});

describe('resolveMainRoot: main checkout (D-14)', () => {
  test('2a. from the main checkout root -> the root (realpath)', () => {
    const root = mainCheckout();
    assert.strictEqual(mode.resolveMainRoot(root), real(root));
  });

  test('2b. from a nested subdir -> the main root (realpath)', () => {
    const root = mainCheckout();
    const deep = mkdirs(root, 'plugins', 'devflow', 'bin');
    assert.strictEqual(mode.resolveMainRoot(deep), real(root));
  });

  test('2c. from inside .planning/ itself -> the root', () => {
    const root = mainCheckout();
    const inside = mkdirs(root, '.planning', 'objectives', '48-x');
    assert.strictEqual(mode.resolveMainRoot(inside), real(root));
  });
});

describe('resolveMainRoot: linked worktree, no git spawn (D-14)', () => {
  test('3a. a worktree resolves to the MAIN checkout via commondir', () => {
    const main = mainCheckout();
    const wt = linkedWorktree(main);
    mkdirs(wt, '.planning');
    assert.strictEqual(mode.resolveMainRoot(wt), real(main));
    assert.strictEqual(mode.resolveMainRoot(mkdirs(wt, 'src', 'x')), real(main));
  });

  test("3b. planningMode(wt) reads MAIN's config, even when the worktree's own config says local", () => {
    const main = mainCheckout();
    writeConfig(main, { github: { enabled: true, store: true } });
    const wt = linkedWorktree(main);
    writeConfig(wt, { github: { enabled: true, store: false } });
    assert.strictEqual(mode.planningMode(wt).mode, 'store');
    assert.strictEqual(mode.isStoreMode(wt), true);
    assert.strictEqual(mode.planningMode(wt).root, real(main));
  });

  test("3c. and the reverse: main says local, the worktree's store:true is ignored", () => {
    const main = mainCheckout();
    writeConfig(main, { github: { enabled: true } });
    const wt = linkedWorktree(main);
    writeConfig(wt, { github: { enabled: true, store: true } });
    assert.strictEqual(mode.planningMode(wt).mode, 'local');
  });

  test('3d. no commondir (older git): the gitdir <main>/.git/worktrees/<id> still resolves to <main>', () => {
    const main = mainCheckout();
    const wt = linkedWorktree(main, { commondir: false });
    assert.strictEqual(mode.resolveMainRoot(wt), real(main));
  });

  test('3e. a relative gitdir pointer resolves against the worktree', () => {
    const main = mainCheckout();
    const wt = linkedWorktree(main, { relative: true });
    assert.strictEqual(mode.resolveMainRoot(wt), real(main));
  });

  test('3f. a .git FILE that is not a worktree (submodule shape) resolves to the dir holding it', () => {
    const superRoot = mainCheckout('super');
    const modGitdir = mkdirs(superRoot, '.git', 'modules', 'sub');
    const sub = mkdirs(superRoot, 'sub');
    fs.writeFileSync(path.join(sub, '.git'), `gitdir: ${modGitdir}\n`);
    mkdirs(sub, '.planning');
    assert.strictEqual(mode.resolveMainRoot(sub), real(sub));
  });

  test('3g. main has no .planning/ but the worktree does -> falls back to the worktree', () => {
    const main = mkdirs(tmp, 'bare-main');
    mkdirs(main, '.git');
    const wt = linkedWorktree(main);
    mkdirs(wt, '.planning');
    assert.strictEqual(mode.resolveMainRoot(wt), real(wt));
  });

  test('3h. an unreadable gitdir pointer never throws', () => {
    const wt = mkdirs(tmp, 'broken');
    fs.writeFileSync(path.join(wt, '.git'), 'not a gitdir line\n');
    mkdirs(wt, '.planning');
    assert.strictEqual(mode.resolveMainRoot(wt), real(wt));
  });
});

describe('resolveMainRoot: outside git', () => {
  test('4a. a non-git temp dir with .planning/ -> that dir', () => {
    const root = mkdirs(tmp, 'plain');
    mkdirs(root, '.planning');
    assert.strictEqual(mode.resolveMainRoot(root), real(root));
    assert.strictEqual(mode.resolveMainRoot(mkdirs(root, 'a', 'b')), real(root));
  });

  test('4b. no .planning/ anywhere -> null, and planningMode is local', () => {
    const root = mkdirs(tmp, 'nothing', 'here');
    assert.strictEqual(mode.resolveMainRoot(root), null);
    const got = mode.planningMode(root);
    assert.strictEqual(got.mode, 'local');
    assert.strictEqual(got.root, null);
  });

  test('4c. a .planning FILE is not a planning directory', () => {
    const root = mkdirs(tmp, 'file-not-dir');
    fs.writeFileSync(path.join(root, '.planning'), 'x');
    assert.strictEqual(mode.resolveMainRoot(root), null);
  });

  test('4d. a cwd that does not exist never throws', () => {
    assert.strictEqual(mode.resolveMainRoot(path.join(tmp, 'missing', 'dir')), null);
  });
});

describe('module hygiene', () => {
  test('requires only fs, path and os (hook-safe, no child_process)', () => {
    const src = fs.readFileSync(path.join(__dirname, 'planning-mode.cjs'), 'utf8');
    const required = [...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]).sort();
    assert.deepStrictEqual([...new Set(required)].filter((r) => !['fs', 'os', 'path'].includes(r)), []);
    assert.doesNotMatch(src, /child_process/);
  });
});
