'use strict';

// stack-init.test.cjs — Test list (TRD 35-04, I group)
//
// - I1  listOrgProfiles({userHome:null}) -> []; fake home with two profiles -> both ids w/ detect.
// - I2  go.mod + fake-home golike (detect go.mod) -> pickExtends -> golike.
// - I3  child extends parent, both detect the same marker -> child picked, parent in alternatives.
// - I4  no marker match -> general.
// - I5  explicit --extends wins over detection.
// - I6  draft over golike omits `test` (inherited, scoped kept), includes `lint` (golike's lint
//       is discover).
// - I7  parseProfile(serializeProfile(fm, body)).frontmatter deep-equals fm.
// - I8  draft passes validateProfileText (ok true).
// - I9  initProfile without write -> action preview; no file.
// - I10 write -> written; second write without force -> refused, bytes unchanged; with force ->
//       written.
// - I11 id slug from a mkdtemp-shaped name like `df-Stack_AbC` -> `df-stack-abc`, schema-valid.
// - I12 CLI end-to-end (DoD): Go-shaped fixture -> `stack init --write` exit 0 -> `stack validate`
//       exit 0 -> `stack command test --packages ./pkg --raw` prints `go test -race ./pkg`.
//
// Fixtures are hand-built (`__fixtures__/stack-profile-fixtures.cjs`), never generated — per
// `no_llm_test_data`.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const sp = require('./stack-profile.cjs');
const fx = require('./__fixtures__/stack-profile-fixtures.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');

function run(args, { cwd, home }) {
  const r = spawnSync('node', [TOOLS_PATH, ...args], { cwd, encoding: 'utf-8', env: { ...process.env, HOME: home } });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('listOrgProfiles (I1)', () => {
  test('I1: null userHome -> []; a fake home with two profiles -> both ids, each with its detect list', () => {
    assert.deepStrictEqual(sp.listOrgProfiles({ userHome: null }), []);

    const other = fx.profileMd({
      yaml: ['schema: 1', 'id: other', 'extends: general', 'detect: [pubspec.yaml]'].join('\n'),
    });
    const home = fx.makeHome({ stacks: { golike: fx.orgProfileGoLike(), other } });
    try {
      const profiles = sp.listOrgProfiles({ userHome: home });
      const ids = profiles.map((p) => p.id).sort();
      assert.deepStrictEqual(ids, ['golike', 'other']);
      const golikeEntry = profiles.find((p) => p.id === 'golike');
      assert.deepStrictEqual(golikeEntry.detect, ['go.mod']);
      assert.equal(golikeEntry.extends, 'general');
    } finally {
      fx.cleanup(home);
    }
  });
});

describe('pickExtends (I2-I5)', () => {
  test('I2: go.mod present + fake-home golike (detect go.mod) -> golike', () => {
    const home = fx.makeHome({ stacks: { golike: fx.orgProfileGoLike() } });
    const root = fx.makeProject({ files: fx.goShapedRepo() });
    try {
      const picked = sp.pickExtends({ projectRoot: root, userHome: home, explicit: null });
      assert.equal(picked.id, 'golike');
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('I3: child extends parent, both detect the same marker -> child wins, parent is an alternative', () => {
    const parentMd = fx.profileMd({
      yaml: ['schema: 1', 'id: parentx', 'extends: general', 'detect: [marker.lock]'].join('\n'),
    });
    const childMd = fx.profileMd({
      yaml: ['schema: 1', 'id: childx', 'extends: parentx', 'detect: [marker.lock]'].join('\n'),
    });
    const home = fx.makeHome({ stacks: { parentx: parentMd, childx: childMd } });
    const root = fx.makeProject({ files: { 'marker.lock': '' } });
    try {
      const picked = sp.pickExtends({ projectRoot: root, userHome: home, explicit: null });
      assert.equal(picked.id, 'childx');
      assert.ok(picked.alternatives.includes('parentx'));
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('I4: no installed marker matches this project -> general', () => {
    const home = fx.makeHome({ stacks: { golike: fx.orgProfileGoLike() } });
    const root = fx.makeProject({});
    try {
      const picked = sp.pickExtends({ projectRoot: root, userHome: home, explicit: null });
      assert.equal(picked.id, 'general');
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('I5: an explicit --extends wins over detection', () => {
    const home = fx.makeHome({ stacks: { golike: fx.orgProfileGoLike() } });
    const root = fx.makeProject({});
    try {
      const picked = sp.pickExtends({ projectRoot: root, userHome: home, explicit: 'golike' });
      assert.equal(picked.id, 'golike');
      assert.deepStrictEqual(picked.alternatives, []);
    } finally {
      fx.cleanup(root, home);
    }
  });
});

describe('draftProfile (I6)', () => {
  test('I6: omits a key the parent already resolves (keeping its inherited scoped form); includes a key the parent leaves at discover', () => {
    const home = fx.makeHome({ stacks: { golike: fx.orgProfileGoLike() } });
    const root = fx.makeProject({
      files: {
        '.github/workflows/ci.yml': [
          'jobs:',
          '  t:',
          '    steps:',
          '      - run: make test',
          '      - run: make lint',
        ].join('\n'),
      },
    });
    try {
      const draft = sp.draftProfile({ projectRoot: root, userHome: home, from: 'codebase', extendsId: 'golike' });
      const commands = draft.frontmatter.commands;
      assert.ok(!('test' in commands), 'test is already resolved by golike (non-discover); the draft must not redefine it');
      assert.ok('lint' in commands, 'lint is discover in golike; the draft should fill it from evidence');
      assert.equal(commands.lint.run, 'make lint');
    } finally {
      fx.cleanup(root, home);
    }
  });
});

describe('serializeProfile (I7)', () => {
  test('I7: parseProfile(serializeProfile(fm, body)).frontmatter deep-equals fm', () => {
    const fm = {
      schema: 1,
      id: 'myproj',
      extends: 'golike',
      commands: { lint: { run: 'make lint' } },
      provenance: { reviewed: '2026-01-01', sources: ['.github/workflows/ci.yml'] },
    };
    const text = sp.serializeProfile(fm, '# Stack Profile: myproj\n\n<!-- no H2 below -->\n');
    const reparsed = sp.parseProfile(text).frontmatter;
    assert.deepStrictEqual(reparsed, fm);
  });

  test('I7b: an empty commands object round-trips as an empty object, not null', () => {
    const fm = { schema: 1, id: 'myproj', extends: 'general', commands: {}, provenance: { reviewed: '2026-01-01', sources: [] } };
    const text = sp.serializeProfile(fm, '# Stack Profile: myproj\n');
    const reparsed = sp.parseProfile(text).frontmatter;
    assert.deepStrictEqual(reparsed, fm);
  });
});

describe('draftProfile + validateProfileText (I8)', () => {
  test('I8: a fresh draft passes validateProfileText', () => {
    const home = fx.makeHome({ stacks: { golike: fx.orgProfileGoLike() } });
    const root = fx.makeProject({ files: fx.goShapedRepo() });
    try {
      const draft = sp.draftProfile({ projectRoot: root, userHome: home, from: 'codebase', extendsId: 'golike' });
      const text = sp.serializeProfile(draft.frontmatter, draft.body);
      const result = sp.validateProfileText(text, { projectRoot: root, userHome: home });
      assert.equal(result.ok, true);
      assert.match(draft.frontmatter.provenance.reviewed, /^\d{4}-\d{2}-\d{2}$/);
    } finally {
      fx.cleanup(root, home);
    }
  });
});

describe('initProfile (I9-I11)', () => {
  test('I9: without --write, action is preview and no file is written', () => {
    const home = fx.makeHome({});
    const root = fx.makeProject({});
    try {
      const result = sp.initProfile({ projectRoot: root, userHome: home, from: 'codebase', extendsId: 'general', write: false, force: false });
      assert.equal(result.action, 'preview');
      assert.equal(fs.existsSync(path.join(root, '.planning', 'STACK.md')), false);
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('I10: write -> written; a second write without --force refuses and leaves bytes unchanged; --force writes', () => {
    const home = fx.makeHome({});
    const root = fx.makeProject({});
    const targetPath = path.join(root, '.planning', 'STACK.md');
    try {
      const r1 = sp.initProfile({ projectRoot: root, userHome: home, from: 'codebase', extendsId: 'general', write: true, force: false });
      assert.equal(r1.action, 'written');
      const bytes1 = fs.readFileSync(targetPath, 'utf-8');

      const r2 = sp.initProfile({ projectRoot: root, userHome: home, from: 'codebase', extendsId: 'general', write: true, force: false });
      assert.equal(r2.action, 'refused');
      assert.equal(fs.readFileSync(targetPath, 'utf-8'), bytes1);

      const r3 = sp.initProfile({ projectRoot: root, userHome: home, from: 'codebase', extendsId: 'general', write: true, force: true });
      assert.equal(r3.action, 'written');
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('I11: id slug from a mixed-case/underscore dirname is lowercase-dashed and schema-valid', () => {
    const home = fx.makeHome({});
    const projectRoot = path.join(os.tmpdir(), 'df-Stack_AbC');
    const draft = sp.draftProfile({ projectRoot, userHome: home, from: 'codebase', extendsId: 'general' });
    try {
      assert.equal(draft.frontmatter.id, 'df-stack-abc');
      const text = sp.serializeProfile(draft.frontmatter, draft.body);
      const result = sp.validateProfileText(text, { projectRoot, userHome: home });
      assert.equal(result.ok, true);
    } finally {
      fx.cleanup(home);
    }
  });
});

describe('stack init CLI end-to-end (I12, DoD)', () => {
  test('I12: Go-shaped fixture -> stack init --write -> stack validate -> stack command test --packages ./pkg --raw', () => {
    // Inline org fixture (not the shared orgProfileGoLike(), whose test.scoped is
    // "buildtool test -race {packages}") so the raw output matches the DoD's literal text.
    const golike = fx.profileMd({
      yaml: [
        'schema: 1',
        'id: golike',
        'extends: general',
        'detect: [go.mod]',
        'commands:',
        '  test: { run: "go test ./...", scoped: "go test -race {packages}" }',
      ].join('\n'),
    });
    const home = fx.makeHome({ stacks: { golike } });
    const root = fx.makeProject({ files: fx.goShapedRepo() });
    try {
      const initRes = run(['stack', 'init', '--from', 'codebase', '--write'], { cwd: root, home });
      assert.equal(initRes.code, 0);
      assert.equal(fs.existsSync(path.join(root, '.planning', 'STACK.md')), true);

      const validateRes = run(['stack', 'validate'], { cwd: root, home });
      assert.equal(validateRes.code, 0);

      const cmdRes = run(['stack', 'command', 'test', '--packages', './pkg', '--raw'], { cwd: root, home });
      assert.equal(cmdRes.code, 0);
      assert.equal(cmdRes.stdout, 'go test -race ./pkg');
    } finally {
      fx.cleanup(root, home);
    }
  });
});

// ─── I13: provenance.reviewed is the LOCAL calendar date (TRD 42-01, SDR-07) ──
//
// The fleet dry-run drafted `reviewed: 2026-09-29` at 21:47 local on 2026-09-28: the draft read
// the UTC date. Dates here come from the LOCAL constructor so each assertion holds in every time
// zone (23:30 local is the next UTC day west of Greenwich, 00:30 the previous one east of it).
// Never compare against `toISOString()`.

describe('provenance.reviewed is the local date (I13)', () => {
  const { localDate } = require('./helpers.cjs');

  test('I13a: draftProfile with an injected local 23:30 / 00:30 `now` -> reviewed is that local calendar date', () => {
    const home = fx.makeHome({});
    const root = fx.makeProject({});
    try {
      const late = sp.draftProfile({ projectRoot: root, userHome: home, from: 'codebase', extendsId: 'general', now: new Date(2026, 8, 28, 23, 30) });
      assert.equal(late.frontmatter.provenance.reviewed, '2026-09-28');
      const early = sp.draftProfile({ projectRoot: root, userHome: home, from: 'codebase', extendsId: 'general', now: new Date(2026, 8, 28, 0, 30) });
      assert.equal(early.frontmatter.provenance.reviewed, '2026-09-28');
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('I13b: initProfile passes `now` through to the drafted text (stack init preview)', () => {
    const home = fx.makeHome({});
    const root = fx.makeProject({});
    try {
      const result = sp.initProfile({ projectRoot: root, userHome: home, from: 'codebase', extendsId: 'general', write: false, now: new Date(2026, 8, 28, 23, 30) });
      assert.equal(result.action, 'preview');
      assert.equal(sp.parseProfile(result.text).frontmatter.provenance.reviewed, '2026-09-28');
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('I13c: without an injected `now`, reviewed === helpers.localDate()', () => {
    const home = fx.makeHome({});
    const root = fx.makeProject({});
    try {
      const before = localDate();
      const result = sp.initProfile({ projectRoot: root, userHome: home, from: 'codebase', extendsId: 'general', write: false });
      const after = localDate();
      const reviewed = sp.parseProfile(result.text).frontmatter.provenance.reviewed;
      assert.ok(reviewed === before || reviewed === after, `reviewed ${reviewed}, expected ${before} or ${after}`);
    } finally {
      fx.cleanup(root, home);
    }
  });
});
