'use strict';

// Test list (objective 72, TRD 72-02):
//  5. aliasLegacyEnv copies DEVFLOW_X to AOFORGE_X, keeps the legacy key, returns the aliased names.
//  6. Both set with different values: the AOFORGE value wins, nothing returned for it.
//  7. A bare DEVFLOW_ (empty suffix) and a lowercase devflow_x are ignored.
//  8. The default argument is process.env.
//  9. planningDirName: aoforge only, planning only, both, neither, a FILE named .aoforge.
// 10. planningRoot joins planningDirName onto the root.
// 11. isLegacyPlanning is true only for a planning-only root; bothPlanningDirs only for both.
// 12. findProjectRoot: nearest wins, aoforge wins at the same level, none -> null, maxUp respected.
// 13. isOwnAgentType accepts aoforge: and devflow: and nothing else.
// 14. userDotFile (TRD 73-11 order): the runtime home, then ~/.aoforge/ (3.0.0), then the old dot dir,
//     else the runtime-home path. 14b-14e: legacy only, none, ~/.aoforge/ over the old dir, legacyName.
// 15. runtimeHome and legacyRuntimeHome.
// 16. Source guard: compat.cjs spells no legacy name.
// 17-19 (TRD 72-05): planningRel, PLANNING_DIR_NAMES/isPlanningDirName, planningDirLabel.
// 13b (TRD 72-10): isOwnAgentType rejects an empty agent name in either namespace (the gates trusted only a
//     non-empty name before the shim); isOwnExecutor is an own type whose agent is `executor`.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const compat = require('./compat.cjs');
const { projectTree, legacyEnv, fakeHome } = require('./__fixtures__/legacy-fixtures.cjs');
const { writeUserFile } = require('./__fixtures__/home-dot-dir-fixtures.cjs');

describe('compat.aliasLegacyEnv', () => {
  it('5. copies the legacy variable to the new prefix, keeps the legacy key, returns the names', () => {
    const env = { DEVFLOW_SKIP_EDIT_GATE: '1' };
    const aliased = compat.aliasLegacyEnv(env);
    assert.equal(env.AOFORGE_SKIP_EDIT_GATE, '1');
    assert.equal(env.DEVFLOW_SKIP_EDIT_GATE, '1');
    assert.deepEqual(aliased, ['AOFORGE_SKIP_EDIT_GATE']);
  });

  it('5b. returns the aliased names sorted', () => {
    const env = legacyEnv();
    const aliased = compat.aliasLegacyEnv(env);
    assert.deepEqual(aliased, ['AOFORGE_CALIBRATION_PATH', 'AOFORGE_SKIP_EDIT_GATE']);
    assert.equal(env.AOFORGE_CALIBRATION_PATH, '/tmp/x.json');
  });

  it('6. the new-prefix value wins when both are set', () => {
    const env = { DEVFLOW_SKIP_EDIT_GATE: '1', AOFORGE_SKIP_EDIT_GATE: '0' };
    const aliased = compat.aliasLegacyEnv(env);
    assert.equal(env.AOFORGE_SKIP_EDIT_GATE, '0');
    assert.equal(env.DEVFLOW_SKIP_EDIT_GATE, '1');
    assert.deepEqual(aliased, []);
  });

  it('7. ignores a bare prefix and a lowercase prefix', () => {
    const env = { DEVFLOW_: 'x', devflow_x: 'y' };
    const aliased = compat.aliasLegacyEnv(env);
    assert.deepEqual(aliased, []);
    assert.deepEqual(Object.keys(env).sort(), ['DEVFLOW_', 'devflow_x']);
  });

  it('8. defaults to process.env', () => {
    const before = { ...process.env };
    try {
      process.env.DEVFLOW_COMPAT_PROBE_72 = 'yes';
      delete process.env.AOFORGE_COMPAT_PROBE_72;
      const aliased = compat.aliasLegacyEnv();
      assert.ok(aliased.includes('AOFORGE_COMPAT_PROBE_72'));
      assert.equal(process.env.AOFORGE_COMPAT_PROBE_72, 'yes');
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in before)) delete process.env[key];
      }
      Object.assign(process.env, before);
    }
  });
});

describe('compat planning directory', () => {
  it('9. planningDirName picks the right directory', () => {
    const cases = [
      { layout: 'aoforge', want: '.aoforge' },
      { layout: 'legacy', want: '.planning' },
      { layout: 'both', want: '.aoforge' },
      { layout: 'none', want: '.aoforge' },
    ];
    for (const { layout, want } of cases) {
      const t = projectTree({ layout });
      try {
        assert.equal(compat.planningDirName(t.root), want, `layout ${layout}`);
      } finally {
        t.cleanup();
      }
    }
  });

  it('9b. a FILE named .aoforge beside a planning directory is not a planning directory', () => {
    const t = projectTree({ layout: 'legacy', files: { '.aoforge': 'not a dir' } });
    try {
      assert.equal(compat.planningDirName(t.root), '.planning');
      assert.equal(compat.isLegacyPlanning(t.root), true);
    } finally {
      t.cleanup();
    }
  });

  it('10. planningRoot joins the chosen name onto the root', () => {
    for (const layout of ['aoforge', 'legacy', 'both', 'none']) {
      const t = projectTree({ layout });
      try {
        assert.equal(
          compat.planningRoot(t.root),
          path.join(t.root, compat.planningDirName(t.root)),
          `layout ${layout}`,
        );
      } finally {
        t.cleanup();
      }
    }
  });

  it('11. isLegacyPlanning and bothPlanningDirs', () => {
    const want = {
      aoforge: { legacy: false, both: false },
      legacy: { legacy: true, both: false },
      both: { legacy: false, both: true },
      none: { legacy: false, both: false },
    };
    for (const [layout, expected] of Object.entries(want)) {
      const t = projectTree({ layout });
      try {
        assert.equal(compat.isLegacyPlanning(t.root), expected.legacy, `legacy ${layout}`);
        assert.equal(compat.bothPlanningDirs(t.root), expected.both, `both ${layout}`);
      } finally {
        t.cleanup();
      }
    }
  });

  it('does not cache: the answer follows a directory moved mid-process', () => {
    const t = projectTree({ layout: 'legacy' });
    try {
      assert.equal(compat.planningDirName(t.root), '.planning');
      fs.renameSync(path.join(t.root, '.planning'), path.join(t.root, '.aoforge'));
      assert.equal(compat.planningDirName(t.root), '.aoforge');
    } finally {
      t.cleanup();
    }
  });
});

describe('compat planning-directory helpers for callers (TRD 72-05)', () => {
  it('17. planningRel names a path inside the resolved directory, posix, relative to the root', () => {
    const want = { aoforge: '.aoforge', legacy: '.planning', both: '.aoforge', none: '.aoforge' };
    for (const [layout, dir] of Object.entries(want)) {
      const t = projectTree({ layout });
      try {
        assert.equal(compat.planningRel(t.root), dir, `layout ${layout}`);
        assert.equal(compat.planningRel(t.root, 'STATE.md'), `${dir}/STATE.md`, `layout ${layout}`);
        assert.equal(
          compat.planningRel(t.root, 'objectives', '01-x/OBJECTIVE.md'),
          `${dir}/objectives/01-x/OBJECTIVE.md`,
          `layout ${layout}`,
        );
      } finally {
        t.cleanup();
      }
    }
  });

  it('18. PLANNING_DIR_NAMES lists the new name first, then the legacy one; isPlanningDirName matches only those', () => {
    assert.deepEqual(compat.PLANNING_DIR_NAMES, ['.aoforge', '.planning']);
    assert.equal(Object.isFrozen(compat.PLANNING_DIR_NAMES), true);
    assert.equal(compat.isPlanningDirName('.aoforge'), true);
    assert.equal(compat.isPlanningDirName('.planning'), true);
    for (const other of ['aoforge', 'planning', '.aoforge/', '.devflow', '', null, undefined]) {
      assert.equal(compat.isPlanningDirName(other), false, String(other));
    }
  });

  it('19. planningDirLabel names both directories for a "not found" message', () => {
    assert.equal(compat.planningDirLabel(), '.aoforge/ (or legacy .planning/)');
  });
});

describe('compat.findProjectRoot', () => {
  it('12. finds the planning directory at the root', () => {
    const t = projectTree({ layout: 'legacy', nested: 'a/b' });
    try {
      assert.equal(compat.findProjectRoot(path.join(t.root, 'a', 'b')), t.root);
    } finally {
      t.cleanup();
    }
  });

  it('12b. the nearest ancestor wins over a farther one', () => {
    const t = projectTree({ layout: 'legacy', nested: 'a/b' });
    try {
      fs.mkdirSync(path.join(t.root, 'a', '.aoforge'));
      assert.equal(compat.findProjectRoot(path.join(t.root, 'a', 'b')), path.join(t.root, 'a'));
    } finally {
      t.cleanup();
    }
  });

  it('12c. a level holding either directory is returned, start included', () => {
    const t = projectTree({ layout: 'both', nested: 'a' });
    try {
      assert.equal(compat.findProjectRoot(t.root), t.root);
      assert.equal(compat.findProjectRoot(path.join(t.root, 'a')), t.root);
    } finally {
      t.cleanup();
    }
  });

  it('12d. returns null when nothing is found within the walk', () => {
    const t = projectTree({ layout: 'none', nested: 'a/b' });
    try {
      assert.equal(compat.findProjectRoot(path.join(t.root, 'a', 'b'), { maxUp: 2 }), null);
    } finally {
      t.cleanup();
    }
  });

  it('12e. returns null with an injected filesystem that has no planning directory', () => {
    const fsImpl = { statSync: () => undefined };
    assert.equal(compat.findProjectRoot('/x/y/z', { fsImpl }), null);
  });

  it('12f. respects maxUp', () => {
    const t = projectTree({ layout: 'legacy', nested: 'a/b' });
    try {
      const start = path.join(t.root, 'a', 'b');
      assert.equal(compat.findProjectRoot(start, { maxUp: 1 }), null);
      assert.equal(compat.findProjectRoot(start, { maxUp: 2 }), t.root);
    } finally {
      t.cleanup();
    }
  });

  it('12g. a file named like a planning directory does not count', () => {
    const t = projectTree({ layout: 'none', files: { '.aoforge': 'file', '.planning': 'file' } });
    try {
      assert.equal(compat.findProjectRoot(t.root, { maxUp: 0 }), null);
    } finally {
      t.cleanup();
    }
  });
});

describe('compat.isOwnAgentType', () => {
  it('13. accepts both namespaces and nothing else', () => {
    assert.equal(compat.isOwnAgentType('aoforge:executor'), true);
    assert.equal(compat.isOwnAgentType('devflow:planner'), true);
    assert.equal(compat.isOwnAgentType('aoforgex:a'), false);
    assert.equal(compat.isOwnAgentType('Explore'), false);
    assert.equal(compat.isOwnAgentType(''), false);
    assert.equal(compat.isOwnAgentType(null), false);
    assert.equal(compat.isOwnAgentType(undefined), false);
    assert.equal(compat.isOwnAgentType(42), false);
  });

  it('13b. rejects an empty agent name in either namespace (TRD 72-10)', () => {
    assert.equal(compat.isOwnAgentType('aoforge:'), false);
    assert.equal(compat.isOwnAgentType('devflow:'), false);
    assert.equal(compat.isOwnAgentType('x:devflow:a'), false);
    assert.equal(compat.isOwnAgentType('DEVFLOW:executor'), false);
  });
});

describe('compat.isOwnExecutor (TRD 72-10)', () => {
  it('13b. the executor in either namespace, nothing else', () => {
    assert.equal(compat.isOwnExecutor('aoforge:executor'), true);
    assert.equal(compat.isOwnExecutor('devflow:executor'), true);
    for (const t of ['aoforge:verifier', 'devflow:planner', 'executor', 'Explore:executor', 'aoforge:executor-x',
      'aoforge:', ':executor', '', null, undefined, 42]) {
      assert.equal(compat.isOwnExecutor(t), false, JSON.stringify(t));
    }
  });
});

describe('compat user dot directory and runtime home', () => {
  // TRD 73-11: the runtime home first, then ~/.aoforge/ (3.0.0), then ~/.devflow/ (pre-rename).
  const runtimeFile = (home, name) => path.join(home, '.claude', 'aoforge', name);

  it('14. userDotFile prefers the runtime home over ~/.aoforge/ and ~/.devflow/', () => {
    const h = fakeHome({ legacyDot: { 'defaults.json': '{}' }, newDot: { 'defaults.json': '{}' } });
    try {
      writeUserFile(h.home, 'current', 'defaults.json');
      const want = runtimeFile(h.home, 'defaults.json');
      assert.equal(compat.userDotFile(h.home, 'defaults.json'), want);
      assert.deepEqual(compat.resolveUserFile(h.home, 'defaults.json'), { file: want, which: 'current' });
    } finally {
      h.cleanup();
    }
  });

  it('14b. userDotFile falls back to ~/.devflow/ when only it has the file (which: legacy)', () => {
    const h = fakeHome({ legacyDot: { 'defaults.json': '{}' } });
    try {
      const want = path.join(h.home, '.devflow', 'defaults.json');
      assert.equal(compat.userDotFile(h.home, 'defaults.json'), want);
      assert.deepEqual(compat.resolveUserFile(h.home, 'defaults.json'), { file: want, which: 'legacy' });
    } finally {
      h.cleanup();
    }
  });

  it('14c. userDotFile returns the runtime-home path when no location has the file', () => {
    const h = fakeHome();
    try {
      const want = runtimeFile(h.home, 'defaults.json');
      assert.equal(compat.userDotFile(h.home, 'defaults.json'), want);
      assert.deepEqual(compat.resolveUserFile(h.home, 'defaults.json'), { file: want, which: 'current' });
      assert.equal(fs.existsSync(path.join(h.home, '.aoforge')), false, 'nothing is created in ~/.aoforge/');
      assert.equal(fs.existsSync(path.join(h.home, '.devflow')), false, 'nothing is created in ~/.devflow/');
    } finally {
      h.cleanup();
    }
  });

  it('14d. ~/.aoforge/ (3.0.0) beats ~/.devflow/ when the runtime home has none (which: interim)', () => {
    const h = fakeHome({ legacyDot: { 'defaults.json': '{}' }, newDot: { 'defaults.json': '{}' } });
    try {
      const want = path.join(h.home, '.aoforge', 'defaults.json');
      assert.equal(compat.userDotFile(h.home, 'defaults.json'), want);
      assert.deepEqual(compat.resolveUserFile(h.home, 'defaults.json'), { file: want, which: 'interim' });
    } finally {
      h.cleanup();
    }
  });

  it('14e. legacyName names the file under ~/.devflow/ (the watch daemon renamed its files)', () => {
    const h = fakeHome({ legacyDot: { 'devflow-watch-allow.json': '{}' } });
    try {
      const want = path.join(h.home, '.devflow', 'devflow-watch-allow.json');
      assert.equal(compat.userDotFile(h.home, 'aoforge-watch-allow.json', fs, 'devflow-watch-allow.json'), want);
      assert.deepEqual(
        compat.resolveUserFile(h.home, 'aoforge-watch-allow.json', { legacyName: 'devflow-watch-allow.json' }),
        { file: want, which: 'legacy' },
      );
      assert.equal(
        compat.userDotFile(h.home, 'aoforge-watch-allow.json'),
        runtimeFile(h.home, 'aoforge-watch-allow.json'),
        'without legacyName the pre-rename file is not looked for under the new name',
      );
    } finally {
      h.cleanup();
    }
  });

  it('15. runtimeHome and legacyRuntimeHome', () => {
    assert.equal(compat.runtimeHome('/home/u'), path.join('/home/u', '.claude', 'aoforge'));
    assert.equal(compat.legacyRuntimeHome('/home/u'), path.join('/home/u', '.claude', 'devflow'));
  });
});

describe('compat source guard', () => {
  it('16. compat.cjs spells no legacy name', () => {
    const text = fs.readFileSync(path.join(__dirname, 'compat.cjs'), 'utf8');
    for (const literal of ['devflow', 'DevFlow', 'DEVFLOW', '.planning', 'df-tools']) {
      assert.equal(text.includes(literal), false, `compat.cjs contains ${literal}`);
    }
  });
});
