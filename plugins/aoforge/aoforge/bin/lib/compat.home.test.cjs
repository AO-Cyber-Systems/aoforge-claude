'use strict';

// compat.home.test.cjs — $HOME is never an AOForge project root (TRD 73-09, gap G5 (a)), and the
// user's files resolve from the runtime home first (TRD 73-11, gap G5 (b); its list is further down).
//
// aoforge-watch writes into `~/<NAMES.userDotDir>/`, which has the planning directory's name, and
// findProjectRoot walked up with no stop at $HOME: every repository below $HOME read as a project.
// Locked decision: a planning directory exactly at $HOME is never a project (either name), and
// the walk does not continue above $HOME.
//
// Test list (spawned hooks are in hooks/home-project-detection.test.js, planning-mode in
// planning-mode.test.cjs):
//    7. findProjectRoot(<home>/repo/sub, { home }) -> null when only <home>/<dot dir> exists.
//    8. findProjectRoot(<home>, { home }) -> null.
//    9. <home>/proj/<planning dir> and <home>/<dot dir> -> findProjectRoot(<home>/proj/sub) is <home>/proj.
//   10. The legacy planning directory at $HOME -> null too.
//   11. A home reached under a symlink with a different name (<base>/link -> <base>/real), in both
//       directions -> null; the stop check cannot see it (basenames differ), the candidate check
//       must. No over-refusal: a project at <base>/real/proj, started under <base>/link -> found.
//   12. A start outside $HOME walks as before: home <a>, project <b>/proj -> <b>/proj.
//   13. No `home` option: process.env.HOME is the home (set to <home>, restored after) -> null.
//   14. `home: ''` and (HOME unset, os.homedir() stubbed to '') -> no stop: <home>/<dot dir> is
//       found as before.
//   15. maxUp still bounds the walk.
//   16. isUserHome: true for the home (either spelling), false for a directory below it.
//
// Every home is a hand-built temp tree (lib/__fixtures__/home-dot-dir-fixtures.cjs); nothing reads
// the real $HOME. No legacy name is spelled here: it comes from LEGACY.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const compat = require('./compat.cjs');
const { LEGACY } = require('./legacy-names.cjs');
const {
  WATCH_FOOTPRINT,
  mkHome,
  mkRepoBelow,
  mkProjectBelow,
  linkHome,
  userFileDir,
  writeUserFile,
  rmHome,
} = require('./__fixtures__/home-dot-dir-fixtures.cjs');

const { planningDir: OLD_PLAN_DIR } = LEGACY;

/** A home holding the watcher's footprint; `fn(home)`; removed afterwards. */
function withWatchHome(fn) {
  const { home } = mkHome({ dotDir: WATCH_FOOTPRINT });
  try {
    fn(home);
  } finally {
    rmHome(home);
  }
}

function mkSub(root, name = 'sub') {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('findProjectRoot stops at $HOME (TRD 73-09)', () => {
  test('7. a repo below a home holding only the dot directory -> null', () => {
    withWatchHome((home) => {
      const start = mkSub(mkRepoBelow(home));
      assert.equal(compat.findProjectRoot(start, { home }), null);
      assert.equal(compat.findProjectRoot(start, { home, maxUp: Infinity }), null);
    });
  });

  test('8. a start equal to $HOME -> null', () => {
    withWatchHome((home) => {
      assert.equal(compat.findProjectRoot(home, { home }), null);
      assert.equal(compat.findProjectRoot(fs.realpathSync(home), { home }), null, 'the realpath spelling of $HOME too');
    });
  });

  test('9. a real project below $HOME is still found', () => {
    withWatchHome((home) => {
      const proj = mkProjectBelow(home);
      assert.equal(compat.findProjectRoot(mkSub(proj), { home }), proj);
    });
  });

  test('10. the legacy planning directory at $HOME -> null', () => {
    const { home } = mkHome();
    try {
      fs.mkdirSync(path.join(home, OLD_PLAN_DIR), { recursive: true });
      fs.writeFileSync(path.join(home, OLD_PLAN_DIR, 'watch.log'), 'x\n');
      const start = mkSub(mkRepoBelow(home));
      assert.equal(compat.findProjectRoot(start, { home }), null);
      assert.equal(compat.findProjectRoot(home, { home }), null);
    } finally {
      rmHome(home);
    }
  });

  describe('11. a home reached under a symlink with a different basename', () => {
    test('HOME=<base>/link, start <base>/real/repo -> null', () => {
      const { base, real, link } = linkHome({ dotDir: WATCH_FOOTPRINT });
      try {
        const start = mkRepoBelow(real);
        assert.equal(compat.findProjectRoot(start, { home: link }), null);
      } finally {
        rmHome(base);
      }
    });

    test('HOME=<base>/real, start <base>/link/repo -> null', () => {
      const { base, real, link } = linkHome({ dotDir: WATCH_FOOTPRINT });
      try {
        mkRepoBelow(real);
        assert.equal(compat.findProjectRoot(path.join(link, 'repo'), { home: real }), null);
      } finally {
        rmHome(base);
      }
    });

    test('no over-refusal: HOME=<base>/real, project at <base>/real/proj, start <base>/link/proj/sub -> <base>/link/proj', () => {
      const { base, real, link } = linkHome({ dotDir: WATCH_FOOTPRINT });
      try {
        mkSub(mkProjectBelow(real));
        assert.equal(compat.findProjectRoot(path.join(link, 'proj', 'sub'), { home: real }), path.join(link, 'proj'));
      } finally {
        rmHome(base);
      }
    });
  });

  test('12. a start outside $HOME walks as before', () => {
    const a = mkHome({ dotDir: WATCH_FOOTPRINT }).home;
    const b = mkHome().home;
    try {
      const proj = mkProjectBelow(b);
      assert.equal(compat.findProjectRoot(mkSub(proj, 'x'), { home: a }), proj);
    } finally {
      rmHome(a, b);
    }
  });

  test('13. with no home option, process.env.HOME is the home', () => {
    withWatchHome((home) => {
      const start = mkRepoBelow(home);
      const saved = process.env.HOME;
      process.env.HOME = home;
      try {
        assert.equal(compat.findProjectRoot(start), null);
      } finally {
        process.env.HOME = saved;
      }
    });
  });

  test('14. no home (home: \'\', or HOME unset and os.homedir() empty) -> no stop at all', () => {
    withWatchHome((home) => {
      const start = mkRepoBelow(home);
      assert.equal(compat.findProjectRoot(start, { home: '' }), home);

      const savedHome = process.env.HOME;
      const savedHomedir = os.homedir;
      delete process.env.HOME;
      os.homedir = () => '';
      try {
        assert.equal(compat.findProjectRoot(start), home);
      } finally {
        os.homedir = savedHomedir;
        if (savedHome === undefined) delete process.env.HOME;
        else process.env.HOME = savedHome;
      }
    });
  });

  test('15. maxUp still bounds the walk', () => {
    withWatchHome((home) => {
      const proj = mkProjectBelow(home);
      const start = mkSub(proj);
      assert.equal(compat.findProjectRoot(start, { home, maxUp: 0 }), null);
      assert.equal(compat.findProjectRoot(start, { home, maxUp: 1 }), proj);
    });
  });
});

describe('isUserHome (TRD 73-09)', () => {
  test('16. true for $HOME in either spelling, false for a directory below it', () => {
    withWatchHome((home) => {
      const repo = mkRepoBelow(home);
      assert.equal(compat.isUserHome(home, { home }), true);
      assert.equal(compat.isUserHome(fs.realpathSync(home), { home }), true);
      assert.equal(compat.isUserHome(repo, { home }), false);
      assert.equal(compat.isUserHome(home, { home: '' }), false, 'no home, nothing is the home');
    });
  });
});

// ─── TRD 73-11: user files resolve from the runtime home ─────────────────────────
//
// Test list (73-11 numbering; the pre-rename location is pinned in compat.legacy.test.cjs, the
// allowlist in watcher-allowlist.test.cjs):
//   1. watchStateDir(h) is <h>/.claude/aoforge/state/watch.
//   2. resolveUserFile(h, 'defaults.json'), nothing on disk -> the runtime-home path, 'current'.
//   3. Only <h>/<dot dir>/defaults.json -> that path, 'interim'.
//   4. A runtime-home file and a dot-dir file -> the runtime-home file, 'current'.
//   5. currentDir: watchStateDir(h): the file in the watch directory -> 'current'; only the dot-dir
//      file -> 'interim'.
//   6. A directory (not a file) at the runtime-home path is skipped, as isFile does.
//   7. userDotFile(h, name) equals resolveUserFile(h, name).file for cases 2-4.

/** A bare temp home; `fn(home)`; removed afterwards. */
function withBareHome(fn) {
  const { home } = mkHome();
  try {
    fn(home);
  } finally {
    rmHome(home);
  }
}

describe('watchStateDir and resolveUserFile (TRD 73-11)', () => {
  test('73-11 1. watchStateDir(h) is <h>/.claude/aoforge/state/watch', () => {
    assert.equal(typeof compat.watchStateDir, 'function', 'compat exports watchStateDir');
    assert.equal(compat.watchStateDir('/home/u'), path.join('/home/u', '.claude', 'aoforge', 'state', 'watch'));
    withBareHome((home) => {
      assert.equal(compat.watchStateDir(home), userFileDir(home, 'watch'));
    });
  });

  test('73-11 2. nothing on disk -> the runtime-home path, which: current', () => {
    withBareHome((home) => {
      assert.deepEqual(compat.resolveUserFile(home, 'defaults.json'), {
        file: path.join(home, '.claude', 'aoforge', 'defaults.json'),
        which: 'current',
      });
      assert.equal(fs.existsSync(path.join(home, '.claude')), false, 'resolving creates nothing');
      assert.equal(fs.existsSync(userFileDir(home, 'interim')), false, 'resolving creates nothing');
    });
  });

  test('73-11 3. only the dot-dir file -> it, which: interim', () => {
    withBareHome((home) => {
      const interim = writeUserFile(home, 'interim', 'defaults.json');
      assert.deepEqual(compat.resolveUserFile(home, 'defaults.json'), { file: interim, which: 'interim' });
    });
  });

  test('73-11 4. a runtime-home file and a dot-dir file -> the runtime-home file, which: current', () => {
    withBareHome((home) => {
      const current = writeUserFile(home, 'current', 'defaults.json', '{"a":1}');
      const interim = writeUserFile(home, 'interim', 'defaults.json', '{"a":2}');
      assert.deepEqual(compat.resolveUserFile(home, 'defaults.json'), { file: current, which: 'current' });
      assert.equal(fs.readFileSync(interim, 'utf8'), '{"a":2}', 'the dot-dir file is left as it was');
    });
  });

  test('73-11 5. currentDir: the watch directory is current, the dot-dir file is interim', () => {
    withBareHome((home) => {
      const interim = writeUserFile(home, 'interim', 'x.pid', '1');
      const currentDir = compat.watchStateDir(home);
      assert.deepEqual(compat.resolveUserFile(home, 'x.pid', { currentDir }), { file: interim, which: 'interim' });

      const watched = writeUserFile(home, 'watch', 'x.pid', '2');
      assert.deepEqual(compat.resolveUserFile(home, 'x.pid', { currentDir }), { file: watched, which: 'current' });
    });
    withBareHome((home) => {
      const currentDir = compat.watchStateDir(home);
      assert.deepEqual(
        compat.resolveUserFile(home, 'x.pid', { currentDir }),
        { file: path.join(currentDir, 'x.pid'), which: 'current' },
        'nothing anywhere -> the path under currentDir',
      );
    });
  });

  test('73-11 6. a directory at the runtime-home path is skipped', () => {
    withBareHome((home) => {
      fs.mkdirSync(path.join(userFileDir(home, 'current'), 'defaults.json'), { recursive: true });
      const interim = writeUserFile(home, 'interim', 'defaults.json');
      assert.deepEqual(compat.resolveUserFile(home, 'defaults.json'), { file: interim, which: 'interim' });
      assert.equal(compat.userDotFile(home, 'defaults.json'), interim);
    });
  });

  test('73-11 7. userDotFile is resolveUserFile(...).file', () => {
    const cases = [
      () => {},
      (home) => writeUserFile(home, 'interim', 'defaults.json'),
      (home) => {
        writeUserFile(home, 'current', 'defaults.json');
        writeUserFile(home, 'interim', 'defaults.json');
      },
    ];
    for (const [i, build] of cases.entries()) {
      withBareHome((home) => {
        build(home);
        assert.equal(
          compat.userDotFile(home, 'defaults.json'),
          compat.resolveUserFile(home, 'defaults.json').file,
          `case ${i + 2}`,
        );
      });
    }
  });
});
