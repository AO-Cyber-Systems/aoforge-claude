'use strict';

// compat.legacy.test.cjs — compat.cjs reads AOForge names only (objective 78, TRD 78-11, SC-1/SC-4).
//
// Until 3.1.0 compat held the one-release shims of the rename (objective 72): the legacy planning directory, the
// pre-rename agent namespace, the 3.0.0 and pre-rename user dot directories. TRD 78-11 removed them; this file pins
// that each pre-rename name is now ignored. aliasLegacyEnv is the last shim; TRD 78-12 deletes it with its cases.
//
// Test list (written before the implementation; TRD 78-11 test-list numbers in brackets):
//  5-8. aliasLegacyEnv (TRD 72-02; unchanged, removed by 78-12).
//  9. [4] planningDirName is `.aoforge` for every layout (aoforge, legacy, both, none); 9b: a FILE named
//     `.aoforge` beside the legacy directory changes nothing.
// 10. [4] planningRoot is <root>/.aoforge for every layout; 10b: nothing is cached or resolved from the disk.
// 11. [4] the deleted exports are undefined: isLegacyPlanning, bothPlanningDirs, legacyRuntimeHome, resolveUserFile.
// 17. [4] planningRel names `.aoforge/...` for every layout.
// 18. [4] PLANNING_DIR_NAMES deep-equals ['.aoforge'] (frozen); isPlanningDirName accepts `.aoforge` only.
// 19. [4] planningDirLabel() is `.aoforge/`.
// 12. [4] findProjectRoot: an `.aoforge/` project is found from below; a legacy-only project below a fake HOME is
//     not (null); a legacy directory between the start and an `.aoforge/` project is walked past; a nested
//     `.aoforge/` inside a legacy-only parent wins; 12d-12g as before (nothing found, injected fs, maxUp, files).
// 13. [4] isOwnAgentType accepts `aoforge:<name>` only; the pre-rename namespace is not ours.
// 13b. [4] isOwnExecutor is `aoforge:executor` only.
// 14. [5] userDotFile(home, name) is <home>/.claude/aoforge/<name> whatever ~/.aoforge/ or the pre-rename dot
//     directory hold; the old extra arguments (fsImpl, legacyName) change nothing; nothing is created.
// 15. runtimeHome.
// 16. Source guard: compat.cjs spells no legacy name, and apart from aliasLegacyEnv it uses nothing from LEGACY.
// 20. [3] CLI in a legacy-only project: `validate health --raw` is broken with W066 (78-01), `state load` is refused
//     with legacyLayoutMessage (78-07), `doctor --json` carries the note (78-01), and `.aoforge/` never appears.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const compat = require('./compat.cjs');
const { legacyLayoutMessage } = require('./planning-layout.cjs');
const { projectTree, legacyEnv, fakeHome } = require('./__fixtures__/legacy-fixtures.cjs');
const { planningProject } = require('./__fixtures__/legacy-layout-fixtures.cjs');

const AOF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');
const LAYOUTS = ['aoforge', 'legacy', 'both', 'none'];

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

/** Run `fn(t)` on a projectTree in `layout`, removed afterwards. */
function withTree(opts, fn) {
  const t = projectTree(opts);
  try {
    return fn(t);
  } finally {
    t.cleanup();
  }
}

describe('compat planning directory: .aoforge only (TRD 78-11)', () => {
  it('9. planningDirName is .aoforge for every layout, the legacy-only one included', () => {
    for (const layout of LAYOUTS) {
      withTree({ layout }, (t) => {
        assert.equal(compat.planningDirName(t.root), '.aoforge', `layout ${layout}`);
      });
    }
  });

  it('9b. a FILE named .aoforge beside the legacy directory changes nothing', () => {
    withTree({ layout: 'legacy', files: { '.aoforge': 'not a dir' } }, (t) => {
      assert.equal(compat.planningDirName(t.root), '.aoforge');
      assert.equal(fs.statSync(path.join(t.root, '.aoforge')).isFile(), true, 'the file is left as it was');
    });
  });

  it('10. planningRoot is <root>/.aoforge for every layout', () => {
    for (const layout of LAYOUTS) {
      withTree({ layout }, (t) => {
        assert.equal(compat.planningRoot(t.root), path.join(t.root, '.aoforge'), `layout ${layout}`);
      });
    }
  });

  it('10b. the answer does not depend on the disk: a legacy directory renamed mid-process changes nothing', () => {
    withTree({ layout: 'legacy' }, (t) => {
      assert.equal(compat.planningDirName(t.root), '.aoforge');
      fs.renameSync(path.join(t.root, '.planning'), path.join(t.root, '.aoforge'));
      assert.equal(compat.planningDirName(t.root), '.aoforge');
      assert.equal(compat.planningDirName(path.join(t.root, 'missing')), '.aoforge', 'a missing root too');
    });
  });

  it('11. the legacy-only exports are gone', () => {
    for (const name of ['isLegacyPlanning', 'bothPlanningDirs', 'legacyRuntimeHome', 'resolveUserFile']) {
      assert.equal(name in compat, false, `compat still exports ${name}`);
      assert.equal(compat[name], undefined, name);
    }
  });
});

describe('compat planning-directory helpers for callers (TRD 72-05, single name since 78-11)', () => {
  it('17. planningRel names a path inside .aoforge/, posix, relative to the root, for every layout', () => {
    for (const layout of LAYOUTS) {
      withTree({ layout }, (t) => {
        assert.equal(compat.planningRel(t.root), '.aoforge', `layout ${layout}`);
        assert.equal(compat.planningRel(t.root, 'STATE.md'), '.aoforge/STATE.md', `layout ${layout}`);
        assert.equal(
          compat.planningRel(t.root, 'objectives', '01-x/OBJECTIVE.md'),
          '.aoforge/objectives/01-x/OBJECTIVE.md',
          `layout ${layout}`,
        );
      });
    }
  });

  it('18. PLANNING_DIR_NAMES is [".aoforge"]; isPlanningDirName accepts .aoforge only', () => {
    assert.deepEqual(compat.PLANNING_DIR_NAMES, ['.aoforge']);
    assert.equal(Object.isFrozen(compat.PLANNING_DIR_NAMES), true);
    assert.equal(compat.isPlanningDirName('.aoforge'), true);
    assert.equal(compat.isPlanningDirName('.planning'), false, 'the legacy directory is not a planning directory');
    for (const other of ['aoforge', 'planning', '.aoforge/', '.devflow', '', null, undefined]) {
      assert.equal(compat.isPlanningDirName(other), false, String(other));
    }
  });

  it('19. planningDirLabel names .aoforge/ alone', () => {
    assert.equal(compat.planningDirLabel(), '.aoforge/');
  });
});

describe('compat.findProjectRoot: .aoforge only (TRD 78-11)', () => {
  it('12. finds the .aoforge/ project root from below', () => {
    withTree({ layout: 'aoforge', nested: 'a/b' }, (t) => {
      assert.equal(compat.findProjectRoot(path.join(t.root, 'a', 'b')), t.root);
    });
  });

  it('12a. a legacy-only project below a fake HOME is not a project, from its root or below', () => {
    const h = fakeHome();
    try {
      const proj = path.join(h.home, 'proj');
      fs.mkdirSync(path.join(proj, '.planning'), { recursive: true });
      fs.writeFileSync(path.join(proj, '.planning', 'STATE.md'), '# State\n');
      fs.mkdirSync(path.join(proj, 'a', 'b'), { recursive: true });
      assert.equal(compat.findProjectRoot(proj, { home: h.home }), null);
      assert.equal(compat.findProjectRoot(path.join(proj, 'a', 'b'), { home: h.home }), null);
      assert.equal(fs.existsSync(path.join(proj, '.aoforge')), false, 'nothing is created');
    } finally {
      h.cleanup();
    }
  });

  it('12b. a legacy directory between the start and an .aoforge/ project is walked past', () => {
    withTree({ layout: 'aoforge', nested: 'a/b' }, (t) => {
      fs.mkdirSync(path.join(t.root, 'a', '.planning'));
      assert.equal(compat.findProjectRoot(path.join(t.root, 'a', 'b')), t.root);
    });
  });

  it('12b2. an .aoforge/ nested inside a legacy-only parent is the root', () => {
    withTree({ layout: 'legacy', nested: 'a/b' }, (t) => {
      fs.mkdirSync(path.join(t.root, 'a', '.aoforge'));
      assert.equal(compat.findProjectRoot(path.join(t.root, 'a', 'b')), path.join(t.root, 'a'));
    });
  });

  it('12c. layout both: the level is found through its .aoforge/, start included', () => {
    withTree({ layout: 'both', nested: 'a' }, (t) => {
      assert.equal(compat.findProjectRoot(t.root), t.root);
      assert.equal(compat.findProjectRoot(path.join(t.root, 'a')), t.root);
    });
  });

  it('12d. returns null when nothing is found within the walk', () => {
    withTree({ layout: 'none', nested: 'a/b' }, (t) => {
      assert.equal(compat.findProjectRoot(path.join(t.root, 'a', 'b'), { maxUp: 2 }), null);
    });
  });

  it('12e. returns null with an injected filesystem that has no planning directory', () => {
    const fsImpl = { statSync: () => undefined };
    assert.equal(compat.findProjectRoot('/x/y/z', { fsImpl }), null);
  });

  it('12e2. an injected filesystem holding only the legacy directory -> null', () => {
    const fsImpl = { statSync: (p) => (p === path.resolve('/x/.planning') ? { isDirectory: () => true } : undefined) };
    assert.equal(compat.findProjectRoot('/x/y/z', { fsImpl, home: '' }), null);
  });

  it('12f. respects maxUp', () => {
    withTree({ layout: 'aoforge', nested: 'a/b' }, (t) => {
      const start = path.join(t.root, 'a', 'b');
      assert.equal(compat.findProjectRoot(start, { maxUp: 1 }), null);
      assert.equal(compat.findProjectRoot(start, { maxUp: 2 }), t.root);
    });
  });

  it('12g. a file named like a planning directory does not count', () => {
    withTree({ layout: 'none', files: { '.aoforge': 'file', '.planning': 'file' } }, (t) => {
      assert.equal(compat.findProjectRoot(t.root, { maxUp: 0 }), null);
    });
  });
});

describe('compat.isOwnAgentType: the aoforge namespace only (TRD 78-11)', () => {
  it('13. accepts aoforge:<name> and nothing else; the pre-rename namespace is not ours', () => {
    assert.equal(compat.isOwnAgentType('aoforge:executor'), true);
    assert.equal(compat.isOwnAgentType('aoforge:planner'), true);
    assert.equal(compat.isOwnAgentType('devflow:planner'), false);
    assert.equal(compat.isOwnAgentType('devflow:executor'), false);
    assert.equal(compat.isOwnAgentType('aoforgex:a'), false);
    assert.equal(compat.isOwnAgentType('Explore'), false);
    assert.equal(compat.isOwnAgentType(''), false);
    assert.equal(compat.isOwnAgentType(null), false);
    assert.equal(compat.isOwnAgentType(undefined), false);
    assert.equal(compat.isOwnAgentType(42), false);
  });

  it('13a. rejects an empty agent name and a near miss (TRD 72-10)', () => {
    for (const t of ['aoforge:', 'devflow:', 'x:aoforge:a', 'AOFORGE:executor', 'DEVFLOW:executor']) {
      assert.equal(compat.isOwnAgentType(t), false, t);
    }
  });

  it('13b. isOwnExecutor is aoforge:executor only', () => {
    assert.equal(compat.isOwnExecutor('aoforge:executor'), true);
    for (const t of ['devflow:executor', 'aoforge:verifier', 'devflow:planner', 'executor', 'Explore:executor',
      'aoforge:executor-x', 'aoforge:', ':executor', '', null, undefined, 42]) {
      assert.equal(compat.isOwnExecutor(t), false, JSON.stringify(t));
    }
  });
});

describe('compat user files: the runtime home only (TRD 78-11)', () => {
  const runtimeFile = (home, name) => path.join(home, '.claude', 'aoforge', name);

  it('14. userDotFile is the runtime-home path whatever ~/.aoforge/ and ~/.devflow/ hold', () => {
    const cases = [
      { label: 'only ~/.devflow/', opts: { legacyDot: { 'defaults.json': '{}' } } },
      { label: 'only ~/.aoforge/', opts: { newDot: { 'defaults.json': '{}' } } },
      { label: 'both dot directories', opts: { legacyDot: { 'defaults.json': '{}' }, newDot: { 'defaults.json': '{}' } } },
      { label: 'nothing', opts: {} },
    ];
    for (const { label, opts } of cases) {
      const h = fakeHome(opts);
      try {
        assert.equal(compat.userDotFile(h.home, 'defaults.json'), runtimeFile(h.home, 'defaults.json'), label);
        assert.equal(fs.existsSync(path.join(h.home, '.claude')), false, `${label}: nothing is created`);
      } finally {
        h.cleanup();
      }
    }
  });

  it('14b. with the file in the runtime home too, it is still the runtime-home path', () => {
    const h = fakeHome({ legacyDot: { 'defaults.json': '{}' }, newDot: { 'defaults.json': '{}' } });
    try {
      const want = runtimeFile(h.home, 'defaults.json');
      fs.mkdirSync(path.dirname(want), { recursive: true });
      fs.writeFileSync(want, '{}');
      assert.equal(compat.userDotFile(h.home, 'defaults.json'), want);
    } finally {
      h.cleanup();
    }
  });

  it('14e. the old legacyName argument is ignored: the pre-rename watch allowlist is never named', () => {
    const h = fakeHome({ legacyDot: { 'devflow-watch-allow.json': '{}' } });
    try {
      const want = runtimeFile(h.home, 'aoforge-watch-allow.json');
      assert.equal(compat.userDotFile(h.home, 'aoforge-watch-allow.json', fs, 'devflow-watch-allow.json'), want);
      assert.equal(compat.userDotFile(h.home, 'aoforge-watch-allow.json'), want);
    } finally {
      h.cleanup();
    }
  });

  it('15. runtimeHome is <home>/.claude/aoforge', () => {
    assert.equal(compat.runtimeHome('/home/u'), path.join('/home/u', '.claude', 'aoforge'));
  });
});

describe('compat source guard', () => {
  const text = fs.readFileSync(path.join(__dirname, 'compat.cjs'), 'utf8');

  it('16. compat.cjs spells no legacy name', () => {
    for (const literal of ['devflow', 'DevFlow', 'DEVFLOW', '.planning', 'df-tools']) {
      assert.equal(text.includes(literal), false, `compat.cjs contains ${literal}`);
    }
  });

  it('16b. apart from aliasLegacyEnv (TRD 78-12 removes it), compat.cjs uses nothing from LEGACY', () => {
    const start = text.indexOf('function aliasLegacyEnv(');
    assert.notEqual(start, -1, 'aliasLegacyEnv is still defined until 78-12');
    const end = text.indexOf('\n}\n', start);
    const rest = `${text.slice(0, start)}${text.slice(end + 3)}`;
    const uses = rest.split('\n')
      .filter((line) => /\bLEGACY\b/.test(line))
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .filter((line) => !/require\('\.\/legacy-names\.cjs'\)/.test(line));
    assert.deepEqual(uses, [], `LEGACY outside aliasLegacyEnv:\n${uses.join('\n')}`);
  });
});

// ─── 20. the CLI in a legacy-only project, with no compat fallback ───────────

/** `aof-tools --cwd <root> ...args` from the fixture's parent directory, with its hermetic env. */
function tools(p, args) {
  const r = spawnSync(process.execPath, [AOF_TOOLS, '--cwd', p.root, ...args], {
    cwd: path.dirname(p.root), env: p.env, encoding: 'utf-8', timeout: 120000,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/** stdout as JSON, following an `@file:` spill. */
function jsonOf(r) {
  let text = r.stdout.trim();
  if (text.startsWith('@file:')) text = fs.readFileSync(text.slice('@file:'.length), 'utf-8');
  return JSON.parse(text);
}

describe('20. the CLI in a legacy-only project reports the old layout and creates nothing (78-01/78-07)', () => {
  it('20. validate health broken with W066, state load refused, doctor note, no .aoforge/', () => {
    const p = planningProject({ layout: 'legacy' });
    try {
      const message = legacyLayoutMessage(p.root);

      const health = jsonOf(tools(p, ['validate', 'health', '--raw']));
      assert.equal(health.status, 'broken', JSON.stringify(health));
      assert.deepEqual(health.errors.map((i) => i.code), ['W066'], JSON.stringify(health.errors));

      const state = tools(p, ['state', 'load', '--raw']);
      assert.equal(state.status, 1, `${state.stdout}${state.stderr}`);
      assert.ok(state.stderr.includes(message), state.stderr);

      const doctor = jsonOf(tools(p, ['doctor', '--json']));
      assert.equal(doctor.scope.project, null, JSON.stringify(doctor.scope));
      assert.ok(doctor.notes.includes(message), JSON.stringify(doctor.notes));

      assert.equal(fs.existsSync(path.join(p.root, '.aoforge')), false, 'no command created .aoforge/');
    } finally {
      p.cleanup();
    }
  });
});
