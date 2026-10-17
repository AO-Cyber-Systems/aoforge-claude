'use strict';

// Where the AOForge core library lives, seen from this pack (objective 77).
//
// The pack's modules reuse core helpers (output, planningRoot, frontmatter parsing...). Core is a
// separate plugin, so its files are found at runtime, first hit wins:
//   1. AOFORGE_CORE_LIB                     explicit override (tests, dev)
//   2. <repo>/plugins/aoforge/aoforge/bin/lib    this pack inside the aoforge-claude checkout
//   3. <home>/.claude/aoforge/bin/lib          core's runtime mirror (sync-runtime), which also
//                                             covers this pack's own mirror at stacks/<name>/lib
const fs = require('fs');
const os = require('os');
const path = require('path');

let _dir = null;
function coreLibDir() {
  if (_dir) return _dir;
  const candidates = [
    process.env.AOFORGE_CORE_LIB,
    path.join(__dirname, '..', '..', 'aoforge', 'aoforge', 'bin', 'lib'),
    path.join(os.homedir(), '.claude', 'aoforge', 'bin', 'lib'),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'helpers.cjs'))) {
      _dir = dir;
      return dir;
    }
  }
  throw new Error('AOForge core not found: install and enable the aoforge plugin (aoforge@aocyber), or set AOFORGE_CORE_LIB');
}

/** require() a core lib module by file name, e.g. core('helpers.cjs'). */
function core(name) {
  return require(path.join(coreLibDir(), name));
}

/** A path inside core's runtime tree (references/, schemas/...), relative to bin/lib. */
function corePath(...parts) {
  return path.join(coreLibDir(), ...parts);
}

module.exports = core;
module.exports.core = core;
module.exports.coreLibDir = coreLibDir;
module.exports.corePath = corePath;
