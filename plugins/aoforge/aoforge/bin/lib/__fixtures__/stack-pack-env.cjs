'use strict';

// Test support (objective 77): mirror this repo's stack packs (plugins/aoforge-stack-*) into a
// temp stacks dir and point AOFORGE_STACKS_DIR at it, once per process. Spawned aof-tools inherit
// it through process.env. Require it from a test that resolves a pack-shipped profile
// (`extends: flutter`, `extends: dart`) or exercises an active pack.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { mirrorPack } = require('../pack-mirror.cjs');

const PLUGINS = path.join(__dirname, '..', '..', '..', '..', '..');

function packRoots() {
  return fs.readdirSync(PLUGINS)
    .filter((d) => d.startsWith('aoforge-stack-') && fs.existsSync(path.join(PLUGINS, d, 'aoforge-stack.json')))
    .map((d) => path.join(PLUGINS, d));
}

function useRepoPacks() {
  if (process.env.AOFORGE_STACKS_DIR && fs.existsSync(path.join(process.env.AOFORGE_STACKS_DIR, '.repo-packs'))) {
    return process.env.AOFORGE_STACKS_DIR;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aof-stacks-'));
  for (const root of packRoots()) mirrorPack({ packRoot: root, stacksDir: dir });
  fs.writeFileSync(path.join(dir, '.repo-packs'), '');
  process.env.AOFORGE_STACKS_DIR = dir;
  process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });
  return dir;
}

/**
 * The shipped file of a tier-2 profile, wherever it ships now: core's bundled stack-profiles/
 * (go), else a repo pack's profiles/ (flutter, dart). Takes `flutter` or `flutter.md`.
 */
function shippedProfile(nameOrFile) {
  const file = nameOrFile.endsWith('.md') ? nameOrFile : `${nameOrFile}.md`;
  const bundled = path.join(__dirname, '..', '..', '..', 'stack-profiles', file);
  if (fs.existsSync(bundled)) return bundled;
  for (const root of packRoots()) {
    const p = path.join(root, 'profiles', file);
    if (fs.existsSync(p)) return p;
  }
  return bundled;
}

/** process.env plus the stacks dir, for spawn calls that build a minimal env. */
function packEnv(env) {
  return { ...env, AOFORGE_STACKS_DIR: useRepoPacks() };
}

module.exports = { useRepoPacks, packRoots, shippedProfile, packEnv };
