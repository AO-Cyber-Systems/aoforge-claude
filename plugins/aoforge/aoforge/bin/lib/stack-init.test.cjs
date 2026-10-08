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
// - I15 (TRD 42-05) bundled tier + object-form detect: pure Dart -> dart, Flutter -> flutter (dart
//       dropped as its ancestor, reason `pubspec.yaml(sdk: flutter)`), go.mod -> go; initProfile
//       drafts the matching `extends`.
//
// - I17 (TRD 42-12 test 1, CLI) `stack init --raw` on a git fixture with `.gitignore: dist/` and a
//       force-tracked dist/scaffoldapp/go.mod (plus a root go.mod and a Flutter app/): components
//       hold app/ and never the ignored tree; the same with a non-fallback `bundle/` rule.
// - I18 (TRD 42-12 test 7) `stack init --write` with `.gitignore: .planning/` and a force-tracked
//       .planning/config.json: result `ignored: ['.planning/STACK.md']` plus a warning, the file is
//       still written, and the dir-level `git check-ignore -q .planning` misses it (the bug). A
//       clean fixture gives `ignored: []`; git missing from PATH gives `ignored: []`, no throw.
//       Since TRD 42-14 STACK-REPORT.md is listed too.
// - I19 (TRD 42-14 test 9, D5) `.planning/` ignored with config.json AND STACK.md force-tracked:
//       the PREVIEW (initProfile, CLI JSON, CLI --raw stderr) reports both stack files, and
//       --write agrees; a clean fixture gives `ignored: []` in both modes.
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

const TOOLS_PATH = path.join(__dirname, '..', 'aof-tools.cjs');

const verifyFx = require('./__fixtures__/stack-verify-fixtures.cjs');
const drafterFx = require('./__fixtures__/stack-drafter-fixtures.cjs');

function run(args, { cwd, home, path: pathEnv = null }) {
  const env = pathEnv ? { HOME: home, PATH: pathEnv } : { ...process.env, HOME: home };
  const r = spawnSync(process.execPath, [TOOLS_PATH, ...args], { cwd, encoding: 'utf-8', env });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('listOrgProfiles (I1)', () => {
  test('I1: null userHome -> []; a fake home with two profiles -> both ids, each with its detect list', () => {
    assert.deepStrictEqual(sp.listOrgProfiles({ userHome: null, bundledDir: null }), []);

    const other = fx.profileMd({
      yaml: ['schema: 1', 'id: other', 'extends: general', 'detect: [pubspec.yaml]'].join('\n'),
    });
    const home = fx.makeHome({ stacks: { golike: fx.orgProfileGoLike(), other } });
    try {
      const profiles = sp.listOrgProfiles({ userHome: home, bundledDir: null });
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
      const picked = sp.pickExtends({ projectRoot: root, userHome: home, explicit: null, bundledDir: null });
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
  // 42-07 rewrote this case. Under 35-04 ANY evidence for a key the parent already resolved was
  // dropped, and `make test`/`make lint` with no Makefile were proposed unverified. Now the repo's
  // own verified command outranks the tier default (TRD 42-07 truth 2) EXCEPT when it is the same
  // command, which stays inherited so the parent's scoped form survives.
  test('I6: a candidate equal to the parent run stays inherited (scoped kept); a discover key is filled from verified evidence', () => {
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
    const root = fx.makeProject({
      files: {
        Makefile: 'lint:\n\tgo vet ./...\n',
        '.github/workflows/ci.yml': [
          'jobs:',
          '  t:',
          '    steps:',
          '      - run: go test ./...',
          '      - run: make lint',
        ].join('\n'),
      },
    });
    try {
      const verify = () => ({ status: 'resolved', detail: 'stub' });
      const draft = sp.draftProfile({ projectRoot: root, userHome: home, from: 'codebase', extendsId: 'golike', verify });
      const commands = draft.frontmatter.commands;
      assert.ok(!('test' in commands), 'test equals golike\'s run; the draft must not redefine it');
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

  test('I7c (42-07): components serialize as a flow array of flow maps and round-trip exactly', () => {
    const fm = {
      schema: 1,
      id: 'myproj',
      extends: 'general',
      components: [{ path: 'svc/', profile: 'go' }, { path: 'app/', profile: 'flutter' }],
      commands: { lint_helm: { run: 'helm lint chart/' }, e2e: { run: 'discover' } },
      loop: ['lint'],
      provenance: { reviewed: '2026-01-01', sources: ['.github/workflows/ci.yml'] },
    };
    const text = sp.serializeProfile(fm, '# Stack Profile: myproj\n');
    assert.match(text, /^components: \[\{ path: "svc\/", profile: "go" \}, \{ path: "app\/", profile: "flutter" \}\]$/m);
    assert.deepStrictEqual(sp.parseProfile(text).frontmatter, fm);
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
    // 42-07: stack init verifies each command before proposing it, so the run needs a PATH with a
    // `go` on it. A stub keeps the test independent of the machine (was: the real process PATH).
    const bin = verifyFx.fakeBin(['go']);
    try {
      const initRes = run(['stack', 'init', '--from', 'codebase', '--write'], { cwd: root, home, path: bin });
      assert.equal(initRes.code, 0);
      assert.equal(fs.existsSync(path.join(root, '.planning', 'STACK.md')), true);

      const validateRes = run(['stack', 'validate'], { cwd: root, home });
      assert.equal(validateRes.code, 0);

      const cmdRes = run(['stack', 'command', 'test', '--packages', './pkg', '--raw'], { cwd: root, home });
      assert.equal(cmdRes.code, 0);
      assert.equal(cmdRes.stdout, 'go test -race ./pkg');
    } finally {
      fx.cleanup(root, home);
      verifyFx.cleanup(bin);
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

// ─── I14: bundled tier-2 profiles are detected (TRD 42-02) ─────────────────────

describe('bundled tier-2 detection (I14)', () => {
  test('I14a: a root go.mod and an empty fake home -> pickExtends picks the bundled go', () => {
    const home = fx.makeHome({});
    const root = fx.makeProject({ files: fx.goShapedRepo() });
    try {
      const picked = sp.pickExtends({ projectRoot: root, userHome: home, explicit: null });
      assert.equal(picked.id, 'go');
      const off = sp.pickExtends({ projectRoot: root, userHome: home, explicit: null, bundledDir: null });
      assert.equal(off.id, 'general');
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('I14b: initProfile on a go.mod repo with an empty fake home drafts `extends: "go"` and validates', () => {
    const home = fx.makeHome({});
    const root = fx.makeProject({ files: fx.goShapedRepo() });
    try {
      const r = sp.initProfile({ projectRoot: root, userHome: home });
      assert.equal(r.action, 'preview');
      assert.equal(r.extends, 'go');
      assert.match(r.text, /^extends: "go"$/m);
      assert.equal(r.validation.ok, true, JSON.stringify(r.validation.errors));
    } finally {
      fx.cleanup(root, home);
    }
  });
});

// ─── I15: Dart vs Flutter through the object-form detect marker (TRD 42-05) ───────
//
// dart.md detects `pubspec.yaml`; flutter.md detects `{file: pubspec.yaml, contains: "sdk: flutter"}`.
// A pure Dart package matches dart only; a Flutter app matches both, and dart (flutter's own
// ancestor) is dropped in flutter's favour.

const PURE_DART_PUBSPEC = 'name: invented_api\nenvironment:\n  sdk: ^3.5.0\n\ndependencies:\n  meta: ^1.15.0\n';
const FLUTTER_PUBSPEC = [
  'name: invented_app',
  'environment:',
  '  sdk: ^3.5.0',
  '',
  'dependencies:',
  '  flutter:',
  '    sdk: flutter',
  '',
].join('\n');

describe('Dart vs Flutter detection (I15)', () => {
  test('I15a: a pure Dart package picks dart, never flutter', () => {
    const home = fx.makeHome({});
    const root = fx.makeProject({ files: { 'pubspec.yaml': PURE_DART_PUBSPEC } });
    try {
      const picked = sp.pickExtends({ projectRoot: root, userHome: home, explicit: null });
      assert.equal(picked.id, 'dart');
      assert.equal(picked.alternatives.includes('flutter'), false);
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('I15b: a Flutter app picks flutter, with dart (its ancestor) as the alternative', () => {
    const home = fx.makeHome({});
    const root = fx.makeProject({ files: { 'pubspec.yaml': FLUTTER_PUBSPEC } });
    try {
      const picked = sp.pickExtends({ projectRoot: root, userHome: home, explicit: null });
      assert.equal(picked.id, 'flutter');
      assert.deepEqual(picked.alternatives, ['dart']);
      // The reason renders an object marker as `file(contains)`, never `[object Object]`.
      assert.equal(picked.reason, 'detected via pubspec.yaml(sdk: flutter)');
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('I15c: a go.mod repo still picks go', () => {
    const home = fx.makeHome({});
    const root = fx.makeProject({ files: fx.goShapedRepo() });
    try {
      assert.equal(sp.pickExtends({ projectRoot: root, userHome: home, explicit: null }).id, 'go');
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('I15d: initProfile drafts `extends: "dart"` for pure Dart and `extends: "flutter"` for Flutter, both valid', () => {
    const home = fx.makeHome({});
    const dartRoot = fx.makeProject({ files: { 'pubspec.yaml': PURE_DART_PUBSPEC } });
    const flutterRoot = fx.makeProject({ files: { 'pubspec.yaml': FLUTTER_PUBSPEC } });
    try {
      const d = sp.initProfile({ projectRoot: dartRoot, userHome: home });
      assert.match(d.text, /^extends: "dart"$/m);
      assert.equal(d.validation.ok, true, JSON.stringify(d.validation.errors));
      const f = sp.initProfile({ projectRoot: flutterRoot, userHome: home });
      assert.match(f.text, /^extends: "flutter"$/m);
      assert.equal(f.validation.ok, true, JSON.stringify(f.validation.errors));
    } finally {
      fx.cleanup(dartRoot, flutterRoot, home);
    }
  });
});

// ─── I16: grounded drafting (TRD 42-07) ────────────────────────────────────────
//
// draftProfile = detectAreas + collectEvidence + per-area pickExtends + assembleDraft, with the
// verifier injected through `verifyOpts` (a fake PATH/home) so nothing depends on the machine.

describe('grounded draftProfile / initProfile (I16, TRD 42-07)', () => {
  test('I16a: a multi-area repo drafts general + components by tier id and returns notes', () => {
    const root = drafterFx.multiAreaCiShape();
    const home = drafterFx.fakeEmptyHome();
    const bin = drafterFx.fakeToolchain();
    try {
      const verifyOpts = { env: { PATH: bin }, home };
      const draft = sp.draftProfile({ projectRoot: root, userHome: home, verifyOpts });
      assert.equal(draft.extends, 'general');
      assert.deepStrictEqual(draft.frontmatter.components, [
        { path: 'admin/', profile: 'flutter' },
        { path: 'app/', profile: 'flutter' },
        { path: 'svc/', profile: 'go' },
      ]);
      assert.ok(Array.isArray(draft.notes) && draft.notes.length > 0);
      assert.match(draft.body, /<!-- stack init notes \(see \.planning\/STACK-REPORT\.md\):/);
      assert.ok(draft.frontmatter.provenance.sources.includes('.github/workflows/ci.yml'));
      assert.ok(draft.frontmatter.provenance.sources.every((s) => !['ci', 'runner', 'manifest'].includes(s)), 'sources are files');
    } finally {
      drafterFx.cleanup(root, home, bin);
    }
  });

  test('I16b: initProfile threads verifyOpts/now, returns notes, and never writes .planning/stacks/', () => {
    const root = drafterFx.missingBinaryShape();
    const home = drafterFx.fakeEmptyHome();
    const bin = drafterFx.fakeToolchain();
    try {
      const r = sp.initProfile({
        projectRoot: root, userHome: home, write: true, now: new Date(2026, 8, 28, 23, 30), verifyOpts: { env: { PATH: bin }, home },
      });
      assert.equal(r.action, 'written', JSON.stringify(r.validation));
      assert.equal(r.extends, 'go');
      const fm = sp.parseProfile(r.text).frontmatter;
      assert.deepStrictEqual(fm.commands.test, { run: 'discover' });
      assert.equal(fm.provenance.reviewed, '2026-09-28');
      assert.ok(r.notes.some((n) => n.key === 'test' && n.status === 'binary_missing' && n.candidate === 'ginkgo -r -p'));
      assert.equal(fs.existsSync(path.join(root, '.planning', 'stacks')), false);
    } finally {
      drafterFx.cleanup(root, home, bin);
    }
  });

  test('I16c: the notes comment is capped at 40 lines with a (+N more) trailer and the body stays under 150 lines', () => {
    const notes = Array.from({ length: 55 }, (_, i) => ({ area: '', key: 'test', candidate: `tool${i} run`, status: 'binary_missing', detail: 'x', source: 'ci' }));
    const body = sp.renderDraftBody('proj', 'general', notes);
    const noteLines = body.split('\n').filter((l) => l.startsWith('- '));
    assert.equal(noteLines.length, 40);
    assert.match(body, /\(\+15 more in STACK-REPORT\.md\)/);
    assert.ok(body.split('\n').length < 150);
  });
});

// ─── I17/I18: ignore-aware drafting and the STACK.md gitignore preflight (TRD 42-12) ──

const detectFx = require('./__fixtures__/stack-detect-fixtures.cjs');
const { isGitIgnored } = require('./helpers.cjs');

const NO_GIT = detectFx.hasGit() ? false : 'git is not on PATH';
const STACK_IGNORED_WARNING = '.planning/STACK.md is gitignored; aof-tools commit will skip it';
// TRD 42-14 (D5): both stack files are checked, file by file, with `--no-index`.
const REPORT_IGNORED_WARNING = '.planning/STACK-REPORT.md is gitignored; aof-tools commit will skip it';
const BOTH_STACK_FILES = ['.planning/STACK.md', '.planning/STACK-REPORT.md'];
const stubVerify = () => ({ status: 'resolved', detail: 'stub', tool: null });

/** A git repo with a root go.mod; `.gitignore` = `ignore` and `track` force-added. */
function gitGoRepo({ ignore = '*.log\n', files = {}, track = [] } = {}) {
  return detectFx.makeGitTree({
    '.gitignore': ignore,
    'go.mod': detectFx.goMod('ledger'),
    'main.go': 'package main\n\nfunc main() {}\n',
    ...files,
  }, { track });
}

describe('stack init CLI skips gitignored areas (I17, TRD 42-12 test 1)', () => {
  for (const shape of [
    { name: 'dist/ + dist/scaffoldapp/', opts: {}, bad: 'dist/' },
    { name: 'bundle/ + bundle/svcapp/ (git only)', opts: { ruleSpelling: 'bundle/', child: 'svcapp' }, bad: 'bundle/' },
  ]) {
    test(`I17: ${shape.name} -> components hold app/ and never the ignored tree`, { skip: NO_GIT }, () => {
      const root = detectFx.gitIgnoredScaffoldShape(shape.opts);
      const home = drafterFx.fakeEmptyHome();
      try {
        const r = run(['stack', 'init', '--raw'], { cwd: root, home });
        assert.equal(r.code, 0, r.stderr);
        const fm = sp.parseProfile(r.stdout).frontmatter;
        const paths = (fm.components || []).map((c) => c.path);
        assert.ok(paths.includes('app/'), JSON.stringify(fm.components));
        assert.equal(paths.some((p) => p.startsWith(shape.bad)), false, JSON.stringify(fm.components));
        assert.equal(r.stdout.includes(shape.bad), false, 'the ignored tree is not even noted');
        assert.equal(fs.existsSync(path.join(root, '.planning', 'STACK.md')), false, 'no --write, no file');
      } finally {
        detectFx.cleanup(root);
        drafterFx.cleanup(home);
      }
    });
  }
});

describe('stack init --write gitignore preflight (I18, TRD 42-12 test 7)', () => {
  test('I18a: `.planning/` ignored with a tracked config.json -> ignored [STACK.md] + warning; written anyway; the dir check misses it', { skip: NO_GIT }, () => {
    const root = gitGoRepo({ ignore: '.planning/\n', files: { '.planning/config.json': '{}\n' }, track: ['.planning/config.json'] });
    const home = drafterFx.fakeEmptyHome();
    try {
      // The bug this preflight fixes: a tracked file under the dir masks the dir-level check.
      assert.equal(spawnSync('git', ['-C', root, 'check-ignore', '-q', '.planning']).status, 1);
      assert.equal(isGitIgnored(root, '.planning'), false);

      const r = sp.initProfile({ projectRoot: root, userHome: home, write: true, verify: stubVerify });
      assert.equal(r.action, 'written', JSON.stringify(r.validation));
      // Since TRD 42-14 STACK-REPORT.md is checked too (same `.planning/` rule).
      assert.deepStrictEqual(r.ignored, BOTH_STACK_FILES);
      assert.deepStrictEqual(r.warnings, [STACK_IGNORED_WARNING, REPORT_IGNORED_WARNING]);
      assert.equal(fs.existsSync(path.join(root, '.planning', 'STACK.md')), true, 'non-fatal: still written');
    } finally {
      detectFx.cleanup(root);
      drafterFx.cleanup(home);
    }
  });

  test('I18b: a clean git fixture -> ignored [] and no warning', { skip: NO_GIT }, () => {
    const root = gitGoRepo();
    const home = drafterFx.fakeEmptyHome();
    try {
      const r = sp.initProfile({ projectRoot: root, userHome: home, write: true, verify: stubVerify });
      assert.equal(r.action, 'written', JSON.stringify(r.validation));
      assert.deepStrictEqual(r.ignored, []);
      assert.deepStrictEqual(r.warnings, []);
    } finally {
      detectFx.cleanup(root);
      drafterFx.cleanup(home);
    }
  });

  test('I18c: git missing from PATH -> ignored [] and no throw', { skip: NO_GIT }, () => {
    const root = gitGoRepo({ ignore: '.planning/\n', files: { '.planning/config.json': '{}\n' }, track: ['.planning/config.json'] });
    const home = drafterFx.fakeEmptyHome();
    const saved = process.env.PATH;
    try {
      process.env.PATH = '';
      let r;
      try {
        r = sp.initProfile({ projectRoot: root, userHome: home, write: true, verify: stubVerify });
      } finally {
        process.env.PATH = saved;
      }
      assert.equal(r.action, 'written', JSON.stringify(r.validation));
      assert.deepStrictEqual(r.ignored, []);
    } finally {
      process.env.PATH = saved;
      detectFx.cleanup(root);
      drafterFx.cleanup(home);
    }
  });

  test('I18d: CLI `stack init --write` reports ignored + the warning in its JSON and on stderr', { skip: NO_GIT }, () => {
    const root = gitGoRepo({ ignore: '.planning/\n', files: { '.planning/config.json': '{}\n' }, track: ['.planning/config.json'] });
    const home = drafterFx.fakeEmptyHome();
    try {
      const r = run(['stack', 'init', '--write'], { cwd: root, home });
      assert.equal(r.code, 0, r.stderr);
      const json = JSON.parse(r.stdout);
      assert.equal(json.action, 'written');
      assert.deepStrictEqual(json.ignored, BOTH_STACK_FILES);
      assert.deepStrictEqual(json.warnings, [STACK_IGNORED_WARNING, REPORT_IGNORED_WARNING]);
      assert.ok(r.stderr.includes(STACK_IGNORED_WARNING), r.stderr);
      assert.ok(r.stderr.includes(REPORT_IGNORED_WARNING), r.stderr);
    } finally {
      detectFx.cleanup(root);
      drafterFx.cleanup(home);
    }
  });
});

// ─── I19 (TRD 42-14 test 9, D5): the file-level `--no-index` check in PREVIEW and write ──

describe('stack init ignored stack files, preview and write (I19, TRD 42-14 test 9)', () => {
  // `.planning/` ignored, with config.json AND STACK.md force-tracked: an index-aware check calls
  // the tracked STACK.md "not ignored", and before 42-14 the preview never checked at all.
  const trackedPlanningRepo = () => gitGoRepo({
    ignore: '.planning/\n',
    files: {
      '.planning/config.json': '{}\n',
      '.planning/STACK.md': fx.profileMd({ yaml: ['schema: 1', 'extends: general'].join('\n') }),
    },
    track: ['.planning/config.json', '.planning/STACK.md'],
  });

  test('I19a: initProfile PREVIEW reports both stack files (today\'s [] is the bug); --write --force agrees', { skip: NO_GIT }, () => {
    const root = trackedPlanningRepo();
    const home = drafterFx.fakeEmptyHome();
    try {
      const preview = sp.initProfile({ projectRoot: root, userHome: home, write: false, verify: stubVerify });
      assert.equal(preview.action, 'preview');
      assert.deepStrictEqual(preview.ignored, BOTH_STACK_FILES);
      assert.deepStrictEqual(preview.warnings, [STACK_IGNORED_WARNING, REPORT_IGNORED_WARNING]);
      const written = sp.initProfile({ projectRoot: root, userHome: home, write: true, force: true, verify: stubVerify });
      assert.equal(written.action, 'written', JSON.stringify(written.validation));
      assert.deepStrictEqual(written.ignored, preview.ignored);
    } finally {
      detectFx.cleanup(root);
      drafterFx.cleanup(home);
    }
  });

  test('I19b: CLI `stack init` (JSON) and `stack init --raw` preview report both files; nothing is written', { skip: NO_GIT }, () => {
    const root = trackedPlanningRepo();
    const home = drafterFx.fakeEmptyHome();
    try {
      const before = fs.readFileSync(path.join(root, '.planning', 'STACK.md'), 'utf-8');
      const r = run(['stack', 'init'], { cwd: root, home });
      assert.equal(r.code, 0, r.stderr);
      const json = JSON.parse(r.stdout);
      assert.equal(json.action, 'preview');
      assert.deepStrictEqual(json.ignored, BOTH_STACK_FILES);
      const raw = run(['stack', 'init', '--raw'], { cwd: root, home });
      assert.equal(raw.code, 0, raw.stderr);
      assert.ok(raw.stderr.includes(STACK_IGNORED_WARNING), raw.stderr);
      assert.ok(raw.stderr.includes(REPORT_IGNORED_WARNING), raw.stderr);
      assert.equal(fs.readFileSync(path.join(root, '.planning', 'STACK.md'), 'utf-8'), before, 'a preview never writes');
    } finally {
      detectFx.cleanup(root);
      drafterFx.cleanup(home);
    }
  });

  test('I19c: a clean git fixture gives ignored [] in preview and write', { skip: NO_GIT }, () => {
    const root = gitGoRepo();
    const home = drafterFx.fakeEmptyHome();
    try {
      assert.deepStrictEqual(sp.initProfile({ projectRoot: root, userHome: home, write: false, verify: stubVerify }).ignored, []);
      assert.deepStrictEqual(sp.initProfile({ projectRoot: root, userHome: home, write: true, verify: stubVerify }).ignored, []);
    } finally {
      detectFx.cleanup(root);
      drafterFx.cleanup(home);
    }
  });
});
